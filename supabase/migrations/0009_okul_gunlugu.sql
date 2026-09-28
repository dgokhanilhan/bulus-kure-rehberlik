-- Okul günlüğü: yoklama, ders programı (+ ders saatleri), yemek listesi.
-- Hepsini yalnız yönetici girer ve düzenler (aal2). Veli ve öğrenci kendi çocuğunun/kendi sınıfının bilgisini görür.

-- ---------- Yoklama ----------
-- Yalnız "gelmedi" durumları tutulur; kaydı olmayan öğrenci o gün okuldadır. Tam gün yoklamasıdır.
create table attendance (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id),
  student_id uuid not null references students(id) on delete cascade,
  day date not null,
  status text not null check (status in ('devamsiz', 'gec', 'izinli', 'raporlu')),
  note text check (note is null or length(note) <= 200),
  created_by uuid references profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (student_id, day)
);
create index attendance_day on attendance (school_id, day);
alter table attendance enable row level security;
create policy attendance_read on attendance for select using (can_see_student(student_id));
create policy attendance_admin on attendance for all
  using (is_admin() and school_id = my_school())
  with check (is_admin() and school_id = my_school() and exists (select 1 from students s where s.id = student_id and s.school_id = my_school()));

-- Devamsız ya da geç işaretlenince veli ve öğrenci hesaplarına bildirim (durum değişmediyse tekrar gitmez).
-- AFTER trigger: "insert … on conflict do update" (upsert) çakışınca BEFORE INSERT yine çalışır; AFTER INSERT çalışmaz.
create or replace function attendance_touch() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;
create trigger attendance_touch before update on attendance
  for each row execute function attendance_touch();

create or replace function attendance_notify() returns trigger
language plpgsql security definer set search_path = public as $$
declare s students; label text;
begin
  if new.status not in ('devamsiz', 'gec') or (tg_op = 'UPDATE' and old.status = new.status and old.day = new.day) then
    return null;
  end if;
  select * into s from students where id = new.student_id;
  label := case new.status when 'devamsiz' then 'okula gelmedi' else 'okula geç geldi' end;
  perform notify_many(array(select parent_accounts(s.id)) || array(select student_accounts(s.id)),
    s.full_name || ' ' || to_char(new.day, 'DD.MM.YYYY') || ' günü ' || label || '.',
    jsonb_build_object('page', 'okul'));
  return null;
end $$;
create trigger attendance_notify after insert or update on attendance
  for each row execute function attendance_notify();

-- ---------- Ders programı ----------
create table bell_times (
  school_id uuid not null references schools(id),
  period smallint not null check (period between 1 and 12),
  starts time not null,
  ends time not null check (ends > starts),
  primary key (school_id, period)
);
alter table bell_times enable row level security;
create policy bell_read on bell_times for select using (school_id = my_school());
create policy bell_admin on bell_times for all using (is_admin() and school_id = my_school()) with check (is_admin() and school_id = my_school());

create table timetable (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id),
  class_id uuid not null references classes(id) on delete cascade,
  weekday smallint not null check (weekday between 1 and 6),       -- 1 Pazartesi … 6 Cumartesi
  period smallint not null check (period between 1 and 12),
  subject text not null check (length(btrim(subject)) between 1 and 60),
  teacher_id uuid references profiles(id) on delete set null,
  unique (class_id, weekday, period)
);
create index timetable_class on timetable (class_id);
alter table timetable enable row level security;
create policy timetable_read on timetable for select using (school_id = my_school());
create policy timetable_admin on timetable for all
  using (is_admin() and school_id = my_school())
  with check (is_admin() and school_id = my_school() and exists (select 1 from classes c where c.id = class_id and c.school_id = my_school()));

create or replace function timetable_check_teacher() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.subject := btrim(new.subject);
  if new.teacher_id is not null and not exists (
      select 1 from profiles p where p.id = new.teacher_id and p.school_id = new.school_id
        and p.status = 'approved' and p.role in ('ogretmen', 'admin')) then
    raise exception 'Dersin öğretmeni okulun onaylı öğretmenlerinden biri olmalı.' using errcode = '22023';
  end if;
  return new;
end $$;
create trigger timetable_check_teacher before insert or update on timetable
  for each row execute function timetable_check_teacher();

-- Hesabı kapatılan öğretmen ders programından da düşer (0008'deki set_user_active sınıf öğretmenliğini boşaltıyordu).
create or replace function profiles_closed_cleanup() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'rejected' and old.status = 'approved' then
    update timetable set teacher_id = null where teacher_id = new.id;
  end if;
  return new;
end $$;
create trigger profiles_closed_cleanup after update of status on profiles
  for each row execute function profiles_closed_cleanup();

-- ---------- Yemek listesi ----------
create table meals (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id),
  day date not null,
  meal text not null check (meal in ('kahvalti', 'ogle', 'ikindi')),
  items text not null check (length(btrim(items)) between 1 and 400),
  unique (school_id, day, meal)
);
create index meals_day on meals (school_id, day);
alter table meals enable row level security;
create policy meals_read on meals for select using (school_id = my_school());
create policy meals_admin on meals for all using (is_admin() and school_id = my_school()) with check (is_admin() and school_id = my_school());
