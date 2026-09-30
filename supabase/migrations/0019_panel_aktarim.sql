-- Faz H · Dashboard builder ve toplu aktarım.
-- Ana sayfa kartları rol başına (veli / öğrenci / öğretmen) ayardan gelir: hangi kart görünür, hangi sırada
-- ("layout" türü: [{"id","on"}], yalnız bilinen kartlar). Toplu öğrenci aktarımı: önce istemcide önizleme,
-- sonra import_students() sunucuda yeniden doğrular ve tek işlemde yazar (bir satır bile hatalıysa hiçbiri yazılmaz).

-- ---------- Ayarlar ----------
create or replace function setting_spec() returns jsonb language sql immutable as $$
  select '{
    "genel.okul_adi":            {"type":"text","max":120},
    "genel.telefon":             {"type":"text","max":40,  "default":""},
    "genel.eposta":              {"type":"text","max":120, "default":""},
    "genel.adres":               {"type":"text","max":300, "default":""},
    "genel.logo":                {"type":"text","max":300, "default":""},
    "modul.lgs":                 {"type":"bool","default":true},
    "modul.yoklama":             {"type":"bool","default":true},
    "modul.ders_programi":       {"type":"bool","default":true},
    "modul.yemek":               {"type":"bool","default":true},
    "modul.duyuru":              {"type":"bool","default":true},
    "modul.mesaj":               {"type":"bool","default":true},
    "modul.odev":                {"type":"bool","default":true},
    "modul.takvim":              {"type":"bool","default":true},
    "modul.bursluluk":           {"type":"bool","default":false},
    "yoklama.ogretmen_girebilir":{"type":"bool","default":false},
    "yoklama.limit_donem1":      {"type":"int","min":0,"max":180,"default":10},
    "yoklama.limit_donem2":      {"type":"int","min":0,"max":180,"default":10},
    "yoklama.limit_yillik":      {"type":"int","min":0,"max":180,"default":20},
    "yoklama.limit_toplam":      {"type":"int","min":0,"max":180,"default":0},
    "yoklama.uyari_sari":        {"type":"int","min":1,"max":99,"default":70},
    "yoklama.uyari_turuncu":     {"type":"int","min":1,"max":99,"default":90},
    "yoklama.gec_sayim":         {"type":"enum","values":["yok","yarim","tam"],"default":"yok"},
    "yoklama.veli_uyari":        {"type":"bool","default":true},
    "odev.son_tarih_zorunlu":    {"type":"bool","default":true},
    "odev.veli_durum_gorur":     {"type":"bool","default":true},
    "odev.geciken_kirmizi":      {"type":"bool","default":true},
    "odev.bildirim_yeni":        {"type":"bool","default":true},
    "odev.bildirim_kontrol":     {"type":"bool","default":true},
    "odev.hatirlatma_gun":       {"type":"int","min":0,"max":14,"default":1},
    "odev.ogretmen_dosya":       {"type":"bool","default":true},
    "odev.ogrenci_dosya":        {"type":"bool","default":false},
    "dosya.max_mb":              {"type":"int","min":1,"max":25,"default":10},
    "dosya.gorsel":              {"type":"bool","default":true},
    "dosya.pdf":                 {"type":"bool","default":true},
    "mesaj.dosya":               {"type":"bool","default":true},
    "duyuru.dosya":              {"type":"bool","default":true},
    "duyuru.ogretmen_yazabilir": {"type":"bool","default":true},
    "duyuru.ogretmen_kapsam":    {"type":"enum","values":["sinif","kademe","okul"],"default":"sinif"},
    "duyuru.gosterim_gun":       {"type":"int","min":1,"max":365,"default":14},
    "takvim.ogretmen_ekler":     {"type":"bool","default":true},
    "takvim.hatirlatma_gun":     {"type":"int","min":0,"max":14,"default":1},
    "bildirim.mesaj":            {"type":"bool","default":true},
    "bildirim.duyuru":           {"type":"bool","default":true},
    "bildirim.sinav":            {"type":"bool","default":true},
    "bildirim.etkinlik":         {"type":"bool","default":true},
    "bildirim.sinav_hatirlatma": {"type":"bool","default":true},
    "bildirim.devamsizlik":      {"type":"bool","default":true},
    "bildirim.rapor":            {"type":"bool","default":true},
    "bildirim.deneme":           {"type":"bool","default":true},
    "bildirim.gorev":            {"type":"bool","default":true},
    "bildirim.gorusme":          {"type":"bool","default":true},
    "bildirim.not":              {"type":"bool","default":true},
    "bildirim.bursluluk":        {"type":"bool","default":true},
    "bursluluk.basvuru_acik":    {"type":"bool","default":true},
    "bursluluk.aciklama":        {"type":"text","max":1000,"default":""},
    "panel.veli":                {"type":"layout","ids":["duyuru","odev","yoklama","program","yemek","takvim","mesaj","lgs","bursluluk"],
                                  "default":[{"id":"duyuru","on":true},{"id":"odev","on":true},{"id":"program","on":true},{"id":"yemek","on":true},{"id":"yoklama","on":true},{"id":"takvim","on":true},{"id":"mesaj","on":true},{"id":"lgs","on":true},{"id":"bursluluk","on":false}]},
    "panel.ogrenci":             {"type":"layout","ids":["duyuru","odev","yoklama","program","yemek","takvim","lgs","bursluluk"],
                                  "default":[{"id":"program","on":true},{"id":"odev","on":true},{"id":"duyuru","on":true},{"id":"takvim","on":true},{"id":"yemek","on":true},{"id":"yoklama","on":true},{"id":"lgs","on":true},{"id":"bursluluk","on":false}]},
    "panel.ogretmen":            {"type":"layout","ids":["derslerim","odev_kontrol","duyuru","takvim","mesaj","devamsizlik","yemek"],
                                  "default":[{"id":"derslerim","on":true},{"id":"odev_kontrol","on":true},{"id":"duyuru","on":true},{"id":"takvim","on":true},{"id":"mesaj","on":true},{"id":"devamsizlik","on":true},{"id":"yemek","on":false}]}
  }'::jsonb
