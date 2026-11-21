// Aylık takvim afişi (A4 yatay, renkli): öğretmenler odası panosu için. İstemci tarafında @react-pdf ile üretilir.
import { Document, Font, Image, Page, Text, View, pdf } from '@react-pdf/renderer'
import logo from '@/assets/okul-logo.jpg?url'
import regular from '@ibm/plex-sans/fonts/complete/woff/IBMPlexSans-Regular.woff?url'
import semi from '@ibm/plex-sans/fonts/complete/woff/IBMPlexSans-SemiBold.woff?url'
import bold from '@ibm/plex-sans/fonts/complete/woff/IBMPlexSans-Bold.woff?url'
import { acik, ayHaftalari } from './takvim'

export { acik, ayHaftalari }

const iso = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d)).toISOString().slice(0, 10)

Font.register({ family: 'AfisPlex', fonts: [{ src: regular }, { src: semi, fontWeight: 600 }, { src: bold, fontWeight: 700 }] })
Font.registerHyphenationCallback((w) => [w])

export type AfisOge = {
  key: string
  title: string
  type: string
  turAdi: string
  renk: string
  starts_on: string
  ends_on: string
  time: string | null
  etiket: string | null
}
export type AfisGirdi = { yil: number; ay: number; okul: string; filtre: string; ogeler: AfisOge[]; logo: boolean; bugun: string }

const AYLAR = ['OCAK', 'ŞUBAT', 'MART', 'NİSAN', 'MAYIS', 'HAZİRAN', 'TEMMUZ', 'AĞUSTOS', 'EYLÜL', 'EKİM', 'KASIM', 'ARALIK']
const GUNLER = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar']
const KOYU = '#173f3c'
const ANA = '#1f5f5b'
const ALTIN = '#e7c57a'
const MUREKKEP = '#1b2a2f'

const UST = 17

/** Afişte tatil, gri yerine pano için canlı pembe (diğer türlerin renklerinden ayrışır). */
const TATIL = '#d6336c'

