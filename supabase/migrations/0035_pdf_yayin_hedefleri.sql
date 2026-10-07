-- PDF hedefleri resmî programdan ayrı, okul + yayıncı kapsamında tutulur.
alter table curriculum_versions add column school_id uuid references schools(id);
alter table curriculum_versions add column publisher_id uuid references publishers(id);
alter table curriculum_versions drop constraint curriculum_versions_curriculum_type_check;
alter table curriculum_versions add constraint curriculum_versions_curriculum_type_check check (curriculum_type in ('LEGACY','TYMM','PDF'));
alter table curriculum_versions add constraint curriculum_pdf_scope check ((curriculum_type='PDF' and school_id is not null) or (curriculum_type<>'PDF' and school_id is null and publisher_id is null));
do $$ declare constraint_name text; begin
  select conname into constraint_name from pg_constraint where conrelid='curriculum_versions'::regclass and contype='u' and pg_get_constraintdef(oid)='UNIQUE (curriculum_type, grade, subject_code, year_from)';
  if constraint_name is not null then execute format('alter table curriculum_versions drop constraint %I',constraint_name); end if;
end $$;
create unique index curriculum_official_uq on curriculum_versions(curriculum_type,grade,subject_code,year_from) where school_id is null;
create unique index curriculum_pdf_uq on curriculum_versions(school_id,coalesce(publisher_id,'00000000-0000-0000-0000-000000000000'::uuid),grade,subject_code) where curriculum_type='PDF';
drop policy curriculum_read on curriculum_versions;
create policy curriculum_read on curriculum_versions for select using(is_approved() and (school_id is null or school_id=my_school()));
drop policy outcomes2_read on learning_outcomes;
create policy outcomes2_read on learning_outcomes for select using(is_approved() and exists(select 1 from curriculum_versions v where v.id=curriculum_version_id and (v.school_id is null or v.school_id=my_school())));

create or replace function curriculum_for(p_grade smallint,p_subject text,p_year smallint) returns uuid language sql stable as $$
  select id from curriculum_versions where school_id is null and grade=p_grade and subject_code=p_subject and active and year_from<=p_year and (year_to is null or year_to>=p_year) order by year_from desc limit 1
$$;
create or replace function cohort_versions(p_content_grades smallint[],p_student_grade smallint,p_subject text,p_year smallint) returns uuid[] language sql stable as $$
  select coalesce(array_agg(id order by ord) filter(where id is not null),'{}') from (
    select curriculum_for(g::smallint,p_subject,cohort_year(p_year,p_student_grade,g::smallint)) id, ord from unnest(p_content_grades) with ordinality as grades(g,ord)
    union all select id, 1000::bigint from curriculum_versions where curriculum_type='PDF' and school_id=my_school() and grade=any(p_content_grades) and subject_code=p_subject and active
  ) v
$$;

-- Eşleme çekirdeği ve elle eşleme aşağıda aynı okul/yayıncı sınırıyla güncellenir.
create or replace function resolve_outcome_in(
  p_subject text, p_vers uuid[], p_code text, p_text text,
  p_school uuid default null, p_publisher uuid default null, p_format uuid default null
) returns table (learning_outcome_id uuid, method text, confidence numeric, curriculum_version_id uuid, outcome_grade smallint)
language plpgsql stable security definer set search_path = public as $$
declare
  vers uuid[] := array(select v.id from curriculum_versions v where v.id=any(p_vers) and (v.school_id is null or (is_approved() and v.school_id=my_school() and v.school_id=p_school and v.publisher_id is not distinct from p_publisher)));
  c text := norm_code(p_code);
  t text := nullif(norm_label(p_text), '');
  n int;
  nd int;
