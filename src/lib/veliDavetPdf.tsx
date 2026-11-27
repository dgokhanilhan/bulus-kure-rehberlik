// Veli davet kartları (A4, sayfada 8 kart: 2 sütun × 4 satır, kesik çizgiyle). Kart çocukla eve gider.
// Karekod velinin kayıt sayfasını açar; altında elle yazılabilecek kod. Teknik terim yok.
import { Document, Font, Image, Page, Path, Svg, Text, View, pdf } from '@react-pdf/renderer'
import qrcode from 'qrcode-generator'
import logo from '@/assets/okul-logo.jpg?url'
import regular from '@ibm/plex-sans/fonts/complete/woff/IBMPlexSans-Regular.woff?url'
import semi from '@ibm/plex-sans/fonts/complete/woff/IBMPlexSans-SemiBold.woff?url'
import { kodBicim, sonTarih } from './veliDavetMetin'

Font.register({ family: 'DavetPlex', fonts: [{ src: regular }, { src: semi, fontWeight: 600 }] })

export interface DavetKarti {
  ad: string
  sinif: string
  kod: string
  adres: string
  son: string
}

const INK = '#1b2a2f'
const MUT = '#56636a'
const PRI = '#1f5f5b'
const CIZ = '#b9b2a2'

function Karekod({ url, size }: { url: string; size: number }) {
  const q = qrcode(0, 'M')
  q.addData(url)
  q.make()
  const n = q.getModuleCount()
  let d = ''
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += `M${c} ${r}h1v1h-1z`
  return (
    <Svg width={size} height={size} viewBox={`-1 -1 ${n + 2} ${n + 2}`}>
      <Path d={d} fill={INK} />
    </Svg>
  )
}

function Kart({ k, okul, logoVar }: { k: DavetKarti; okul: string; logoVar: boolean }) {
  return (
    <View style={{ width: '50%', height: '25%', padding: 6 }} wrap={false}>
      <View style={{ flex: 1, borderWidth: 1, borderStyle: 'dashed', borderColor: CIZ, borderRadius: 8, padding: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
          {logoVar && <Image src={logo} style={{ width: 26, height: 26, borderRadius: 13, marginRight: 7 }} />}
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 12, fontWeight: 600, color: INK }}>Sayın Veli</Text>
            <Text style={{ fontSize: 7.5, color: MUT }}>{okul} · ödev, deneme ve duyurular tek yerde</Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', flex: 1 }}>
          <Karekod url={k.adres} size={86} />
          <View style={{ flex: 1, marginLeft: 9 }}>
            <Text style={{ fontSize: 9.5, fontWeight: 600, color: INK, marginBottom: 3 }}>
              {k.ad} · {k.sinif}
            </Text>
            <Text style={{ fontSize: 7.8, color: INK, marginBottom: 1.5 }}>1. Telefonunuzun kamerasıyla kodu okutun</Text>
            <Text style={{ fontSize: 7.8, color: INK, marginBottom: 1.5 }}>2. E-posta ve şifrenizi belirleyin</Text>
            <Text style={{ fontSize: 7.8, color: INK, marginBottom: 4 }}>3. Okul onaylayınca hesabınız çocuğunuza bağlı açılır</Text>
            <Text style={{ fontSize: 10, fontWeight: 600, color: PRI, letterSpacing: 1 }}>{kodBicim(k.kod)}</Text>
          </View>
        </View>
        <Text style={{ fontSize: 6.8, color: MUT, marginTop: 4 }}>
          Kod {sonTarih(k.son)} tarihine kadar geçerli; anne ve baba için 2 kez kullanılabilir. Kodu okutamazsanız {k.adres.replace(/^https?:\/\//, '').replace(/\/v\/.*$/, '/v')} adresine yazın.
        </Text>
      </View>
    </View>
  )
}

export async function veliDavetPdf(o: { okul: string; logo: boolean; kartlar: DavetKarti[] }): Promise<Blob> {
  const sayfalar: DavetKarti[][] = []
  for (let i = 0; i < o.kartlar.length; i += 8) sayfalar.push(o.kartlar.slice(i, i + 8))
  return pdf(
    <Document title="Veli davet kartları" author={o.okul}>
      {sayfalar.map((s, i) => (
        <Page key={i} size="A4" style={{ fontFamily: 'DavetPlex', padding: 18, flexDirection: 'row', flexWrap: 'wrap' }}>
          {s.map((k) => (
            <Kart key={k.kod} k={k} okul={o.okul} logoVar={o.logo} />
          ))}
        </Page>
      ))}
    </Document>,
  ).toBlob()
}
