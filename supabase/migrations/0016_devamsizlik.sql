-- Faz E · Devamsızlık raporu ve devamsızlık sınırı uyarıları. Mevcut yoklama tablosu ve ekranı aynen kalır.
-- Sınırlar ve uyarı eşikleri koda sabitlenmez; Yönetim Merkezi → Yoklama ayarları'ndan değişir.
-- "Raporsuz" = gelmedi (+ ayara göre geç kalma yarım/tam gün). Raporlu ve izinli ayrı sayılır; "toplam" sınırı
-- (0 = kapalı) hepsini kapsar. Dönemler aktif eğitim yılının tarihlerinden gelir. Yalnız bilgilendirmedir: sistem
-- hiçbir karar vermez, kaydı değiştirmez.

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
    "bildirim.not":              {"type":"bool","default":true}
  }'::jsonb
$$;

-- ---------- Hesap ----------
-- Belirli tarih aralığında durum sayıları (geç kalma katsayısıyla raporsuz gün).
create or replace function attendance_counts(p_student uuid, p_from date, p_to date) returns jsonb
language sql stable security definer set search_path = public as $$
  with a as (select status from attendance where student_id = p_student and day between p_from and p_to),
       k as (select case (school_setting(s.school_id, 'yoklama.gec_sayim'))#>>'{}' when 'yarim' then 0.5 when 'tam' then 1 else 0 end f
             from students s where s.id = p_student)
  select jsonb_build_object(
    'devamsiz', (select count(*) from a where status = 'devamsiz'),
    'gec', (select count(*) from a where status = 'gec'),
    'izinli', (select count(*) from a where status = 'izinli'),
    'raporlu', (select count(*) from a where status = 'raporlu'),
    'raporsuz', (select count(*) filter (where status = 'devamsiz') + count(*) filter (where status = 'gec') * (select f from k) from a),
    'toplam', (select count(*) filter (where status <> 'gec') + count(*) filter (where status = 'gec') * (select f from k) from a))
$$;
revoke all on function attendance_counts(uuid, date, date) from public, anon, authenticated;

