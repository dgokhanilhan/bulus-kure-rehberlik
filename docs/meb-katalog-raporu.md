# MEB kazanım / öğrenme çıktısı kataloğu — kapsam ve doğrulama raporu

Otomatik üretildi (`scripts/meb-katalog/olustur.mjs`, 2026-10-03). Kaynak yalnız **mufredat.meb.gov.tr** resmî öğretim programı PDF'leri; üçüncü taraf site kullanılmadı.
Her dosyanın SHA-256'sı `supabase/katalog/meb/manifest.json`'da. Program değişirse araç durur; yeni program **yeni sürüm** olarak eklenir, eski sürümün üzerine yazılmaz.

**Toplam:** 46 kaynak · 123 müfredat sürümü (89 etkin, 34 pasif: 8 ve 12'nin TYMM bölümleri) · **4890** kazanım / öğrenme çıktısı (+ 0025'teki 8. sınıf eski kataloğu 326).

## Kapsam (deneme dersleri)

"Eksik" = o yıl için resmî kaynak bulunamadı; katalog **uydurulmadı**, deneme sorusu eşleşmeyenler kuyruğuna düşer.

| Sınıf | Ders | 2025–2026 | 2026–2027 |
|---|---|---|---|
| 5 | Türkçe | TYMM ✓ 100 | TYMM ✓ 80 |
| 5 | Matematik | **Eksik** | TYMM ✓ 23 |
| 5 | Fen Bilimleri | **Eksik** | TYMM ✓ 27 |
| 5 | Sosyal Bilgiler | **Eksik** | TYMM ✓ 19 |
| 5 | Din Kültürü | **Eksik** | TYMM ✓ 18 |
| 5 | İngilizce | TYMM ✓ 161 | TYMM ✓ 161 |
| 6 | Türkçe | TYMM ✓ 100 | TYMM ✓ 91 |
| 6 | Matematik | **Eksik** | TYMM ✓ 24 |
| 6 | Fen Bilimleri | **Eksik** | TYMM ✓ 36 |
| 6 | Sosyal Bilgiler | **Eksik** | TYMM ✓ 18 |
| 6 | Din Kültürü | **Eksik** | TYMM ✓ 18 |
| 6 | İngilizce | TYMM ✓ 184 | TYMM ✓ 184 |
| 7 | Türkçe | Eski ✓ 76 | TYMM ✓ 96 |
| 7 | Matematik | Eski ✓ 48 | TYMM ✓ 30 |
| 7 | Fen Bilimleri | Eski ✓ 67 | TYMM ✓ 35 |
| 7 | Sosyal Bilgiler | Eski ✓ 31 | TYMM ✓ 17 |
| 7 | Din Kültürü | Eski ✓ 25 | TYMM ✓ 17 |
| 7 | İngilizce | Eski ✓ 63 | TYMM ✓ 191 |
| 8 | Türkçe | Eski ✓ 76 (0025) | Eski ✓ 76 (0025) |
| 8 | Matematik | Eski ✓ 52 (0025) | Eski ✓ 52 (0025) |
| 8 | Fen Bilimleri | Eski ✓ 61 (0025) | Eski ✓ 61 (0025) |
| 8 | İnkılap Tarihi | Eski ✓ 39 (0025) | Eski ✓ 39 (0025) |
| 8 | Din Kültürü | Eski ✓ 28 (0025) | Eski ✓ 28 (0025) |
| 8 | İngilizce | Eski ✓ 70 (0025) | Eski ✓ 70 (0025) |
| 9 | Türk Dili ve Edebiyatı | TYMM ✓ 16 | TYMM ✓ 16 |
| 9 | Matematik | TYMM ✓ 20 | TYMM ✓ 20 |
| 9 | Fizik | TYMM ✓ 24 | TYMM ✓ 24 |
| 9 | Kimya | TYMM ✓ 23 | TYMM ✓ 23 |
| 9 | Biyoloji | TYMM ✓ 15 | TYMM ✓ 14 |
| 9 | Tarih | TYMM ✓ 13 | TYMM ✓ 13 |
| 9 | Coğrafya | TYMM ✓ 19 | TYMM ✓ 19 |
| 9 | Din Kültürü | TYMM ✓ 20 | TYMM ✓ 20 |
| 9 | İngilizce | TYMM ✓ 192 | TYMM ✓ 192 |
| 10 | Türk Dili ve Edebiyatı | TYMM ✓ 16 | TYMM ✓ 16 |
| 10 | Matematik | TYMM ✓ 21 | TYMM ✓ 21 |
| 10 | Fizik | TYMM ✓ 25 | TYMM ✓ 22 |
| 10 | Kimya | TYMM ✓ 21 | TYMM ✓ 21 |
| 10 | Biyoloji | TYMM ✓ 19 | TYMM ✓ 19 |
| 10 | Tarih | TYMM ✓ 14 | TYMM ✓ 14 |
| 10 | Coğrafya | TYMM ✓ 18 | TYMM ✓ 18 |
| 10 | Felsefe | TYMM ✓ 10 | TYMM ✓ 10 |
| 10 | Din Kültürü | TYMM ✓ 17 | TYMM ✓ 17 |
| 10 | İngilizce | TYMM ✓ 192 | TYMM ✓ 192 |
| 11 | Türk Dili ve Edebiyatı | Eski ✓ 95 | TYMM ✓ 16 |
| 11 | Matematik | Eski ✓ 28 | TYMM ✓ 15 |
| 11 | Fizik | Eski ✓ 62 | TYMM ✓ 33 |
| 11 | Kimya | Eski ✓ 35 | TYMM ✓ 25 |
| 11 | Biyoloji | Eski ✓ 34 | TYMM ✓ 22 |
| 11 | Tarih | Eski ✓ 18 | TYMM ✓ 11 |
| 11 | Coğrafya | Eski ✓ 40 | TYMM ✓ 19 |
| 11 | Felsefe | Eski ✓ 21 | TYMM ✓ 12 |
| 11 | Din Kültürü | Eski ✓ 17 | TYMM ✓ 16 |
| 11 | İngilizce | **Eksik** | TYMM ✓ 192 |
| 12 | Türk Dili ve Edebiyatı | Eski ✓ 95 | Eski ✓ 95 |
| 12 | Matematik | Eski ✓ 34 | Eski ✓ 34 |
| 12 | Fizik | Eski ✓ 68 | Eski ✓ 68 |
| 12 | Kimya | Eski ✓ 31 | Eski ✓ 31 |
| 12 | Biyoloji | Eski ✓ 29 | Eski ✓ 29 |
| 12 | Coğrafya | Eski ✓ 34 | Eski ✓ 34 |
| 12 | Din Kültürü | Eski ✓ 22 | Eski ✓ 22 |
| 12 | İnkılap Tarihi | Eski ✓ 33 | Eski ✓ 33 |
| 12 | İngilizce | **Eksik** | **Eksik** |

