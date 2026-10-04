-- 0031_akbim_bicimi GERİ ALMA (yalnız gerekirse; migration değildir). Satır silinmez: biçim pasifleştirilir
-- (tanıma ekranında "Pasif" görünür). Ön yüzü 0031 öncesine döndürmek Akbim okuyucusunu kaldırır.
update exam_format_profiles set status = 'pasif' where school_id is null and code = 'AKBIM_SONUC_BELGESI_V1';
