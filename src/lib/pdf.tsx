// Rapor PDF'i (istemci tarafı, @react-pdf/renderer): metin seçilebilir, Türkçe karakterler gömülü IBM Plex ile.
// Yapı: docs/veli-raporu-kurallari.md §18. Bu modül yalnız "PDF indir"e basılınca yüklenir.
import { Document, Font, Page, StyleSheet, Text, View, pdf } from '@react-pdf/renderer'
import sansRegular from '@ibm/plex-sans/fonts/complete/woff/IBMPlexSans-Regular.woff?url'
import sansSemi from '@ibm/plex-sans/fonts/complete/woff/IBMPlexSans-SemiBold.woff?url'
import monoMedium from '@ibm/plex-mono/fonts/complete/woff/IBMPlexMono-Medium.woff?url'

Font.register({ family: 'Plex', fonts: [{ src: sansRegular }, { src: sansSemi, fontWeight: 600 }] })
Font.register({ family: 'PlexMono', src: monoMedium })
Font.registerHyphenationCallback((w) => [w]) // Türkçe kelimeleri bölme

const C = { ink: '#1b2a2f', muted: '#56636a', line: '#e3ddd0', paper: '#f6f3ec', primary: '#1f5f5b', signal: '#b5541a', hl: '#c9962e' }
const s = StyleSheet.create({
  page: { padding: 36, fontFamily: 'Plex', fontSize: 10, color: C.ink, lineHeight: 1.5 },
  head: { flexDirection: 'row', justifyContent: 'space-between', borderBottomWidth: 2, borderBottomColor: C.ink, paddingBottom: 10, marginBottom: 12 },
  brand: { fontSize: 15, fontWeight: 600 },
  sub: { fontSize: 9, color: C.muted },
  info: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 10 },
  infoCell: { width: '33.33%', padding: 3 },
  infoBox: { backgroundColor: C.paper, borderRadius: 6, padding: 6 },
  infoK: { fontSize: 8, color: C.muted },
  infoV: { fontSize: 11, fontWeight: 600 },
  h3: { fontSize: 9, fontWeight: 600, color: C.muted, letterSpacing: 0.6, marginTop: 10, marginBottom: 4 },
  p: { fontSize: 10, marginBottom: 4 },
  tr: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: C.line, paddingVertical: 3 },
  th: { fontSize: 8, color: C.muted, fontWeight: 600 },
  num: { fontFamily: 'PlexMono', fontSize: 9.5, textAlign: 'right' },
  li: { flexDirection: 'row', marginBottom: 3 },
  foot: { position: 'absolute', bottom: 20, left: 36, right: 36, flexDirection: 'row', justifyContent: 'space-between', fontSize: 8, color: C.muted, borderTopWidth: 0.5, borderTopColor: C.line, paddingTop: 6 },
})

export interface PdfSubjectRow {
  ad: string
  d: string
  y: string
  b: string
  net: string
  prev: string
  trend: 'up' | 'down' | null
}
export interface PdfCommon {
  kind: 'veli' | 'ogretmen'
  student: string
  className: string
  exam: string
  date: string
  score: string
  totalNet: string
  reportDate: string
  subjects: PdfSubjectRow[]
}
export interface PdfVeli extends PdfCommon {
  kind: 'veli'
  genel: string
  guclu: string
  gelisim: string
  oneriler: string[]
  mentor: string
  rehber: string
}
export interface PdfOgretmen extends PdfCommon {
  kind: 'ogretmen'
  history: { exams: string[]; rows: { ad: string; nets: string[] }[]; totals: string[] }
  repeats: { konu: string; kod: string; ders: string; denemeler: string }[]
  repeatsNote: string
  tasks: { konu: string; son: string; ilerleme: string; durum: string }[]
  notes: { yazar: string; metin: string }[]
  toplanti: string
}

/** Bölüm başlığı: Türkçe büyük harf (i → İ). Stil ile büyütme Türkçe kuralını bilmez. */
const H = ({ children }: { children: string }) => <Text style={s.h3}>{children.toLocaleUpperCase('tr')}</Text>

