-- 0068_ogretmenler_odasi geri alma: yalnız bu migration'ın eklediklerini kaldırır (sohbet mesajları silinir;
-- anma bildirimleri notifications tablosunda kalır).
select cron.unschedule('oda-temizlik') where exists (select 1 from cron.job where jobname = 'oda-temizlik');
drop function if exists oda_devamsizlik(uuid[]);
drop function if exists oda_temizlik();
drop function if exists oda_okunmamis();
drop table if exists oda_okundu;
drop table if exists oda_tepki;
drop table if exists oda_mesaj;
drop function if exists oda_mesaj_damga();
drop function if exists oda_mesaj_anma();
drop function if exists oda_kanallari();
drop function if exists oda_kanallari_of(uuid);
