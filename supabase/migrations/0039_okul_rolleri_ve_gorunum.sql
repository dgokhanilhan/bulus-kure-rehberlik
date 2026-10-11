-- Özel okul rolleri mevcut hesap rollerine eklenir; mevcut RLS yetkileri değişmez.
create table school_roles (
 id uuid primary key default gen_random_uuid(), school_id uuid not null references schools(id),
 name text not null check(length(btrim(name)) between 2 and 60),
 permissions text[] not null default '{}' check(permissions <@ array['overview','students','exams','attendance','calendar']::text[]),
 unique(school_id,name), unique(id,school_id)
);
create table school_role_members (
 role_id uuid not null, school_id uuid not null references schools(id),
 profile_id uuid not null references profiles(id) on delete cascade,
 primary key(role_id,profile_id), foreign key(role_id,school_id) references school_roles(id,school_id) on delete cascade
);
create index school_role_members_profile on school_role_members(profile_id,school_id);
alter table school_roles enable row level security;
alter table school_role_members enable row level security;
create policy roles_read on school_roles for select to authenticated using(school_id=my_school() and (is_admin() or exists(select 1 from school_role_members m where m.role_id=id and m.profile_id=auth.uid())));
create policy members_read on school_role_members for select to authenticated using(school_id=my_school() and (is_admin() or profile_id=auth.uid()));

create function manage_school_role(p_id uuid,p_name text,p_permissions text[],p_members uuid[]) returns uuid
language plpgsql security definer set search_path=public as $$
declare rid uuid:=p_id; sid uuid:=my_school();
begin
 if not is_admin() then raise exception 'Yönetici ve iki adımlı doğrulama gerekir.' using errcode='42501'; end if;
 if p_name is null or length(btrim(p_name)) not between 2 and 60 or p_permissions is null or not(p_permissions <@ array['overview','students','exams','attendance','calendar']::text[]) or p_members is null then raise exception 'Rol bilgileri geçersiz.' using errcode='22023'; end if;
 if exists(select 1 from unnest(p_members) u where not exists(select 1 from profiles p where p.id=u and p.school_id=sid and p.status='approved' and (p.role='admin' or exists(select 1 from profile_roles pr where pr.profile_id=p.id and pr.role='ogretmen')))) then raise exception 'Yalnız okulun onaylı yönetici/öğretmen hesapları seçilebilir.' using errcode='42501'; end if;
 if rid is null then insert into school_roles(school_id,name,permissions) values(sid,btrim(p_name),p_permissions) returning id into rid;
 else update school_roles set name=btrim(p_name),permissions=p_permissions where id=rid and school_id=sid;
 if not found then raise exception 'Rol bulunamadı.' using errcode='42501'; end if; end if;
 delete from school_role_members where role_id=rid and school_id=sid;
 insert into school_role_members(role_id,school_id,profile_id) select rid,sid,x from (select distinct unnest(p_members) x) q;
 insert into audit_log(user_id,action,entity,entity_id,meta) values(auth.uid(),'update','school_roles',rid,jsonb_build_object('name',btrim(p_name),'permissions',p_permissions,'members',p_members));
 return rid;
end $$;
create function school_role_overview() returns jsonb language plpgsql stable security definer set search_path=public as $$
declare sid uuid:=my_school(); perms text[]; result jsonb:='{}';
begin
 if sid is null then raise exception 'Onaylı oturum gerekir.' using errcode='42501'; end if;
 select array_agg(distinct x) into perms from school_role_members m join school_roles r on r.id=m.role_id and r.school_id=m.school_id cross join unnest(r.permissions) x where m.profile_id=auth.uid() and m.school_id=sid;
 if is_admin() then perms:=array['overview','students','exams','attendance','calendar']; end if;
 if coalesce(cardinality(perms),0)=0 then raise exception 'Okul rolü yetkisi yok.' using errcode='42501'; end if;
 if 'overview'=any(perms) then result:=result||jsonb_build_object('overview',jsonb_build_object('students',(select count(*) from students where school_id=sid and archived_at is null),'classes',(select count(*) from classes where school_id=sid and active),'teachers',(select count(*) from profiles p where p.school_id=sid and p.status='approved' and (p.role='ogretmen' or exists(select 1 from profile_roles pr where pr.profile_id=p.id and pr.role='ogretmen'))))); end if;
 if 'students'=any(perms) then result:=result||jsonb_build_object('students',coalesce((select jsonb_agg(jsonb_build_object('name',full_name,'class',class_name,'schoolNo',school_no) order by class_name,full_name) from students where school_id=sid and archived_at is null),'[]'::jsonb)); end if;
 if 'exams'=any(perms) and module_enabled('lgs') then result:=result||jsonb_build_object('exams',coalesce((select jsonb_agg(jsonb_build_object('name',name,'date',exam_date) order by exam_date desc) from exams where school_id=sid),'[]'::jsonb)); end if;
 if 'attendance'=any(perms) and module_enabled('yoklama') then result:=result||jsonb_build_object('attendance',coalesce((select jsonb_agg(to_jsonb(q)) from (select day,status,count(*) as count from attendance where school_id=sid and day>=current_date-30 group by day,status order by day desc) q),'[]'::jsonb)); end if;
 if 'calendar'=any(perms) and module_enabled('takvim') then result:=result||jsonb_build_object('calendar',coalesce((select jsonb_agg(jsonb_build_object('title',title,'date',starts_on) order by starts_on) from calendar_events where school_id=sid and starts_on>=current_date-1),'[]'::jsonb)); end if;
 return result;
end $$;
revoke all on function manage_school_role(uuid,text,text[],uuid[]),school_role_overview() from public,anon;
grant execute on function manage_school_role(uuid,text,text[],uuid[]),school_role_overview() to authenticated;

-- Yeni ayarlar mevcut tür/sınır denetimli ve MFA korumalı set_settings üzerinden yazılır.
alter function setting_spec() rename to setting_spec_before_0039;
create function setting_spec() returns jsonb language sql immutable as $$ select setting_spec_before_0039() || '{
 "genel.alt_baslik":{"type":"text","max":120,"default":"Rehberlik & Mentörlük"},
 "gorunum.tema":{"type":"enum","values":["auto","light","dark"],"default":"auto"},
 "gorunum.vurgu":{"type":"enum","values":["yesil","mavi","mor"],"default":"yesil"},
 "gorunum.yazi":{"type":"enum","values":["normal","buyuk"],"default":"normal"},
 "gorunum.yogunluk":{"type":"enum","values":["normal","rahat"],"default":"normal"},
 "gorunum.baslik":{"type":"enum","values":["renkli","kalin"],"default":"renkli"},
 "gorunum.kose":{"type":"enum","values":["normal","yuvarlak","duz"],"default":"normal"},
 "gorunum.hareket":{"type":"bool","default":true},
 "okul.karsilama":{"type":"text","max":250,"default":""}
 }'::jsonb $$;
