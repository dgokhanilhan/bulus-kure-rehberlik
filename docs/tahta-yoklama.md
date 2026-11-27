# BK Akıllı Yoklama · akıllı tahta programı

Akıllı tahtalarda (Windows 10/11) çalışan sabah yoklaması programı. Sunucu tarafı: `supabase/migrations/0080_tahta_yoklama.sql`
(kurallar için `docs/urun-ve-roller.md` → "BK Akıllı Yoklama · pilot"). Program: `tahta/`.

Pilot: yalnız tahtası bağlı sınıflar (şimdilik 8/A, 8/B). Diğer sınıflarda hiçbir şey değişmez.

## Öğretmenin sabahı

1. Tahta açılır; 08:30–09:40 arasındaysa program kendiliğinden tam ekran gelir (saat dışında masaüstündeki **BK Yoklama** simgesi).
2. **8/A yoklamasını al** → herkes "Geldi" olarak gelir. Gelmeyene dokun (Gelmedi); ⋯ ile Geç geldi / İzinli / Raporlu.
   İdarenin siteden girdiği izinli/raporlu öğrenci kilitlidir.
3. **Yoklamayı gönder** → kişisel 4 haneli PIN (tuşların yeri her seferinde değişir).
4. "Kaydedildi" ekranı 1 dakika sonra kendini temizler. 15 dakika içindeki düzeltmede PIN tekrar sorulmaz.
5. Velilere "gelmedi / geç geldi" bildirimi 10:00'da (Yönetim'den değişir) o anki son duruma göre gider.

İnternet yoksa yoklama tahtada bekler ve bağlantı gelince kendiliğinden gönderilir. PIN diske yazılmaz; program kapanırsa
gönderim için PIN tekrar sorulur. Ertesi güne kalan bekleyen yoklama gönderilmez (sunucu yoklamayı o güne yazar); program
"idareye bildir" uyarısı gösterir.

## Kurulum (her tahtaya bir kez)

1. **Kurulum dosyası:** GitHub → Releases → en son **BK Yoklama x.y.z** → `BK-Yoklama_x.y.z_x64-setup.exe`. Program kod imzalı
   olmadığı için Windows SmartScreen "Bilinmeyen yayımcı" diyebilir: *Ek bilgi → Yine de çalıştır*.
2. Kurulum tahtada oturum açan Windows kullanıcısına yapılır, yönetici izni istemez (güncellemeler de bu sayede onay sormadan kurulur).
   Tahtada birden çok Windows kullanıcısı varsa programı kullanan hesapta kur. WebView2 yoksa kurulum indirir.
   **0.1.0'dan geçerken:** önce Ayarlar → Uygulamalar'dan eski **BK Yoklama**'yı kaldır (0.1.0 tüm kullanıcılara kurulmuştu), sonra
   0.2.0'ı kur. Tahta bağlantısı silinmez; yeniden kod gerekmez.
3. **Bağlama:** buluskurementor.com → Yönetim → Yoklama ayarları → Akıllı tahtalar → sınıfı seç → **Tahta ekle ve kod al**.
   Tahtada programı aç, `XXXX-XXXX` kodunu yaz → **Bağla**. Kod 10 dakika geçerli ve tek kullanımlıktır.
   Bağlanınca program Windows açılışında başlamak üzere kendini ayarlar.
4. **PIN:** Pilot sınıfa giren her öğretmen sitede Hesap ayarları → **Tahta yoklama PIN'in** → **PIN al**. PIN'i sistem verir ve bir
   kez gösterir; unutan yenisini alır (eskisi geçersiz olur).

## Güncelleme (0.2.0 ve sonrası)

Program açılışta ve günde bir kez yeni sürüm olup olmadığına sessizce bakar, varsa arka planda indirir. Kurulum yalnız program
boştayken yapılır: ana ekranda, 1 dakikadır dokunulmamış, PIN/QR ekranı kapalı, gönderim ya da tahtada bekleyen yoklama yokken.
Ekranda "Yeni sürüm kuruluyor" görünür, program birkaç saniyede yeni sürümle açılır. İnternet yoksa ya da kontrol başarısızsa hiçbir
şey görünmez. Hangi tahtada hangi sürüm olduğu ana ekranın alt satırında yazar ("Sürüm 0.2.0").

Yeni sürüm yayınlamak (geliştirici):

1. `tahta/src-tauri/tauri.conf.json` ve `tahta/src-tauri/Cargo.toml`'da `version`'ı artır, PR ile main'e al.
2. main'de etiket at: `git tag tahta-v0.2.1 && git push origin tahta-v0.2.1`.
3. `.github/workflows/tahta-surum.yml` imzalı kurulum dosyasını ve `latest.json`'ı Release'e yükler ("Latest" olarak). Tahtalar ilk
   boş anlarında kurar. Başka bir Release'i "Latest" yapma: program `releases/latest/download/latest.json`'a bakar.

İmza anahtarı yalnız GitHub Secrets'ta (`TAURI_SIGNING_PRIVATE_KEY`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`); açık anahtar
`tauri.conf.json` → `plugins.updater.pubkey`. Anahtar kaybolursa tahtalar yeni sürümleri reddeder; yeni anahtarlı sürüm her tahtaya
bir kez elle kurulur. Güncelleme isteği programın Windows tarafından (Rust) yapılır; pencerenin CSP'si bu yüzden değişmedi.

## Sorunlar

| Ekranda | Ne yapılır |
| --- | --- |
| "Bu tahtanın okulla bağlantısı kaldırılmış" | İdare tahtayı kaldırmış ya da yeniden bağlamış. Akıllı tahtalar'dan yeni kod al. |
| "Tahta … kilitli" | 10 dakikada 5 yanlış PIN: 10 dk bekle. Günde 10 yanlış: idare Akıllı tahtalar'dan **Kilidi aç**. |
| "Program sunucu adresi olmadan derlenmiş" | Kurulum dosyası depo değişkenleri tanımlanmadan derlenmiş (aşağıya bak). |
| Bağlantı yok | Yoklama bekler; bağlantı gelince kendiliğinden gider. Programı kapatmamak yeterli. |

## Geliştirici

- Ön yüz: `tahta/src` (React, kök depodaki node_modules). Tarayıcıda: `npm run dev` → `http://localhost:5173/tahta/index.html`
  (tahta anahtarı tarayıcıda localStorage'da tutulur; Windows'ta Kimlik Bilgileri Yöneticisi'nde).
- Windows tarafı: `tahta/src-tauri` (Tauri 2). Yalnız pencere, Windows açılışında başlama (`--otomatik`), tek kopya ve anahtar saklama.
- Testler: `tahta/src/lib/yoklama.test.ts` (Vitest), `e2e/tahta-uygulama.spec.ts` (Playwright, yerel Supabase'e karşı).
- `.exe` derleme `.github/workflows/tahta-exe.yml` (windows-latest). Yerelde derlemek için Rust + Visual Studio C++ derleme araçları gerekir:
  `cd tahta && npx @tauri-apps/cli icon app-icon.png && npx @tauri-apps/cli build`.
- Production derlemesi için depo değişkenleri: `TAHTA_SUPABASE_URL`, `TAHTA_SUPABASE_ANON_KEY` (anon anahtar açıktır; yapay zekâ
  ya da service role anahtarı **asla** buraya girmez).
- Henüz yok: Windows kod imzalama sertifikası (SmartScreen uyarısı bundan). Güncelleme imzası ayrı ve var (yukarıda).
