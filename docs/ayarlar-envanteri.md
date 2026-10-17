# Koda gömülü okul tercihleri — envanter (2026-10-17)

Okulun kendi tercihine bağlı olup kodda sabit duran değerler tarandı. "Taşındı" olanlar artık Yönetim → **Tüm ayarlar**'dan
değiştirilir (anahtar listesi: [`docs/ayarlar.md`](ayarlar.md)). Varsayılanlar bugünkü davranışla birebir aynıdır.

| Dosya / satır | Mevcut değer | Ayara taşındı mı | Anahtar / neden |
| --- | --- | --- | --- |
| `src/lib/analiz.ts` `repeats(minCount = 2)` | 2 deneme | **Taşındı** | `analiz.tekrar_esik` — tekrar eden hata eşiği (öğrenci sayfası, raporlar, Bugün) |
| `src/lib/analiz.ts` `DEFAULT_TODAY` (netDrop 3, netRise 5, repeatMin 3) | 3 / 5 / 3 | Zaten ayarlı | Ayarlar sayfasındaki "Bugün kuralları" (okul ayarı `bugun`); kod yalnız varsayılan |
| `src/pages/OgrencilerPage.tsx` `r.count >= 3` | 3 | Hayır | Öğrenci listesindeki "kalıcı hata" sayacı; Bugün kuralındaki repeatMin ile aynı eşik, ayrı ayar karışıklık yaratır |
| `src/lib/etut.ts` `VARSAYILAN_SAATLER` | ortaokul 09:00–13:00, lise 09:20–13:20 | **Taşındı** | `etut.saatler_ortaokul`, `etut.saatler_lise` (kod sabiti yalnız yedek) |
| `src/lib/etut.ts` `SALONLAR` | ETÜT-1…6 | **Taşındı** | `etut.salonlar` |
| `src/lib/etut.ts` `MESGUL_ETIKETLER` | İzinli, Sınav gözetmeni, Voleybol, Toplantı, Raporlu | **Taşındı** | `etut.mesgul_etiketleri` |
| Etüt talebi (0051) | her zaman açık | **Taşındı** | `etut.talep_acik` (form + veritabanı), `etut.talep_son_gun` (veritabanı) |
| Etüt yoklaması (0051) | etüt öğretmeni + rehber | **Taşındı** | `etut.yoklama_ogretmen` (ekran + veritabanı) |
| Cumartesi etüt günü | Cumartesi | Hayır | Modülün adı ve veri modeli Cumartesi'ye göre (tarih kısıtı); değişirse yeni modül gerekir |
| `src/lib/gozetmen.ts` `PRESETS` | Ortaokul 09:30 · 75 + 30 + 80 dk; TYT 10:15 · 165; AYT 10:00 · 180 | **Taşındı** | `gozetmen.*` (sınıf seviyeleri sabit) |
| `src/pages/GozetmenPage.tsx` dinlendirici | her 8 sınıfa 1 | **Taşındı** | `gozetmen.dinlendirici_basina` |
| `src/components/Report.tsx`, `src/lib/pdf.tsx` başlıklar | "Veli Gelişim Raporu" / "Öğretmen Bilgilendirme Raporu" | **Taşındı** | `rapor.veli_baslik`, `rapor.ogretmen_baslik` |
| Rapor alt bilgileri | "Bu rapor öğrencinin…", "Kurum içi kullanım…" | **Taşındı** | `rapor.veli_alt_bilgi`, `rapor.ogretmen_alt_bilgi` |
| Rapor imza satırı | yok | **Eklendi** | `rapor.imza` |
| PDF logosu (rapor, devamsızlık, liste, gözetmen, etüt) | her zaman | **Taşındı** | `rapor.logo` |
| "Yapay zekâ ile yaz" düğmesi | her zaman | **Taşındı** | `rapor.ai` (yapay zekâ kotaları zaten Ayarlar sayfasında) |
| `src/pages/AuthPage.tsx` slogan, alt başlık, kayıt notu | sabit metinler | **Taşındı** | `metin.giris_slogan`, `genel.alt_baslik`, `metin.kayit_notu`, `metin.kayit_kapali` |
| Kayıt formu | her zaman açık | **Taşındı** | `kayit.acik`, `kayit.davet_zorunlu` (ekran + veritabanı tetikleyicisi) |
| Öğretmen iki adımlı doğrulama | isteğe bağlı | **Taşındı** | `guvenlik.ogretmen_mfa` (yöneticide her zaman zorunlu; kapatılamaz) |
| Menü adları, sırası, rol bazında görünürlük (`src/lib/roles.ts`) | sabit | **Taşındı** | `menu.ad.*`, `menu.sira.*`, `menu.gizli.*` (yalnız menü; veri erişimi modül/aile ayarlarıyla) |
| Veli/öğrenci bölümleri (görevler, görüşmeler, notlar, raporlar, etüt) | her zaman görünür | **Taşındı** | `aile.*` (menü + kısıtlayıcı RLS) |
| Branş öğretmeni not ekleme, kendisine gelen raporu görme | izinli | **Taşındı** | `ogretmen.not_ekleme`, `ogretmen.rapor_gorme` (kısıtlayıcı RLS) |
| Öğretmen görev verme | yalnız rehber/yönetici (RLS) | Hayır | RLS öğretmene zaten izin vermiyor; ayar izin genişletemez |
| Veli/öğrenci deneme ayrıntısı | görünür | Hayır | Özet ve ayrıntı aynı sonuç kaydından gelir; veritabanında ayrı kısıtlanamaz (yalnız ekran gizlemesi güvenlik sağlamaz) |
| Deneme yayın bildirimi metni (`publish_exam`) | "Deneme sonucu…" | Hayır | Fonksiyon gövdesi metin yamasıyla değiştirilmez (canlıdaki CRLF farkı riski); bildirim türü `bildirim.deneme` ile kapatılabilir |
| Nöbet yerleri (`NobetTakipPage.tsx` LOCATIONS) | Kantin, Arka bahçe, … | Hayır | Veritabanında check kısıtı (0040) ile sabit; değişmesi şema değişikliği gerektirir |
| Ders saatleri, yemek listesi | — | Zaten ayarlı | Yönetim → Ders saatleri, Yemek listesi |
| Akademik takvim (dönem başı/sonu) | — | Zaten ayarlı | Yönetim → Eğitim yılları; tatiller Takvim'de |
| KVKK aydınlatma metni | sabit | Değiştirilemez | Hukukçu onayı gerektirir; yalnız iletişim bilgileri (`genel.*`) ayardır |
| Değişmez kurallar (CLAUDE.md) | — | Değiştirilemez | Veri uydurmama, sonuç/kazanım ayrılığı, sınıf sıralaması yok, RLS gevşetilmez, yapay zekâ anahtarı ve kişisel veri, öğretmen onayı |

## Tanımlı ama okunmayan eski ayarlar
`yoklama.ogretmen_girebilir` ve `bursluluk.aciklama` 0052'den önce spec'e eklenmiş, ancak ne ön yüzde ne veritabanı
fonksiyonlarında okunuyor (2026-10-17 taraması). Davranışı değiştirmemek için kaldırılmadı; okunacak yer belirlenince bağlanmalı; `tests/ayarlar.test.ts` bunları istisna olarak tanır, yeni ayar için okunma şartı geçerlidir.
