# Okul ayarları

Yönetim → **Tüm ayarlar** ekranından kod yazmadan değiştirilir; değişiklik anında geçerli olur ve Yönetim → **Ayar geçmişi**'ne yazılır.
Tür ve sınırlar veritabanında (`setting_spec()`), ad ve açıklamalar `src/lib/ayarAdlari.ts` dosyasındadır.

**Değiştirilemez (ayar yapılmaz):** veri uydurmama, sonuç ve kazanım ayrılığı, veli/öğrenci ekranında sınıf sıralaması olmaması, RLS ve yetkilerin gevşetilmesi, yapay zekâ anahtarı, yapay zekâya kişisel veri gönderilmemesi, yapay zekâ çıktısının öğretmen onayı olmadan veliye gitmemesi, KVKK aydınlatma metni (hukukçu onayı gerektirir; yalnız iletişim bilgileri ayardır), yöneticide iki adımlı doğrulama. Görünürlük ve yetki ayarları yalnız mevcut izinleri **kısıtlar**, hiçbir zaman genişletmez.


## Genel

| Anahtar | Ayar | Açıklama | Varsayılan | Etkilediği ekranlar |
| --- | --- | --- | --- | --- |
| `genel.adres` | Adres | Okulun adresi. | — | İletişim, KVKK |
| `genel.alt_baslik` | Alt başlık | Okul adının altındaki satır (ör. Rehberlik & Mentörlük). | Rehberlik & Mentörlük | Giriş, üst bilgi |
| `genel.eposta` | E-posta | Okulun e-posta adresi. | — | İletişim, KVKK |
| `genel.logo` | Logo | Okul logosu dosya yolu; Genel ayarlar ekranından yüklenir. | — | Giriş, üst bilgi |
| `genel.okul_adi` | Okul adı | Giriş ekranı, üst bilgi, raporlar ve PDF çıktılarında görünen ad. | — | Giriş, üst bilgi, raporlar, PDF |
| `genel.telefon` | Telefon | Okulun telefonu; iletişim ve KVKK sayfasında. | — | İletişim, KVKK |

## Görünüm

| Anahtar | Ayar | Açıklama | Varsayılan | Etkilediği ekranlar |
| --- | --- | --- | --- | --- |
| `gorunum.baslik` | Başlık stili | Renkli ya da kalın başlıklar. | renkli | Bütün ekranlar |
| `gorunum.hareket` | Animasyonlar | Kapalıyken geçiş animasyonları gösterilmez. | açık | Bütün ekranlar |
| `gorunum.kose` | Köşe yuvarlaklığı | Kart ve düğme köşeleri. | normal | Bütün ekranlar |
| `gorunum.tema` | Tema | Açık, koyu ya da cihaza göre. | auto | Bütün ekranlar |
| `gorunum.vurgu` | Vurgu rengi | Düğme ve vurgu rengi. | yesil | Bütün ekranlar |
| `gorunum.yazi` | Yazı boyu | Normal ya da büyük yazı. | normal | Bütün ekranlar |
| `gorunum.yogunluk` | Yoğunluk | Ekran öğeleri arasındaki boşluk. | normal | Bütün ekranlar |

## Metinler

| Anahtar | Ayar | Açıklama | Varsayılan | Etkilediği ekranlar |
| --- | --- | --- | --- | --- |
| `metin.giris_slogan` | Giriş ekranı sloganı | Giriş ekranının sol bölümündeki cümle. | Her deneme, öğrenciyi biraz daha iyi tanımak için. | Giriş |
| `metin.kayit_kapali` | Kayıt kapalı mesajı | Kayıt kapalıyken kayıt sekmesinde gösterilir. | Okulumuz şu an yeni kayıt almıyor. Hesap için okul yönetimiyle görüşebilirsiniz. | Kayıt formu |
| `metin.kayit_notu` | Kayıt formu notu | Kayıt düğmesinin altındaki açıklama. | Kaydın okul yönetimi onayladıktan sonra açılır. | Kayıt formu |
| `okul.karsilama` | Ana sayfa karşılama metni | Veli, öğrenci ve öğretmen ana sayfasının üstünde görünür; boşsa gösterilmez. | — | Ana sayfa |