begin
  if coalesce(array_length(vers, 1), 0) = 0 then return; end if;

  -- 1) Onaylı takma ad (aynı okul; yayıncı/biçim eşleşmesi varsa o tercih edilir)
  return query
    select a.learning_outcome_id, 'ALIAS'::text, 1.0::numeric, l.curriculum_version_id, l.grade
    from learning_outcome_aliases a join learning_outcomes l on l.id = a.learning_outcome_id
    where a.school_id = p_school and a.subject_code = p_subject and l.curriculum_version_id = any(vers)
      and ((c is not null and norm_code(a.raw_code) = c) or (t is not null and a.raw_text_norm = t))
    order by (a.publisher_id is not distinct from p_publisher) desc, (a.format_id is not distinct from p_format) desc, a.created_at desc
    limit 1;
  if found then return; end if;

  -- 2) Kod (tam / normalleştirilmiş). Adaylar aynı kod + aynı metinse (sınıftan bağımsız programın sınıflara kopyası, ör. TDE)
  --    tek çıktıdır: en üst sınıftaki alınır. Farklı metinli aynı kod (farklı tema bağlamı) metinle ayrılır; ayrılamazsa çözülmez.
  if c is not null then
    select count(*), count(distinct norm_label(l.title)) into n, nd from learning_outcomes l where l.curriculum_version_id = any(vers) and l.code_norm = c;
    if n >= 1 and nd = 1 then
      return query select l.id, case when l.code = btrim(regexp_replace(p_code, '\.+\s*$', '')) then 'CODE_EXACT' else 'CODE_NORMALIZED' end::text,
                          case when l.code = btrim(regexp_replace(p_code, '\.+\s*$', '')) then 1.0 else 0.97 end::numeric, l.curriculum_version_id, l.grade
        from learning_outcomes l where l.curriculum_version_id = any(vers) and l.code_norm = c order by l.grade desc limit 1;
      return;
    elsif n > 1 and t is not null then
      select count(distinct norm_label(l.title)) into nd from learning_outcomes l where l.curriculum_version_id = any(vers) and l.code_norm = c and norm_label(l.title) like t || '%';
      if nd = 1 then
        return query select l.id, 'CONTEXT_EXACT'::text, 0.95::numeric, l.curriculum_version_id, l.grade
          from learning_outcomes l where l.curriculum_version_id = any(vers) and l.code_norm = c and norm_label(l.title) like t || '%' order by l.grade desc limit 1;
        return;
      end if;
    end if;
  end if;

  -- 3) Metin (tam / önek; önek en az 18 harf). Eşleşenler tek bir kod + metne inmeli (sınıf kopyaları tek sayılır).
  if t is not null then
    select count(distinct coalesce(l.code_norm, l.id::text)) into n from learning_outcomes l where l.curriculum_version_id = any(vers) and norm_label(l.title) = t;
    if n = 1 then
      return query select l.id, 'TEXT_EXACT'::text, 0.95::numeric, l.curriculum_version_id, l.grade
        from learning_outcomes l where l.curriculum_version_id = any(vers) and norm_label(l.title) = t order by l.grade desc limit 1;
      return;
    end if;
    if n = 0 and length(t) >= 18 then
      select count(distinct coalesce(l.code_norm, l.id::text) || '|' || norm_label(l.title)) into n from learning_outcomes l where l.curriculum_version_id = any(vers) and norm_label(l.title) like t || '%';
      if n = 1 then
        return query select l.id, 'TEXT_MATCH'::text, (case when length(t) >= 30 then 0.9 else 0.8 end)::numeric, l.curriculum_version_id, l.grade
          from learning_outcomes l where l.curriculum_version_id = any(vers) and norm_label(l.title) like t || '%' order by l.grade desc limit 1;
        return;
      end if;
    end if;
  end if;
end $$;
revoke all on function resolve_outcome_in(text, uuid[], text, text, uuid, uuid, uuid) from public, anon;
grant execute on function resolve_outcome_in(text, uuid[], text, text, uuid, uuid, uuid) to authenticated;

create or replace function resolve_outcome(p_subject text,p_grades smallint[],p_year smallint,p_code text,p_text text,p_school uuid default null,p_publisher uuid default null,p_format uuid default null)
returns table(learning_outcome_id uuid,method text,confidence numeric,curriculum_version_id uuid,outcome_grade smallint)
language sql stable security definer set search_path=public as $$
  select * from resolve_outcome_in(p_subject,
    array(select curriculum_for(g,p_subject,p_year) from unnest(p_grades) g) || array(select id from curriculum_versions where curriculum_type='PDF' and school_id=p_school and school_id=my_school() and publisher_id is not distinct from p_publisher and grade=any(p_grades) and subject_code=p_subject and active),
    p_code,p_text,p_school,p_publisher,p_format)
