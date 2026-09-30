# Faz PR'larını birleştirme sırası (#6–#13)

Faz A–H'nin PR'ları zincir halinde açıldı: her PR bir önceki fazın dalını hedefliyor (base). Bu sayede her PR'da yalnız o fazın değişikliği görünüyor. Ama birleştirirken dikkat etmek gerekiyor: base'i main olmayan bir PR birleştirilirse kod main'e değil, o dala gider (#3'te olan buydu).

**Tek kural: "Merge" düğmesine basmadan önce PR'ın base'i `main` olmalı.**

| Sıra | PR | Dal | Veritabanı / fonksiyon |
|---|---|---|---|
| 1 | #6 Faz A | `faz-a/yonetim-merkezi` | 0011, 0012 |
| 2 | #7 Faz B | `faz-b/odev` | 0013 (pg_cron işi) |
| 3 | #8 Faz C | `faz-c/dosyalar` | 0014 (Storage bucket'ları) |
| 4 | #9 Faz D | `faz-d/takvim-bildirim` | 0015 (pg_cron işi) |
| 5 | #10 Faz E | `faz-e/devamsizlik` | 0016 |
| 6 | #11 Faz F | `faz-f/hesap-acma` | 0017 + `admin-davet` fonksiyonu |
| 7 | #12 Faz G | `faz-g/bursluluk` | 0018 |
| 8 | #13 Faz H | `faz-h/dashboard-aktarim` | 0019 + `admin-davet` yeniden |

## Önce veritabanı, sonra birleştirme

Cloudflare main'e giren kodu hemen yayınlıyor. Yeni ekranlar yeni tabloları istediği için migration'lar kod main'e girmeden önce uygulanmalı. Migration'lar yalnız ekleme yapar: tablo, sütun, fonksiyon ekler; veri silmez, sütun düşürmez.

1. Supabase Dashboard'dan veritabanının yedeğini al (ya da gece yedeğinin güncel olduğundan emin ol).
2. Bilgisayarda:
   ```bash
   git fetch origin
   git checkout faz-h/dashboard-aktarim
   supabase link --project-ref <yeni-proje-ref>
   supabase migration list   # 0001–0010 "Remote" sütununda görünmeli
   supabase db push
   supabase functions deploy admin-davet
   ```
   `migration list` çıktısında 0001–0010'un Remote sütununda görünmesi gerekir. Görünmüyorsa `db push` çalıştırma; önce durumu netleştir, yoksa eski migration'ları yeniden uygulamaya çalışır. Görünüyorsa `db push` yalnız 0011–0019'u sırayla uygular. Hata verirse dur; hiçbir PR'ı birleştirme.
   pg_cron zaten açık olmalı (0003 kullanıyor); değilse Dashboard → Database → Extensions → pg_cron.
3. `git checkout main` ile ana dala geri dön.

## Birleştirme (her PR için aynı adımlar)

1. #6'yı aç. Üstte **"wants to merge … into `main`"** yazdığını gör.
2. **"Create a merge commit"** ile birleştir. Squash ya da rebase kullanma: sonraki PR'larda aynı değişiklikler yeniden görünür ve çakışma çıkar.
3. **"Delete branch"** düğmesine bas. Dal silinince GitHub bir sonraki PR'ın (#7) base'ini kendiliğinden `main` yapar.
4. #7'yi aç ve base'in `main` olduğunu kontrol et. Hâlâ `faz-a/...` yazıyorsa başlığın yanındaki **Edit** → base açılır menüsü → `main` → **Change base**.
5. Aynı adımlarla #8, #9 … #13'e kadar devam et.

Her birleştirmeden sonra Cloudflare yeni sürümü yayınlar. İstersen her adımda siteyi hızlıca kontrol et; en azından sonda bir kez kontrol et.

## Birleştirme bittikten sonra

- **Supabase → Authentication → URL Configuration:** Site URL ve Redirect URLs listesine `https://buluskurementor.com` eklenmeli. Davet ve şifre sıfırlama bağlantıları buna göre çalışır.
- **Authentication → Email Templates:** davet ve şifre sıfırlama e-postaları Türkçeleştirilmeli.
- **Toplu öğretmen daveti:** kullanmadan önce özel SMTP kurulmalı (Authentication → SMTP Settings). Yerleşik e-posta servisi saatte çok az e-posta gönderir.
- **Yönetim Merkezi → Modüller:** Ödev, Takvim ve Bursluluk gibi modülleri istediğin gibi aç ya da kapat.

## Diğer açık PR

- **#1 (e-posta doğrulama mesajı):** main'i hedefliyor ve faz dallarıyla çakışmıyor. Faz PR'larından önce ya da sonra birleştirilebilir.
