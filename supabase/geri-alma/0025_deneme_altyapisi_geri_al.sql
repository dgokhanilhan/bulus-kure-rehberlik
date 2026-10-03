-- 0025_deneme_altyapisi GERİ ALMA (yalnız gerekirse, elle çalıştırılır; migration değildir, db push bunu uygulamaz).
-- Mevcut LGS davranışını 0025 öncesine döndürür: taslak/arşiv görünürlük kısıtları ve eski yol tetikleyicisi kalkar.
-- Yeni tablolar (subjects, publishers, exam_format_profiles, exam_templates, curriculum_versions, learning_outcomes,
-- exam_items, exam_imports …) ve exams/exam_results'a eklenen sütunlar SİLİNMEZ (veri kaybı olmasın); kullanılmaz hale gelir.
-- Not: geri almadan önce taslak ya da arşivde deneme varsa, kısıt kalkınca velilere görünür hale gelir. Önce kontrol edin:
--   select id, name, status from exams where status <> 'yayinda';
-- Ön yüz de 0025 öncesi sürüme döndürülmelidir.
begin;

drop policy if exists exams_visible on exams;
drop policy if exists results_visible on exam_results;
drop trigger if exists exams_defaults on exams;
alter table exams alter column status drop not null;

commit;
