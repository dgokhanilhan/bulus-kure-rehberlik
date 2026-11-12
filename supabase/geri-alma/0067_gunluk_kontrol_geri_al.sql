-- 0067_gunluk_kontrol geri alma: yalnız bu migration'ın eklediklerini kaldırır (günlük kontrol kayıtları ve geçmişi silinir;
-- veliye gitmiş bildirimler notifications tablosunda kalır).
drop table if exists gunluk_kontrol_gecmis;
drop table if exists gunluk_kontrol;
drop function if exists gunluk_kontrol_damga();
drop function if exists gunluk_kontrol_uyar();
drop function if exists gunluk_kontrol_gecmise_yaz();
