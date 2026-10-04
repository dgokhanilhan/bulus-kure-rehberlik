-- 0030_deneme_profilleri GERİ ALMA (yalnız gerekirse; migration değildir).
-- Profil tabloları yalnız gösterim yapılandırmasıdır (sonuç ya da öğrenci verisi tutmaz). Proje kuralı gereği tablo silinmez
-- ve toplu silme yapılmaz: geri almak için ön yüzü 0030 öncesi sürüme döndürmek yeterlidir; kullanılmayan tablolar zararsızdır.
-- Bu dosya bilerek veritabanında hiçbir değişiklik yapmaz.
select 'exam_profiles / exam_subtests yerinde bırakıldı; ön yüzü geri alın' as bilgi;