## Menü

| Anahtar | Ayar | Açıklama | Varsayılan | Etkilediği ekranlar |
| --- | --- | --- | --- | --- |
| `menu.ad.bugun` | Menü adı: Bugün | Boşsa varsayılan ad kullanılır. | — | Menü |
| `menu.ad.denemeler` | Menü adı: Denemeler | Boşsa varsayılan ad kullanılır. | — | Menü |
| `menu.ad.duyurular` | Menü adı: Duyurular | Boşsa varsayılan ad kullanılır. | — | Menü |
| `menu.ad.etut` | Menü adı: Etüt | Boşsa varsayılan ad kullanılır. | — | Menü |
| `menu.ad.galeri` | Menü adı: Galeri | Boşsa varsayılan ad kullanılır. | — | Menü |
| `menu.ad.gorevler` | Menü adı: Görevler | Boşsa varsayılan ad kullanılır. | — | Menü |
| `menu.ad.gorusmeler` | Menü adı: Görüşmeler | Boşsa varsayılan ad kullanılır. | — | Menü |
| `menu.ad.gozetmen` | Menü adı: Gözetmen Bul | Boşsa varsayılan ad kullanılır. | — | Menü |
| `menu.ad.iletisim` | Menü adı: İletişim | Boşsa varsayılan ad kullanılır. | — | Menü |
| `menu.ad.nobet_takip` | Menü adı: Nöbet Takip | Boşsa varsayılan ad kullanılır. | — | Menü |
| `menu.ad.odevler` | Menü adı: Ödevler | Boşsa varsayılan ad kullanılır. | — | Menü |
| `menu.ad.ogrenciler` | Menü adı: Öğrenciler | Boşsa varsayılan ad kullanılır. | — | Menü |
| `menu.ad.okul` | Menü adı: Okul | Boşsa varsayılan ad kullanılır. | — | Menü |
| `menu.ad.onaylar` | Menü adı: Onaylar | Boşsa varsayılan ad kullanılır. | — | Menü |
| `menu.ad.ozet` | Menü adı: LGS özeti / Özet | Boşsa varsayılan ad kullanılır. | — | Menü |
| `menu.ad.panel` | Menü adı: Ana sayfa | Boşsa varsayılan ad kullanılır. | — | Menü |
| `menu.ad.raporlar` | Menü adı: Raporlar | Boşsa varsayılan ad kullanılır. | — | Menü |
| `menu.ad.siniflar` | Menü adı: Sınıflar | Boşsa varsayılan ad kullanılır. | — | Menü |
| `menu.ad.takvim` | Menü adı: Takvim | Boşsa varsayılan ad kullanılır. | — | Menü |
| `menu.ad.yonetim` | Menü adı: Yönetim | Boşsa varsayılan ad kullanılır. | — | Menü |
| `menu.gizli.admin` | Gizli sayfalar: Yönetici | Bu rolün menüsünden kaldırılan sayfalar (virgülle sayfa kimlikleri). Yönetici menüsünden Yönetim kaldırılamaz. Veriye erişimi değiştirmez; erişim için Modüller ve Veli/öğretmen ayarları kullanılır. | — | Menü |
| `menu.gizli.brans` | Gizli sayfalar: Branş öğretmeni | Bu rolün menüsünden kaldırılan sayfalar (virgülle sayfa kimlikleri). Yönetici menüsünden Yönetim kaldırılamaz. Veriye erişimi değiştirmez; erişim için Modüller ve Veli/öğretmen ayarları kullanılır. | — | Menü |
| `menu.gizli.ogrenci` | Gizli sayfalar: Öğrenci | Bu rolün menüsünden kaldırılan sayfalar (virgülle sayfa kimlikleri). Yönetici menüsünden Yönetim kaldırılamaz. Veriye erişimi değiştirmez; erişim için Modüller ve Veli/öğretmen ayarları kullanılır. | — | Menü |
| `menu.gizli.rehber` | Gizli sayfalar: Rehber öğretmen | Bu rolün menüsünden kaldırılan sayfalar (virgülle sayfa kimlikleri). Yönetici menüsünden Yönetim kaldırılamaz. Veriye erişimi değiştirmez; erişim için Modüller ve Veli/öğretmen ayarları kullanılır. | — | Menü |
| `menu.gizli.veli` | Gizli sayfalar: Veli | Bu rolün menüsünden kaldırılan sayfalar (virgülle sayfa kimlikleri). Yönetici menüsünden Yönetim kaldırılamaz. Veriye erişimi değiştirmez; erişim için Modüller ve Veli/öğretmen ayarları kullanılır. | — | Menü |
| `menu.sira.admin` | Menü sırası: Yönetici | Virgülle sayfa kimlikleri; yazılanlar önce, kalanlar varsayılan sırada. | — | Menü |
| `menu.sira.brans` | Menü sırası: Branş öğretmeni | Virgülle sayfa kimlikleri; yazılanlar önce, kalanlar varsayılan sırada. | — | Menü |
| `menu.sira.ogrenci` | Menü sırası: Öğrenci | Virgülle sayfa kimlikleri; yazılanlar önce, kalanlar varsayılan sırada. | — | Menü |
| `menu.sira.rehber` | Menü sırası: Rehber öğretmen | Virgülle sayfa kimlikleri; yazılanlar önce, kalanlar varsayılan sırada. | — | Menü |
| `menu.sira.veli` | Menü sırası: Veli | Virgülle sayfa kimlikleri; yazılanlar önce, kalanlar varsayılan sırada. | — | Menü |

