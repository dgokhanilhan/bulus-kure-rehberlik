# PDF kazanım ve öğrenme çıktısı ekleme

Yönetim → Deneme merkezi → Eşleşmeyen hedefler ekranında yönetici, PDF metni bulunan sorular için **Ekle**, **Bu denemede tümünü ekle** veya **Tümünü ekle** işlemini kullanır. Toplu eşleme önizlemesinde de **Tümünü ekle** bulunur.

Önizlemede soru seçimi, konu sınıfı ve kazanım/öğrenme çıktısı türü kontrol edilir. Tür tüm satırlarda veya tek satırda seçilebilir. Kontrol kutusu onaylanınca kayıtlar oluşturulur ve sorulara bağlanır. Aynı okul, yayıncı, konu sınıfı ve derste aynı kod/metin/tür yeniden oluşturulmaz. Başarısız satırlar açıklanır ve tekrar denenebilir; başarılı kayıtlar korunur.

Bu kayıtlar PDF yayın hedefleridir; resmî MEB katalog kaydı olarak gösterilmez. Resmî öğrenci grubu/müfredat seçimi, cevap anahtarı, doğru/yanlış/boş, net ve puan değişmez. Metinsiz satır eklenemez. Ekleme ve eşleme sunucuda yetki, okul ve yayıncı sınırlarını doğrular. Kayıtlar işlem günlüğüne yazılır.

Veritabanı: `0035_pdf_yayin_hedefleri.sql`. Yeni alanlar `curriculum_versions.school_id` ve `publisher_id`, yeni sürüm türü `PDF`, ekleme RPC'si `add_pdf_outcomes`. İstemci PDF metnini göndermez; RPC soru kaydındaki ham metin ve kodu kullanır.

Doğrulama: `npm run typecheck`, `npm run build`, `npm test`, `npm run e2e`. CSP tarayıcı testleri için önce `npm run build -- --mode development`, ardından `E2E_DIST=1` ortam değişkeni ile E2E çalıştırılır. Testler yalnız yerel Supabase kullanır.