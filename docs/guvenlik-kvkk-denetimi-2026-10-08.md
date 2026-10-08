# Güvenlik ve KVKK denetimi — 8 Ekim 2026

Kapsam: kaynak kod, kimlik doğrulama, RLS ve RPC yetkileri, dosya erişimi, dış servisler, aydınlatma ve veli izinleri, yedekleme yapılandırması. Saldırı örnekleri yalnız yerel veritabanındaki uydurma öğrencilerle denendi. Canlı kontroller şema/yetki/ayar okumaları ve girişsiz erişim kontrolleriyle sınırlı tutuldu; gerçek öğrenci notları okunmadı. Bu çalışma geçmişte ihlal olmadığını kanıtlayan adli inceleme veya hukuki uygunluk sertifikası değildir.

## Düzeltilen bulgular

| Bulgu | Önlem |
| --- | --- |
| Doğrudan not RPC çağrısı, bazı görünürlüklerde görünümün yetki denetimini atlayabiliyordu | 0037: anonim erişim kaldırıldı; her not türünde öğrenci erişimi ve not görünürlüğü denetleniyor |
| İç bildirim yardımcıları API üzerinden kullanıcı kimlikleri döndürebiliyordu | 0037: anonim ve oturum açmış kullanıcıların RPC çalıştırma yetkileri kaldırıldı; tetikleyiciler çalışmayı sürdürüyor |
| Bazı personel politikalarında başka okul kayıtlarına karşı sınır eksikti | 0037: sınav soruları/sonuçları, görev, görüşme, rapor/alıcı, veli bağlantısı, kullanım ve denetim kayıtlarına kısıtlayıcı okul sınırı eklendi |
| İsim eşleştirme yapay zekâya öğrenci adları gönderebiliyordu | İstemci çağrısı kaldırıldı; eski Edge endpoint kapatıldı. İsim eşleştirme cihazda ve elle kontrolle yapılır |
| Şifre sıfırlama isteğinin bazı hataları başarı gibi gösteriliyordu | Hata ve hız sınırı doğru gösterilir; bekleyen istekte tekrar gönderim engellenir; süresi dolmuş bağlantı temizlenir |
| Kayıt ekranı, doğrulama kapalı olsa da doğrulama e-postası gönderildiğini söylüyordu | Mesaj gerçek Auth yanıtına göre gösterilir |
| Sunucu şifre sınırı 6, arayüz sınırı 8 karakterdi | Yalnız minimum şifre uzunluğunu 8 yapan ayrı canlı Auth yapılandırması hazırlandı |
| Hata izleme, serbest metin ve URL üzerinden kişisel bilgi taşıyabilirdi | Sentry kullanıcı/istek/serbest metin/breadcrumb bağlamı kaldırıldı; yalnız sınırlı teknik hata verisi kalır. Denetim sırasında canlı DSN etkin değildi |
| Yapay zekâ kota sorgusu hata verince devam edebiliyordu | Kota denetimi başarısızsa sağlayıcı çağrısı durdurulur |
| Aydınlatma, gerçek şirket bilgileri ve dış servis süreçleriyle tam örtüşmüyordu | Unvan/adres ve veri işleme açıklamaları güncellendi; aydınlatma ve isteğe bağlı izinler ayrıldı; doğrulanmamış hukuki güvence iddiaları çıkarıldı |

## Diğer kontroller

0037 yerelde uygulanıp test edildikten sonra kullanıcı onayıyla canlıya uygulandı. Canlıda altı iç RPC için anonim/kullanıcı çalıştırma yetkileri ve `note_body` anonim yetkisi kapalı doğrulandı. Ayrı Auth yapılandırması yalnız minimum şifre uzunluğunu 8'e yükseltti; ardından fark kontrolü sıfır güncelleme gösterdi. İsim eşleştirme ve veli raporu Edge servisleri güncellendi.

Doğrulama: typecheck ve üretim build başarılı; 347 birim/veritabanı testi geçti, iki test atlandı. Kapsamlı ekran koşusunda 126 test geçti, dört test atlandı; eski aydınlatma cümlesini bekleyen bir test durdu ve ona bağlı bir test çalışmadı. Beklenti güncellenince ilgili dosya, giriş/kayıt, davet, sıfırlama ve e-posta hata akışları birlikte yeniden çalıştırıldı: 21/21 başarılı. Atlanan özel PDF senaryoları bu doğrulama kapsamında değildir.