## Modüller

| Anahtar | Ayar | Açıklama | Varsayılan | Etkilediği ekranlar |
| --- | --- | --- | --- | --- |
| `modul.bursluluk` | Bursluluk | Kapalıyken modül menüden kalkar ve yönetici dışında verisi okunamaz. | kapalı | Menü, ilgili ekranlar |
| `modul.ders_programi` | Ders programı | Kapalıyken modül menüden kalkar ve yönetici dışında verisi okunamaz. | açık | Menü, ilgili ekranlar |
| `modul.duyuru` | Duyurular | Kapalıyken modül menüden kalkar ve yönetici dışında verisi okunamaz. | açık | Menü, ilgili ekranlar |
| `modul.etut` | Cumartesi etütleri | Kapalıyken modül menüden kalkar ve yönetici dışında verisi okunamaz. | açık | Menü, ilgili ekranlar |
| `modul.galeri` | Galeri | Kapalıyken modül menüden kalkar ve yönetici dışında verisi okunamaz. | kapalı | Menü, ilgili ekranlar |
| `modul.lgs` | LGS / Deneme | Kapalıyken modül menüden kalkar ve yönetici dışında verisi okunamaz. | açık | Menü, ilgili ekranlar |
| `modul.mesaj` | Mesajlaşma | Kapalıyken modül menüden kalkar ve yönetici dışında verisi okunamaz. | açık | Menü, ilgili ekranlar |
| `modul.odev` | Ödev sistemi | Kapalıyken modül menüden kalkar ve yönetici dışında verisi okunamaz. | açık | Menü, ilgili ekranlar |
| `modul.takvim` | Takvim | Kapalıyken modül menüden kalkar ve yönetici dışında verisi okunamaz. | açık | Menü, ilgili ekranlar |
| `modul.yemek` | Yemek listesi | Kapalıyken modül menüden kalkar ve yönetici dışında verisi okunamaz. | açık | Menü, ilgili ekranlar |
| `modul.yoklama` | Yoklama | Kapalıyken modül menüden kalkar ve yönetici dışında verisi okunamaz. | açık | Menü, ilgili ekranlar |

## Bildirimler

