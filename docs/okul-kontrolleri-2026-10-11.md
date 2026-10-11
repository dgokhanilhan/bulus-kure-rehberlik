# Okul rolleri, görünüm ve rapor düzeni

## Yönetimden kullanılabilen seçenekler

- **Yönetim → Güvenlik ve erişim:** özel rol oluştur/düzenle; kurucu ve müdür başlangıç şablonları; onaylı okul çalışanlarını seç; okul özeti, öğrenci listesi, deneme listesi, toplu yoklama ve yaklaşan etkinlikleri ayrı ayrı aç/kapat.
- **Okul yönetimi:** kullanıcının özel rollerinde verilen görüntüleme yetkilerinin birleşimi. Öğrenci listesi yalnız ad, sınıf ve okul numarası içerir. Rehberlik notları, yazışmalar ve kayıt değiştirme işlemleri dahil değildir.
- Yeni kurucu/müdür hesabı önce Öğretmenler bölümünden davet edilir, ardından özel rol atanır. Mevcut temel öğretmen/veli rolleri ve atandığı sınıflardan gelen yetkiler ayrıca korunur. Özel rol adı tek başına tam yönetici yetkisi vermez.
- Bir kullanıcıyı rolden çıkarmak veya yetkilerini kaldırmak o rolün erişimini kapatır. Rol kaydı korunur, tekrar düzenlenebilir.
- **Yönetim → Genel ayarlar / Okul ayarları:** cihaz tercihi/açık/koyu tema, üç vurgu rengi, yazı boyutu, kart aralığı, başlık vurgusu, kart köşeleri, animasyon tercihi, üst çubuk alt başlığı ve ana sayfa karşılama mesajı. Varsayılanları forma getir düğmesi ancak ayrıca kaydedildiğinde uygulanır.
- Okul ayarlarında takvim, ödev, yoklama ve bildirim kontrolleri de bulunur. Yönetim Merkezi'ndeki aynı doğrulamalı ayarlar kullanılır.
- Veli raporunda yorum ve öneriler çalışma hedeflerinden önce gelir; indirilen PDF de aynı sırayı kullanır. Öğretmen raporunun düzeni korunur.
- Veli ve öğretmen ana sayfa kutularının başlıkları varsayılan olarak kalın ve renklidir.

## Yetki sınırları

0039 migration iki yeni tablo ve iki dar kapsamlı RPC ekler. Rol yazımı yönetici + MFA gerektirir. Başka okulun kullanıcı veya rol kimliği kabul edilmez; onaylanmamış hesaplar okuyamaz. Üye yalnız kendisine atanmış okul rollerini görebilir. Tablolara doğrudan yazma izni yoktur. RPC sadece seçilen bilgi gruplarını döndürür; mevcut uygulamanın RLS politikaları genişletilmez. Rol değişiklikleri işlem geçmişine yazılır.

Yeni görünüm ayarları mevcut `setting_spec` ve MFA korumalı `set_settings` doğrulamalarından geçer. Özel HTML/CSS veya serbest kod alanı yoktur. PDF baskı stilleri ayrı tutulur. Azaltılmış hareket cihaz tercihi korunur.

## Doğrulama

Yerel migration, rol erişimi/MFA/okul sınırı/erişim kaldırma ve ayar doğrulama testleri; veli raporu ekran/PDF sıralaması; yönetim işlemleri; açık/koyu tema erişilebilirliği ve mobil taşma kontrolleri. Canlı uygulama için 0039 migration ve arayüz birlikte yayınlanmalıdır.

Son yerel doğrulama: typecheck ve build başarılı; 371 test geçti, 2 test mevcut koşulları gereği atlandı. İlgili 17 tarayıcı senaryosu geçti. Açık/koyu görünüm WCAG ciddi/kritik ihlal kontrolü ve 390 px mobil taşma kontrolü başarılı. Üretim bağımlılıklarında npm audit açık bulmadı.
