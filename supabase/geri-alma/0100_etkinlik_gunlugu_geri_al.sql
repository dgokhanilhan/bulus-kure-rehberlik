-- 0100 geri alma: etkinlik günlüğü tamamen kalkar (kayıtlar silinir). İşlem kaydındaki "etkinlik_gunlugu" satırları kalır.
select cron.unschedule('etkinlik-temizlik');
drop function if exists etkinlik_temizlik();
drop function if exists etkinlik_kisi(uuid, date);
drop function if exists etkinlik_gun(date);
drop function if exists etkinlik_gunlugu_acildi(date);
drop function if exists etkinlik_islemler(uuid, timestamptz, timestamptz, uuid);
drop function if exists etkinlik_yaz(jsonb);
drop function if exists etkinlik_yetkili();
drop table if exists etkinlik_kaydi;
drop table if exists etkinlik_yetki;