| Anahtar | Ayar | Açıklama | Varsayılan | Etkilediği ekranlar |
| --- | --- | --- | --- | --- |
| `bildirim.bursluluk` | Bursluluk | Kapalıyken bu türden bildirim oluşmaz. | açık | Bildirimler |
| `bildirim.deneme` | Deneme sonucu | Kapalıyken bu türden bildirim oluşmaz. | açık | Bildirimler |
| `bildirim.devamsizlik` | Devamsızlık | Kapalıyken bu türden bildirim oluşmaz. | açık | Bildirimler |
| `bildirim.duyuru` | Yeni duyuru | Kapalıyken bu türden bildirim oluşmaz. | açık | Bildirimler |
| `bildirim.etkinlik` | Etkinlik | Kapalıyken bu türden bildirim oluşmaz. | açık | Bildirimler |
| `bildirim.etut` | Etüt | Kapalıyken bu türden bildirim oluşmaz. | açık | Bildirimler |
| `bildirim.galeri` | Galeri | Kapalıyken bu türden bildirim oluşmaz. | açık | Bildirimler |
| `bildirim.gorev` | Görevler | Kapalıyken bu türden bildirim oluşmaz. | açık | Bildirimler |
| `bildirim.gorusme` | Görüşmeler | Kapalıyken bu türden bildirim oluşmaz. | açık | Bildirimler |
| `bildirim.mesaj` | Yeni mesaj | Kapalıyken bu türden bildirim oluşmaz. | açık | Bildirimler |
| `bildirim.nobet` | Nöbet hatırlatması | Kapalıyken bu türden bildirim oluşmaz. | açık | Bildirimler |
| `bildirim.not` | Rehberlik notları | Kapalıyken bu türden bildirim oluşmaz. | açık | Bildirimler |
| `bildirim.rapor` | Yeni rapor | Kapalıyken bu türden bildirim oluşmaz. | açık | Bildirimler |
| `bildirim.sinav` | Sınav eklendi | Kapalıyken bu türden bildirim oluşmaz. | açık | Bildirimler |
| `bildirim.sinav_hatirlatma` | Yaklaşan sınav | Kapalıyken bu türden bildirim oluşmaz. | açık | Bildirimler |

## Kayıt ve güvenlik

| Anahtar | Ayar | Açıklama | Varsayılan | Etkilediği ekranlar |
| --- | --- | --- | --- | --- |
| `guvenlik.ogretmen_mfa` | Öğretmenlere iki adımlı doğrulama zorunlu | Açıkken öğretmenler girişte doğrulama uygulaması kurar ve kod girer. Yöneticide her zaman zorunludur (kapatılamaz). | kapalı | Giriş |
| `kayit.acik` | Kayıt formu açık | Kapalıyken giriş ekranında "Kayıt ol" görünmez ve veritabanı da kendi kendine kaydı reddeder; davetle hesap açma etkilenmez. | açık | Giriş, kayıt |
| `kayit.davet_zorunlu` | Yalnız davetle kayıt | Açıkken hesaplar yalnız Yönetim → davet ile açılır. | kapalı | Giriş, kayıt |

## Veli ve öğrenci

| Anahtar | Ayar | Açıklama | Varsayılan | Etkilediği ekranlar |
| --- | --- | --- | --- | --- |
| `aile.etut` | Etütleri görür | Kapalıyken veli ve öğrenci Cumartesi etütlerini ve yoklamasını göremez. | açık | Etüt, Ana sayfa |
| `aile.gorevler` | Görevleri görür | Kapalıyken veli ve öğrenci görevleri göremez (menü ve veritabanı). | açık | Görevler, Ana sayfa |
| `aile.gorusmeler` | Görüşmeleri görür | Kapalıyken veli ve öğrenci görüşmeleri göremez ve yanıtlayamaz. | açık | Görüşmeler, Ana sayfa |
| `aile.notlar` | Öğretmen notlarını görür | Kapalıyken veliye açık öğretmen notları gösterilmez. | açık | LGS özeti |
| `aile.raporlar` | Raporları görür | Kapalıyken gönderilmiş veli raporları gösterilmez. | açık | Raporlar, LGS özeti |

## Öğretmen yetkileri

