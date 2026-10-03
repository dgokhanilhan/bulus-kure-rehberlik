-- 0027_deneme_cekirdek GERİ ALMA (yalnız gerekirse, elle çalıştırılır; migration değildir, db push bunu uygulamaz).
-- Genel içe aktarma, eşleştirme ve yaşam döngüsü fonksiyonlarını kaldırır. İçe aktarılmış denemeler ve sonuçlar SİLİNMEZ;
-- taslak/arşivdeki denemeler 0025'in görünürlük kuralıyla gizli kalır (gerekirse 0025 geri alma betiğine bakın).
-- Ön yüz de 0027 öncesi sürüme döndürülmelidir.
begin;
drop function if exists import_preview(text, text, date, uuid[]);
drop function if exists set_item_outcome(uuid, text, int, uuid, boolean);
drop function if exists set_exam_status(uuid, text, boolean);
drop function if exists import_exam(jsonb);
drop function if exists template_visible(uuid);
drop function if exists resolve_outcome(text, smallint[], smallint, text, text, uuid, uuid, uuid);
commit;
