// Deneme Köprüsü (legacy motor) çıktısı → kontrol ekranı → yayın verisi.
// Kurallar: sonuç (D/Y/B/net/puan) 1. sayfadaki resmî değerden gelir ve kazanım okumasından bağımsızdır;
// okunamayan alan boş/okunamadı kalır, uydurulmaz (CLAUDE.md §1–§2).
import type { MatchLevel, Subject } from './analiz'
import { matchStudent, type MatchResult, type RosterStudent } from './isim'

export const SUBJECT_ORDER: Subject[] = ['TUR', 'MAT', 'FEN', 'INK', 'DIN', 'ING']
export const QCOUNT: Record<Subject, number> = { TUR: 20, MAT: 20, FEN: 20, INK: 10, DIN: 10, ING: 10 }

// ---------- Motor çıktısı (DK 1.0.0, public/engine/schema.json) ----------
export interface DkSubject {
  id: Subject
  questionCount: number
  correct: number | null
  wrong: number | null
  blank: number | null
  net: number | null
}
export interface DkQuestion {
  subject: Subject
  number: number
  correctAnswer: string
  studentAnswer: string | null
  status: 'correct' | 'wrong' | 'blank' | 'credited'
  officialOutcomeCode: string | null
  outcomeMatchMethod: string
  questionOutcomeMethod: string
}
export interface DkOutcomeGroup {
  subject: Subject
  questionCount: number
  correct: number
  wrong: number
  blank: number
  officialOutcomeCode: string | null
  outcomeMatchMethod: string
}
export interface DkRecord {
  recordId: string
  source: { filename: string; sha256: string; pages: number[]; adapter: string }
  student: { name: string; number?: string | null; class?: string | null }
  exam: { name: string | null; score: number | null; totalNet: number; date?: string | null }
  subjects: DkSubject[]
  questions: DkQuestion[]
  outcomeGroups?: DkOutcomeGroup[]
  validation: { errors: string[]; warnings: string[] }
}
export interface DkPack {
  schemaVersion: '1.0.0'
  records: DkRecord[]
  sources?: { filename: string; sha256: string; pageCount: number }[]
  failedPages?: { filename: string; page: number; error: string }[]
}

const SUBJECT_NAME: Record<Subject, string> = { TUR: 'Türkçe', MAT: 'Matematik', FEN: 'Fen Bilimleri', INK: 'İnkılap Tarihi', DIN: 'Din Kültürü', ING: 'İngilizce' }

export const ADAPTER_PUBLISHER: Record<string, string> = {
  hiz_cards_v1: 'Hız Yayınları',
  fenomen_rows_v1: 'Fenomen Yayınları',
  schoolnet_grouped_v1: '',
}

const MATCH: Record<string, MatchLevel> = {
  CODE_EXACT: 'code_exact',
  CODE_PARENT: 'code_inferred',
  TEXT_EXACT: 'text_exact',
  TEXT_PREFIX: 'text_match',
}
// (UNVERIFIED ve anlamsal eşleşmeler analize girmez: CLAUDE.md §1)

// ---------- Kontrol ekranı modeli ----------
export type StudentChoice = { kind: 'student'; id: string } | { kind: 'new'; class_name: string } | { kind: 'skip' }
export interface SubjectIssue {
  subject: Subject
  d: number | null
  y: number | null
  b: number | null
  net: number | null
  canFix: boolean // boş = soru sayısı − D − Y ile tutarlı hale gelebilir mi
  choice: 'fix' | 'null' | null
}
export interface ReviewRow {
  key: string
  page: number
  read: { name: string; number: string | null; class: string | null }
  match: MatchResult
  choice: StudentChoice | null // null → karar bekliyor
  subjects: Partial<Record<Subject, DkSubject>>
  subjectIssues: SubjectIssue[]
  outcomesReadable: boolean
  /** Soru bazlı cevapları sonuçla tutmayan dersler (bu derslerin soru-konu analizi yapılmaz). */
  badQuestionSubjects: Subject[]
  /** Kazanım grubu toplamları sonuçla tutmayan dersler (bu derslerin grup analizi yapılmaz). */
  badGroupSubjects: Subject[]
  notes: string[] // bilgi amaçlı (karar istemez)
  record: DkRecord
}
export interface Review {
  sha256: string | null
  adapter: string | null
  examName: string | null
  rows: ReviewRow[]
  failedPages: { page: number; error: string; skip: boolean }[]
}

