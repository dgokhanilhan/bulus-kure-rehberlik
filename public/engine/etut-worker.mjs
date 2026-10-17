// Etüt programı PDF okuyucu — Web Worker (PDF tarayıcıda okunur, hiçbir sunucuya gitmez).
// Uygulama kaynağı AGPL-3.0-or-later; MuPDF (AGPL) ./mupdf altında.
// Yazı içeren PDF: kelimeler konumlarıyla döner. Taranmış (yazısız) PDF: sayfalar PNG olarak döner (tarayıcıda OCR yapılır).
import mupdf from './mupdf/mupdf.js'

self.onmessage = ({ data }) => {
  let doc
  try {
    doc = mupdf.Document.openDocument(data.bytes, 'application/pdf')
    const words = []
    const images = []
    let offset = 0
    const n = Math.min(doc.countPages(), 4)
    for (let i = 0; i < n; i++) {
      const page = doc.loadPage(i)
      const [, , , h] = page.getBounds()
      const st = page.toStructuredText('preserve-whitespace')
      let cur = null
      const flush = () => {
        if (cur && cur.t.trim()) words.push(cur)
        cur = null
      }
      st.walk({
        beginLine: () => flush(),
        endLine: () => flush(),
        onChar: (c, _o, _f, _s, q) => {
          if (/\s/.test(c)) return flush()
          const x0 = Math.min(q[0], q[2], q[4], q[6]), x1 = Math.max(q[0], q[2], q[4], q[6])
          const y0 = Math.min(q[1], q[3], q[5], q[7]) + offset, y1 = Math.max(q[1], q[3], q[5], q[7]) + offset
          if (cur && x0 - cur.x1 > (y1 - y0) * 0.35) flush()
          if (!cur) cur = { t: c, x0, y0, x1, y1 }
          else {
            cur.t += c
            cur.x1 = Math.max(cur.x1, x1)
            cur.y0 = Math.min(cur.y0, y0)
            cur.y1 = Math.max(cur.y1, y1)
          }
        },
      })
      flush()
      st.destroy()
      if (words.length < 10) {
        const pix = page.toPixmap([2, 0, 0, 2, 0, 0], mupdf.ColorSpace.DeviceRGB, false)
        images.push(new Uint8Array(pix.asPNG()))
        pix.destroy()
      }
      page.destroy()
      offset += h + 20
    }
    self.postMessage({ id: data.id, words: words.length >= 10 ? words : [], images })
  } catch (e) {
    self.postMessage({ id: data.id, error: e?.message || 'PDF okunamadı.' })
  } finally {
    doc?.destroy()
  }
}
