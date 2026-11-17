-- Yalnız PDF'nin konu bazlı D/Y/B özeti; soru/kazanım eşlemesi üretilmez.
create or replace function repair_exam_topics(p_exam uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path=public as $$
declare e exams; er exam_results; r jsonb; t jsonb; v jsonb; k text; topics jsonb; n int:=0; seen uuid[]:='{}'; sid uuid;
begin
 if not is_admin() then raise exception 'Yönetici doğrulaması gerekli.' using errcode='42501'; end if;
 select * into e from exams where id=p_exam and school_id=my_school() for update;
 if e.id is null then raise exception 'Deneme bulunamadı.' using errcode='42501'; end if;
 if e.source_sha256 is null or e.source_sha256 is distinct from p->>'sha256' then raise exception 'Kaynak PDF farklı.' using errcode='22023'; end if;
 if e.exam_template_id is distinct from (p->>'template_id')::uuid then raise exception 'Şablon farklı.' using errcode='22023'; end if;
 if jsonb_typeof(p->'results') is distinct from 'array' or jsonb_array_length(p->'results')=0 then raise exception 'Sonuç yok.'; end if;
 for r in select value from jsonb_array_elements(p->'results') loop
  sid:=(r->>'student_id')::uuid;
  if sid=any(seen) then raise exception 'Öğrenci tekrar ediyor.'; end if;
  seen:=array_append(seen,sid);
  select * into er from exam_results where exam_id=e.id and student_id=sid for update;
  if er.student_id is null or er.subjects is distinct from r->'sections' then raise exception 'Ders sonuçları mevcut kayıtla uyuşmuyor.' using errcode='22023'; end if;
  topics:=coalesce(r->'source'->'topics','[]');
  if jsonb_typeof(topics) is distinct from 'array' or jsonb_array_length(topics)>500 then raise exception 'Geçersiz konu listesi.'; end if;
  if jsonb_array_length(topics)=0 then continue; end if;
  for t in select value from jsonb_array_elements(topics) loop
   if jsonb_typeof(t->'section') is distinct from 'string' or jsonb_typeof(t->'title') is distinct from 'string' or length(trim(t->>'title')) not between 2 and 500 or not (er.subjects ? (t->>'section')) then raise exception 'Geçersiz konu.'; end if;
   foreach k in array array['n','d','y','b'] loop
    if jsonb_typeof(t->k) is distinct from 'number' or (t->>k)!~'^[0-9]+$' then raise exception 'Geçersiz konu sayısı.'; end if;
   end loop;
   if (t->>'n')::int<=0 or (t->>'n')::int<>(t->>'d')::int+(t->>'y')::int+(t->>'b')::int then raise exception 'Konu sayıları tutarsız.'; end if;
  end loop;
  if exists(select 1 from jsonb_array_elements(topics) x group by x->>'section',upper(trim(x->>'title')) having count(*)>1) then raise exception 'Konu tekrar ediyor.'; end if;
  for k in select distinct x->>'section' from jsonb_array_elements(topics) x loop
   v:=er.subjects->k;
   if not(v ? 'd') or exists(
    select 1 from (select sum((x->>'d')::int) d,sum((x->>'y')::int) y,sum((x->>'b')::int) b from jsonb_array_elements(topics) x where x->>'section'=k) s
    where s.d<>(v->>'d')::int or s.y<>(v->>'y')::int or s.b<>(v->>'b')::int
   ) then raise exception 'Konu toplamları dersle uyuşmuyor: %',k; end if;
  end loop;
  -- Eksik okunmuş bir dersin önceki konu bilgilerini silme.
  topics:=topics||coalesce((select jsonb_agg(x) from jsonb_array_elements(coalesce(er.source->'topics','[]')) x
    where not exists(select 1 from jsonb_array_elements(topics) z where z->>'section'=x->>'section')),'[]');
  update exam_results set source=coalesce(source,'{}')||jsonb_build_object('topics',topics,'topic_engine','genel-1.3.3') where exam_id=e.id and student_id=sid;
  n:=n+jsonb_array_length(topics);
 end loop;
 if n=0 then raise exception 'Doğrulanmış konu bulunamadı.'; end if;
 insert into audit_log(user_id,action,entity,entity_id,meta) values(auth.uid(),'repair_pdf_topics','exams',e.id,jsonb_build_object('topics',n));
 return jsonb_build_object('exam_id',e.id,'topics',n);
end $$;
revoke all on function repair_exam_topics(uuid,jsonb) from public,anon;
grant execute on function repair_exam_topics(uuid,jsonb) to authenticated;
