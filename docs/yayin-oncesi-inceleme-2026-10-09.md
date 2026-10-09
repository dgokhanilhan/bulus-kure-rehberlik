# Yayın öncesi inceleme — 9 Ekim 2026

## Kapsam

Canlı yönetici hesabında ana menüler, öğrenci profili sekmeleri ve yönetim bölümleri gezildi. İki deneme hesabında öğretmen/veli rol geçişleri, takvim, ödevler, öğrenci listesi ve veli özeti incelendi. Üretimde örnek öğrenci kaydı, ödev, mesaj veya rapor gönderilmedi. Formların açılması, bütün gönderme/yükleme işlemlerinin canlıda sınandığı anlamına gelmez.

## Düzeltilen bulgular

- Eksik soru kataloğunda öğrenme hedefi analizi tamamen kaybolabiliyordu. Analiz gerçek soru numarasını kullanır; eksik katalog sorularını okunamayan olarak sayar. Tekrarlanan veya geçersiz soru numaralarıyla sonuç üretmez. Netler ve puanlar değişmez.
- Benzer uzun deneme adları grafikte aynı görünüyordu. Kısaltılmış etiketin sonunda denemenin ayırt edici numarası korunur; tam ad erişilebilir etikette kalır.
- Resmî hedef başlığına karışmış PDF sütun başlıkları gösterimden, AI girdisinden ve sonraki katalog çıkarımından temizlenir. Okulun eklediği PDF hedeflerinin metni ve kayıt kimlikleri korunur.
- Takvim yüklenirken boş liste mesajı gösteriliyordu. Yükleniyor/hata/boş durumları ayrılır, hata durumunda yeniden deneme sunulur.
- Çalışan ödev özelliklerini gelecekte yapılacakmış gibi anlatan yönetim metinleri ve yönetici iletişim açıklaması düzeltildi.
- Geliştirme aracındaki bağımlılık uyarıları giderildi; npm audit açık bildirmiyor.

## Veli raporunda yapay zekâ

Kullanıcının son talimatına göre DeepSeek gerçek deneme performansını yorumlar: puan, toplam net, ders bazında soru/doğru/yanlış/boş/net, önceki netler, geçmiş eğilim ve katalogda doğrulanmış hedefler. İsim, soyisim, okul numarası, sınıf, okul adı, veli/öğretmen kimliği ve serbest öğretmen notları dış sağlayıcıya gönderilmez. Öğrenci kimliği yalnız kendi sunucumuzda yetki kontrolünde kullanılır.

Öğrenciden “öğrencimiz”; öğretmenlerden “rehber öğretmenimiz” ve “mentör öğretmenimiz” diye bahsedilir. Dil günlük ve anlaşılır, yorum teknik verilere dayalıdır. Resmî hedef ve okulun PDF’den eklediği çalışma hedefleri karıştırılmaz. Tek yanlışla kesin konu eksiği, boş soruyla kesin süre veya dikkat sorunu hükmü kurulmaz.

AI_REPORT_EXTERNAL_ENABLED yalnız veli raporunu açan işletim ayarıdır. Diğer AI özellikleri için verilmiş aktarım izni sayılmaz; hukuki belgelerin tamamlandığını da belirtmez. Kimlik alanlarının çıkarılması performans verisinin hukuken anonim olduğunu tek başına kanıtlamaz. Sağlayıcı sözleşmeleri ve gerekli yurt dışı aktarım mekanizması hâlâ tamamlanmalıdır.

## Canlı kontroller ve sınırlar

- Öğretmen rolünde okulun deneme etkinlikleri görüldü; veli rolünde yalnız bağlı öğrencinin sınıf etkinlikleri görüldü. İki hesapta ters yönlü rol geçişi kontrol edildi.
- Diğer öğretmenin ödevi, atanmış sınıfta salt okunur açıldı; durum değiştirme denetimleri sunulmadı.
- Galeri kapakları ve küçük resimler Chrome’da görüntülendi. Yeni iPhone yüklemesi bu incelemede yapılmadı.
- Yerel testlerde şifremi unuttum akışı kontrol edilir. Canlı SMTP teslimatı için okulun kontrolündeki gelen kutusunda ayrı doğrulama gerekir; mevcut parola değiştirilmedi.
- Şüpheli yinelenen öğrenci kaydı ve belirsiz ders kısaltmaları otomatik silinmedi/birleştirilmedi. Okulun kayıt doğrulaması gerekir.
- Yeni migration, canlı veri temizliği veya yedekleme değişikliği yoktur.

## Doğrulama

365 birim/veritabanı testi başarılı, 2 test atlandı. Typecheck ve üretim build başarılı. Tarayıcı testleri ve canlı yayın doğrulamasının sonuçları PR açıklamasında ayrıca kaydedilir.