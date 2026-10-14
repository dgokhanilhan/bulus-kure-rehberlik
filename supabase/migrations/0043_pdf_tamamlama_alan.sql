-- Kitapçıklar aynı soru numarasıyla farklı hedefler taşır; eski kayıtlar A olarak korunur.
alter table exam_items add column booklet text not null default 'A' check(booklet in ('A','B'));
alter table exam_items drop constraint exam_items_pkey;
alter table exam_items add primary key(exam_id,section_key,booklet,q_no);
create or replace view unresolved_outcomes with(security_invoker=true) as
select i.exam_id,e.name as exam_name,e.grade,e.exam_type,e.publisher_id,e.format_id,i.section_key,i.subject_code,i.q_no,i.raw_code,i.raw_text,i.outcome_grade,i.curriculum_version_id,i.match_method,i.match_confidence,i.booklet
from exam_items i join exams e on e.id=i.exam_id where i.learning_outcome_id is null and(i.raw_code is not null or i.raw_text is not null) and e.archived_at is null;
do $$
declare def text; newer text;
begin
 def:=replace(pg_get_functiondef('set_item_outcome(uuid,text,integer,uuid,boolean)'::regprocedure),chr(13),'');
 newer:=replace(def,'set_item_outcome(','set_booklet_item_outcome(');
 newer:=replace(newer,'p_alias boolean DEFAULT false)','p_alias boolean DEFAULT false, p_booklet text DEFAULT ''A'')');
 if newer=def or position('p_booklet text' in newer)=0 then raise exception 'Eşleme imzası beklenenden farklı.'; end if;
 newer:=replace(newer,'q_no = p_q','q_no = p_q and booklet = p_booklet');
 execute newer;
 execute replace(def,'q_no = p_q','q_no = p_q and booklet = ''A''');
 def:=replace(pg_get_functiondef('add_pdf_outcomes(jsonb)'::regprocedure),chr(13),'');
 def:=replace(def,'q_no=(item->>''q_no'')::int for update','q_no=(item->>''q_no'')::int and booklet=coalesce(item->>''booklet'',''A'') for update');
 def:=replace(def,'perform set_item_outcome(e.id,i.section_key,i.q_no,target.id,false)','perform set_booklet_item_outcome(e.id,i.section_key,i.q_no,target.id,false,i.booklet)');
 -- A kitapçığının eski anahtarı korunur; B anahtarı seçimlerde çakışmaz.
 def:=replace(def,'coalesce(item->>''q_no'','''');','coalesce(item->>''q_no'','''')||case when coalesce(item->>''booklet'',''A'')=''A'' then '''' else '':''||(item->>''booklet'') end;');
 def:=replace(def,'row_key:=e.id::text||'':''||i.section_key||'':''||i.q_no::text','row_key:=e.id::text||'':''||i.section_key||'':''||i.q_no::text||case when i.booklet=''A'' then '''' else '':''||i.booklet end');
 execute def;
 def:=replace(pg_get_functiondef('import_exam(jsonb)'::regprocedure),chr(13),'');
 def:=replace(def,'exam_id, section_key, q_no, subject_code, correct_answer','exam_id, section_key, q_no, booklet, subject_code, correct_answer');
 def:=replace(def,'v_exam, sec.key, (it->>''q_no'')::int, coalesce','v_exam, sec.key, (it->>''q_no'')::int, coalesce(it->>''booklet'',''A''), coalesce');
 execute def;
