# Hız Kapalı Devre PDF ve hesap ayarları

Hız lise karnelerindeki kazanım listesi öğrenci başına üç sayfaya taşabiliyor. Bazı tablolar görselde üst üste basılsa da PDF içerik sırası ayrı blokları koruyor. Okuyucu, sayfa devamını ve içerik sırasını kullanır; öğrenciye ait soru sayıları D/Y/B ile doğrulanır.

A/B kitapçıkları farklı soru sırası taşıdığı için exam_items anahtarı kitapçığı da içerir. Öğrencinin bölüm kitapçıkları exam_results.source.booklets içinde tutulur. Konu eksikleri, raporlar ve sınıf analizi öğrencinin kendi kitapçığının sorularını kullanır. Eski kayıtlar A olarak korunur; kaynak bilgisi değiştirilmeden eski analiz davranışı sürer.

Alan puanları kaynak PDF'den okunur; SAY, EA, SÖZ ve DİL ayrı gösterilir. TYT kutusundaki değer başka alana taşınmaz, alan puanları hesaplanmaz veya en yükseği genel puan yapılmaz.

## Mevcut denemeyi tamamlama

Aynı dosya yeniden yüklendiğinde yeni deneme açılmaz. Yönetici, PDF ayrıntılarını tamamla düğmesiyle mevcut kaydı tamamlayabilir. repair_exam_pdf RPC'si yönetici MFA, okul, kaynak SHA ve şablonu doğrular. Bütün sayısal sonuçlar ve yeni cevapların D/Y/B sayıları önce mevcut kayıtla karşılaştırılır. Uyuşmazlık işlemi geri alır. Puan, net, ders sayıları ve sonuç kimlikleri değiştirilmez. Var olan çözümlenmiş soru bağları uyuşmazsa işlem durur; eksik soru metinleri tamamlanabilir.

0043 migration yalnız altyapıyı kurar; hiçbir canlı denemeyi kendiliğinden yeniden işlemez. 2026–2027 dönemi sıfırlanmaz. Gelecek dönem geçişi çalıştırılmaz.

## Sınıf alanı

11 ve 12. sınıflarda SAY, EA, SÖZ, DİL seçilebilir. Mevcut sınıfların alanı boş kalır. Alan sınıf adında görünür. Öğrenci eşleştirmesi alan ekini kaldırarak isim ve şubeyi karşılaştırır. Gelecekte 11 -> 12 geçişinde alan korunur.

## Hesap ayarları

Her üye profil menüsünden Hesap ayarları ekranını açabilir. Tema ve yazı boyutu bu cihazdaki hesaba özeldir; okulun varsayılanına dönülebilir. Depolama kapalıysa tercih oturum belleğinde çalışır.

Authenticator yöneticiler için zorunlu, diğer üyelerde isteğe bağlıdır. Etkinleştirilmiş üyede AAL1 veri erişimi veritabanında da engellenir; ikinci faktör doğrulanınca sorgular yeniden yüklenir. Kapatmak doğrulanmış oturum ister, yönetici ekranında kapatma seçeneği verilmez.

Şifre değişikliğinde mevcut şifre ayrı ve kalıcı olmayan bir Auth oturumunda doğrulanır; ana MFA oturumu değiştirilmez. Yeni e-posta doğrulanmadan eski adres korunur. Auth tarafından onaylanan adres değişikliği profiles.email alanına yansır. Şifreler veya OTP anahtarları veritabanımıza eklenmez.
