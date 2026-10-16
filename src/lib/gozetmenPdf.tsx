// Gözetmen çizelgesi çıktısı (bağımsız modül, 0048): A4 yatay PDF ve paylaşılabilir PNG görsel.
// Yalnız "PDF indir" / "Görsel indir"e basılınca yüklenir.
import { Document, Font, Image, Page, StyleSheet, Text, View, pdf } from '@react-pdf/renderer'
import sansRegular from '@ibm/plex-sans/fonts/complete/woff/IBMPlexSans-Regular.woff?url'
import sansSemi from '@ibm/plex-sans/fonts/complete/woff/IBMPlexSans-SemiBold.woff?url'
import logo from '@/assets/okul-logo.jpg?url'

Font.register({ family: 'GzPlex', fonts: [{ src: sansRegular }, { src: sansSemi, fontWeight: 600 }] })
Font.registerHyphenationCallback((w) => [w])

export interface Cizelge {
  school: string
  title: string
  date: string
  type: string
  oturumlar: { name: string; saat: string }[]
  rows: { sinif: string; salon: string; cells: string[] }[]
  dinlendirici: string[] // oturum başına
  ogretmenler: { ad: string; gorev: string }[]
  note: string
  printed: string
}

const C = { ink: '#1b2a2f', muted: '#56636a', line: '#d9d3c6', head: '#e8efed', zebra: '#f6f3ec', primary: '#1f5f5b' }
const s = StyleSheet.create({
  page: { padding: 28, paddingBottom: 46, fontFamily: 'GzPlex', fontSize: 9.5, color: C.ink },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 2, borderBottomColor: C.ink, paddingBottom: 8, marginBottom: 10 },
  logo: { width: 34, height: 34, marginRight: 9 },
  title: { fontSize: 15, fontWeight: 600 },
  sub: { fontSize: 9, color: C.muted },
  tr: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: C.line, minHeight: 20, alignItems: 'center' },
  th: { flexDirection: 'row', backgroundColor: C.head, borderBottomWidth: 0.5, borderBottomColor: C.line },
  cell: { paddingVertical: 4, paddingHorizontal: 6 },
  h: { fontSize: 10, fontWeight: 600, marginTop: 12, marginBottom: 5, color: C.primary },
  foot: { position: 'absolute', bottom: 18, left: 28, right: 28, flexDirection: 'row', justifyContent: 'space-between', fontSize: 8, color: C.muted },
})

function Doc(d: Cizelge) {
  const n = d.oturumlar.length
  const w0 = 12
  const w1 = d.rows.some((r) => r.salon) ? 12 : 0
  const wc = (100 - w0 - w1) / Math.max(1, n)
  return (
    <Document title={`Gözetmen çizelgesi · ${d.title}`} author={d.school} language="tr">
      <Page size="A4" orientation="landscape" style={s.page}>
        <View style={s.head}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Image src={logo} style={s.logo} />
            <View>
              <Text style={s.sub}>{d.school}</Text>
              <Text style={s.title}>Gözetmen Çizelgesi · {d.title}</Text>
            </View>
          </View>
          <View>
            <Text style={[s.sub, { textAlign: 'right' }]}>{d.type}</Text>
            <Text style={{ fontSize: 11, fontWeight: 600, textAlign: 'right' }}>{d.date}</Text>
          </View>
        </View>
        <View style={s.th} fixed>
          <Text style={[s.cell, { width: `${w0}%`, fontWeight: 600 }]}>Sınıf</Text>
          {w1 > 0 && <Text style={[s.cell, { width: `${w1}%`, fontWeight: 600 }]}>Salon</Text>}
          {d.oturumlar.map((o) => (
            <View key={o.name} style={[s.cell, { width: `${wc}%` }]}>
              <Text style={{ fontWeight: 600 }}>{o.name}</Text>
              <Text style={{ fontSize: 8, color: C.muted }}>{o.saat}</Text>
            </View>
          ))}
        </View>
        {d.rows.map((r, i) => (
          <View key={r.sinif} style={[s.tr, { backgroundColor: i % 2 ? C.zebra : '#ffffff' }]} wrap={false}>
            <Text style={[s.cell, { width: `${w0}%`, fontWeight: 600 }]}>{r.sinif}</Text>
            {w1 > 0 && <Text style={[s.cell, { width: `${w1}%` }]}>{r.salon}</Text>}
            {r.cells.map((c, j) => (
              <Text key={j} style={[s.cell, { width: `${wc}%` }]}>
                {c || '—'}
              </Text>
            ))}
          </View>
        ))}
        {d.dinlendirici.some(Boolean) && (
          <View style={[s.tr, { backgroundColor: C.head }]} wrap={false}>
            <Text style={[s.cell, { width: `${w0 + w1}%`, fontWeight: 600 }]}>Dinlendirici</Text>
            {d.dinlendirici.map((c, j) => (
              <Text key={j} style={[s.cell, { width: `${wc}%` }]}>
                {c || '—'}
              </Text>
            ))}
          </View>
        )}
        {d.note ? <Text style={{ marginTop: 8, color: C.muted }}>Not: {d.note}</Text> : null}
        <Text style={s.h}>Öğretmen bazında görevler</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {d.ogretmenler.map((t) => (
            <View key={t.ad} style={{ width: '33.33%', paddingVertical: 2, paddingRight: 8 }} wrap={false}>
              <Text>
                <Text style={{ fontWeight: 600 }}>{t.ad}</Text>
                <Text style={{ color: C.muted }}> · {t.gorev}</Text>
              </Text>
            </View>
          ))}
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 22 }} wrap={false}>
          <View style={{ width: 180, alignItems: 'center' }}>
            <Text style={{ borderTopWidth: 0.5, borderTopColor: C.ink, paddingTop: 4, width: '100%', textAlign: 'center' }}>Okul Müdürü</Text>
          </View>
        </View>
        <View style={s.foot} fixed>
          <Text>
            {d.school} · Gözetmen çizelgesi · Hazırlanma: {d.printed}
          </Text>
          <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  )
}

