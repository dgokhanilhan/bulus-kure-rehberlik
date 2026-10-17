-- 0052_genel_ayarlar GERİ ALMA (yalnız gerekirse; migration değildir).
-- Yeni ayarlar, kısıtlayıcı politikalar, kayıt tetikleyicisi ve yardımcılar kaldırılır; fonksiyonlar 0051/0044/0014 hâline döner.
-- Ayar satırları (school_settings) silinmez; spec'te olmayan anahtarlar okunmaz, zararsızdır.
drop trigger if exists on_auth_user_zy_kayit on auth.users;
drop function if exists handle_new_user_kayit();
drop trigger if exists school_settings_pattern on school_settings;
drop function if exists school_settings_pattern();
drop function if exists reset_settings(text[]);
drop function if exists setting_spec_public();
drop policy if exists aile_gorevler on tasks;
drop policy if exists aile_gorusmeler on meetings;
drop policy if exists aile_notlar on notes;
drop policy if exists aile_raporlar on reports;
drop policy if exists aile_etut_gun on etut_gunler;
drop policy if exists aile_etut_hucre on etut_hucreler;
drop policy if exists aile_etut_ogrenci on etut_ogrenciler;
drop policy if exists ogretmen_not_ekleme on notes;
drop policy if exists ogretmen_rapor_gorme on reports;

create or replace function requires_mfa() returns boolean language sql stable security definer set search_path = public as $$
  select has_role(auth.uid(), 'admin') or exists (select 1 from auth.mfa_factors where user_id = auth.uid() and status = 'verified' and factor_type = 'totp')
$$;
create or replace function public_school_info(p_slug text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('name', s.name,
    'logo', nullif((select value#>>'{}' from school_settings where school_id = s.id and key = 'genel.logo'), ''))
  from schools s where s.slug = p_slug
$$;

-- Etüt fonksiyonları: ayar denetimi olmayan 0051 hâline dönmek için 0051_etut.sql içindeki etut_yoklama ve
-- etut_talep_ekle tanımlarını yeniden çalıştır (bu iki fonksiyon ayar_bool'a bağlı olduğundan önce onlar yenilenmeli).
-- Ardından:  drop function if exists ayar_bool(text);

drop function if exists setting_spec();
alter function setting_spec_before_0052() rename to setting_spec;
