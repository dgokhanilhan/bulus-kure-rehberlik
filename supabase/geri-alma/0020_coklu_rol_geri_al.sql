-- 0020_coklu_rol GERİ ALMA (yalnız gerekirse, elle çalıştırılır; migration değildir, db push bunu uygulamaz).
-- Fonksiyonları 0019 sonrasındaki hallerine döndürür, yönetici rol fonksiyonlarını kaldırır.
-- profile_roles tablosu ve içindeki satırlar SİLİNMEZ (veri kaybı olmasın); eski fonksiyonlar bu tabloya bakmaz.
-- Ön yüz de 0020 öncesi sürüme (main'de bu PR'dan önceki commit) döndürülmelidir.
begin;

create or replace function is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select is_admin() or exists(select 1 from profiles where id = auth.uid() and status='approved' and role='ogretmen' and branch='Rehberlik')
$$;
create or replace function is_teacher() returns boolean
language sql stable security definer set search_path = public as $$
  select is_staff() or exists(select 1 from profiles where id = auth.uid() and status='approved' and role='ogretmen')
$$;
create or replace function teaches_student(uid uuid, sid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from students s where s.id = sid and s.class_id in (select profile_classes(uid)))
$$;
alter policy profiles_teacher_names on profiles using (
  is_teacher() and school_id = my_school() and role = any (array['admin'::user_role, 'ogretmen'::user_role]) and status = 'approved'
);

-- announcement_reaches
CREATE OR REPLACE FUNCTION public.announcement_reaches(uid uuid, a announcements)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from profiles p where p.id = uid and p.status = 'approved' and p.school_id = a.school_id
      and (case when p.role in ('admin', 'ogretmen') then 'ogretmen' else p.role::text end) = any(a.audience)
      and (a.scope = 'okul'
        or (p.role = 'admin')
        or (a.scope = 'kademe' and exists (select 1 from classes c where c.id in (select profile_classes(uid)) and c.level = a.level))
        or (a.scope = 'sinif' and a.class_id in (select profile_classes(uid)))))
$function$;

-- event_reaches
CREATE OR REPLACE FUNCTION public.event_reaches(uid uuid, e calendar_events, p_all boolean)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;