Eksiklerin nedeni: ortaokul Matematik, Fen Bilimleri, Sosyal Bilgiler ve Din Kültürü TYMM programlarının **2024 sürümü** sitede yayında değil (yalnız 2026 sürümü var). 2026 sürümü 2025–2026 denemelerine kendiliğinden uygulanmadı; yönetim karar verirse `year_from` tek satırla değiştirilebilir. İngilizce TYMM 2025 sürümüyle başlıyor. 11–12 İngilizce (eski lise programı) bu pakette içe aktarılmadı: okulun 11–12 denemelerinde (TYT/AYT) İngilizce bölümü yok; gerekirse aynı araçla eklenir. 12. sınıf TYMM İngilizce pasif (12 eski programda).

## Kaynak bazında doğrulama

### Ortaokul Matematik Dersi Öğretim Programı (5-8) (2026)
PID 2340 · TYMM · 100 çıktı · SHA-256 `75f52f93672c8991…`

- ✓ 5. sınıf: 23 = resmî 23
- ✓ 6. sınıf: 24 = resmî 24
- ✓ 7. sınıf: 30 = resmî 30
- ✓ 8. sınıf: 23 = resmî 23
- ✓ çapraz başlık kontrolü: 100/100 kod başka sayfada da geçiyor, uyuşmayan 0

### Fen Bilimleri Dersi Öğretim Programı (3-8) (2026)
PID 2334 · TYMM · 141 çıktı · SHA-256 `a56aab9c648f8293…`

- ✓ 5. sınıf: 27 = resmî 27
- ✓ 6. sınıf: 36 = resmî 36
- ✓ 7. sınıf: 35 = resmî 35
- ✓ 8. sınıf: 43 = resmî 43
- ✓ çapraz başlık kontrolü: 180/180 kod başka sayfada da geçiyor, uyuşmayan 0

