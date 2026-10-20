-- 0054_hedef_okullar (ve 0055 verisi) geri alma: yalnız bu migration'ların eklediklerini kaldırır.
drop function if exists hedef_ozet();
drop function if exists hedef_sil(text, smallint);
drop function if exists hedef_yukle(text, smallint, text, jsonb, boolean);
drop table if exists ogrenci_hedefleri;
drop table if exists hedef_programlar;
drop function if exists ogrenci_hedefi_damga();
drop function if exists setting_spec();
alter function setting_spec_before_0054() rename to setting_spec;