export function TakvimAfisBelgesi({ g: girdi }: { g: AfisGirdi }) {
  const g = { ...girdi, ogeler: girdi.ogeler.map((x) => (x.type === 'tatil' ? { ...x, renk: TATIL } : x)) }
  const tatilGunu = (d: string) => g.ogeler.some((x) => x.type === 'tatil' && x.starts_on <= d && x.ends_on >= d)
  const haftalar = ayHaftalari(g.yil, g.ay)
  const ayKodu = `${g.yil}-${String(g.ay).padStart(2, '0')}`
  const turler = [...new Map(g.ogeler.map((x) => [x.type, x])).values()]
  const ayinOgeleri = g.ogeler.filter((x) => x.starts_on <= iso(g.yil, g.ay + 1, 0) && x.ends_on >= iso(g.yil, g.ay, 1))
  const gridH = 595 - 24 * 2 - 74 - 22 - 34
  const haftaH = (gridH - 20) / haftalar.length
  return (
    <Document title={`${AYLAR[g.ay - 1]} ${g.yil} takvimi`} author={g.okul}>
      <Page size="A4" orientation="landscape" style={{ padding: 24, fontFamily: 'AfisPlex', color: MUREKKEP, backgroundColor: '#fbfaf6' }}>
        {/* Başlık şeridi */}
        <View
          style={{ height: 74, borderRadius: 12, backgroundColor: KOYU, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, overflow: 'hidden' }}
        >
          <View style={{ position: 'absolute', right: -40, top: -60, width: 220, height: 220, borderRadius: 110, backgroundColor: ANA }} />
          <View style={{ position: 'absolute', right: 120, top: 40, width: 90, height: 90, borderRadius: 45, backgroundColor: '#24706b' }} />
          {g.logo && (
            <View
              style={{
                width: 54,
                height: 54,
                borderRadius: 27,
                backgroundColor: '#ffffff',
                alignItems: 'center',
                justifyContent: 'center',
                marginRight: 14,
                borderWidth: 2,
                borderColor: ALTIN,
              }}
            >
              <Image src={logo} style={{ width: 44, height: 44, borderRadius: 22 }} />
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={{ color: ALTIN, fontSize: 10, fontWeight: 600, letterSpacing: 1.5 }}>{g.okul.toLocaleUpperCase('tr-TR')}</Text>
            <Text style={{ color: '#ffffff', fontSize: 28, fontWeight: 700, letterSpacing: 1 }}>
              {AYLAR[g.ay - 1]} {g.yil}
            </Text>
            <Text style={{ color: '#d5e6e2', fontSize: 10 }}>Aylık etkinlik takvimi{g.filtre ? ` · ${g.filtre}` : ''}</Text>
          </View>
          <View style={{ alignItems: 'center', backgroundColor: ALTIN, borderRadius: 10, paddingVertical: 6, paddingHorizontal: 12 }}>
            <Text style={{ fontSize: 22, fontWeight: 700, color: KOYU }}>{ayinOgeleri.length}</Text>
            <Text style={{ fontSize: 8, fontWeight: 600, color: KOYU }}>etkinlik</Text>
          </View>
        </View>

        {/* Gün başlıkları */}
        <View style={{ flexDirection: 'row', marginTop: 8, height: 20 }}>
          {GUNLER.map((d, i) => (
            <View
              key={d}
              style={{ flex: 1, marginHorizontal: 1.5, borderRadius: 5, backgroundColor: i >= 5 ? ALTIN : ANA, alignItems: 'center', justifyContent: 'center' }}
            >
              <Text style={{ fontSize: 9, fontWeight: 700, color: i >= 5 ? KOYU : '#ffffff' }}>{d}</Text>
            </View>
          ))}
        </View>

        {/* Haftalar */}
        {haftalar.map((w) => {
          // Çok günlü etkinlikler birleştirilmez: kapladığı her günün kutusuna ayrı ayrı yazılır.
          const pay = UST
          const sigar = Math.max(0, Math.floor((haftaH - pay - 6) / 15))
          return (
            <View key={w[0]} style={{ height: haftaH, flexDirection: 'row', marginTop: 3, position: 'relative' }}>
              {w.map((d, i) => {
                const dis = d.slice(0, 7) !== ayKodu
                const hs = i >= 5
                const liste = g.ogeler
                  .filter((x) => x.starts_on <= d && x.ends_on >= d)
                  .sort((a, b) => a.starts_on.localeCompare(b.starts_on) || (a.time ?? '').localeCompare(b.time ?? ''))
                const goster = liste.length > sigar ? liste.slice(0, Math.max(0, sigar - 1)) : liste
                return (
                  <View
                    key={d}
                    style={{
                      flex: 1,
                      marginHorizontal: 1.5,
                      borderRadius: 6,
                      backgroundColor: dis ? '#f1f0eb' : tatilGunu(d) ? acik(TATIL, 0.88) : hs ? '#fdf6e6' : '#ffffff',
                      borderWidth: 0.8,
                      borderColor: '#dfe5e3',
                      paddingTop: pay,
                      paddingHorizontal: 3,
                    }}
                  >
                    <Text style={{ position: 'absolute', top: 3, left: 5, fontSize: 10, fontWeight: 700, color: dis ? '#a3abab' : hs ? '#9a6b12' : KOYU }}>
                      {Number(d.slice(8))}
                    </Text>
                    {!dis &&
                      goster.map((x) => (
                        <View
                          key={x.key}
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            marginBottom: 2,
                            borderRadius: 3,
                            backgroundColor: acik(x.renk, 0.82),
                            borderLeftWidth: 2.5,
                            borderLeftColor: x.renk,
                            paddingVertical: 1.5,
                            paddingHorizontal: 2.5,
                          }}
                        >
                          {x.etiket && (
                            <Text
                              style={{
                                fontSize: 6,
                                fontWeight: 700,
                                color: '#ffffff',
                                backgroundColor: x.renk,
                                borderRadius: 2,
                                paddingHorizontal: 2,
                                marginRight: 2,
                              }}
                            >
                              {x.etiket}
                            </Text>
                          )}
                          <Text style={{ fontSize: 6.8, fontWeight: 600, flex: 1, maxLines: 2, textOverflow: 'ellipsis' }}>
                            {x.time ? `${x.time} ` : ''}
                            {x.title}
                          </Text>
                        </View>
                      ))}
                    {!dis && goster.length < liste.length && (
                      <Text style={{ fontSize: 6.5, color: '#56636a' }}>+{liste.length - goster.length} etkinlik daha</Text>
                    )}
                  </View>
                )
              })}
            </View>
          )
        })}

        {/* Renk açıklaması ve alt bilgi */}
        <View style={{ position: 'absolute', left: 24, right: 24, bottom: 18, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' }}>
          {turler.map((x) => (
            <View key={x.type} style={{ flexDirection: 'row', alignItems: 'center', marginRight: 12 }}>
              <View style={{ width: 9, height: 9, borderRadius: 2, backgroundColor: x.renk, marginRight: 4 }} />
              <Text style={{ fontSize: 8 }}>{x.turAdi}</Text>
            </View>
          ))}
          <Text style={{ fontSize: 7.5, color: '#56636a', marginLeft: 'auto' }}>
            Sınıf etiketi: Tümü = tüm okul · 5-7 = 5, 6, 7. sınıflar · Hazırlanma: {g.bugun.split('-').reverse().join('.')}
          </Text>
        </View>
      </Page>
    </Document>
  )
}

export async function takvimAfisPdf(g: AfisGirdi): Promise<Blob> {
  return pdf(<TakvimAfisBelgesi g={g} />).toBlob()
}
