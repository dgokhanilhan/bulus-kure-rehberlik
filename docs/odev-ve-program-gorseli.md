# Ödev sahibi ve görselden ders programı

Öğretmenin varsayılan listesi kendi verdiği ödevleri gösterir. “Diğer verilen ödevler”, ders verdiği sınıflardaki diğer ödevleri salt okunur açar. Durum/not değiştirme, toplu “yaptı” ve düzenleme kontrolleri bu görünümde bulunmaz. Yönetici tüm ödevleri yönetebilir. `0033_odev_sahibi_kontrol.sql`, durum kaydetme yetkisini sunucuda yönetici ve ödev sahibiyle sınırlar.

## Program yükleme

1. Yönetim → Ders programı bölümünde sınıfı elle seç ve “Görselden yükle”ye bas.
2. JPG, PNG veya WebP seç (en fazla 15 MB). Gerekiyorsa fotoğrafı döndür.
3. Yalnız ders hücrelerinin dış köşelerini seç; dokunma sırası önemli değildir. Gün adları, saatler ve sınıf başlığı alanın dışında kalmalı.
4. Gün ve sütun sayısını belirt; öğle arası gibi boş saatler sütun sayısına dahildir. “Görseli tanı”ya bas.
5. M/MU → Matematik, REH → Rehberlik, ENG → İngilizce, SD → Seçmeli Ders eşleşmeleri katalogda tek bir uygun aktif ders varsa seçilir. Bilinmeyen veya belirsiz kodları mevcut derse eşleştir ya da yeni ders adı gir. Bir kodun seçimi tüm hücrelerine uygulanır.
6. Önizlemede her dersin temizlenmiş görsel yazısını okunan metinle karşılaştır. Okunamayan hücreler boş saat sayılmaz ve kontrol edilmeden kaydedilemez: ders adını yaz veya gerçekten boşsa “Bu hücre boş” seç. Yanlış okunan metinleri düzelt. Fotoğraflarda kırışıklık, eğrilik ve bölünmüş yazılar hataya yol açabilir; okuma kesin kabul edilmez. Boş görünen ders hücresini de kontrol et. Şablonun tamamında boş olan öğle arası sütunu okulun ders saatlerine dahil değilse “Tamamen boş sütunları öğle arası say” seçeneğini aç. Sonraki derslerin numaraları önizlemede yeniden sıralanır; tek bir gündeki boş saat bu sayımdan çıkarılmaz.
7. Çakışan mevcut dersler varsayılan olarak korunur. Değiştirmek istiyorsan ilgili seçeneği işaretle. Boş hücreler hiçbir zaman ders silmez.
8. Önizleme onayını işaretleyip kaydet. Yeni ders ve program hücreleri tek veritabanı işlemiyle kaydedilir; hata olursa tüm işlem geri alınır.

İsteğe bağlı hatırlama yalnız ders kodu/kimliği eşleşmelerini, okul başına bu tarayıcıda saklar. Fotoğraf ve öğretmen adları saklanmaz. Sınıf ve öğretmen isimleri görselden otomatik eşleştirilmez. Öğretmen, sınıf/ders atamasında tek kişi varsa önerilir.

## Teknik ve yayınlama

Metin tanıma Tesseract.js ile cihazda yapılır. Çalışan ve Türkçe/İngilizce dil dosyaları aynı siteden yüklenir; fotoğraf harici servise gönderilmez. `scripts/prepare-program-ocr.mjs` bu dosyaları dev/build/deploy sırasında hazırlar. Üretilen `public/program-ocr/` repoya eklenmez.

Migration kullanıcı onayından önce uygulanmaz. Onaydan sonra önce yerel veritabanında `tests/program-import.test.ts` ve ödev yetki testleri, ardından tüm testler çalıştırılmalıdır. Canlı migration ve yayınlama ancak verilen onayın kapsamına göre yapılır. Eski arayüze dönmek gerekirse yeni sahip kontrolü korunabilir; eski geniş durum değiştirme yetkisi geri açılmamalıdır.

Yeni tarayıcı testindeki kayıt RPC'si taklit edilir; bu test gerçek program kaydı veya veritabanı yetki testinin yerine geçmez. Üretim güvenlik başlıklarıyla yerel kontrol için önce `npm run build -- --mode development`, PowerShell'de `$env:E2E_DIST='1'` ardından `npx playwright test e2e/homework-owner-program-image.spec.ts` çalıştırılır. Test başlangıcı, derlemenin test veritabanına bağlı olduğunu doğrular.

## Fotoğraf okuma düzeltmesi

Eşit genişlikte hücre kesimi fotoğrafın eğri çizgilerinde harfleri kesiyor, kâğıt dokusu ve küçük öğretmen yazıları sahte ders kodlarına dönüşüyordu. Yerel eşikleme ile gölge temizlenir; çizgi konumu her satırda aranır, küçük yazılar ayrılır ve iki satırlı ders metni birlikte okunur. Zor okumada ayrı satır okuması da denenir. Uzun açık ders adındaki tek harf hatası yalnız tek aday varsa düzeltilir; PÇ/P-S-K gibi bilinmeyen kısa kodlar tahmin edilmez. “Din Kültürü” katalog adı da DIN kısaltmasıyla eşleşir.

Asıl 8/A fotoğrafı cihazda sınandı. Otomatik ekran testinde fotoğrafın öğretmen isimleri silinmiş ders alanı kullanılır: 44 dolu ve 6 boş hücre, ders eşleştirmeleri ve bilinmeyen kodların kullanıcıya bırakılması doğrulanır. Tam otomatik, her fotoğrafta hatasız okuma iddiası yok; önizleme onayı zorunlu kalır. Önizleme görselleri yalnız bellekte tutulur.