const near = (a: number, b: number) => Math.abs(a - b) <= 0.011

export function buildReview(pack: DkPack, roster: RosterStudent[]): Review {
  const rows: ReviewRow[] = pack.records.map((r) => {
    const subjects: Partial<Record<Subject, DkSubject>> = {}
    for (const s of r.subjects) subjects[s.id] = s
    const errs = r.validation?.errors ?? []
    const subjectIssues: SubjectIssue[] = []
    for (const code of SUBJECT_ORDER) {
      const s = subjects[code]
      if (!s || s.correct == null) continue
      if (errs.includes(`COUNTS:${code}`) || errs.includes(`NET:${code}`)) {
        const n = QCOUNT[code]
        const canFix = s.wrong != null && s.net != null && s.correct + s.wrong <= n && near(s.net, s.correct - s.wrong / 3)
        subjectIssues.push({ subject: code, d: s.correct, y: s.wrong, b: s.blank, net: s.net, canFix, choice: null })
      }
    }
    const notes: string[] = []
    const missing = SUBJECT_ORDER.filter((c) => !subjects[c] || subjects[c]!.correct == null)
    if (missing.length) notes.push(`${missing.length} dersin sonucu PDF'te yok; boş bırakıldı.`)
    const errSubjects = (re: RegExp) => SUBJECT_ORDER.filter((c) => errs.some((e) => re.test(e) && e.split(':')[1] === c))
    const badQuestionSubjects = errSubjects(/^(QUESTION_COVERAGE|ANSWER_COUNTS):/)
    const badGroupSubjects = errSubjects(/^GROUP_COUNTS:/)
    const hasGroups = (r.outcomeGroups ?? []).length > 0
    // Tutarsızlık yalnız ilgili dersi etkiler: o dersin konu analizi yapılmaz, diğer dersler ve sonuçlar etkilenmez.
    const noKz = [...new Set([...(hasGroups ? badGroupSubjects : badQuestionSubjects)])]
    if (noKz.length) notes.push(`${noKz.map((c) => SUBJECT_NAME[c]).join(', ')} için konu bilgisi sonuçla tutarlı okunamadı; ${noKz.length > 1 ? 'bu derslerin' : 'bu dersin'} konu analizi yapılmaz.`)
    const match = matchStudent({ name: r.student.name, number: r.student.number, class: r.student.class }, roster)
    return {
      key: r.recordId,
      page: r.source?.pages?.[0] ?? 0,
      read: { name: r.student.name, number: r.student.number ?? null, class: r.student.class ?? null },
      match,
      choice: match.kind === 'unknown' ? null : { kind: 'student', id: match.id },
      subjects,
      subjectIssues,
      outcomesReadable: r.questions.length > 0 || hasGroups,
      badQuestionSubjects,
      badGroupSubjects,
      notes,
      record: r,
    }
  })
  // Aynı öğrenciye iki satır eşleşirse ikisi de kontrol ister.
  const seen = new Map<string, ReviewRow[]>()
  for (const row of rows) if (row.choice?.kind === 'student') seen.set(row.choice.id, [...(seen.get(row.choice.id) ?? []), row])
  for (const list of seen.values())
    if (list.length > 1)
      for (const row of list) {
        row.choice = null
        row.match = { kind: 'unknown', candidates: row.match.kind === 'unknown' ? row.match.candidates : [row.match.id] }
        row.notes.push('Aynı öğrenciye birden fazla sayfa eşleşti; hangisinin kime ait olduğunu seç.')
      }
  const first = pack.records[0]
  return {
    sha256: pack.sources?.[0]?.sha256 ?? first?.source?.sha256 ?? null,
    adapter: first?.source?.adapter ?? null,
    examName: first?.exam?.name ?? null,
    rows,
    failedPages: (pack.failedPages ?? []).map((f) => ({ page: f.page, error: f.error, skip: false })),
  }
}