| Anahtar | Ayar | Açıklama | Varsayılan | Etkilediği ekranlar |
| --- | --- | --- | --- | --- |
| `duyuru.ogretmen_kapsam` | Öğretmen duyuru kapsamı | Öğretmenin duyuru gönderebileceği en geniş kitle. | sinif | Duyurular |
| `duyuru.ogretmen_yazabilir` | Öğretmen duyuru yazabilir | Kapalıyken yalnız rehber ve yönetici duyuru yazar. | açık | Duyurular |
| `etut.talep_acik` | Öğretmen etüt talebi oluşturur | Kapalıyken etüt talebi formu görünmez ve veritabanı da reddeder. | açık | Etüt |
| `etut.yoklama_ogretmen` | Etüt öğretmeni yoklama girer | Kapalıyken etüt yoklamasını yalnız rehber/yönetici girer. | açık | Etüt |
| `galeri.ogretmen_album` | Öğretmen albüm açar | Galeri modülünde öğretmen albüm açabilir. | kapalı | Galeri |
| `galeri.ogretmen_kapsam` | Öğretmen albüm kapsamı | Öğretmen albümünün en geniş kitlesi. | sinif | Galeri |
| `galeri.ogretmen_yukleme` | Öğretmen fotoğraf/video yükler | Galeri albümlerine öğretmen yükleme yapabilir. | kapalı | Galeri |
| `odev.ogretmen_verebilir` | Öğretmen ödev verebilir | Kapalıyken öğretmenler ödev veremez; verilmiş ödevler görünür. | açık | Ödevler |
| `ogretmen.not_ekleme` | Branş öğretmeni not ekler | Kapalıyken yalnız rehber öğretmen ve yönetici not ekler. | açık | Öğrenci sayfası |
| `ogretmen.rapor_gorme` | Branş öğretmeni kendisine gönderilen raporu görür | Kapalıyken öğretmen raporları yalnız rehber/yöneticide görünür. | açık | Raporlar |
| `takvim.ogretmen_ekler` | Öğretmen takvime ekler | Öğretmen kendi sınıfı/öğrencisi için sınav ve etkinlik ekleyebilir. | açık | Takvim |
| `yoklama.ogretmen_girebilir` | Öğretmen yoklama girer | Açıkken öğretmenler kendi derslerinde yoklama girer. | kapalı | Yoklama |

## Analiz

| Anahtar | Ayar | Açıklama | Varsayılan | Etkilediği ekranlar |
| --- | --- | --- | --- | --- |
| `analiz.tekrar_esik` | Tekrar eden hata eşiği | Aynı konu en az bu kadar denemede yanlışsa "tekrar eden hata" sayılır. | 2 | Öğrenci sayfası, raporlar, Bugün |

## Deneme ve raporlar

| Anahtar | Ayar | Açıklama | Varsayılan | Etkilediği ekranlar |
| --- | --- | --- | --- | --- |
| `rapor.ai` | Yapay zekâ ile yaz | Kapalıyken veli raporunda "Yapay zekâ ile yaz" düğmesi görünmez; kural tabanlı taslak kalır. | açık | Veli raporu |
| `rapor.imza` | Rapor imza satırı | Doluysa rapor PDF'inin sonuna imza satırı eklenir (ör. "Rehber Öğretmen"). | — | Rapor PDF |
| `rapor.logo` | PDF'lerde okul logosu | Rapor, devamsızlık, liste, gözetmen ve etüt PDF'lerinin başlığında logo. | açık | PDF çıktıları |
| `rapor.ogretmen_alt_bilgi` | Öğretmen raporu alt bilgisi | Öğretmen raporunun en altındaki açıklama. | Kurum içi kullanım içindir. Veli ile paylaşılmaz. | Öğretmen raporu |
| `rapor.ogretmen_baslik` | Öğretmen raporu başlığı | Öğretmen raporu ekranı ve PDF başlığı. | Öğretmen Bilgilendirme Raporu | Öğretmen raporu |
| `rapor.veli_alt_bilgi` | Veli raporu alt bilgisi | Veli raporunun en altındaki açıklama. | Bu rapor öğrencinin yalnızca kendi önceki denemeleriyle karşılaştırılmasına dayanır. | Veli raporu |
| `rapor.veli_baslik` | Veli raporu başlığı | Veli raporu ekranı ve PDF başlığı. | Veli Gelişim Raporu | Veli raporu |

## Ödev