### Sosyal Bilgiler Dersi Öğretim Programı (4-7) (2026)
PID 2347 · TYMM · 54 çıktı · SHA-256 `3e1b956f9bfa0e56…`

- ✓ 5. sınıf: 19 = resmî 19
- ✓ 6. sınıf: 18 = resmî 18
- ✓ 7. sınıf: 17 = resmî 17
- ✓ çapraz başlık kontrolü: 70/71 kod başka sayfada da geçiyor, uyuşmayan 0

### Ortaokul Türkçe Dersi Öğretim Programı (5-8) (2026)
PID 2352 · TYMM · 365 çıktı · SHA-256 `f9c44b1059a0d5a7…`

- ✓ kod dizileri boşluksuz, sayfa blokları tutarlı: evet (365 kod)
- ✓ tema listesiyle başlık karşılaştırması: aynı 365, liste okuması fazla satır 0, resmî metin içi yazım farkı 0, açıklanamayan fark 0

### Din Kültürü ve Ahlak Bilgisi Dersi Öğretim Programı (4-8) (2026)
PID 2150 · TYMM · 72 çıktı · SHA-256 `6025541032f33036…`

- ✓ 5. sınıf: 18 = resmî 18
- ✓ 6. sınıf: 18 = resmî 18
- ✓ 7. sınıf: 17 = resmî 17
- ✓ 8. sınıf: 19 = resmî 19
- ✓ çapraz başlık kontrolü: 96/96 kod başka sayfada da geçiyor, uyuşmayan 0

### İngilizce Dersi Öğretim Programı (2-8) (2025)
PID 1903 · TYMM · 728 çıktı · SHA-256 `38cc26d455c178e4…`

- ✓ İngilizce yapı kontrolü (her ünitede aynı beceri kümesi): 5:7ünite×23 6:8ünite×23 7:8ünite×24 8:8ünite×24; açıklanamayan sapma 0
- ⚠︎ ENG.7.5.W7 tanım metni kaynakta (s.826) kodsuz basılmış; kod yalnız s.841 etkinliğinde geçiyor. Metin koda bağlanmadı (çıkarım olurdu): bu kod katalogda yok.

### T.C. İnkılap Tarihi ve Atatürkçülük Dersi Öğretim Programı (8. Sınıf) (2024)
PID 1974 · TYMM · 15 çıktı · SHA-256 `e9bb195ae94919ec…`

- ✓ 8. sınıf: 15 = resmî 15
- ✓ çapraz başlık kontrolü: 14/15 kod başka sayfada da geçiyor, uyuşmayan 0
- ⚠︎ İTA.8.1.1: Programın 12. sayfasındaki ünite şemasında "öğrenme çıktısı" kutusunda etkinlik metni var; tanım 14. sayfadaki ("…analiz edebilme").

### Ortaokul Türkçe Dersi Öğretim Programı (5-8) (2024)
PID 1979 · TYMM · 406 çıktı · SHA-256 `7aa679b8f8f33790…`

- ✓ kod dizileri boşluksuz, sayfa blokları tutarlı: evet (406 kod)
- ✓ açıklamalar bölümü başlıkları: 406 kod, tabloda olup açıklamada olmayan 0
- ✓ tema listesiyle başlık karşılaştırması: aynı 390, liste okuması fazla satır 1, resmî metin içi yazım farkı 9, açıklanamayan fark 0
- Not: Resmî metin kendi içinde aynı çıktıyı iki biçimde yazıyor (9 kod): tanım bölümündeki biçim alındı, öteki biçim çıktının kaynak notunda.

### Biyoloji Dersi Öğretim Programı (9-12) (2024)
PID 1983 · TYMM · 78 çıktı · SHA-256 `cdead5c32e91360d…`

- ✓ 9. sınıf: 15 = resmî 15
- ✓ 10. sınıf: 19 = resmî 19
- ✓ 11. sınıf: 22 = resmî 22
- ✓ 12. sınıf: 22 = resmî 22
- ✓ çapraz başlık kontrolü: 77/78 kod başka sayfada da geçiyor, uyuşmayan 0

### Coğrafya Dersi Öğretim Programı (9-12) (2024)
PID 1984 · TYMM · 76 çıktı · SHA-256 `5c9d441a42ed6a1d…`