/** Karar bekleyen konu sayısı (0 olunca Yayınla açılır). */
export function pendingCount(rv: Review) {
  let n = 0
  for (const r of rv.rows) {
    if (!r.choice) n++
    if (r.choice?.kind !== 'skip') n += r.subjectIssues.filter((i) => !i.choice).length
  }
  n += rv.failedPages.filter((f) => !f.skip).length
  return n
}

// ---------- Yayın verisi ----------
export interface PublishPayload {
  name: string
  publisher: string | null
  template_id: string | null
  exam_date: string
  sha256: string | null
  notify: boolean
  questions: { subject: Subject; q_no: number; correct_answer: string | null; outcome_code: string | null; match: MatchLevel }[]
  results: {
    student_id?: string
    new_student?: { full_name: string; class_name: string; school_no: string | null }
    score: number | null
    subjects: Partial<Record<Subject, { d: number; y: number; b: number; net: number } | null>>
    answers: Partial<Record<Subject, string>>
    outcomes_ok: boolean
    kazanim: { subjects: Subject[]; g: Record<string, [number, number, number, number]> } | null
    source: { page: number; adapter: string | null; recordId: string }
  }[]
}

function majority<T>(xs: T[], key: (x: T) => string): T | undefined {
  const c = new Map<string, { x: T; n: number }>()
  for (const x of xs) {
    const k = key(x)
    const e = c.get(k)
    if (e) e.n++
    else c.set(k, { x, n: 1 })
  }
  let best: { x: T; n: number } | undefined
  for (const e of c.values()) if (!best || e.n > best.n) best = e
  return best?.x
}

