-- 0026_meb_katalog GERİ ALMA (yalnız gerekirse, elle çalıştırılır; migration değildir, db push bunu uygulamaz).
-- Katalog satırları SİLİNMEZ (denemelerin soru-kazanım eşleşmeleri bunlara bağlı olabilir): 0026'nın eklediği müfredat
-- sürümleri pasifleştirilir, curriculum_for() artık onları seçmez. 8. sınıf eski kataloğu (0025) etkilenmez.
begin;
update curriculum_versions set active = false
where source_url like 'https://mufredat.meb.gov.tr/%' and not (curriculum_type = 'LEGACY' and grade = 8 and year_from = 2018);
commit;
