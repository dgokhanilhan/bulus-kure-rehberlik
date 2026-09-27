# Mimari ve güvenlik

## Yığın ve maliyet

| Parça | Seçim | Maliyet |
| --- | --- | --- |
| Arayüz | React + Vite SPA, Cloudflare Pages | Ücretsiz |
| Veritabanı, giriş, dosya, sunucu fonksiyonları | Supabase (Frankfurt bölgesi) | Geliştirme: Free · Gerçek veri: Pro (aylık 25 $; 7 gün yedek, durdurulmaz) |
| Yapay zekâ | DeepSeek API, `deepseek-flash` | Rapor başına ~0,002 $; ön ödemeli, düşük bakiye |
| Hata izleme | Sentry ücretsiz plan | Ücretsiz |
| E-posta (Aşama 3) | Ücretsiz kotalı bir işlemsel e-posta servisi | Başlangıçta ücretsiz |

Ücretsiz Supabase planında yedek yoktur ve 1 hafta kullanılmayan proje durur: **gerçek öğrenci verisi yalnızca Pro projede** tutulur.

## Veri akışı

```
Tarayıcı (React)
  ├─ Supabase Auth (JWT, TOTP MFA)
  ├─ PostgREST üzerinden tablolar  ← RLS her satırı süzer
  ├─ PDF okuma: legacy Deneme Köprüsü motoru, Web Worker (PDF sunucuya ham hâlde gitmez; okunan yapı JSON olarak gönderilir, isteğe bağlı orijinal PDF Storage'a şifreli yüklenir)
  └─ Edge Functions (JWT zorunlu)
        ├─ ai-isim-duzelt   (okunan isimler + şube listesi → eşleşme)   → DeepSeek
        ├─ ai-veli-raporu   (anonim veri → rapor metni)                → DeepSeek
        ├─ deneme-yayinla   (doğrulama + toplu yazma + bildirim; transaction)
        └─ gunluk-isler     (cron: gecikmiş görev bildirimi, haftalık görev kopyası)
```

## Şifreleme

- Yolda: HTTPS/TLS (Cloudflare + Supabase varsayılan).
- Diskte: Supabase veriyi AES-256 ile şifreli saklar; yedekler de şifreli.
- Şifreler: Supabase Auth (bcrypt); uygulama şifre görmez, saklamaz.
- **Rehberlik notları** (`notes.visibility='rehber'`) ve rapor içindeki rehber yorumu: Supabase Vault / pgsodium ile sütun düzeyinde ayrıca şifrelenir; yalnız admin ve rehber rolü çözebilir.
- Storage (orijinal PDF'ler): özel bucket, yalnız tam yetkili roller, süreli imzalı bağlantı; 30 gün sonra otomatik silme.
- MFA: admin için zorunlu (AAL2 olmadan admin RLS'si geçmez: `auth.jwt()->>'aal' = 'aal2'`), rehber için önerilir.

## Yapay zekâ API'sinin korunması (en kritik konu)

1. **Anahtar yalnızca Edge Function secret'ı**: `supabase secrets set DEEPSEEK_API_KEY=...`. İstemci koduna, repoya, loga girmez. Canlı ve deneme ortamı için ayrı anahtar.
2. **Kimlik + rol kontrolü**: fonksiyon her istekte JWT'yi doğrular, `profiles.status='approved'` ve rol ∈ {admin, rehber} değilse 403.
3. **Kota**: `ai_usage` tablosu. Kişi başı günlük (ör. 60 rapor) ve okul başı aylık harcama tavanı; aşılınca 429. DeepSeek hesabında ön ödemeli düşük bakiye (ör. 10 $) + otomatik yükleme kapalı → anahtar sızsa bile kayıp sınırlı.
4. **Anonimleştirme**: istek gövdesinde ad, soyad, okul, okul no, öğretmen/veli adı, rehberlik notu, mentör/rehber yorumu **yoktur**. Öğrenci "Öğrenci" diye geçer; sunucu cevaptaki "Öğrenci/Öğrencimiz" ifadelerini gerçek adla değiştirir. İsim düzeltme işleminde yalnız isim listeleri gider (kişisel veri minimizasyonu; KVKK değerlendirmesi hukukçuya danışılarak yapılır; gerekirse bu adım yerel Levenshtein + Türkçe karakter normalizasyonuyla çözülür, yapay zekâ yalnız belirsizlerde).
5. **Çıktı doğrulama**: cevap JSON şemasıyla (zod) doğrulanır; yasak kelime ve teknik terim filtresi (`docs/veli-raporu-kurallari.md` §16); başarısızsa kural tabanlı taslak döner. Çıktı hiçbir işlem tetiklemez; öğretmen onayı olmadan gönderilmez.
6. **Prompt injection**: öğretmen notları gibi serbest metinler isteme hiç konmaz; konan veriler JSON içinde "veri" olarak işaretlenir.
7. **Kayıt ve alarm**: her çağrı `ai_usage`'a (kullanıcı, fonksiyon, token, maliyet, süre, başarı). Günlük toplam eşiği aşarsa adminlere bildirim.
8. **Zaman aşımı ve yeniden deneme**: 30 sn zaman aşımı, en fazla 1 yeniden deneme; hata durumunda kural tabanlı taslak.

## Diğer güvenlik ve işletme

- RLS her tabloda açık; `service_role` anahtarı yalnız Edge Function'larda.
- `audit_log`: kim, hangi öğrencinin hangi kaydını ne zaman görüntüledi/değiştirdi (özellikle rehberlik notları ve raporlar).
- Yedek: Pro'nun günlük yedeğine ek olarak haftalık `pg_dump` (şifreli) → okulun kendi depolama alanı (GitHub Actions ile).
- Güvenlik başlıkları (CSP, HSTS, X-Frame-Options) Cloudflare `_headers` ile.
- Oturum: 12 saat; admin için 2 saat.
- Hesap kilitleme: 5 hatalı girişte 15 dk bekleme (Supabase rate limit + uygulama uyarısı).
- Sentry'ye kişisel veri gitmez (`beforeSend` ile ad/e-posta temizlenir).

## KVKK (teknik tarafın hazırlaması gerekenler)

Okul veri sorumlusu, biz veri işleyen. Aydınlatma metni ve açık rıza ekranı (kayıtta onay kutusu, sürüm ve tarih saklanır), veri işleme sözleşmesi şablonu, saklama süresi (mezuniyetten sonra X ay → anonimleştirme işi), veri silme talebi akışı, yurt dışına aktarım (Supabase AB bölgesi, DeepSeek) için hukukçu görüşü.
