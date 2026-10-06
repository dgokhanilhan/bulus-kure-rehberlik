import { Link } from 'react-router-dom'
import { KVKK_VERSION } from '@/lib/kvkk'

/** Aydınlatma metni sürümü, üyelik ve ilk giriş teyidiyle birlikte kaydedilir. */
export default function KvkkPage() {
  return (
    <main className="view" style={{ maxWidth: 760, margin: '0 auto', width: '100%' }}>
      <article className="card a" style={{ padding: 28, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <span className="label">Sürüm {KVKK_VERSION}</span>
        <h1 className="hd">Kişisel Verilerin Korunması Hakkında Aydınlatma Metni</h1>
        <p>Bu metin, Buluş Küre Koleji tarafından Rehberlik &amp; Mentörlük uygulamasında işlenen kişisel veriler hakkında 6698 sayılı Kişisel Verilerin Korunması Kanunu kapsamında bilgilendirme amacıyla hazırlanmıştır.</p>
        <h2 className="sec">İşlenen Veriler</h2>
        <p>Uygulamaya üyelik ve kullanım kapsamında temel olarak ad, soyad ve e-posta adresi işlenmektedir. Telefon numarası zorunlu değildir ve mevcut üyelik sürecinde talep edilmemektedir.</p>
        <p>Öğrenci hesapları, okul tarafından oluşturulmuş ilgili öğrenci profiliyle eşleştirilebilir. Bu kapsamda öğrencinin deneme ve sınav sonuçları, doğru, yanlış, boş, net ve puan bilgileri ile ders, konu ve kazanım bazlı akademik analizleri uygulamada işlenebilir ve yetkili kullanıcılara gösterilebilir.</p>
        <p>Ayrıca sistemin güvenliği ve çalışması için kullanıcı kimliği, giriş/oturum ve gerekli teknik işlem kayıtları tutulabilir.</p>
        <h2 className="sec">Amaç</h2>
        <p>Kişisel veriler; kullanıcı hesabının oluşturulması ve güvenliğinin sağlanması, öğrenci hesabının doğru öğrenci profiliyle eşleştirilmesi, öğrencinin akademik gelişiminin izlenmesi, deneme ve sınav sonuçlarının analiz edilmesi, öğrenci ve velinin akademik gelişim hakkında bilgilendirilmesi ve uygulamanın güvenli şekilde işletilmesi amaçlarıyla işlenmektedir.</p>
        <h2 className="sec">Veri Minimizasyonu</h2>
        <p>Uygulamada hizmetin sunulması için gerekli olmayan kişisel verilerin toplanmaması esastır. Üyelik sırasında T.C. kimlik numarası, açık adres, doğum tarihi veya zorunlu telefon numarası talep edilmez.</p>
        <h2 className="sec">Aktarım ve Teknik Hizmetler</h2>
        <p>Uygulamanın veritabanı, kimlik doğrulama ve ilgili teknik altyapısında kullanılan hizmetler kapsamında veriler yurt dışında bulunan sunucularda işlenebilir. Ana veritabanı altyapısı Avrupa Birliği içerisinde, Frankfurt/Almanya bölgesinde barındırılmaktadır.</p>
        <p>Yurt dışına kişisel veri aktarımının söz konusu olduğu işlemlerde 6698 sayılı Kanun’un 9. maddesinde öngörülen şart ve uygun güvenceler uygulanır.</p>
        <p>Yapay zekâ destekli özelliklerin kullanılması halinde ad, soyad, e-posta adresi ve kişiyi doğrudan tanımlayan diğer bilgiler yapay zekâ hizmetine gönderilmez. Yapay zekâya yalnız ilgili özelliğin çalışması için gerekli, mümkün olduğunca kimlikten arındırılmış akademik/sayısal verilerin gönderilmesi esastır.</p>
        <h2 className="sec">Güvenlik</h2>
        <p>Kişisel verilere erişim kullanıcı rolü ve yetkisine göre sınırlandırılır. Öğrenci verileri yalnız ilgili öğrenci, yetkilendirilmiş veli ve görev kapsamında yetkili okul personeli tarafından görüntülenebilir. Yetkisiz erişimin önlenmesi amacıyla teknik ve idari güvenlik tedbirleri uygulanır.</p>
        <h2 className="sec">Saklama ve Silme</h2>
        <p>Kişisel veriler yalnız işleme amacı ve ilgili mevzuatın gerektirdiği süre boyunca saklanır. Saklanmasını gerektiren hukuki bir sebep kalmadığında silinir, yok edilir veya anonim hâle getirilir.</p>
        <h2 className="sec">Yeni Özellikler</h2>
        <p>Uygulamaya ileride yeni özellikler eklenebilir. Yeni bir özelliğin mevcut kapsam dışında kişisel veri işlenmesini gerektirmesi halinde kullanıcılar önceden bilgilendirilir; mevzuat gerektiriyorsa ilgili işlem için ayrıca açık rıza alınır.</p>
        <h2 className="sec">Haklarınız</h2>
        <p>KVKK’nın 11. maddesi kapsamındaki kişisel verilerinize ilişkin bilgi alma, düzeltme, silme ve diğer haklarınıza yönelik başvurularınızı <a href="mailto:kurebulus74@gmail.com">kurebulus74@gmail.com</a> üzerinden Buluş Küre Koleji’ne iletebilirsiniz.</p>
        <p className="m" style={{ fontSize: 13 }}>Son güncelleme: 06.10.2026 • Metin sürümü: {KVKK_VERSION}</p>
        <Link className="btn" to="/" style={{ alignSelf: 'flex-start' }}>Geri dön</Link>
      </article>
    </main>
  )
}
