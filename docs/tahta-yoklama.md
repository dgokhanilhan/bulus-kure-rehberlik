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

1. **Kurulum dosyası:** GitHub → Actions → "Tahta programı (.exe)" → son başarılı çalıştırma → **BK-Yoklama-kurulum** (zip içinde
   `BK Yoklama_0.1.0_x64-setup.exe`). Program imzasız olduğu için Windows SmartScreen "Bilinmeyen yayımcı" diyebilir:
   *Ek bilgi → Yine de çalıştır*.
2. Kurulum tüm kullanıcılar için yapılır (yönetici izni ister). WebView2 yoksa kurulum indirir.
3. **Bağlama:** buluskurementor.com → Yönetim → Yoklama ayarları → Akıllı tahtalar → sınıfı seç → **Tahta ekle ve kod al**.
   Tahtada programı aç, `XXXX-XXXX` kodunu yaz → **Bağla**. Kod 10 dakika geçerli ve tek kullanımlıktır.
   Bağlanınca program Windows açılışında başlamak üzere kendini ayarlar.
4. **PIN:** Pilot sınıfa giren her öğretmen sitede Hesap ayarları → **Tahta yoklama PIN'in** → **PIN al**. PIN'i sistem verir ve bir
   kez gösterir; unutan yenisini alır (eskisi geçersiz olur).

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
- Henüz yok: kod imzalama sertifikası, otomatik güncelleme (yeni sürüm = yeni kurulum dosyası).