| Anahtar | Ayar | Açıklama | Varsayılan | Etkilediği ekranlar |
| --- | --- | --- | --- | --- |
| `odev.bildirim_kontrol` | Ödev kontrol bildirimi | Ödev kontrol edilince bildirim. | açık | Bildirimler |
| `odev.bildirim_yeni` | Yeni ödev bildirimi | Ödev verilince öğrenci ve veliye bildirim. | açık | Bildirimler |
| `odev.geciken_kirmizi` | Geciken ödev vurgusu | Geciken ödevler uyarı rengiyle gösterilir. | açık | Ödevler |
| `odev.hatirlatma_gun` | Ödev hatırlatma (gün) | Son tarihten kaç gün önce hatırlatılır (0 = hatırlatma yok). | 1 | Bildirimler |
| `odev.ogrenci_dosya` | Öğrenci dosya teslim eder |  | kapalı | Ödevler |
| `odev.ogretmen_dosya` | Öğretmen ödeve dosya ekler |  | açık | Ödevler |
| `odev.son_tarih_zorunlu` | Son tarih zorunlu | Ödev verirken son tarih istenir. | açık | Ödevler |
| `odev.veli_durum_gorur` | Veli ödev durumunu görür | Veli ödevin tamamlanma durumunu görür. | açık | Ödevler |

## Dosya ve duyuru

| Anahtar | Ayar | Açıklama | Varsayılan | Etkilediği ekranlar |
| --- | --- | --- | --- | --- |
| `dosya.gorsel` | Görsel yüklenebilir |  | açık | Dosya yüklemeleri |
| `dosya.max_mb` | En büyük dosya (MB) | Yüklenebilecek dosya boyutu sınırı. | 10 | Dosya yüklemeleri |
| `dosya.pdf` | PDF yüklenebilir |  | açık | Dosya yüklemeleri |
| `duyuru.dosya` | Duyuruya dosya eklenebilir |  | açık | Duyurular |
| `duyuru.gosterim_gun` | Duyuru gösterim süresi (gün) | Duyuru ana sayfada bu kadar gün görünür. | 14 | Duyurular, Ana sayfa |
| `mesaj.dosya` | Mesaja dosya eklenebilir |  | açık | İletişim |

## Galeri

| Anahtar | Ayar | Açıklama | Varsayılan | Etkilediği ekranlar |
| --- | --- | --- | --- | --- |
| `galeri.indirme` | Fotoğraf indirilebilir |  | kapalı | Galeri |
| `galeri.max_foto_mb` | En büyük fotoğraf (MB) |  | 15 | Galeri |
| `galeri.max_video_mb` | En büyük video (MB) |  | 50 | Galeri |
| `galeri.onay` | Öğretmen albümü onaylı yayın | Öğretmen albümleri yönetici onayından sonra görünür. | açık | Galeri |

## Yoklama

| Anahtar | Ayar | Açıklama | Varsayılan | Etkilediği ekranlar |
| --- | --- | --- | --- | --- |
| `yoklama.gec_sayim` | Geç kalma sayımı | Geç kalma devamsızlığa sayılmaz / yarım / tam gün sayılır. | yok | Yoklama, devamsızlık |
| `yoklama.limit_donem1` | 1. dönem sınırı (gün) |  | 10 | Devamsızlık |
| `yoklama.limit_donem2` | 2. dönem sınırı (gün) |  | 10 | Devamsızlık |
| `yoklama.limit_toplam` | Toplam sınır (gün, 0 = yok) |  | 0 | Devamsızlık |
| `yoklama.limit_yillik` | Yıllık sınır (gün) |  | 20 | Devamsızlık |
| `yoklama.uyari_sari` | Sarı uyarı (%) | Sınırın bu yüzdesine gelince sarı uyarı. | 70 | Devamsızlık |
| `yoklama.uyari_turuncu` | Turuncu uyarı (%) | Sınırın bu yüzdesine gelince turuncu uyarı. | 90 | Devamsızlık |
| `yoklama.veli_uyari` | Veliye devamsızlık uyarısı |  | açık | Devamsızlık |

## Takvim

| Anahtar | Ayar | Açıklama | Varsayılan | Etkilediği ekranlar |
| --- | --- | --- | --- | --- |
| `takvim.hatirlatma_gun` | Sınav hatırlatma (gün) | Sınavdan kaç gün önce hatırlatılır. | 1 | Takvim, bildirimler |

## Etüt

