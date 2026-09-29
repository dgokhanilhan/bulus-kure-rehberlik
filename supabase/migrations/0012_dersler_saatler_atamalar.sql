-- Faz A · Yönetim Merkezi (2/2): eğitim yılları, ders kataloğu, dinamik ders saatleri, ders–öğretmen–sınıf atamaları.
-- Veri silinmez: serbest metin ders adları kataloğa dönüştürülür (timetable.subject kalır), ders saatleri
-- mevcut bell_times tablosu üstünde genişler, var olan öğretmen–ders eşleşmeleri atamalara taşınır.

-- ---------- Yönetim işlemleri için ortak işlem kaydı ----------
create or replace function audit_row() returns trigger
language plpgsql security definer set search_path = public as $$
declare r jsonb := to_jsonb(coalesce(new, old));
begin
  insert into audit_log (user_id, action, entity, entity_id, meta)
  values (auth.uid(), lower(tg_op), tg_table_name,
          case when r ? 'id' then (r->>'id')::uuid end,
          case tg_op when 'UPDATE' then jsonb_build_object('eski', to_jsonb(old), 'yeni', to_jsonb(new)) else r end);
  return null;
end $$;
create trigger audit_classes after insert or update or delete on classes for each row execute function audit_row();

-- ---------- Eğitim yılları ----------
create table academic_years (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id),
  name text not null check (name ~ '^\d{4}-\d{4}$'),
  starts date not null,
  term1_ends date not null,
  term2_starts date not null,
  ends date not null,
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  unique (school_id, name),
  check (starts < term1_ends and term1_ends < term2_starts and term2_starts < ends)
);
create unique index academic_years_one_active on academic_years (school_id) where is_active;
alter table academic_years enable row level security;
create policy years_read on academic_years for select using (school_id = my_school());
create policy years_admin on academic_years for all using (is_admin() and school_id = my_school()) with check (is_admin() and school_id = my_school());
create trigger audit_years after insert or update or delete on academic_years for each row execute function audit_row();

-- Aktif yıl değişince öncekini pasif yap (tek aktif yıl).
create or replace function academic_years_single_active() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.is_active then update academic_years set is_active = false where school_id = new.school_id and id <> new.id and is_active; end if;
  return new;
end $$;
create trigger academic_years_single_active before insert or update of is_active on academic_years
  for each row when (new.is_active) execute function academic_years_single_active();

create or replace function active_year() returns uuid
language sql stable security definer set search_path = public as $$
  select id from academic_years where school_id = my_school() and is_active
$$;
grant execute on function active_year() to authenticated;

alter table classes add column academic_year_id uuid references academic_years(id) on delete set null;
create or replace function classes_default_year() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.academic_year_id is null then select id into new.academic_year_id from academic_years where school_id = new.school_id and is_active; end if;
  return new;
end $$;
create trigger classes_default_year before insert on classes for each row execute function classes_default_year();

-- ---------- Ders kataloğu ----------
create table courses (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id),
  name text not null check (length(btrim(name)) between 2 and 60),
  short_name text not null check (length(btrim(short_name)) between 1 and 8),
  levels text[] not null default '{}' check (levels <@ array['ilkokul', 'ortaokul', 'lise']),   -- boş = bütün kademeler
  color text check (color is null or color ~ '^#[0-9a-fA-F]{6}$'),
  active boolean not null default true,
  sort int not null default 0,
  academic_year_id uuid references academic_years(id) on delete set null,
  created_at timestamptz not null default now()
);
create unique index courses_name on courses (school_id, lower(btrim(name)));
alter table courses enable row level security;
create policy courses_read on courses for select using (school_id = my_school());
create policy courses_admin on courses for all using (is_admin() and school_id = my_school()) with check (is_admin() and school_id = my_school());
create trigger audit_courses after insert or update or delete on courses for each row execute function audit_row();

create or replace function courses_trim() returns trigger language plpgsql as $$
begin
  new.name := btrim(new.name);
  new.short_name := upper(btrim(new.short_name));
  return new;
end $$;
create trigger courses_trim before insert or update on courses for each row execute function courses_trim();