end $$;
revoke all on function set_booklet_item_outcome(uuid,text,integer,uuid,boolean,text) from public,anon;
grant execute on function set_booklet_item_outcome(uuid,text,integer,uuid,boolean,text) to authenticated;
-- 0043: Mevcut deneme sonuçlarını koruyarak PDF ayrıntılarını tamamlama.
create or replace function repair_exam_pdf(p_exam uuid,p jsonb) returns jsonb
language plpgsql security definer set search_path=public as $$
declare e exams; r jsonb; it jsonb; er exam_results; sec exam_template_sections; m record; n int:=0; k text; v jsonb; a text; d int; y int; b int;
begin
 if not is_admin() then raise exception 'Yönetici doğrulaması gerekli.' using errcode='42501'; end if;
 select * into e from exams where id=p_exam and school_id=my_school() for update;
 if e.id is null then raise exception 'Deneme bulunamadı.' using errcode='42501'; end if;
 if e.source_sha256 is null or e.source_sha256 is distinct from p->>'sha256' then raise exception 'Kaynak PDF bu denemeyle aynı değil.' using errcode='22023'; end if;
 if e.exam_template_id is distinct from (p->>'template_id')::uuid then raise exception 'Şablon farklı.' using errcode='22023'; end if;
 if jsonb_array_length(coalesce(p->'results','[]'))=0 then raise exception 'Sonuç yok.'; end if;
 -- Bütün sayısal sonuçlar ve cevap sayıları önce doğrulanır; bir hata her şeyi geri alır.
 for r in select value from jsonb_array_elements(p->'results') loop
  select * into er from exam_results where exam_id=e.id and student_id=(r->>'student_id')::uuid for update;
  if er.student_id is null or er.subjects is distinct from r->'sections' then raise exception 'Öğrenci sonucu mevcut kayıtla uyuşmuyor.' using errcode='22023'; end if;
  for k,v in select key,value from jsonb_each(er.subjects) loop
   if not(v ? 'd') then continue; end if;
   a:=r->'answers'->>k;
   d:=length(regexp_replace(coalesce(a,''),'[^A-Z]','','g')); y:=length(regexp_replace(coalesce(a,''),'[^a-z]','','g')); b:=length(regexp_replace(coalesce(a,''),'[^_]','','g'));
   if a is null or a !~ '^[ABCDEabcde_]+$' or d<>(v->>'d')::int or y<>(v->>'y')::int or b<>(v->>'b')::int then raise exception 'Cevaplar mevcut doğru/yanlış/boş ile uyuşmuyor: %',k using errcode='22023'; end if;
  end loop;
  for k,v in select key,value from jsonb_each(coalesce(nullif(r->'source'->'scores','null'::jsonb),'{}')) loop
   if k not in ('SAY','EA','SOZ','DIL') or jsonb_typeof(v)<>'number' or v::text::numeric not between 0 and 1000 then raise exception 'Geçersiz alan puanı.'; end if;
  end loop;
 end loop;
 for it in select value from jsonb_array_elements(coalesce(p->'items','[]')) loop
  select * into sec from exam_template_sections where template_id=e.exam_template_id and key=it->>'section_key';
  if sec.key is null or (it->>'q_no')::int not between 1 and sec.question_count or (it->>'correct_answer') !~ '^[ABCDE]$' then raise exception 'Geçersiz soru.'; end if;
  if exists(select 1 from exam_items x where x.exam_id=e.id and x.section_key=sec.key and x.q_no=(it->>'q_no')::int and x.booklet=coalesce(it->>'booklet','A') and x.learning_outcome_id is not null and (x.correct_answer is distinct from it->>'correct_answer' or x.raw_code is distinct from nullif(it->>'raw_code','') or x.raw_text is distinct from nullif(it->>'raw_text',''))) then raise exception 'Mevcut soru farklı; elle incelenmeli.'; end if;
  select * into m from resolve_outcome_in(coalesce(sec.outcome_subject,sec.subject_code),cohort_versions(coalesce(sec.outcome_grades,array[e.grade]),e.grade,coalesce(sec.outcome_subject,sec.subject_code),academic_year_start(e.exam_date)),it->>'raw_code',it->>'raw_text',e.school_id,e.publisher_id,e.format_id);
  insert into exam_items(exam_id,section_key,q_no,booklet,subject_code,correct_answer,raw_code,raw_text,outcome_grade,curriculum_version_id,learning_outcome_id,match_method,match_confidence)
  values(e.id,sec.key,(it->>'q_no')::int,coalesce(it->>'booklet','A'),coalesce(sec.outcome_subject,sec.subject_code),it->>'correct_answer',nullif(it->>'raw_code',''),nullif(it->>'raw_text',''),m.outcome_grade,m.curriculum_version_id,m.learning_outcome_id,coalesce(m.method,'UNRESOLVED'),m.confidence)
  on conflict(exam_id,section_key,booklet,q_no) do update set correct_answer=excluded.correct_answer,raw_code=excluded.raw_code,raw_text=excluded.raw_text,outcome_grade=excluded.outcome_grade,curriculum_version_id=excluded.curriculum_version_id,learning_outcome_id=excluded.learning_outcome_id,match_method=excluded.match_method,match_confidence=excluded.match_confidence where exam_items.learning_outcome_id is null;
  n:=n+1;
 end loop;
 for r in select value from jsonb_array_elements(p->'results') loop
  -- Puan/net/ders sayıları değiştirilmez. Alan puanları PDF kaynak ayrıntısında saklanır.
  update exam_results set answers=r->'answers',source=source||jsonb_build_object('scores',coalesce(nullif(r->'source'->'scores','null'::jsonb),'{}'),'booklets',coalesce(r->'source'->'booklets','{}'),'pages',r->'source'->'pages','repair_engine','genel-1.2.0') where exam_id=e.id and student_id=(r->>'student_id')::uuid;
 end loop;
 insert into audit_log(user_id,action,entity,entity_id,meta) values(auth.uid(),'repair_pdf','exams',e.id,jsonb_build_object('items',n,'results',jsonb_array_length(p->'results')));
 return jsonb_build_object('exam_id',e.id,'items',n,'results',jsonb_array_length(p->'results'));
