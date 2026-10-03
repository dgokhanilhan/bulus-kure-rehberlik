// Genel deneme motoru çıktısı (public/engine/genel.mjs) → kontrol ekranı modeli → import_exam isteği.
// Bölüm etiketleri şablona eşlenir (belirsiz/eşlenemeyen etiket hata olur, tahmin edilmez); öğrenci eşleştirme mevcut
// kurallarla (okul no önce, sonra ad); seçmeli bölümler çözülür; kural doğrulaması burada önizlenir, sunucuda tekrarlanır.
import { matchStudent, type MatchResult, type RosterStudent } from './isim'
import { resolveOptional, totals, validateResult, type ExamTemplate, type ExamType, type SectionResults, type YksPart } from './denemeGenel'

export interface GenelSection { label: string; n: number; d: number; y: number; b: number; net: number }
export interface GenelItem { label: string; section: string | null; booklet: string | null; q: number; testQ: number; key: string | null; answer: string | null; mark: string | null; rawCode: string | null; rawText: string | null }
export interface GenelRecord {
  page: number
  pages: number[]
  student: { name: string | null; number: string | null; class: string | null; classGrade: number | null }
  exam: { title: string | null }
  score: number | null
  scores?: Record<string, number | null>
  sections: GenelSection[]
  items: GenelItem[]
  warnings: string[]
}
export interface Signal<T> { value: T; confidence: number; evidence: string[] }
export interface Detection {
  family: string
  format: string | null
  confidence: number
  evidence: string[]
  message?: string
  others?: { family: string; confidence: number }[]
  grade?: Signal<number | null>
  examType?: Signal<ExamType | null> & { yksPart: YksPart | null }
  publisher?: Signal<string>
  exam?: { title: string | null; code: string | null }
  wrongPerCorrect?: number
}
export interface GenelPack { engine: string; sha256: string; filename: string; pageCount?: number; detection: Detection; records: GenelRecord[]; failedPages: { page: number; error: string }[] }

// ---------------------------------------------------------------- bölüm etiketi → şablon bölümü
const nl = (t: string) => t.toLocaleUpperCase('tr').replace(/[^A-ZÇĞİÖŞÜ0-9]/g, '')
const letters = (t: string) => nl(t).replace(/\d+$/, '')
const digit = (t: string) => (nl(t).match(/(\d)$/) ?? [])[1] ?? ''

export function mapSections(tpl: ExamTemplate, labels: string[]) {
  const map: Record<string, string> = {}, unmapped: string[] = [], ambiguous: string[] = []
  for (const lab of labels) {
    const base = letters(lab), num = digit(lab)
    const exact = tpl.sections.filter((s) => nl(s.label) === nl(lab) || nl(s.key) === nl(lab))
    const cands = exact.length ? exact : tpl.sections.filter((s) => {
      const sb = letters(s.label), sn = digit(s.label) || digit(s.key)
      const nameOk = sb.startsWith(base) || base.startsWith(sb) || (base.length >= 5 && sb.startsWith(base.slice(0, Math.max(5, base.length - 2))))
      return nameOk && (num === sn || (num === '1' && sn === ''))
    })
    // Aynı etikete birden çok bölüm uyuyorsa (ör. TYT "FELSEFE-1" ↔ Felsefe), rakamı tam uyan tercih edilir
    const pick = cands.length > 1 ? cands.filter((s) => (digit(s.label) || digit(s.key)) === num) : cands
    if (pick.length === 1) map[lab] = pick[0]!.key
    else if (!pick.length && !cands.length) unmapped.push(lab)
    else ambiguous.push(lab)
  }
  const used = Object.values(map)
  const dup = used.filter((k, i) => used.indexOf(k) !== i)
  return { map, unmapped, ambiguous: [...ambiguous, ...labels.filter((l) => dup.includes(map[l]!))] }
}

// ---------------------------------------------------------------- kontrol ekranı modeli
export type Choice = { kind: 'student'; id: string } | { kind: 'new'; class_id: string } | { kind: 'skip' }
export interface GenelRow {
  key: string
  page: number
  read: GenelRecord['student']
  match: MatchResult
  choice: Choice | null
  sections: SectionResults
  errors: string[] // kural ihlali: düzeltilmeden ya da satır atlanmadan içe aktarılamaz
  notes: string[]
  /** Soru-kazanım verisi bu bölümlerde sonuçla tutarsız: o bölümlerin soru düzeyi gönderilmez (sonuç etkilenmez). */
  badItemSections: string[]
  gradeMismatch: boolean
  record: GenelRecord
}
export interface GenelReview {
  sha256: string
  filename: string
  detection: Detection
  template: ExamTemplate
  sectionMap: Record<string, string>
  mapErrors: string[]
  rows: GenelRow[]
  failedPages: { page: number; error: string; skip: boolean }[]
}