- ✓ 9. sınıf: 19 = resmî 19
- ✓ 10. sınıf: 18 = resmî 18
- ✓ 11. sınıf: 19 = resmî 9/19
- ✓ 12. sınıf: 20 = resmî 10/20
- ✓ çapraz başlık kontrolü: 76/76 kod başka sayfada da geçiyor, uyuşmayan 0

### Din Kültürü ve Ahlak Bilgisi Dersi Öğretim Programı (9-12) (2024)
PID 1985 · TYMM · 73 çıktı · SHA-256 `119fae5b432daa0e…`

- ✓ 9. sınıf: 20 = resmî 20
- ✓ 10. sınıf: 17 = resmî 17
- ✓ 11. sınıf: 16 = resmî 16
- ✓ 12. sınıf: 20 = resmî 20
- ✓ çapraz başlık kontrolü: 71/73 kod başka sayfada da geçiyor, uyuşmayan 0

### Fizik Dersi Öğretim Programı (9-12) (2024)
PID 1987 · TYMM · 106 çıktı · SHA-256 `8b17e6daf4385803…`

- ✓ 9. sınıf: 24 = resmî 24
- ✓ 10. sınıf: 25 = resmî 25
- ✓ 11. sınıf: 32 = resmî 32
- ✓ 12. sınıf: 25 = resmî 25
- ✓ çapraz başlık kontrolü: 106/106 kod başka sayfada da geçiyor, uyuşmayan 0

### Kimya Dersi Öğretim Programı (9-12) (2024)
PID 1989 · TYMM · 93 çıktı · SHA-256 `bbf53d598fa1c743…`

- ✓ 9. sınıf: 23 = resmî 23
- ✓ 10. sınıf: 21 = resmî 21
- ✓ 11. sınıf: 25 = resmî 25
- ✓ 12. sınıf: 24 = resmî 24
- ✓ çapraz başlık kontrolü: 93/93 kod başka sayfada da geçiyor, uyuşmayan 0

### Matematik Dersi Öğretim Programı (Hazırlık, 9-12) (2024)
PID 1991 · TYMM · 77 çıktı · SHA-256 `f5743677f675db23…`

- ✓ 9. sınıf: 20 = resmî 20
- ✓ 10. sınıf: 21 = resmî 21
- ✓ 11. sınıf: 15 = resmî 15
- ✓ 12. sınıf: 21 = resmî 18 (resmî tabloda TOPLAM 18 yazıyor, tema satırları toplamı 21 (okunanla aynı))
- ✓ çapraz başlık kontrolü: 75/77 kod başka sayfada da geçiyor, uyuşmayan 0
- Not: 12. sınıf: resmî tabloda TOPLAM 18 yazıyor, tema satırları toplamı 21 (okunanla aynı)

### Felsefe Dersi Öğretim Programı (10-11) (2024)
PID 1986 · TYMM · 22 çıktı · SHA-256 `8dbb0ea3fa9e3bd2…`

- ✓ 10. sınıf: 10 = resmî 10
- ✓ 11. sınıf: 12 = resmî 12
- ✓ çapraz başlık kontrolü: 22/22 kod başka sayfada da geçiyor, uyuşmayan 0

### Tarih Dersi Öğretim Programı (9-11) (2024)
PID 1993 · TYMM · 38 çıktı · SHA-256 `8efaf646a1ff9848…`

- ✓ 9. sınıf: 13 = resmî 13
- ✓ 10. sınıf: 14 = resmî 14
- ✓ 11. sınıf: 11 = resmî 11
- ✓ çapraz başlık kontrolü: 28/38 kod başka sayfada da geçiyor, uyuşmayan 0

### Türk Dili ve Edebiyatı Dersi Öğretim Programı (Hazırlık, 9-12) (2024)
PID 1994 · TYMM · 64 çıktı · SHA-256 `3202898bd5b9b02e…`

- ✓ TDE: 16 öğrenme çıktısı, numara/bileşen bütünlüğü tam
- Not: Program beceri temelli; kodda sınıf yok. Aynı öğrenme çıktıları programın kapsadığı her sınıf için ayrı kimlikle kaydedildi (sürüm + sınıf + kod).

### T.C. İnkılap Tarihi ve Atatürkçülük Dersi Öğretim Programı (12. Sınıf) (2024)
PID 1988 · TYMM · 16 çıktı · SHA-256 `16123f4bb62ed341…`

