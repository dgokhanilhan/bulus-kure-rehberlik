-- Faz D · Bildirim merkezi ve sınav/etkinlik takvimi.
-- Bildirim: her bildirimin bir türü var (ödev, mesaj, duyuru, sınav, etkinlik, devamsızlık, rapor…). Tür, bildirimi
-- üreten yerden bağımsız olarak bağlantısından çıkarılır; yönetici hangi türlerin bildirim üreteceğini ayarlar
-- (kapalı türün bildirimi hiç oluşmaz). Takvim: okul / kademe / sınıf / öğrenci / öğretmen hedefli etkinlikler.

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
    "bildirim.not":              {"type":"bool","default":true}
  }'::jsonb
$$;

-- ---------- Bildirim türü ----------
alter table notifications add column type text;
create or replace function notification_type(p_text text, p_link jsonb) returns text language sql immutable as $$
  select case
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
update notifications set type = notification_type(text, link) where type is null;

-- Kapalı türün bildirimi oluşmaz. Ödev bildirimleri kendi ayarlarıyla (odev.bildirim_*) kaynağında süzülür;
-- kayıt, sistem ve genel bildirimler her zaman gider.
create or replace function notifications_filter() returns trigger
language plpgsql security definer set search_path = public as $$
declare sch uuid;
begin
  new.type := coalesce(new.type, notification_type(new.text, new.link));
  if setting_spec() ? ('bildirim.' || new.type) then
    select school_id into sch from profiles where id = new.user_id;
    if not coalesce((school_setting(sch, 'bildirim.' || new.type))::text::boolean, true) then return null; end if;
  end if;
  return new;
end $$;
create trigger notifications_filter before insert on notifications for each row execute function notifications_filter();

-- Bildirim türünü kullanıcı değiştiremez (0002'deki koruma yalnız okundu bilgisine izin veriyordu; type da korunur).
create or replace function guard_notification_update() returns trigger
language plpgsql as $$
begin
  if (new.id, new.user_id, new.text, new.link, new.created_at, new.type) is distinct from (old.id, old.user_id, old.text, old.link, old.created_at, old.type) then
    raise exception 'Bildirimde yalnız okundu bilgisi değişir' using errcode = '42501';
  end if;
  return new;
end $$;

-- ---------- Takvim ----------
create table calendar_events (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id),
  title text not null check (length(btrim(title)) between 3 and 150),
  description text check (description is null or length(description) <= 2000),
  type text not null check (type in ('yazili', 'deneme', 'bursluluk', 'gezi', 'veli_toplantisi', 'kulup', 'tatil', 'odev_teslim', 'proje', 'diger')),
  starts_on date not null,
  ends_on date not null,
  starts_at time,
  ends_at time,
  location text check (location is null or length(location) <= 120),
  target text not null check (target in ('okul', 'kademe', 'sinif', 'ogrenci', 'ogretmen')),
  level text check (level in ('ilkokul', 'ortaokul', 'lise')),
  class_id uuid references classes(id) on delete cascade,
  student_id uuid references students(id) on delete cascade,
  teacher_id uuid references profiles(id) on delete cascade,
  course_id uuid references courses(id) on delete set null,
  audience text[] not null default '{veli,ogrenci,ogretmen}'
    check (audience <@ array['veli', 'ogrenci', 'ogretmen'] and cardinality(audience) >= 1),
  reminded_on date,
  created_by uuid references profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  check (ends_on >= starts_on),
  check (starts_at is null or ends_at is null or ends_on > starts_on or ends_at > starts_at),
  check ((target = 'okul' and level is null and class_id is null and student_id is null and teacher_id is null)
      or (target = 'kademe' and level is not null and class_id is null and student_id is null and teacher_id is null)
      or (target = 'sinif' and class_id is not null and level is null and student_id is null and teacher_id is null)
      or (target = 'ogrenci' and student_id is not null and level is null and class_id is null and teacher_id is null)
      or (target = 'ogretmen' and teacher_id is not null and level is null and class_id is null and student_id is null))
);
create index calendar_school_date on calendar_events (school_id, starts_on);
alter table calendar_events enable row level security;

-- Etkinlik bu kişiye ulaşır mı? p_all: yönetim her şeyi görür (listeleme); bildirimde yalnız doğrudan hedef.
create or replace function event_reaches(uid uuid, e calendar_events, p_all boolean) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles p where p.id = uid and p.status = 'approved' and p.school_id = e.school_id and (
      (p_all and (p.role = 'admin' or (p.role = 'ogretmen' and p.branch = 'Rehberlik') or e.created_by = uid))
      or ((case when p.role in ('admin', 'ogretmen') then 'ogretmen' else p.role::text end) = any(e.audience) and (
            e.target = 'okul'
         or (e.target = 'kademe' and exists (select 1 from classes c where c.id in (select profile_classes(uid)) and c.level = e.level))
         or (e.target = 'sinif' and e.class_id in (select profile_classes(uid)))
         or (e.target = 'ogrenci' and (p.student_id = e.student_id
                                       or exists (select 1 from parent_links pl where pl.parent_id = uid and pl.student_id = e.student_id)
                                       or (p.role in ('ogretmen', 'admin') and teaches_student(uid, e.student_id))))))
      or (e.target = 'ogretmen' and e.teacher_id = uid)))
