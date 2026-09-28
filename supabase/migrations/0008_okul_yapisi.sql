-- Okul yapısı: kademe (ilkokul / ortaokul / lise), sınıflar tablosu, genişleyen branş listesi, yönetim işlemleri.
-- Sistem yalnız 8. sınıflar için kurulmuştu; öğrencinin şubesi students.class_name metniydi ('8/A').
-- Artık sınıflar yönetimce elle açılır; öğrenci bir sınıfa bağlanır (students.class_id). class_name
-- geriye dönük uyum için kalır ve trigger ile sınıfın adından doldurulur (deneme analizi ona bakar).

-- ---------- Sınıflar ----------
create table classes (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id),
  grade smallint not null check (grade between 1 and 12),
  section text not null check (section ~ '^[A-ZÇĞİÖŞÜ]$'),
  name text generated always as (grade::text || '/' || section) stored,
  -- Kademe sınıf düzeyinden çıkar: 1–4 ilkokul, 5–8 ortaokul, 9–12 lise.
  level text generated always as (case when grade <= 4 then 'ilkokul' when grade <= 8 then 'ortaokul' else 'lise' end) stored,
  homeroom_teacher_id uuid references profiles(id) on delete set null,   -- sınıf öğretmeni / rehber öğretmeni
  created_at timestamptz not null default now(),
  unique (school_id, grade, section)
);
create index classes_school on classes (school_id, grade, section);
alter table classes enable row level security;

create policy classes_read on classes for select using (school_id = my_school());
create policy classes_admin on classes for all
  using (is_admin() and school_id = my_school())
  with check (is_admin() and school_id = my_school());

-- Sınıf öğretmeni aynı okulun onaylı öğretmeni ya da yöneticisi olmalı.
create or replace function classes_check_teacher() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.homeroom_teacher_id is not null and not exists (
      select 1 from profiles p where p.id = new.homeroom_teacher_id and p.school_id = new.school_id
        and p.status = 'approved' and p.role in ('ogretmen', 'admin')) then
    raise exception 'Sınıf öğretmeni okulun onaylı öğretmenlerinden biri olmalı.' using errcode = '22023';
  end if;
  return new;
end $$;
create trigger classes_check_teacher before insert or update of homeroom_teacher_id on classes
  for each row execute function classes_check_teacher();

-- ---------- Öğrenci ↔ sınıf ----------
alter table students add column class_id uuid references classes(id) on delete restrict;
create index students_class on students (class_id);

-- Var olan şubelerden sınıfları aç ve öğrencileri bağla (ör. 8/A, 8/B, 8/C).
insert into classes (school_id, grade, section)
select distinct school_id, split_part(class_name, '/', 1)::smallint, split_part(class_name, '/', 2)
from (select school_id, class_name from students union select school_id, class_name from study_sessions) x
where class_name ~ '^(1[0-2]|[1-9])/[A-ZÇĞİÖŞÜ]$'
on conflict do nothing;
update students s set class_id = c.id from classes c where c.school_id = s.school_id and c.name = s.class_name;

-- class_id verilirse class_name sınıfın adından yazılır; yalnız class_name verilirse (eski kod yolları:
-- deneme yayınlama, kayıt onayı) sınıf adından bulunur. Sınıf yoksa kayıt reddedilir (sınıfı yönetim açar).
create or replace function students_sync_class() returns trigger
language plpgsql security definer set search_path = public as $$
declare c classes;
begin
  if new.class_id is not null and (tg_op = 'INSERT' or new.class_id is distinct from old.class_id) then
    select * into c from classes where id = new.class_id and school_id = new.school_id;
    if c.id is null then raise exception 'Sınıf bulunamadı.' using errcode = '23503'; end if;
    new.class_name := c.name;
  elsif tg_op = 'INSERT' or new.class_name is distinct from old.class_name then
    select * into c from classes where school_id = new.school_id and name = new.class_name;
    if c.id is null then
      raise exception 'Sınıf bulunamadı: %. Önce Yönetim → Sınıflar''dan sınıfı aç.', new.class_name using errcode = '23503';
    end if;
    new.class_id := c.id;
  end if;
  return new;
end $$;
create trigger students_sync_class before insert or update of class_id, class_name on students
  for each row execute function students_sync_class();

-- Sınıfın adı değişirse (ör. 8/C → 8/D) öğrencilerin ve etütlerin şube metni de değişir.
create or replace function classes_after_rename() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.name <> old.name then
    update students set class_name = new.name where class_id = new.id;
    update study_sessions set class_name = new.name where school_id = new.school_id and class_name = old.name;
  end if;
  return new;
end $$;
create trigger classes_after_rename after update of grade, section on classes
  for each row execute function classes_after_rename();

-- Kayıt formu için sınıf listesi (giriş yapmamış kullanıcı yalnız sınıf adlarını görür).
create or replace function signup_classes(p_school text)
returns table (name text, grade smallint, level text)
language sql stable security definer set search_path = public as $$
  select c.name, c.grade, c.level from classes c join schools s on s.id = c.school_id
  where s.slug = p_school order by c.grade, c.section
$$;
revoke all on function signup_classes(text) from public;
grant execute on function signup_classes(text) to anon, authenticated;

-- ---------- Branşlar ----------
create or replace function valid_branches() returns text[] language sql immutable as $$
  select array['Sınıf Öğretmeni','Okul Öncesi','Türkçe','Türk Dili ve Edebiyatı','Matematik','Fen Bilimleri','Fizik','Kimya',
    'Biyoloji','Sosyal Bilgiler','T.C. İnkılap Tarihi','Tarih','Coğrafya','Felsefe','Din Kültürü','İngilizce','Almanca',
    'Beden Eğitimi','Müzik','Görsel Sanatlar','Bilişim Teknolojileri','Rehberlik']
