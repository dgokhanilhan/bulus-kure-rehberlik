-- 0082 geri alma: kürsü tablosu, işlevi ve zamanlanmış iş kaldırılır (oyun skorları etkilenmez).
select cron.unschedule('oda-lig-kursu');
drop function if exists oda_lig_kursu_yaz(date, boolean);
drop table if exists oda_lig_kursu;
