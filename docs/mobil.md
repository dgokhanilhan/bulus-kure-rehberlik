# iOS ve Android uygulaması (Capacitor)

Mobil uygulama ayrı bir proje değildir: web uygulamasının **mobil derlemesi** (`vite build --mode mobil` → `dist-mobil/`)
Capacitor ile iOS (`ios/`) ve Android (`android/`) projelerine paketlenir. Ekranlar, yetkiler ve RLS web ile aynıdır.

## Komutlar

```
npm run mobil:build     # mobil derleme + cap sync (ios/ ve android/ projelerine kopyalar)
npm run mobil:ios       # derle + Xcode'da aç (yalnız Mac)
npm run mobil:android   # derle + Android Studio'da aç
npm run e2e:mobil       # mobil paketi telefon boyutunda test et (yerel Supabase açık olmalı)
```

Sürümler: Capacitor 8.5.2 (iOS 15+, Android 7 / API 24+). Paket sürümleri tam sabittir (`-E`).

## Ortam değişkenleri

`vite --mode mobil` önce `.env.local`, sonra `.env.mobil.local` dosyasını okur. Mağaza derlemesi için
`.env.mobil.example` → `.env.mobil.local` kopyalanır; canlı Supabase **adresi** ve **anon** (herkese açık) anahtar yazılır.
`service_role` ya da başka gizli anahtar mobil pakete ASLA girmez (paket cihazda açılabilir).

## Web derlemesinden farklar

| Konu | Web | Mobil |
| --- | --- | --- |
| Oturum (yenileme anahtarı) | `localStorage` | iOS Keychain / Android Keystore (`@aparajita/capacitor-secure-storage`) |
| Güvenlik başlıkları (CSP) | `_headers` (Cloudflare) | `index.html` içinde CSP meta (frame-ancestors hariç) |
| PDF ile deneme yükleme, karne laboratuvarı | var | **yok** (bilgisayardan web sitesinde) |
| Excel / CSV, elle giriş, ders programı fotoğrafı (OCR) | var | var |
| Açılış bekçisi (`boot-check.js`) | var | yok (dosyalar cihazda) |
| Android yedekleme | — | kapalı (`allowBackup=false`, bulut yedeği ve cihaz aktarımı hariç tutulur) |

Derleme sonunda `deploy/mobil-kontrol.ts` paketi denetler; MuPDF dosyası, `engine/`, `_headers`, `ornek/` ya da CSP
meta etiketi eksikliği varsa **derleme düşer** (`tests/mobil-kontrol.test.ts`).

## Lisans (AGPL) ve uygulama mağazaları

- **MuPDF** (Artifex, AGPL-3.0) okulun değildir; App Store / Google Play dağıtım koşulları AGPL ile bağdaşmadığı için
  mobil pakete **konmaz**. PDF okuma web'de kalır. Mobilde PDF okuma istenirse seçenekler: Artifex'ten ticari lisans ya da
  başka bir PDF okuyucu (ayrı iş, ayrı karar).
- Mobil pakete giren üçüncü taraf bağımlılıkların hepsi serbest lisanslıdır (MIT, Apache-2.0, BSD, ISC, OFL fontlar;
  2026-10 denetimi). Yeni bağımlılık eklerken GPL/AGPL olmadığı kontrol edilmeli.
- Uygulamanın **kendi kodu** AGPL-3.0'dır. Mağazada dağıtım için kodun sahipleri AGPL §7 kapsamında bir **ek izin**
  ekleyebilir (örnek metin aşağıda). Bu bir hukuki karardır: kodun tüm katkıcılarının onayı ve hukukçu görüşü gerekir;
  onaylanmadan `LICENSE` dosyasına eklenmez.

> Ek izin (taslak): "Bu programın telif hakkı sahipleri olarak, bu programın değiştirilmemiş ya da değiştirilmiş
> sürümlerini Apple App Store ve Google Play gibi uygulama mağazaları üzerinden, bu mağazaların kullanım koşullarıyla
> birlikte dağıtma izni veriyoruz. Kaynak kodu sunma yükümlülüğü (AGPL §6, §13) geçerliliğini korur."

## Gizli dosyalar (depo herkese açık)

İmza anahtarları (`*.jks`, `*.keystore`, `keystore.properties`), Apple sertifika/profilleri (`*.p8`, `*.p12`,
`*.mobileprovision`) ve Firebase dosyaları (`google-services.json`, `GoogleService-Info.plist`) `.gitignore`'dadır.
Android imza anahtarı okulun hesabında **Play App Signing** ile tutulmalı; yükleme anahtarı kaybolursa Google'dan
sıfırlanabilir. Apple sertifikaları okulun Apple Developer hesabında üretilir.

## Uygulama kimliği

`com.buluskurementor.app` (`capacitor.config.ts`). Mağazaya ilk yüklemeden sonra **değiştirilemez**; değişecekse
ilk yüklemeden önce `capacitor.config.ts`, `ios/App/App.xcodeproj` (PRODUCT_BUNDLE_IDENTIFIER) ve
`android/app/build.gradle` (applicationId, namespace) birlikte değiştirilir.

## Yerel deneme

- **iOS Simulator:** `npm run mobil:build`, sonra Xcode'da çalıştır. Yerel Supabase (`http://127.0.0.1:54321`) için
  Info.plist'te `NSAllowsLocalNetworking` açıktır (yalnız yerel ağ adreslerine izin verir; internet adreslerinde HTTPS zorunlu kalır).
- **Android emülatör:** uygulama `https://localhost` kökenindedir; Android düz HTTP'yi engellediği için yerel
  Supabase'e bağlanamaz. Android'de giriş denemesi staging (HTTPS) Supabase ile yapılır
  (`.env.mobil.local` → staging adresi, `adb reverse` gerekmez).
- Mobil derlemeyi tarayıcıda denemek: `npm run e2e:mobil` (Playwright, Pixel 7 boyutu).

## Sonraki aşamalar

1. **Aşama 2:** paylaşım / dosya indirme (rapor PDF'i: WebView'de `a[download]` çalışmaz → Filesystem + Share),
   derin bağlantılar (davet ve şifre sıfırlama; `buluskurementor.com/.well-known/apple-app-site-association` ve
   `assetlinks.json`), uygulama içi hesap silme, iOS klavye açılınca üst çubuğun kayması (`@capacitor/keyboard`).
2. **Aşama 3:** anlık bildirim (APNs + FCM; okulun Firebase projesi).
3. **Aşama 4:** canlı güncelleme (Capawesome, imzalı paket).
4. **Aşama 5:** mağaza: simge ve açılış görseli, gizlilik etiketleri (App Privacy / Data safety), inceleme hesabı,
   Eğitim kategorisi (Kids değil), reklam ve izleme SDK'sı yok.
