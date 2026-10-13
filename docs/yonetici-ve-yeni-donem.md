# Yönetici rolleri, ödev durumu ve gelecek dönem

0041 / 0042 migration'ları yalnız altyapıyı kurar; mevcut dönemi başlatmaz, kapatmaz, öğrenci yükseltmez ve günlük kayıtları taşımaz.

## Yönetici
Yönetim → Güvenlik ve erişim → Hesap rolleri ve yönetici atama üzerinden mevcut onaylı okul hesabına admin rolü eklenir. Ana öğretmen/veli/öğrenci rolü korunur. Yönetici rolünü sadece AAL2 yönetici ekler. Yeni yönetici kendi mevcut e-posta/şifresi ile giriş yapar, QR kodunu Google/Microsoft Authenticator'a ekler ve TOTP kodunu doğrular. Kurulum anahtarı e-postayla gönderilmez. Tüm girişlerde admin rolü olan hesaplar MFA kapısından geçer; iki saatlik yönetici oturumu sınırı rol geçişinde de korunur. MFA olmadan is_admin() false döner. Yönetici kendi yetkisini veya ana rolünü kaldıramaz. İşlemler audit kaydına yazılır. Başka okulun hesabı atanamaz.

Okul yönetimi menüsü/rotası kaldırıldı. Önceki özel okul rolü kayıtları silinmedi; yeni yetki atamaları mevcut hesap rolleri üzerinden yapılır.

## Getirmedi
Yaptı / Yapmadı / Getirmedi / Eksik / Gelmedi / İzinli ayrı durumlardır. Getirmedi kontrol edildi sayılır, veli/öğrenciye bu etiketle gösterilir ve kontrol bildirimi de Getirmedi yazar. Yalnız ödevi veren öğretmen veya yönetici işaretler. Getirmedi geciken/eksik grubunda görünür.

## Okul numarası
students.school_no artık benzersiz değildir; indeks arama içindir. Yeni kayıt, toplu aktarım ve sınav sonucu farklı isim/sınıflardaki aynı numarayı kabul eder. Eşleştirme ad-soyad ve sınıf üzerinden yapılır; okul numarası tahmin önceliği vermez. Yakın/belirsiz isimler kontrol ister. Aynı sınıfta aynı ad-soyad otomatik birleştirilmez. Alternatif PDF sayfası tekrar kontrolüne sınıf bilgisi eklendi; farklı sınıftaki aynı ad/numara karışmaz.

## Gelecek dönem
Yıl eklemek yalnız pasif bir yıl oluşturur. Yeni dönem başlangıç tarihinden önce hem arayüz hem RPC işlemi engeller. Aktif yıl doğrudan değiştirilemez/kapatılamaz. Yönetici Eğitim yılları bölümünde Yeni dönemi başlat ile önizlemeyi açar; arşiv sayıları, yükseltilecek ve mezun öğrenci sayıları gösterilir. Yıl adını aynen yazarak onaylar.

start_next_academic_year tek transaction içinde:
1. Okul/yıl/yetki/tarih/onayı doğrular ve eşzamanlı yazımları kilitler.
2. Önceki dönemin günlük kayıtları, öğrenci/sınıf ve ilişki bilgileri academic_year_archives.data içine saklanır. Hassas şifreli alanlar şifreli kalır. Arşiv okulun MFA yöneticilerine özeldir; ekranda kayıt grubu seçilip okunabilir kartlar halinde incelenebilir; yetkili arşiv okuma RPC'si şifreli rehberlik alanlarını yalnız okulun MFA yöneticisine çözer. İndirilen JSON kopyasında bu alanlar şifreli kalır.
3. Günlük deneme, ödev, görev, rapor, görüşme, not, yoklama, takvim, ders programı/ataması, menü, duyuru, mesaj, bildirim ve nöbet kayıtları aktif tablolardan arşive taşınır. Dosyalar fiziksel olarak silinmez, bilgileri arşivde saklanır. Galeri albümleri mevcut galeri arşivine alınır; eski bursluluk etkinlikleri pasifleşir, başvurular korunur.
4. Aktif 8 ve 12. sınıf öğrencileri archived_at ile mezun olur; yeni yıla aktarılmaz. Diğer öğrenciler aynı şubede bir üst sınıfa geçer; hedef puanı temizlenir. Sınıfı eksik öğrenci varsa işlem engellenir. Kullanıcı hesapları/veli bağlantıları, kataloglar, okul/tasarım ayarları ve audit kayıtları korunur.
5. Yeni yıl aktif olur. Aynı geçiş ikinci kez çalışamaz. Herhangi bir hata tüm transaction'ı geri alır.

Mevcut 2026–2027 döneminde bu RPC çalıştırılmayacak. Canlıya yalnız migration ve arayüz kodu uygulanabilir; dönem başlatma ayrı, ileride yapılacak işlemdir.
Mezun öğrencilerin ve başka aktif çocuğu kalmayan normal veli hesaplarının durumu gelecek dönem geçişinde pasifleşir. Öğretmen/yönetici çalışma rolleri olan hesaplar ve başka aktif çocuğu olan veliler korunur. Hesaplar fiziksel olarak silinmez. Bu işlem de tarih/onay kilidinin arkasındadır; migration uygulanırken hesaplar kapatılmaz.

Yönetici rolü bulunan hesap MFA tamamlanmadan eski öğretmen/veli rolüyle de okul verisini API'den okuyamaz: my_school, personel/aile yardımcıları ve bildirim politikası MFA kilidine uyar. MFA tamamlandığında arayüzdeki okul/öğrenci sorguları yeniden alınır.
