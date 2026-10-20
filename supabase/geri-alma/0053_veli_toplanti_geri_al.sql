-- 0053_veli_toplanti geri alma: yalnız bu migration'ın eklediklerini kaldırır (form kayıtları silinir).
drop table if exists veli_toplanti_formlari;
drop function if exists veli_toplanti_damga();
drop function if exists veli_toplanti_gozlem_gecerli(jsonb);