export const cizelgePdf = (d: Cizelge): Promise<Blob> => pdf(<Doc {...d} />).toBlob()

/** Paylaşım için yüksek çözünürlüklü PNG (mesajlaşma uygulamalarında okunaklı). */
export async function cizelgePng(d: Cizelge): Promise<Blob> {
  const k = 2
  const pad = 36
  const rowH = 38
  const n = d.oturumlar.length
  const salon = d.rows.some((r) => r.salon)
  const W = Math.max(900, 200 + (salon ? 140 : 0) + n * 300)
  const rows = d.rows.length + (d.dinlendirici.some(Boolean) ? 1 : 0)
  const H = pad * 2 + 96 + 52 + rows * rowH + (d.note ? 34 : 0) + 30
  const cv = document.createElement('canvas')
  cv.width = W * k
  cv.height = H * k
  const g = cv.getContext('2d')!
  g.scale(k, k)
  g.fillStyle = '#ffffff'
  g.fillRect(0, 0, W, H)
  const font = (px: number, bold = false) => `${bold ? '600 ' : ''}${px}px "IBM Plex Sans", system-ui, sans-serif`
  const img = await new Promise<HTMLImageElement | null>((res) => {
    const i = new window.Image()
    i.onload = () => res(i)
    i.onerror = () => res(null)
    i.src = logo
  })
  if (img) g.drawImage(img, pad, pad, 60, 60)
  const tx = pad + (img ? 74 : 0)
  g.fillStyle = C.muted
  g.font = font(15)
  g.fillText(d.school, tx, pad + 20)
  g.fillStyle = C.ink
  g.font = font(24, true)
  g.fillText(`Gözetmen Çizelgesi · ${d.title}`, tx, pad + 50)
  g.textAlign = 'right'
  g.font = font(18, true)
  g.fillText(d.date, W - pad, pad + 50)
  g.font = font(14)
  g.fillStyle = C.muted
  g.fillText(d.type, W - pad, pad + 20)
  g.textAlign = 'left'
  g.fillStyle = C.ink
  g.fillRect(pad, pad + 74, W - pad * 2, 2)

  const cols = [{ w: 170, t: 'Sınıf', s: '' }, ...(salon ? [{ w: 140, t: 'Salon', s: '' }] : [])]
  const rest = (W - pad * 2 - cols.reduce((a, c) => a + c.w, 0)) / Math.max(1, n)
  const all = [...cols, ...d.oturumlar.map((o) => ({ w: rest, t: o.name, s: o.saat }))]
  let y = pad + 96
  const clip = (t: string, w: number) => {
    let x = t
    while (x.length > 1 && g.measureText(x).width > w - 20) x = x.slice(0, -2)
    return x === t ? t : `${x.trimEnd()}…`
  }
  g.fillStyle = C.head
  g.fillRect(pad, y, W - pad * 2, 52)
  let x = pad
  for (const c of all) {
    g.fillStyle = C.ink
    g.font = font(15, true)
    g.fillText(clip(c.t, c.w), x + 10, y + (c.s ? 22 : 32))
    if (c.s) {
      g.fillStyle = C.muted
      g.font = font(13)
      g.fillText(c.s, x + 10, y + 42)
    }
    x += c.w
  }
  y += 52
  const line = (vals: string[], bg: string, bold0 = true) => {
    g.fillStyle = bg
    g.fillRect(pad, y, W - pad * 2, rowH)
    let xx = pad
    vals.forEach((v, i) => {
      g.fillStyle = C.ink
      g.font = font(15, bold0 && i === 0)
      g.fillText(clip(v || '—', all[i]!.w), xx + 10, y + 25)
      xx += all[i]!.w
    })
    g.fillStyle = C.line
    g.fillRect(pad, y + rowH - 1, W - pad * 2, 1)
    y += rowH
  }
  d.rows.forEach((r, i) => line([r.sinif, ...(salon ? [r.salon] : []), ...r.cells], i % 2 ? C.zebra : '#ffffff'))
  if (d.dinlendirici.some(Boolean)) line(['Dinlendirici', ...(salon ? [''] : []), ...d.dinlendirici], C.head)
  if (d.note) {
    g.fillStyle = C.muted
    g.font = font(14)
    g.fillText(`Not: ${d.note}`, pad, y + 24)
    y += 34
  }
  g.fillStyle = C.muted
  g.font = font(12)
  g.fillText(`Hazırlanma: ${d.printed}`, pad, H - pad + 10)
  return new Promise((res, rej) => cv.toBlob((b) => (b ? res(b) : rej(new Error('Görsel oluşturulamadı'))), 'image/png'))
}
