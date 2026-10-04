// PDF metin okuyucu (projenin mupdf WASM motoru). Satırlar konumlarıyla döner; denetim karakterleri temizlenir.
// Geliştirme aracıdır: üretimde çalışmaz, MEB sitesine uygulama açılışında gidilmez.
import mupdf from '../../public/engine/mupdf/mupdf.js'
import { readFileSync } from 'node:fs'

const clean = (t) => t.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim()
const CACHE = new Map()

/** Sayfa sayfa satırlar: { x, y, y2, vert, t }. vert: dikey (döndürülmüş) metin. */
export function lines(file) {
  if (CACHE.has(file)) return CACHE.get(file)
  const d = mupdf.Document.openDocument(readFileSync(file), 'application/pdf'), pages = []
  for (let i = 0; i < d.countPages(); i++) {
    const page = d.loadPage(i), st = page.toStructuredText('preserve-whitespace'), out = []
    let l
    st.walk({ beginLine: (b, wm, dir) => { l = { x: b[0], y: b[1], y2: b[3], vert: Math.abs(dir?.[1] ?? 0) > 0.9, t: '' }; out.push(l) }, onChar: (c) => { l.t += c } })
    st.destroy()
    page.destroy() // WASM belleği: nesneler hemen serbest bırakılır
    pages.push(out.map((z) => ({ ...z, t: clean(z.t) })).filter((z) => z.t))
  }
  d.destroy()
  if (CACHE.size > 4) CACHE.delete(CACHE.keys().next().value)
  CACHE.set(file, pages)
  return pages
}

export const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
export const joinWrapped = (parts) => parts.join(' ').replace(/(\S)-\s+(\S)/g, '$1$2').replace(/\s+/g, ' ').trim()
export const norm = (t) => (t || '').toLocaleLowerCase('tr').replace(/[^a-zçğıöşü0-9]/g, '')
