-- 0041: Bu migration dönem geçişini ÇALIŞTIRMAZ; yalnız güvenli yönetim işlemlerini tanımlar.
alter table students drop constraint students_school_id_school_no_key;
create index students_school_no_search on students(school_id,school_no);
alter table homework_students drop constraint homework_students_status_check;
alter table homework_students add constraint homework_students_status_check check(status in ('bekliyor','yapti','yapmadi','getirmedi','eksik','gelmedi','izinli'));

create function pg_temp.patch_function(sig text, old_text text, new_text text) returns void language plpgsql as $$
declare def text;
begin
 def:=replace(pg_get_functiondef(sig::regprocedure),chr(13),'');
 if position(old_text in def)=0 then raise exception 'Beklenen fonksiyon metni yok: %',sig; end if;
 execute replace(def,old_text,new_text);
end $$;
select pg_temp.patch_function('set_homework_statuses(uuid,jsonb)', '''yapmadi'', ''eksik''', '''yapmadi'', ''getirmedi'', ''eksik''');
select pg_temp.patch_function('set_homework_statuses(uuid,jsonb)', 'when ''yapmadi'' then ''Yapmadı''', 'when ''yapmadi'' then ''Yapmadı'' when ''getirmedi'' then ''Getirmedi''');
select pg_temp.patch_function('import_students(jsonb,boolean)', $x$elsif v_no is not null and (v_no = any(seen_no) or exists (select 1 from students where school_id = school and school_no = v_no)) then
      errs := errs || jsonb_build_object('row', i, 'error', 'Okul no zaten kayıtlı: ' || v_no);
    $x$, '');

create or replace function is_admin() returns boolean language sql stable security definer set search_path=public as $$
 select has_role(auth.uid(),'admin') and coalesce(auth.jwt()->>'aal','aal1')='aal2'
$$;
alter function admin_add_role(uuid,user_role,jsonb) rename to admin_add_family_role;
revoke all on function admin_add_family_role(uuid,user_role,jsonb) from public,anon,authenticated;
create function admin_add_role(p_profile uuid,p_role user_role,p jsonb default '{}'::jsonb) returns void
language plpgsql security definer set search_path=public as $$
declare u profiles;
begin
 if p_role<>'admin' then perform admin_add_family_role(p_profile,p_role,p); return; end if;
 if not is_admin() then raise exception 'Yönetici ve iki adımlı doğrulama gerekir.' using errcode='42501'; end if;
 select * into u from profiles where id=p_profile and school_id=my_school() for update;
 if u.id is null or u.status<>'approved' then raise exception 'Okulun onaylı hesabı seçilmeli.' using errcode='42501'; end if;
 insert into profile_roles(profile_id,role,created_by) values(u.id,'admin',auth.uid());
 insert into audit_log(user_id,action,entity,entity_id,meta) values(auth.uid(),'role_add','profiles',u.id,jsonb_build_object('role','admin','mfa_required',true));
 perform notify_many(array[u.id],'Hesabına yönetici rolü eklendi. Mevcut e-posta/şifrenle giriş yapıp Authenticator kurulumu ve doğrulamasını tamamla.','{}'::jsonb);
end $$;
revoke all on function admin_add_role(uuid,user_role,jsonb) from public,anon;
grant execute on function admin_add_role(uuid,user_role,jsonb) to authenticated;
select pg_temp.patch_function('admin_remove_role(uuid,user_role)', $x$  if u.role = p_role then$x$, $x$  if p_role='admin' and u.id=auth.uid() then raise exception 'Kendi yönetici yetkini kaldıramazsın.' using errcode='42501'; end if;
  if u.role = p_role then$x$);