| Anahtar | Ayar | Açıklama | Varsayılan | Etkilediği ekranlar |
| --- | --- | --- | --- | --- |
| `etut.mesgul_etiketleri` | Meşgul hazır etiketleri | Virgülle ayrılmış (izinli, voleybol…). | İzinli,Sınav gözetmeni,Voleybol,Toplantı,Raporlu | Etüt |
| `etut.saatler_lise` | Lise etüt saatleri | 5 ders: SS:DD-SS:DD, virgülle ayrılır. | 09:20-10:00,10:10-10:50,11:00-11:40,11:50-12:30,12:40-13:20 | Etüt |
| `etut.saatler_ortaokul` | Ortaokul etüt saatleri | 5 ders: SS:DD-SS:DD, virgülle ayrılır. Yeni programın varsayılanı. | 09:00-09:40,09:50-10:30,10:40-11:20,11:30-12:10,12:20-13:00 | Etüt |
| `etut.salonlar` | Etüt salonları | Virgülle ayrılmış salon adları (hücre penceresinde öneri). | ETÜT-1,ETÜT-2,ETÜT-3,ETÜT-4,ETÜT-5,ETÜT-6 | Etüt |
| `etut.talep_son_gun` | Talep için en geç (gün önce) | İstenen Cumartesi'den en az kaç gün önce talep edilir (0 = sınır yok). | 0 | Etüt |

## Gözetmen

| Anahtar | Ayar | Açıklama | Varsayılan | Etkilediği ekranlar |
| --- | --- | --- | --- | --- |
| `gozetmen.ayt_baslangic` | AYT başlangıç saati |  | 10:00 | Gözetmen Bul |
| `gozetmen.ayt_dk` | AYT süresi (dk) |  | 180 | Gözetmen Bul |
| `gozetmen.dinlendirici_basina` | Kaç sınıfa bir dinlendirici | Akıllı dağıtımın varsayılanı (0 = dinlendirici yok). | 8 | Gözetmen Bul |
| `gozetmen.ortaokul_baslangic` | Ortaokul başlangıç saati |  | 09:30 | Gözetmen Bul |
| `gozetmen.ortaokul_mola_dk` | Ortaokul oturum arası (dk) |  | 30 | Gözetmen Bul |
| `gozetmen.ortaokul_sayisal_dk` | Ortaokul sayısal oturum (dk) |  | 80 | Gözetmen Bul |
| `gozetmen.ortaokul_sozel_dk` | Ortaokul sözel oturum (dk) |  | 75 | Gözetmen Bul |
| `gozetmen.tyt_baslangic` | TYT başlangıç saati |  | 10:15 | Gözetmen Bul |
| `gozetmen.tyt_dk` | TYT süresi (dk) |  | 165 | Gözetmen Bul |

## Bursluluk

| Anahtar | Ayar | Açıklama | Varsayılan | Etkilediği ekranlar |
| --- | --- | --- | --- | --- |
| `bursluluk.aciklama` | Başvuru formu açıklaması |  | — | Bursluluk |
| `bursluluk.basvuru_acik` | Başvuru formu açık |  | açık | Bursluluk |

## Ana sayfa

| Anahtar | Ayar | Açıklama | Varsayılan | Etkilediği ekranlar |
| --- | --- | --- | --- | --- |
| `panel.ogrenci` | Öğrenci ana sayfa düzeni | Kartların sırası ve görünürlüğü; Yönetim → Ana sayfa düzeni ekranından düzenlenir. | düzen | Ana sayfa |
| `panel.ogretmen` | Öğretmen ana sayfa düzeni | Kartların sırası ve görünürlüğü; Yönetim → Ana sayfa düzeni ekranından düzenlenir. | düzen | Ana sayfa |
| `panel.veli` | Veli ana sayfa düzeni | Kartların sırası ve görünürlüğü; Yönetim → Ana sayfa düzeni ekranından düzenlenir. | düzen | Ana sayfa |
| `panel.yonetim` | Yönetim ana sayfa düzeni | Kartların sırası ve görünürlüğü; Yönetim → Ana sayfa düzeni ekranından düzenlenir. | düzen | Ana sayfa |
