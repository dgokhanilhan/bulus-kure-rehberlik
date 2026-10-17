-- Yönetim ayarlarının genişletilmesi: koda gömülü okul tercihleri ayara taşınır (kod yazmadan değiştirilebilir).
-- Yalnız ekleme: mevcut veri silinmez; ayarların varsayılanları bugünkü davranışla aynıdır (hiçbir şey kendiliğinden değişmez).
-- Ayar hiçbir zaman RLS'i GEVŞETEMEZ: görünürlük/yetki ayarları yalnız mevcut izinleri kısıtlayan (restrictive) politikalardır.
-- Fonksiyonlar metin yamasıyla değil, tam tanımla değiştirilir. Geri alma: supabase/geri-alma/0052_genel_ayarlar_geri_al.sql

-- ---------- Yeni ayarlar ----------
alter function setting_spec() rename to setting_spec_before_0052;
create function setting_spec() returns jsonb language sql immutable as $$
  select setting_spec_before_0052() || $j${
    "analiz.tekrar_esik":          {"type":"int","min":2,"max":10,"default":2},

    "etut.saatler_ortaokul":       {"type":"text","max":80,"pattern":"^([0-2][0-9]:[0-5][0-9]-[0-2][0-9]:[0-5][0-9],){4}[0-2][0-9]:[0-5][0-9]-[0-2][0-9]:[0-5][0-9]$","default":"09:00-09:40,09:50-10:30,10:40-11:20,11:30-12:10,12:20-13:00"},
    "etut.saatler_lise":           {"type":"text","max":80,"pattern":"^([0-2][0-9]:[0-5][0-9]-[0-2][0-9]:[0-5][0-9],){4}[0-2][0-9]:[0-5][0-9]-[0-2][0-9]:[0-5][0-9]$","default":"09:20-10:00,10:10-10:50,11:00-11:40,11:50-12:30,12:40-13:20"},
    "etut.salonlar":               {"type":"text","max":300,"default":"ETÜT-1,ETÜT-2,ETÜT-3,ETÜT-4,ETÜT-5,ETÜT-6"},
    "etut.mesgul_etiketleri":      {"type":"text","max":300,"default":"İzinli,Sınav gözetmeni,Voleybol,Toplantı,Raporlu"},
    "etut.talep_acik":             {"type":"bool","default":true},
    "etut.talep_son_gun":          {"type":"int","min":0,"max":6,"default":0},
    "etut.yoklama_ogretmen":       {"type":"bool","default":true},

    "gozetmen.dinlendirici_basina":{"type":"int","min":0,"max":40,"default":8},
    "gozetmen.ortaokul_baslangic": {"type":"text","max":5,"pattern":"^[0-2][0-9]:[0-5][0-9]$","default":"09:30"},
    "gozetmen.ortaokul_sozel_dk":  {"type":"int","min":10,"max":300,"default":75},
    "gozetmen.ortaokul_sayisal_dk":{"type":"int","min":10,"max":300,"default":80},
    "gozetmen.ortaokul_mola_dk":   {"type":"int","min":0,"max":120,"default":30},
    "gozetmen.tyt_baslangic":      {"type":"text","max":5,"pattern":"^[0-2][0-9]:[0-5][0-9]$","default":"10:15"},
    "gozetmen.tyt_dk":             {"type":"int","min":10,"max":300,"default":165},
    "gozetmen.ayt_baslangic":      {"type":"text","max":5,"pattern":"^[0-2][0-9]:[0-5][0-9]$","default":"10:00"},
    "gozetmen.ayt_dk":             {"type":"int","min":10,"max":300,"default":180},

    "rapor.ai":                    {"type":"bool","default":true},
    "rapor.logo":                  {"type":"bool","default":true},
    "rapor.veli_baslik":           {"type":"text","max":80,"default":"Veli Gelişim Raporu"},
    "rapor.ogretmen_baslik":       {"type":"text","max":80,"default":"Öğretmen Bilgilendirme Raporu"},
    "rapor.veli_alt_bilgi":        {"type":"text","max":300,"default":"Bu rapor öğrencinin yalnızca kendi önceki denemeleriyle karşılaştırılmasına dayanır."},
    "rapor.ogretmen_alt_bilgi":    {"type":"text","max":300,"default":"Kurum içi kullanım içindir. Veli ile paylaşılmaz."},
    "rapor.imza":                  {"type":"text","max":120,"default":""},

    "kayit.acik":                  {"type":"bool","default":true},
    "kayit.davet_zorunlu":         {"type":"bool","default":false},
    "guvenlik.ogretmen_mfa":       {"type":"bool","default":false},

    "aile.gorevler":               {"type":"bool","default":true},
    "aile.gorusmeler":             {"type":"bool","default":true},
    "aile.notlar":                 {"type":"bool","default":true},
    "aile.raporlar":               {"type":"bool","default":true},
    "aile.etut":                   {"type":"bool","default":true},
    "ogretmen.not_ekleme":         {"type":"bool","default":true},
    "ogretmen.rapor_gorme":        {"type":"bool","default":true},

    "metin.giris_slogan":          {"type":"text","max":160,"default":"Her deneme, öğrenciyi biraz daha iyi tanımak için."},
    "metin.kayit_notu":            {"type":"text","max":200,"default":"Kaydın okul yönetimi onayladıktan sonra açılır."},
    "metin.kayit_kapali":          {"type":"text","max":300,"default":"Okulumuz şu an yeni kayıt almıyor. Hesap için okul yönetimiyle görüşebilirsiniz."},

    "menu.ad.bugun":{"type":"text","max":30,"default":""},      "menu.ad.ogrenciler":{"type":"text","max":30,"default":""},
    "menu.ad.odevler":{"type":"text","max":30,"default":""},    "menu.ad.takvim":{"type":"text","max":30,"default":""},
    "menu.ad.denemeler":{"type":"text","max":30,"default":""},  "menu.ad.siniflar":{"type":"text","max":30,"default":""},
    "menu.ad.onaylar":{"type":"text","max":30,"default":""},    "menu.ad.yonetim":{"type":"text","max":30,"default":""},
    "menu.ad.nobet_takip":{"type":"text","max":30,"default":""},"menu.ad.panel":{"type":"text","max":30,"default":""},
    "menu.ad.ozet":{"type":"text","max":30,"default":""},       "menu.ad.okul":{"type":"text","max":30,"default":""},
    "menu.ad.duyurular":{"type":"text","max":30,"default":""},  "menu.ad.iletisim":{"type":"text","max":30,"default":""},
    "menu.ad.gorevler":{"type":"text","max":30,"default":""},   "menu.ad.raporlar":{"type":"text","max":30,"default":""},
    "menu.ad.gorusmeler":{"type":"text","max":30,"default":""}, "menu.ad.galeri":{"type":"text","max":30,"default":""},
    "menu.ad.gozetmen":{"type":"text","max":30,"default":""},   "menu.ad.etut":{"type":"text","max":30,"default":""},
    "menu.gizli.admin":{"type":"text","max":300,"default":""},  "menu.gizli.rehber":{"type":"text","max":300,"default":""},
    "menu.gizli.brans":{"type":"text","max":300,"default":""},  "menu.gizli.veli":{"type":"text","max":300,"default":""},
    "menu.gizli.ogrenci":{"type":"text","max":300,"default":""},
    "menu.sira.admin":{"type":"text","max":300,"default":""},   "menu.sira.rehber":{"type":"text","max":300,"default":""},
    "menu.sira.brans":{"type":"text","max":300,"default":""},   "menu.sira.veli":{"type":"text","max":300,"default":""},
    "menu.sira.ogrenci":{"type":"text","max":300,"default":""}
  }$j$::jsonb
