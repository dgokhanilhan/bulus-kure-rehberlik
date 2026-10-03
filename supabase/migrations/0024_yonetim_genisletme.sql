-- Yönetim Merkezi genişletme: sınıf aktif/pasif, öğrenci değişikliklerine işlem kaydı, modül açma/kapamaya işlem kaydı,
-- "Öğretmenler ödev verebilir" ayarı (veritabanında zorlanır), yönetici "Bugün" ekranı kart düzeni, kartlara isteğe bağlı genişlik.
-- Yalnız ekleme: veri silmez, tablo/sütun düşürmez. Mevcut davranış değişmez (yeni ayarların varsayılanları bugünkü davranış).

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
    "modul.galeri":              {"type":"bool","default":false},
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
    "odev.ogretmen_verebilir":   {"type":"bool","default":true},
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
    "bildirim.galeri":           {"type":"bool","default":true},
    "galeri.ogretmen_album":     {"type":"bool","default":false},
    "galeri.ogretmen_yukleme":   {"type":"bool","default":false},
    "galeri.ogretmen_kapsam":    {"type":"enum","values":["sinif","kademe","okul"],"default":"sinif"},
    "galeri.onay":               {"type":"bool","default":true},
    "galeri.indirme":            {"type":"bool","default":false},
    "galeri.max_foto_mb":        {"type":"int","min":1,"max":25,"default":15},
    "galeri.max_video_mb":       {"type":"int","min":1,"max":500,"default":50},
    "bursluluk.basvuru_acik":    {"type":"bool","default":true},
    "bursluluk.aciklama":        {"type":"text","max":1000,"default":""},
    "panel.veli":                {"type":"layout","ids":["duyuru","odev","yoklama","program","yemek","takvim","mesaj","lgs","bursluluk"],
                                  "default":[{"id":"duyuru","on":true},{"id":"odev","on":true},{"id":"program","on":true},{"id":"yemek","on":true},{"id":"yoklama","on":true},{"id":"takvim","on":true},{"id":"mesaj","on":true},{"id":"lgs","on":true},{"id":"bursluluk","on":false}]},
    "panel.ogrenci":             {"type":"layout","ids":["duyuru","odev","yoklama","program","yemek","takvim","lgs","bursluluk"],
                                  "default":[{"id":"program","on":true},{"id":"odev","on":true},{"id":"duyuru","on":true},{"id":"takvim","on":true},{"id":"yemek","on":true},{"id":"yoklama","on":true},{"id":"lgs","on":true},{"id":"bursluluk","on":false}]},
    "panel.yonetim":             {"type":"layout","ids":["deneme","devamsizlik","gorusmeler","gorevler"],
                                  "default":[{"id":"deneme","on":true},{"id":"devamsizlik","on":true},{"id":"gorusmeler","on":true},{"id":"gorevler","on":true}]},
    "panel.ogretmen":            {"type":"layout","ids":["derslerim","odev_kontrol","duyuru","takvim","mesaj","devamsizlik","yemek"],
                                  "default":[{"id":"derslerim","on":true},{"id":"odev_kontrol","on":true},{"id":"duyuru","on":true},{"id":"takvim","on":true},{"id":"mesaj","on":true},{"id":"devamsizlik","on":true},{"id":"yemek","on":false}]}
  }'::jsonb
$$;

-- Kart düzeni: {"id","on"} + isteğe bağlı "w" (dar | genis). Gövde korunur, yalnız ilgili koşul değişir.
create or replace function pg_temp.yama(fn regprocedure, a text, b text) returns void language plpgsql as $$
declare src text;
begin
  src := pg_get_functiondef(fn);
  if position(a in src) = 0 then
    if position(b in src) > 0 then return; end if;
    raise exception 'Yama uygulanamadı: % → %', fn, a;
  end if;
  execute replace(src, a, b);
end $$;
select pg_temp.yama('set_settings(jsonb)',
  $x$or (select count(*) from jsonb_object_keys(x)) <> 2)$x$,
  $x$or exists (select 1 from jsonb_object_keys(x) kk where kk not in ('id', 'on', 'w'))
                         or (x ? 'w' and coalesce(x->>'w', '') not in ('dar', 'genis')))$x$);

-- ---------- Sınıf aktif/pasif ----------
-- Pasif sınıf: öğrencileri ve geçmişi kalır; kayıt formunda ve seçim listelerinde görünmez. Silme yerine önerilen yol.
alter table classes add column if not exists active boolean not null default true;

create or replace function signup_classes(p_school text)
returns table (name text, grade smallint, level text)
language sql stable security definer set search_path = public as $$
  select c.name, c.grade, c.level from classes c join schools s on s.id = c.school_id
  where s.slug = p_school and c.active order by c.grade, c.section
$$;

-- ---------- İşlem kaydı ----------
-- Öğrenci ekleme/düzenleme/arşivleme/silme (mevcut genel audit_row standardıyla: insert/update/delete, entity students)
drop trigger if exists audit_students on students;
create trigger audit_students after insert or update or delete on students for each row execute function audit_row();

-- Duyuru yayınlama/silme (Yönetim Merkezi → Duyurular listesinden silme dahil)
drop trigger if exists audit_announcements on announcements;
create trigger audit_announcements after insert or delete on announcements for each row execute function audit_row();

-- Modül açma/kapama ayrıca "module_toggle" olarak (ayar değişikliği zaten "settings" olarak kaydediliyor)
create or replace function module_toggle_audit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.key like 'modul.%' and (tg_op = 'INSERT' or new.value is distinct from old.value) then
    insert into audit_log (user_id, action, entity, entity_id, meta)
    values (auth.uid(), 'module_toggle', 'school_settings', new.school_id,
            jsonb_build_object('module', substr(new.key, 7), 'on', new.value));
  end if;
  return null;
end $$;
drop trigger if exists school_settings_module_audit on school_settings;
create trigger school_settings_module_audit after insert or update on school_settings for each row execute function module_toggle_audit();

-- ---------- Ödev: "Öğretmenler ödev verebilir" ----------
-- Kapalıyken yalnız yönetici ödev verir (veritabanında; arayüzdeki düğme ayrıca gizlenir).
create or replace function can_assign_homework(p_class uuid, p_course uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_admin() or (is_teacher() and coalesce((setting('odev.ogretmen_verebilir'))::text::boolean, true) and (
       exists (select 1 from teaching_assignments a where a.class_id = p_class and a.course_id = p_course and a.teacher_id = auth.uid())
    or exists (select 1 from timetable t where t.class_id = p_class and t.course_id = p_course and t.teacher_id = auth.uid())
    or exists (select 1 from classes c where c.id = p_class and c.homeroom_teacher_id = auth.uid())))
$$;
