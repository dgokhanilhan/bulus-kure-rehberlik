// Görev takip formu (A4 dikey): her öğrenci ayrı sayfa. Sistemde girilmiş kontroller yazılı gelir, boşlar elle doldurulacak kutudur.
// Alttaki karekod öğrencinin hızlı giriş ekranını açar. Teknik terim yok; sınıf sıralaması yok.
import { Document, Font, Image, Page, Path, Svg, Text, View, pdf } from '@react-pdf/renderer'
import qrcode from 'qrcode-generator'
import logo from '@/assets/okul-logo.jpg?url'
import regular from '@ibm/plex-sans/fonts/complete/woff/IBMPlexSans-Regular.woff?url'
import semi from '@ibm/plex-sans/fonts/complete/woff/IBMPlexSans-SemiBold.woff?url'
import type { TakipDurum } from './gorevTakip'

Font.register({ family: 'TakipPlex', fonts: [{ src: regular }, { src: semi, fontWeight: 600 }] })

export interface FormKontrol {
  /** Sistemde girilmişse */
  dolu: { tarih: string; cozulen: number; geride: number } | null
  oneri: string
  beklenen: number
}
export interface FormSatir {
  ders: string
  konu: string
  soru: number
  sonGun: string
  kontroller: [FormKontrol, FormKontrol, FormKontrol]
  durum: TakipDurum
  etki: string
}
export interface FormOgrenci {
  ad: string
  sinif: string
  no: string | null
  url: string
  donem: string
  satirlar: FormSatir[]
  cozulen: number
  toplam: number
  biten: number
}
export interface FormBelge {
  okul: string
  hazirlayan: string
  basim: string
  formNo: string
  logo: boolean
  ogrenciler: FormOgrenci[]
}

const INK = '#1b2a2f'
const MUT = '#5d6b70'
const CIZ = '#9aa6a9'
const PRI = '#0f6e56'
const ZEMIN = '#e8efed'

function Karekod({ url, size }: { url: string; size: number }) {
  const q = qrcode(0, 'M')
  q.addData(url)
  q.make()
  const n = q.getModuleCount()
  let d = ''
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += `M${c} ${r}h1v1h-1z`
  return (
    <Svg width={size} height={size} viewBox={`-2 -2 ${n + 4} ${n + 4}`}>
      <Path d={d} fill={INK} />
    </Svg>
  )
}

const KOL = [4, 25, 6, 8, 13, 13, 13, 9, 9] // %: #, görev, soru, son gün, 3 kontrol, durum, konu denemede
const hucre = (i: number, ek: object = {}) => ({ width: `${KOL[i]}%`, padding: 4, borderRightWidth: i < KOL.length - 1 ? 0.6 : 0, borderColor: CIZ, ...ek })

function Kutu({ dolu }: { dolu: boolean }) {
  return (
    <View style={{ width: 7, height: 7, borderWidth: 0.7, borderColor: INK, marginRight: 3, justifyContent: 'center', alignItems: 'center' }}>
      {dolu && <View style={{ width: 4, height: 4, backgroundColor: INK }} />}
    </View>
  )
}

function KontrolHucre({ k, soru }: { k: FormKontrol; soru: number }) {
  if (k.dolu)
    return (
      <View>
        <Text style={{ color: PRI, fontWeight: 600 }}>{k.dolu.tarih}</Text>
        <Text style={{ color: PRI, fontWeight: 600, fontSize: 10 }}>
          {k.dolu.cozulen} / {soru}
        </Text>
        <Text style={{ fontSize: 6.5, color: MUT }}>{k.dolu.geride > 0 ? `${k.dolu.geride} soru geride` : 'yolunda'}</Text>
      </View>
    )
  return (
    <View>
      <Text style={{ color: MUT }}>__ . __</Text>
      <Text style={{ fontSize: 10, color: MUT }}>____ / {soru}</Text>
      <Text style={{ fontSize: 6.5, color: MUT }}>
        öneri {k.oneri}
        {'\n'}beklenen {k.beklenen}
      </Text>
    </View>
  )
}

