# Yol haritası

Her aşama "bitti şartı" sağlanmadan bir sonrakine geçilmez. Her aşamanın sonunda kullanıcıya test sonuçları ve ekran görüntüleri gösterilir.

## Aşama 1 · Temel, giriş ve yetkiler
- Vite + React + TS, Tailwind + token'lar, uygulama kabuğu (üst bar, zil, yan menü; prototiple aynı görünüm ve animasyonlar)
- Supabase yerel + staging; `0001_init.sql`, seed
- Giriş, kayıt ol (tüm roller ve rol alanları), onay bekliyor ekranı, çıkış
- Admin TOTP (Supabase MFA; ilk girişte QR ile kurulum)
- Onaylar sayfası (onayla/reddet, öğrenci/veli eşleştirme)
- Rol bazlı menü ve yönlendirme
**Bitti şartı:** RLS testleri geçer — veli başka öğrenciyi, öğrenci başkasının görevini, branş öğretmeni rehber-gizli notu, onaysız kullanıcı hiçbir öğrenciyi okuyamaz; admin aal2 olmadan admin işlemi yapamaz.

## Aşama 2 · Öğrenciler, görevler, görüşmeler, notlar
- Öğrenciler listesi, öğrenci dosyası ve 7 sekme, gelişim grafiği (deneme adına tıklayınca detay)
- Görev ata (çoklu, serbest konu, takvim + kısayollar, haftalık tekrar, veli görsün), düzenle, sil; öğrenci ilerlemesi
- Görüşme planla/değiştir/iptal, veli/öğrenci yanıtı
- Notlar (3 görünürlük; rehber notları şifreli)
- Bildirim tablosu + zil paneli
- `gunluk-isler` cron: gecikmiş görev → admin bildirimi; haftalık kopya
- Veli ve öğrenci ekranları (Özet, Görevler, Görüşmeler)
**Bitti şartı:** `docs/test-senaryolari.md` §2–§4 Playwright'ta yeşil.

## Aşama 3 · Denemeler ve PDF okuma
- Legacy Deneme Köprüsü motorunu Web Worker olarak entegre et (şablon tanıma, sonuç okuma, kazanım okuma **ayrı**)
- Okunan isimleri eşleştirme: önce yerel (Türkçe normalizasyon + Levenshtein), belirsizler için `ai-isim-duzelt`
- Kontrol ekranı: yalnız gerçek sorunlar (listede olmayan isim, D+Y+B tutarsızlığı, okunamayan kazanım bilgisi)
- `deneme-yayinla` Edge Function (transaction, idempotent), yayından sonra 7 gün geri alma
- Regresyon: gerçek PDF'lerden (isimler maskelenmiş) oluşan test klasörü; D/Y/B/net/puan beklenen JSON ile birebir
**Bitti şartı:** en az 3 yayınevinin (Hız, ATA, TÖDER) örnek PDF'leri hatasız; regresyon yeşil.

## Aşama 4 · Raporlar ve yapay zekâ
- Veli raporu (kurallara uygun kural tabanlı taslak + `ai-veli-raporu`), düzenleme, kaydetme, gönderme, PDF
- Öğretmen raporu, alıcı seçimi, PDF
- Raporlar sekmesi / veli-öğrenci Raporlar sayfası
- `ai_usage` kotaları, anonimleştirme, çıktı filtresi, harcama alarmı
**Bitti şartı:** 7 öğrenci tipinin raporları birbirinden farklı; isteklerde hiçbir kişisel veri yok (otomatik test isteği yakalayıp kontrol eder); kota aşımında 429.

## Aşama 5 · Sınıflar, etüt, Bugün, cila
- Sınıflar ısı haritası, zor konu → öğrenci listesi, Cumartesi etüt planlama (çakışma kontrolü, serbest konu)
- Bugün ekranı kuralları (okul ayarlarından değiştirilebilir)
- E-posta bildirimleri (isteğe bağlı), audit log ekranı (admin), KVKK aydınlatma/rıza ekranı
- Performans: ilk yükleme < 2 sn (Lighthouse ≥ 90), erişilebilirlik (klavye, kontrast)
**Bitti şartı:** tüm test senaryoları yeşil; Supabase Pro'ya geçiş, yedek işi çalışıyor; pilot (1–2 öğretmen, 1 hafta).

## Sonra (kapsam dışı)
Çok okullu yönetim paneli ve faturalama, öğrenci öz değerlendirmesi, mobil uygulama (React Native, WebView yok).
