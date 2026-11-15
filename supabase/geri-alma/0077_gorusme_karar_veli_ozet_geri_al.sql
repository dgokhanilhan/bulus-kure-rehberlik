-- 0077 geri alma: görüşme kararları ve veli haftalık özetleri kalkar (verileriyle birlikte).
select cron.unschedule('veli-ozet-temizlik');
drop function if exists veli_ozet_temizlik();
drop function if exists veli_ozet_okundu(uuid);
drop function if exists veli_ozet_gonder(uuid, jsonb, text);
drop table if exists veli_ozet;
drop table if exists gorusme_karar;
drop function if exists gorusme_karar_damga();
delete from school_settings where key in ('aile.haftalik_ozet');
drop function setting_spec();
alter function setting_spec_before_0077() rename to setting_spec;
select ayar_varsayilan_yenile();