- ✓ 12. sınıf: 16 = resmî 16
- ✓ çapraz başlık kontrolü: 16/16 kod başka sayfada da geçiyor, uyuşmayan 0

### Biyoloji Dersi Öğretim Programı (9-12) (2026)
PID 2250 · TYMM · 75 çıktı · SHA-256 `758809eb508d40e0…`

- ✓ 9. sınıf: 14 = resmî 14
- ✓ 10. sınıf: 19 = resmî 19
- ✓ 11. sınıf: 22 = resmî 22
- ✓ 12. sınıf: 20 = resmî 20
- ✓ çapraz başlık kontrolü: 74/75 kod başka sayfada da geçiyor, uyuşmayan 0

### Coğrafya Dersi Öğretim Programı (9-12) (2026)
PID 2251 · TYMM · 76 çıktı · SHA-256 `39aee8c83fb67752…`

- ✓ 9. sınıf: 19 = resmî 19
- ✓ 10. sınıf: 18 = resmî 18
- ✓ 11. sınıf: 19 = resmî 9/19
- ✓ 12. sınıf: 20 = resmî 10/20
- ✓ çapraz başlık kontrolü: 76/76 kod başka sayfada da geçiyor, uyuşmayan 0

### Din Kültürü ve Ahlak Bilgisi Dersi Öğretim Programı (9-12) (2026)
PID 2153 · TYMM · 73 çıktı · SHA-256 `c48c7083d24b1063…`

- ✓ 9. sınıf: 20 = resmî 20
- ✓ 10. sınıf: 17 = resmî 17
- ✓ 11. sınıf: 16 = resmî 16
- ✓ 12. sınıf: 20 = resmî 20
- ✓ çapraz başlık kontrolü: 73/73 kod başka sayfada da geçiyor, uyuşmayan 0

### Fizik Dersi Öğretim Programı (9-12) (2026)
PID 2254 · TYMM · 106 çıktı · SHA-256 `119b158574ebc2a4…`

- ✓ 9. sınıf: 24 = resmî 24
- ✓ 10. sınıf: 22 = resmî 22
- ✓ 11. sınıf: 33 = resmî 33
- ✓ 12. sınıf: 27 = resmî 27
- ✓ çapraz başlık kontrolü: 106/106 kod başka sayfada da geçiyor, uyuşmayan 0

### Kimya Dersi Öğretim Programı (9-12) (2026)
PID 2255 · TYMM · 93 çıktı · SHA-256 `8ebbc113d520eb11…`

- ✓ 9. sınıf: 23 = resmî 23
- ✓ 10. sınıf: 21 = resmî 21
- ✓ 11. sınıf: 25 = resmî 25
- ✓ 12. sınıf: 24 = resmî 24
- ✓ çapraz başlık kontrolü: 93/93 kod başka sayfada da geçiyor, uyuşmayan 0

### Matematik Dersi Öğretim Programı (Hazırlık, 9-12) (2026)
PID 2256 · TYMM · 77 çıktı · SHA-256 `8e1b0c98f0e42b08…`

- ✓ 9. sınıf: 20 = resmî 20
- ✓ 10. sınıf: 21 = resmî 21
- ✓ 11. sınıf: 15 = resmî 15
- ✓ 12. sınıf: 21 = resmî 21
- ✓ çapraz başlık kontrolü: 75/77 kod başka sayfada da geçiyor, uyuşmayan 0

### Felsefe Dersi Öğretim Programı (10-11) (2026)
PID 2253 · TYMM · 22 çıktı · SHA-256 `26ada7a42aea65c5…`

- ✓ 10. sınıf: 10 = resmî 10
- ✓ 11. sınıf: 12 = resmî 12
- ✓ çapraz başlık kontrolü: 22/22 kod başka sayfada da geçiyor, uyuşmayan 0

### Tarih Dersi Öğretim Programı (9-11) (2026)
PID 2271 · TYMM · 38 çıktı · SHA-256 `19340c05d40256af…`

- ✓ 9. sınıf: 13 = resmî 13
- ✓ 10. sınıf: 14 = resmî 14
- ✓ 11. sınıf: 11 = resmî 11
- ✓ çapraz başlık kontrolü: 28/38 kod başka sayfada da geçiyor, uyuşmayan 0

