// Etüt programı dosya okuyucuları (tarayıcıda): Excel/CSV, görsel (yerel OCR), PDF (MuPDF; yazısızsa OCR).
// Öğrenci adları hiçbir sunucuya ya da yapay zekâya gönderilmez.
import { tabloIskeleti, tabloKelimelerden, tabloSatirlardan, type HamTablo, type Kelime } from './etutIceAktar'
import { PDF_OKUMA } from './platform'

export type Kaynak = 'excel' | 'gorsel' | 'pdf'
export const kaynakOf = (f: File): Kaynak | null =>
  /\.(xlsx|csv|txt)$/i.test(f.name) ? 'excel' : f.type.startsWith('image/') ? 'gorsel' : /\.pdf$/i.test(f.name) || f.type === 'application/pdf' ? (PDF_OKUMA ? 'pdf' : null) : null

function csvSatirlar(text: string): string[][] {
  const sep = (text.split('\n')[0] ?? '').split(';').length > (text.split('\n')[0] ?? '').split(',').length ? ';' : ','
  const rows: string[][] = []
  let row: string[] = [], cell = '', q = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!
    if (q) {
      if (c === '"' && text[i + 1] === '"') (cell += '"'), i++
      else if (c === '"') q = false
      else cell += c
    } else if (c === '"') q = true
    else if (c === sep) row.push(cell), (cell = '')
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(cell), rows.push(row), (row = []), (cell = '')
    } else cell += c
  }
  if (cell || row.length) row.push(cell), rows.push(row)
  return rows
}

export async function excelOku(file: File): Promise<HamTablo> {
  if (/\.xlsx$/i.test(file.name)) {
    const { default: readXlsxFile } = await import('read-excel-file')
    const rows = await readXlsxFile(file)
    return tabloSatirlardan(rows.map((r) => r.map((c) => (c === null || c === undefined ? '' : String(c)))))
  }
  return tabloSatirlardan(csvSatirlar(await file.text()))
}

type TWorker = import('tesseract.js').Worker
async function ocrBaslat(progress: (n: number) => void) {
  const { createWorker } = await import('tesseract.js')
  const base = `${location.origin}/program-ocr`
  return createWorker('tur+eng', 1, {
    workerPath: `${base}/worker.min.js`,
    corePath: base,
    langPath: base,
    workerBlobURL: false,
    logger: (m: { status: string; progress: number }) => m.status === 'recognizing text' && progress(Math.round(m.progress * 30)),
  })
}
async function kelimeler(w: TWorker, src: HTMLCanvasElement): Promise<Kelime[]> {
  const { PSM } = await import('tesseract.js')
  await w.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT })
  const r = await w.recognize(src, {}, { blocks: true })
  return (r.data.blocks ?? [])
    .flatMap((b) => b.paragraphs.flatMap((p) => p.lines.flatMap((l) => l.words)))
    .filter((x) => x.confidence > 20 && x.text.trim())
    .map((x) => ({ t: x.text, x0: x.bbox.x0, y0: x.bbox.y0, x1: x.bbox.x1, y1: x.bbox.y1 }))
}
const anlam = (t: string) => (t.match(/[\p{L}]{3,}/gu) ?? []).join('').length
/** Görsel → küçük yazıların okunması için büyütülmüş tuval (en geniş kenar ~3000 px) */
async function tuval(src: HTMLCanvasElement | Blob): Promise<HTMLCanvasElement> {
  const img = src instanceof HTMLCanvasElement ? src : await createImageBitmap(src)
  const w = img.width, h = img.height
  const k = Math.max(1, Math.min(2, 2400 / Math.max(w, h)))
  const c = document.createElement('canvas')
  c.width = Math.round(w * k)
  c.height = Math.round(h * k)
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, c.width, c.height)
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, 0, 0, c.width, c.height)
  return c
}

/**
 * Görselden tablo: 1) tam sayfa OCR ile iskelet (öğretmen satırları, 5 sütun), 2) her hücre kendi alanında ayrıca okunur
 * (küçük basılı yazılarda çok daha doğru). Hücre okuması zayıfsa tam sayfa okumasındaki kelimeler kullanılır.
 */
export async function gorselOku(src: HTMLCanvasElement | Blob, ogretmenIlkAdlar: Set<string>, progress: (n: number) => void, signal: AbortSignal): Promise<HamTablo> {
  const c = await tuval(src)
  const w = await ocrBaslat(progress)
  const stop = () => void w.terminate()
  signal.addEventListener('abort', stop, { once: true })
  try {
    const ws = await kelimeler(w, c)
    if (signal.aborted) throw new Error('İşlem iptal edildi.')
    const isk = tabloIskeleti(ws, ogretmenIlkAdlar)
    const kaba = tabloKelimelerden(ws, ogretmenIlkAdlar)
    const { PSM } = await import('tesseract.js')
    await w.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_BLOCK })
    const toplam = isk.satirlar.length * 5
    let n = 0
    const satirlar = []
    for (const [ri, r] of isk.satirlar.entries()) {
      const hucreler: string[] = []
      for (const [ci, [x0, x1]] of isk.kolonlar.entries()) {
        if (signal.aborted) throw new Error('İşlem iptal edildi.')
        const rect = { left: Math.max(0, Math.round(x0) + 3), top: Math.max(0, Math.round(r.y0) + 3), width: Math.round(x1 - x0) - 6, height: Math.round(r.y1 - r.y0) - 6 }
        let metin = ''
        if (rect.width > 12 && rect.height > 12 && rect.left + rect.width <= c.width && rect.top + rect.height <= c.height) {
          const res = await w.recognize(c, { rectangle: rect })
          metin = res.data.confidence >= 35 ? res.data.text.replace(/\s+/g, ' ').trim() : ''
        }
        // İki okumadan anlamlı (3+ harfli) sözcüğü daha çok olan seçilir
        const ham = kaba.satirlar[ri]?.hucreler[ci] ?? ''
        hucreler.push(anlam(metin) >= anlam(ham) ? metin : ham)
        progress(30 + Math.round((++n / toplam) * 70))
      }
      satirlar.push({ ogretmen: r.ogretmen, hucreler })
    }
    return { saatler: isk.saatler, satirlar }
  } finally {
    signal.removeEventListener('abort', stop)
    await w.terminate().catch(() => {})
  }
}

let worker: Worker | null = null
export async function pdfOku(file: File, ogretmenIlkAdlar: Set<string>, progress: (n: number) => void, signal: AbortSignal): Promise<HamTablo> {
  worker ??= new Worker('/engine/etut-worker.mjs', { type: 'module' })
  const id = Math.random().toString(36).slice(2)
  const bytes = new Uint8Array(await file.arrayBuffer())
  const res = await new Promise<{ words: Kelime[]; images: Uint8Array[] }>((resolve, reject) => {
    const w = worker!
    const on = (e: MessageEvent) => {
      if (e.data?.id !== id) return
      w.removeEventListener('message', on)
      if (e.data.error) reject(new Error(e.data.error))
      else resolve(e.data)
    }
    w.addEventListener('message', on)
    w.postMessage({ id, bytes }, [bytes.buffer])
  })
  if (res.words.length) return tabloKelimelerden(res.words, ogretmenIlkAdlar)
  if (!res.images.length) throw new Error('PDF\'te okunacak sayfa yok.')
  // Taranmış PDF: ilk sayfa görsel olarak OCR'a verilir
  return gorselOku(new Blob([new Uint8Array(res.images[0]!)], { type: 'image/png' }), ogretmenIlkAdlar, progress, signal)
}
