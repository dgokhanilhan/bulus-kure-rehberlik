# PDF kazanım ve öğrenme çıktısı ekleme

Yönetim → Deneme merkezi → Eşleşmeyen hedefler ekranında yönetici, PDF metni bulunan sorular için **Ekle**, **Bu denemede tümünü ekle** veya **Tümünü ekle** işlemini kullanır. Toplu eşleme önizlemesinde de **Tümünü ekle** bulunur.

Önizlemede soru seçimi, konu sınıfı ve kazanım/öğrenme çıktısı türü kontrol edilir. Tür tüm satırlarda veya tek satırda seçilebilir. Kontrol kutusu onaylanınca kayıtlar oluşturulur ve sorulara bağlanır. Aynı okul, yayıncı, konu sınıfı ve derste aynı kod/metin/tür yeniden oluşturulmaz. Başarısız satırlar açıklanır ve tekrar denenebilir; başarılı kayıtlar korunur.

Bu kayıtlar PDF yayın hedefleridir; resmî MEB katalog kaydı olarak gösterilmez. Resmî öğrenci grubu/müfredat seçimi, cevap anahtarı, doğru/yanlış/boş, net ve puan değişmez. Metinsiz satır eklenemez. Ekleme ve eşleme sunucuda yetki, okul ve yayıncı sınırlarını doğrular. Kayıtlar işlem günlüğüne yazılır.

Veritabanı: `0035_pdf_yayin_hedefleri.sql`. Yeni alanlar `curriculum_versions.school_id` ve `publisher_id`, yeni sürüm türü `PDF`, ekleme RPC'si `add_pdf_outcomes`. İstemci PDF metnini göndermez; RPC soru kaydındaki ham metin ve kodu kullanır.

## Raporlar ve görevler

Eklenen hedefler öğrenci profilindeki Konular, deneme ayrıntısı, veli/öğretmen raporu ve indirilen PDF'lerde kullanılır. Konular sekmesi tek denemede yanlış yapılan hedefleri de gösterir; buradan görev atanabilir. Resmî hedefler ile PDF hedeflerinin kimlikleri ayrıdır; aynı kod farklı ders veya kataloglarda birbirine karışmaz. Veli raporunda **Resmî programdaki çalışma hedefleri** ve **Okulun PDF’den eklediği çalışma hedefleri** ayrı bölümlerdir. Tekrar eden hata sayısı yine en az iki denemede yanlış yapılan hedefleri sayar.

Yönetim → Denemeler / Tanıma Merkezi → Öğrenme hedefleri ekranından sınıf ve ders seçilir. **Yalnız okulun PDF’den eklediği hedefleri göster** filtresi bu kayıtları ayırır. Yönetici **Düzenle** ile kod, metin ve türü değiştirebilir. Değişiklik aynı hedefe bağlı analiz ve raporlara yansır. Ders, sınıf, yayıncı ve resmî program kayıtları bu işlemle değiştirilemez.

## Takvimde sınıf seçimi

Etkinlik eklerken **Kimin için → Sınıf** seçilir ve bir veya birden fazla sınıf işaretlenir. **8. sınıfları seç** gibi kısayollar o düzeydeki etkin sınıfları birlikte seçer. Öğrenci ve veli yalnız kendi sınıflarına yönelik etkinlikleri ve bildirimleri görür; öğretmen kendi ders verdiği sınıfları seçebilir. Eski tek sınıflı etkinlikler çalışmaya devam eder.

Bu entegrasyon `0036_pdf_rapor_takvim_yonetimi.sql` migration'ı ve `ai-veli-raporu` Edge Function güncellemesini gerektirir. Önce migration, ardından fonksiyon ve ön yüz yayınlanır. Yapay zekâya yalnız anonim sonuçlar ve erişilebilen katalog hedefleri gider; PDF hedefleri resmî MEB hedefi olarak adlandırılmaz.

Doğrulama: `npm run typecheck`, `npm run build`, `npm test`, `npm run e2e`. CSP tarayıcı testleri için önce `npm run build -- --mode development`, ardından `E2E_DIST=1` ortam değişkeni ile E2E çalıştırılır. Testler yalnız yerel Supabase kullanır.