-- Öğrencinin sınır durumu (aktif eğitim yılı): dönemler, yıllık, toplam; en kötü oran ve renk seviyesi.
create or replace function attendance_limits_of(p_student uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  s students; y academic_years; t1 jsonb; t2 jsonb; yr jsonb; today date := (now() at time zone 'Europe/Istanbul')::date;
  l1 int; l2 int; ly int; lt int; sari int; tur int; cur int; items jsonb := '[]'; it jsonb; worst numeric := 0; lvl text := 'normal';
begin
  select * into s from students where id = p_student;
  select * into y from academic_years where school_id = s.school_id and is_active;
  if s.id is null or y.id is null then return null; end if;
  l1 := (school_setting(s.school_id, 'yoklama.limit_donem1'))::text::int;
  l2 := (school_setting(s.school_id, 'yoklama.limit_donem2'))::text::int;
  ly := (school_setting(s.school_id, 'yoklama.limit_yillik'))::text::int;
  lt := (school_setting(s.school_id, 'yoklama.limit_toplam'))::text::int;
  sari := (school_setting(s.school_id, 'yoklama.uyari_sari'))::text::int;
  tur := (school_setting(s.school_id, 'yoklama.uyari_turuncu'))::text::int;
  t1 := attendance_counts(p_student, y.starts, y.term1_ends);
  t2 := attendance_counts(p_student, y.term2_starts, y.ends);
  yr := attendance_counts(p_student, y.starts, y.ends);
  cur := case when today > y.term1_ends then 2 else 1 end;
  items := jsonb_build_array(
    jsonb_build_object('key', 'donem1', 'label', '1. dönem raporsuz', 'used', t1->'raporsuz', 'limit', l1, 'current', cur = 1),
    jsonb_build_object('key', 'donem2', 'label', '2. dönem raporsuz', 'used', t2->'raporsuz', 'limit', l2, 'current', cur = 2),
    jsonb_build_object('key', 'yillik', 'label', 'Yıllık raporsuz', 'used', yr->'raporsuz', 'limit', ly, 'current', true),
    jsonb_build_object('key', 'toplam', 'label', 'Yıllık toplam (raporlu, izinli dahil)', 'used', yr->'toplam', 'limit', lt, 'current', true));
  -- Seviye: yalnız içinde bulunulan dönem, yıllık ve toplam (0 = sınır yok) dikkate alınır
  for it in select * from jsonb_array_elements(items) loop
    if (it->>'current')::boolean and (it->>'limit')::int > 0 then
      worst := greatest(worst, (it->>'used')::numeric / (it->>'limit')::int);
    end if;
  end loop;
  lvl := case when worst >= 1 then 'kirmizi' when worst * 100 >= tur then 'turuncu' when worst * 100 >= sari then 'sari' else 'normal' end;
  return jsonb_build_object('year', y.name, 'term', cur, 'items', items, 'ratio', round(worst, 3), 'level', lvl,
                            'term1', t1, 'term2', t2, 'yearly', yr, 'thresholds', jsonb_build_object('sari', sari, 'turuncu', tur));
end $$;
revoke all on function attendance_limits_of(uuid) from public, anon, authenticated;

-- İstemci: yalnız görebildiği öğrenci için.
create or replace function attendance_limits(p_student uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select case when can_see_student(p_student) and (is_admin() or module_enabled('yoklama')) then attendance_limits_of(p_student) end
$$;
grant execute on function attendance_limits(uuid) to authenticated;

-- Sınıra yaklaşan öğrenciler (öğretmen/yönetim ekranı): sarı ve üstü, en risklisi başta.
create or replace function attendance_watchlist() returns table (student_id uuid, full_name text, class_name text, level text, ratio numeric, label text, used numeric, lim int)
language sql stable security definer set search_path = public as $$
  select x.id, x.full_name, x.class_name, x.r->>'level', (x.r->>'ratio')::numeric, w->>'label', (w->>'used')::numeric, (w->>'limit')::int
  from (select s.id, s.full_name, s.class_name, attendance_limits_of(s.id) r
        from students s where s.school_id = my_school() and s.archived_at is null and exists (select 1 from attendance a where a.student_id = s.id)) x
  cross join lateral (
    select i w from jsonb_array_elements(x.r->'items') i
    where (i->>'current')::boolean and (i->>'limit')::int > 0
    order by (i->>'used')::numeric / (i->>'limit')::int desc limit 1) m
  where is_teacher() and (is_admin() or module_enabled('yoklama')) and x.r->>'level' <> 'normal'
  order by (x.r->>'ratio')::numeric desc, x.full_name
$$;
grant execute on function attendance_watchlist() to authenticated;

-- 9 → "9", 9.5 → "9,5"
create or replace function gun_txt(n numeric) returns text language sql immutable as $$
  select case when n = trunc(n) then trunc(n)::text else replace(trim(to_char(n, 'FM999990.0')), '.', ',') end
$$;

-- ---------- Uyarı bildirimi ----------
-- Turuncu ya da kırmızı eşiğe ilk kez gelince veli, öğrenci ve sınıf öğretmenine bir kez (ayar açıksa).
create table attendance_alerts (
  student_id uuid not null references students(id) on delete cascade,
  academic_year_id uuid not null references academic_years(id) on delete cascade,
  key text not null,
  level text not null check (level in ('turuncu', 'kirmizi')),
  created_at timestamptz not null default now(),
  primary key (student_id, academic_year_id, key)
);
alter table attendance_alerts enable row level security;
create policy alerts_read on attendance_alerts for select using (can_see_student(student_id));

create or replace function attendance_alert_check() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  sid uuid := coalesce(new.student_id, old.student_id); s students; r jsonb; it jsonb; y uuid; prev text; lvl text;
  ratio numeric; tur int; used numeric; lim int;
begin
  select * into s from students where id = sid;
  if not (school_setting(s.school_id, 'yoklama.veli_uyari'))::text::boolean then return null; end if;
  r := attendance_limits_of(sid);
  if r is null then return null; end if;
  select id into y from academic_years where school_id = s.school_id and is_active;
  tur := (r->'thresholds'->>'turuncu')::int;
  for it in select * from jsonb_array_elements(r->'items') loop
    lim := (it->>'limit')::int; used := (it->>'used')::numeric;
    continue when not (it->>'current')::boolean or lim <= 0;
    ratio := used / lim;
    lvl := case when ratio >= 1 then 'kirmizi' when ratio * 100 >= tur then 'turuncu' end;
    continue when lvl is null;
    select level into prev from attendance_alerts where student_id = sid and academic_year_id = y and key = it->>'key';
    continue when prev = 'kirmizi' or prev = lvl;
    insert into attendance_alerts (student_id, academic_year_id, key, level) values (sid, y, it->>'key', lvl)
    on conflict (student_id, academic_year_id, key) do update set level = excluded.level, created_at = now();
    perform notify_many(
      array(select parent_accounts(sid)) || array(select student_accounts(sid))
        || array(select c.homeroom_teacher_id from classes c where c.id = s.class_id and c.homeroom_teacher_id is not null),
      s.full_name || ': ' || lower(it->>'label') || ' devamsızlık ' || gun_txt(used) || '/' || lim || ' gün' ||
        case when lvl = 'kirmizi' then ' (sınıra ulaştı).' else ' (sınıra ' || gun_txt(lim - used) || ' gün kaldı).' end,
      jsonb_build_object('page', 'okul'));
  end loop;
  return null;
end $$;
create trigger attendance_alert_check after insert or update or delete on attendance for each row execute function attendance_alert_check();
