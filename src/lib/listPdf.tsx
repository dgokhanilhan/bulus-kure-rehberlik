import { Document, Font, Image, Page, Text, View, pdf } from '@react-pdf/renderer'
import logo from '@/assets/okul-logo.jpg?url'
import regular from '@ibm/plex-sans/fonts/complete/woff/IBMPlexSans-Regular.woff?url'
import semi from '@ibm/plex-sans/fonts/complete/woff/IBMPlexSans-SemiBold.woff?url'
import { widths, type ListConfig } from './schoolLists'
Font.register({ family: 'ListPlex', fonts: [{ src: regular }, { src: semi, fontWeight: 600 }] })

export async function listPdf(c: ListConfig, rows: string[][], school: string): Promise<Blob> {
  const ws = widths(c)
  return pdf(
    <Document title={c.title} author={school}>
      <Page
        size="A4"
        orientation={c.orientation}
        style={{ padding: 30, paddingBottom: 55, fontFamily: 'ListPlex', fontSize: 9, color: '#1b2a2f' }}
      >
        <View fixed style={{ marginBottom: 12 }}>
          <Image src={logo} style={{ position: 'absolute', top: 0, right: 0, width: 28, height: 28 }} />
          <Text style={{ fontSize: 10, color: '#56636a' }}>{school}</Text>
          <Text style={{ fontSize: 18, fontWeight: 600, marginVertical: 6 }}>{c.title}</Text>
          {c.description && <Text style={{ marginBottom: 5 }}>{c.description}</Text>}
          {c.date && <Text style={{ marginBottom: 5 }}>{c.date}</Text>}
          <View style={{ flexDirection: 'row', backgroundColor: '#e8efed', borderWidth: 0.5, borderColor: '#bbc8c5' }}>
            {c.columns.map((col, i) => (
              <Text key={col.id} style={{ width: `${ws[i]}%`, padding: 5, fontWeight: 600 }}>
                {col.title}
              </Text>
            ))}
          </View>
        </View>
        {rows.map((row, n) => (
          <View
            key={n}
            wrap={false}
            style={{
              flexDirection: 'row',
              minHeight: c.rowHeight,
              borderBottomWidth: 0.5,
              borderColor: '#ccd4d2',
              backgroundColor: n % 2 ? '#f5f7f6' : '#ffffff',
            }}
          >
            {row.map((v, i) => (
              <Text key={i} style={{ width: `${ws[i]}%`, padding: 5 }}>
                {v}
              </Text>
            ))}
          </View>
        ))}
        {(c.footer || c.signatures) && (
          <View wrap={false} style={{ marginTop: 16 }}>
            <Text>{c.footer}</Text>
            <Text style={{ marginTop: 18 }}>{c.signatures}</Text>
          </View>
        )}
        <Text
          fixed
          style={{ position: 'absolute', bottom: 24, right: 30, fontSize: 8, color: '#56636a' }}
          render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
        />
      </Page>
    </Document>,
  ).toBlob()
}