function OgrenciSayfasi({ b, o }: { b: FormBelge; o: FormOgrenci }) {
  return (
    <Page size="A4" style={{ padding: 30, paddingBottom: 48, fontFamily: 'TakipPlex', fontSize: 8, color: INK }}>
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          borderBottomWidth: 1.2,
          borderColor: '#1f5f5b',
          paddingBottom: 8,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          {b.logo && <Image src={logo} style={{ width: 30, height: 30, marginRight: 8 }} />}
          <View>
            <Text style={{ fontSize: 13, fontWeight: 600 }}>{b.okul}</Text>
            <Text style={{ color: MUT }}>Rehberlik ve Mentörlük · Görev takip formu</Text>
          </View>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={{ color: MUT }}>Basım: {b.basim}</Text>
          <Text style={{ color: MUT }}>Form no: {b.formNo}</Text>
        </View>
      </View>

      <View style={{ flexDirection: 'row', marginTop: 8 }}>
        {[
          ['Öğrenci', o.ad],
          ['Sınıf · No', `${o.sinif}${o.no ? ` · ${o.no}` : ''}`],
          ['Hazırlayan', b.hazirlayan],
          ['Dönem', o.donem],
        ].map(([a, v]) => (
          <View key={a} style={{ width: '25%', paddingRight: 6 }}>
            <Text style={{ color: MUT, fontSize: 7 }}>{a}</Text>
            <Text style={{ fontSize: 9.5, fontWeight: a === 'Öğrenci' ? 600 : 400 }}>{v}</Text>
          </View>
        ))}
      </View>
      <View style={{ flexDirection: 'row', marginTop: 6, marginBottom: 8 }}>
        <Text style={{ marginRight: 16 }}>{o.satirlar.length} görev</Text>
        <Text style={{ marginRight: 16 }}>{o.toplam} soru</Text>
        <Text style={{ marginRight: 16 }}>
          Çözülen: <Text style={{ color: PRI, fontWeight: 600 }}>{o.cozulen}</Text> / {o.toplam}
        </Text>
        <Text>
          Tamamlanan: <Text style={{ color: PRI, fontWeight: 600 }}>{o.biten}</Text> / {o.satirlar.length}
        </Text>
      </View>

      <View style={{ borderWidth: 0.6, borderColor: CIZ }}>
        <View fixed style={{ flexDirection: 'row', backgroundColor: ZEMIN, borderBottomWidth: 0.6, borderColor: CIZ }}>
          {['#', 'Ders · konu', 'Soru', 'Son gün', '1. kontrol', '2. kontrol', '3. kontrol', 'Durum', 'Konu\ndenemede'].map((h, i) => (
            <View key={h} style={hucre(i)}>
              <Text style={{ fontWeight: 600, fontSize: 7.5 }}>{h}</Text>
              {i >= 4 && i <= 6 && <Text style={{ fontSize: 6.5, color: MUT }}>tarih / çözülen</Text>}
            </View>
          ))}
        </View>
        {o.satirlar.map((s, n) => (
          <View key={n} wrap={false} style={{ flexDirection: 'row', minHeight: 44, borderBottomWidth: n < o.satirlar.length - 1 ? 0.6 : 0, borderColor: CIZ }}>
            <View style={hucre(0)}>
              <Text>{n + 1}</Text>
            </View>
            <View style={hucre(1)}>
              <Text style={{ color: MUT, fontSize: 7 }}>{s.ders}</Text>
              <Text>{s.konu}</Text>
            </View>
            <View style={hucre(2)}>
              <Text>{s.soru}</Text>
            </View>
            <View style={hucre(3)}>
              <Text>{s.sonGun}</Text>
            </View>
            {s.kontroller.map((k, i) => (
              <View key={i} style={hucre(4 + i)}>
                <KontrolHucre k={k} soru={s.soru} />
              </View>
            ))}
            <View style={hucre(7, { fontSize: 7 })}>
              {(['bitti', 'devam', 'baslamadi'] as const).map((d) => (
                <View key={d} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 2 }}>
                  <Kutu dolu={s.durum === d} />
                  <Text>{d === 'bitti' ? 'Bitti' : d === 'devam' ? 'Kısmen' : 'Yapılmadı'}</Text>
                </View>
              ))}
            </View>
            <View style={hucre(8, { fontSize: 7 })}>
              <Text>{s.etki}</Text>
            </View>
          </View>
        ))}
      </View>
      <Text style={{ fontSize: 6.5, color: MUT, marginTop: 3 }}>
        Yeşil yazılanlar sistemde kayıtlı. Boş kutulara kontrol tarihini ve o güne kadar çözülen soru sayısını yaz. "Beklenen", soruların son güne eşit
        dağıtılmasıyla hesaplanır.
      </Text>

      <View wrap={false} style={{ flexDirection: 'row', marginTop: 12 }}>
        <View style={{ width: '64%', paddingRight: 14 }}>
          <Text style={{ fontWeight: 600, marginBottom: 2 }}>Öğretmen notu</Text>
          {[0, 1, 2, 3].map((i) => (
            <View key={i} style={{ borderBottomWidth: 0.6, borderColor: CIZ, height: 17 }} />
          ))}
        </View>
        <View style={{ width: '36%' }}>
          {['Öğrenci imza', 'Öğretmen paraf'].map((a) => (
            <View key={a} style={{ marginBottom: 10 }}>
              <Text style={{ color: MUT, fontSize: 7 }}>{a}</Text>
              <View style={{ borderBottomWidth: 0.6, borderColor: CIZ, height: 20 }} />
            </View>
          ))}
        </View>
      </View>

      <View
        wrap={false}
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          marginTop: 10,
          borderTopWidth: 0.6,
          borderColor: '#c9d0d2',
          paddingTop: 6,
        }}
      >
        <View style={{ width: '80%' }}>
          <Text style={{ color: MUT }}>Kâğıda yazdıklarını sisteme girmek için karekodu okut: öğrencinin hızlı giriş ekranı açılır.</Text>
          <Text style={{ color: MUT }}>Sistemdeki durum: {b.basim}</Text>
        </View>
        <Karekod url={o.url} size={56} />
      </View>
      <Text
        fixed
        style={{ position: 'absolute', bottom: 22, right: 30, fontSize: 7, color: MUT }}
        render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
      />
    </Page>
  )
}

export async function gorevTakipPdf(b: FormBelge): Promise<Blob> {
  return pdf(
    <Document title="Görev takip formu" author={b.okul}>
      {b.ogrenciler.map((o, i) => (
        <OgrenciSayfasi key={i} b={b} o={o} />
      ))}
    </Document>,
  ).toBlob()
}