### Türk Dili ve Edebiyatı Dersi Öğretim Programı (Hazırlık, 9-12) (2026)
PID 2252 · TYMM · 64 çıktı · SHA-256 `a04e1444eae5495a…`

- ✓ TDE: 16 öğrenme çıktısı, numara/bileşen bütünlüğü tam
- Not: Program beceri temelli; kodda sınıf yok. Aynı öğrenme çıktıları programın kapsadığı her sınıf için ayrı kimlikle kaydedildi (sürüm + sınıf + kod).

### T.C. İnkılap Tarihi ve Atatürkçülük Dersi Öğretim Programı (12. Sınıf) (2026)
PID 2270 · TYMM · 16 çıktı · SHA-256 `3b36236c47d80a05…`

- ✓ 12. sınıf: 16 = resmî 16
- ✓ çapraz başlık kontrolü: 16/16 kod başka sayfada da geçiyor, uyuşmayan 0

### Ortaöğretim İngilizce Dersi Öğretim Programı (9-12) (2025)
PID 1906 · TYMM · 720 çıktı · SHA-256 `aa708a0c2bd9d5e2…`

- ✓ İngilizce yapı kontrolü (her ünitede aynı beceri kümesi): 9:8ünite×24 10:8ünite×24 11:8ünite×24 12:6ünite×24; açıklanamayan sapma 0

### Matematik Dersi Öğretim Programı (2018)
PID 329 · Eski program · 48 çıktı · SHA-256 `ca94096da33478c8…`

- ✓ 7. sınıf: 48 = resmî 48
- ✓ numara bütünlüğü: 12 ünite/konu, boşluk yok
- ✓ 8. sınıf mevcut katalogla birebir: 52/52 (okunan 52)

### Fen Bilimleri Dersi Öğretim Programı (2018)
PID 325 · Eski program · 67 çıktı · SHA-256 `3a8aa21327083bf1…`

- ✓ 7. sınıf: 67 = resmî 67
- ✓ numara bütünlüğü: 19 ünite/konu, boşluk yok
- ✓ 8. sınıf mevcut katalogla birebir: 61/61 (okunan 61)

### Türkçe Dersi Öğretim Programı (2019)
PID 663 · Eski program · 76 çıktı · SHA-256 `10e55d403a708d35…`

- ✓ 7. sınıf: 76 (resmî sayı tablosu yok/görsel; numara bütünlüğüyle doğrulandı)
- ✓ numara bütünlüğü: 4 ünite/konu, boşluk yok
- ✓ 8. sınıf mevcut katalogla birebir: 76/76 (okunan 76)

### Din Kültürü ve Ahlak Bilgisi Dersi Öğretim Programı (4-8) (2018)
PID 318 · Eski program · 25 çıktı · SHA-256 `baace330fd3b7c5b…`

- ✓ 7. sınıf: 25 = resmî 25
- ✓ numara bütünlüğü: 5 ünite/konu, boşluk yok
- ✓ 8. sınıf mevcut katalogla birebir: 28/28 (okunan 28)

### İngilizce Dersi Öğretim Programı (2-8) (2018)
PID 327 · Eski program · 63 çıktı · SHA-256 `e976ae163c83bb1b…`

- ✓ 7. sınıf: 63 (resmî sayı tablosu yok/görsel; numara bütünlüğüyle doğrulandı)
- ✓ numara bütünlüğü: 50 ünite/konu, boşluk yok
- ✓ 8. sınıf mevcut katalogla birebir: 70/70 (okunan 70)

### T.C. İnkılap Tarihi ve Atatürkçülük Dersi Öğretim Programı (8) (2018)
PID 355 · Eski program · 0 çıktı · SHA-256 `38a24b11191f7ebc…`

- ✓ numara bütünlüğü: 0 ünite/konu, boşluk yok
- ✓ 8. sınıf mevcut katalogla birebir: 39/39 (okunan 39)

### Sosyal Bilgiler Dersi Öğretim Programı (2023-2024 eğitim öğretim yılından itibaren)
PID 1264 · Eski program · 31 çıktı · SHA-256 `de0ca9aea3993041…`

- ✓ 7. sınıf: 31 = resmî 31
- ✓ numara bütünlüğü: 7 ünite/konu, boşluk yok

### Matematik Dersi Öğretim Programı (Ortaöğretim, 2018)
PID 343 · Eski program · 62 çıktı · SHA-256 `43f68f4e03e61ab6…`

