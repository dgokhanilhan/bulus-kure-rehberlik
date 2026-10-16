-- 8. sınıf (LGS) denemelerinde resmî listeyle güvenle eşleşmeyen sorular Eşleşmeyen hedefler kuyruğuna (exam_items) yazılır.
-- Böylece Yönetim → Deneme merkezi → Eşleşmeyen hedefler ekranında 8. sınıf soruları da görünür; Eşle / Ekle (add_pdf_outcomes,
-- set_booklet_item_outcome) 5–12 denemelerindeki gibi çalışır. Daha önce bu yol yalnız import_exam (5–12) denemelerini besliyordu.
--
-- YALNIZ EKLEME: publish_exam, exam_questions, exam_results ve sonuçlar (D/Y/B/net/puan) değişmez. Kayıtlar kitapçık başınadır
-- (A ve B aynı soru numarasında farklı kazanım taşır). Eşleme kuralı import_exam ile aynıdır (resolve_outcome_in + öğrenci grubu
-- programı); onaylı takma adlar ve okulun PDF hedefleri kendiliğinden uygulanır. Eşleşmeyen satır UNRESOLVED kalır (uydurulmaz).
create or replace function add_lgs_unresolved_items(p_exam uuid, p_items jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare
  e exams;
  it jsonb;
  m record;
  n int := 0;
  v_subject text;
  v_booklet text;
  v_q int;
  v_code text;
  v_text text;
  v_year smallint;
begin
  if not is_staff() then raise exception 'Bu işlem için rehberlik veya yönetici yetkisi gerekir' using errcode = '42501'; end if;
  select * into e from exams where id = p_exam and school_id = my_school();
  if e.id is null then raise exception 'Deneme bulunamadı.' using errcode = 'P0002'; end if;
  if e.exam_type is distinct from 'LGS' or e.grade is distinct from 8 then
    raise exception 'Bu işlem yalnız 8. sınıf LGS denemeleri içindir.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) > 360 then
    raise exception 'Geçersiz soru listesi.' using errcode = '22023';
  end if;
  v_year := academic_year_start(e.exam_date);
  for it in select value from jsonb_array_elements(p_items) loop
    v_subject := it->>'subject';
    v_booklet := coalesce(nullif(it->>'booklet', ''), 'A');
    v_q := (it->>'q_no')::int;
    if v_subject is null or v_subject not in ('TUR', 'MAT', 'FEN', 'INK', 'DIN', 'ING') or v_booklet not in ('A', 'B') or v_q is null
       or v_q not between 1 and (case when v_subject in ('TUR', 'MAT', 'FEN') then 20 else 10 end) then
      raise exception 'Geçersiz soru: % % %', v_subject, v_booklet, v_q using errcode = '22023';
    end if;
    v_code := nullif(btrim(coalesce(it->>'raw_code', '')), '');
    v_text := nullif(btrim(coalesce(it->>'raw_text', '')), '');
    if v_code is null and v_text is null then continue; end if;
    if length(coalesce(v_code, '')) > 80 or length(coalesce(v_text, '')) > 3000 then
      raise exception 'PDF kod/metin alanı çok uzun (% %. soru).', v_subject, v_q using errcode = '22023';
    end if;
    select * into m from resolve_outcome_in(v_subject, cohort_versions(array[8]::smallint[], 8::smallint, v_subject, v_year),
                                            v_code, v_text, e.school_id, e.publisher_id, e.format_id);
    insert into exam_items (exam_id, section_key, booklet, q_no, subject_code, correct_answer, raw_code, raw_text,
                            outcome_grade, curriculum_version_id, learning_outcome_id, match_method, match_confidence)
    values (e.id, v_subject, v_booklet, v_q, v_subject, nullif(it->>'correct_answer', ''), v_code, v_text,
            m.outcome_grade, m.curriculum_version_id, m.learning_outcome_id, coalesce(m.method, 'UNRESOLVED'), m.confidence)
    on conflict (exam_id, section_key, booklet, q_no) do nothing;
    if found then n := n + 1; end if;
  end loop;
  insert into audit_log (user_id, action, entity, entity_id, meta)
  values (auth.uid(), 'lgs_unresolved_items', 'exams', e.id, jsonb_build_object('count', n));
  return n;
end $$;
revoke all on function add_lgs_unresolved_items(uuid, jsonb) from public, anon;
grant execute on function add_lgs_unresolved_items(uuid, jsonb) to authenticated;