export function buildGenelReview(pack: GenelPack, tpl: ExamTemplate, roster: RosterStudent[]): GenelReview {
  const labels = [...new Set(pack.records.flatMap((r) => r.sections.map((s) => s.label)))]
  const { map, unmapped, ambiguous } = mapSections(tpl, labels)
  const mapErrors = [...unmapped.map((l) => `"${l}" bölümü şablonda yok`), ...ambiguous.map((l) => `"${l}" bölümü şablonda birden çok bölüme uyuyor`)]
  const rows: GenelRow[] = pack.records.map((r, i) => {
    let sections: SectionResults = {}
    for (const s of r.sections) if (map[s.label]) sections[map[s.label]!] = { d: s.d, y: s.y, b: s.b, net: s.net }
    sections = resolveOptional(tpl, sections)
    const errors = validateResult(tpl, sections)
    const missing = tpl.sections.filter((s) => !s.optional_group && sections[s.key] === undefined).map((s) => s.label)
    const notes: string[] = []
    if (missing.length) notes.push(`${missing.join(', ')} PDF'te yok; okunamadı olarak kalır.`)
    const badItemSections = [...new Set(r.warnings.filter((w) => /^ITEM_(COVERAGE|COUNTS):/.test(w)).map((w) => map[w.split(':')[1]!] ?? w.split(':')[1]!))]
    if (badItemSections.length) notes.push(`${badItemSections.join(', ')}: soru-kazanım bilgisi sonuçla tutarsız; bu bölümlerin kazanım analizi yapılmaz.`)
    const match = matchStudent({ name: r.student.name ?? '', number: r.student.number, class: r.student.class }, roster)
    const gradeMismatch = r.student.classGrade !== null && r.student.classGrade !== tpl.grade
    return { key: `${pack.sha256.slice(0, 12)}-${i}`, page: r.page, read: r.student, match, choice: match.kind === 'unknown' ? null : { kind: 'student', id: match.id }, sections, errors, notes, badItemSections, gradeMismatch, record: r }
  })
  // Aynı öğrenciye iki satır eşleşirse ikisi de karar ister
  const seen = new Map<string, GenelRow[]>()
  for (const row of rows) if (row.choice?.kind === 'student') seen.set(row.choice.id, [...(seen.get(row.choice.id) ?? []), row])
  for (const list of seen.values()) if (list.length > 1) for (const row of list) { row.choice = null; row.match = { kind: 'unknown', candidates: [] }; row.notes.push('Aynı öğrenciye birden fazla sayfa eşleşti; seçim yap.') }
  return { sha256: pack.sha256, filename: pack.filename, detection: pack.detection, template: tpl, sectionMap: map, mapErrors, rows, failedPages: pack.failedPages.map((f) => ({ ...f, skip: false })) }
}

/** Karar bekleyen konu sayısı (0 olunca içe aktarma açılır). */
export function genelPending(rv: GenelReview) {
  let n = rv.mapErrors.length + rv.failedPages.filter((f) => !f.skip).length
  for (const r of rv.rows) { if (!r.choice) n++; else if (r.choice.kind !== 'skip' && r.errors.length) n++ }
  return n
}

export interface ImportMeta {
  name: string
  exam_date: string
  grade: number
  exam_type: ExamType
  yks_part: YksPart | null
  exam_code: string | null
  publisher_id: string | null
  template_id: string
  target_class_ids: string[]
  status: 'taslak' | 'yayinda'
  notify: boolean
  allow_grade_mismatch: boolean
}

/** Soru düzeyi: aynı deneme için ilk tutarlı kaydın anahtarı + kod/metin (soru ↔ kazanım denemenin özelliğidir). */
export function examItems(rv: GenelReview) {
  const out = new Map<string, { section_key: string; q_no: number; correct_answer: string | null; raw_code: string | null; raw_text: string | null }>()
  for (const row of rv.rows) {
    if (row.choice?.kind === 'skip') continue
    for (const q of row.record.items) {
      const key = q.section ? rv.sectionMap[q.section] : undefined
      if (!key || row.badItemSections.includes(key)) continue
      const id = `${key}|${q.q}`
      if (!out.has(id) && (q.rawCode || q.rawText || q.key)) out.set(id, { section_key: key, q_no: q.q, correct_answer: q.key, raw_code: q.rawCode, raw_text: q.rawText })
    }
  }
  return [...out.values()]
}

export function toImportPayload(rv: GenelReview, meta: ImportMeta) {
  const rows = rv.rows.filter((r) => r.choice && r.choice.kind !== 'skip' && !r.errors.length)
  return {
    ...meta,
    sha256: rv.sha256,
    filename: rv.filename,
    source_kind: 'pdf' as const,
    format_code: rv.detection.format,
    detection: { family: rv.detection.family, confidence: rv.detection.confidence, grade: rv.detection.grade, examType: rv.detection.examType, publisher: rv.detection.publisher, evidence: rv.detection.evidence },
    items: examItems(rv),
    results: rows.map((r) => ({
      ...(r.choice!.kind === 'student' ? { student_id: r.choice!.id } : { new_student: { full_name: r.read.name ?? '', class_id: (r.choice as { class_id: string }).class_id, school_no: r.read.number } }),
      score: r.record.score,
      sections: r.sections,
      answers: Object.fromEntries(
        Object.entries(rv.sectionMap).map(([lab, key]) => [key, r.record.items.filter((q) => q.section === lab).sort((a, b) => a.q - b.q).map((q) => (q.mark === '+' ? (q.key ?? '?') : q.answer ? q.answer.toLowerCase() : '_')).join('')]),
      ),
      source: { page: r.page, pages: r.record.pages, format: rv.detection.format, scores: r.record.scores ?? null },
    })),
  }
}

export const previewTotals = (tpl: ExamTemplate, r: GenelRow) => totals(tpl, r.sections)
