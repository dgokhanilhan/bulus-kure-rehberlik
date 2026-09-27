# Uçtan uca test senaryoları

Prototipte (`prototype/prototip.html`) bu senaryoların hepsi çalışıyor; gerçek uygulamada Playwright ile otomatikleştirilir. Demo hesaplar seed'de aynı e-posta/şifreyle bulunur (yalnız local/staging).

| Rol | E-posta | Şifre |
| --- | --- | --- |
| Yönetici (TOTP) | admin@buluskure.k12.tr | Admin123! |
| Rehber | rehber@buluskure.k12.tr | Rehber123! |
| Matematik | matematik@buluskure.k12.tr | Mat12345! |
| Veli (Elif) | ayse.yildiz@ornek.com | Veli1234! |
| Öğrenci (Elif) | elif.yildiz@ornek.com | Ogrenci123! |
| Onay bekleyen öğrenci | mert.demir@ornek.com | Ogrenci123! |

## 1. Giriş ve kayıt
1. Yanlış şifre → "E-posta veya şifre hatalı."
2. Admin doğru şifre → TOTP ekranı; yanlış kod reddedilir; doğru kodla girer.
3. Kayıt: şifreler farklı → hata; eksik rol alanı → hata; aynı e-posta → hata; doğru → "Kaydın alındı".
4. Onaysız kullanıcı girer → yalnız "onay bekliyor" ekranı; API'den öğrenci okumaya çalışırsa boş/403.
5. Admin onaylar (veli için öğrenci seçer) → kullanıcı tekrar girince kendi ekranlarını görür.

## 2. Yetkiler
1. Matematik öğretmeni menüsünde yalnız "Öğrenciler"; öğrenci dosyasında Görev ata / Veli raporu / Görüşme / Öğretmen raporu yok; not ekleyebilir.
2. Veli yalnız kendi çocuğunu görür; başka öğrenci id'siyle istek → boş.
3. Rehber her şeyi yapar ama Onaylar sayfası yok.

## 3. Görevler
1. Rehber Elif'e görev atar (tekrar eden hata etiketli konu), "Kaydet ve yeni ekle" ile ikinci görev (serbest konu, 1 hafta sonra, haftalık tekrar).
2. Öğrenci girişinde iki görev + bildirim; "+5 soru", "Tamamladım" → rehbere ve veliye bildirim.
3. Haftalık görev tamamlanınca 7 gün sonrasına yeni kopya.
4. Son günü geçmiş görev → cron sonrası adminde "Görev aksadı" bildirimi (bir kez).

## 4. Görüşmeler ve notlar
1. Rehber "Veli ve öğrenci" görüşmesi planlar → veli ve öğrenciye bildirim.
2. Bugün → Görüşmeler → Değiştir ile saat değişir → ikisine "saat değişti" bildirimi.
3. Veli "Katılacağım" → rehbere bildirim.
4. "Veli görsün" not → veli bildirimi; "Gizli" not → matematik öğretmeni göremez.

## 5. Denemeler
1. PDF yükle → okuma adımları → yazım hatalı isimler otomatik düzeltilir ve listelenir.
2. Listede olmayan isim ve D+Y+B tutarsızlığı kontrol ister; çözülmeden "Yayınla" pasif.
3. Yayınla → sonuçlar öğrencilere işlenir, veli/öğrenci bildirimi, Bugün yeniden hesaplanır.

## 6. Raporlar
1. Öğrenci dosyası → Denemeler → her deneme için Veli raporu ve Öğretmen raporu.
2. Veli raporu: yapay zekâ ile yaz (anonim istek), mentör yorumu düzenle, kaydet, veliye + öğrenciye gönder → onların Raporlar sayfasında ve zilinde.
3. Öğretmen raporu → "Tüm öğretmenler" → matematik öğretmeni zilden açar.
4. PDF indir: metin seçilebilir, Türkçe karakterler doğru, 1–2 sayfa.

## 7. Sınıflar ve etüt
1. 8/B · Matematik → en zor konuya tıkla → yanlış yapan öğrenciler → öğrenciye git.
2. Etüt: yalnız Cumartesi günleri listelenir, saatler 09–10…12–13; dolu saat seçilemez; "+ Konu ekle" çalışır; şube öğrencilerine ve velilerine bildirim.
