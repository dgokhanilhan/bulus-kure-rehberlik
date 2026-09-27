# Buluş Küre Koleji · Rehberlik & Mentörlük

8. sınıf LGS öğrencilerinin deneme sonuçlarını, konu (kazanım) hatalarını, görevlerini, görüşmelerini ve raporlarını
tek yerde tutan web uygulaması. Proje kuralları: [`CLAUDE.md`](CLAUDE.md) · yol haritası: [`docs/yol-haritasi.md`](docs/yol-haritasi.md).

Lisans: **AGPL-3.0-or-later** ([`LICENSE`](LICENSE)). PDF motoru MuPDF (AGPL) içerir; uygulamayı kullananlara kaynak
kodu bağlantısı verilir (`VITE_SOURCE_URL`, giriş ekranı ve profil menüsü).

## Gereksinimler
Node.js 20+, Docker Desktop, Supabase CLI.

## Yerel kurulum
```bash
npm ci
supabase start                 # yerel Supabase (Docker)
supabase db reset              # migration + örnek veri (uydurma isimler, demo şifreler)
cp .env.example .env.local     # `supabase status -o env` değerlerini yaz
cp supabase/functions/.env.example supabase/functions/.env
```
Üç ayrı terminalde:
```bash
npm run functions              # Edge Function'lar (ai-isim-duzelt, ai-veli-raporu)
npm run ai:sahte               # yerelde sahte yapay zekâ (gerçek anahtar gerekmez)
npm run dev                    # http://localhost:5173
```
Giriş ekranındaki "Demo hesapları" yalnız geliştirme derlemesinde görünür. Yönetici hesabı Authenticator (TOTP) ister.

## Testler
```bash
npm run typecheck
npm run test                   # Vitest: birim + RLS/veritabanı + yapay zekâ gizliliği (+ PDF regresyonu)
npm run e2e                    # Playwright: docs/test-senaryolari.md §1–§7 + erişilebilirlik
npm run e2e:dist               # üretim derlemesi + güvenlik başlıkları (CSP) altında kritik akışlar
npm run regresyon:kaydet       # fixtures/pdf/*.pdf için maskeli beklenen sonuçları (yeniden) üret
```
Gerçek deneme PDF'leri `fixtures/pdf/` içine konur (git'e girmez); ayrıntı: [`fixtures/README.md`](fixtures/README.md).

## Yapı
| Yer | İçerik |
| --- | --- |
| `src/` | React 18 + Vite + TypeScript arayüzü (`lib/analiz.ts` hesaplar, `lib/rapor.ts` veli raporu, `lib/deneme.ts` PDF → yayın) |
| `public/engine/` | Legacy Deneme Köprüsü PDF motoru (MuPDF WASM), Web Worker'da çalışır |
| `supabase/migrations/` | Şema, RLS, trigger'lar (bildirimler, şifreleme), RPC'ler, pg_cron günlük iş |
| `supabase/functions/` | `ai-isim-duzelt`, `ai-veli-raporu` (DeepSeek; anahtar yalnız secret'ta) |
| `tests/`, `e2e/` | Vitest ve Playwright testleri |
| `deploy/_headers.template` | Cloudflare Pages güvenlik başlıkları (derlemede `dist/_headers`) |
| `.github/workflows/` | CI testleri, haftalık şifreli yedek |

## Deneme ortamı (staging)
- Adres: **https://bulus-kure-staging.pages.dev** · Supabase projesi `bulus-kure-staging` (Frankfurt, "Buluş Küre Koleji" kuruluşu, Free).
- Yalnız uydurma örnek veri; giriş ekranında demo hesaplar (yönetici hariç) görünür. **Gerçek öğrenci verisi girilmez.**
- Yeniden yayınlama: `.env.staging` (git dışı; `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_DEMO=1`) ile `npm run deploy:staging`.
- Şema değişince: `supabase db push` (bağlı proje), fonksiyonlar: `supabase functions deploy`.

## Production (gerçek veri)
- Adres: **https://bulus-kure.pages.dev** · Supabase projesi `bulus-kure` (ref `ouajwxsywaihosclygis`, Frankfurt, "Buluş Küre Koleji" kuruluşu, şimdilik Free — pilot sonrası Pro).
- Demo hesap yok, seed yok. Okul kaydı (`schools`, slug `bulus-kure`) elle eklendi. İlk yönetici: siteden kayıt olur, SQL ile `role='admin', status='approved'` yapılır; ilk girişte Authenticator bağlar.
- Yayın: `npm run deploy:prod` (`.env.production`, git dışı). Veritabanı: `supabase link --project-ref ouajwxsywaihosclygis` → `supabase db push` → **sonra staging'e geri bağla**.
- Free planda otomatik yedek yok; 1 hafta kullanılmazsa proje uyur. Gerçek kullanıma geçerken Pro'ya yükselt.

## Yayına alma (hesap gerekir)
1. Supabase projeleri: **staging** (Free, yalnız örnek veri) ve **production** (Pro, Frankfurt — gerçek öğrenci verisi yalnız burada).
   `supabase link`, `supabase db push`, `supabase functions deploy`, `supabase secrets set DEEPSEEK_API_KEY=…`.
   Production'da `seed.sql` **uygulanmaz**; ilk yönetici hesabı elle oluşturulur.
2. Cloudflare Pages: `npm run build`, çıktı klasörü `dist`, ortam değişkenleri `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`,
   `VITE_SOURCE_URL` (ve isteğe bağlı `VITE_SENTRY_DSN`).
3. GitHub secret'ları (yedek): `SUPABASE_DB_URL`, `BACKUP_PASSPHRASE`.
4. KVKK aydınlatma metni (`src/pages/KvkkPage.tsx`) okulun hukukçusu tarafından tamamlanmalı; değişince `src/lib/kvkk.ts` sürümü artırılır.
