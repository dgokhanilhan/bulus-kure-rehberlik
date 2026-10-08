# Rol geçişi, takvim ve PDF hedefleri

Takvim ve duyurular seçili rol ve hesap kimliğiyle önbelleğe alınır. Öğretmen/veli hesabının veritabanı yetkileri rollerinin toplamıdır; veli ekranı ayrıca bağlı çocukların sınıfı, kademesi ve öğrenci hedefiyle daraltılır. Yükleme sırasında aile etkinlikleri varsayılan olarak gizlidir. Doğrudan etkinlik bağlantısı aynı kontrolden geçer. Veli modunda öğretmenin oluşturduğu kayıtlarda düzenleme/silme düğmeleri gösterilmez.

Galeri albümleri, son eklenenler ve doğrudan albüm bağlantıları da seçili aile rolünün çocuk kapsamıyla süzülür. İlgisiz albümün medyası yüklenmez; öğretmenlere özel veya taslak albümler veli ekranında açılmaz.

0038 yalnız onaylı öğretmenlerin kendi okulundaki tüm deneme etkinliklerini okumalarını sağlar. Deneme bildirimi alacak kişiler, diğer etkinlik yetkileri ve okullar arası sınır değişmez.

Deneme analizi başlangıçta kapalıdır. Açıldığında yanlış ve boş yapılan hedefler görünür; kutucuğun işareti kaldırılarak tüm ölçülen hedefler görülebilir. Grafik her denemeye yeterli yatay alan ayırır; uzun adlar kısaltılır, tam ad başlık ve erişilebilir düğme adında korunur.

Yönetim → Deneme Tanıma Merkezi → Öğrenme hedefleri ekranında yıl, sınıf ve ders seçilip PDF hedefleri filtrelenir. **Eksik PDF metinlerini kontrol et** mevcut filtredeki en çok 200 PDF kaydını seçilen yılda geçerli resmî MEB kataloğuyla karşılaştırır. Öneri ancak aynı ders, sınıf ve türdeki en az 12 karakterlik metin başlangıcı tek bir tam metinle eşleştiğinde çıkar. Sadece kod eşitliği yeterli değildir; belirsiz, çok kısa veya başka programa ait metinler değiştirilmez.

Yönetici eski/yeni metni ve resmî kaynak bağlantısını görerek seçtiği önerileri mevcut `update_pdf_outcome` işleviyle kaydeder. PDF hedef kimliği, yayıncı, kod, okul kaynağı etiketi ve soru bağlantıları korunur; kayıt resmî kataloğa dönüştürülmez. İşlem mevcut denetim günlüğüne kaydedilir. Her kayıt ayrı kaydedildiği için bir hata oluşursa başarıyla kaydedilenler listeden çıkar, kalanlar tekrar denenebilir. Kaynakta doğrulanamayan metinler elle düzenleme ekranında kalır.
