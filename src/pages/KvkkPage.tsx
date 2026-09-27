import { Link } from 'react-router-dom'
import { KVKK_VERSION } from '@/lib/kvkk'

/**
 * KVKK aydınlatma metni. TASLAK: okulun hukukçusu tarafından tamamlanmalı ve onaylandıkça
 * src/lib/kvkk.ts içindeki sürüm artırılmalıdır (yeni sürüm kayıtta yeniden onay ister).
 */
export default function KvkkPage() {
  return (
    <main className="view" style={{ maxWidth: 760, margin: '0 auto', width: '100%' }}>
      <article className="card a" style={{ padding: 28, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <span className="label">Sürüm {KVKK_VERSION}</span>
        <h1 className="hd">Kişisel verilerin korunması hakkında aydınlatma metni</h1>
        <p>
          Bu metin, Buluş Küre Koleji (veri sorumlusu) tarafından Rehberlik &amp; Mentörlük uygulamasında işlenen kişisel veriler hakkında 6698 sayılı Kişisel Verilerin
          Korunması Kanunu kapsamında bilgilendirme amacıyla hazırlanmıştır.
        </p>
        <h2 className="sec">İşlenen veriler</h2>
        <p>Öğrenci adı, şubesi, okul numarası; deneme sonuçları (doğru, yanlış, boş, net, puan); görevler, görüşmeler, öğretmen notları; veli ve öğretmen iletişim bilgileri.</p>
        <h2 className="sec">Amaç</h2>
        <p>Öğrencinin akademik gelişimini izlemek, rehberlik ve mentörlük hizmeti sunmak, veliyi bilgilendirmek.</p>
        <h2 className="sec">Aktarım</h2>
        <p>
          Veriler Avrupa Birliği'ndeki sunucularda (Supabase, Frankfurt) saklanır. Rapor metni yazımında kullanılan yapay zekâ hizmetine öğrencinin adı, okul bilgisi ve
          öğretmen notları gönderilmez; yalnız anonim sayısal sonuçlar ve konu adları gönderilir.
        </p>
        <h2 className="sec">Haklarınız</h2>
        <p>KVKK'nın 11. maddesi kapsamındaki başvurularınızı okul rehberlik servisine iletebilirsiniz.</p>
        <p className="m" style={{ fontSize: 13 }}>
          Taslak metindir; okulun hukukçusu tarafından tamamlanacaktır.
        </p>
        <Link className="btn" to="/" style={{ alignSelf: 'flex-start' }}>
          Geri dön
        </Link>
      </article>
    </main>
  )
}
