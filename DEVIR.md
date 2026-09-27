# Devir rehberi · Buluş Küre Rehberlik & Mentörlük

Bu belge, projeyi devralıp kendi alan adıyla yayına alacak kişi içindir. Genel kurulum ve komutlar için README.md'ye bakın.

## Şu anki durum (27 Eylül 2026)

| Parça | Nerede | Kimin hesabında |
|---|---|---|
| Production sitesi | https://bulus-kure.pages.dev (Cloudflare Pages, proje `bulus-kure`) | Projeyi hazırlayanın Cloudflare hesabı |
| Production veritabanı | Supabase `bulus-kure`, ref `ouajwxsywaihosclygis`, Frankfurt, Free | Supabase kuruluşu "Buluş Küre Koleji" |
| Deneme ortamı | https://bulus-kure-staging.pages.dev + Supabase `bulus-kure-staging` (yalnız uydurma veri, demo şifreleri herkese açık) | Aynı hesaplar |
| Yapay zekâ | DeepSeek API anahtarı, iki Supabase projesinde `DEEPSEEK_API_KEY` secret'ı | DeepSeek hesabı |
| Günlük yedek | GitHub `karakocyawuz/bulus-kure-yedek` (gizli), her gece 03.00, şifreli, 30 gün | Projeyi hazırlayanın GitHub hesabı |
| İlk yönetici | Gökhan İlhan (denizgokhanilhan@gmail.com), TOTP zorunlu | — |

Şifreler (veritabanı, yedek şifresi, site ayarları) git'te değildir; `.env.production.local`, `.env.production`, `.env.staging`, `.env.staging.local` dosyalarında durur ve ayrıca teslim edilir.

## 1. Hesapları kendi üzerine alma (önerilen)

- **Supabase:** Hazırlayan kişi sizi "Buluş Küre Koleji" kuruluşuna **Owner** olarak ekler (Organization → Team). Sonra siz ekleyebilir ya da projeleri kendi kuruluşunuza taşıyabilirsiniz (Project Settings → General → Transfer project). Veri ve adres değişmez.
- **Cloudflare:** Kendi Cloudflare hesabınızda (`npx wrangler login`) bir kez `npx wrangler pages project create <ad> --production-branch main`, sonra her yayında `CF_PROJECT=<ad> npm run deploy:prod`. Ayarlar için `.env.production.example` dosyasını `.env.production` olarak kopyalayın.
- **DeepSeek:** Kendi anahtarınızı alıp Supabase'de (Edge Functions → Secrets) `DEEPSEEK_API_KEY` değerini değiştirin. Eski anahtar hazırlayanın hesabından silinmelidir.
- **Yedek:** `.github/workflows/yedek.yml` dosyasını kendi **gizli** deponuza koyun. `SUPABASE_DB_URL` (Supabase → Connect → Session pooler) ve `BACKUP_PASSPHRASE` secret'larını girin. Eski yedek deposu sonra kapatılabilir.

## 2. Alan adını bağlama

1. **Cloudflare Pages** → proje → **Custom domains** → **Set up a custom domain** → örn. `rehberlik.okuladi.com`. Alan adı Cloudflare'de değilse, gösterilen CNAME kaydını alan adı sağlayıcısında ekleyin.
2. **Supabase** → Authentication → **URL Configuration**:
   - **Site URL:** `https://rehberlik.okuladi.com`
   - **Redirect URLs:** yeni adresi ekleyin (eski `pages.dev` adresi kalabilir).
3. `deploy/_headers.template` içindeki CSP'de alan adına özel bir şey yoktur. Supabase adresi değişmediği sürece yeniden derlemek gerekmez.
4. Kontrol: yeni adreste giriş, kayıt ve **şifremi unuttum** e-postasındaki bağlantı yeni adrese gitmeli.

## 3. Gerçek kullanıma geçmeden önce

- **Supabase Pro** (~25 $/ay): günlük otomatik yedek var ve proje uyumaz. Free planda 1 hafta kullanılmayan proje uyur.
- **KVKK aydınlatma metni** (`src/pages/KvkkPage.tsx`) hukukçu tarafından tamamlanmalı. Metin değişince `src/lib/kvkk.ts` sürümünü artırın; kullanıcılar yeniden onay verir.
- **AGPL-3.0:** Siteyi kullananlara kaynak kodu sunulmalı. Kodu bir depoya koyup `.env.production` içine `VITE_SOURCE_URL=<depo adresi>` ekleyin; giriş sayfasındaki "Kaynak kodu" bağlantısı oraya gider.
- **E-posta:** Supabase'in yerleşik e-postası saatte birkaç iletiyle sınırlıdır. Şifre sıfırlama yoğunlaşırsa Authentication → SMTP'ye okulun e-posta sunucusunu girin.
- **Gerçek öğrenci verisi yalnızca production'a girilir.** Deneme ortamının demo şifreleri herkese açıktır.

## 4. Günlük işler

| İş | Komut |
|---|---|
| Yerelde çalıştırma | `npm install`, `supabase start`, `npm run dev` (README) |
| Testler | `npm test`, `npm run e2e` |
| Siteyi yayınlama | `npm run deploy:prod` |
| Veritabanı değişikliği | `supabase link --project-ref ouajwxsywaihosclygis` → `supabase db push` → sonra deneme ortamına geri bağlayın |
| Yapay zekâ fonksiyonları | `supabase functions deploy --project-ref ouajwxsywaihosclygis` |
