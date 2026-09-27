# Buluş Küre Koleji · Rehberlik & Mentörlük

8. sınıf LGS öğrencilerinin deneme sonuçlarını, konu (kazanım) hatalarını, görevlerini, görüşmelerini ve raporlarını tek yerde tutan **web** uygulaması. İlk müşteri Buluş Küre Koleji; yapı ileride çok okullu olacak şekilde kurulur (her tabloda `school_id`).

Şimdilik **yalnızca web**. Mobil uygulama sonra düşünülecek.

## Referans dosyalar (önce bunları oku)

| Dosya | Ne işe yarar |
| --- | --- |
| `prototype/prototip.html` | Tıklanabilir, çalışan prototip. Ekranlar, akışlar, metinler ve yetkiler **bunun aynısı** olacak. Tarayıcıda aç, demo hesaplarla her rolü gez. |
| `docs/urun-ve-roller.md` | Roller, yetki matrisi, ekranlar, iş kuralları |
| `docs/mimari-ve-guvenlik.md` | Teknoloji yığını, şifreleme, yapay zekâ API'sinin korunması, KVKK |
| `docs/veli-raporu-kurallari.md` | "Veli için çıktı" raporunun yazım kuralları (yapay zekâ istemi buradan üretilir) |
| `docs/yol-haritasi.md` | Aşamalar ve her aşamanın bitti sayılma şartı |
| `docs/test-senaryolari.md` | Uçtan uca test listesi (Playwright ile otomatikleştir) |
| `supabase/migrations/0001_init.sql` | Veritabanı şeması + RLS politikaları (başlangıç taslağı; geliştir ama gevşetme) |
| `design/tokens.json`, `design/kullanim-kurallari.md` | Renk, yazı, boşluk token'ları ve kullanım kuralları |
| `legacy/deneme-koprusu/` | Kullanıcının mevcut PDF okuma motoru (MuPDF WASM). PDF okumayı **sıfırdan yazma, bunu kullan**. `kaynak-kod.zip` içinde entegrasyon örnekleri var. |

## Teknoloji

- React 18 + Vite + TypeScript (strict), React Router, TanStack Query, Tailwind (token'lar `design/tokens.json`'dan CSS değişkeni olarak üretilir)
- Supabase: PostgreSQL + Auth (e-posta/şifre, TOTP MFA) + Storage + Edge Functions (Deno)
- Barındırma: Cloudflare Pages (statik SPA). Sunucu tarafı işlerin tamamı Supabase Edge Functions'ta.
- Yapay zekâ: DeepSeek API (`deepseek-flash` varsayılan), **yalnızca Edge Function içinden** çağrılır.
- PDF üretimi: `@react-pdf/renderer` (istemci tarafı). PDF okuma: `legacy/deneme-koprusu` motoru, tarayıcıda Web Worker içinde.
- Test: Vitest (birim), Playwright (uçtan uca). Hata izleme: Sentry (ücretsiz plan).

## Değişmez kurallar

1. **Veri uydurma yok.** Okunamayan alan boş/okunamadı kalır; "okunamayan soru ≠ boş soru". Kazanım eşleşmesi güvenilir değilse (`match_level` = `semantic` veya `none`) analize ve öneriye girmez.
2. **Sonuç ve kazanım ayrı.** D/Y/B/net/puan hesabı kazanım okumasından bağımsızdır; kazanım okuma geliştirmesi bu sayıları asla değiştiremez. Regresyon testleri bunu kilitler.
3. **Öğrenci kendisiyle kıyaslanır.** Veli ve öğrenci ekranlarında sınıf sıralaması yok.
4. **Yetki veritabanında.** Her tabloda RLS açık. Yetki kontrolü yalnızca arayüzde yapılmaz. Onaylanmamış (`status <> 'approved'`) kullanıcı hiçbir öğrenci verisi okuyamaz.
5. **Yapay zekâ anahtarı tarayıcıya asla gitmez.** Edge Function secrets dışında hiçbir yerde durmaz; `.env` dosyası repoya girmez.
6. **Yapay zekâya kişisel veri gönderilmez.** Ad, soyad, okul adı, okul no, öğretmen/veli adı, rehberlik notu gönderilmez. Öğrenci "Öğrenci" olarak anonimleştirilir; isim cevaba sunucuda geri eklenir. (DeepSeek sunucuları yurt dışında; KVKK.)
7. **Yapay zekâ çıktısı yalnızca metindir.** Şemaya göre doğrulanır; hiçbir işlem tetiklemez; öğretmen onaylamadan veliye gitmez.
8. **Arayüz dili Türkçe.** Öğretmene ve öğrenciye "sen", veliye "siz". Etiketleyici ifade yok ("başarısız", "yetersiz" vb.). Teknik terimler (OCR, confidence, CODE_EXACT…) veli/öğrenci ekranında ve PDF'te görünmez.
9. **Tasarım** `design/` token'larıyla. Yükselme = `primary` + ↑, düşüş = `signal` + ↓; renk tek başına anlam taşımaz. Dokunma hedefi en az 44px. Animasyonlar `prefers-reduced-motion`'a uyar.
10. **Küçük adımlar.** Her aşama `docs/yol-haritasi.md`'deki "bitti şartı" sağlanmadan sonrakine geçilmez. Her değişiklikten sonra `npm run test` ve `npm run e2e` çalışır.

## Komutlar (kurulumdan sonra)

```
npm run dev        # yerel geliştirme
npm run test       # Vitest
npm run e2e        # Playwright
npm run typecheck
supabase start     # yerel Supabase (Docker)
supabase db reset  # migration + seed
supabase functions serve
```

## Ortamlar

- `local` (supabase start) → `staging` (ücretsiz Supabase projesi, yalnız örnek veri) → `production` (Supabase Pro, Frankfurt). Gerçek öğrenci verisi yalnızca production'a girer.
- Seed verisi prototipteki örnek öğrencilerle aynıdır; gerçek isim kullanılmaz.