$$;
revoke all on function resolve_outcome(text,smallint[],smallint,text,text,uuid,uuid,uuid) from public,anon;
grant execute on function resolve_outcome(text,smallint[],smallint,text,text,uuid,uuid,uuid) to authenticated;


create or replace function set_item_outcome(p_exam uuid, p_section text, p_q int, p_outcome uuid, p_alias boolean default false) returns void
language plpgsql security definer set search_path = public as $$
declare e exams; i exam_items; sec exam_template_sections; l learning_outcomes; vers uuid[];
begin
  if not is_staff() then raise exception 'Bu işlem için rehberlik veya yönetici yetkisi gerekir' using errcode = '42501'; end if;
  if p_alias and not is_admin() then raise exception 'Takma adı yalnız yönetici onaylar' using errcode = '42501'; end if;
  select * into e from exams where id = p_exam and school_id = my_school();
  select * into i from exam_items where exam_id = p_exam and section_key = p_section and q_no = p_q for update;
  if e.id is null or i.exam_id is null then raise exception 'Soru bulunamadı.' using errcode = 'P0002'; end if;
  select * into sec from exam_template_sections where template_id = e.exam_template_id and key = p_section;
  select o.* into l from learning_outcomes o join curriculum_versions v on v.id=o.curriculum_version_id where o.id=p_outcome and (v.school_id is null or (v.school_id=my_school() and v.publisher_id is not distinct from e.publisher_id));
  vers := cohort_versions(coalesce(sec.outcome_grades, array[e.grade]), e.grade, i.subject_code, academic_year_start(e.exam_date));
  if l.id is null or not (l.curriculum_version_id = any(vers)) or l.subject_code <> i.subject_code then
    raise exception 'Bu kazanım denemenin eğitim yılı, öğrenci grubunun okuduğu program, sınıf ya da dersle uyumlu değil.' using errcode = '22023';
  end if;
  update exam_items set learning_outcome_id = l.id, curriculum_version_id = l.curriculum_version_id, outcome_grade = l.grade, match_method = 'MANUAL', match_confidence = 1
  where exam_id = p_exam and section_key = p_section and q_no = p_q;
  if p_alias and (i.raw_code is not null or i.raw_text is not null) then
    insert into learning_outcome_aliases (school_id, publisher_id, format_id, subject_code, grade, curriculum_version_id, raw_code, raw_text, learning_outcome_id)
    values (my_school(), e.publisher_id, e.format_id, i.subject_code, l.grade, l.curriculum_version_id, i.raw_code, i.raw_text, l.id);
    -- aynı denemedeki aynı ham kod/metin de çözülür
    update exam_items x set learning_outcome_id = l.id, curriculum_version_id = l.curriculum_version_id, outcome_grade = l.grade, match_method = 'ALIAS', match_confidence = 1
    where x.exam_id = p_exam and x.learning_outcome_id is null and x.subject_code = i.subject_code
      and ((i.raw_code is not null and norm_code(x.raw_code) = norm_code(i.raw_code)) or (i.raw_text is not null and norm_label(x.raw_text) = norm_label(i.raw_text)));
  end if;
  insert into audit_log (user_id, action, entity, entity_id, meta)
  values (auth.uid(), 'outcome_match', 'exams', p_exam, jsonb_build_object('section', p_section, 'q', p_q, 'outcome', l.id, 'alias', p_alias));
end $$;
revoke all on function set_item_outcome(uuid, text, int, uuid, boolean) from public, anon;
grant execute on function set_item_outcome(uuid, text, int, uuid, boolean) to authenticated;