-- child_contacts
CREATE OR REPLACE FUNCTION public.child_contacts(p_student uuid)
 RETURNS TABLE(id uuid, full_name text, branch text, role text, subjects text[], homeroom boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;

-- start_conversation
CREATE OR REPLACE FUNCTION public.start_conversation(p_student uuid, p_other uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare me profiles; v_parent uuid; v_teacher uuid; v_id uuid; s students;
begin
  select * into me from profiles where id = auth.uid() and status = 'approved';
  select * into s from students where id = p_student and school_id = me.school_id;
  if me.id is null or s.id is null then raise exception 'Öğrenci bulunamadı.' using errcode = 'P0002'; end if;
  if me.role = 'veli' then
    if not is_parent_of(p_student) then raise exception 'Yalnız kendi çocuğun için yazabilirsin.' using errcode = '42501'; end if;
    if not exists (select 1 from child_contacts(p_student) c where c.id = p_other) then
      raise exception 'Bu kişiye yazamazsın: çocuğunun öğretmenlerinden biri değil.' using errcode = '42501';
    end if;
    v_parent := me.id; v_teacher := p_other;
  elsif me.role in ('ogretmen', 'admin') then
    if not exists (select 1 from student_parents(p_student) sp where sp.id = p_other) then
      raise exception 'Bu veliye yazamazsın: öğrenci senin sınıflarından birinde değil ya da veli bağlı değil.' using errcode = '42501';
    end if;
    v_parent := p_other; v_teacher := me.id;
  else
    raise exception 'Mesajlaşma veli ve öğretmenler içindir.' using errcode = '42501';
  end if;
  insert into conversations (school_id, student_id, parent_id, teacher_id)
  values (me.school_id, p_student, v_parent, v_teacher)
  on conflict (student_id, parent_id, teacher_id) do update set last_at = conversations.last_at
  returning id into v_id;
  return v_id;
end $function$;

-- assignments_check
CREATE OR REPLACE FUNCTION public.assignments_check()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
end $function$;

-- classes_check_teacher
CREATE OR REPLACE FUNCTION public.classes_check_teacher()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.homeroom_teacher_id is not null and not exists (
      select 1 from profiles p where p.id = new.homeroom_teacher_id and p.school_id = new.school_id
        and p.status = 'approved' and p.role in ('ogretmen', 'admin')) then
    raise exception 'Sınıf öğretmeni okulun onaylı öğretmenlerinden biri olmalı.' using errcode = '22023';
  end if;
  return new;
end $function$;

-- timetable_check_teacher
CREATE OR REPLACE FUNCTION public.timetable_check_teacher()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  new.subject := btrim(new.subject);
  if new.teacher_id is not null and not exists (
      select 1 from profiles p where p.id = new.teacher_id and p.school_id = new.school_id
        and p.status = 'approved' and p.role in ('ogretmen', 'admin')) then
    raise exception 'Dersin öğretmeni okulun onaylı öğretmenlerinden biri olmalı.' using errcode = '22023';
  end if;
  return new;
end $function$;

-- calendar_before
CREATE OR REPLACE FUNCTION public.calendar_before()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  new.title := btrim(new.title);
  if (new.class_id is not null and not exists (select 1 from classes where id = new.class_id and school_id = new.school_id))
     or (new.student_id is not null and not exists (select 1 from students where id = new.student_id and school_id = new.school_id))
     or (new.teacher_id is not null and not exists (select 1 from profiles where id = new.teacher_id and school_id = new.school_id and role in ('ogretmen', 'admin'))) then
    raise exception 'Etkinliğin hedefi bulunamadı.' using errcode = '23503';
  end if;
  return new;
end $function$;

-- send_report
CREATE OR REPLACE FUNCTION public.send_report(p_report uuid, p_parent boolean DEFAULT false, p_student boolean DEFAULT false, p_users uuid[] DEFAULT '{}'::uuid[])
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  r reports;
  s students;
  e exams;
  me profiles;
  to_ids uuid[] := '{}';
begin
  if not is_staff() then raise exception 'Rapor göndermek için rehberlik veya yönetici yetkisi gerekir' using errcode = '42501'; end if;
  select * into r from reports where id = p_report for update;
  if r.id is null or not can_see_student(r.student_id) then raise exception 'Rapor bulunamadı.' using errcode = 'P0002'; end if;
  select * into s from students where id = r.student_id;
  select * into e from exams where id = r.exam_id;
  select * into me from profiles where id = auth.uid();

  if r.type = 'veli' then
    if not (p_parent or p_student) then raise exception 'En az bir alıcı seç.' using errcode = '22023'; end if;
    update reports set status = 'sent', sent_at = now(), sent_to_parent = p_parent, sent_to_student = p_student where id = r.id;
    to_ids := case when p_parent then array(select parent_accounts(s.id)) else '{}' end
           || case when p_student then array(select student_accounts(s.id)) else '{}' end;
    perform notify_many(to_ids, e.name || ' gelişim raporu geldi: ' || s.full_name, jsonb_build_object('report', r.id));
  else
    if coalesce(array_length(p_users, 1), 0) = 0 then raise exception 'En az bir öğretmen seç.' using errcode = '22023'; end if;
    if exists (select 1 from unnest(p_users) u where not exists (
        select 1 from profiles p where p.id = u and p.school_id = s.school_id and p.status = 'approved' and p.role in ('ogretmen','admin'))) then
      raise exception 'Alıcı yalnız okulun onaylı öğretmenleri olabilir.' using errcode = '22023';
    end if;
    update reports set status = 'sent', sent_at = now() where id = r.id;
    delete from report_recipients where report_id = r.id;
    insert into report_recipients (report_id, user_id) select r.id, u from unnest(p_users) u on conflict do nothing;
    to_ids := p_users;
    perform notify_many(to_ids, coalesce(me.full_name, 'Rehberlik') || ' öğretmen raporu paylaştı: ' || s.full_name || ' · ' || e.name, jsonb_build_object('report', r.id));
  end if;
  insert into audit_log (user_id, action, entity, entity_id, meta)
  values (auth.uid(), 'send_report', 'reports', r.id, jsonb_build_object('type', r.type, 'recipients', coalesce(array_length(to_ids, 1), 0)));
  return coalesce(array_length(to_ids, 1), 0);
end $function$;

-- notes_after_insert
CREATE OR REPLACE FUNCTION public.notes_after_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare s students; a profiles;
begin
  select * into s from students where id = new.student_id;
  select * into a from profiles where id = new.author_id;
  if new.visibility = 'veli' then
    perform notify_many(array(select parent_accounts(s.id)), 'Öğretmen notu: ' || left(new.body, 80), '{"page":"ozet"}');
  end if;
  if a.role = 'ogretmen' and coalesce(a.branch, '') <> 'Rehberlik' then
    perform notify_many(array(select staff_accounts(s.school_id)), a.full_name || ' not ekledi: ' || s.full_name,
      jsonb_build_object('page', 'ogrenci', 'sid', s.id, 'tab', 'notlar'));
  end if;
  return new;
end $function$;

-- staff_accounts
CREATE OR REPLACE FUNCTION public.staff_accounts(school uuid)
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ select id from profiles where school_id = school and status = 'approved' and (role = 'admin' or (role = 'ogretmen' and branch = 'Rehberlik')) $function$;

-- admin_update_profile
CREATE OR REPLACE FUNCTION public.admin_update_profile(p_profile uuid, p_full_name text, p_branch text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
end $function$;

drop function if exists admin_add_role(uuid, user_role, jsonb);
drop function if exists admin_remove_role(uuid, user_role);
drop trigger if exists profiles_roles_sync on profiles;

commit;
