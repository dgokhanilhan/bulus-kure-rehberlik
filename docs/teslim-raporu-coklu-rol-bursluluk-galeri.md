# Teslim raporu: Çoklu rol, Bursluluk 2.0, İletişim/Duyurular + LGS/YKS, Galeri

Dört ayrı PR, hepsi `main`'e (zincirleme değil):

| PR | Dal | Migration | Edge Function |
|---|---|---|---|
| A · Çoklu rol | `ozellik/coklu-rol` (#17, birleşti) | 0020 | yok |
| C · Bursluluk 2.0 | `ozellik/bursluluk-2` | 0021 | yok |
| B · İletişim/Duyurular + LGS/YKS | `ozellik/iletisim-duyuru-lgs` (#18) | yok | yok |
| D · Galeri | `ozellik/galeri` | 0022 | yok |

**Birleştirme sırası:** C (0021) → D (0022). B, migration içermediği için her zaman birleştirilebilir. D, C'den önce birleştirilirse `supabase db push` sıra hatası verir; o durumda D'nin migration numarası değiştirilmelidir.

Bütün testler yerel Supabase ve örnek veriyle çalıştırıldı. Canlı ortamda ve gerçek veriyle test edilmedi.

==================================================
## ÇOKLU ROL
==================================================

- **VERİ MODELİ**
  - Kişi başına tek Auth kullanıcısı ve tek profil var.
  - Roller `profile_roles` tablosunda tutuluyor (`profile_id`, `role`, `created_by`, `created_at`; `UNIQUE(profile_id, role)`).
  - `profiles.role` alanı ana rol olarak kalıyor.
  - Rol değerleri mevcut enum'dan: `admin`, `ogretmen`, `veli`, `ogrenci`.
- **BACKFILL:** Mevcut her profilin ana rolü tabloya aktarıldı. İşlem tekrar çalıştırılabilir; kimsenin yetkisi değişmedi. Yeni kayıtlar tetikleyiciyle kendiliğinden ekleniyor.
- **ROLE SELECTOR:** Öğretmen + veli rolü olan hesap girişten sonra "Nasıl devam etmek istersiniz?" ekranını görüyor. Tek rollü hesapların girişi değişmedi.
- **ROLE SWITCH**
  - Profil menüsünde "Rol değiştir" var.
  - Rol değişince menü, ana sayfa ve sorgular yenileniyor (önbellek temizleniyor).
  - Seçim sayfa yenilenince korunuyor; çıkışta ve yeni girişte siliniyor.
  - Seçili rol yalnız ekranı belirliyor; tarayıcıda değiştirilerek yetki kazanılamıyor (test edildi).
- **ADMIN**
  - Yönetim → kişi → Roller bölümünden rol eklenip kaldırılıyor.
  - Veli rolü eklerken öğrenci ve yakınlık seçiliyor (`parent_links`). Öğretmen rolü eklerken branş, ders ataması ve sınıf öğretmenliği seçiliyor (`teaching_assignments`).
  - Yalnız yönetici + aal2 yapabiliyor; her işlem `audit_log`'a yazılıyor (`role_add` / `role_remove`).
  - Ana rol kaldırılamıyor. Bağlı ilişki varken rol kaldırılamıyor ve ekranda açık uyarı çıkıyor.
- **RLS**
  - Yeni fonksiyonlar: `has_role`, `teacher_classes`, `role_classes`.
  - Rol listesine uyarlananlar: `is_teacher`, `is_staff`, duyuru/etkinlik hedefleme (her rol kendi sınıflarıyla), `child_contacts`, `start_conversation`, öğretmen geçerlilik tetikleyicileri, `profiles_teacher_names` politikası.
  - `teaches_student` artık yalnız öğretmenlik sınıflarına bakıyor. `is_admin` değişmedi.
- **MIGRATION:** `0020_coklu_rol.sql`. Geri alma betiği: `supabase/geri-alma/0020_coklu_rol_geri_al.sql` (yerelde denendi).

==================================================
## BURSULULUK 2.0
==================================================

- **SESSIONS:** `scholarship_sessions` tablosu (gün, başlangıç/bitiş, ad, yer, aktif, sıra). Sayısı sınırsız.
- **QUOTAS:** `scholarship_session_quotas` tablosu: her seans × sınıf için ayrı kontenjan, `UNIQUE(session_id, grade)`. Yalnız sınavda tanımlı sınıf seviyeleri için girilebiliyor.
- **PUBLIC APPLICATION**
  - Akış: sınav → sınıf → uygun seanslar (kalan yerle; dolu seans görünür ama seçilemez) → öğrenci/veli bilgileri → KVKK.
  - Başvuru için okul öğrencisi olmak gerekmiyor.
  - Sayfa önce telefon için tasarlandı.
- **TRACKING CODE**
  - Biçim `BK-XXXX-XXXX`; 32 karakterlik alfabe, kriptografik rastgele (`gen_random_bytes`), 40 bit.
  - "Başvurumu görüntüle" ekranı yalnız gerekli alanları gösteriyor; telefon ve e-posta maskeli.
  - Yanlış kodda genel "Başvuru bulunamadı." yazıyor.
  - Okul + IP özeti başına 10 dakikada 20 sorgu yapılabiliyor; başarısız denemeler de sayılıyor. IP saklanmıyor.
- **SELF EDIT**
  - Sınav bazında yönetiliyor: aç/kapat, son tarih ("sınavdan 10 gün önce" düğmesiyle), düzenlenebilecek alanlar.
  - Başvuran iptal de edebiliyor.
  - Son tarih geçince başvuru görüntüleniyor ama "Düzenleme süresi sona ermiştir." yazıyor; sunucu da düzenlemeyi reddediyor.
- **CONCURRENCY / CAPACITY**
  - Denetim tek yerde: `sch_app_capacity` tetikleyicisi seans × sınıf satırını `FOR UPDATE` ile kilitleyip sayıyor.
  - Başvuru, düzenleme ve yöneticinin değişikliği aynı denetimden geçiyor.
  - Son 1 yere 5 eşzamanlı başvuruda yalnız 1'i kabul ediliyor (test edildi).
  - Bekleyen ve onaylanan başvurular kontenjanı dolduruyor; reddedilen ve yeni "iptal" doldurmuyor.
- **ADMIN**
  - Seans × sınıf tablosunda kontenjan / başvuru / kalan ya da DOLU görünüyor.
  - Süzgeçler: gün, seans, sınıf, durum, ad/takip kodu.
  - Başvurunun seansı değiştirilebiliyor; okul öğrencisinden seanslı başvuru açılabiliyor.
  - Salon ayrı alan; yönetici sonradan atıyor.
- **EXPORT:** Excel (CSV) sütunları: takip kodu, öğrenci, sınıf, okul, veli, telefon, e-posta, sınav günü, seans, saat, salon, durum (+ başvuru tarihi, kaynak, not, eski numara).
- **RLS**
  - Seans ve kontenjan tablolarını yalnız yönetici okuyup yazabiliyor.
  - Herkese açık işlemler yalnız fonksiyonlar üzerinden yapılıyor.
  - Eski sınavlar ve başvurular korunuyor; eski başvurular "seans atanmamış" görünüyor.
  - Migration: `0021_bursluluk_seans.sql`. Geri alma betiği: `supabase/geri-alma/0021_bursluluk_seans_geri_al.sql` (yerelde denendi).

==================================================
## İLETİŞİM / DUYURULAR
==================================================

- **ROUTES**
  - `/iletisim` doğrudan mesajlaşmayı açıyor, sekme yok.
  - `/duyurular` ayrı sayfa.
  - Eski bağlantılar yönlendiriliyor: `/iletisim?sekme=duyurular` ve `?tab=duyurular` → `/duyurular`. Öğrencinin eski `/iletisim` bağlantısı da `/duyurular`'a gidiyor.
- **NAVIGATION:** İletişim ve Duyurular ayrı menü öğeleri; telefondaki "Daha" menüsünde de ayrılar. Öğrenci mesajlaşmadığı için menüsünde İletişim yok.
- **NOTIFICATION LINKS:** Mesaj bildirimi ilgili yazışmayı açıyor. Duyuru bildirimi Duyurular sayfasında ilgili duyuruyu vurgulayarak açıyor (`?d=`).
- **MIGRATION:** Yok.

==================================================
## LGS / YKS
==================================================

- **LGS ELIGIBILITY**
  - Karar `classes.grade` alanından veriliyor (sınıf adından değil): 8 → LGS, 12 → YKS, diğerleri → hiçbiri.
  - LGS kartı ve Özet'teki deneme/net/puan/gelişim bölümü yalnız seçili öğrenci 8. sınıftaysa görünüyor.
  - Ana sayfa düzeni bu kuralı aşamıyor.
  - Ailede 8. sınıf yoksa menüde "LGS özeti" yerine "Özet" görünüyor. Sayfa kaldırılmadı, çünkü öğretmen notları, etütler, görüşmeler ve raporlar bu sayfada; bu bölümler herkes için yerinde.
- **YKS DATA SOURCE:** **Yok.** Gerçek YKS veri kaynağı mevcut değil. 12. sınıf için hiçbir YKS kartı ya da sayısı gösterilmiyor. Uygunluk yardımcısı (`examTrack`) ileride kullanılmak üzere hazır.
- **MULTI CHILD:** Karar seçili çocuğa göre veriliyor; çocuk değişince kart da değişiyor (6 → 8 → 12 test edildi).
- **QUERY OPTIMIZATION:** 8. sınıf olmayan öğrencide deneme verisi hiç sorgulanmıyor (ağ isteğiyle doğrulandı).

==================================================
## GALERİ
==================================================

- **ARCHITECTURE**
  - Tablolar: `gallery_categories`, `gallery_albums`, `gallery_media`.
  - Kitle bilgisi albüm satırında tutuluyor (`audience` + `level` / `class_ids` / `student_ids`).
  - Medya kaydı yalnız `gallery_prepare_upload` ile açılıyor, `gallery_confirm_upload` ile tamamlanıyor.
- **ALBUMS**
  - Alanlar: başlık, açıklama, tarih, kategori, kapak, hedef kitle, durum, indirme izni.
  - Durumlar: taslak → (öğretmen + onay açıksa) onay bekliyor → yayında → arşiv.
  - Arşiv geri alınabiliyor. Kalıcı silmede "Bu albümde N medya dosyası var." uyarısı çıkıyor; önce Storage dosyaları (orijinal, görüntüleme, küçük) siliniyor, sonra kayıt. Dosya silinemezse kayıt silinmiyor.
- **PHOTO**
  - Türler: JPG, JPEG, PNG, WEBP.
  - Doğrulama: uzantı ve tür veritabanında birbirini tutmalı; dosyanın ilk baytları tarayıcıda kontrol ediliyor (sahte uzantı reddediliyor); bucket'ta tür listesi var; boyut sınırı uygulanıyor.
  - Önizlemeler tarayıcıda üretiliyor: 480 px küçük boyut, 1600 px görüntüleme boyutu. Izgarada asıl dosya yüklenmiyor.
- **VIDEO**
  - Türler: MP4, MOV, WEBM.
  - Kapak karesi tarayıcıda üretiliyor; üretilemezse video kapaksız yükleniyor.
  - Oynatıcıda kontroller var; otomatik oynatma yok; ızgarada video yüklenmiyor (`preload=metadata`).
  - Dönüştürme (transcoding) yok.
- **STORAGE**
  - Özel `galeri` bucket'ı; herkese açık bağlantı yok.
  - Dosyalar 1 saatlik imzalı bağlantıyla açılıyor; indirme bağlantısı 5 dakikalık.
  - Yol yalnız kimliklerden oluşuyor: `okul/eğitim-yılı/albüm/medya/original.uzantı` (+ `view.webp`, `thumb.webp`). Ad, TC, telefon yok.
- **RLS**
  - Görme kararı tek yerde: `gallery_row_visible`, `can_view_gallery_album`, `can_view_gallery_media`.
  - Storage politikaları aynı fonksiyonlara bağlı; yol tahmin ederek dosya açılamıyor (test edildi).
  - Modül kapalıyken kısıtlayıcı politika devreye giriyor.
  - Durum değişikliği yalnız yayınla/arşivle fonksiyonlarıyla yapılabiliyor.
- **AUDIENCE:** tüm okul, kademe, sınıf (birden çok), belirli öğrenciler, yalnız öğretmenler.
- **PARENT ACCESS:** Veli yalnız çocuğunun sınıfı/kademesi, çocuğuna yönelik ve okul geneli albümleri görüyor. Başka sınıfın velisi ve başka okulun kullanıcısı göremiyor (test edildi).
- **TEACHER ACCESS**
  - Varsayılan olarak yalnız yönetici yönetiyor.
  - Ayarla açılabilenler: öğretmen albüm açma, öğretmen yükleme, kapsam (kendi sınıfı / kademesi / okul), yönetici onayı.
  - Öğretmen başkasının albümünü yönetemiyor; onayı yalnız yönetici verebiliyor.
- **DUAL ROLE:** Yetki rollerin toplamı. Veli modunda "yalnız öğretmenler" albümleri listelenmiyor, albüm oluşturma düğmesi görünmüyor.
- **PERFORMANCE:** Izgarada küçük önizlemeler ve tembel yükleme var. Medya 60'arlı sayfalarla geliyor, sona gelince sıradaki sayfa yükleniyor. İmzalı bağlantılar toplu alınıp önbellekte tutuluyor.
- **NOTIFICATION**
  - Yayınlarken "Kullanıcılara bildirim gönder" seçilirse albümün kitlesine yalnız bir bildirim gidiyor (`bildirim.galeri` ayarına tabi).
  - Öğretmen albümü onay bekleyince yöneticilere bildirim gidiyor.
  - Her fotoğraf için ayrı bildirim yok.
- **ADMIN SETTINGS:** Yönetim Merkezi'nden yönetilenler:
  - Galeri modülü (Modüller'de, varsayılan kapalı)
  - Öğretmen albüm oluşturabilir / medya yükleyebilir
  - Öğretmen kapsamı
  - Yönetici onayı
  - Varsayılan indirme izni
  - En büyük foto/video boyutu
  - Kategoriler: ekle, yeniden adlandır, kapat
- **ÖNERİLEN BOYUTLAR:** Fotoğraf 15 MB, video 50 MB. Ücretsiz Supabase planında tek dosya sınırı 50 MB; daha büyük video için Pro plan ve Storage ayarı gerekiyor.
- **MEDIA CONSENT:** Sistemde öğrenci fotoğraf/video paylaşım izni alanı **yok**. Bu fazda hukuki bir onay sistemi eklenmedi. Albüm kitlesi ve "belirli öğrenciler" seçeneği ileride bir `media_consent` alanıyla süzülebilecek şekilde tasarlandı.
- **YAPILMAYANLAR (isteğe bağlıydı):**
  - "Galeriden" ana sayfa kartı eklenmedi.
  - Albüm bazında birden çok kitle birleşimi yok; tek kitle türü seçiliyor (sınıf seçeneğinde birden çok sınıf seçilebiliyor).
- **Migration:** `0022_galeri.sql`.

==================================================
## PRODUCTION
==================================================

**GÖKHAN'IN YAPMASI GEREKENLER**
1. PR C'yi birleştirmeden önce `supabase db push` (0021).
2. PR B'yi birleştir (migration yok).
3. PR D'yi birleştirmeden önce `supabase db push` (0022). Bu adım `galeri` bucket'ını ve politikalarını da oluşturuyor.
4. Galeri'yi açmak için Yönetim → Modüller → Galeri. Ayarlar: Yönetim → Galeri ayarları.
5. Video için 50 MB'tan büyük dosya gerekiyorsa: Supabase Pro + Storage → Settings → Global file size limit artırılır, sonra Galeri ayarlarında video sınırı yükseltilir.
6. Bursluluk'ta açık bir sınav varsa: birleştirince seans ve kontenjan tanımlanmalı; tanımlanana kadar o sınava başvuru alınmıyor.

- **MIGRATIONS:** `0020_coklu_rol.sql` (#17 ile birleşti; uygulandıysa tekrar uygulanmaz), `0021_bursluluk_seans.sql`, `0022_galeri.sql`.
- **EDGE FUNCTIONS:** Bu dört PR için deploy gerekmiyor.
- **STORAGE:** Yeni özel `galeri` bucket'ı (0022 oluşturuyor; elle bir şey yapmak gerekmiyor).
- **SUPABASE MANUAL SETTINGS:** Yalnız büyük video gerekiyorsa global dosya boyutu sınırı (madde 5).
- **CLOUDFLARE:** Değişiklik yok.

==================================================
## SON GÜVENLİK RAPORU
==================================================

- **Mevcut Auth user ID'leri değişti mi?** Hayır.
- **Eski veli hesapları korundu mu?** Evet; ana rolleri aynen aktarıldı.
- **Eski öğretmen hesapları korundu mu?** Evet.
- **Eski öğrenci kayıtları korundu mu?** Evet; öğrenci tablosuna dokunulmadı. Yalnız okunurken sınıf seviyesi ekleniyor.
- **LGS sistemi değişti mi?** Hayır. PDF okuma, D/Y/B, net, puan ve kazanım değişmedi; yalnız kimin göreceği sınıf seviyesine bağlandı.
- **Mevcut bursluluk başvuruları korundu mu?** Evet; seansları boş ("seans atanmamış"), eski numaraları duruyor.
- **Galeri bucket private mı?** Evet (`public = false`).
- **Galeri URL'si dışarıdan login olmadan açılabiliyor mu?** Hayır. Herkese açık bağlantı yok; imzalı bağlantıyı yalnız yetkili kullanıcı alabiliyor (test edildi). Alınmış bir imzalı bağlantı süresi dolana (en çok 1 saat) kadar çalışır.
- **Başka sınıf velisi özel albümü görebiliyor mu?** Hayır (test edildi).
- **Başka okul kullanıcısı görebiliyor mu?** Hayır (test edildi).
- **service_role frontend'e çıktı mı?** Hayır.
- **Herhangi bir production verisi silindi mi?** Hayır; canlıya hiçbir şey uygulanmadı.
- **Herhangi bir destructive migration var mı?** Yok. Migration'larda yalnız şunlar var, hiçbiri veri silmiyor:
  - Aynı dosyanın oluşturduğu nesneleri yeniden kurmak için `drop … if exists` (tekrar çalıştırılabilsin diye).
  - Bursluluk durum denetiminin "iptal"i de kabul edecek şekilde yeniden tanımlanması.
  - `admin_add_application` fonksiyonunun eski iki parametreli sürümünün kaldırılıp seans parametreli sürümün eklenmesi (veri değil, fonksiyon).
- **Hangi yeni migrationlar oluştu?** `0020_coklu_rol.sql`, `0021_bursluluk_seans.sql`, `0022_galeri.sql`.
- **Hangi Edge Function deploy edilmeli?** Hiçbiri.
- **Rollback gerekirse nasıl yapılır?**
  - Çoklu rol: `supabase/geri-alma/0020_coklu_rol_geri_al.sql` (veri silmez) + ön yüzü önceki sürüme döndür.
  - Bursluluk 2.0: `supabase/geri-alma/0021_bursluluk_seans_geri_al.sql` (veri silmez) + ön yüzü geri al.
  - Galeri: Yönetim → Modüller → Galeri'yi kapat. Herkes için menüden ve veriden kalkar; tablolar ve dosyalar korunur. Gerekirse ön yüz geri alınır.
  - İletişim/Duyurular + LGS/YKS: yalnız ön yüz; önceki sürüme dönmek yeterli.

### Test sonuçları (Galeri dalı, yerel, temiz çalıştırma)
- typecheck hatasız
- Vitest 206 geçti, 1 atlandı (gerçek PDF ister)
- e2e 87/87
- e2e:dist 13/13

Diğer dalların sonuçları kendi PR açıklamalarında.
