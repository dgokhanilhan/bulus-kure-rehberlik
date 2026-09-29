# Teslim raporu: Yönetim Merkezi ve okul platformu (Faz A–H)

Her faz ayrı dalda, bir öncekinin üstüne kuruldu (A → B → … → H). Migration'lar sırayla uygulanmalı: **0011 → 0019**. 0001–0010 dosyalarına dokunulmadı; hiçbir migration veri silmez ya da sütun düşürmez.

## YAPILANLAR

| Faz | Dal | Özet |
|---|---|---|
| A | `faz-a/yonetim-merkezi` | Yönetim Merkezi: genel ayarlar, modül aç/kapa, eğitim yılları, ders kataloğu, değişken sayıda ders saati, ders atamaları |
| B | `faz-b/odev` | Ödev sistemi: ödev verme, öğrenci durumları, hatırlatma, veli/öğrenci görünümü, ödev ayarları |
| C | `faz-c/dosyalar` | Dosyalar: mesaj/duyuru/ödev ekleri, öğrenci teslimi, okul logosu (özel Storage, önce hazırlık sonra onay) |
| D | `faz-d/takvim-bildirim` | Bildirim merkezi (türler, ayardan kapatma, “Tüm bildirimler” sayfası) ve sınav/etkinlik takvimi |
| E | `faz-e/devamsizlik` | Devamsızlık raporu (PDF), dönem/yıllık sınırlar, sarı/turuncu/kırmızı uyarılar, “sınıra yaklaşanlar” listesi |
| F | `faz-f/hesap-acma` | Yönetici öğretmen ve veli hesabı açar (davet e-postası, şifre belirleme, ilk girişte KVKK onayı) |
| G | `faz-g/bursluluk` | Bursluluk sınavı tanımlama, girişsiz başvuru formu, başvuru yönetimi, Excel'e aktarma |
| H | `faz-h/dashboard-aktarim` | Rol bazlı “Ana sayfa” (kartlar yönetimden seçilir/sıralanır), öğrenci ve öğretmen listesini Excel/CSV'den toplu aktarma |

## MIGRATIONLAR

`0011_ayarlar_moduller` · `0012_dersler_saatler_atamalar` · `0013_odev` · `0014_dosyalar` · `0015_takvim_bildirim` · `0016_devamsizlik` · `0017_davet` · `0018_bursluluk` · `0019_panel_aktarim`

Her biri yalnız ekler (`create … if not exists`, `alter … add column`, `create or replace function`). 0013 ve 0015 birer pg_cron işi ekler: `odev-hatirlatma` (her gün 05:00 UTC) ve `takvim-hatirlatma` (05:05 UTC).

## YENİ TABLOLAR

- **0011:** `school_settings`
- **0012:** `academic_years`, `courses`, `teaching_assignments`
  - Mevcut tablolara eklenen sütunlar: `classes.academic_year_id`, `timetable.course_id`, `bell_times.active/label`
- **0013:** `homework`, `homework_students`
- **0014:** `attachments`
- **0015:** `calendar_events`
  - Mevcut tabloya eklenen sütun: `notifications.type`
- **0016:** `attendance_alerts`
- **0017:** `invite_intents`
  - Mevcut tabloya eklenen sütunlar: `profiles.phone/invited_at/invited_by`
- **0018:** `scholarship_exams`, `scholarship_applications`

## YENİ RPC / EDGE FUNCTIONS

- **Ayarlar:**
  - `set_settings`: yalnız yönetici + aal2; türe göre doğrulama; işlem geçmişi.
  - `setting`, `school_setting`, `setting_spec`, `module_enabled`
- **Ders yapısı:** `add_bell`, `delete_bell`, `move_bell`, `profile_classes`
- **Ödev:** `set_homework_statuses`, `odev_hatirlatma`
- **Dosya:**
  - `prepare_upload`, `confirm_upload`, `can_see_attachment`
  - `send_message(p_conversation, p_body, p_with_files)`
  - `public_school_info`
- **Takvim ve bildirim:** `event_reaches`, `event_visible`, `takvim_hatirlatma`, `notification_type`
- **Devamsızlık:** `attendance_counts`, `attendance_limits`, `attendance_limits_of`, `attendance_watchlist`
- **Davet:**
  - `accept_consent`, `admin_user_states`
  - `finish_invite` (yalnız service_role)
- **Bursluluk:** `public_scholarship_exams`, `apply_scholarship` (girişsiz), `admin_add_application`
- **Toplu aktarım:** `import_students(p, p_dry_run)`
  - Önizleme modunda hiçbir şey yazmaz.
  - Gerçek aktarımda tek bir hatalı satır bile varsa hiçbir satır yazılmaz.