export function buildPayload(rv: Review, meta: { name: string; publisher: string | null; exam_date: string; notify: boolean }): PublishPayload {
  const rows = rv.rows.filter((r) => r.choice && r.choice.kind !== 'skip')

  // Cevap anahtarı ve soru-kazanım: öğrencilerin çoğunluğundaki değer (kitapçık farkı olan öğrencinin konu analizi kapanır).
  const questions: PublishPayload['questions'] = []
  const keyOf = new Map<string, string>()
  for (const subject of SUBJECT_ORDER) {
    for (let no = 1; no <= QCOUNT[subject]; no++) {
      const qs = rows.map((r) => r.record.questions.find((q) => q.subject === subject && q.number === no)).filter((q): q is DkQuestion => !!q)
      if (!qs.length) continue
      const k = majority(qs, (q) => q.correctAnswer)!.correctAnswer
      keyOf.set(`${subject}|${no}`, k)
      const src = qs.filter((q) => q.questionOutcomeMethod === 'SOURCE_ROW' && q.officialOutcomeCode && MATCH[q.outcomeMatchMethod] && q.status !== 'credited')
      const o = majority(src, (q) => `${q.officialOutcomeCode}|${q.outcomeMatchMethod}`)
      const credited = qs.some((q) => q.status === 'credited')
      questions.push({
        subject,
        q_no: no,
        correct_answer: /^[ABCDE]$/.test(k) ? k : null,
        outcome_code: !credited && o ? o.officialOutcomeCode : null,
        match: !credited && o ? MATCH[o.outcomeMatchMethod]! : 'none',
      })
    }
  }

  const results = rows.map((r) => {
    const subjects: PublishPayload['results'][number]['subjects'] = {}
    const answers: Partial<Record<Subject, string>> = {}
    let keyMismatch = false
    for (const code of SUBJECT_ORDER) {
      const s = r.subjects[code]
      const issue = r.subjectIssues.find((i) => i.subject === code)
      if (!s || s.correct == null || s.wrong == null || s.net == null || issue?.choice === 'null') subjects[code] = null
      else if (issue?.choice === 'fix') subjects[code] = { d: s.correct, y: s.wrong, b: QCOUNT[code] - s.correct - s.wrong, net: s.net }
      else subjects[code] = { d: s.correct, y: s.wrong, b: s.blank ?? QCOUNT[code] - s.correct - s.wrong, net: s.net }
      let a = ''
      if (r.badQuestionSubjects.includes(code)) {
        answers[code] = '?'.repeat(QCOUNT[code]) // tutarsız okunan dersin cevapları "okunamadı" (boş değil)
        continue
      }
      for (let no = 1; no <= QCOUNT[code]; no++) {
        const q = r.record.questions.find((x) => x.subject === code && x.number === no)
        if (q && keyOf.get(`${code}|${no}`) !== q.correctAnswer) keyMismatch = true
        a += !q ? '?' : q.status === 'blank' ? '_' : q.studentAnswer && /^[A-E]$/i.test(q.studentAnswer) ? q.studentAnswer.toUpperCase() : '?'
      }
      answers[code] = a
    }
    // Kazanım grupları: yalnız tutarlı dersler ve güvenilir eşleşmeler (kod / birebir metin / metin başlangıcı)
    const groups = r.record.outcomeGroups ?? []
    const gSubjects = SUBJECT_ORDER.filter((c) => groups.some((g) => g.subject === c) && !r.badGroupSubjects.includes(c))
    const g: Record<string, [number, number, number, number]> = {}
    for (const x of groups) {
      if (!gSubjects.includes(x.subject) || !x.officialOutcomeCode || !MATCH[x.outcomeMatchMethod]) continue
      const cur = g[x.officialOutcomeCode] ?? [0, 0, 0, 0]
      g[x.officialOutcomeCode] = [cur[0] + x.questionCount, cur[1] + x.correct, cur[2] + x.wrong, cur[3] + x.blank]
    }
    const c = r.choice!
    const base = {
      score: r.record.exam.score ?? null,
      subjects,
      answers,
      outcomes_ok: r.outcomesReadable && !keyMismatch,
      kazanim: gSubjects.length ? { subjects: gSubjects, g } : null,
      source: { page: r.page, adapter: r.record.source?.adapter ?? null, recordId: r.key },
    }
    return c.kind === 'student'
      ? { ...base, student_id: c.id }
      : { ...base, new_student: { full_name: titleCase(r.read.name), class_name: c.kind === 'new' ? c.class_name : '8/A', school_no: r.read.number } }
  })

  return { name: meta.name.trim(), publisher: meta.publisher, template_id: rv.adapter, exam_date: meta.exam_date, sha256: rv.sha256, notify: meta.notify, questions, results }
}

/** "ZEYNEP KAYA" → "Zeynep Kaya" (Türkçe). */
export const titleCase = (s: string) =>
  s
    .trim()
    .toLocaleLowerCase('tr')
    .split(/\s+/)
    .map((w) => w.charAt(0).toLocaleUpperCase('tr') + w.slice(1))
    .join(' ')

// ---------- Regresyon: sonuç alanlarının maskeli özeti ----------
/** D/Y/B/net/puan ve sayfa; öğrenci adı ve numarası repoya girmez. */
export function regressionSummary(pack: DkPack) {
  return {
    records: pack.records.map((r, i) => ({
      page: r.source?.pages?.[0] ?? null,
      student: `Öğrenci ${i + 1}`, // ad, numara ve şube repoya girmez
      score: r.exam.score ?? null,
      totalNet: r.exam.totalNet,
      subjects: Object.fromEntries(SUBJECT_ORDER.map((c) => {
        const s = r.subjects.find((x) => x.id === c)
        return [c, s ? [s.correct, s.wrong, s.blank, s.net] : null]
      })),
      errors: r.validation?.errors ?? [],
    })),
    failedPages: (pack.failedPages ?? []).map((f) => ({ page: f.page, error: f.error })),
  }
}
