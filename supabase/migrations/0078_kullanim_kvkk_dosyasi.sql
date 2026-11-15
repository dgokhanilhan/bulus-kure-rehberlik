-- Kullanım panosu ve öğrenci KVKK dosyası.
-- 1) Kullanım panosu (kullanim_ozeti): yalnız yönetici. Role göre giriş durumu (son 7/30 gün, hiç girmedi), uzun süredir
--    girmeyen ya da hiç girmeyen hesaplar ve modüllerin son 30 gün / önceki 30 gün kullanım sayıları. Yalnız sayılar ve
--    hesap adları; öğrenci verisi içermez.
-- 2) Erişim kaydı: öğrenci sayfası açıldığında öğretmenin görüntülemesi işlem kaydına yazılır (kişi/öğrenci/gün başına bir
--    kez). Rehberlik notu ve rapor görüntülemeleri zaten yazılıyordu (0006).
-- 3) KVKK başvuruları (kvkk_talep): veli çocuğu için (ya da herkes kendisi için) silme, bilgi ya da düzeltme başvurusu
--    yapar; yöneticilere bildirim gider; yönetici yanıtlar (yasal süre 30 gün). Silmenin kendisi otomatik yapılmaz —
--    yönetici mevcut öğrenci silme/arşiv akışıyla yapar ve başvuruyu "tamamlandı" işaretler.
-- 4) Öğrenci KVKK dosyası (kvkk_ogrenci_dosyasi): yalnız yönetici. Bağlı velilerin ve öğrencinin aydınlatma/açık rıza
--    durumu, son 180 günde öğrencinin verisini kimin görüntülediği, başvurular.
-- Geri alma: supabase/geri-alma/0078_kullanim_kvkk_dosyasi_geri_al.sql

