-- Ana sayfa 2 (veli · öğrenci · öğretmen): Yönetim → Ana sayfa düzeni yeni kartları kaydedebilsin diye
-- panel.veli / panel.ogrenci / panel.ogretmen için izinli kart kimlikleri genişler. Yalnız ayar tanımı değişir; veri değişmez.
-- Kayıtlı düzenler aynen kalır: kaydedilmiş düzende olmayan yeni kart istemcide varsayılan durumuyla eklenir.
-- Geri alma: supabase/geri-alma/0097_ana_sayfa_kartlari_geri_al.sql

alter function setting_spec() rename to setting_spec_before_0097;
create function setting_spec() returns jsonb language sql immutable as $$
  select setting_spec_before_0097() || '{
    "panel.veli":{"type":"layout",
      "ids":["hedefler","gorevler","odev","lgs","defter","gorusme","program","yemek","yoklama","takvim","duyuru","mesaj","bursluluk"],
      "default":[{"id":"hedefler","on":true},{"id":"gorevler","on":true},{"id":"odev","on":true},{"id":"lgs","on":true},{"id":"defter","on":true},{"id":"gorusme","on":true},{"id":"program","on":true},{"id":"yemek","on":true},{"id":"yoklama","on":true},{"id":"takvim","on":true},{"id":"duyuru","on":true},{"id":"mesaj","on":true},{"id":"bursluluk","on":false}]},
    "panel.ogrenci":{"type":"layout",
      "ids":["odev","hedefler","lgs","cozemedim","defter","program","yemek","yoklama","takvim","duyuru","bursluluk"],
      "default":[{"id":"odev","on":true,"w":"genis"},{"id":"hedefler","on":true},{"id":"lgs","on":true},{"id":"cozemedim","on":true},{"id":"defter","on":true},{"id":"program","on":true},{"id":"yemek","on":true},{"id":"yoklama","on":true},{"id":"takvim","on":true},{"id":"duyuru","on":true},{"id":"bursluluk","on":false}]},
    "panel.ogretmen":{"type":"layout",
      "ids":["derslerim","odev_kontrol","cozemedim","ders_deneme","devamsizlik","nobet","takvim","yemek","duyuru","mesaj","oda"],
      "default":[{"id":"derslerim","on":true,"w":"genis"},{"id":"odev_kontrol","on":true},{"id":"cozemedim","on":true},{"id":"ders_deneme","on":true},{"id":"devamsizlik","on":true},{"id":"nobet","on":true},{"id":"takvim","on":true},{"id":"yemek","on":false},{"id":"duyuru","on":true},{"id":"mesaj","on":true},{"id":"oda","on":true}]}
  }'::jsonb
$$;
select ayar_varsayilan_yenile();
