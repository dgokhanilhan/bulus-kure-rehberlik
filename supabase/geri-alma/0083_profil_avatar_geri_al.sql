-- 0083 geri alma: avatar seçimi kaldırılır (herkes baş harflere döner).
drop function if exists avatar_kaydet(text);
alter table profiles drop column if exists avatar;