-- ---------- 1) Kullanım panosu ----------
create function kullanim_ozeti() returns jsonb
language plpgsql stable security definer set search_path = public, auth as $$
declare sid uuid := my_school(); s30 timestamptz := now() - interval '30 days'; s60 timestamptz := now() - interval '60 days'; r jsonb;
begin
  if not is_admin() then raise exception 'Yalnız yönetici' using errcode = '42501'; end if;
  with k as (
    select p.id, p.full_name, p.role::text as rol, p.branch, u.last_sign_in_at as son
    from profiles p join auth.users u on u.id = p.id
    where p.school_id = sid and p.status = 'approved'
  ),
  m(anahtar, son30, onceki30) as (
    select 'gorev', count(*) filter (where t.created_at >= s30), count(*) filter (where t.created_at >= s60 and t.created_at < s30)
      from tasks t join students s on s.id = t.student_id where s.school_id = sid and t.created_at >= s60
    union all select 'gorusme', count(*) filter (where g.created_at >= s30), count(*) filter (where g.created_at >= s60 and g.created_at < s30)
      from meetings g join students s on s.id = g.student_id where s.school_id = sid and g.created_at >= s60
    union all select 'rapor', count(*) filter (where x.sent_at >= s30), count(*) filter (where x.sent_at >= s60 and x.sent_at < s30)
      from reports x join students s on s.id = x.student_id where s.school_id = sid and x.sent_at >= s60
    union all select 'not', count(*) filter (where n.created_at >= s30), count(*) filter (where n.created_at >= s60 and n.created_at < s30)
      from notes n join students s on s.id = n.student_id where s.school_id = sid and n.created_at >= s60
    union all select 'odev', count(*) filter (where h.created_at >= s30), count(*) filter (where h.created_at >= s60 and h.created_at < s30)
      from homework h where h.school_id = sid and h.created_at >= s60
    union all select 'duyuru', count(*) filter (where a.created_at >= s30), count(*) filter (where a.created_at >= s60 and a.created_at < s30)
      from announcements a where a.school_id = sid and a.created_at >= s60
    union all select 'mesaj', count(*) filter (where ms.created_at >= s30), count(*) filter (where ms.created_at >= s60 and ms.created_at < s30)
      from messages ms join conversations c on c.id = ms.conversation_id where c.school_id = sid and ms.created_at >= s60
    union all select 'yoklama', count(*) filter (where y.created_at >= s30), count(*) filter (where y.created_at >= s60 and y.created_at < s30)
      from attendance y where y.school_id = sid and y.created_at >= s60
    union all select 'gunluk_kontrol', count(*) filter (where gk.created_at >= s30), count(*) filter (where gk.created_at >= s60 and gk.created_at < s30)
      from gunluk_kontrol gk where gk.school_id = sid and gk.created_at >= s60
    union all select 'deneme', count(*) filter (where e.published_at >= s30), count(*) filter (where e.published_at >= s60 and e.published_at < s30)
      from exams e where e.school_id = sid and e.published_at >= s60
    union all select 'etut', count(*) filter (where eg.created_at >= s30), count(*) filter (where eg.created_at >= s60 and eg.created_at < s30)
      from etut_gunler eg where eg.school_id = sid and eg.created_at >= s60
    union all select 'oda', count(*) filter (where om.created_at >= s30), count(*) filter (where om.created_at >= s60 and om.created_at < s30)
      from oda_mesaj om where om.school_id = sid and om.created_at >= s60
    union all select 'soru', count(*) filter (where st.created_at >= s30), count(*) filter (where st.created_at >= s60 and st.created_at < s30)
      from soru_talep st where st.school_id = sid and st.created_at >= s60
    union all select 'veli_ozet', count(*) filter (where vo.gonderildi_at >= s30), count(*) filter (where vo.gonderildi_at >= s60 and vo.gonderildi_at < s30)
      from veli_ozet vo where vo.school_id = sid and vo.gonderildi_at >= s60
  )
  select jsonb_build_object(
    'roller', coalesce((select jsonb_agg(jsonb_build_object('rol', rol, 'toplam', toplam, 'son7', son7, 'son30', son30, 'hic', hic) order by rol)
      from (select case when rol = 'ogretmen' and branch = 'Rehberlik' then 'rehber' else rol end as rol, count(*) as toplam,
                   count(*) filter (where son >= now() - interval '7 days') as son7, count(*) filter (where son >= s30) as son30,
                   count(*) filter (where son is null) as hic
            from k group by 1) x), '[]'::jsonb),
    'pasif', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'ad', full_name, 'rol', case when rol = 'ogretmen' and branch = 'Rehberlik' then 'rehber' else rol end,
                                                    'brans', branch, 'son', son) order by son nulls first, full_name)
      from (select * from k where son is null or son < s30 order by son nulls first, full_name limit 400) y), '[]'::jsonb),
    'moduller', coalesce((select jsonb_agg(jsonb_build_object('anahtar', anahtar, 'son30', son30, 'onceki30', onceki30)) from m), '[]'::jsonb)
  ) into r;
  return r;
end $$;
revoke all on function kullanim_ozeti() from public, anon;
grant execute on function kullanim_ozeti() to authenticated;

-- ---------- 2) Erişim kaydı ----------
create index if not exists audit_log_goruntuleme on audit_log (entity_id, created_at desc) where action = 'view';

create or replace function log_view(p_entity text, p_student uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_entity not in ('rehber_notlari', 'rapor', 'ogrenci') then raise exception 'Geçersiz kayıt türü' using errcode = '22023'; end if;
  if p_entity = 'ogrenci' then
    -- Öğrenci sayfası: o öğrenciyi görebilen her öğretmen; kişi/öğrenci/gün başına bir kayıt
    if not (is_teacher() and can_see_student(p_student)) then return; end if;
    if exists (select 1 from audit_log a where a.entity_id = p_student and a.action = 'view' and a.entity = 'ogrenci' and a.user_id = auth.uid()
               and a.created_at >= date_trunc('day', now() at time zone 'Europe/Istanbul') at time zone 'Europe/Istanbul') then
      return;
    end if;
  elsif not (is_staff() and can_see_student(p_student)) then
    return;
  end if;
  insert into audit_log (user_id, action, entity, entity_id) values (auth.uid(), 'view', p_entity, p_student);
end $$;

-- ---------- 3) KVKK başvuruları ----------
create table kvkk_talep (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  basvuran uuid references profiles(id) on delete set null,
  student_id uuid references students(id) on delete set null,       -- veli çocuğu için; boşsa başvuranın kendisi
  tur text not null check (tur in ('silme', 'bilgi', 'duzeltme')),
  aciklama text check (aciklama is null or char_length(aciklama) <= 1000),
  durum text not null default 'yeni' check (durum in ('yeni', 'inceleniyor', 'tamamlandi', 'reddedildi')),
  yanit text check (yanit is null or char_length(yanit) <= 1000),
  yanitlayan uuid references profiles(id) on delete set null,
  yanit_at timestamptz,
  created_at timestamptz not null default now()
);
create index kvkk_talep_okul on kvkk_talep (school_id, durum, created_at desc);
create index kvkk_talep_ogrenci on kvkk_talep (student_id);