function Table({ head, rows, widths, numFrom }: { head: string[]; rows: string[][]; widths: number[]; numFrom: number }) {
  return (
    <View>
      <View style={s.tr}>
        {head.map((h, i) => (
          <Text key={i} style={[s.th, { width: `${widths[i]}%`, textAlign: i >= numFrom ? 'right' : 'left' }]}>
            {h}
          </Text>
        ))}
      </View>
      {rows.map((r, i) => (
        <View style={s.tr} key={i} wrap={false}>
          {r.map((c, j) => (
            <Text key={j} style={[j >= numFrom ? s.num : { fontSize: 9.5 }, { width: `${widths[j]}%` }]}>
              {c}
            </Text>
          ))}
        </View>
      ))}
    </View>
  )
}

function Report(d: PdfVeli | PdfOgretmen) {
  const V = d.kind === 'veli'
  return (
    <Document title={`${V ? 'Veli Gelişim Raporu' : 'Öğretmen Bilgilendirme Raporu'} · ${d.student} · ${d.exam}`} author="Buluş Küre Koleji" language="tr">
      <Page size="A4" style={s.page}>
        <View style={s.head}>
          <View>
            <Text style={s.brand}>Buluş Küre Koleji</Text>
            <Text style={s.sub}>Rehberlik & Mentörlük · {V ? 'Veli Gelişim Raporu' : 'Öğretmen Bilgilendirme Raporu'}</Text>
          </View>
          <View>
            <Text style={[s.sub, { textAlign: 'right' }]}>Rapor tarihi</Text>
            <Text style={{ fontSize: 10, fontWeight: 600, textAlign: 'right' }}>{d.reportDate}</Text>
          </View>
        </View>
        <H>Öğrenci Bilgileri</H>
        <View style={s.info}>
          {[
            ['Ad Soyad', d.student],
            ['Şube', d.className],
            ['Deneme', d.exam],
            ['Tarih', d.date],
            ['Puan', d.score],
            ['Toplam Net', d.totalNet],
          ].map(([k, v]) => (
            <View style={s.infoCell} key={k}>
              <View style={s.infoBox}>
                <Text style={s.infoK}>{k}</Text>
                <Text style={s.infoV}>{v}</Text>
              </View>
            </View>
          ))}
        </View>
        {!V && (
          <>
            <H>Net gelişimi</H>
            <Table
              head={['Ders', ...d.history.exams]}
              rows={[...d.history.rows.map((r) => [r.ad, ...r.nets]), ['Toplam', ...d.history.totals]]}
              widths={[34, ...d.history.exams.map(() => 66 / Math.max(1, d.history.exams.length))]}
              numFrom={1}
            />
          </>
        )}
        <H>Ders Performansı</H>
        <Table
          head={['Ders', 'D', 'Y', 'B', 'Net', 'Önceki']}
          rows={d.subjects.map((r) => [r.ad, r.d, r.y, r.b, r.net, `${r.prev}${r.trend === 'up' ? ' ↑' : r.trend === 'down' ? ' ↓' : ''}`])}
          widths={[40, 10, 10, 10, 15, 15]}
          numFrom={1}
        />
        {V ? (
          <>
            <H>Genel Değerlendirme</H>
            <Text style={s.p}>{d.genel}</Text>
            <H>Güçlü Yönler</H>
            <Text style={s.p}>{d.guclu}</Text>
            <H>Üzerinde Çalışılması Gereken Alanlar</H>
            <Text style={s.p}>{d.gelisim}</Text>
            <H>Çalışma Önerileri</H>
            {d.oneriler.map((o, i) => (
              <View style={s.li} key={i} wrap={false}>
                <Text style={{ width: 14 }}>{i + 1}.</Text>
                <Text style={{ flex: 1 }}>{o}</Text>
              </View>
            ))}
            <H>Mentör Yorumu</H>
            <Text style={s.p}>{d.mentor || '—'}</Text>
            {d.rehber.trim() && (
              <>
                <H>Rehber Öğretmen Yorumu</H>
                <Text style={s.p}>{d.rehber}</Text>
              </>
            )}
          </>
        ) : (
          <>
            <H>Tekrar eden hatalar</H>
            {d.repeats.length ? (
              <Table head={['Konu', 'Kod', 'Ders', 'Yanlış olduğu denemeler']} rows={d.repeats.map((r) => [r.konu, r.kod, r.ders, r.denemeler])} widths={[38, 16, 18, 28]} numFrom={9} />
            ) : (
              <Text style={s.p}>{d.repeatsNote}</Text>
            )}
            <H>Görevler</H>
            {d.tasks.length ? (
              <Table head={['Konu', 'Son gün', 'İlerleme', 'Durum']} rows={d.tasks.map((t) => [t.konu, t.son, t.ilerleme, t.durum])} widths={[44, 20, 16, 20]} numFrom={9} />
            ) : (
              <Text style={s.p}>Görev yok.</Text>
            )}
            <H>Öğretmen notları</H>
            {d.notes.length ? (
              d.notes.map((n, i) => (
                <Text style={s.p} key={i}>
                  <Text style={{ fontWeight: 600 }}>{n.yazar}: </Text>
                  {n.metin}
                </Text>
              ))
            ) : (
              <Text style={s.p}>Not yok.</Text>
            )}
            <H>Toplantı gündemi / değerlendirme</H>
            <Text style={s.p}>{d.toplanti || '—'}</Text>
          </>
        )}
        <View style={s.foot} fixed>
          <Text>{V ? 'Bu rapor öğrencinin yalnızca kendi önceki denemeleriyle karşılaştırılmasına dayanır.' : 'Kurum içi kullanım içindir. Veli ile paylaşılmaz.'}</Text>
          <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  )
}