select pg_temp.patch_function('admin_accounts(uuid)', 'role = ''admin''', 'has_role(id,''admin'')');
select pg_temp.patch_function('staff_accounts(uuid)', 'role = ''admin''', 'has_role(id,''admin'')');
select pg_temp.patch_function('handle_new_user()', 'p.role = ''admin''', 'has_role(p.id,''admin'')');
select pg_temp.patch_function('child_contacts(uuid)', 'p.role = ''admin''', 'has_role(p.id,''admin'')');
select pg_temp.patch_function('my_conversations()', 'tp.role = ''admin''', 'has_role(tp.id,''admin'')');
select pg_temp.patch_function('start_conversation(uuid,uuid)', 'me.role = ''admin''', 'is_admin()');
select pg_temp.patch_function('assignments_check()', 'p.role = ''admin''', 'has_role(p.id,''admin'')');
select pg_temp.patch_function('classes_check_teacher()', 'p.role = ''admin''', 'has_role(p.id,''admin'')');
select pg_temp.patch_function('timetable_check_teacher()', 'p.role = ''admin''', 'has_role(p.id,''admin'')');
select pg_temp.patch_function('send_report(uuid,boolean,boolean,uuid[])', 'p.role = ''admin''', 'has_role(p.id,''admin'')');
select pg_temp.patch_function('calendar_before()', 'role in (''ogretmen'',''admin'')', '(has_role(id,''ogretmen'') or has_role(id,''admin''))');
select pg_temp.patch_function('gallery_sees(uuid,gallery_albums)', 'p.role = ''admin''', '(has_role(p.id,''admin'') and (uid is distinct from auth.uid() or is_admin()))');
select pg_temp.patch_function('event_reaches(uuid,calendar_events,boolean)', 'p.role = ''admin''', '(has_role(p.id,''admin'') and (uid is distinct from auth.uid() or is_admin()))');
-- Yönetici rolü kaldırma ve hesap kapatma RPC işlemleri okul kilidiyle sıralanır.
alter function admin_remove_role(uuid,user_role) rename to admin_remove_role_impl;
revoke all on function admin_remove_role_impl(uuid,user_role) from public,anon,authenticated;
create function admin_remove_role(p_profile uuid,p_role user_role) returns void language plpgsql security definer set search_path=public as $$
begin
 perform 1 from schools where id=my_school() for update;
 if not is_admin() then raise exception 'Yönetici ve iki adımlı doğrulama gerekir.' using errcode='42501'; end if;
 perform admin_remove_role_impl(p_profile,p_role);
end $$;
revoke all on function admin_remove_role(uuid,user_role) from public,anon;
grant execute on function admin_remove_role(uuid,user_role) to authenticated;
alter function set_user_active(uuid,boolean) rename to set_user_active_impl;
revoke all on function set_user_active_impl(uuid,boolean) from public,anon,authenticated;
create function set_user_active(p_profile uuid,p_active boolean) returns void language plpgsql security definer set search_path=public as $$
begin
 perform 1 from schools where id=my_school() for update;
 if not is_admin() then raise exception 'Yönetici ve iki adımlı doğrulama gerekir.' using errcode='42501'; end if;
 perform set_user_active_impl(p_profile,p_active);
end $$;
revoke all on function set_user_active(uuid,boolean) from public,anon;
grant execute on function set_user_active(uuid,boolean) to authenticated;
-- Yönetici rolü eklenen hesap, eski öğretmen/veli rolünü kullanarak MFA kilidini API'den atlayamaz.
create or replace function my_school() returns uuid language sql stable security definer set search_path=public as $$
 select p.school_id from profiles p where p.id=auth.uid() and p.status='approved'
 and (not has_role(p.id,'admin') or coalesce(auth.jwt()->>'aal','aal1')='aal2')
$$;
create or replace function is_staff() returns boolean language sql stable security definer set search_path=public as $$
 select my_school() is not null and (is_admin() or (has_role(auth.uid(),'ogretmen') and exists(select 1 from profiles where id=auth.uid() and branch='Rehberlik')))
$$;
create or replace function is_teacher() returns boolean language sql stable security definer set search_path=public as $$
 select my_school() is not null and (is_staff() or has_role(auth.uid(),'ogretmen'))
$$;
create or replace function is_parent_of(sid uuid) returns boolean language sql stable security definer set search_path=public as $$
 select my_school() is not null and exists(select 1 from parent_links pl join profiles p on p.id=pl.parent_id where pl.parent_id=auth.uid() and pl.student_id=sid and p.status='approved')
$$;
create or replace function is_student_self(sid uuid) returns boolean language sql stable security definer set search_path=public as $$
 select my_school() is not null and exists(select 1 from profiles where id=auth.uid() and status='approved' and role='ogrenci' and student_id=sid)
$$;
create policy notifications_mfa on notifications as restrictive for all to authenticated using(my_school() is not null) with check(my_school() is not null);
select pg_temp.patch_function('gallery_sees(uuid,gallery_albums)', 'select exists (', 'select (not has_role(uid,''admin'') or uid is distinct from auth.uid() or coalesce(auth.jwt()->>''aal'',''aal1'')=''aal2'') and exists (');
select pg_temp.patch_function('event_reaches(uuid,calendar_events,boolean)', 'select exists (', 'select (not has_role(uid,''admin'') or uid is distinct from auth.uid() or coalesce(auth.jwt()->>''aal'',''aal1'')=''aal2'') and exists (');
select pg_temp.patch_function('announcement_reaches(uuid,announcements)', 'select exists (', 'select (not has_role(uid,''admin'') or uid is distinct from auth.uid() or coalesce(auth.jwt()->>''aal'',''aal1'')=''aal2'') and exists (');