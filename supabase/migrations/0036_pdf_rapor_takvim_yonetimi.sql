-- Çoklu sınıfa takvim hedefleme ve okulun PDF hedeflerini yönetme.
alter table calendar_events add column class_ids uuid[] not null default '{}';
create policy cal_classes_insert on calendar_events as restrictive for insert with check (
  cardinality(class_ids)=0 or (target='sinif' and (is_staff() or class_ids <@ array(select my_classes())))
);
create policy cal_classes_update on calendar_events as restrictive for update with check (
  cardinality(class_ids)=0 or (target='sinif' and (is_staff() or class_ids <@ array(select my_classes())))
);
create or replace function calendar_before() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  new.title:=btrim(new.title);
  if cardinality(new.class_ids)>0 then
    if new.target<>'sinif' or new.class_id is distinct from new.class_ids[1] or exists(
      select 1 from unnest(new.class_ids) cid where cid is null or not exists(select 1 from classes c where c.id=cid and c.school_id=new.school_id and c.active)
    ) then raise exception 'Seçilen sınıflar etkinlik hedefiyle uyumlu değil.' using errcode='23503'; end if;
  end if;
  if (new.class_id is not null and not exists(select 1 from classes where id=new.class_id and school_id=new.school_id))
    or (new.student_id is not null and not exists(select 1 from students where id=new.student_id and school_id=new.school_id))
    or (new.teacher_id is not null and not exists(select 1 from profiles where id=new.teacher_id and school_id=new.school_id and role in ('ogretmen','admin'))) then
    raise exception 'Etkinliğin hedefi bulunamadı.' using errcode='23503';
  end if;
  return new;
end $$;
create or replace function event_reaches(uid uuid, e calendar_events, p_all boolean) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles p where p.id = uid and p.status = 'approved' and p.school_id = e.school_id and (
      (p_all and (p.role = 'admin' or (has_role(uid, 'ogretmen') and p.branch = 'Rehberlik') or e.created_by = uid))
      or exists (
        select 1 from profile_roles pr where pr.profile_id = uid
          and (case when pr.role in ('admin', 'ogretmen') then 'ogretmen' else pr.role::text end) = any(e.audience)
          and (e.target = 'okul'
            or (e.target = 'kademe' and exists (select 1 from classes c where c.id in (select role_classes(uid, pr.role)) and c.level = e.level))
            or (e.target = 'sinif' and exists(select 1 from role_classes(uid, pr.role) rc where rc = any(case when cardinality(e.class_ids)>0 then e.class_ids else array[e.class_id] end)))
            or (e.target = 'ogrenci' and (
                  (pr.role = 'ogrenci' and p.student_id = e.student_id)
               or (pr.role = 'veli' and exists (select 1 from parent_links pl where pl.parent_id = uid and pl.student_id = e.student_id))
               or (pr.role in ('ogretmen', 'admin') and teaches_student(uid, e.student_id))))))
      or (e.target = 'ogretmen' and e.teacher_id = uid)))
$$;


create or replace function update_pdf_outcome(p_id uuid,p_code text,p_title text,p_kind text) returns void
language plpgsql security definer set search_path=public as $$
declare o learning_outcomes;
begin
  if not is_admin() then raise exception 'Yönetici yetkisi ve iki adımlı doğrulama gerekir.' using errcode='42501'; end if;
  select l.* into o from learning_outcomes l join curriculum_versions v on v.id=l.curriculum_version_id where l.id=p_id and v.curriculum_type='PDF' and v.school_id=my_school() for update of l;
  if o.id is null then raise exception 'Yalnız okulun PDF hedefleri düzenlenebilir.' using errcode='42501'; end if;
  if length(btrim(coalesce(p_title,''))) not between 3 and 3000 or length(coalesce(p_code,''))>100 or p_kind is null or p_kind not in ('KAZANIM','OGRENME_CIKTISI') then raise exception 'Hedef adı, kodu veya türü uygun değil.' using errcode='22023'; end if;
  update learning_outcomes set code=nullif(btrim(p_code),''),title=btrim(p_title),outcome_type=p_kind where id=o.id;
  insert into audit_log(user_id,action,entity,entity_id,meta) values(auth.uid(),'pdf_outcome_update','learning_outcomes',o.id,jsonb_build_object('before',to_jsonb(o),'title',btrim(p_title),'kind',p_kind));
end $$;
revoke all on function update_pdf_outcome(uuid,text,text,text) from public,anon;
grant execute on function update_pdf_outcome(uuid,text,text,text) to authenticated;