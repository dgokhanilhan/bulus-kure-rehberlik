-- Kazanım grupları (gruplu sonuç belgeleri) ve silme işlemleri

-- ---------- Kazanım grupları ----------
-- Bazı yayınevleri kazanımı soru bazında değil "kazanım × D/Y/B" grubu olarak verir.
-- kazanim: {"subjects":["TUR",...], "g":{"T.8.3.5":[soru,d,y,b], ...}}
--   subjects: grup toplamları dersin sonucuyla tutan dersler (tutmayan ders analiz dışı);
--   g: yalnız güvenilir eşleşmeler (kod / birebir metin / metin başlangıcı). Sonuç (D/Y/B/net) bundan bağımsızdır.
alter table exam_results add column kazanim jsonb;

-- İstemciden gelen grubu süzer: bilinmeyen ders/kod, tutarsız sayı atılır (uydurma veri girmez).
create or replace function clean_kazanim(k jsonb) returns jsonb
language sql stable security definer set search_path = public as $$
  with subj as (
    select array(select s from jsonb_array_elements_text(coalesce(k->'subjects', '[]')) s
                 where s in ('TUR','MAT','FEN','INK','DIN','ING')) a
  ), g as (
    select e.key, e.value from jsonb_each(case when jsonb_typeof(k->'g') = 'object' then k->'g' else '{}' end) e
    join outcomes o on o.code = e.key
    cross join subj
    where jsonb_typeof(e.value) = 'array' and jsonb_array_length(e.value) = 4
      and o.subject::text = any(subj.a)
      and (e.value->>0)::int between 1 and 20
      and (e.value->>1)::int >= 0 and (e.value->>2)::int >= 0 and (e.value->>3)::int >= 0
      and (e.value->>1)::int + (e.value->>2)::int + (e.value->>3)::int = (e.value->>0)::int
  )
  select case when k is null or jsonb_typeof(k) <> 'object' or coalesce(array_length((select a from subj), 1), 0) = 0 then null
    else jsonb_build_object('subjects', to_jsonb((select a from subj)), 'g', coalesce((select jsonb_object_agg(key, value) from g), '{}'))
  end
$$;

create or replace function exam_results_clean() returns trigger language plpgsql as $$
begin
  new.kazanim := clean_kazanim(new.kazanim);
  return new;
end $$;
create trigger exam_results_clean before insert or update of kazanim on exam_results
  for each row execute function exam_results_clean();

-- publish_exam: sonuç satırındaki "kazanim" alanını da yaz (0004 gövdesi korunur, tek ek bu).
do $$
declare src text;
begin
  select pg_get_functiondef('publish_exam(jsonb)'::regprocedure) into src;
  src := replace(src,
    'insert into exam_results (exam_id, student_id, score, subjects, answers, outcomes_ok, source)',
    'insert into exam_results (exam_id, student_id, score, subjects, answers, outcomes_ok, source, kazanim)');
  src := replace(src,
    'coalesce((r->>''outcomes_ok'')::boolean, false), coalesce(r->''source'', ''{}''::jsonb));',
    'coalesce((r->>''outcomes_ok'')::boolean, false), coalesce(r->''source'', ''{}''::jsonb), r->''kazanim'');');
  if position('r->''kazanim''' in src) = 0 then raise exception 'publish_exam güncellenemedi'; end if;
  execute src;
end $$;

-- ---------- Deneme sil (süre sınırı yok) ----------
-- Sonuçlar, cevap anahtarı ve raporlar birlikte silinir; bu yayında açılıp başka kaydı olmayan öğrenciler de.
create or replace function delete_exam(p_exam uuid) returns void
language plpgsql security definer set search_path = public as $$
declare e exams;
begin
  if not is_staff() then raise exception 'Bu işlem için rehberlik veya yönetici yetkisi gerekir' using errcode = '42501'; end if;
  select * into e from exams where id = p_exam and school_id = my_school() for update;
  if e.id is null then raise exception 'Deneme bulunamadı.' using errcode = 'P0002'; end if;
  delete from exams where id = e.id;
  delete from students s where s.id = any(e.created_students)
    and not exists (select 1 from exam_results x where x.student_id = s.id)
    and not exists (select 1 from profiles p where p.student_id = s.id)
    and not exists (select 1 from parent_links l where l.student_id = s.id)
    and not exists (select 1 from tasks t where t.student_id = s.id);
  insert into audit_log (user_id, action, entity, entity_id, meta)
  values (auth.uid(), 'delete', 'exams', e.id, jsonb_build_object('name', e.name));
end $$;

-- ---------- Öğrenci sil ----------
-- Öğrencinin bütün kayıtları (sonuçlar, görevler, görüşmeler, notlar, raporlar, veli bağları) silinir.
-- Bu öğrenciye bağlı öğrenci hesabı silinmez; onay bekleyen duruma döner (yönetici yeniden eşleştirir).
create or replace function delete_student(p_student uuid) returns void
language plpgsql security definer set search_path = public as $$
declare s students;
begin
  if not is_staff() then raise exception 'Bu işlem için rehberlik veya yönetici yetkisi gerekir' using errcode = '42501'; end if;
  select * into s from students where id = p_student and school_id = my_school() for update;
  if s.id is null then raise exception 'Öğrenci bulunamadı.' using errcode = 'P0002'; end if;
  update profiles set student_id = null, status = 'pending', approved_by = null, approved_at = null
    where student_id = s.id and role = 'ogrenci';
  update exams set created_students = array_remove(created_students, s.id) where s.id = any(created_students);
  delete from students where id = s.id;
  insert into audit_log (user_id, action, entity, entity_id, meta)
  values (auth.uid(), 'delete', 'students', s.id, jsonb_build_object('class', s.class_name));
end $$;

revoke all on function delete_exam(uuid) from public, anon;
revoke all on function delete_student(uuid) from public, anon;
grant execute on function delete_exam(uuid) to authenticated;
grant execute on function delete_student(uuid) to authenticated;
revoke all on function clean_kazanim(jsonb) from public, anon, authenticated;
