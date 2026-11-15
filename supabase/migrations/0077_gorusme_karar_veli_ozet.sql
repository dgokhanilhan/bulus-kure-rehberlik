-- Görüşme hazırlığı ve veli haftalık özeti.
-- 1) Görüşme kararları (gorusme_karar): rehber/yönetici bir görüşmede alınan kararları yazar; karar göreve çevrilebilir
--    (task_id), bir sonraki görüşmede "yapıldı mı?" diye işaretlenir. Yalnız rehberlik servisi ve yönetim görür/yazar
--    (görüşmeler gibi); veli ve öğrenci görmez.
-- 2) Veli haftalık özeti (veli_ozet): rehber/yönetici o haftanın tek sayfalık özetini önizler, isterse kısa not ekler ve
--    onaylayıp veliye gönderir. Gönderilen içerik anlık kopyadır (veli tam olarak onaylananı görür). Veli açınca "okundu"
--    zamanı yazılır ve gönderen görür. Haftada öğrenci başına bir özet; yeniden gönderilirse güncellenir.
--    Yapay zekâ kullanılmaz. Ayar: aile.haftalik_ozet (varsayılan açık).
-- Geri alma: supabase/geri-alma/0077_gorusme_karar_veli_ozet_geri_al.sql

alter function setting_spec() rename to setting_spec_before_0077;
create function setting_spec() returns jsonb language sql immutable as $$
  select setting_spec_before_0077() || '{
    "aile.haftalik_ozet":{"type":"bool","default":true}
  }'::jsonb
$$;
select ayar_varsayilan_yenile();

-- ---------- 1) Görüşme kararları ----------
create table gorusme_karar (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  student_id uuid not null references students(id) on delete cascade,
  meeting_id uuid references meetings(id) on delete set null,
  metin text not null check (char_length(btrim(metin)) between 2 and 300),
  durum text not null default 'acik' check (durum in ('acik', 'yapildi', 'yapilmadi')),
  task_id uuid references tasks(id) on delete set null,
  kontrol_at timestamptz,
  kontrol_eden uuid references profiles(id) on delete set null,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index gorusme_karar_ogrenci on gorusme_karar (student_id, created_at desc);

create function gorusme_karar_damga() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.school_id := coalesce(my_school(), new.school_id); new.created_by := auth.uid(); new.created_at := now();
    new.durum := 'acik'; new.kontrol_at := null; new.kontrol_eden := null;
  else
    new.school_id := old.school_id; new.student_id := old.student_id; new.created_by := old.created_by; new.created_at := old.created_at;
    if new.durum is distinct from old.durum then
      new.kontrol_at := case when new.durum = 'acik' then null else now() end;
      new.kontrol_eden := case when new.durum = 'acik' then null else auth.uid() end;
    else
      new.kontrol_at := old.kontrol_at; new.kontrol_eden := old.kontrol_eden;
    end if;
  end if;
  new.metin := btrim(new.metin);
  if new.meeting_id is not null and not exists (select 1 from meetings m where m.id = new.meeting_id and m.student_id = new.student_id) then
    raise exception 'Görüşme bu öğrenciye ait değil.';
  end if;
  if new.task_id is not null and (tg_op = 'INSERT' or new.task_id is distinct from old.task_id)
     and not exists (select 1 from tasks t where t.id = new.task_id and t.student_id = new.student_id) then
    raise exception 'Görev bu öğrenciye ait değil.';
  end if;
  return new;
end $$;
create trigger gorusme_karar_damga before insert or update on gorusme_karar for each row execute function gorusme_karar_damga();
revoke all on function gorusme_karar_damga() from public, anon, authenticated;

alter table gorusme_karar enable row level security;
create policy gorusme_karar_rehber on gorusme_karar for all to authenticated using (is_staff()) with check (is_staff());
create policy security_school on gorusme_karar as restrictive for all to authenticated
  using (school_id = my_school() and can_see_student(student_id)) with check (school_id = my_school() and can_see_student(student_id));
revoke all on gorusme_karar from anon, authenticated;
grant select, insert, update, delete on gorusme_karar to authenticated;

-- ---------- 2) Veli haftalık özeti ----------
create table veli_ozet (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  student_id uuid not null references students(id) on delete cascade,
  hafta date not null check (extract(isodow from hafta) = 1),       -- haftanın pazartesisi
  icerik jsonb not null check (jsonb_typeof(icerik) = 'object' and pg_column_size(icerik) <= 16384),
  notu text check (notu is null or char_length(notu) <= 600),
  gonderen uuid references profiles(id) on delete set null,
  gonderildi_at timestamptz not null default now(),
  okundu_at timestamptz,
  unique (student_id, hafta)
);
create index veli_ozet_okul on veli_ozet (school_id, hafta desc);