$$;
revoke all on function event_reaches(uuid, calendar_events, boolean) from public, anon, authenticated;
create or replace function event_visible(e calendar_events) returns boolean
language sql stable security definer set search_path = public as $$ select event_reaches(auth.uid(), e, true) $$;
create or replace function i_teach_student(p_student uuid) returns boolean
language sql stable security definer set search_path = public as $$ select teaches_student(auth.uid(), p_student) $$;
revoke all on function event_visible(calendar_events) from public, anon;
revoke all on function i_teach_student(uuid) from public, anon;
grant execute on function event_visible(calendar_events) to authenticated;
grant execute on function i_teach_student(uuid) to authenticated;

create policy cal_read on calendar_events for select using (school_id = my_school() and event_visible(calendar_events));
-- Yönetim ve rehberlik her hedefe; öğretmen (ayar açıksa) ders verdiği sınıfa, öğrencisine ya da kendisine.
create policy cal_insert on calendar_events for insert with check (
  school_id = my_school() and created_by = auth.uid()
  and (is_staff() or (is_teacher() and (setting('takvim.ogretmen_ekler'))::text::boolean and (
        (target = 'sinif' and class_id in (select my_classes()))
     or (target = 'ogrenci' and i_teach_student(student_id))
     or (target = 'ogretmen' and teacher_id = auth.uid())))));
create policy cal_update on calendar_events for update using (school_id = my_school() and (is_admin() or created_by = auth.uid()))
  with check (school_id = my_school() and (is_staff() or (is_teacher() and (
        (target = 'sinif' and class_id in (select my_classes())) or (target = 'ogrenci' and i_teach_student(student_id))
     or (target = 'ogretmen' and teacher_id = auth.uid())))));
create policy cal_delete on calendar_events for delete using (school_id = my_school() and (is_admin() or created_by = auth.uid()));
create policy mod_takvim on calendar_events as restrictive for all using (is_admin() or module_enabled('takvim'));
create trigger mod_guard before insert or update on calendar_events for each row execute function module_guard('takvim');
create trigger audit_calendar after insert or update or delete on calendar_events for each row execute function audit_row();

create or replace function calendar_before() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.title := btrim(new.title);
  if (new.class_id is not null and not exists (select 1 from classes where id = new.class_id and school_id = new.school_id))
     or (new.student_id is not null and not exists (select 1 from students where id = new.student_id and school_id = new.school_id))
     or (new.teacher_id is not null and not exists (select 1 from profiles where id = new.teacher_id and school_id = new.school_id and role in ('ogretmen', 'admin'))) then
    raise exception 'Etkinliğin hedefi bulunamadı.' using errcode = '23503';
  end if;
  return new;
end $$;
create trigger calendar_before before insert or update on calendar_events for each row execute function calendar_before();

create or replace function event_label(t text) returns text language sql immutable as $$
  select case t when 'yazili' then 'Yazılı' when 'deneme' then 'Deneme' when 'bursluluk' then 'Bursluluk sınavı' when 'gezi' then 'Gezi'
    when 'veli_toplantisi' then 'Veli toplantısı' when 'kulup' then 'Kulüp etkinliği' when 'tatil' then 'Tatil' when 'odev_teslim' then 'Ödev teslimi'
    when 'proje' then 'Proje' else 'Etkinlik' end
$$;

-- Yeni etkinlik doğrudan hedefe bildirilir (sınav türleri "sınav", diğerleri "etkinlik").
create or replace function calendar_notify() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform notify_many(
    array(select p.id from profiles p where p.school_id = new.school_id and p.status = 'approved'
            and p.id is distinct from new.created_by and event_reaches(p.id, new, false)),
    event_label(new.type) || ': ' || new.title || ' · ' || to_char(new.starts_on, 'DD.MM.YYYY'),
    jsonb_build_object('page', 'takvim', 'event', new.id,
                       'kind', case when new.type in ('yazili', 'deneme', 'bursluluk') then 'sinav' else 'etkinlik' end));
  return null;
end $$;
create trigger calendar_notify after insert on calendar_events for each row execute function calendar_notify();

-- Yaklaşan sınav hatırlatması (her sabah 08.00): başlangıca X gün (ayar) kala bir kez.
create or replace function takvim_hatirlatma() returns int
language plpgsql security definer set search_path = public as $$
declare e calendar_events; n int := 0; today date := (now() at time zone 'Europe/Istanbul')::date; days int;
begin
  for e in select * from calendar_events where type in ('yazili', 'deneme', 'bursluluk') and starts_on >= today and reminded_on is null loop
    days := (school_setting(e.school_id, 'takvim.hatirlatma_gun'))::text::int;
    if days > 0 and e.starts_on - today <= days and (school_setting(e.school_id, 'modul.takvim'))::text::boolean then
      perform notify_many(
        array(select p.id from profiles p where p.school_id = e.school_id and p.status = 'approved' and event_reaches(p.id, e, false)),
        'Yaklaşan ' || lower(event_label(e.type)) || ': ' || e.title || ' · ' || to_char(e.starts_on, 'DD.MM.YYYY'),
        jsonb_build_object('page', 'takvim', 'event', e.id, 'kind', 'sinav_hatirlatma'));
      update calendar_events set reminded_on = today where id = e.id;
      n := n + 1;
    end if;
  end loop;
  return n;
end $$;
revoke all on function takvim_hatirlatma() from public, anon, authenticated;
grant execute on function takvim_hatirlatma() to service_role;
select cron.schedule('takvim-hatirlatma', '5 5 * * *', $$select public.takvim_hatirlatma()$$);
