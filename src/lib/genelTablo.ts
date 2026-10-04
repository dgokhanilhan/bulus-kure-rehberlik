// Excel/CSV ve elle giriş → genel motor paketi (GenelPack). Böylece PDF ile aynı kontrol ekranı ve aynı import_exam doğrulaması kullanılır.
// Tablo biçimi: Ad soyad | Okul no | Sınıf | <BÖLÜM> D | <BÖLÜM> Y | (<BÖLÜM> B) ... Bölüm adı şablondaki kod ya da ad olabilir.
// Boş hücre "girilmedi"dir (tahmin edilmez); seçmeli gruptan girilmeyen bölüm N/A olur (resolveOptional).
import { fold } from './format'
import { netOf, type ExamTemplate } from './denemeGenel'
import type { GenelPack, GenelRecord, GenelSection } from './genelImport'

export const MAX_TABLE_ROWS = 2000

export function tableTemplate(tpl: ExamTemplate): string[][] {
  const head = ['Ad soyad', 'Okul no', 'Sınıf', ...tpl.sections.flatMap((s) => [`${s.key} D`, `${s.key} Y`])]
  const sample = ['Örnek Öğrenci', '123', `${tpl.grade}/A`, ...tpl.sections.flatMap((s, i) => (s.optional_group && tpl.sections.findIndex((x) => x.optional_group === s.optional_group) !== i ? ['', ''] : [String(Math.ceil(s.question_count / 2)), '1']))]
  return [head, sample]
}

const h = (x: unknown) => fold(String(x ?? '')).replace(/[_.\-]/g, ' ').replace(/\s+/g, ' ').trim()
const KIND: Record<string, 'd' | 'y' | 'b'> = { d: 'd', dogru: 'd', y: 'y', yanlis: 'y', b: 'b', bos: 'b' }

/** Başlık → { name, number, class, sections: { key: { d, y, b? } } } sütun numaraları. Eşlenemeyen sütun hata olur. */
export function mapTableHeader(tpl: ExamTemplate, header: unknown[]) {
  const cols: { name?: number; number?: number; class?: number; sections: Record<string, Partial<Record<'d' | 'y' | 'b', number>>> } = { sections: {} }
  const errors: string[] = []
  const secs = tpl.sections.map((s) => ({ key: s.key, names: [h(s.key), h(s.label)] }))
  header.forEach((raw, i) => {
    const t = h(raw)
    if (!t) return
    if (/^(ad soyad|adi soyadi|ad|ogrenci|ogrenci adi|isim|ad soyadi)$/.test(t)) return void (cols.name ??= i)
    if (/^(okul no|okul numarasi|numara|no|ogrenci no)$/.test(t)) return void (cols.number ??= i)
    if (/^(sinif|sube|sinif sube)$/.test(t)) return void (cols.class ??= i)
    const m = t.match(/^(.*?)\s+(d|dogru|y|yanlis|b|bos)$/)
    const sec = m && secs.find((s) => s.names.includes(m[1]!))
    if (!m || !sec) return void errors.push(`"${String(raw)}" sütunu tanınmadı`)
    const k = KIND[m[2]!]!
    const slot = (cols.sections[sec.key] ??= {})
    if (slot[k] !== undefined) errors.push(`"${String(raw)}" sütunu iki kez var`)
    else slot[k] = i
  })
  if (cols.name === undefined && cols.number === undefined) errors.push('"Ad soyad" ya da "Okul no" sütunu gerekli')
  for (const [key, s] of Object.entries(cols.sections)) if (s.d === undefined || s.y === undefined) errors.push(`${key}: doğru (D) ve yanlış (Y) sütunlarının ikisi de gerekli`)
  if (!Object.keys(cols.sections).length) errors.push('Hiç bölüm sütunu yok (ör. "MAT D", "MAT Y")')
  return { cols, errors }
}

const cell = (row: unknown[], i: number | undefined) => (i === undefined ? '' : String(row[i] ?? '').trim())
const int = (s: string) => (/^\d{1,3}$/.test(s) ? Number(s) : NaN)