create or replace function add_pdf_outcomes(p_items jsonb) returns jsonb
language plpgsql security definer set search_path=public as $$
declare item jsonb; e exams; i exam_items; sec exam_template_sections; v uuid; target learning_outcomes; g smallint; kind text; pdf_title text; result jsonb:='[]'; created boolean; row_key text; allowed smallint[];
begin
  if not is_admin() then raise exception 'Bu işlem için yönetici yetkisi ve iki adımlı doğrulama gerekir.' using errcode='42501'; end if;
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) not between 1 and 500 then raise exception '1–500 soru seç.' using errcode='22023'; end if;
  for item in select value from jsonb_array_elements(p_items) loop
    row_key:=coalesce(item->>'exam_id','')||':'||coalesce(item->>'section_key','')||':'||coalesce(item->>'q_no','');
    begin
      select * into e from exams where id=(item->>'exam_id')::uuid and school_id=my_school();
      if e.id is null then raise exception 'Deneme bulunamadı.' using errcode='P0002'; end if;
      select * into i from exam_items where exam_id=e.id and section_key=item->>'section_key' and q_no=(item->>'q_no')::int for update;
      if i.exam_id is null then raise exception 'Soru bulunamadı.' using errcode='P0002'; end if;
      if i.learning_outcome_id is not null then
        result:=result||jsonb_build_array(jsonb_build_object('key',row_key,'status','skipped','message','Soru zaten eşlenmiş.')); continue;
      end if;
      pdf_title:=btrim(i.raw_text);
      if pdf_title is null or length(pdf_title) not between 3 and 3000 then raise exception 'PDF kazanım/çıktı metni yok veya uygun uzunlukta değil.' using errcode='22023'; end if;
      g:=(item->>'grade')::smallint; kind:=item->>'outcome_type';
      select * into sec from exam_template_sections where template_id=e.exam_template_id and key=i.section_key;
      allowed:=coalesce(sec.outcome_grades,array[e.grade]);
      if g is null or not(g=any(allowed)) or kind is null or kind not in ('KAZANIM','OGRENME_CIKTISI') then raise exception 'Sınıf veya hedef türü uygun değil.' using errcode='22023'; end if;
      insert into curriculum_versions(authority,name,curriculum_type,grade,subject_code,year_from,outcome_kind,source_title,source_url,retrieved_at,school_id,publisher_id)
      values('Yayıncı','PDF yayın hedefleri','PDF',g,i.subject_code,2000,'KAZANIM','Yönetici tarafından PDF metninden eklenen yayın hedefleri','',current_date,my_school(),e.publisher_id) on conflict do nothing;
      select id into v from curriculum_versions where curriculum_type='PDF' and school_id=my_school() and publisher_id is not distinct from e.publisher_id and grade=g and subject_code=i.subject_code;
      perform pg_advisory_xact_lock(hashtextextended(v::text||coalesce(norm_code(i.raw_code),'')||norm_label(pdf_title),0));
      select * into target from learning_outcomes where curriculum_version_id=v and (code_norm is not distinct from norm_code(i.raw_code)) and norm_label(learning_outcomes.title)=norm_label(pdf_title) and outcome_type=kind limit 1;
      created:=target.id is null;
      if created then
        insert into learning_outcomes(curriculum_version_id,grade,subject_code,code,title,outcome_type,source_note)
        values(v,g,i.subject_code,nullif(btrim(i.raw_code),''),pdf_title,kind,'PDF: '||e.name||' · Yönetici ekledi; resmî MEB katalog kaydı değildir.') returning * into target;
      end if;
      perform set_item_outcome(e.id,i.section_key,i.q_no,target.id,false);
      insert into audit_log(user_id,action,entity,entity_id,meta) values(auth.uid(),'pdf_outcome_add','exams',e.id,jsonb_build_object('section',i.section_key,'q',i.q_no,'outcome',target.id,'created',created));
      result:=result||jsonb_build_array(jsonb_build_object('key',row_key,'status',case when created then 'created' else 'reused' end,'outcome_id',target.id));
    exception when others then
      result:=result||jsonb_build_array(jsonb_build_object('key',row_key,'status','error','message',case when sqlstate='23505' then 'Aynı kod farklı metin/türle kayıtlı. Mevcut hedefi eşle veya PDF metnini kontrol et.' else sqlerrm end));
    end;
  end loop;
  return result;
end $$;
revoke all on function add_pdf_outcomes(jsonb) from public,anon;
grant execute on function add_pdf_outcomes(jsonb) to authenticated;