$$;

-- Ayar kalıbı (pattern): spec'te "pattern" olan metin ayarı biçime uymuyorsa kaydedilmez. set_settings değiştirilmez;
-- yazdığı tabloya tetikleyici eklenir (içe aktarma dahil her yol denetlenir).
create or replace function school_settings_pattern() returns trigger
language plpgsql set search_path = public as $$
declare s jsonb := setting_spec()->new.key;
begin
  if s ? 'pattern' and (jsonb_typeof(new.value) <> 'string' or (new.value#>>'{}') !~ (s->>'pattern')) then
    raise exception '% biçimi geçersiz.', new.key using errcode = '22023';
  end if;
  return new;
end $$;
create trigger school_settings_pattern before insert or update on school_settings for each row execute function school_settings_pattern();

-- Varsayılana dön: ayar satırları silinir (spec varsayılanı geçerli olur), işlem geçmişine yazılır.
create or replace function reset_settings(p_keys text[]) returns void
language plpgsql security definer set search_path = public as $$
declare changed jsonb; school uuid := my_school();
begin
  if not is_admin() then raise exception 'Bu işlem için yönetici yetkisi ve iki adımlı doğrulama gerekir' using errcode = '42501'; end if;
  if exists (select 1 from unnest(p_keys) k where not (setting_spec() ? k)) then raise exception 'Bilinmeyen ayar.' using errcode = '22023'; end if;
  if 'genel.okul_adi' = any(p_keys) then raise exception 'Okul adı varsayılana döndürülemez.' using errcode = '22023'; end if;
  select jsonb_object_agg(key, jsonb_build_object('eski', value, 'yeni', setting_spec()->key->'default')) into changed
    from school_settings where school_id = school and key = any(p_keys);
  delete from school_settings where school_id = school and key = any(p_keys);
  if changed is not null then
    insert into audit_log (user_id, action, entity, entity_id, meta) values (auth.uid(), 'settings', 'school_settings', school, changed);
  end if;
end $$;
revoke all on function reset_settings(text[]) from public, anon;
grant execute on function reset_settings(text[]) to authenticated;

-- Ayar ekranı için tür/sınır/varsayılan listesi (gizli bilgi yok)
create or replace function setting_spec_public() returns jsonb language sql stable as $$ select setting_spec() $$;
revoke all on function setting_spec_public() from public, anon;
grant execute on function setting_spec_public() to authenticated;

-- ---------- Görünürlük ve yetki ayarları (yalnız kısıtlar) ----------
create or replace function ayar_bool(p_key text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((setting(p_key))::text::boolean, true)
$$;
revoke all on function ayar_bool(text) from public, anon;
grant execute on function ayar_bool(text) to authenticated;

-- Veli/öğrenci bölümleri: kapalıysa öğretmen olmayan hesap (veli, öğrenci) o veriyi okuyamaz/değiştiremez.
create policy aile_gorevler on tasks as restrictive for all to authenticated using (is_teacher() or ayar_bool('aile.gorevler'));
create policy aile_gorusmeler on meetings as restrictive for all to authenticated using (is_teacher() or ayar_bool('aile.gorusmeler'));
create policy aile_notlar on notes as restrictive for select to authenticated using (is_teacher() or ayar_bool('aile.notlar'));
create policy aile_raporlar on reports as restrictive for select to authenticated using (is_teacher() or ayar_bool('aile.raporlar'));
create policy aile_etut_gun on etut_gunler as restrictive for select to authenticated using (is_teacher() or ayar_bool('aile.etut'));
create policy aile_etut_hucre on etut_hucreler as restrictive for select to authenticated using (is_teacher() or ayar_bool('aile.etut'));
create policy aile_etut_ogrenci on etut_ogrenciler as restrictive for select to authenticated using (is_teacher() or ayar_bool('aile.etut'));
-- Öğretmen yetkileri: rehber/yönetici etkilenmez.
create policy ogretmen_not_ekleme on notes as restrictive for insert to authenticated with check (is_staff() or not is_teacher() or ayar_bool('ogretmen.not_ekleme'));
create policy ogretmen_rapor_gorme on reports as restrictive for select to authenticated using (is_staff() or type <> 'ogretmen' or ayar_bool('ogretmen.rapor_gorme'));

-- ---------- Öğretmenlerde iki adımlı doğrulama zorunluluğu (yöneticide zaten zorunlu) ----------
create or replace function requires_mfa() returns boolean language sql stable security definer set search_path = public as $$
  select has_role(auth.uid(), 'admin')
      or exists (select 1 from auth.mfa_factors where user_id = auth.uid() and status = 'verified' and factor_type = 'totp')
      or (has_role(auth.uid(), 'ogretmen')
          and coalesce((school_setting((select school_id from profiles where id = auth.uid()), 'guvenlik.ogretmen_mfa'))::text::boolean, false))
$$;

-- ---------- Kayıt formu açık/kapalı, davetle kayıt zorunluluğu ----------
-- Kendi kendine kayıt (davet niyeti olmayan) okul ayarı kapalıysa reddedilir. Davetle açılan hesaplar etkilenmez.
-- Tetikleyici adı "zy": davet niyetini silen KVKK tetikleyicisinden (zz_consent) önce çalışır.
create or replace function handle_new_user_kayit() returns trigger
language plpgsql security definer set search_path = public as $$
declare sch uuid; invited boolean;
begin
  if session_user <> 'supabase_auth_admin' then return new; end if;
  invited := exists (select 1 from invite_intents i where i.email = lower(new.email) and i.created_at > now() - interval '10 minutes');
  if invited then return new; end if;
  select id into sch from schools where slug = new.raw_user_meta_data->>'school';
  if sch is null then return new; end if;
  if not coalesce((school_setting(sch, 'kayit.acik'))::text::boolean, true)
     or coalesce((school_setting(sch, 'kayit.davet_zorunlu'))::text::boolean, false) then
    raise exception 'Okul şu an yeni kayıt almıyor.' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger on_auth_user_zy_kayit after insert on auth.users for each row execute function handle_new_user_kayit();

-- Giriş ekranı: okul adı, logo ve giriş/kayıt metinleri (başka bilgi yok)
create or replace function public_school_info(p_slug text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('name', s.name,
    'logo', nullif((select value#>>'{}' from school_settings where school_id = s.id and key = 'genel.logo'), ''),
    'alt_baslik', school_setting(s.id, 'genel.alt_baslik')#>>'{}',
    'slogan', school_setting(s.id, 'metin.giris_slogan')#>>'{}',
    'kayit_notu', school_setting(s.id, 'metin.kayit_notu')#>>'{}',
    'kayit_kapali', school_setting(s.id, 'metin.kayit_kapali')#>>'{}',
    'kayit', coalesce((school_setting(s.id, 'kayit.acik'))::text::boolean, true)
             and not coalesce((school_setting(s.id, 'kayit.davet_zorunlu'))::text::boolean, false))
  from schools s where s.slug = p_slug
$$;

-- ---------- Etüt ayarları (0051 fonksiyonlarının ayara bağlanmış hâli) ----------
create or replace function etut_yoklama(p_hucre uuid, p_ogrenci uuid, p_durum text) returns void
language plpgsql security definer set search_path = public as $$
declare h etut_hucreler; g etut_gunler;
begin
  perform etut_modul_acik();
  select * into h from etut_hucreler where id = p_hucre and school_id = my_school();
  if h.id is null then raise exception 'Etüt bulunamadı.' using errcode = '23503'; end if;
  if not (is_staff() or (h.teacher_id = auth.uid() and is_teacher() and ayar_bool('etut.yoklama_ogretmen'))) then
    raise exception 'Yoklamayı etüdün öğretmeni ya da rehber öğretmen girer.' using errcode = '42501';
  end if;
  select * into g from etut_gunler where id = h.gun_id;
  if g.durum <> 'yayinda' then raise exception 'Program yayınlanmadan yoklama alınmaz.' using errcode = '22023'; end if;
  if g.tarih > tr_today() then raise exception 'Yoklama etüt günü ya da sonrasında alınır.' using errcode = '22023'; end if;
  if p_durum is not null and p_durum not in ('geldi', 'gelmedi') then raise exception 'Yoklama geldi ya da gelmedi olmalı.' using errcode = '22023'; end if;
  update etut_ogrenciler set yoklama = p_durum, yoklama_by = case when p_durum is null then null else auth.uid() end,
         yoklama_at = case when p_durum is null then null else now() end
   where hucre_id = h.id and student_id = p_ogrenci;
  if not found then raise exception 'Öğrenci bu etütte değil.' using errcode = '23503'; end if;
end $$;

create or replace function etut_talep_ekle(p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_ogr uuid[]; x uuid; me profiles; v_tarih date := nullif(p->>'istenen_tarih', '')::date; son int;
begin
  if not is_teacher() then raise exception 'Etüt talebini öğretmenler oluşturur.' using errcode = '42501'; end if;
  perform etut_modul_acik();
  if not ayar_bool('etut.talep_acik') then raise exception 'Etüt talepleri okul yönetimi tarafından kapatıldı.' using errcode = '42501'; end if;
  son := coalesce((setting('etut.talep_son_gun'))::text::int, 0);
  if v_tarih is not null and son > 0 and v_tarih - tr_today() < son then
    raise exception 'Bu Cumartesi için talep süresi geçti (en geç % gün önce).', son using errcode = '22023';
  end if;
  select * into me from profiles where id = auth.uid();
  v_ogr := array(select distinct (e#>>'{}')::uuid from jsonb_array_elements(coalesce(p->'ogrenciler', '[]')) e);
  if cardinality(v_ogr) = 0 then raise exception 'En az bir öğrenci seç.' using errcode = '22023'; end if;
  foreach x in array v_ogr loop
    if not exists (select 1 from students where id = x and school_id = my_school()) or not can_see_student(x) then
      raise exception 'Seçilen öğrencilerden biri için yetkin yok.' using errcode = '42501';
    end if;
  end loop;
  insert into etut_talepler (school_id, teacher_id, teacher_name, konu, aciklama, ogrenciler, istenen_tarih, istenen_ders)
  values (my_school(), auth.uid(), me.full_name, btrim(p->>'konu'), nullif(btrim(p->>'aciklama'), ''), v_ogr,
          v_tarih, nullif(p->>'istenen_ders', '')::smallint)
  returning id into v_id;
  insert into notifications (user_id, text, link, type)
  select u, 'Yeni etüt talebi: ' || me.full_name || ' · ' || btrim(p->>'konu'), '{"page":"etut"}', 'etut'
  from staff_accounts(my_school()) u where u <> auth.uid();
  return v_id;
end $$;
