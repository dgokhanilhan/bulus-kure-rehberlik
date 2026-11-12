-- 0066_brans_toplanti geri alma: yalnız bu migration'ın eklediklerini kaldırır (branş form kayıtları silinir).
drop table if exists brans_toplanti_formlari;
drop function if exists brans_toplanti_damga();
drop function if exists brans_toplanti_cevap_gecerli(jsonb);
