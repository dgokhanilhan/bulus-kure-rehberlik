import { Link } from 'react-router-dom'
import { KVKK_VERSION } from '@/lib/kvkk'

/** Aydınlatma metni sürümü, üyelik ve ilk giriş teyidiyle birlikte kaydedilir. */
export default function KvkkPage() {
  return (
    <main className="view" style={{ maxWidth: 760, margin: '0 auto', width: '100%' }}>
      <article className="card a" style={{ padding: 28, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <span className="label">Sürüm {KVKK_VERSION}</span>
        <h1 className="hd">Kişisel Verilerin Korunması Hakkında Aydınlatma Metni</h1>
        <p>Bu metin, Buluş Küre Koleji’nin veri sorumlusu BARTIN BULUŞ EĞİTİM ÖĞRETİM GIDA İNŞAAT TURİZM TARIM HAYVANCILIK SANAYİ VE TİCARET LİMİTED ŞİRKETİ tarafından Rehberlik &amp; Mentörlük uygulamasında işlenen kişisel veriler hakkında 6698 sayılı Kişisel Verilerin Korunması Kanunu kapsamında bilgilendirme amacıyla hazırlanmıştır.</p>
        <p>Veri sorumlusu adresi: MERKEZ MEVKİİ MERKEZZ KÜME EVLER BULUŞ EĞİTİM NO: 2/1 İÇ KAPI NO: 1 TUZCULAR KÖYÜ MERKEZ/BARTIN.</p>
        <h2 className="sec">İşlenen Veriler ve Toplama Yöntemleri</h2>
        <p>Uygulamaya üyelik ve kullanım kapsamında temel olarak ad, soyad ve e-posta adresi işlenmektedir. Telefon numarası zorunlu değildir ve mevcut üyelik sürecinde talep edilmemektedir.</p>
        <p>Öğrenci hesapları, okul tarafından oluşturulmuş ilgili öğrenci profiliyle eşleştirilebilir. Bu kapsamda öğrencinin deneme ve sınav sonuçları, doğru, yanlış, boş, net ve puan bilgileri ile ders, konu ve kazanım bazlı akademik analizleri uygulamada işlenebilir ve yetkili kullanıcılara gösterilebilir.</p>
        <p>Hesap ve öğrenci bilgileri kayıt formları, okulun yetkili personeli, sınav dosyaları ve uygulamadaki işlemler yoluyla elektronik ortamda toplanır. Kullanılan özelliklere göre sınıf, okul numarası, veli-öğrenci ilişkisi, ödev ve görev ilerlemesi, devamsızlık, görüşme, öğretmen notu, mesaj, bildirim ve rapor bilgileri işlenir. Galeri ve dosya yüklemelerinde fotoğraf, video ve dosya içerikleri de işlenebilir. Bursluluk başvurusunda öğrenci ve veli adı, sınıf, mevcut okul ve iletişim telefonu alınır.</p>
        <p>Ayrıca sistemin güvenliği ve çalışması için kullanıcı kimliği, giriş/oturum ve gerekli teknik işlem kayıtları tutulabilir.</p>
        <h2 className="sec">Amaç</h2>
        <p>Kişisel veriler; kullanıcı hesabının oluşturulması ve güvenliğinin sağlanması, öğrenci hesabının doğru öğrenci profiliyle eşleştirilmesi, öğrencinin akademik gelişiminin izlenmesi, deneme ve sınav sonuçlarının analiz edilmesi, öğrenci ve velinin akademik gelişim hakkında bilgilendirilmesi ve uygulamanın güvenli şekilde işletilmesi amaçlarıyla işlenmektedir.</p>
        <h2 className="sec">Hukuki Sebepler ve İsteğe Bağlı İşlemler</h2>
        <p>Eğitim hizmeti kapsamında gerekli hesap, iletişim ve akademik takip işlemleri, sözleşmenin kurulması veya ifası için gerekli olması halinde Kanun’un 5/2(c) maddesine; mevzuattan doğan kayıt yükümlülükleri 5/2(ç) maddesine dayanır. Hakların tesisi, kullanılması veya korunması için gerekli kayıtlar 5/2(e), temel hak ve özgürlüklerinize zarar vermemek kaydıyla sistem güvenliği için gerekli teknik kayıtlar 5/2(f) kapsamında değerlendirilir.</p>
        <p>Bu aydınlatma metninin okunduğunun belirtilmesi açık rıza değildir. Üyelik ve eğitim hizmeti, isteğe bağlı fotoğraf-video yayın iznine bağlanmaz. Açık rıza gerektiren fotoğraf-video kullanımları için okul içi kapalı galeri, herkese açık internet sitesi, sosyal medya ve basılı tanıtım gibi kullanım alanları ayrı ayrı açıklanır ve ayrı seçim sunulur. İzin verilmeyen içerikler bu alanlarda paylaşılmaz. Çocuklar bakımından yetkili veli veya yasal temsilci doğrulaması yapılır. İsteğe bağlı rızanın geri alınması sonraki kullanımlar için okul tarafından değerlendirilir.</p>
        <h2 className="sec">Veri Minimizasyonu</h2>
        <p>Uygulamada hizmetin sunulması için gerekli olmayan kişisel verilerin toplanmaması esastır. Üyelik sırasında T.C. kimlik numarası, açık adres, doğum tarihi veya zorunlu telefon numarası talep edilmez.</p>
        <h2 className="sec">Aktarım ve Teknik Hizmetler</h2>
        <p>Uygulamanın veritabanı, kimlik doğrulama ve ilgili teknik altyapısında kullanılan hizmetler kapsamında veriler yurt dışında bulunan sunucularda işlenebilir. Ana veritabanı altyapısı Avrupa Birliği içerisinde, Frankfurt/Almanya bölgesinde barındırılmaktadır.</p>
        <p>Teknik hizmet sağlayıcıları Supabase (veritabanı, kimlik doğrulama, dosya depolama) ve Cloudflare (internet sitesi sunumu ve güvenliği) olup, yapılandırılmışsa Sentry hata izleme için kullanılır. Yetkili okul personeli, ilgili öğrenci ve doğrulanmış veliye görev ve ilişki kapsamındaki bilgiler gösterilir; kanuni yükümlülük halinde yetkili kamu kurumlarına aktarım yapılabilir. Yurt dışı hizmet kullanımı Kanun’un 9. maddesindeki aktarım şartlarına tabidir. Sunucunun Avrupa Birliği’nde olması veya üyelik belgesinin imzalanması bu şartları tek başına karşılamaz. Uygulanacak aktarım mekanizması ve sağlayıcı güvenceleri hakkında veri sorumlusuna başvurabilirsiniz.</p>
        <p>Öğrenci isimlerini düzeltme ve eşleştirme cihazda yapılır; isim listeleri dış yapay zekâ sağlayıcısına gönderilmez. Yapay zekâ destekli veli raporu taslağı için DeepSeek’e doğrudan kimlik bilgileri içermeyen sınırlı akademik veriler gönderilir. Kimlik bilgilerini çıkarmak, verinin her durumda anonim olduğu anlamına gelmez; bu kullanımda da gerekli aktarım şartlarının sağlanması veri sorumlusunun yükümlülüğündedir. Taslaklar yetkili personelin kontrolünden sonra paylaşılır.</p>
        <h2 className="sec">Güvenlik</h2>
        <p>Kişisel verilere erişim kullanıcı rolü ve yetkisine göre sınırlandırılır. Öğrenci verileri yalnız ilgili öğrenci, yetkilendirilmiş veli ve görev kapsamında yetkili okul personeli tarafından görüntülenebilir. Yetkisiz erişimin önlenmesi amacıyla teknik ve idari güvenlik tedbirleri uygulanır.</p>
        <h2 className="sec">Saklama ve Silme</h2>
        <p>Kişisel veriler yalnız işleme amacı ve ilgili mevzuatın gerektirdiği süre boyunca saklanır. Saklanmasını gerektiren hukuki bir sebep kalmadığında silinir, yok edilir veya anonim hâle getirilir.</p>
        <h2 className="sec">Yeni Özellikler</h2>
        <p>Uygulamaya ileride yeni özellikler eklenebilir. Yeni bir özelliğin mevcut kapsam dışında kişisel veri işlenmesini gerektirmesi halinde kullanıcılar önceden bilgilendirilir; mevzuat gerektiriyorsa ilgili işlem için ayrıca açık rıza alınır.</p>
        <h2 className="sec">Haklarınız</h2>
        <p>KVKK’nın 11. maddesi kapsamındaki kişisel verilerinize ilişkin bilgi alma, düzeltme, silme ve diğer haklarınıza yönelik başvurularınızı <a href="mailto:kurebulus74@gmail.com">kurebulus74@gmail.com</a> üzerinden veya veri sorumlusunun yukarıdaki adresine, Veri Sorumlusuna Başvuru Usul ve Esasları Hakkında Tebliğ’deki usullere uygun şekilde iletebilirsiniz. E-posta başvurusunda daha önce okulumuza bildirdiğiniz ve sistemimizde kayıtlı adresinizi kullanın. Kimlik doğrulama ve başvuru için gerekli bilgiler talep edilebilir. Başvurular en geç otuz gün içinde sonuçlandırılır.</p>
        <p className="m" style={{ fontSize: 13 }}>Son güncelleme: 08.10.2026 • Metin sürümü: {KVKK_VERSION}</p>
        <Link className="btn" to="/" style={{ alignSelf: 'flex-start' }}>Geri dön</Link>
      </article>
    </main>
  )
}