-- Okul varsayılanları: içinde bulunulan eğitim yılı (tarihler yaklaşık; yönetici düzeltir) ve başlangıç ders kataloğu.
-- Var olan okullar için şimdi, yeni eklenen okullar için tetikleyiciyle çalışır.
create or replace function school_defaults(p_school uuid) returns void
language plpgsql security definer set search_path = public as $$
declare y int := case when extract(month from current_date) >= 8 then extract(year from current_date)::int else extract(year from current_date)::int - 1 end;
begin
  if not exists (select 1 from academic_years where school_id = p_school) then
    insert into academic_years (school_id, name, starts, term1_ends, term2_starts, ends, is_active)
    values (p_school, y || '-' || (y + 1), make_date(y, 9, 8), make_date(y + 1, 1, 22), make_date(y + 1, 2, 8), make_date(y + 1, 6, 25), true);
  end if;
  insert into courses (school_id, name, short_name, levels, sort)
  select p_school, d.name, d.short, d.levels, d.sort
  from (values
    ('Türkçe', 'TÜR', '{ilkokul,ortaokul}'::text[], 1), ('Matematik', 'MAT', '{}'::text[], 2), ('Fen Bilimleri', 'FEN', '{ilkokul,ortaokul}'::text[], 3),
    ('Hayat Bilgisi', 'HAY', '{ilkokul}'::text[], 4), ('Sosyal Bilgiler', 'SOS', '{ilkokul,ortaokul}'::text[], 5),
    ('T.C. İnkılap Tarihi', 'İNK', '{ortaokul}'::text[], 6), ('Din Kültürü', 'DİN', '{}'::text[], 7), ('İngilizce', 'İNG', '{}'::text[], 8),
    ('Almanca', 'ALM', '{}'::text[], 9), ('Türk Dili ve Edebiyatı', 'TDE', '{lise}'::text[], 10), ('Fizik', 'FİZ', '{lise}'::text[], 11),
    ('Kimya', 'KİM', '{lise}'::text[], 12), ('Biyoloji', 'BİY', '{lise}'::text[], 13), ('Tarih', 'TAR', '{lise}'::text[], 14),
    ('Coğrafya', 'COĞ', '{lise}'::text[], 15), ('Felsefe', 'FEL', '{lise}'::text[], 16), ('Beden Eğitimi', 'BED', '{}'::text[], 17),
    ('Müzik', 'MÜZ', '{}'::text[], 18), ('Görsel Sanatlar', 'GÖR', '{}'::text[], 19), ('Bilişim Teknolojileri', 'BİL', '{ortaokul}'::text[], 20),
    ('Rehberlik ve Yönlendirme', 'REH', '{}'::text[], 21), ('Seçmeli', 'SEÇ', '{}'::text[], 22)
  ) d(name, short, levels, sort)
  on conflict do nothing;
  -- Ders programında yazılmış ama katalogda olmayan adlar
  insert into courses (school_id, name, short_name, sort)
  select distinct t.school_id, btrim(t.subject), upper(left(btrim(t.subject), 3)), 100 from timetable t
  where t.school_id = p_school and not exists (select 1 from courses c where c.school_id = t.school_id and lower(c.name) = lower(btrim(t.subject)))
  on conflict do nothing;
  update classes c set academic_year_id = y2.id from academic_years y2
   where c.school_id = p_school and c.academic_year_id is null and y2.school_id = p_school and y2.is_active;
end $$;
revoke all on function school_defaults(uuid) from public, anon, authenticated;
create or replace function schools_defaults_trigger() returns trigger language plpgsql security definer set search_path = public as $$
begin perform school_defaults(new.id); return null; end $$;
create trigger schools_defaults after insert on schools for each row execute function schools_defaults_trigger();
select school_defaults(id) from schools;

