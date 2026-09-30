-- Faz G · Bursluluk sınavı tanımlama ve başvuru (K12'den geçiş).
-- Yönetici sınav tanımlar; herkese açık başvuru formu (giriş gerekmez) yalnız apply_scholarship() fonksiyonuyla yazar:
-- sınav aktif ve başvuruya açık mı, tarih aralığı, sınıf seviyesi, kontenjan, aynı kişinin tekrar başvurusu ve kısa
-- sürede çok başvuru denetlenir. Başvuruları yalnız yönetici görür ve yönetir (onay/ret, salon/saat, dışa aktarma).
-- Bursluluk modülü varsayılan kapalıdır (Yönetim Merkezi → Modüller).

-- ---------- Ayarlar ----------
create or replace function setting_spec() returns jsonb language sql immutable as $$
  select '{
    "genel.okul_adi":            {"type":"text","max":120},
    "genel.telefon":             {"type":"text","max":40,  "default":""},
    "genel.eposta":              {"type":"text","max":120, "default":""},
    "genel.adres":               {"type":"text","max":300, "default":""},
    "genel.logo":                {"type":"text","max":300, "default":""},
    "modul.lgs":                 {"type":"bool","default":true},
    "modul.yoklama":             {"type":"bool","default":true},
    "modul.ders_programi":       {"type":"bool","default":true},
    "modul.yemek":               {"type":"bool","default":true},
    "modul.duyuru":              {"type":"bool","default":true},
    "modul.mesaj":               {"type":"bool","default":true},
    "modul.odev":                {"type":"bool","default":true},
    "modul.takvim":              {"type":"bool","default":true},
    "modul.bursluluk":           {"type":"bool","default":false},
    "yoklama.ogretmen_girebilir":{"type":"bool","default":false},
    "yoklama.limit_donem1":      {"type":"int","min":0,"max":180,"default":10},
    "yoklama.limit_donem2":      {"type":"int","min":0,"max":180,"default":10},
    "yoklama.limit_yillik":      {"type":"int","min":0,"max":180,"default":20},
    "yoklama.limit_toplam":      {"type":"int","min":0,"max":180,"default":0},
    "yoklama.uyari_sari":        {"type":"int","min":1,"max":99,"default":70},
    "yoklama.uyari_turuncu":     {"type":"int","min":1,"max":99,"default":90},
    "yoklama.gec_sayim":         {"type":"enum","values":["yok","yarim","tam"],"default":"yok"},
    "yoklama.veli_uyari":        {"type":"bool","default":true},
    "odev.son_tarih_zorunlu":    {"type":"bool","default":true},
    "odev.veli_durum_gorur":     {"type":"bool","default":true},
    "odev.geciken_kirmizi":      {"type":"bool","default":true},
    "odev.bildirim_yeni":        {"type":"bool","default":true},
    "odev.bildirim_kontrol":     {"type":"bool","default":true},
    "odev.hatirlatma_gun":       {"type":"int","min":0,"max":14,"default":1},
    "odev.ogretmen_dosya":       {"type":"bool","default":true},
    "odev.ogrenci_dosya":        {"type":"bool","default":false},
    "dosya.max_mb":              {"type":"int","min":1,"max":25,"default":10},
    "dosya.gorsel":              {"type":"bool","default":true},
    "dosya.pdf":                 {"type":"bool","default":true},
    "mesaj.dosya":               {"type":"bool","default":true},
    "duyuru.dosya":              {"type":"bool","default":true},
    "duyuru.ogretmen_yazabilir": {"type":"bool","default":true},
    "duyuru.ogretmen_kapsam":    {"type":"enum","values":["sinif","kademe","okul"],"default":"sinif"},
    "duyuru.gosterim_gun":       {"type":"int","min":1,"max":365,"default":14},
    "takvim.ogretmen_ekler":     {"type":"bool","default":true},
    "takvim.hatirlatma_gun":     {"type":"int","min":0,"max":14,"default":1},
    "bildirim.mesaj":            {"type":"bool","default":true},
    "bildirim.duyuru":           {"type":"bool","default":true},
    "bildirim.sinav":            {"type":"bool","default":true},
    "bildirim.etkinlik":         {"type":"bool","default":true},
    "bildirim.sinav_hatirlatma": {"type":"bool","default":true},
    "bildirim.devamsizlik":      {"type":"bool","default":true},
    "bildirim.rapor":            {"type":"bool","default":true},
    "bildirim.deneme":           {"type":"bool","default":true},
    "bildirim.gorev":            {"type":"bool","default":true},
    "bildirim.gorusme":          {"type":"bool","default":true},
    "bildirim.not":              {"type":"bool","default":true},
    "bildirim.bursluluk":        {"type":"bool","default":true},
    "bursluluk.basvuru_acik":    {"type":"bool","default":true},
    "bursluluk.aciklama":        {"type":"text","max":1000,"default":""}
  }'::jsonb
