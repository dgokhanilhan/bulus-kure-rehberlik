-- 0042: Gelecek yıl için açık, tek seferlik geçiş. Migration hiçbir yılı aktifleştirmez.
create table academic_year_archives (
 id uuid primary key default gen_random_uuid(), school_id uuid not null references schools(id),
 source_year_id uuid not null references academic_years(id), target_year_id uuid not null references academic_years(id),
 created_by uuid not null references profiles(id), created_at timestamptz not null default now(),
 counts jsonb not null, data jsonb not null,
 unique(school_id,source_year_id), unique(school_id,target_year_id)
);
alter table academic_year_archives enable row level security;
create policy year_archive_read on academic_year_archives for select to authenticated using(school_id=my_school() and is_admin());

-- Liste sabittir: kataloglar, okul ayarları, kullanıcılar, veli bağlantıları ve audit kayıtları sıfırlanmaz.
create function year_archive_filters(p_school uuid) returns jsonb language sql stable security definer set search_path=public as $$
 select jsonb_build_object(
 'students',format('school_id=%L and archived_at is null',p_school),'classes',format('school_id=%L',p_school),
 'profiles',format('school_id=%L',p_school),'courses',format('school_id=%L',p_school),
 'parent_links',format('student_id in (select id from students where school_id=%L)',p_school),
 'exams',format('school_id=%L',p_school),
 'exam_questions',format('exam_id in (select id from exams where school_id=%L)',p_school),
 'exam_items',format('exam_id in (select id from exams where school_id=%L)',p_school),
 'exam_results',format('exam_id in (select id from exams where school_id=%L)',p_school),
 'exam_imports',format('school_id=%L',p_school),
 'tasks',format('student_id in (select id from students where school_id=%L)',p_school),
 'meetings',format('student_id in (select id from students where school_id=%L)',p_school),
 'notes',format('student_id in (select id from students where school_id=%L)',p_school),
 'reports',format('student_id in (select id from students where school_id=%L)',p_school),
 'report_recipients',format('report_id in (select r.id from reports r join students s on s.id=r.student_id where s.school_id=%L)',p_school),
 'homework',format('school_id=%L',p_school),
 'homework_students',format('homework_id in (select id from homework where school_id=%L)',p_school),
 'attendance',format('school_id=%L',p_school),
 'attendance_alerts',format('student_id in (select id from students where school_id=%L)',p_school),
 'study_sessions',format('school_id=%L',p_school),'calendar_events',format('school_id=%L',p_school),
 'timetable',format('school_id=%L',p_school),'teaching_assignments',format('school_id=%L',p_school),
 'meals',format('school_id=%L',p_school),'announcements',format('school_id=%L',p_school),
 'conversations',format('school_id=%L',p_school),
 'messages',format('conversation_id in (select id from conversations where school_id=%L)',p_school),
 'attachments',format('school_id=%L',p_school),
 'notifications',format('user_id in (select id from profiles where school_id=%L)',p_school),
 'teacher_duties',format('school_id=%L',p_school),
 'gallery_albums',format('school_id=%L',p_school),'gallery_media',format('school_id=%L',p_school),
 'scholarship_exams',format('school_id=%L',p_school),'scholarship_applications',format('school_id=%L',p_school),
 'scholarship_sessions',format('school_id=%L',p_school),
 'scholarship_session_quotas',format('session_id in (select id from scholarship_sessions where school_id=%L)',p_school)
 )
$$;
revoke all on function year_archive_filters(uuid) from public,anon,authenticated;