-- ---------- Ders programı → katalog ----------
alter table timetable add column course_id uuid references courses(id) on delete restrict;
update timetable t set course_id = c.id from courses c where c.school_id = t.school_id and lower(c.name) = lower(btrim(t.subject));
-- Ders seçilince programdaki ad katalogdan yazılır (eski ekranlar ve veli görünümü subject'i okur).
create or replace function timetable_course_name() returns trigger
language plpgsql security definer set search_path = public as $$
declare c courses;
begin
  if new.course_id is not null then
    select * into c from courses where id = new.course_id and school_id = new.school_id;
    if c.id is null then raise exception 'Ders bulunamadı.' using errcode = '23503'; end if;
    new.subject := c.name;
  elsif new.subject is not null then
    select id into new.course_id from courses where school_id = new.school_id and lower(name) = lower(btrim(new.subject));
  end if;
  return new;
end $$;
create trigger timetable_course_name before insert or update of course_id, subject on timetable
  for each row execute function timetable_course_name();
create trigger audit_timetable after insert or update or delete on timetable for each row execute function audit_row();

-- ---------- Dinamik ders saatleri (bell_times genişler) ----------
alter table bell_times drop constraint bell_times_period_check;
alter table bell_times add constraint bell_times_period_check check (period between 1 and 20);
alter table timetable drop constraint timetable_period_check;
alter table timetable add constraint timetable_period_check check (period between 1 and 20);
alter table bell_times add column active boolean not null default true;
alter table bell_times add column label text check (label is null or length(label) <= 30);
create trigger audit_bells after insert or update or delete on bell_times for each row execute function audit_row();

-- Ders saati ekle (sona), sil (sonrakiler bir yukarı kayar), yer değiştir (programdaki dersler de taşınır).
create or replace function add_bell(p_starts time, p_ends time) returns smallint
language plpgsql security definer set search_path = public as $$
declare n smallint;
begin
  if not is_admin() then raise exception 'Bu işlem için yönetici yetkisi ve iki adımlı doğrulama gerekir' using errcode = '42501'; end if;
  select coalesce(max(period), 0) + 1 into n from bell_times where school_id = my_school();
  if n > 20 then raise exception 'En fazla 20 ders saati tanımlanabilir.' using errcode = '22023'; end if;
  insert into bell_times (school_id, period, starts, ends) values (my_school(), n, p_starts, p_ends);
  return n;
end $$;

create or replace function delete_bell(p_period smallint) returns void
language plpgsql security definer set search_path = public as $$
declare n int; i int; school uuid := my_school();
begin
  if not is_admin() then raise exception 'Bu işlem için yönetici yetkisi ve iki adımlı doğrulama gerekir' using errcode = '42501'; end if;
  select count(*) into n from timetable where school_id = school and period = p_period;
  if n > 0 then
    raise exception '%. ders saatinde ders programında % ders var; önce onları kaldır ya da bu saati pasif yap.', p_period, n using errcode = '23503';
  end if;
  delete from bell_times where school_id = school and period = p_period;
  -- Sonraki saatler (ve o saatlerdeki dersler) sırayla bir yukarı kayar; her adımda hedef numara boştur.
  for i in p_period + 1 .. 20 loop
    update bell_times set period = i - 1 where school_id = school and period = i;
    update timetable set period = i - 1 where school_id = school and period = i;
  end loop;
end $$;

create or replace function move_bell(p_period smallint, p_up boolean) returns void
language plpgsql security definer set search_path = public as $$
declare other smallint := case when p_up then p_period - 1 else p_period + 1 end; school uuid := my_school(); tmp smallint;
begin
  if not is_admin() then raise exception 'Bu işlem için yönetici yetkisi ve iki adımlı doğrulama gerekir' using errcode = '42501'; end if;
  if not exists (select 1 from bell_times where school_id = school and period = other) then
    raise exception 'Bu yönde ders saati yok.' using errcode = '22023';
  end if;
  -- Takas için geçici boş numara (1–20 aralığında, hiçbir saat ve derste kullanılmayan)
  select min(g) into tmp from generate_series(1, 20) g
  where not exists (select 1 from bell_times where school_id = school and period = g)
    and not exists (select 1 from timetable where school_id = school and period = g);
  if tmp is null then raise exception 'Yer değiştirmek için boş ders saati numarası yok.' using errcode = '22023'; end if;
  update bell_times set period = tmp where school_id = school and period = p_period;
  update bell_times set period = p_period where school_id = school and period = other;
  update bell_times set period = other where school_id = school and period = tmp;
  -- Saatler yer değiştirir; programdaki dersler de o saatle birlikte taşınır
  update timetable set period = tmp where school_id = school and period = p_period;
  update timetable set period = p_period where school_id = school and period = other;
  update timetable set period = other where school_id = school and period = tmp;
end $$;
revoke all on function add_bell(time, time) from public, anon;
revoke all on function delete_bell(smallint) from public, anon;
revoke all on function move_bell(smallint, boolean) from public, anon;
grant execute on function add_bell(time, time) to authenticated;
grant execute on function delete_bell(smallint) to authenticated;
grant execute on function move_bell(smallint, boolean) to authenticated;

-- ---------- Ders ↔ öğretmen ↔ sınıf atamaları ----------
create table teaching_assignments (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id),
  class_id uuid not null references classes(id) on delete cascade,
  course_id uuid not null references courses(id) on delete cascade,
  teacher_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (class_id, course_id, teacher_id)
);
create index assignments_teacher on teaching_assignments (teacher_id);
alter table teaching_assignments enable row level security;
create policy assign_read on teaching_assignments for select using (school_id = my_school() and is_approved());
create policy assign_admin on teaching_assignments for all using (is_admin() and school_id = my_school()) with check (is_admin() and school_id = my_school());
create trigger audit_assignments after insert or update or delete on teaching_assignments for each row execute function audit_row();

