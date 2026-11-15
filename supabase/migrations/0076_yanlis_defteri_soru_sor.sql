-- Öğrenci tarafı: Yanlış defteri ve "Çözemedim" (soru sor).
-- 1) Yanlış defteri (konu_calisma): öğrenci, denemelerde tekrar eden hatalı konularını "çalıştım" diye işaretler. Yalnız işaret
--    ve zamanı tutulur; konuların kendisi deneme verisinden istemcide hesaplanır. Öğrenci yazar; veli ve öğretmeni görür.
-- 2) Çözemedim (soru_talep): öğrenci ya da velisi çözemediği sorunun fotoğrafını ders seçerek gönderir; o öğrenciyi görebilen
--    öğretmenler görür ve yanıtlar. Fotoğraf özel "soru" deposunda durur; yalnız talebi görebilen indirebilir.
--    Yapay zekâya hiçbir şey gitmez. Talepler 60 gün sonra silinir. Ayar: aile.soru_sor (varsayılan açık).
-- Geri alma: supabase/geri-alma/0076_yanlis_defteri_soru_sor_geri_al.sql

alter function setting_spec() rename to setting_spec_before_0076;
create function setting_spec() returns jsonb language sql immutable as $$
  select setting_spec_before_0076() || '{
    "aile.soru_sor":{"type":"bool","default":true},
    "aile.yanlis_defteri":{"type":"bool","default":true}
  }'::jsonb
$$;
select ayar_varsayilan_yenile();

-- ---------- 1) Yanlış defteri ----------
create table konu_calisma (
  student_id uuid not null references students(id) on delete cascade,
  konu text not null check (char_length(konu) between 1 and 80),
  calisti_at timestamptz not null default now(),
  primary key (student_id, konu)
);
create function konu_calisma_damga() returns trigger language plpgsql as $$
begin new.calisti_at := now(); return new; end $$;
create trigger konu_calisma_damga before insert or update on konu_calisma for each row execute function konu_calisma_damga();
alter table konu_calisma enable row level security;
create policy konu_calisma_oku on konu_calisma for select to authenticated
  using (is_teacher() or is_student_self(student_id) or is_parent_of(student_id));
create policy konu_calisma_yaz on konu_calisma for insert to authenticated with check (is_student_self(student_id));
create policy konu_calisma_guncelle on konu_calisma for update to authenticated using (is_student_self(student_id)) with check (is_student_self(student_id));
create policy konu_calisma_sil on konu_calisma for delete to authenticated using (is_student_self(student_id));
create policy security_school on konu_calisma as restrictive for all to authenticated
  using (can_see_student(student_id)) with check (can_see_student(student_id));
create policy aile_ayar on konu_calisma as restrictive for all to authenticated using (is_teacher() or ayar_bool('aile.yanlis_defteri'));
revoke all on konu_calisma from anon, authenticated;
grant select, insert, update, delete on konu_calisma to authenticated;