create function preview_year_transition(p_target uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare sid uuid:=my_school(); old_y academic_years; new_y academic_years; k text; condition text; counts jsonb:='{}'; n bigint;
begin
 if not is_admin() then raise exception 'Yönetici ve iki adımlı doğrulama gerekir.' using errcode='42501'; end if;
 select * into old_y from academic_years where school_id=sid and is_active;
 select * into new_y from academic_years where school_id=sid and id=p_target;
 if old_y.id is null or new_y.id is null or new_y.starts<=old_y.ends or new_y.is_active then raise exception 'Yalnız mevcut dönemden sonraki yeni yıl başlatılabilir.' using errcode='22023'; end if;
 if exists(select 1 from academic_year_archives where school_id=sid and (source_year_id=old_y.id or target_year_id=new_y.id)) then raise exception 'Bu dönem geçişi daha önce yapıldı.' using errcode='22023'; end if;
 if exists(select 1 from students s left join classes c on c.id=s.class_id where s.school_id=sid and s.archived_at is null and (c.id is null or c.school_id<>sid)) then raise exception 'Sınıfı tanımlı olmayan öğrenciler var. Önce sınıflarını düzelt.' using errcode='22023'; end if;
 for k,condition in select * from jsonb_each_text(year_archive_filters(sid)) loop
  execute format('select count(*) from %I where %s',k,condition) into n;
  counts:=counts||jsonb_build_object(k,n);
 end loop;
 return jsonb_build_object('source',old_y.name,'target',new_y.name,'source_id',old_y.id,'target_id',new_y.id,'counts',counts,
 'graduates',(select count(*) from students s join classes c on c.id=s.class_id where s.school_id=sid and s.archived_at is null and c.grade in (8,12)),
 'promoted',(select count(*) from students s join classes c on c.id=s.class_id where s.school_id=sid and s.archived_at is null and c.grade not in (8,12)));
end $$;
revoke all on function preview_year_transition(uuid) from public,anon;
grant execute on function preview_year_transition(uuid) to authenticated;

create function start_next_academic_year(p_target uuid,p_confirm text) returns uuid language plpgsql security definer set search_path=public as $$
declare sid uuid:=my_school(); preview jsonb; snapshot jsonb:='{}'; rows jsonb; k text; condition text; rid uuid; s record; next_class uuid; target_name text;
begin
 if not is_admin() then raise exception 'Yönetici ve iki adımlı doğrulama gerekir.' using errcode='42501'; end if;
 perform 1 from schools where id=sid for update;
 lock table academic_years in share row exclusive mode;
 preview:=preview_year_transition(p_target);
 target_name:=preview->>'target';
 if p_confirm is distinct from target_name then raise exception 'Başlatılacak yılın adını aynen yaz.' using errcode='22023'; end if;
 -- Başlama tarihinden önce çalışan mevcut dönem asla sıfırlanmaz.
 if (now() at time zone 'Europe/Istanbul')::date < (select starts from academic_years where id=p_target) then raise exception 'Yeni dönemin başlangıç tarihi henüz gelmedi. Mevcut dönem korunuyor.' using errcode='22023'; end if;
 -- Aynı okulun kayıtlarına eşzamanlı yazmayı arşivleme sırasında engelle.
 lock table profiles,parent_links,courses,students,classes,exams,exam_results,exam_questions,exam_items,exam_imports,tasks,meetings,notes,reports,report_recipients,homework,homework_students,attendance,attendance_alerts,study_sessions,calendar_events,timetable,teaching_assignments,meals,announcements,conversations,messages,attachments,notifications,teacher_duties,gallery_albums,gallery_media,scholarship_exams,scholarship_applications,scholarship_sessions,scholarship_session_quotas in share row exclusive mode;
 preview:=preview_year_transition(p_target);
 for k,condition in select * from jsonb_each_text(year_archive_filters(sid)) loop
  execute format('select coalesce(jsonb_agg(to_jsonb(r)),''[]''::jsonb) from %I r where %s',k,condition) into rows;
  snapshot:=snapshot||jsonb_build_object(k,rows);
 end loop;
 insert into academic_year_archives(school_id,source_year_id,target_year_id,created_by,counts,data)
 values(sid,(preview->>'source_id')::uuid,p_target,auth.uid(),preview->'counts',snapshot) returning id into rid;
 -- Arşiv oluşmadan hiçbir aktif kayıt taşınmaz. Çocuk tablolar FK cascade ile arşivden sonra kaldırılır.
 for k in select unnest(array['reports','tasks','meetings','notes','attachments','homework','exam_imports','exams','attendance','attendance_alerts','study_sessions','calendar_events','timetable','teaching_assignments','meals','announcements','conversations','notifications','teacher_duties']) loop
  condition:=year_archive_filters(sid)->>k;
  execute format('delete from %I where %s',k,condition);
 end loop;
 perform set_config('bk.galeri','1',true);
 update gallery_albums set status='arsiv',archived_at=coalesce(archived_at,now()) where school_id=sid and status<>'arsiv';
 update scholarship_exams set active=false,applications_open=false where school_id=sid and academic_year_id is distinct from p_target;
 for s in select st.id,c.grade,c.section from students st join classes c on c.id=st.class_id where st.school_id=sid and st.archived_at is null order by st.id loop
  if s.grade in (8,12) then update students set archived_at=now() where id=s.id;
  else
   insert into classes(school_id,grade,section,academic_year_id,active) values(sid,s.grade+1,s.section,p_target,true)
   on conflict(school_id,grade,section) do update set academic_year_id=p_target,active=true returning id into next_class;
   update students set class_id=next_class,target_score=null where id=s.id;
  end if;
 end loop;
 -- Mezun aile hesapları yeni okul yılının verilerini görmez; çalışma rolleri ve diğer aktif çocukları olan veliler korunur.
 update profiles p set status='rejected'
 where p.school_id=sid and p.status='approved'
 and not exists(select 1 from profile_roles pr where pr.profile_id=p.id and pr.role in ('admin','ogretmen'))
 and (
  (has_role(p.id,'ogrenci') and exists(select 1 from students st where st.id=p.student_id and st.school_id=sid and st.archived_at is not null))
  or (has_role(p.id,'veli') and not exists(select 1 from parent_links pl join students st on st.id=pl.student_id where pl.parent_id=p.id and st.school_id=sid and st.archived_at is null))
 );
 update classes set homeroom_teacher_id=null,academic_year_id=p_target where school_id=sid;
 perform set_config('app.year_transition',p_target::text,true);
 update academic_years set is_active=true where id=p_target and school_id=sid;
 insert into audit_log(user_id,action,entity,entity_id,meta) values(auth.uid(),'year_transition','academic_years',p_target,preview||jsonb_build_object('archive_id',rid));
 return rid;
end $$;
revoke all on function start_next_academic_year(uuid,text) from public,anon;
grant execute on function start_next_academic_year(uuid,text) to authenticated;

-- Eski "Aktif yap" veya doğrudan API güncellemesi geçiş güvenliğini atlayamaz.
create or replace function academic_years_single_active() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if tg_op='UPDATE' and old.is_active and not new.is_active and coalesce(current_setting('app.year_transition',true),'')='' then raise exception 'Aktif dönem doğrudan kapatılamaz.' using errcode='42501'; end if;
 if new.is_active and exists(select 1 from academic_years where school_id=new.school_id and id<>new.id and is_active) and coalesce(current_setting('app.year_transition',true),'')<>new.id::text then
  raise exception 'Yeni dönemi önizleme ve onay adımıyla başlat.' using errcode='42501';
 end if;
 if new.is_active then update academic_years set is_active=false where school_id=new.school_id and id<>new.id and is_active; end if;
 return new;
end $$;
-- Arşivde şifreli kalan rehberlik alanları yalnız yetkili okul yöneticisine okunur.
create function read_academic_year_archive(p_archive uuid) returns jsonb language plpgsql stable security definer set search_path=public,extensions as $$
declare payload jsonb; r jsonb; readable jsonb;
begin
 if not is_admin() then raise exception 'Yönetici ve iki adımlı doğrulama gerekir.' using errcode='42501'; end if;
 select data into payload from academic_year_archives where id=p_archive and school_id=my_school();
 if payload is null then raise exception 'Arşiv bulunamadı.' using errcode='P0002'; end if;
 readable:='[]';
 for r in select value from jsonb_array_elements(payload->'notes') loop
  if nullif(r->>'body_enc','') is not null then r:=r||jsonb_build_object('body',extensions.pgp_sym_decrypt((r->>'body_enc')::bytea,notes_key())); end if;
  readable:=readable||jsonb_build_array(r-'body_enc');
 end loop;
 payload:=jsonb_set(payload,'{notes}',readable);
 readable:='[]';
 for r in select value from jsonb_array_elements(payload->'reports') loop
  if nullif(r->>'rehber_enc','') is not null then r:=r||jsonb_build_object('rehber',extensions.pgp_sym_decrypt((r->>'rehber_enc')::bytea,notes_key())); end if;
  readable:=readable||jsonb_build_array(r-'rehber_enc');
 end loop;
 return jsonb_set(payload,'{reports}',readable);
end $$;
revoke all on function read_academic_year_archive(uuid) from public,anon;
grant execute on function read_academic_year_archive(uuid) to authenticated;