- ✓ 11. sınıf: 28 = resmî 28/15
- ✓ 12. sınıf: 34 = resmî 34/5
- ✓ numara bütünlüğü: 28 ünite/konu, boşluk yok

### Fizik Dersi Öğretim Programı (Ortaöğretim, 2018)
PID 351 · Eski program · 130 çıktı · SHA-256 `6f0adf395fc98c96…`

- ✓ 11. sınıf: 62 = resmî 62
- ✓ 12. sınıf: 68 = resmî 68
- ✓ numara bütünlüğü: 36 ünite/konu, boşluk yok

### Kimya Dersi Öğretim Programı (Ortaöğretim, 2018)
PID 350 · Eski program · 66 çıktı · SHA-256 `fb17e88c798f4267…`

- ✓ 11. sınıf: 35 = resmî 35
- ✓ 12. sınıf: 31 = resmî 31
- ✓ numara bütünlüğü: 46 ünite/konu, boşluk yok

### Biyoloji Dersi Öğretim Programı (Ortaöğretim, 2018)
PID 361 · Eski program · 63 çıktı · SHA-256 `187254fb4e173c95…`

- ✓ 11. sınıf: 34 = resmî 34
- ✓ 12. sınıf: 29 = resmî 29
- ✓ numara bütünlüğü: 19 ünite/konu, boşluk yok

### Coğrafya Dersi Öğretim Programı (Ortaöğretim, 2018)
PID 336 · Eski program · 74 çıktı · SHA-256 `074713f34edfd638…`

- ✓ 11. sınıf: 40 = resmî 29/40
- ✓ 12. sınıf: 34 = resmî 24/34
- ✓ numara bütünlüğü: 8 ünite/konu, boşluk yok

### Din Kültürü ve Ahlak Bilgisi Dersi Öğretim Programı (9-12) (2018)
PID 319 · Eski program · 39 çıktı · SHA-256 `da31fb7e62fa40f7…`

- ✓ 11. sınıf: 17 = resmî 17
- ✓ 12. sınıf: 22 = resmî 22
- ✓ numara bütünlüğü: 10 ünite/konu, boşluk yok
- Not: 12.2.1: kaynakta "12,2.1." (virgül) yazıyor

### Felsefe Dersi Öğretim Programı (Ortaöğretim, 2018)
PID 338 · Eski program · 21 çıktı · SHA-256 `71f2b77e209fdc92…`

- ✓ 11. sınıf: 21 = resmî 21
- ✓ numara bütünlüğü: 5 ünite/konu, boşluk yok

### Tarih Dersi Öğretim Programı (9-11) (2023)
PID 1265 · Eski program · 18 çıktı · SHA-256 `6b020e0e2bdbd2dd…`

- ✓ 11. sınıf: 18 (resmî sayı tablosu yok/görsel; numara bütünlüğüyle doğrulandı)
- ✓ numara bütünlüğü: 5 ünite/konu, boşluk yok
- Not: Resmî kazanım sayısı tablosu görsel olarak basılmış (metin katmanında yok): numara bütünlüğüyle doğrulandı.

### Türk Dili ve Edebiyatı Dersi Öğretim Programı (Ortaöğretim, 2018)
PID 353 · Eski program · 190 çıktı · SHA-256 `26165bf1bde7c137…`

- ✓ A.1: 13 = resmî 13
- ✓ A.2: 16 = resmî 16
- ✓ A.3: 14 = resmî 14
- ✓ A.4: 15 = resmî 15
- ✓ B: 12 = resmî 12
- ✓ C.1: 17 = resmî 17
- ✓ C.2: 8 = resmî 8
- Not: Kazanımlar sınıftan bağımsız (A Okuma, B Yazma, C Sözlü iletişim). Resmî kod "A.1.12" biçiminde (programda bir yerde bitişik, diğerlerinde "A.1. 9." boşluklu basılmış: boşluk normalleştirildi). Her sınıf için ayrı kimlikle kaydedildi.

### T.C. İnkılap Tarihi ve Atatürkçülük Dersi Öğretim Programı (Ortaöğretim 12)
PID 346 · Eski program · 33 çıktı · SHA-256 `0eeb61d5eef4c9ff…`

- ✓ 12. sınıf: 33 = resmî 33
- ✓ numara bütünlüğü: 8 ünite/konu, boşluk yok