$$;

-- ---------- Sınavlar ----------
create table scholarship_exams (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id),
  academic_year_id uuid references academic_years(id) on delete set null,
  name text not null check (length(btrim(name)) between 3 and 150),
  exam_date date not null,
  starts_at time,
  ends_at time,
  grades smallint[] not null check (cardinality(grades) >= 1 and grades <@ array[1,2,3,4,5,6,7,8,9,10,11,12]::smallint[]),
  quota int check (quota is null or quota between 1 and 100000),
  apply_from date not null,
  apply_until date not null,
  location text check (location is null or length(location) <= 200),
  description text check (description is null or length(description) <= 2000),
  active boolean not null default true,
  applications_open boolean not null default true,
  created_by uuid references profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  check (apply_from <= apply_until and apply_until <= exam_date),
  check (starts_at is null or ends_at is null or ends_at > starts_at)
);
alter table scholarship_exams enable row level security;
create policy sch_exam_admin on scholarship_exams for all using (is_admin() and school_id = my_school()) with check (is_admin() and school_id = my_school());
create trigger audit_sch_exams after insert or update or delete on scholarship_exams for each row execute function audit_row();

create or replace function sch_exam_before() returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.name := btrim(new.name);
  if new.academic_year_id is null then select id into new.academic_year_id from academic_years where school_id = new.school_id and is_active; end if;
  return new;
end $$;
create trigger sch_exam_before before insert or update on scholarship_exams for each row execute function sch_exam_before();

-- ---------- Başvurular ----------
create table scholarship_applications (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default upper(substr(md5(gen_random_uuid()::text), 1, 8)),   -- başvuru numarası
  exam_id uuid not null references scholarship_exams(id) on delete cascade,
  school_id uuid not null references schools(id),
  student_id uuid references students(id) on delete set null,       -- okulun mevcut öğrencisiyse
  student_name text not null check (length(btrim(student_name)) between 3 and 80),
  grade smallint not null check (grade between 1 and 12),
  current_school text check (current_school is null or length(current_school) <= 150),
  parent_name text not null check (length(btrim(parent_name)) between 3 and 80),
  phone text not null check (phone ~ '^[0-9 +()-]{10,20}$'),
  email text check (email is null or email ~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$'),
  consent_version text,
  status text not null default 'bekliyor' check (status in ('bekliyor', 'onaylandi', 'reddedildi')),
  hall text check (hall is null or length(hall) <= 60),
  session_time time,
  note text check (note is null or length(note) <= 500),
  source text not null default 'form' check (source in ('form', 'okul')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index sch_app_exam on scholarship_applications (exam_id, status);
alter table scholarship_applications enable row level security;
create policy sch_app_admin on scholarship_applications for all using (is_admin() and school_id = my_school()) with check (is_admin() and school_id = my_school());
create policy mod_bursluluk_e on scholarship_exams as restrictive for all using (is_admin() or module_enabled('bursluluk'));
create policy mod_bursluluk_a on scholarship_applications as restrictive for all using (is_admin() or module_enabled('bursluluk'));
create trigger audit_sch_apps after update or delete on scholarship_applications for each row execute function audit_row();

create or replace function sch_app_touch() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
create trigger sch_app_touch before update on scholarship_applications for each row execute function sch_app_touch();

-- ---------- Herkese açık: açık sınavlar ve başvuru ----------
create or replace function public_scholarship_exams(p_slug text) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'name', e.name, 'exam_date', e.exam_date, 'starts_at', e.starts_at,
           'ends_at', e.ends_at, 'grades', e.grades, 'location', e.location, 'description', e.description, 'apply_until', e.apply_until,
           'full', e.quota is not null and (select count(*) from scholarship_applications a where a.exam_id = e.id and a.status <> 'reddedildi') >= e.quota)
         order by e.exam_date), '[]'::jsonb)
  from scholarship_exams e join schools s on s.id = e.school_id
  where s.slug = p_slug and e.active and e.applications_open
    and (school_setting(s.id, 'modul.bursluluk'))::text::boolean and (school_setting(s.id, 'bursluluk.basvuru_acik'))::text::boolean
    and (now() at time zone 'Europe/Istanbul')::date between e.apply_from and e.apply_until