alter table veli_ozet enable row level security;
create policy veli_ozet_oku on veli_ozet for select to authenticated
  using (is_staff() or (is_parent_of(student_id) and coalesce(ayar_bool('aile.haftalik_ozet'), true)));
create policy veli_ozet_sil on veli_ozet for delete to authenticated using (is_staff());
create policy security_school on veli_ozet as restrictive for all to authenticated
  using (school_id = my_school() and can_see_student(student_id));
revoke all on veli_ozet from anon, authenticated;
grant select, delete on veli_ozet to authenticated;

-- Onayla ve gönder: bu haftanın özeti yazılır (varsa güncellenir, okundu bilgisi sıfırlanır) ve onaylı velilere bildirim gider
create function veli_ozet_gonder(p_student uuid, p_icerik jsonb, p_not text default null) returns uuid
language plpgsql volatile security definer set search_path = public as $$
declare h date := date_trunc('week', (now() at time zone 'Europe/Istanbul'))::date; v_id uuid; ad text; yeni boolean;
begin
  if not is_staff() then raise exception 'Yalnız rehberlik servisi ve yönetim' using errcode = '42501'; end if;
  if not coalesce(ayar_bool('aile.haftalik_ozet'), true) then raise exception 'Haftalık özet okulda kapalı.' using errcode = '42501'; end if;
  if p_icerik is null or jsonb_typeof(p_icerik) <> 'object' or pg_column_size(p_icerik) > 16384 then raise exception 'Özet içeriği geçersiz.'; end if;
  if p_not is not null and char_length(p_not) > 600 then raise exception 'Not en çok 600 karakter olabilir.'; end if;
  select full_name into ad from students where id = p_student and school_id = my_school();
  if ad is null or not can_see_student(p_student) then raise exception 'Öğrenci bulunamadı.'; end if;
  yeni := not exists (select 1 from veli_ozet where student_id = p_student and hafta = h);
  insert into veli_ozet (school_id, student_id, hafta, icerik, notu, gonderen)
  values (my_school(), p_student, h, p_icerik, nullif(btrim(coalesce(p_not, '')), ''), auth.uid())
  on conflict (student_id, hafta) do update
    set icerik = excluded.icerik, notu = excluded.notu, gonderen = excluded.gonderen, gonderildi_at = now(), okundu_at = null
  returning id into v_id;
  insert into notifications (user_id, text, link, type)
  select pl.parent_id, case when yeni then 'Haftalık özet hazır: ' else 'Haftalık özet güncellendi: ' end || ad,
         jsonb_build_object('page', 'ozet'), 'rapor'
  from parent_links pl join profiles p on p.id = pl.parent_id
  where pl.student_id = p_student and p.status = 'approved' and p.school_id = my_school();
  return v_id;
end $$;
revoke all on function veli_ozet_gonder(uuid, jsonb, text) from public, anon;
grant execute on function veli_ozet_gonder(uuid, jsonb, text) to authenticated;

-- Veli açınca okundu (yalnız velinin kendisi; ilk açılış zamanı kalır)
create function veli_ozet_okundu(p_id uuid) returns void
language plpgsql volatile security definer set search_path = public as $$
begin
  update veli_ozet set okundu_at = now()
  where id = p_id and okundu_at is null and school_id = my_school() and is_parent_of(student_id);
end $$;
revoke all on function veli_ozet_okundu(uuid) from public, anon;
grant execute on function veli_ozet_okundu(uuid) to authenticated;

-- Bir yıldan eski özetler silinir
create function veli_ozet_temizlik() returns void language sql security definer set search_path = public as $$
  delete from veli_ozet where hafta < (now() - interval '1 year')::date;
$$;
revoke all on function veli_ozet_temizlik() from public, anon, authenticated;
select cron.schedule('veli-ozet-temizlik', '40 3 * * 1', $$select public.veli_ozet_temizlik()$$);
