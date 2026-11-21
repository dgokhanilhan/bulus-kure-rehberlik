-- 0091 geri alma: yaklaşan deneme tabloları ve fonksiyonları kaldırılır. Takvim etkinlikleri ve yayınlanan denemeler kalır.
drop function if exists yaklasan_deneme_konulari(uuid);
drop function if exists yaklasan_deneme_bagla(uuid, uuid);
drop function if exists yaklasan_deneme_kaydet(jsonb);
drop table if exists yaklasan_deneme_sorulari;
drop table if exists yaklasan_denemeler;
