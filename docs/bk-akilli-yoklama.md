# BK Akıllı Yoklama — Güvenli entegrasyon notları (taslak)

Bu dal canlı sisteme dağıtılmamalıdır. Mevcut yoklama ekranı ve attendance tablosu değiştirilmemiştir.

## Doğrulanan mevcut davranışlar
- `attendance` tablosu yalnız `devamsiz | gec | izinli | raporlu` saklar. `geldi` mevcut kaydın olmamasıdır.
- Tekillik `(student_id, day)` üzerindedir.
- Mevcut yazma RLS politikası yöneticiyle sınırlıdır.
- Mevcut tetikleyiciler devamsızlık/ geç kalma bildirimleri üretir.
- Mevcut web yoklama ekranı `OkulGunluguAdmin.tsx` içindedir; mevcut çevrimdışı kuyruk yetkiyi yeniden doğrulamaz.

## Zorunlu sunucu tasarımı
1. Öğretmen mevcut hesabıyla oturum açar; sunucu doğrulanmış kullanıcı kimliğini alır.
2. Yönetici tarafından atanmış ve iptal edilebilir cihaz kaydı doğrulanır.
3. Öğretmenin okul, sınıf ve görev yetkisi sunucu tarafından yeniden kontrol edilir.
4. Öğretmen başına TOTP anahtarı yalnız sunucuda şifreli saklanır. Kurulum ve kurtarma akışı ayrı ele alınır; kod tek başına kimlik değildir.
5. Gönderilen taslak sunucunun **güncel** öğrenci listesiyle karşılaştırılır; eksik öğrenciler otomatik geldi sayılmaz.
6. TOTP tekrar kullanımı, deneme sınırı ve eşzamanlı güncelleme engelleri sunucuda uygulanır.
7. `attendance` satırlarının upsert/delete işlemleri tek veritabanı transaction'ında gerçekleştirilir; idempotency anahtarıyla tekrarlı istekler aynı sonucu döndürür.
8. Her onay için ayrı günlük yoklama başlığı/denetim kaydı tutulur; böylece tüm öğrenciler geldiğinde de yoklamanın alındığı bilinir.
9. Var olan bildirim tetikleyicileri korunur; doğrudan `service_role` anahtarı Windows uygulamasına verilmez.
10. Çevrimdışı kayıtlar yalnız taslaktır; yeniden bağlantıda yeniden kimlik doğrulama ve TOTP gerekir.

## Sonraki işler
- Supabase sürüm/dokümantasyon ve canlı şema farklarını doğrula.
- Öğretmen-sınıf yetki modelini, onaylı rollerin tümünü ve mevcut MFA kullanımını incele.
- Sunucu RPC/Edge Function ve migration taslağı oluştur; güvenlik ve rollback incelemesinden sonra uygula.
- Dokunmatik Windows istemcisini ayrı uygulama olarak geliştir.
- Gerçek verisiz entegrasyon testleri, güvenlik testleri ve Windows paketleme.
- Tek sınıfta pilot, ardından kontrollü dağıtım.

## Şu anda tamamlananlar
- Saf günlük yoklama veri doğrulama modülü.
- Bu modüle yönelik otomatik test dosyası.

**Not:** Testlerin çalıştırıldığı, API'nin kurulduğu veya Windows paketinin üretildiği iddia edilmemektedir.
