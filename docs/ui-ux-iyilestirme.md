# UI/UX iyileştirmesi — yayın öncesi değerlendirme

16 Ekim 2026. Kapsam: mevcut işlevlerin sunumu; yeni bir iş modülü veya veritabanı değişikliği yok.

## Denetim bulguları

Yönetici/öğretmen öğrenci profili, veli ve öğrenci Özeti, YKS sonuçları, nöbet ekranı ve ortak ana sayfa kartları incelendi. Canlı hesaplarda yalnız görüntüleme yapıldı. Geliştirme ve testlerde yerel sentetik kayıtlar kullanıldı.

- SAY/EA/SÖZ/DİL puanları tek metne sıkışıyor; tek puan için tasarlanmış istatistik kartını büyütüyor, komşu kartların hiyerarşisini bozuyordu.
- Uzun yanlış konu listesi modal içindeki sonuç tablosunu flex ile sıkıştırabiliyordu. Tek satırlık rozetler uzun başlıklara uygun değildi.
- Genel deneme analizinde uzun tabloları bulmak ve taramak zordu; ders veya metin filtresi yoktu.
- Grafik geniş ekranı doldururken yüksekliği ve metinleri de orantısız büyüyordu. Uzun deneme adları için yatay kaydırma ve tam ad erişimi korunmalıydı.
- LGS dışı aile özetinde tek açık görev kartı gereksiz boşluk bırakıyordu.
- Nöbet formu ile mevcut haftalık kayıtlar yeterince ayrışmıyordu. Ana sayfa kartlarında başlık/içerik boşlukları farklılaşıyordu.

## Tasarım yaklaşımı

Mevcut Fraunces/IBM Plex tipografisi, turkuaz eylem rengi, sıcak açık tema ve koyu tema korundu. Bilgi sırası: özet → seçili denemenin puanları → ders sonuçları → isteğe bağlı hedef ayrıntısı. Renkle tek başına başarı veya başarısızlık anlamı verilmedi.

## Önce / sonra

| Ekran | Önce | Sonra |
| --- | --- | --- |
| Veli/öğrenci YKS Özeti | Alan puanları uzun düz metin; ayrı alanları taramak zor | Alan adı ve açıklaması olan eşit puan kartları; telefonda iki sütun; yalnız raporlanan alanlar |
| Öğretmen öğrenci profili | Alan puanları tek küçük istatistik kartına sıkışıyor | Alan puanlarına tam satır; net, tekrar ve görev özeti ayrı sırada |
| Deneme ayrıntısı | Uzun konu rozetleri sonuç tablosunu daraltabiliyor | Daralmayan D/Y/B/Net tablosu; derslere göre açılır konu listeleri; tam başlık ve kaynak etiketi |
| Genel deneme analizi | Uzun hedef tablosunda gözle arama | Açılır analiz, hedef/kod araması, ders filtresi, yanlış/boş filtresi; sınırlı yükseklikte başlığı sabit tablo |
| Deneme seçimi | Grafikteki kısa ad üzerinden seçim | Grafiğe ek olarak tam deneme adı ve tarihiyle seçim alanı |
| Gelişim grafiği | Ekran genişliğiyle yazı ve yükseklik büyüyor | Sabit okunabilir yükseklik, kapsayıcıya uyarlanan genişlik, yoğun veride yatay kaydırma |
| Nöbet Takip | Form ve kayıtlar benzer düz kutular | Ayrı form bölümü, haftalık kayıt başlığı/sayısı, belirgin gün–zaman–yer, bugün etiketi |
| Ana sayfa | Başlık ve içerik birbirine yakın | Tutarlı kart boşluğu, başlık ayıracı, dokunulabilir “Tümü” bağlantısı |

## Ortaklaştırılan bileşenler

- `ScoreCards`: genel deneme özeti, öğrenci profili ve deneme modalında aynı puan sunumu. Hesaplama yapmaz; bildirilen değerleri Türkçe sayı biçiminde gösterir.
- `AnalysisDisclosure`: genel analiz ve öğretmen deneme ayrıntısında klavyeyle de kullanılabilen yerel HTML `details/summary` yapısı.
- `LineChart`: tüm gelişim grafiklerinde sabit yükseklik ve ölçüye göre genişlik.
- Sonuç tablosu, bölüm başlığı, filtre satırı, modal kaydırma alanı ve ana sayfa kartları için ortak CSS.
- Sekme göstergesi kendi boyut değişimini gözlemlemiyor; kendini tekrar tetikleyen ResizeObserver döngüsü kaldırıldı.

## Korunan davranışlar

- Puan/net/D/Y/B hesapları, resmî ve PDF hedeflerinin kimlikleri/kaynakları, deneme karşılaştırma kuralları değişmedi.
- PDF okuma/tamamlama, görev ve rapor işlemleri, rol yetkileri, veri sorguları ve nöbet kaydetme RPC'si değiştirilmedi.
- Mevcut okul görünüm tercihleri ve kişisel açık/koyu tema tercihleri korunuyor.
- Güncel dönem, öğrenci kayıtları ve canlı veritabanına müdahale edilmedi. Migration yok.

## Doğrulama

Yeni `e2e/ui-quality.spec.ts`, yerel sentetik AYT sonucu üzerinden dört alan puanını, 40 hedefi, yanlış/boş filtresini, metin aramasını, veli/öğrenci ortak görünümünü ve öğretmen modalında tablonun daralmamasını kontrol eder. Masaüstü 1440×1000, iPad 820×1180, telefon 390×844 ve koyu yatay iPad 1180×820 kullanılır. Ana sayfa/nöbet ekranı ve otomatik erişilebilirlik kontrolleri dahildir.

`playwright.ui.config.ts` aynı akışları WebKit motorunda çalıştırır. Bu, fiziksel iPad üzerindeki Safari doğrulamasının yerine geçmez. Görseller `e2e-artifacts/ui-*.png` altında yerel olarak üretilir; gerçek öğrenci verisi içermez ve repoya eklenmez.

16 Ekim doğrulama durumu:

- Tip kontrolü ve üretim derlemesi başarılı; dist bütünlük kontrolü geçti.
- 402 birim/güvenlik testi başarılı, 2 test koşullu olarak atlandı.
- Chromium regresyonu oturum kesintisi nedeniyle gruplar halinde tamamlandı: 150 farklı senaryo başarılı, 7 koşullu senaryo atlandı. Kesintiden kalan yerel sentetik kayıt temizlenip ilgili üç test yeniden başarıyla çalıştırıldı.
- Son değişikliklerle odaklı Chromium turu: 14/14 başarılı.
- Son değişikliklerle WebKit turu: 11/11 başarılı. Fiziksel iPad kullanılmadı.
- Açık/koyu tema, büyük yazı, masaüstü/iPad/telefon görselleri incelendi. Yeni ekranlarda otomatik erişilebilirlik kontrolünde ciddi/kritik ihlal bulunmadı.
## Risk ve yayın sınırı

En geniş etkili değişiklik ortak modalın kaydırma/daralma davranışıdır; bu nedenle yalnız yeni ekranlar değil mevcut modal kullanan akışlar da regresyon testine alınır. Çok sütunlu öğretmen tablosu en dar ekranlarda kontrollü yatay kaydırma kullanabilir. Uzun grafikler aynı şekilde kaydırılabilir; tam ad ve klavye erişimi korunur.

Yayın yetkisi 16 Ekim 2026 tarihinde kullanıcı tarafından verildi. GitHub kontrolleri başarılı olduktan sonra arayüz yayımlanır; migration veya canlı kayıt güncellemesi gerekmez.
