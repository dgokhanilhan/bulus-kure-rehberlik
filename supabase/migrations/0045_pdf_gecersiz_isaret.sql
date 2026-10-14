-- Hız PDF'inde '*' geçersiz/çift işaretlenmiş ve yanlış sayılan cevaptır.
-- Durum dizisindeki 'x' yanlış durumudur, bir şık değildir.
-- Puan/net/DYB veya yetki değişmez; asıl PDF'nin SHA kimliği korunur.
create function pdf_status_answers(p jsonb) returns jsonb
language sql immutable set search_path=public as $$
 select coalesce(jsonb_object_agg(k,to_jsonb(replace(v,'*','x'))),'{}'::jsonb)
 from jsonb_each_text(coalesce(p,'{}'::jsonb)) as a(k,v)
$$;
revoke all on function pdf_status_answers(jsonb) from public,anon,authenticated;

do $$
declare def text;
begin
 def:=pg_get_functiondef('repair_exam_pdf(uuid,jsonb)'::regprocedure);
 if position('a:=r->''answers''->>k;' in def)=0 or position('^[ABCDEabcde_]+$' in def)=0 or position('answers=r->''answers''' in def)=0 then
  raise exception 'PDF tamamlama fonksiyonu beklenen biçimde değil.';
 end if;
 def:=replace(def,'a:=r->''answers''->>k;','a:=pdf_status_answers(r->''answers'')->>k;');
 def:=replace(def,'^[ABCDEabcde_]+$','^[ABCDEabcdex_]+$');
 def:=replace(def,'answers=r->''answers''','answers=pdf_status_answers(r->''answers'')');
 execute def;
 def:=pg_get_functiondef('import_exam(jsonb)'::regprocedure);
 if position('v_sections, r->''answers'', jsonb_array_length' in def)=0 then raise exception 'İçe aktarma fonksiyonu beklenen biçimde değil.'; end if;
 def:=replace(def,'v_sections, r->''answers'', jsonb_array_length','v_sections, pdf_status_answers(r->''answers''), jsonb_array_length');
 execute def;
end $$;
