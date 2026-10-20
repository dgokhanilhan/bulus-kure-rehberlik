import { Link } from 'react-router-dom'
import { ACIK_RIZA_VERSION } from '@/lib/kvkk'

/** Açık rıza metni: aydınlatma metninden ayrı (KVKK Kurulu 2026/347). Onay sürümü kayıtta / ilk girişte saklanır (0057). */
export default function AcikRizaPage() {
  return (
    <main className="view" style={{ maxWidth: 760, margin: '0 auto', width: '100%' }}>
      <article className="card a" style={{ padding: 28, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <span className="label">Sürüm {ACIK_RIZA_VERSION}</span>
        <h1 className="hd">Açık Rıza Metni</h1>
        <p>
          Veri sorumlusu BARTIN BULUŞ EĞİTİM ÖĞRETİM GIDA İNŞAAT TURİZM TARIM HAYVANCILIK SANAYİ VE TİCARET LİMİTED ŞİRKETİ (Buluş Küre Koleji), Rehberlik &amp; Mentörlük
          uygulamasında kişisel verilerinizi <Link to="/kvkk">Kişisel Verilerin Korunması Hakkında Aydınlatma Metni</Link>’nde açıklandığı şekilde işler. Aşağıdaki
          işlemler 6698 sayılı Kişisel Verilerin Korunması Kanunu kapsamında açık rızanıza dayanır. Bu metni onaylayarak, aşağıda sayılan işlemlere kendi adınıza ve
          velisi ya da yasal temsilcisi olduğunuz öğrenci adına özgür iradenizle açık rıza verirsiniz.
        </p>

        <h2 className="sec">1. Rehberlik görüşme notları</h2>
        <p>
          Rehberlik ve mentörlük hizmeti kapsamında öğrenci ve veliyle yapılan görüşmelere ilişkin notlar, gerektiğinde öğrencinin sağlığına veya psikolojik durumuna
          ilişkin özel nitelikli bilgiler de içerebilecek şekilde, yetkili rehber öğretmen tarafından kaydedilebilir. Bu notlar yalnız görevi gereği yetkili okul
          personelince görülebilir, dış hizmetlere ve yapay zekâya gönderilmez.
        </p>

        <h2 className="sec">2. Yapay zekâ destekli rapor taslakları</h2>
        <p>
          Öğrencinin gelişimini anlatan veli raporu taslağının hazırlanması amacıyla, öğrencinin deneme sonuçları ve konu analizlerinden oluşan sınırlı akademik veriler
          <b> DeepSeek</b> yapay zekâ hizmetine (sunucuları Çin Halk Cumhuriyeti’ndedir) aktarılabilir. Bu aktarımda öğrencinin adı, soyadı, okul adı, okul numarası,
          öğretmen ve veli adları ile rehberlik notları gönderilmez; öğrenci “Öğrenci” olarak anılır. Taslaklar yetkili öğretmen kontrol edip onaylamadan veliye iletilmez.
        </p>

        <h2 className="sec">3. Kişisel verilerin aktarımı</h2>
        <p>
          Uygulamanın teknik altyapısı nedeniyle; ad, soyad, e-posta adresi, kullanıcı ve oturum bilgileri ile öğrenciye ait sınıf, okul numarası, deneme ve sınav
          sonuçları, konu ve kazanım analizleri, ödev, görev, devamsızlık, görüşme, not, mesaj ve rapor bilgileri aşağıdaki hizmet sağlayıcıların yurt dışındaki
          sunucularında saklanabilir ve işlenebilir:
        </p>
        <ul>
          <li>
            <b>Supabase</b> (veritabanı, kimlik doğrulama ve dosya depolama): sunucular Avrupa Birliği içinde, Frankfurt/Almanya bölgesindedir.
          </li>
          <li>
            <b>Cloudflare</b> (internet sitesinin sunulması ve güvenliği): küresel sunucu ağı; uygulamaya erişim sırasında bağlantı ve teknik bilgiler işlenir.
          </li>
          <li>
            <b>Sentry</b> (yapılandırılmışsa, uygulama hatalarının izlenmesi): hata kayıtlarındaki teknik bilgiler işlenir; kişisel veriler hata kaydından mümkün olduğunca çıkarılır.
          </li>
        </ul>

        <h2 className="sec">Kapsam dışı: fotoğraf ve video</h2>
        <p>
          Öğrenci fotoğraf ve videolarının okul içi galeri, internet sitesi, sosyal medya veya basılı tanıtımda kullanılması bu metnin kapsamında değildir; okul
          tarafından ayrıca ve isteğe bağlı olarak sorulur. Üyelik buna bağlı değildir.
        </p>

        <h2 className="sec">Rızanın geri alınması</h2>
        <p>
          Açık rızanızı dilediğiniz zaman <a href="mailto:kurebulus74@gmail.com">kurebulus74@gmail.com</a> adresine ya da veri sorumlusunun adresine başvurarak geri
          alabilirsiniz. Geri alma, o tarihe kadar yapılan işlemleri etkilemez. Uygulamanın altyapısı yurt dışındaki sunuculara dayandığından, 3. maddedeki rızanın geri
          alınması halinde uygulama üyeliği sürdürülemeyebilir; okulun diğer bilgilendirme kanalları kullanılmaya devam eder. 2. maddedeki rızanın geri alınması halinde
          raporlar yapay zekâ kullanılmadan hazırlanır.
        </p>

        <p className="m" style={{ fontSize: 13 }}>Son güncelleme: 20.10.2026 • Metin sürümü: {ACIK_RIZA_VERSION}</p>
        <Link className="btn" to="/" style={{ alignSelf: 'flex-start' }}>
          Geri dön
        </Link>
      </article>
    </main>
  )
}
