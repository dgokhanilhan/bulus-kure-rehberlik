-- 0047_lgs_eslesmeyen_hedefler GERİ ALMA (yalnız gerekirse; migration değildir).
-- Fonksiyon kaldırılır; ön yüz fonksiyon yoksa eski yayın davranışına (yalnız publish_exam) döner.
-- Proje kuralı gereği veri silinmez: 8. sınıf denemelerine yazılmış exam_items satırları (ve onlara yapılmış eşlemeler) yerinde kalır.
drop function if exists add_lgs_unresolved_items(uuid, jsonb);
select '8. sınıf exam_items satırları yerinde bırakıldı' as bilgi;
