-- 0048_gozetmen GERİ ALMA (yalnız modül tamamen kaldırılmak istenirse; migration değildir).
-- Gözetmen Bul modülünün bütün tabloları ve fonksiyonu kaldırılır. Mevcut tablolara (profiles, classes, timetable,
-- bell_times) dokunulmaz; modül onlara yalnız okuma amaçlı bağlıydı.
-- DİKKAT: Kaydedilmiş gözetmen görevleri (geçmiş dahil) silinir. Gerekirse önce Gözetmen Bul → Geçmiş'ten PDF'leri indir.
-- Ön yüz: src/pages/GozetmenPage.tsx, src/pages/Gozetmen.css, src/lib/gozetmen.ts, src/lib/gozetmen.test.ts,
-- src/lib/gozetmenPdf.tsx dosyalarını sil; src/lib/roles.ts ve src/App.tsx içindeki 'gozetmen' satırlarını kaldır.
drop table if exists gozetmen_haric; -- 0049
drop function if exists gozetmen_kaydet(uuid, jsonb, boolean);
drop table if exists gozetmen_gorevler;
drop table if exists gozetmen_siniflar;
drop table if exists gozetmen_oturumlar;
drop table if exists gozetmen_sinavlar;
