# Aylık öğle menüsü ve öğretmen nöbeti

Yönetim Merkezi → Yemek listesi artık seçilen ayın hafta içi günlerini ve yalnız öğle yemeğini gösterir. Eski diğer öğün kayıtları veritabanında korunur.

“Görselden yükle” beş gün sütunlu aylık fotoğrafı tarayıcıda, yerel Tesseract varlıklarıyla okur. Fotoğraf bir yapay zekâ hizmetine gönderilmez. Yalnız fotoğrafta açıkça okunan ve seçilen aya ait tam tarihler kullanılır; eksik tarihler tahmin edilmez. Tarihler ve menüler düzenlenebilir önizlemede gösterilir. Düşük güvenli veya eksik satırlı hücreler işaretlenir. Eksik/boş okunan günler mevcut kaydı silmez. Forma aktarım veritabanına yazmaz; yönetici ayrıca “Ayı kaydet” düğmesine basar. Bir günün menüsünü ana formda boşaltıp kaydetmek o günün öğle kaydını kaldırır.

Örnek fotoğrafta bazı satırlar veya tarihler OCR nedeniyle eksik kalabilir. Önizlemeyi fotoğrafla karşılaştırmak gerekir; okunmayan tarihler ayrıca listelenir. Daha düz ve net fotoğraf doğruluğu artırır.

Nöbet Takip öğretmen ve rehber öğretmen menüsündedir. Her öğretmen yalnız kendi haftalık kayıtlarını yönetir. Hafta içi beş gün, öğleden önce/sonra ve belirtilen beş yer desteklenir. Aynı gün-zaman için iki kayıt oluşturulamaz. Veli görünümünde nöbet sekmesi ve nöbet bildirimleri gösterilmez; çoklu rol geçişinde bildirim önbelleği role göre ayrılır.

## Migration 0040

- `save_monthly_lunch`: yalnız okul yöneticisi ve MFA; okul ve ay sınırı, hafta içi gün, tekrar ve metin uzunluğu kontrolü. Toplu kayıt tek transaction'dır.
- `teacher_duties`: RLS yalnız kendi okulunda kendi onaylı öğretmen kaydını okumaya izin verir. Doğrudan yazım kapalıdır; `save_teacher_duty` sahiplik ve öğretmen rolünü kontrol eder. Değişiklikler denetim kaydına girer.
- `teacher_duty_reminders`: Türkiye tarihine göre günlük hatırlatma. Satır kilidi ve `reminded_on` aynı nöbet için tekrar/çakışan çalıştırmalarda çift bildirimi engeller.
- `teacher_duty_reminders_on(date)` tarihli iç yardımcı testlerde gerçek bildirim davranışını hafta sonundan bağımsız doğrular. İki bildirim fonksiyonuna anonim ve kullanıcı RPC erişimi kapalıdır; yalnız service_role ve veritabanı işi çalıştırır.
- Cron UTC `*/15 4-14 * * 1-5`, Türkiye saati 07.00–17.45. O gün eklenen nöbet bir sonraki çalışmada hatırlatılır. Uygulama içi bildirimdir; e-posta/push değildir.
- Yönetim → Bildirim ayarları → Nöbet hatırlatması kapatılabilir. Kapalıyken o gün atlanan hatırlatma aynı gün geriye dönük gönderilmez.

Canlı migration ve yayın ayrıca onay gerektirir. Yerel uygulama için kullanıcı onayı alınmıştır.