- Bağımlılık denetimi: `npm audit` bilinen açık bildirmedi. Bu, bilinmeyen açık bulunmadığı anlamına gelmez.
- Public şemasındaki tablolar RLS kullanıyor; ilgili görünümler çağıranın yetkisiyle çalışıyor.
- Girişsiz hassas tablo okumaları izin hatasıyla reddedildi.
- Galeri ve ek dosyalar özel depolamada; herkese açık okul kovası logo için kullanılıyor.
- Yönetici işlemleri rol ve ikinci adım doğrulamasıyla korunuyor.
- Canlı HTTP güvenlik başlıkları ve uygulama CSP kuralları kontrol edildi.
- Yerel şifre sıfırlama/davet bağlantıları gerçek yerel posta kutusu üzerinden denendi. Canlı SMTP teslimatı bu testin kapsamına girmiyor.

## Okulun tamamlaması gereken işlemler

1. **Yedekler:** GitHub haftalık yedek işleri gerekli secrets eksik olduğu için başarısız. Workflow açık hata verecek şekilde düzeltildi; bu tek başına çalışan yedek sağlamaz. `SUPABASE_DB_URL` ve `BACKUP_PASSPHRASE` GitHub Secrets üzerinden güvenli olarak yapılandırılmalı. Şifreli yedek alınması ve geri yükleme testi yapılmalı. SQL yedeği Storage görsellerini içermez; dosyalar için ayrıca yedek planı gerekir. Sağlayıcı yedek planı ayrıca doğrulanmalı.
2. **E-posta:** Canlı Auth e-posta doğrulaması kapalı. Okula ait kontrollü adresle özel SMTP ve teslimat doğrulanmadan doğrulama zorunluluğu açılmadı. Canlı şifre sıfırlama teslimatı da bu adresle kontrol edilmeli; başka kişilere test e-postası gönderilmedi.
3. **Yurt dışı aktarım:** Supabase barındırması ve diğer sağlayıcılar için gerçek sözleşmeler, işleyen/alıcı rolleri ve KVKK madde 9 mekanizması hukuk danışmanıyla tamamlanmalı. Üyelik veya genel fotoğraf izni düzenli aktarımı tek başına hukuka uygun hale getirmez. İsimleri çıkarmak öğrenci performans verisini hukuken otomatik anonim yapmaz.
4. **İzinler:** Velayet/yasal temsil doğrulaması, kapalı galeri/açık site/sosyal medya/basılı materyal izinleri ve geri çekmeler öğrenci bazında kaydedilmeli. Galeri kâğıt izin belgesini otomatik denetlemez; yükleme öncesi personel kontrolü gerekir. Taslak: [veli bilgilendirme ve izinler](veli-bilgilendirme-ve-izin-taslagi.md).
5. **Saklama/silme:** Gerçek eğitim, başvuru, galeri ve log süreçlerine göre süreler belirlenmeli; silme talepleri ve yedeklerden silinme süreci yazılmalı. Otomatik 30 günlük Storage temizliği varmış gibi kabul edilmemeli.
6. **Metin ve başvurular:** Mevcut `kurebulus74@gmail.com` iletişiminin okulun denetiminde olduğu teyit edilmeli. Yeni aydınlatma mevcut kullanıcılara da ulaştırılmalı; sürüm değişikliği tek başına eski kullanıcılara teslim kanıtı oluşturmaz. VERBİS yükümlülüğü okulun mali/çalışan bilgileri ve faaliyetlerine göre değerlendirilmelidir.
7. **Özel nitelikli veriler:** Sağlık ve psikolojik tanı gibi bilgiler genel öğretmen notuna yazılmamalı; gerekiyorsa ayrı hukuki dayanak, yetki ve süreç kurulmalı.

Hukuki metinler okulun fiili süreçleriyle son kez hukuk danışmanı tarafından kontrol edilmelidir. Tüm risklerin kapandığı iddia edilmemektedir.

## Resmî kaynaklar

- [KVKK: aydınlatma ve açık rızanın ayrı düzenlenmesi, 2026/347](https://www.kvkk.gov.tr/Icerik/8710/veri-sorumlulari-tarafindan-acik-riza-ve-aydinlatma-metinlerinin-ayri-ayri-duzenlenmesi-gerektigi-hakkinda-kisisel-verileri-koruma-kurulunun-18-02-2026-tarihli-ve-2026-347-sayili-ilke-kararina-iliskin-kamuoyu-duyurusu)
- [KVKK: yurt dışına aktarım](https://www.kvkk.gov.tr/Icerik/2053/Yurtdisina-Aktarim)
- [KVKK: okul fotoğrafları, 2021/572](https://www.kvkk.gov.tr/Icerik/7118/2021-572)
