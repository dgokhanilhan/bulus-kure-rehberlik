// Cumartesi etüt programı PDF'i (0051): A4 yatay, öğretmen × 5 ders. Yalnız "PDF indir"e basılınca yüklenir.
import { Document, Font, Image, Page, StyleSheet, Text, View, pdf } from '@react-pdf/renderer'
import sansRegular from '@ibm/plex-sans/fonts/complete/woff/IBMPlexSans-Regular.woff?url'
import sansSemi from '@ibm/plex-sans/fonts/complete/woff/IBMPlexSans-SemiBold.woff?url'
import logo from '@/assets/okul-logo.jpg?url'

Font.register({ family: 'EtPlex', fonts: [{ src: sansRegular }, { src: sansSemi, fontWeight: 600 }] })
Font.registerHyphenationCallback((w) => [w])

export interface EtutPdfVeri {
  school: string
  title: string // ör. "Ortaokul · 17 Ekim 2026 Cumartesi"
  durum: string
  saatler: { bas: string; bit: string }[]
  satirlar: { ogretmen: string; hucreler: ({ tur: 'etut'; konu: string; salon: string; ogrenciler: string[] } | { tur: 'mesgul'; aciklama: string } | null)[] }[]
  printed: string
  logo?: boolean
}

const C = { ink: '#1b2a2f', muted: '#56636a', line: '#d9d3c6', head: '#e8efed', zebra: '#f6f3ec', primary: '#1f5f5b', busy: '#ece6d9' }
const s = StyleSheet.create({
  page: { padding: 24, paddingBottom: 40, fontFamily: 'EtPlex', fontSize: 8.5, color: C.ink },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 2, borderBottomColor: C.ink, paddingBottom: 8, marginBottom: 8 },
  tr: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: C.line },
  cell: { paddingVertical: 4, paddingHorizontal: 5 },
  foot: { position: 'absolute', bottom: 14, left: 24, right: 24, flexDirection: 'row', justifyContent: 'space-between', fontSize: 7.5, color: C.muted },
})

function Doc(d: EtutPdfVeri) {
  const w0 = 16
  const wc = (100 - w0) / 5
  return (
    <Document title={`Cumartesi etüt programı · ${d.title}`} author={d.school} language="tr">
      <Page size="A4" orientation="landscape" style={s.page}>
        <View style={s.head}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            {d.logo !== false && <Image src={logo} style={{ width: 32, height: 32, marginRight: 8 }} />}
            <View>
              <Text style={{ fontSize: 9, color: C.muted }}>{d.school}</Text>
              <Text style={{ fontSize: 14, fontWeight: 600 }}>Cumartesi Etüt Programı · {d.title}</Text>
            </View>
          </View>
          <Text style={{ fontSize: 9, color: C.muted }}>{d.durum}</Text>
        </View>
        <View style={[s.tr, { backgroundColor: C.head }]} fixed>
          <Text style={[s.cell, { width: `${w0}%`, fontWeight: 600 }]}>Öğretmen</Text>
          {d.saatler.map((x, i) => (
            <View key={i} style={[s.cell, { width: `${wc}%` }]}>
              <Text style={{ fontWeight: 600 }}>{i + 1}. ders</Text>
              <Text style={{ fontSize: 7.5, color: C.muted }}>
                {x.bas}–{x.bit}
              </Text>
            </View>
          ))}
        </View>
        {d.satirlar.map((r, i) => (
          <View key={r.ogretmen} style={[s.tr, { backgroundColor: i % 2 ? C.zebra : '#ffffff' }]} wrap={false}>
            <Text style={[s.cell, { width: `${w0}%`, fontWeight: 600 }]}>{r.ogretmen}</Text>
            {r.hucreler.map((h, j) => (
              <View key={j} style={[s.cell, { width: `${wc}%` }, h?.tur === 'mesgul' ? { backgroundColor: C.busy } : {}]}>
                {!h ? (
                  <Text style={{ color: C.muted }}>—</Text>
                ) : h.tur === 'mesgul' ? (
                  <Text style={{ color: C.muted }}>{h.aciklama || 'Meşgul'}</Text>
                ) : (
                  <>
                    <Text style={{ fontWeight: 600 }}>{h.konu}</Text>
                    {h.salon ? <Text style={{ color: C.primary }}>{h.salon}</Text> : null}
                    {h.ogrenciler.length ? <Text style={{ color: C.muted }}>{h.ogrenciler.join(', ')}</Text> : null}
                  </>
                )}
              </View>
            ))}
          </View>
        ))}
        <View style={s.foot} fixed>
          <Text>
            {d.school} · Cumartesi etüt programı · Hazırlanma: {d.printed}
          </Text>
          <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  )
}

export const etutPdf = (d: EtutPdfVeri): Promise<Blob> => pdf(<Doc {...d} />).toBlob()
