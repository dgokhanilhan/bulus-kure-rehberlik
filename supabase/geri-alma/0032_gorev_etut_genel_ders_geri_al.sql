-- 0032_gorev_etut_genel_ders GERİ ALMA (yalnız gerekirse; migration değildir).
-- Proje kuralı gereği veri silinmez: enum değerleri ve tasks.learning_outcome_id kolonu yerinde bırakılır (PostgreSQL enum değeri
-- kaldırmayı desteklemez; kolon boş olabilir). Geri almak için ön yüzü 0032 öncesine döndürmek yeterlidir; mevcut LGS görevleri etkilenmez.
select 'subject_code değerleri ve tasks.learning_outcome_id yerinde bırakıldı; ön yüzü geri alın' as bilgi;