$$;

-- Kayıt trigger'ı (0002): branş listesi ve şube kuralı genişler; beyan edilen sınıf okulda açılmış olmalı.
do $$
declare src text;
begin
  select pg_get_functiondef('handle_new_user()'::regprocedure) into src;
  src := replace(src,
    'v_branch not in (''Türkçe'',''Matematik'',''Fen Bilimleri'',''T.C. İnkılap Tarihi'',''Din Kültürü'',''İngilizce'',''Rehberlik'')',
    'not (v_branch = any(valid_branches()))');
  src := replace(src,
    'if v_class !~ ''^8/[A-Z]$'' then',
    'if not exists (select 1 from classes c where c.school_id = v_school and c.name = v_class) then');
  if position('valid_branches()' in src) = 0 or position('^8/' in src) > 0 then
    raise exception 'handle_new_user güncellenemedi';
  end if;
  execute src;
end $$;

-- ---------- Yönetim işlemleri (yalnız admin, aal2) ----------
-- Profil düzenleme: ad soyad ve (öğretmende) branş.
create or replace function admin_update_profile(p_profile uuid, p_full_name text, p_branch text default null)
returns void language plpgsql security definer set search_path = public as $$
declare p profiles; v_name text := btrim(coalesce(p_full_name, ''));
begin
  if not is_admin() then raise exception 'Bu işlem için yönetici yetkisi ve iki adımlı doğrulama gerekir' using errcode = '42501'; end if;
  select * into p from profiles where id = p_profile and school_id = my_school() for update;
  if p.id is null then raise exception 'Kullanıcı bulunamadı.' using errcode = 'P0002'; end if;
  if length(v_name) < 3 or length(v_name) > 80 then raise exception 'Ad soyad geçersiz.' using errcode = '22023'; end if;
  if p.role = 'ogretmen' and not (coalesce(p_branch, '') = any(valid_branches())) then
    raise exception 'Branş geçersiz.' using errcode = '22023';
  end if;
  update profiles set full_name = v_name, branch = case when p.role = 'ogretmen' then p_branch else branch end where id = p.id;
  insert into audit_log (user_id, action, entity, entity_id, meta)
  values (auth.uid(), 'update', 'profiles', p.id, jsonb_build_object('role', p.role));
end $$;

-- Hesabı kapat / yeniden aç. Kapatılan kullanıcı giriş yapar ama uygulamaya erişemez (status = rejected);
-- sınıf öğretmenliği boşalır. Yönetici kendi hesabını kapatamaz.
create or replace function set_user_active(p_profile uuid, p_active boolean)
returns void language plpgsql security definer set search_path = public as $$
declare p profiles;
begin
  if not is_admin() then raise exception 'Bu işlem için yönetici yetkisi ve iki adımlı doğrulama gerekir' using errcode = '42501'; end if;
  if p_profile = auth.uid() then raise exception 'Kendi hesabını kapatamazsın.' using errcode = '22023'; end if;
  select * into p from profiles where id = p_profile and school_id = my_school() for update;
  if p.id is null then raise exception 'Kullanıcı bulunamadı.' using errcode = 'P0002'; end if;
  if p_active then
    if p.status <> 'rejected' then raise exception 'Hesap zaten açık.' using errcode = '22023'; end if;
    if p.role = 'ogrenci' and p.student_id is null then
      raise exception 'Öğrenci hesabı bir öğrenci kaydına bağlı değil; Onaylar ekranından yeniden kayıt gerekir.' using errcode = '22023';
    end if;
    update profiles set status = 'approved', approved_by = auth.uid(), approved_at = now() where id = p.id;
  else
    if p.status <> 'approved' then raise exception 'Yalnız açık hesaplar kapatılabilir.' using errcode = '22023'; end if;
    update profiles set status = 'rejected' where id = p.id;
    update classes set homeroom_teacher_id = null where homeroom_teacher_id = p.id;
  end if;
  insert into audit_log (user_id, action, entity, entity_id, meta)
  values (auth.uid(), case when p_active then 'activate' else 'deactivate' end, 'profiles', p.id, jsonb_build_object('role', p.role));
end $$;

-- Sınıf silme: içinde öğrenci varsa silinmez (önce öğrenciler başka sınıfa taşınır ya da silinir).
create or replace function delete_class(p_class uuid)
returns void language plpgsql security definer set search_path = public as $$
declare c classes; n int;
begin
  if not is_admin() then raise exception 'Bu işlem için yönetici yetkisi ve iki adımlı doğrulama gerekir' using errcode = '42501'; end if;
  select * into c from classes where id = p_class and school_id = my_school() for update;
  if c.id is null then raise exception 'Sınıf bulunamadı.' using errcode = 'P0002'; end if;
  select count(*) into n from students where class_id = c.id;
  if n > 0 then
    raise exception '% sınıfında % öğrenci var; önce öğrencileri başka sınıfa taşı ya da sil.', c.name, n using errcode = '23503';
  end if;
  delete from classes where id = c.id;
  insert into audit_log (user_id, action, entity, entity_id, meta)
  values (auth.uid(), 'delete', 'classes', c.id, jsonb_build_object('name', c.name));
end $$;

revoke all on function admin_update_profile(uuid, text, text) from public, anon;
revoke all on function set_user_active(uuid, boolean) from public, anon;
revoke all on function delete_class(uuid) from public, anon;
grant execute on function admin_update_profile(uuid, text, text) to authenticated;
grant execute on function set_user_active(uuid, boolean) to authenticated;
grant execute on function delete_class(uuid) to authenticated;
