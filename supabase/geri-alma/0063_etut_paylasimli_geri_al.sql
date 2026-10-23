-- 0063 geri alma: önce aynı derste iki etütte olan öğrenciler temizlenmeli (aksi halde kısıt eklenemez)
alter table etut_ogrenciler drop constraint if exists etut_ogrenciler_hucre_ogrenci;
drop index if exists etut_ogrenciler_gun_ders_ogr;
alter table etut_ogrenciler add constraint etut_ogrenciler_gun_id_ders_student_id_key unique (gun_id, ders, student_id);
-- etut_kaydet'in eski hâli için 0051'deki tanım yeniden çalıştırılır.