$$;

-- set_settings: "layout" türü (0011 gövdesi korunur; 0014'teki enum eklemesinin üstüne).
do $$
declare src text;
begin
  select pg_get_functiondef('set_settings(jsonb)'::regprocedure) into src;
  src := replace(src, '      else raise exception ''Ayar türü tanımsız: %'', k;',
'      when ''layout'' then
        if jsonb_typeof(v) <> ''array'' or jsonb_array_length(v) > 30
           or exists (select 1 from jsonb_array_elements(v) x
                      where jsonb_typeof(x) <> ''object'' or not (s->''ids'' ? (x->>''id'')) or jsonb_typeof(x->''on'') <> ''boolean''
                         or (select count(*) from jsonb_object_keys(x)) <> 2)
           or (select count(distinct x->>''id'') from jsonb_array_elements(v) x) <> jsonb_array_length(v) then
          raise exception ''% için kart düzeni geçersiz.'', k using errcode = ''22023'';
        end if;
      else raise exception ''Ayar türü tanımsız: %'', k;');
  if position('when ''layout''' in src) = 0 then raise exception 'set_settings güncellenemedi'; end if;
  execute src;
end $$;

-- ---------- Toplu öğrenci aktarımı ----------
-- p: [{"full_name","class_name","school_no"}], en çok 2000 satır. Sınıf okulda açılmış olmalı; okul no ne dosyada ne
-- okulda tekrar edebilir; aynı ad + sınıf okulda varsa satır "zaten var" sayılır. Hepsi ya da hiçbiri.
create or replace function import_students(p jsonb, p_dry_run boolean default false) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  school uuid := my_school(); r jsonb; i int := 0; errs jsonb := '[]'; ok int := 0; v_name text; v_cls text; v_no text; c classes;
  seen_no text[] := '{}'; seen_key text[] := '{}';
begin
  if not is_admin() then raise exception 'Bu işlem için yönetici yetkisi ve iki adımlı doğrulama gerekir' using errcode = '42501'; end if;
  if jsonb_typeof(p) <> 'array' or jsonb_array_length(p) = 0 then raise exception 'Aktarılacak satır yok.' using errcode = '22023'; end if;
  if jsonb_array_length(p) > 2000 then raise exception 'Bir seferde en fazla 2000 öğrenci aktarılabilir.' using errcode = '22023'; end if;
  for r in select * from jsonb_array_elements(p) loop
    i := i + 1;
    v_name := btrim(regexp_replace(coalesce(r->>'full_name', ''), '\s+', ' ', 'g'));
    v_cls := upper(replace(btrim(coalesce(r->>'class_name', '')), ' ', ''));
    v_no := nullif(regexp_replace(coalesce(r->>'school_no', ''), '\D', '', 'g'), '');
    select * into c from classes where school_id = school and classes.name = v_cls;
    if length(v_name) < 3 or length(v_name) > 80 then errs := errs || jsonb_build_object('row', i, 'error', 'Ad soyad geçersiz');
    elsif c.id is null then errs := errs || jsonb_build_object('row', i, 'error', 'Sınıf açılmamış: ' || coalesce(nullif(v_cls, ''), '(boş)'));
    elsif v_no is not null and (v_no = any(seen_no) or exists (select 1 from students where school_id = school and school_no = v_no)) then
      errs := errs || jsonb_build_object('row', i, 'error', 'Okul no zaten kayıtlı: ' || v_no);
    elsif lower(v_name) || '|' || v_cls = any(seen_key)
       or exists (select 1 from students where school_id = school and lower(full_name) = lower(v_name) and class_name = v_cls and archived_at is null) then
      errs := errs || jsonb_build_object('row', i, 'error', 'Bu öğrenci bu sınıfta zaten var');
    else
      ok := ok + 1;
      seen_no := seen_no || v_no;
      seen_key := seen_key || (lower(v_name) || '|' || v_cls);
      if not p_dry_run then
        insert into students (school_id, full_name, class_id, school_no) values (school, v_name, c.id, v_no);
      end if;
    end if;
  end loop;
  if jsonb_array_length(errs) > 0 and not p_dry_run then
    raise exception 'Aktarım yapılmadı: % satır hatalı.', jsonb_array_length(errs) using errcode = '22023', detail = errs::text;
  end if;
  if not p_dry_run then
    insert into audit_log (user_id, action, entity, entity_id, meta) values (auth.uid(), 'import', 'students', null, jsonb_build_object('count', ok));
  end if;
  return jsonb_build_object('ok', ok, 'errors', errs);
end $$;
revoke all on function import_students(jsonb, boolean) from public, anon;
grant execute on function import_students(jsonb, boolean) to authenticated;