-- ---------- 2) Çözemedim ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('soru', 'soru', false, 6291456, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create table soru_talep (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  student_id uuid not null references students(id) on delete cascade,
  ders text not null check (char_length(btrim(ders)) between 2 and 60),
  aciklama text check (aciklama is null or char_length(aciklama) <= 300),
  -- "soru" deposundaki yol: okul/öğrenci/uuid.uzantı
  foto text not null unique check (foto ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp)$'),
  durum text not null default 'yeni' check (durum in ('yeni', 'goruldu', 'cozuldu')),
  yanit text check (yanit is null or char_length(yanit) <= 500),
  yanitlayan uuid references profiles(id) on delete set null,
  yanit_at timestamptz,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index soru_talep_ogrenci on soru_talep (student_id, created_at desc);
create index soru_talep_okul on soru_talep (school_id, durum, created_at desc);

create function soru_talep_damga() returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.school_id := my_school(); new.created_by := auth.uid(); new.created_at := now();
  new.durum := 'yeni'; new.yanit := null; new.yanitlayan := null; new.yanit_at := null;
  new.ders := btrim(new.ders); new.aciklama := nullif(btrim(coalesce(new.aciklama, '')), '');
  if not coalesce(ayar_bool('aile.soru_sor'), true) then raise exception 'Soru gönderme okulda kapalı.' using errcode = '42501'; end if;
  if new.foto not like new.school_id::text || '/' || new.student_id::text || '/%' then raise exception 'Fotoğraf yolu geçersiz.'; end if;
  if (select count(*) from soru_talep t where t.student_id = new.student_id and t.created_at > now() - interval '1 day') >= 5 then
    raise exception 'Bir günde en çok 5 soru gönderebilirsin.';
  end if;
  return new;
end $$;
create trigger soru_talep_damga before insert on soru_talep for each row execute function soru_talep_damga();
revoke all on function soru_talep_damga() from public, anon, authenticated;

-- Öğrencinin sınıfına giren ve branşı derse uyan öğretmenlere bildirim (uyan yoksa sınıfın bütün öğretmenlerine)
create function soru_talep_bildir() returns trigger language plpgsql security definer set search_path = public as $$
declare ad text; sinif uuid;
begin
  select s.full_name, s.class_id into ad, sinif from students s where s.id = new.student_id;
  with ogr as (
    select p.id, (p.branch is not null and (new.ders ilike '%' || split_part(p.branch, ' ', 1) || '%' or p.branch ilike '%' || split_part(new.ders, ' ', 1) || '%')) as uyar
    from profiles p
    where p.school_id = new.school_id and p.status = 'approved' and has_role(p.id, 'ogretmen') and sinif = any(array(select teacher_classes(p.id)))
  )
  insert into notifications (user_id, text, link, type)
  select o.id, coalesce(ad, 'Bir öğrenci') || ' çözemediği bir ' || new.ders || ' sorusu gönderdi.',
         jsonb_build_object('page', 'ogretmenler-odasi'), 'soru'
  from ogr o where o.uyar or not exists (select 1 from ogr x where x.uyar);
  return null;
end $$;
create trigger soru_talep_bildir after insert on soru_talep for each row execute function soru_talep_bildir();
revoke all on function soru_talep_bildir() from public, anon, authenticated;

alter table soru_talep enable row level security;
create policy soru_talep_oku on soru_talep for select to authenticated
  using (school_id = my_school() and (is_teacher() or is_student_self(student_id) or is_parent_of(student_id)));
create policy soru_talep_yaz on soru_talep for insert to authenticated
  with check (is_student_self(student_id) or is_parent_of(student_id));
-- Gönderen, yanıtlanmamış talebini geri çekebilir; rehber/yönetici her zaman silebilir
create policy soru_talep_sil on soru_talep for delete to authenticated
  using (school_id = my_school() and ((created_by = auth.uid() and durum = 'yeni') or is_staff()));
create policy security_school on soru_talep as restrictive for all to authenticated
  using (can_see_student(student_id)) with check (can_see_student(student_id));
revoke all on soru_talep from anon, authenticated;
grant select, insert, delete on soru_talep to authenticated;

-- Öğretmen görür/yanıtlar: yalnız görebildiği öğrencinin talebi
create function soru_talep_yanitla(p_id uuid, p_durum text, p_yanit text default null) returns void
language plpgsql volatile security definer set search_path = public as $$
declare t soru_talep; ad text;
begin
  if not is_teacher() then raise exception 'Yalnız öğretmenler' using errcode = '42501'; end if;
  if p_durum not in ('goruldu', 'cozuldu') then raise exception 'Geçersiz durum'; end if;
  if p_yanit is not null and char_length(p_yanit) > 500 then raise exception 'Yanıt en çok 500 karakter olabilir.'; end if;
  select * into t from soru_talep where id = p_id and school_id = my_school() for update;
  if t.id is null or not can_see_student(t.student_id) then raise exception 'Soru bulunamadı.'; end if;
  update soru_talep set durum = p_durum, yanit = coalesce(nullif(btrim(coalesce(p_yanit, '')), ''), yanit),
         yanitlayan = auth.uid(), yanit_at = now() where id = p_id;
  if p_durum = 'cozuldu' or nullif(btrim(coalesce(p_yanit, '')), '') is not null then
    select full_name into ad from profiles where id = auth.uid();
    insert into notifications (user_id, text, link, type)
    select t.created_by, coalesce(ad, 'Öğretmenin') || ', gönderdiğin ' || t.ders || ' sorusuna yanıt verdi.', jsonb_build_object('page', 'ozet'), 'soru'
    where t.created_by is not null and t.created_by <> auth.uid();
  end if;
end $$;
revoke all on function soru_talep_yanitla(uuid, text, text) from public, anon;
grant execute on function soru_talep_yanitla(uuid, text, text) to authenticated;

-- Depo: yükleme yalnız kendi (ya da velisi olduğu) öğrencinin klasörüne; okuma talebi görebilene; silme gönderene ve yönetime
create policy soru_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'soru' and (storage.foldername(name))[1] = public.my_school()::text
  and (storage.foldername(name))[2] ~ '^[0-9a-f-]{36}$'
  and (public.is_student_self(((storage.foldername(name))[2])::uuid) or public.is_parent_of(((storage.foldername(name))[2])::uuid)));
create policy soru_read on storage.objects for select to authenticated using (
  bucket_id = 'soru' and exists (select 1 from public.soru_talep t where t.foto = name));
create policy soru_delete on storage.objects for delete to authenticated using (
  bucket_id = 'soru' and (
    exists (select 1 from public.soru_talep t where t.foto = name and (t.created_by = auth.uid() or public.is_staff()))
    -- talep kaydı oluşmadan yarım kalan yükleme: yükleyen kendi klasöründen silebilir
    or ((storage.foldername(name))[2] ~ '^[0-9a-f-]{36}$'
        and (public.is_student_self(((storage.foldername(name))[2])::uuid) or public.is_parent_of(((storage.foldername(name))[2])::uuid)))));

-- 60 günü geçen talepler silinir (fotoğraf dosyası istemcide/yönetimce silinmemişse depoda kalır; kayıt olmadan kimse okuyamaz)
create function soru_talep_temizlik() returns void language sql security definer set search_path = public as $$
  delete from soru_talep where created_at < now() - interval '60 days';
$$;
revoke all on function soru_talep_temizlik() from public, anon, authenticated;
select cron.schedule('soru-talep-temizlik', '35 3 * * *', $$select public.soru_talep_temizlik()$$);
