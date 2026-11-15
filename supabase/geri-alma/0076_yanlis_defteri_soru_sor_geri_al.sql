-- 0076 geri alma: yanlış defteri işaretleri ve "Çözemedim" talepleri kalkar (verileriyle birlikte).
-- Not: "soru" deposundaki dosyalar ve depo kaydı Supabase panelinden silinmelidir (SQL ile depo silinmez).
select cron.unschedule('soru-talep-temizlik');
drop function if exists soru_talep_temizlik();
drop policy if exists soru_insert on storage.objects;
drop policy if exists soru_read on storage.objects;
drop policy if exists soru_delete on storage.objects;
drop function if exists soru_talep_yanitla(uuid, text, text);
drop table if exists soru_talep;
drop function if exists soru_talep_bildir();
drop function if exists soru_talep_damga();
drop table if exists konu_calisma;
drop function if exists konu_calisma_damga();
delete from school_settings where key in ('aile.soru_sor', 'aile.yanlis_defteri');
drop function setting_spec();
alter function setting_spec_before_0076() rename to setting_spec;
select ayar_varsayilan_yenile();