create function kvkk_talep_damga() returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.school_id := my_school(); new.basvuran := auth.uid(); new.created_at := now();
  new.durum := 'yeni'; new.yanit := null; new.yanitlayan := null; new.yanit_at := null;
  new.aciklama := nullif(btrim(coalesce(new.aciklama, '')), '');
  if new.school_id is null then raise exception 'Oturum gerekli.' using errcode = '42501'; end if;
  if new.student_id is not null and not is_parent_of(new.student_id) then raise exception 'Yalnız velisi olduğunuz öğrenci için başvurabilirsiniz.' using errcode = '42501'; end if;
  if (select count(*) from kvkk_talep t where t.basvuran = auth.uid() and t.durum in ('yeni', 'inceleniyor')) >= 3 then
    raise exception 'Sonuçlanmamış 3 başvurunuz var; yanıtlanmalarını bekleyin.';
  end if;
  return new;
end $$;
create trigger kvkk_talep_damga before insert on kvkk_talep for each row execute function kvkk_talep_damga();
revoke all on function kvkk_talep_damga() from public, anon, authenticated;

create function kvkk_talep_bildir() returns trigger language plpgsql security definer set search_path = public as $$
declare ad text;
begin
  select full_name into ad from students where id = new.student_id;
  insert into notifications (user_id, text, link, type)
  select p.id, 'KVKK başvurusu (' || case new.tur when 'silme' then 'silme' when 'bilgi' then 'bilgi' else 'düzeltme' end || ')' || coalesce(': ' || ad, ''),
         jsonb_build_object('page', 'ayarlar'), 'kayit'
  from profiles p where p.school_id = new.school_id and p.status = 'approved' and p.role = 'admin';
  insert into audit_log (user_id, action, entity, entity_id, meta)
  values (new.basvuran, 'kvkk_talep', 'kvkk_talep', new.id, jsonb_build_object('tur', new.tur, 'student_id', new.student_id));
  return null;
end $$;
create trigger kvkk_talep_bildir after insert on kvkk_talep for each row execute function kvkk_talep_bildir();
revoke all on function kvkk_talep_bildir() from public, anon, authenticated;

alter table kvkk_talep enable row level security;
create policy kvkk_talep_oku on kvkk_talep for select to authenticated using (school_id = my_school() and (basvuran = auth.uid() or is_admin()));
create policy kvkk_talep_yaz on kvkk_talep for insert to authenticated with check (true);
revoke all on kvkk_talep from anon, authenticated;
grant select, insert on kvkk_talep to authenticated;

create function kvkk_talep_yanitla(p_id uuid, p_durum text, p_yanit text default null) returns void
language plpgsql volatile security definer set search_path = public as $$
declare t kvkk_talep;
begin
  if not is_admin() then raise exception 'Yalnız yönetici' using errcode = '42501'; end if;
  if p_durum not in ('inceleniyor', 'tamamlandi', 'reddedildi') then raise exception 'Geçersiz durum'; end if;
  if p_yanit is not null and char_length(p_yanit) > 1000 then raise exception 'Yanıt en çok 1000 karakter olabilir.'; end if;
  if p_durum = 'reddedildi' and nullif(btrim(coalesce(p_yanit, '')), '') is null then raise exception 'Reddetmenin gerekçesini yazın.'; end if;
  select * into t from kvkk_talep where id = p_id and school_id = my_school() for update;
  if t.id is null then raise exception 'Başvuru bulunamadı.'; end if;
  update kvkk_talep set durum = p_durum, yanit = coalesce(nullif(btrim(coalesce(p_yanit, '')), ''), yanit), yanitlayan = auth.uid(), yanit_at = now()
  where id = p_id;
  insert into audit_log (user_id, action, entity, entity_id, meta) values (auth.uid(), 'kvkk_yanit', 'kvkk_talep', p_id, jsonb_build_object('durum', p_durum));
  insert into notifications (user_id, text, link, type)
  select t.basvuran, 'KVKK başvurunuz ' || case p_durum when 'inceleniyor' then 'inceleniyor' when 'tamamlandi' then 'sonuçlandı' else 'yanıtlandı' end || '.',
         jsonb_build_object('page', 'hesap-ayarlari'), 'kayit'
  where t.basvuran is not null;