create or replace function assignments_check() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from classes where id = new.class_id and school_id = new.school_id)
     or not exists (select 1 from courses where id = new.course_id and school_id = new.school_id) then
    raise exception 'Sınıf ya da ders bulunamadı.' using errcode = '23503';
  end if;
  if not exists (select 1 from profiles p where p.id = new.teacher_id and p.school_id = new.school_id
                   and p.status = 'approved' and p.role in ('ogretmen', 'admin')) then
    raise exception 'Öğretmen okulun onaylı öğretmenlerinden biri olmalı.' using errcode = '22023';
  end if;
  return new;
end $$;
create trigger assignments_check before insert or update on teaching_assignments for each row execute function assignments_check();

-- Var olan eşleşmeler: ders programında öğretmeni seçilmiş dersler.
insert into teaching_assignments (school_id, class_id, course_id, teacher_id)
select distinct t.school_id, t.class_id, t.course_id, t.teacher_id from timetable t
join profiles p on p.id = t.teacher_id and p.status = 'approved'
where t.course_id is not null and t.teacher_id is not null
on conflict do nothing;

-- Programa öğretmenli ders girilince atama da oluşur (atama ekranı ile program tutarlı kalır).
create or replace function timetable_to_assignment() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.teacher_id is not null and new.course_id is not null then
    insert into teaching_assignments (school_id, class_id, course_id, teacher_id)
    values (new.school_id, new.class_id, new.course_id, new.teacher_id) on conflict do nothing;
  end if;
  return null;
end $$;
create trigger timetable_to_assignment after insert or update of teacher_id, course_id on timetable
  for each row execute function timetable_to_assignment();

-- Hesabı kapanan öğretmenin atamaları da düşer (0009'daki program temizliğine ek).
create or replace function profiles_closed_cleanup() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'rejected' and old.status = 'approved' then
    update timetable set teacher_id = null where teacher_id = new.id;
    delete from teaching_assignments where teacher_id = new.id;
  end if;
  return new;
end $$;

-- Öğretmenin sınıfları artık atamalardan da gelir (0010'daki tanımın genişlemesi).
create or replace function profile_classes(uid uuid) returns setof uuid
language sql stable security definer set search_path = public as $$
  select s.class_id from profiles p join students s on s.id = p.student_id
   where p.id = uid and p.role = 'ogrenci' and p.status = 'approved' and s.class_id is not null
  union
  select s.class_id from parent_links pl join profiles p on p.id = pl.parent_id join students s on s.id = pl.student_id
   where pl.parent_id = uid and p.status = 'approved' and s.class_id is not null
  union
  select c.id from classes c join profiles p on p.id = uid and p.status = 'approved' where c.homeroom_teacher_id = uid
  union
  select t.class_id from timetable t join profiles p on p.id = uid and p.status = 'approved' where t.teacher_id = uid
  union
  select a.class_id from teaching_assignments a join profiles p on p.id = uid and p.status = 'approved' where a.teacher_id = uid
$$;

-- Velinin yazışabileceği öğretmenler: ders adları atamalardan da gelir.
create or replace function child_contacts(p_student uuid)
returns table (id uuid, full_name text, branch text, role text, subjects text[], homeroom boolean)
language sql stable security definer set search_path = public as $$
  select p.id, p.full_name, p.branch, p.role::text,
         coalesce(array(select distinct x.n from (
             select t.subject n from timetable t join students s on s.class_id = t.class_id where s.id = p_student and t.teacher_id = p.id
             union select c.name from teaching_assignments a join courses c on c.id = a.course_id join students s on s.class_id = a.class_id
                   where s.id = p_student and a.teacher_id = p.id) x order by 1), '{}'),
         exists (select 1 from classes c join students s on s.class_id = c.id where s.id = p_student and c.homeroom_teacher_id = p.id)
  from profiles p
  where can_see_student(p_student)
    and p.school_id = my_school() and p.status = 'approved'
    and (p.role = 'admin' or (p.role = 'ogretmen' and (p.branch = 'Rehberlik' or teaches_student(p.id, p_student))))
  order by (p.role = 'admin'), p.full_name
$$;