export async function reportPdfBlob(d: PdfVeli | PdfOgretmen): Promise<Blob> {
  return pdf(<Report {...d} />).toBlob()
}

// ---------- Devamsızlık raporu (Faz E) ----------
export interface PdfAttendance {
  school: string
  student: string
  className: string
  schoolNo: string
  range: string
  summary: [string, string][]
  rows: { date: string; status: string; note: string }[]
  printed: string
}

function AttendanceDoc(d: PdfAttendance) {
  return (
    <Document title={`Devamsızlık raporu · ${d.student}`} author={d.school}>
      <Page size="A4" style={s.page}>
        <View style={s.head}>
          <View>
            <Text style={s.brand}>{d.school}</Text>
            <Text style={s.sub}>Devamsızlık raporu</Text>
          </View>
          <Text style={s.sub}>{d.printed}</Text>
        </View>
        <View style={s.info}>
          {[
            ['Öğrenci', d.student],
            ['Sınıf · No', `${d.className} · ${d.schoolNo}`],
            ['Tarih aralığı', d.range],
          ].map(([k, v]) => (
            <View key={k} style={s.infoCell}>
              <View style={s.infoBox}>
                <Text style={s.infoK}>{k}</Text>
                <Text style={s.infoV}>{v}</Text>
              </View>
            </View>
          ))}
        </View>
        <Text style={s.h3}>ÖZET</Text>
        <View style={s.info}>
          {d.summary.map(([k, v]) => (
            <View key={k} style={{ width: '20%', padding: 3 }}>
              <View style={s.infoBox}>
                <Text style={s.infoK}>{k}</Text>
                <Text style={s.infoV}>{v}</Text>
              </View>
            </View>
          ))}
        </View>
        <Text style={s.h3}>KAYITLAR</Text>
        <View style={s.tr}>
          <Text style={[s.th, { width: '34%' }]}>Tarih</Text>
          <Text style={[s.th, { width: '22%' }]}>Durum</Text>
          <Text style={[s.th, { width: '44%' }]}>Açıklama</Text>
        </View>
        {d.rows.length ? (
          d.rows.map((r, i) => (
            <View key={i} style={s.tr} wrap={false}>
              <Text style={{ width: '34%' }}>{r.date}</Text>
              <Text style={{ width: '22%', fontWeight: 600 }}>{r.status}</Text>
              <Text style={{ width: '44%', color: C.muted }}>{r.note}</Text>
            </View>
          ))
        ) : (
          <Text style={s.p}>Bu aralıkta devamsızlık kaydı yok.</Text>
        )}
        <View style={s.foot} fixed>
          <Text>{d.school} · Bilgilendirme amaçlıdır.</Text>
          <Text render={({ pageNumber, totalPages }) => `${pageNumber}/${totalPages}`} />
        </View>
      </Page>
    </Document>
  )
}

export async function attendancePdfBlob(d: PdfAttendance): Promise<Blob> {
  return pdf(<AttendanceDoc {...d} />).toBlob()
}