end $$;
revoke all on function repair_exam_pdf(uuid,jsonb) from public,anon;
grant execute on function repair_exam_pdf(uuid,jsonb) to authenticated;

-- Alan: mevcut sınıfların alanı boş kalır; atama yalnız yöneticinin seçimiyle yapılır.
alter table classes add column track text check(track in ('SAY','EA','SOZ','DIL'));
alter table classes add constraint classes_track_grade check(track is null or grade in (11,12));
alter table classes alter column name drop expression;
create function classes_set_name() returns trigger language plpgsql set search_path=public as $$
begin
 new.name:=new.grade::text||'/'||new.section||case when new.track is null then '' else ' · '||case new.track when 'SOZ' then 'SÖZ' when 'DIL' then 'DİL' else new.track end end;
 return new;
end $$;
create trigger classes_set_name before insert or update on classes for each row execute function classes_set_name();
drop trigger classes_after_rename on classes;
create trigger classes_after_rename after update of grade,section,track on classes for each row execute function classes_after_rename();

-- Gelecekte 11 -> 12 geçişinde alan korunur; dönem geçişi burada çalıştırılmaz.
do $$
declare def text;
begin
 def:=replace(pg_get_functiondef('start_next_academic_year(uuid,text)'::regprocedure),chr(13),'');
 if position('select st.id,c.grade,c.section from' in def)=0 then raise exception 'Dönem fonksiyonu beklenen biçimde değil.'; end if;
 def:=replace(def,'select st.id,c.grade,c.section from','select st.id,c.grade,c.section,c.track from');
 def:=replace(def,'insert into classes(school_id,grade,section,academic_year_id,active) values(sid,s.grade+1,s.section,p_target,true)','insert into classes(school_id,grade,section,track,academic_year_id,active) values(sid,s.grade+1,s.section,case when s.grade=11 then s.track end,p_target,true)');
 def:=replace(def,'do update set academic_year_id=p_target,active=true returning','do update set academic_year_id=p_target,active=true,track=excluded.track returning');
 execute def;
end $$;