$$;
revoke all on function public_scholarship_exams(text) from public;
grant execute on function public_scholarship_exams(text) to anon, authenticated;

create or replace function apply_scholarship(p_slug text, p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  e scholarship_exams; s schools; v_code text; n int; today date := (now() at time zone 'Europe/Istanbul')::date;
  v_name text := btrim(regexp_replace(coalesce(p->>'student_name', ''), '\s+', ' ', 'g'));
  v_parent text := btrim(regexp_replace(coalesce(p->>'parent_name', ''), '\s+', ' ', 'g'));
  v_phone text := btrim(coalesce(p->>'phone', ''));
  v_digits text := regexp_replace(coalesce(p->>'phone', ''), '\D', '', 'g');
  v_email text := nullif(lower(btrim(coalesce(p->>'email', ''))), '');
  v_grade int;
begin
  select * into s from schools where slug = p_slug;
  select * into e from scholarship_exams where id = (p->>'exam_id')::uuid and school_id = s.id;
  if s.id is null or e.id is null or not e.active or not e.applications_open
     or not (school_setting(s.id, 'modul.bursluluk'))::text::boolean or not (school_setting(s.id, 'bursluluk.basvuru_acik'))::text::boolean then
    raise exception 'Bu sınav için başvuru alınmıyor.' using errcode = '22023';
  end if;
  if today < e.apply_from or today > e.apply_until then raise exception 'Başvuru tarihleri dışında.' using errcode = '22023'; end if;
  if coalesce(p->>'consent_version', '') = '' then raise exception 'Aydınlatma metni onaylanmalı.' using errcode = '22023'; end if;
  begin v_grade := (p->>'grade')::int; exception when others then v_grade := null; end;
  if v_grade is null or not (v_grade = any(e.grades)) then raise exception 'Bu sınav seçilen sınıf seviyesi için değil.' using errcode = '22023'; end if;
  if length(v_name) < 3 or length(v_parent) < 3 then raise exception 'Öğrenci ve veli adını yaz.' using errcode = '22023'; end if;
  if length(v_digits) < 10 or length(v_digits) > 13 then raise exception 'Telefon numarası geçersiz.' using errcode = '22023'; end if;
  -- Kötüye kullanım: aynı telefondan son 1 saatte en fazla 5 başvuru; sınav başına dakikada en fazla 30
  select count(*) into n from scholarship_applications where regexp_replace(phone, '\D', '', 'g') = v_digits and created_at > now() - interval '1 hour';
  if n >= 5 then raise exception 'Çok fazla başvuru yapıldı; biraz sonra tekrar dene.' using errcode = '54000'; end if;
  select count(*) into n from scholarship_applications where exam_id = e.id and created_at > now() - interval '1 minute';
  if n >= 30 then raise exception 'Şu an çok yoğun; birkaç dakika sonra tekrar dene.' using errcode = '54000'; end if;
  -- Aynı öğrenci (ad + telefon) aynı sınava bir kez
  if exists (select 1 from scholarship_applications a where a.exam_id = e.id and lower(a.student_name) = lower(v_name)
             and regexp_replace(a.phone, '\D', '', 'g') = v_digits) then
    raise exception 'Bu öğrenci için bu sınava zaten başvuru yapılmış.' using errcode = '23505';
  end if;
  if e.quota is not null and (select count(*) from scholarship_applications a where a.exam_id = e.id and a.status <> 'reddedildi') >= e.quota then
    raise exception 'Kontenjan doldu.' using errcode = '22023';
  end if;
  insert into scholarship_applications (exam_id, school_id, student_name, grade, current_school, parent_name, phone, email, consent_version, source)
  values (e.id, s.id, v_name, v_grade, nullif(btrim(coalesce(p->>'current_school', '')), ''), v_parent, v_phone, v_email, left(p->>'consent_version', 40), 'form')
  returning code into v_code;
  perform notify_many(array(select admin_accounts(s.id)), 'Bursluluk başvurusu: ' || v_name || ' (' || v_grade || '. sınıf) · ' || e.name,
                      jsonb_build_object('page', 'yonetim', 'tab', 'bursluluk'));
  return jsonb_build_object('code', v_code, 'exam', e.name, 'exam_date', e.exam_date);
end $$;
revoke all on function apply_scholarship(text, jsonb) from public;
grant execute on function apply_scholarship(text, jsonb) to anon, authenticated;

-- Yönetici: okulun mevcut öğrencisinden başvuru (veli bilgileri bağlı veliden).
create or replace function admin_add_application(p_exam uuid, p_student uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare e scholarship_exams; st students; par profiles; v_id uuid; g int;
begin
  if not is_admin() then raise exception 'Bu işlem için yönetici yetkisi ve iki adımlı doğrulama gerekir' using errcode = '42501'; end if;
  select * into e from scholarship_exams where id = p_exam and school_id = my_school();
  select * into st from students where id = p_student and school_id = my_school();
  if e.id is null or st.id is null then raise exception 'Sınav ya da öğrenci bulunamadı.' using errcode = 'P0002'; end if;
  g := split_part(st.class_name, '/', 1)::int;
  if exists (select 1 from scholarship_applications where exam_id = e.id and student_id = st.id) then
    raise exception 'Bu öğrenci için bu sınava zaten başvuru var.' using errcode = '23505';
  end if;
  select p.* into par from parent_links pl join profiles p on p.id = pl.parent_id where pl.student_id = st.id and p.status = 'approved' order by p.created_at limit 1;
  insert into scholarship_applications (exam_id, school_id, student_id, student_name, grade, current_school, parent_name, phone, email, source, status)
  values (e.id, e.school_id, st.id, st.full_name, g, (select name from schools where id = e.school_id),
          coalesce(par.full_name, 'Veli bilgisi yok'), coalesce(par.phone, '0000000000'), par.email, 'okul', 'onaylandi')
  returning id into v_id;
  return v_id;
end $$;
revoke all on function admin_add_application(uuid, uuid) from public, anon;
grant execute on function admin_add_application(uuid, uuid) to authenticated;

-- Okul öğrencisinin başvurusu onaylanınca / salon atanınca veliye ve öğrenciye bilgi.
create or replace function sch_app_notify() returns trigger language plpgsql security definer set search_path = public as $$
declare e scholarship_exams;
begin
  if new.student_id is null then return null; end if;
  if (new.status, new.hall, new.session_time) is not distinct from (old.status, old.hall, old.session_time) then return null; end if;
  select * into e from scholarship_exams where id = new.exam_id;
  if new.status = 'onaylandi' and (new.hall is not null or new.session_time is not null) then
    perform notify_many(array(select parent_accounts(new.student_id)) || array(select student_accounts(new.student_id)),
      'Bursluluk sınavı: ' || e.name || ' · ' || to_char(e.exam_date, 'DD.MM.YYYY') || coalesce(' · ' || to_char(new.session_time, 'HH24:MI'), '') ||
      coalesce(' · Salon ' || new.hall, ''), jsonb_build_object('page', 'okul'));
  end if;
  return null;
end $$;
create trigger sch_app_notify after update on scholarship_applications for each row execute function sch_app_notify();

-- Bildirim türü: bursluluk (0015'teki sınıflandırmaya eklenir)
create or replace function notification_type(p_text text, p_link jsonb) returns text language sql immutable as $$
  select case
    when p_text like 'Bursluluk%' then 'bursluluk'
    when p_link ? 'event' then coalesce(p_link->>'kind', 'etkinlik')
    when p_link ? 'homework' then case when p_text like 'Yeni ödev%' then 'odev_yeni' when p_text like 'Ödev kontrol%' then 'odev_kontrol'
                                       when p_text like 'Ödev hatırlatma%' then 'odev_hatirlatma' else 'odev' end
    when p_link ? 'conversation' then 'mesaj'
    when p_link ? 'announcement' then 'duyuru'
    when p_link ? 'report' then 'rapor'
    when p_link ? 'meeting' or p_link->>'page' = 'gorusmeler' or p_link->>'tab' = 'gorusmeler' then 'gorusme'
    when p_link->>'page' = 'gorevler' or p_link->>'tab' = 'gorevler' then 'gorev'
    when p_link->>'tab' = 'notlar' then 'not'
    when p_link->>'page' = 'okul' then 'devamsizlik'
    when p_link->>'page' in ('ozet', 'denemeler') then 'deneme'
    when p_link->>'page' = 'onaylar' then 'kayit'
    when p_link ? 'alarm' then 'sistem'
    else 'diger' end
$$;
