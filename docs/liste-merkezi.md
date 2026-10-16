# Yönetim · Liste Oluştur

Yönetim merkezindeki **Liste Oluştur** alanı, mevcut öğrenci/sınıf/veli kayıtlarından okul evrakı hazırlar. Sınıflar bölümündeki kısayol ilgili sınıfı seçili açar. Ayrı bir ana menü eklenmez.

## Kullanım

1. **Kişiler ve şablon:** Sınıf veya veli listesi seç; hazır şablonu, sınıfları, öğrencileri ve sıralamayı belirle. Seçim yoksa bütün uygun kayıtlar kullanılır. Satır kutularıyla istenmeyen kişileri çıkar.
2. **Sütunlar ve düzen:** Başlık, açıklama, tarih, sütunlar/sıraları/genişlikleri, satır yüksekliği, A4 yönü, alt not ve imza alanını düzenle. Boş sütunlara önizlemede metin yazılabilir.
3. **Önizleme ve çıktı:** PDF önizle/indir/yazdır veya düzenlenebilir Excel indir. iPad'de PDF'yi açıp Paylaş → Yazdır kullanılabilir.

Hazır şablonlar: standart sınıf, deneme sınavı, gezi, haftalık yoklama, imza, etkinlik, teslim-tesellüm ve özel liste. Kitapçık, salon, izin, katılım gibi kayıtlı olmayan bilgiler boş bırakılır.

**Şablonu kaydet** güncel verilerden tekrar üretilen dinamik listeyi saklar. **Sabit kopya kaydet** seçili sütunların o andaki metinlerini ayrı bir belgeye kaydeder. Sabit listede kişi/sütun sırası değişmez; başlık, notlar ve görünüm düzenlenebilir. Kaydedilen liste açılabilir, kopyalanabilir, başlığı değiştirilerek yeniden kaydedilebilir veya arşivlenebilir.

Veli listelerinde tek veli satırı veya çocuk başına satır seçilebilir. Okul numarası kimlik/tekilleştirme anahtarı değildir. Kişiler veritabanı kimlikleriyle ayrılır. Eksik değerler belirtilir; bilgi tahmin edilmez.

## Veri ve yetki sınırı

- Kaynaklar: `students`, `classes`, `profiles`, `profile_roles`, `parent_links`, okul adı ayarları. Mevcut kayıt/bağlantılar değiştirilmez.
- `0046_liste_merkezi.sql` iki ek tablo ve yönetici RPC'leri oluşturur. Mevcut tablolarda veri düzeltmesi, silme, dönem geçişi veya yetki genişletmesi yapmaz.
- `parent_contact_details` liste merkezine ait telefon/iletişim e-postası düzeltmelerini tutar. Henüz düzeltme yoksa mevcut profil iletişimi kullanılır. Auth e-postası, parola ve profil rolü bu işlemle değişmez. Diğer modüllerdeki telefon alanları otomatik olarak yeniden yazılmaz.
- `school_list_documents` okula özel dinamik düzenleri ve sabit çıktı satırlarını tutar. Sabit kopya kişisel veri içerir; yalnız yöneticilere açıktır ve ayrıca saklama politikasına tabidir.
- Tablo okumaları ve RPC'ler yönetici + AAL2 + aynı okul kontrolü yapar. İstemcilerin doğrudan tablo yazma yetkisi yoktur. Kayıt/güncelleme ve çıktı alma audit kaydı üretir; loga telefon/e-posta ya da hücre içerikleri yazılmaz.
- Eşzamanlı düzenlemede revizyon/zaman kontrolü ikinci yöneticinin değişikliğini ezmeyi önler. Çakışma HTTP 409 olarak bildirilir.
- PDF/Excel'e yalnız seçili sütun ve satırların izdüşümü verilir. Excel değerleri formül değil metindir; baştaki sıfırlar korunur. PDF'de gömülü Türkçe font ve tekrar eden başlıklar kullanılır.

## Teknik notlar ve sınırlar

- En fazla 16 sütun, 5.000 çıktı satırı; sabit kayıt 5 MB ve düzen 2 MB sınırı. Çok geniş tablolar için yatay A4 önerilir. PDF önizlemesi son sayfa düzenini gösterir.
- ExcelJS yalnız çıktı istenince yüklenir. UUID alt bağımlılığı güvenlik düzeltmeli 11.1.1 sürümüne sabitlenmiştir; kullanılan v4 API'si korunur.
- CSP'ye yerel Blob PDF çerçevesi izni eklenir; dış site çerçeveleri açılmaz. Derleme kontrolü Browserify iç modül isimlerini ağ bağımlılığı sanmamak için gerçek ES içe aktarımlarını ayrıştırır; eksik lazy parça denetimi korunur.
- Testler yalnız yerel Supabase ve sentetik verilerle yapılır. `tests/listeler.test.ts`, `src/lib/schoolLists.test.ts`, `e2e/listeler.spec.ts` yetki, okul sınırı, iletişim, şablon/sabit liste, Excel ve çok sayfalı PDF akışlarını kapsar.

## Yayın sırası

Yerel testler ve GitHub kontrolleri geçtikten sonra yalnız 0046 migration uygulanır; ardından frontend yayınlanır. Mevcut dönem/sonuçlar değiştirilmez. Frontend geri alınabilir; ek tablolar kullanıcı listelerini korumak için bırakılır.