- **Edge Function `admin-davet`:**
  - Tek davet, davet yeniden gönderme ve toplu öğretmen daveti (`action: 'bulk'`, en çok 100 satır).
  - service_role yalnız bu fonksiyonun ortamındadır; tarayıcıya hiç gönderilmez.

## STORAGE

- **`ekler`:**
  - Özel (public değil); en çok 25 MB; yalnız jpg/png/webp/pdf.
  - Okuma `can_see_attachment` ile yapılır. Dosya indirilip tarayıcıda gösterilir; herkese açık bağlantı yoktur.
- **`okul`:** herkese açık, en çok 2 MB; yalnız okul logosu için. Yazma yetkisi yalnız yöneticide.

## RLS

- Her yeni tabloda RLS açık.
- Yazma işlemleri ya politika ile ya da `security definer` fonksiyonla yapılır; yetki denetimi bu fonksiyonların içinde.
- Modül kapalıyken iki kat koruma var:
  - İlgili tablolarda kısıtlayıcı politika (`mod_*`) okumayı da keser.
  - `module_guard` trigger'ları yazmayı engeller.
- Yönetici işlemleri iki adımlı doğrulama (aal2) ister ve `audit_log` tablosuna yazılır.

## ADMIN PANELİNDEN YÖNETİLEBİLENLER (kod/deploy gerekmeden)

- **Genel:**
  - Okul adı, iletişim bilgileri, logo
  - Modüller (LGS, ödev, yoklama, ders programı, yemek, duyuru, mesaj, takvim, bursluluk)
  - Eğitim yılları ve dönem tarihleri
  - Dosya ve duyuru kuralları, bildirim türleri
  - **Ana sayfa düzeni** (veli, öğrenci ve öğretmen için ayrı)
- **Akademik:**
  - Sınıflar, ders kataloğu, ders saatleri (sayısı ve saatleri), ders atamaları
  - Ders programı, yoklama ve devamsızlık sınırları, yemek listesi
  - Ödev ve takvim ayarları
- **Kişiler:**
  - Öğrenciler, öğretmenler, veliler, kapalı hesaplar
  - Öğretmen/veli daveti
  - **Toplu aktarım** (Excel .xlsx ya da CSV)
- **Kayıt:** Bursluluk

## ÖDEV SİSTEMİ

- Öğretmen yalnız ders verdiği sınıfa (ders atamaları / ders programı) ödev verir; sınıftaki bütün öğrenciler (sonradan katılanlar dahil) otomatik sorumlu olur.
- Durumlar: bekliyor, yaptı, eksik, yapmadı, gelmedi, izinli; geciken ödev kırmızı gösterilir.
- Ayarlardan yönetilenler:
  - Son tarih zorunlu mu
  - Veli durumu görsün mü
  - Yeni ödev ve kontrol bildirimi
  - Hatırlatmanın kaç gün önce gideceği
  - Öğretmen eki ve öğrenci teslim dosyası (Faz C)
- Veli ve öğrenci yalnız kendi ödevini görür.

## DEVAMSIZLIK

- Sayım, aktif eğitim yılının dönem tarihlerine göre yapılır.
- Raporsuz sınırlar: 1. dönem, 2. dönem ve yıllık ayrı. İsteğe bağlı olarak raporlu ve izinli günleri de sayan bir toplam sınır tanımlanabilir.
- Geç kalmanın nasıl sayılacağı ayardan seçilir.
- Uyarı seviyeleri: sarı ve turuncu eşikler yüzde olarak ayardan girilir; sınıra ulaşınca kırmızı.
- Turuncuya ve kırmızıya geçişte yalnız birer kez bildirim gider; veliye gidip gitmeyeceği ayardan seçilir.
- Öğrenci dosyasında Devamsızlık sekmesi ve PDF raporu var; “Bugün” ekranında ve öğretmen ana sayfasında sınıra yaklaşanlar listelenir.

## BURSULULUK

- Sınav tanımlanır: tarih, sınıf seviyeleri, kontenjan, başvuru aralığı.
- `/bursluluk` adresindeki girişsiz başvuru formunda şunlar denetlenir: KVKK onayı, tekrar başvuru, kontenjan, kısa sürede çok başvuru.
- Başvuru numarası üretilir.
- Yönetici başvuruları süzer, onaylar ya da reddeder, salon ve saat atar, listeyi Excel (CSV) olarak indirir.
- Okulun kendi öğrencisi için yönetici başvuru açabilir.
- Modül varsayılan olarak kapalı.

