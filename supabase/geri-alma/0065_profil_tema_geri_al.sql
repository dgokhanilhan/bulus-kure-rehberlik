-- 0065 geri alma: tema seçimi kaldırılır (uygulama varsayılan temaya döner).
drop function if exists tema_kaydet(text);
alter table profiles drop constraint if exists profiles_tema_bicim;
alter table profiles drop column if exists tema;
