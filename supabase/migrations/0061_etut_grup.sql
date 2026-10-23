-- Gruba etüt: Sınıflar → konu analizi (denemede aynı kazanımı yanlış yapan öğrenciler) ya da öğrenci dosyasından, seçilen
-- öğrenciler tek adımda Cumartesi etüt programına (etut_gunler / etut_hucreler / etut_ogrenciler) eklenir.
-- Yalnız rehber öğretmen / yönetici (is_staff). Program yoksa taslak olarak açılır; aynı öğretmenin aynı dersteki etüdü
-- varsa öğrenciler ona eklenir (konu korunur). O ders saatinde başka etüdü olan öğrenci eklenmez, adı geri döner.
-- Program yayındaysa yeni eklenen öğrencilere / velilerine bildirim gider (etut_kaydet ile aynı kural).
-- Geri alma: supabase/geri-alma/0061_etut_grup_geri_al.sql

-- p: {tarih, kademe, ders, teacher_id, konu, aciklama?, saatler:[{bas,bit}×5] (program yeni açılırsa), ogrenciler:[student_id]}
create function etut_grup_ekle(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_school uuid := my_school();
  v_tarih date := (p->>'tarih')::date;
  v_kademe text := p->>'kademe';
  v_ders int := (p->>'ders')::int;
  v_konu text := nullif(btrim(coalesce(p->>'konu', '')), '');
  v_saat jsonb := p->'saatler';
  g etut_gunler; h etut_hucreler; tp profiles; st students;
  sid uuid; eklenen int := 0; cakisan text[] := '{}'; zaten int := 0; yeni_hucre boolean := false;
begin
  if not is_staff() then raise exception 'Etüt programını rehber öğretmen ya da yönetici hazırlar.' using errcode = '42501'; end if;
  perform etut_modul_acik();
  if v_tarih is null or extract(isodow from v_tarih) <> 6 then raise exception 'Etüt günü Cumartesi olmalı.' using errcode = '22023'; end if;
  if v_tarih < tr_today() then raise exception 'Geçmiş bir Cumartesiye etüt eklenemez.' using errcode = '22023'; end if;
  if v_kademe not in ('ortaokul', 'lise') then raise exception 'Kademe ortaokul ya da lise olmalı.' using errcode = '22023'; end if;
  if v_ders is null or v_ders not between 1 and 5 then raise exception 'Ders saati 1–5 olmalı.' using errcode = '22023'; end if;
  if v_konu is null or length(v_konu) > 120 then raise exception 'Etüt konusu gerekli (en çok 120 karakter).' using errcode = '22023'; end if;
  if jsonb_array_length(coalesce(p->'ogrenciler', '[]')) = 0 then raise exception 'En az bir öğrenci seç.' using errcode = '22023'; end if;
  if jsonb_array_length(p->'ogrenciler') > 40 then raise exception 'Bir etüde en çok 40 öğrenci yazılabilir.' using errcode = '22023'; end if;

  select * into tp from profiles where id = (p->>'teacher_id')::uuid and school_id = v_school and status = 'approved';
  if tp.id is null or not (tp.role in ('admin', 'ogretmen') or has_role(tp.id, 'ogretmen') or has_role(tp.id, 'admin')) then
    raise exception 'Öğretmen bulunamadı.' using errcode = '23503';
  end if;

  -- Gün: yoksa taslak açılır (saatler istemciden: okulun ayarı ya da son program)
  select * into g from etut_gunler where school_id = v_school and tarih = v_tarih and kademe = v_kademe for update;
  if g.id is null then
    if jsonb_typeof(v_saat) <> 'array' or jsonb_array_length(v_saat) <> 5 then raise exception '5 ders saati gerekli.' using errcode = '22023'; end if;
    insert into etut_gunler (school_id, tarih, kademe, saatler, created_by) values (v_school, v_tarih, v_kademe, v_saat, auth.uid()) returning * into g;
  end if;

  -- Hücre: aynı öğretmen + ders varsa ona eklenir; meşgulse eklenmez
  select * into h from etut_hucreler where gun_id = g.id and ders = v_ders and (teacher_id = tp.id or lower(btrim(teacher_name)) = lower(btrim(tp.full_name))) for update;
  if h.id is not null and h.tur = 'mesgul' then
    raise exception '% bu derste meşgul (%). Başka bir ders saati seç.', tp.full_name, coalesce(h.aciklama, 'meşgul') using errcode = '23505';
  end if;
  if h.id is null then
    insert into etut_hucreler (gun_id, school_id, ders, teacher_id, teacher_name, tur, konu, aciklama)
    values (g.id, v_school, v_ders, tp.id, tp.full_name, 'etut', v_konu, nullif(btrim(coalesce(p->>'aciklama', '')), ''))
    returning * into h;
    yeni_hucre := true;
  end if;

  for sid in select (x)::uuid from jsonb_array_elements_text(p->'ogrenciler') x loop
    select * into st from students where id = sid and school_id = v_school and archived_at is null;
    if st.id is null then raise exception 'Öğrenci bulunamadı.' using errcode = '23503'; end if;
    if exists (select 1 from etut_ogrenciler where hucre_id = h.id and student_id = st.id) then
      zaten := zaten + 1;
      continue;
    end if;
    if exists (select 1 from etut_ogrenciler where gun_id = g.id and ders = v_ders and student_id = st.id) then
      cakisan := cakisan || st.full_name;
      continue;
    end if;
    insert into etut_ogrenciler (hucre_id, gun_id, school_id, ders, student_id, student_name, class_name)
    values (h.id, g.id, v_school, v_ders, st.id, st.full_name, st.class_name);
    eklenen := eklenen + 1;
    if g.durum = 'yayinda' then
      perform etut_bildir_ogrenci(st.id, 'Etüt programı güncellendi: ' || tr_dw(v_tarih));
    end if;
  end loop;

  -- Hiç öğrenci eklenemediyse yeni açılan boş hücre bırakılmaz
  if yeni_hucre and eklenen = 0 then delete from etut_hucreler where id = h.id; end if;
  update etut_gunler set updated_at = now() where id = g.id;
  insert into audit_log (user_id, action, entity, entity_id, meta)
  values (auth.uid(), 'etut_grup_ekle', 'etut_gunler', g.id, jsonb_build_object('ders', v_ders, 'teacher_id', tp.id, 'eklenen', eklenen, 'cakisan', cardinality(cakisan)));
  return jsonb_build_object('gun_id', g.id, 'hucre_id', case when yeni_hucre and eklenen = 0 then null else h.id end, 'durum', g.durum,
                            'eklenen', eklenen, 'zaten', zaten, 'cakisan', to_jsonb(cakisan), 'birlesti', not yeni_hucre);
end $$;
revoke all on function etut_grup_ekle(jsonb) from public, anon;
grant execute on function etut_grup_ekle(jsonb) to authenticated;