end $$;
revoke all on function kvkk_talep_yanitla(uuid, text, text) from public, anon;
grant execute on function kvkk_talep_yanitla(uuid, text, text) to authenticated;

-- ---------- 4) Öğrenci KVKK dosyası ----------
create function kvkk_ogrenci_dosyasi(p_student uuid) returns jsonb
language plpgsql stable security definer set search_path = public, auth as $$
declare r jsonb;
begin
  if not is_admin() then raise exception 'Yalnız yönetici' using errcode = '42501'; end if;
  if not exists (select 1 from students where id = p_student and school_id = my_school()) then raise exception 'Öğrenci bulunamadı.'; end if;
  select jsonb_build_object(
    'hesaplar', coalesce((
      select jsonb_agg(jsonb_build_object('ad', p.full_name, 'tur', x.tur, 'yakinlik', x.yakinlik,
                                          'aydinlatma', p.consent_version, 'aydinlatma_at', p.consent_at,
                                          'riza', p.acik_riza_version, 'riza_at', p.acik_riza_at, 'son_giris', u.last_sign_in_at) order by x.tur, p.full_name)
      from (select pl.parent_id as id, 'veli' as tur, pl.relation as yakinlik from parent_links pl where pl.student_id = p_student
            union all select pr.id, 'ogrenci', null from profiles pr where pr.student_id = p_student and pr.role = 'ogrenci') x
      join profiles p on p.id = x.id and p.status = 'approved' and p.school_id = my_school()
      left join auth.users u on u.id = p.id), '[]'::jsonb),
    'erisim', coalesce((
      select jsonb_agg(jsonb_build_object('ad', coalesce(p.full_name, 'Silinmiş hesap'), 'rol', case when p.role = 'ogretmen' and p.branch = 'Rehberlik' then 'rehber' else p.role::text end,
                                          'brans', p.branch, 'turler', z.turler, 'sayi', z.sayi, 'son', z.son) order by z.son desc)
      from (select a.user_id, array_agg(distinct a.entity) as turler, count(*) as sayi, max(a.created_at) as son
            from audit_log a where a.entity_id = p_student and a.action = 'view' and a.created_at >= now() - interval '180 days'
            group by a.user_id) z
      left join profiles p on p.id = z.user_id), '[]'::jsonb),
    'talepler', coalesce((
      select jsonb_agg(jsonb_build_object('id', t.id, 'tur', t.tur, 'durum', t.durum, 'aciklama', t.aciklama, 'yanit', t.yanit,
                                          'created_at', t.created_at, 'yanit_at', t.yanit_at, 'basvuran', p.full_name) order by t.created_at desc)
      from kvkk_talep t left join profiles p on p.id = t.basvuran where t.student_id = p_student and t.school_id = my_school()), '[]'::jsonb)
  ) into r;
  return r;
end $$;
revoke all on function kvkk_ogrenci_dosyasi(uuid) from public, anon;
grant execute on function kvkk_ogrenci_dosyasi(uuid) to authenticated;

-- Sonuçlanmış başvurular 3 yıl saklanır (ispat yükümlülüğü), sonra silinir
create function kvkk_talep_temizlik() returns void language sql security definer set search_path = public as $$
  delete from kvkk_talep where durum in ('tamamlandi', 'reddedildi') and coalesce(yanit_at, created_at) < now() - interval '3 years';
$$;
revoke all on function kvkk_talep_temizlik() from public, anon, authenticated;
select cron.schedule('kvkk-talep-temizlik', '45 3 1 * *', $$select public.kvkk_talep_temizlik()$$);
