-- 0029_ogrenci_grubu_mufredat GERİ ALMA (yalnız gerekirse, elle çalıştırılır; migration değildir).
-- resolve_outcome, import_exam ve set_item_outcome 0027'deki hâline döner (sürüm seçimi yeniden denemenin yılına göre);
-- 0029'un yardımcı fonksiyonları kaldırılır. Tablo/veri değişmez; içe aktarılmış soruların eşleşmeleri olduğu gibi kalır.
begin;
create or replace function resolve_outcome(
  p_subject text, p_grades smallint[], p_year smallint, p_code text, p_text text,
  p_school uuid default null, p_publisher uuid default null, p_format uuid default null
) returns table (learning_outcome_id uuid, method text, confidence numeric, curriculum_version_id uuid, outcome_grade smallint)
language plpgsql stable security definer set search_path = public as $$
declare
  vers uuid[] := array(select curriculum_for(g, p_subject, p_year) from unnest(p_grades) g where curriculum_for(g, p_subject, p_year) is not null);
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
revoke all on function resolve_outcome(text, smallint[], smallint, text, text, uuid, uuid, uuid) from public, anon;
grant execute on function resolve_outcome(text, smallint[], smallint, text, text, uuid, uuid, uuid) to authenticated;

create or replace function import_exam(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_school uuid := my_school();
  tpl exam_templates;
  v_exam uuid;
  v_name text := btrim(coalesce(p->>'name', ''));
  v_date date := (p->>'exam_date')::date;
  v_grade smallint := (p->>'grade')::smallint;
  v_type text := p->>'exam_type';
  v_part text := nullif(p->>'yks_part', '');
  v_status text := coalesce(nullif(p->>'status', ''), 'taslak');
  v_year smallint;
  v_created uuid[] := '{}';
  v_seen uuid[] := '{}';
  r jsonb; it jsonb; sec record; s record; m record;
  v_sid uuid; st students; v_cls classes;
  v_sections jsonb; v_val jsonb; k text;
  v_net numeric; v_total numeric; v_max int; v_applied int;
  n int := 0; n_items int := 0; n_res int := 0; n_unres int := 0;
  v_fmt uuid;
begin
  if not is_staff() then raise exception 'Deneme içe aktarmak için rehberlik veya yönetici yetkisi gerekir' using errcode = '42501'; end if;
  if length(v_name) < 1 or length(v_name) > 120 then raise exception 'Deneme adı gerekli.' using errcode = '22023'; end if;
  if v_date is null or v_date > tr_today() then raise exception 'Deneme tarihi bugünden sonra olamaz.' using errcode = '22023'; end if;
  if v_status not in ('taslak', 'yayinda') then raise exception 'Geçersiz durum.' using errcode = '22023'; end if;
  select * into tpl from exam_templates where id = (p->>'template_id')::uuid;
  if tpl.id is null or not template_visible(tpl.id) then raise exception 'Deneme şablonu bulunamadı.' using errcode = 'P0002'; end if;
  if v_grade is null or v_grade <> tpl.grade then raise exception 'Denemenin sınıfı (%) şablonun sınıfıyla (%) uyuşmuyor.', v_grade, tpl.grade using errcode = '22023'; end if;
  if v_type is null or not valid_exam_type(v_type) or not (v_type = any(tpl.exam_types)) then raise exception 'Sınav türü şablonla uyumlu değil.' using errcode = '22023'; end if;
  if (v_type = 'YKS') <> (v_part is not null) then raise exception 'YKS denemesinde alt tür (TYT/AYT) gerekli; diğerlerinde olmaz.' using errcode = '22023'; end if;
  if jsonb_array_length(coalesce(p->'results', '[]')) = 0 then raise exception 'İçe aktarılacak sonuç yok.' using errcode = '22023'; end if;
  v_year := academic_year_start(v_date);
  select id into v_fmt from exam_format_profiles where code = p->>'format_code' and (school_id is null or school_id = v_school) order by school_id nulls last limit 1;

  -- Aynı dosya ikinci kez: yeni kayıt açılmaz (idempotent)
  if p->>'sha256' is not null then
    select id into v_exam from exams where school_id = v_school and source_sha256 = p->>'sha256';
    if v_exam is not null then return jsonb_build_object('exam_id', v_exam, 'duplicate', true); end if;
  end if;

  insert into exams (school_id, name, publisher, publisher_id, format_id, exam_template_id, exam_date, grade, exam_type, yks_part, exam_code,
                     target_class_ids, status, published_at, published_by, source_sha256)
  values (v_school, v_name, (select name from publishers where id = (p->>'publisher_id')::uuid), (p->>'publisher_id')::uuid, v_fmt, tpl.id, v_date, v_grade, v_type, v_part,
          nullif(btrim(coalesce(p->>'exam_code', '')), ''),
          coalesce(array(select (x)::uuid from jsonb_array_elements_text(coalesce(p->'target_class_ids', '[]')) x), '{}'),
          v_status, case when v_status = 'yayinda' then now() end, case when v_status = 'yayinda' then auth.uid() end, p->>'sha256')
  returning id into v_exam;

  -- Soru düzeyi: cevap anahtarı + kazanım (bölümün dersi / kazanım dersi / izinli sınıflar şablondan)
  for it in select * from jsonb_array_elements(coalesce(p->'items', '[]')) loop
    select * into sec from exam_template_sections where template_id = tpl.id and key = it->>'section_key';
    if sec.key is null then raise exception 'Şablonda olmayan bölüm: %', it->>'section_key' using errcode = '22023'; end if;
    if (it->>'q_no')::int not between 1 and sec.question_count then raise exception '% bölümünde soru numarası geçersiz: %', sec.label, it->>'q_no' using errcode = '22023'; end if;
    select * into m from resolve_outcome(coalesce(sec.outcome_subject, sec.subject_code), coalesce(sec.outcome_grades, array[v_grade]), v_year,
                                         it->>'raw_code', it->>'raw_text', v_school, (p->>'publisher_id')::uuid, v_fmt);
    insert into exam_items (exam_id, section_key, q_no, subject_code, correct_answer, raw_code, raw_text, outcome_grade, curriculum_version_id, learning_outcome_id, match_method, match_confidence)
    values (v_exam, sec.key, (it->>'q_no')::int, coalesce(sec.outcome_subject, sec.subject_code), nullif(it->>'correct_answer', ''), nullif(it->>'raw_code', ''), nullif(it->>'raw_text', ''),
            m.outcome_grade, m.curriculum_version_id, m.learning_outcome_id, coalesce(m.method, 'UNRESOLVED'), m.confidence);
    n_items := n_items + 1;
    if m.learning_outcome_id is null and (nullif(it->>'raw_code', '') is not null or nullif(it->>'raw_text', '') is not null) then n_unres := n_unres + 1; end if;
  end loop;

  -- Sonuçlar
  for r in select * from jsonb_array_elements(p->'results') loop
    if r->>'student_id' is not null then
      v_sid := (r->>'student_id')::uuid;
      select * into st from students where id = v_sid and school_id = v_school and archived_at is null;
      if st.id is null then raise exception 'Öğrenci kaydı bulunamadı.' using errcode = 'P0002'; end if;
      select * into v_cls from classes where id = st.class_id;
      if v_cls.grade is distinct from v_grade and not coalesce((p->>'allow_grade_mismatch')::boolean, false) then
        raise exception '% (%) denemenin sınıfıyla (%) uyuşmuyor; yönetici onayı gerekir.', st.full_name, coalesce(v_cls.name, 'sınıfsız'), v_grade using errcode = '22023';
      end if;
    elsif r ? 'new_student' then
      select * into v_cls from classes where id = (r->'new_student'->>'class_id')::uuid and school_id = v_school;
      if v_cls.id is null or v_cls.grade <> v_grade or length(btrim(coalesce(r->'new_student'->>'full_name', ''))) < 3 then
        raise exception 'Yeni öğrenci bilgisi eksik ya da sınıfı denemenin sınıfı değil.' using errcode = '22023';
      end if;
      begin
        insert into students (school_id, full_name, class_id, school_no)
        values (v_school, btrim(r->'new_student'->>'full_name'), v_cls.id, nullif(btrim(r->'new_student'->>'school_no'), ''))
        returning id into v_sid;
      exception when unique_violation then
        raise exception 'Bu okul numarası başka bir öğrencide kayıtlı: %', r->'new_student'->>'school_no' using errcode = '23505';
      end;
      v_created := v_created || v_sid;
    else
      raise exception 'Sonuç satırında öğrenci yok.' using errcode = '22023';
    end if;
    if v_sid = any(v_seen) then raise exception 'Aynı öğrenci iki kez eşleştirildi.' using errcode = '23505'; end if;
    v_seen := v_seen || v_sid;

    -- Bölüm kuralları (şablondan): okunamadı (null) · uygulanmadı (na, yalnız seçmeli grupta) · D+Y+B · net
    for k in select jsonb_object_keys(coalesce(r->'sections', '{}')) loop
      if not exists (select 1 from exam_template_sections where template_id = tpl.id and key = k) then
        raise exception 'Şablonda olmayan bölüm: %', k using errcode = '22023';
      end if;
    end loop;
    v_sections := '{}'::jsonb; v_total := 0; v_max := 0; v_applied := 0;
    for sec in select * from exam_template_sections where template_id = tpl.id order by sort loop
      v_val := r->'sections'->sec.key;
      if v_val is null or jsonb_typeof(v_val) = 'null' then continue; end if;
      if v_val ? 'na' then
        if sec.optional_group is null then raise exception '% bölümü "uygulanmadı" olamaz (seçmeli değil).', sec.label using errcode = '22023'; end if;
        v_sections := v_sections || jsonb_build_object(sec.key, jsonb_build_object('na', true));
        continue;
      end if;
      begin
        select (v_val->>'d')::int as d, (v_val->>'y')::int as y, (v_val->>'b')::int as b, (v_val->>'net')::numeric as net into s;
      exception when others then
        raise exception '% bölümünde sayı okunamadı.', sec.label using errcode = '22023';
      end;
      if s.d is null or s.y is null or s.b is null or s.net is null or s.d < 0 or s.y < 0 or s.b < 0 then
        raise exception '% bölümünde negatif ya da eksik değer.', sec.label using errcode = '22023';
      end if;
      if (tpl.strict_counts and s.d + s.y + s.b <> sec.question_count) or s.d + s.y + s.b > sec.question_count then
        raise exception '% bölümünde doğru + yanlış + boş (%) soru sayısını (%) tutmuyor.', sec.label, s.d + s.y + s.b, sec.question_count using errcode = '22023';
      end if;
      v_net := case when tpl.wrong_per_correct is null then s.d else s.d - s.y / tpl.wrong_per_correct end;
      if abs(s.net - v_net) > 0.011 then
        raise exception '% bölümünde net (%) kurala uymuyor (beklenen %).', sec.label, s.net, round(v_net, 2) using errcode = '22023';
      end if;
      v_sections := v_sections || jsonb_build_object(sec.key, jsonb_build_object('d', s.d, 'y', s.y, 'b', s.b, 'net', round(s.net, 2)));
      v_total := v_total + s.net; v_max := v_max + sec.question_count; v_applied := v_applied + 1;
    end loop;
    if v_applied = 0 then raise exception 'Hiç bölüm sonucu okunamamış bir satır içe aktarılamaz.' using errcode = '22023'; end if;
    -- Seçmeli grupta en çok bir bölüm uygulanır
    if exists (select 1 from exam_template_sections x where x.template_id = tpl.id and x.optional_group is not null
               and jsonb_typeof(v_sections->x.key) = 'object' and not (v_sections->x.key ? 'na') and ((v_sections->x.key->>'d')::int + (v_sections->x.key->>'y')::int) > 0
               group by x.optional_group having count(*) > 1) then
      raise exception 'Seçmeli bölümlerden (ör. Din / Felsefe-2) yalnız biri uygulanabilir.' using errcode = '22023';
    end if;

    insert into exam_results (exam_id, student_id, score, subjects, answers, outcomes_ok, source, total_net, success_pct)
    values (v_exam, v_sid, (r->>'score')::numeric, v_sections, r->'answers', jsonb_array_length(coalesce(p->'items', '[]')) > 0, coalesce(r->'source', '{}'::jsonb),
            round(v_total, 2), case when v_max > 0 then round(v_total / v_max * 100, 2) end);
    n_res := n_res + 1;
    if v_status = 'yayinda' and coalesce((p->>'notify')::boolean, false) then
      perform notify_many(array(select parent_accounts(v_sid)) || array(select student_accounts(v_sid)), v_name || ' sonucu yayınlandı', '{"page":"ozet"}');
    end if;
  end loop;

  update exams set created_students = v_created where id = v_exam;
  insert into exam_imports (school_id, exam_id, source_kind, filename, file_sha256, publisher_id, format_code, grade, exam_type, student_count, result_count, outcome_count, unresolved_count, status, detection)
  values (v_school, v_exam, coalesce(nullif(p->>'source_kind', ''), 'pdf'), p->>'filename', p->>'sha256', (p->>'publisher_id')::uuid, p->>'format_code', v_grade, v_type,
          jsonb_array_length(p->'results'), n_res, n_items, n_unres, 'basarili', coalesce(p->'detection', '{}'::jsonb));
  insert into audit_log (user_id, action, entity, entity_id, meta)
  values (auth.uid(), 'import', 'exams', v_exam, jsonb_build_object('results', n_res, 'items', n_items, 'unresolved', n_unres, 'status', v_status, 'grade', v_grade, 'exam_type', v_type, 'sha256', p->>'sha256'));
  return jsonb_build_object('exam_id', v_exam, 'results', n_res, 'items', n_items, 'resolved', n_items - n_unres, 'unresolved', n_unres, 'duplicate', false);
end $$;
revoke all on function import_exam(jsonb) from public, anon;
grant execute on function import_exam(jsonb) to authenticated;

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
  select * into l from learning_outcomes where id = p_outcome;
  vers := array(select curriculum_for(g, i.subject_code, academic_year_start(e.exam_date)) from unnest(coalesce(sec.outcome_grades, array[e.grade])) g);
  if l.id is null or not (l.curriculum_version_id = any(vers)) or l.subject_code <> i.subject_code then
    raise exception 'Bu kazanım denemenin eğitim yılı, sınıfı ya da dersiyle uyumlu değil.' using errcode = '22023';
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

drop function if exists resolve_outcome_in(text, uuid[], text, text, uuid, uuid, uuid);
drop function if exists cohort_versions(smallint[], smallint, text, smallint);
drop function if exists cohort_year(smallint, smallint, smallint);
commit;