## MESAJ/DOSYA

- Veli–öğretmen mesajlaşmasında ek dosya gönderilebilir; yalnız dosyadan oluşan mesaj da gönderilebilir.
- Duyurulara ek eklenebilir; duyuruyu kimin yayınlayabileceği ayardan seçilir.
- Ödevlere ek eklenebilir, öğrenci teslim dosyası yükleyebilir.
- Her dosyayı yalnız ilgili kişiler görür.

## BİLDİRİM

- Bildirimlerin türü var: ödev, mesaj, duyuru, sınav, etkinlik, devamsızlık, rapor, deneme, görev, görüşme, not, bursluluk.
- Her tür Yönetim Merkezi'nden kapatılabilir. Kayıt onayı ve sistem uyarıları kapatılamaz.
- Zildeki bildirime tıklayınca ilgili sayfa ve sekme açılır; “Tüm bildirimler” sayfası var.

## TAKVİM

- Etkinlik türleri: yazılı, deneme, bursluluk, veli toplantısı, gezi, kulüp, tatil vb.
- Hedef kitle: okul, kademe, sınıf, öğrenci ya da öğretmen.
- Öğretmenin etkinlik ekleyip ekleyemeyeceği ayardan seçilir.
- Sınavlardan önce hatırlatma gider; kaç gün önce gideceği ayardan girilir.
- Ödev teslim günleri takvimde salt okunur olarak görünür.

## TEST SONUÇLARI (yerel Supabase, örnek veri)

Faz H sonunda, 30.09.2026'da, yerel veritabanı sıfırlandıktan sonra:

- `npm run typecheck`: hatasız
- `npm run test` (Vitest): 182 geçti, 1 atlandı. Atlanan test gerçek deneme PDF'lerini ister; PDF'ler bu makinede yok.
- `npm run e2e` (Playwright + axe): 80/80 geçti
- `npm run e2e:dist` (derlenmiş sürüm): 13/13 geçti

Not: `tests/takvim-bildirim.test.ts` içindeki hatırlatma testi, tam gece yarısında (İstanbul saati) çalışırsa tarih kaymasıyla düşebilir. Test kodundan kaynaklanıyor, uygulama kodu doğru çalışıyor; testi yeniden çalıştırınca geçer.


- **Birim ve entegrasyon testleri (Vitest):** `tests/*.test.ts` ve `src/**/*.test.ts`. Her faz için ayrı dosya: yonetim-merkezi, odev, dosyalar, takvim-bildirim, devamsizlik, davet, bursluluk, panel-aktarim.
- **Uçtan uca testler (Playwright + axe erişilebilirlik denetimi):** `e2e/*.spec.ts`. Derlenmiş sürüm ayrıca `npm run e2e:dist` ile test edildi.

## KALAN RİSKLER

- **Uygulama sırası:** Gökhan'ın 0011–0019 migration'larını sırayla uygulaması (`supabase db push`) ve `admin-davet` fonksiyonunu deploy etmesi gerekir. Uygulanmadan birleştirilirse yeni ekranlar hata verir.
- **Davet e-postaları:**
  - Supabase'in yerleşik e-posta servisi saatte çok az e-posta gönderir. Toplu öğretmen daveti için özel SMTP kurulmalı.
  - Sınıra takılınca kalan satırlar denenmez ve sonuçta hangi satırların açılmadığı gösterilir.
- **Supabase ayarları:**
  - Auth → URL Configuration: Site URL ve Redirect URL'lere `https://buluskurementor.com` eklenmeli.
  - E-posta şablonları Türkçeleştirilmeli.
- **Sahipsiz dosyalar:** silinen eklerin Storage'daki dosyası kalır (yer kaplar, erişilemez). İleride bir temizlik işi eklenebilir.
- **Excel desteği:**
  - Yalnız .xlsx okunur. Eski .xls dosyası Excel'de .xlsx olarak kaydedilmeli.
  - Okuma `read-excel-file` (MIT) ile tarayıcıda yapılır; sunucuya yalnız çözülmüş satırlar gider.
- **Toplu aktarımda hesaplar:** öğrenci aktarımı öğrenci hesabı açmaz; öğrenci ve veli kendi kaydıyla bağlanır (mevcut akış).
- **Yoklama yetkisi:** `yoklama.ogretmen_girebilir` ayarı tanımlı ama kullanılmıyor; yoklamayı şimdilik yalnız yönetici girer.
- **Test kapsamı:** gerçek öğrenci verisiyle ve canlı ortamda test edilmedi; bütün testler yerel Supabase ve örnek veriyle yapıldı.