export interface ManualEntry { name: string; number: string | null; class: string | null; values: Record<string, { d: string; y: string; b?: string }> }

function section(tpl: ExamTemplate, key: string, d: string, y: string, b: string | undefined, warn: string[]): GenelSection | null {
  if (d === '' && y === '' && (b ?? '') === '') return null
  const s = tpl.sections.find((x) => x.key === key)!
  const D = int(d || '0'), Y = int(y || '0')
  if (Number.isNaN(D) || Number.isNaN(Y)) {
    warn.push(`${s.label}: doğru/yanlış sayı olmalı`)
    return null
  }
  const B = b === undefined || b === '' ? s.question_count - D - Y : int(b)
  if (Number.isNaN(B)) {
    warn.push(`${s.label}: boş sayı olmalı`)
    return null
  }
  return { label: key, n: s.question_count, d: D, y: Y, b: B, net: netOf(D, Y, tpl.wrong_per_correct) }
}

function record(tpl: ExamTemplate, i: number, e: ManualEntry): GenelRecord {
  const warnings: string[] = []
  const sections = Object.entries(e.values).map(([k, v]) => section(tpl, k, v.d, v.y, v.b, warnings)).filter((x): x is GenelSection => !!x)
  const g = (e.class ?? '').match(/^(\d{1,2})/)
  return {
    page: i + 1, pages: [i + 1],
    student: { name: e.name || null, number: e.number || null, class: e.class || null, classGrade: g ? Number(g[1]) : null },
    exam: { title: null }, score: null, sections, items: [], warnings,
  }
}

function pack(tpl: ExamTemplate, records: GenelRecord[], filename: string, sha256: string, kind: 'excel' | 'manuel'): GenelPack {
  return {
    engine: 'tablo-1.0.0', sha256, filename, detection: { family: kind === 'excel' ? 'TABLO' : 'MANUEL', format: null, confidence: 1, evidence: [kind === 'excel' ? 'Excel/CSV tablosu' : 'Elle giriş'], grade: { value: tpl.grade, confidence: 1, evidence: ['Şablondan'] } },
    records, failedPages: [],
  }
}

export function tableToPack(tpl: ExamTemplate, rows: unknown[][], filename: string, sha256: string): { pack: GenelPack | null; errors: string[] } {
  if (!rows.length) return { pack: null, errors: ['Dosya boş.'] }
  const { cols, errors } = mapTableHeader(tpl, rows[0]!)
  if (errors.length) return { pack: null, errors }
  const body = rows.slice(1).filter((r) => r.some((x) => String(x ?? '').trim() !== ''))
  if (!body.length) return { pack: null, errors: ['Başlıktan sonra satır yok.'] }
  if (body.length > MAX_TABLE_ROWS) return { pack: null, errors: [`En fazla ${MAX_TABLE_ROWS} satır yüklenebilir.`] }
  const records = body.map((r, i) =>
    record(tpl, i, {
      name: cell(r, cols.name), number: cell(r, cols.number) || null, class: cell(r, cols.class) || null,
      values: Object.fromEntries(Object.entries(cols.sections).map(([k, c]) => [k, { d: cell(r, c.d), y: cell(r, c.y), ...(c.b !== undefined ? { b: cell(r, c.b) } : {}) }])),
    }),
  )
  // Satır numarası = Excel satırı (başlık 1)
  records.forEach((r, i) => ((r.page = i + 2), (r.pages = [i + 2])))
  return { pack: pack(tpl, records, filename, sha256, 'excel'), errors: [] }
}

export const manualToPack = (tpl: ExamTemplate, entries: ManualEntry[]) => pack(tpl, entries.map((e, i) => record(tpl, i, e)), 'Elle giriş', '', 'manuel')

export async function sha256Hex(buf: ArrayBuffer) {
  const d = await crypto.subtle.digest('SHA-256', buf)
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('')
}
