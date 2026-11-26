-- 0097 geri alma: ana sayfa kart kimlikleri önceki haline döner. Yeni kartları içeren kayıtlı düzenler silinmez;
-- istemci bilinmeyen kartı göstermez, yönetici düzeni yeniden kaydedince yalnız eski kartlar kalır.
drop function setting_spec();
alter function setting_spec_before_0097() rename to setting_spec;
select ayar_varsayilan_yenile();
