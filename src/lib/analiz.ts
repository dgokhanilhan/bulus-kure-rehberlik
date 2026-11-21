// Deneme analizi: saf fonksiyonlar (arayüzden bağımsız, birim testli).
// Kurallar: CLAUDE.md §1–§2 ve docs/urun-ve-roller.md "İş kuralları".
//  - Sonuç (D/Y/B/net) exam_results.subjects'ten okunur; kazanım okuması bunu değiştirmez.
//  - Kazanım eşleşmesi güvenilir değilse (semantic/none) analize girmez.
//  - Okunamayan cevap ('?') boş ('_') değildir; tahmin edilmez.
import { pdfTopicKey, type PdfTopic } from './pdfTopics'

/** Ders anahtarı. LGS'de 6 sabit ders; genel denemelerde şablon bölümü anahtarı (ör. TDE, FEL2, TAR1). */
export type Subject = string
export type LgsSubject = 'TUR' | 'MAT' | 'FEN' | 'INK' | 'DIN' | 'ING'
export type MatchLevel = 'code_exact' | 'code_inferred' | 'text_exact' | 'text_match' | 'semantic' | 'none'

/** base: görev/etüt için ders kodu (subject_code); bölüm anahtarı dersle aynı değilse (FEL2 → FEL). */
export interface SubjectDef {
  code: Subject
  ad: string
  short: string
  q: number
  base?: string
}

export const SUBJECTS: SubjectDef[] = [
  { code: 'TUR', ad: 'Türkçe', short: 'Türkçe', q: 20 },
  { code: 'MAT', ad: 'Matematik', short: 'Matematik', q: 20 },
  { code: 'FEN', ad: 'Fen Bilimleri', short: 'Fen', q: 20 },
  { code: 'INK', ad: 'T.C. İnkılap Tarihi', short: 'İnkılap', q: 10 },
  { code: 'DIN', ad: 'Din Kültürü', short: 'Din', q: 10 },
  { code: 'ING', ad: 'İngilizce', short: 'İngilizce', q: 10 },
]
export const SUBJECT = Object.fromEntries(SUBJECTS.map((s) => [s.code, s])) as Record<LgsSubject, SubjectDef>
/** Veri setinin dersi (LGS: 6 sabit ders; genel: şablon bölümleri). */
export const subjectOf = (ds: Pick<Dataset, 'subjects'>, code: Subject): SubjectDef =>
  ds.subjects.find((s) => s.code === code) ?? { code, ad: code, short: code, q: 0 }

export interface Exam {
  id: string
  name: string
  publisher: string | null
  exam_date: string
}
export interface SubjectResult {
  d: number
  y: number
  b: number
  net: number
}
export interface Result {
  topics?: PdfTopic[]
  mergedSessions?: boolean
  scores?: import('./examScores').ExamScores
  exam_id: string
  student_id: string
  score: number | null
  subjects: Partial<Record<Subject, SubjectResult>>
  answers: Partial<Record<Subject, string>> | null
  /** Genel karne aktarımı büyük/küçük harfle D/Y saklar; eski LGS gerçek şıkları saklar. */
  answer_format?: 'status'
  outcomes_ok: boolean
  /** Gruplu kazanım verisi: subjects = güvenilir dersler; g[kod] = [soru, d, y, b]. */
  kazanim?: { subjects: Subject[]; g: Record<string, [number, number, number, number]> } | null
}
export interface Question {
  exam_id: string
  subject: Subject
  q_no: number
  correct_answer: string | null
  outcome_code: string | null
  match: MatchLevel
}
export interface Outcome {
  isTopic?: boolean
  /** Veri seti içinde tekil anahtar. LGS: resmî kod; genel: bölüm + katalog kimliği (resmî kod tek başına tekil değildir). */
  code: string
  subject: Subject
  title: string
  rawTitle?: string // AI katalog doğrulaması için kaynaktaki metin; görünümde temizlenmiş title kullanılır.
  /** Gösterilen resmî kod (genel); yoksa code gösterilir. */
  display?: string | null
  /** Yeni katalogdaki kazanım kimliği (genel; görev bağlantısı). */
  outcomeId?: string
  source?: 'official' | 'pdf'
  outcomeType?: 'KAZANIM' | 'OGRENME_CIKTISI'
}
export const outcomeCode = (o: Outcome) => (o.isTopic ? '—' : o.outcomeId ? (o.display ?? '—') : o.code)
export const outcomeSourceLabel = (o: Pick<Outcome, 'source' | 'isTopic'>) => (o.isTopic ? 'PDF konu analizi' : o.source === 'pdf' ? 'Okulun PDF’den eklediği hedef' : 'Resmî program hedefi')

export const RELIABLE: MatchLevel[] = ['code_exact', 'code_inferred', 'text_exact', 'text_match']

/** Toplam net: okunan derslerin netlerinin toplamı (1. sayfadaki resmî sonuçtan). "Uygulanmadı" ve okunamayan ders katılmaz. */
export const totalNet = (r: Result) => Object.values(r.subjects).reduce((a, v) => a + (v && typeof v.net === 'number' ? v.net : 0), 0)
export const subjectNet = (r: Result | undefined, s: Subject) => r?.subjects[s]?.net ?? null

/**
 * Bir öğrencinin bir denemede bir kazanımdaki durumu:
 *  y yanlış · d doğru · b boş · o okunamadı · n soru yok · x denemeye girmedi
 */
export type KonuStatus = 'y' | 'd' | 'b' | 'o' | 'n' | 'x'

export function konuStatus(result: Result | undefined, examQuestions: Question[], subject: Subject, code: string): KonuStatus {
  if (!result) return 'x'
  if (code.startsWith('pdf-topic:')) {
    const t = result.topics?.find(t=>t.section===subject && pdfTopicKey(t)===code)
    return !t ? 'n' : t.y>0 ? 'y' : t.b>0 ? 'b' : 'd'
  }
  // Gruplu kazanım (kazanım × D/Y/B): o dersin grupları güvenilirse oradan; tutarsız ders "okunamadı".
  const k = result.kazanim
  if (k && !code.includes(':')) {
    if (!k.subjects.includes(subject)) return 'o'
    const g = k.g[code]
    if (!g) return 'n'
    if (g[2] > 0) return 'y'
    return g[1] === g[0] ? 'd' : 'b'
  }
  const subj = examQuestions.filter((q) => q.subject === subject)
  if (!result.outcomes_ok || subj.every((q) => q.outcome_code === null)) return 'o'
  const qs = subj.filter((q) => q.outcome_code === code)
  const rel = qs.filter((q) => RELIABLE.includes(q.match))
  if (!rel.length) return qs.length ? 'o' : 'n'
  const ans = result.answers?.[subject]
  if (!ans) return 'o'
  const marks = rel.map((q) => {
    const ch = ans[q.q_no - 1]
    if (result.answer_format === 'status') {
      if (ch === '_' || ch === ' ') return 'b'
      if (ch === '?' || (ch && /^[A-Z]$/.test(ch))) return 'd'
      if (ch && /^[a-z]$/.test(ch)) return 'y'
      return 'o'
    }
    if (ch === undefined || ch === '?' || !q.correct_answer) return 'o'
    if (ch === '_' || ch === ' ') return 'b'
    return ch === q.correct_answer ? 'd' : 'y'
  })
  if (marks.includes('y')) return 'y'
  if (marks.includes('o')) return 'o'
  if (marks.every((m) => m === 'd')) return 'd'
  return 'b'
}

export interface Repeat {
  outcome: Outcome
  count: number
  hist: KonuStatus[]
  examNames: string[]
  lastWrong: boolean
}

export interface Dataset {
  /** Bu veri setinin dersleri (sıra = gösterim sırası). */
  subjects: SubjectDef[]
  exams: Exam[] // tarihe göre artan
  questionsByExam: Map<string, Question[]>
  questionsByResult?: Map<string, Question[]>
  outcomes: Outcome[]
  results: Result[]
}

export const questionsFor = (ds: Dataset, r: Pick<Result, 'exam_id' | 'student_id'>) =>
  ds.questionsByResult?.get(r.exam_id + '|' + r.student_id) ?? ds.questionsByExam.get(r.exam_id) ?? []

export const indexResults = (results: Result[]) => {
  const m = new Map<string, Result>()
  for (const r of results) m.set(`${r.exam_id}|${r.student_id}`, r)
  return m
}

/** Öğrencinin girdiği denemeler (eskiden yeniye) ve sonuçları. */
export function studentExams(ds: Dataset, sid: string, idx = indexResults(ds.results)) {
  return ds.exams.flatMap((e) => {
    const r = idx.get(`${e.id}|${sid}`)
    return r ? [{ exam: e, result: r }] : []
  })
}

/** Tekrar eden hata: aynı kazanım, güvenilir eşleşmeyle ≥ 2 denemede yanlış. */
/** Okul ayarı (analiz.tekrar_esik): aynı konu en az bu kadar denemede yanlışsa tekrar eden hata. Uygulama açılışta ayarlar. */
let TEKRAR_ESIK = 2
export function analizAyarla(a: { tekrarEsik?: number }) {
  if (a.tekrarEsik && a.tekrarEsik >= 2) TEKRAR_ESIK = a.tekrarEsik
}
export function repeats(ds: Dataset, sid: string, uptoExamId?: string, idx = indexResults(ds.results), minCount = TEKRAR_ESIK): Repeat[] {
  let ex = studentExams(ds, sid, idx)
  if (uptoExamId) {
    const upto = ds.exams.find((e) => e.id === uptoExamId)
    const position = ex.findIndex((x) => x.exam.id === uptoExamId)
    if (position >= 0) ex = ex.slice(0, position + 1)
    else if (upto) ex = ex.filter((x) => x.exam.exam_date <= upto.exam_date)
  }
  const out: Repeat[] = []
  for (const o of ds.outcomes) {
    const hist = ex.map((x) => konuStatus(x.result, questionsFor(ds, x.result), o.subject, o.code))
    const count = hist.filter((h) => h === 'y').length
    if (count >= minCount)
      out.push({ outcome: o, count, hist, examNames: ex.filter((_, i) => hist[i] === 'y').map((x) => x.exam.name), lastWrong: hist[hist.length - 1] === 'y' })
  }
  return out.sort((a, b) => b.count - a.count || Number(b.lastWrong) - Number(a.lastWrong))
}

/** Bir denemede yanlış yapılan kazanımlar (güvenilir eşleşmeler) ve okunamayan bilgi var mı. */
export function wrongOutcomes(ds: Dataset, r: Result) {
  const qs = questionsFor(ds, r)
  const wrong: Outcome[] = []
  let unreadable = false
  for (const o of ds.outcomes) {
    const st = konuStatus(r, qs, o.subject, o.code)
    if (st === 'y') wrong.push(o)
    if (st === 'o') unreadable = true
  }
  const order = (o: Outcome) => ds.subjects.findIndex((x) => x.code === o.subject)
  wrong.sort((a, b) => order(a) - order(b))
  return { wrong, unreadable }
}

// ---------- Görevin etkisi ("işe yaradı mı?") ----------
export interface GorevEtki {
  /** Görev verilmeden önce bu konunun yanlış çıktığı deneme sayısı */
  once: number
  /** Görevden sonraki denemelerde bu konunun durumu (yalnız güvenilir okunanlar: y/d/b), eskiden yeniye */
  sonra: ('y' | 'd' | 'b')[]
  /** bekliyor: görevden sonra bu konu henüz (güvenilir biçimde) sorulmadı */
  durum: 'bekliyor' | 'duzeldi' | 'suruyor' | 'bos'
  /** Sondan geriye art arda kaç denemede doğru */
  dogruSeri: number
}
/**
 * Kazanıma bağlı bir görevden sonra o kazanım denemelerde nasıl gitti. Yorum yok, yalnız olgu: görev tarihinden sonraki
 * denemelerde konu doğru mu, yanlış mı, boş mu. Kazanım eşleşmesi güvenilir değilse o deneme sayılmaz (veri uydurma yok).
 * Görev kazanıma bağlı değilse ya da kazanım veri setinde yoksa null.
 */
export function gorevEtkisi(
  ds: Dataset,
  sid: string,
  t: { outcome_code: string | null; learning_outcome_id?: string | null; created_at: string },
  idx = indexResults(ds.results),
): GorevEtki | null {
  const o = ds.outcomes.find((x) => (t.learning_outcome_id ? x.outcomeId === t.learning_outcome_id : !!t.outcome_code && x.code === t.outcome_code))
  if (!o) return null
  // Görevin verildiği gün (Türkiye saati); o günkü deneme "önce" sayılır
  const gun = new Date(new Date(t.created_at).getTime() + 3 * 3600_000).toISOString().slice(0, 10)
  let once = 0
  const sonra: GorevEtki['sonra'] = []
  for (const x of studentExams(ds, sid, idx)) {
    const st = konuStatus(x.result, questionsFor(ds, x.result), o.subject, o.code)
    if (x.exam.exam_date <= gun) {
      if (st === 'y') once++
    } else if (st === 'y' || st === 'd' || st === 'b') sonra.push(st)
  }
  const son = sonra[sonra.length - 1]
  let dogruSeri = 0
  for (let i = sonra.length - 1; i >= 0 && sonra[i] === 'd'; i--) dogruSeri++
  return { once, sonra, durum: !son ? 'bekliyor' : son === 'd' ? 'duzeldi' : son === 'y' ? 'suruyor' : 'bos', dogruSeri }
}
/** Kazanıma bağlı görevlerin özeti: kaçında konu sonraki denemede doğruya döndü */
export function gorevEtkiOzeti(l: readonly (GorevEtki | null)[]): { olculen: number; duzelen: number; bekleyen: number } {
  const e = l.filter((x): x is GorevEtki => !!x)
  return { olculen: e.filter((x) => x.durum !== 'bekliyor').length, duzelen: e.filter((x) => x.durum === 'duzeldi').length, bekleyen: e.filter((x) => x.durum === 'bekliyor').length }
}

// ---------- Bugün kuralları ----------
export interface TodaySettings {
  netDrop: number // son iki deneme arası toplam net ≤ −netDrop
  netRise: number // ≥ +netRise olumlu
  repeatMin: number // son denemede ≥ repeatMin kez tekrar eden (kalıcı) hata
}
export const DEFAULT_TODAY: TodaySettings = { netDrop: 3, netRise: 5, repeatMin: 3 }

export interface TaskLite {
  student_id: string
  topic: string
  solved: number
  question_count: number
  due_date: string
  completed_at: string | null
}
export const isOverdue = (t: TaskLite, today: string) => !t.completed_at && t.due_date < today

export type AttentionKind = 'down' | 'n' | 'up'
export interface Attention {
  sid: string
  kind: AttentionKind
  tag: 'Düşüş' | 'Tekrar eden hata' | 'Eksik' | 'Gecikme' | 'Gelişim'
  short: string
  pr: number
}

const f0 = (n: number) => fmt(n, 0)

/** Bugün ilgilenilmesi gereken öğrenciler (prototipteki attention()). */
/**
 * opts.goreli (Bugün ekranı): düşüş, öğrencinin değişimi − listedeki öğrencilerin ortalama değişimi ile ölçülür ("sınıfa göre").
 * Zor bir denemede herkes düştüğünde yalnız gerçekten ayrışanlar kalır. En az 2 öğrencinin iki denemesi yoksa ham değişim kullanılır.
 */
export function attention(
  ds: Dataset,
  students: { id: string }[],
  tasks: TaskLite[],
  today: string,
  st: TodaySettings = DEFAULT_TODAY,
  opts: { goreli?: boolean } = {},
): Attention[] {
  const idx = indexResults(ds.results)
  const L = ds.exams[ds.exams.length - 1]
  const P = ds.exams[ds.exams.length - 2]
  const out: Attention[] = []
  let ort: number | null = null
  if (opts.goreli && L && P) {
    const fl = students.flatMap((s) => {
      const a = idx.get(`${L.id}|${s.id}`)
      const b = idx.get(`${P.id}|${s.id}`)
      return a && b ? [totalNet(a) - totalNet(b)] : []
    })
    if (fl.length >= 2) ort = fl.reduce((t, x) => t + x, 0) / fl.length
  }
  for (const s of students) {
    if (!L) break
    const a = idx.get(`${L.id}|${s.id}`)
    const b = P ? idx.get(`${P.id}|${s.id}`) : undefined
    if (!a && !b) {
      out.push({ sid: s.id, kind: 'n', tag: 'Eksik', short: P ? `Son 2 denemeye (${P.name}, ${L.name}) girmedi` : `${L.name} denemesine girmedi`, pr: 3 })
      continue
    }
    if (!a) {
      out.push({ sid: s.id, kind: 'n', tag: 'Eksik', short: `${L.name} denemesine girmedi`, pr: 4 })
      continue
    }
    const d = b ? totalNet(a) - totalNet(b) : 0
    const dd = ort === null ? d : d - ort
    if (b && dd <= -st.netDrop) {
      let worst = ds.subjects[0]!
      let wd = Infinity
      for (const sub of ds.subjects) {
        const dd = (subjectNet(a, sub.code) ?? 0) - (subjectNet(b, sub.code) ?? 0)
        if (dd < wd) {
          wd = dd
          worst = sub
        }
      }
      const tri = studentExams(ds, s.id, idx)
        .slice(-3)
        .map((x) => f0(subjectNet(x.result, worst.code) ?? 0))
      const ek = ort === null ? '' : ` · sınıfa göre −${fmt(-dd)} net`
      out.push({ sid: s.id, kind: 'down', tag: 'Düşüş', short: `${worst.short} ${tri.join(' → ')}${ek}`, pr: 1 })
      continue
    }
    const rep = repeats(ds, s.id, undefined, idx).filter((r) => r.count >= st.repeatMin && r.lastWrong)
    if (rep[0]) out.push({ sid: s.id, kind: 'down', tag: 'Tekrar eden hata', short: `${rep[0].outcome.title}: ${rep[0].count} denemede yanlış`, pr: 2 })
    else if (b && d >= st.netRise) out.push({ sid: s.id, kind: 'up', tag: 'Gelişim', short: `Toplam net ${f0(totalNet(b))} → ${f0(totalNet(a))}`, pr: 6 })
  }
  for (const t of tasks) {
    if (isOverdue(t, today) && !out.some((o) => o.sid === t.student_id && o.tag === 'Gecikme'))
      out.push({ sid: t.student_id, kind: 'n', tag: 'Gecikme', short: `${t.topic} görevi ${t.solved}/${t.question_count}`, pr: 5 })
  }
  return out.sort((x, y) => x.pr - y.pr)
}

// ---------- Biçim ----------
/** Türkçe sayı: ondalık virgül. */
export const fmt = (n: number, d = 1) => (Math.round(n * 10 ** d) / 10 ** d).toFixed(d).replace('.', ',')
export const signed = (n: number, d = 1) => (n > 0 ? '+' : '') + fmt(n, d)

// ---------- Sınıf ısı haritası ----------
export interface HeatCell {
  p: number | null // güvenilir sorulardaki doğru yüzdesi; null = konu okunamadı / soru yok
  wrong: string[] // bu denemede bu konuda en az bir yanlışı olan öğrenciler
}
export interface HeatRow {
  outcome: Outcome
  cells: HeatCell[]
}

/**
 * Şube × ders × deneme: konu başına doğru oranı (yalnız güvenilir eşleşmeler ve konu bölümü okunabilen öğrenciler).
 * Satırlar: seçilen denemelerde güvenilir sorusu olan kazanımlar.
 */
export function classHeat(ds: Dataset, studentIds: string[], subject: Subject, exams: Exam[]): HeatRow[] {
  const idx = indexResults(ds.results)
  const codes = new Set<string>()
  for (const e of exams)
    for (const sid of studentIds)
      for (const q of questionsFor(ds, { exam_id: e.id, student_id: sid }))
        if (q.subject === subject && q.outcome_code && RELIABLE.includes(q.match)) codes.add(q.outcome_code)
  for (const e of exams)
    for (const sid of studentIds) {
      for (const t of idx.get(`${e.id}|${sid}`)?.topics ?? []) if(t.section===subject) codes.add(pdfTopicKey(t))
      const k = idx.get(`${e.id}|${sid}`)?.kazanim
      if (k?.subjects.includes(subject)) for (const c of Object.keys(k.g)) codes.add(c)
    }
  const outs = ds.outcomes.filter((o) => o.subject === subject && codes.has(o.code))
  return outs.map((o) => ({
    outcome: o,
    cells: exams.map((e) => {
      let total = 0
      let correct = 0
      const wrong: string[] = []
      for (const sid of studentIds) {
        const r = idx.get(`${e.id}|${sid}`)
        if (o.isTopic) {
          const t = r?.topics?.find(t=>pdfTopicKey(t)===o.code)
          if(t) { total+=t.n;correct+=t.d;if(t.y>0)wrong.push(sid) }
          continue
        }
        // Gruplu kazanım verisi olan öğrenci: sayılar gruptan (yeni katalog hedefleri "ders:uuid" soru bazlı yoldan)
        if (r?.kazanim && !o.code.includes(':')) {
          const g = r.kazanim.subjects.includes(subject) ? r.kazanim.g[o.code] : undefined
          if (g) {
            total += g[0]
            correct += g[1]
            if (g[2] > 0) wrong.push(sid)
          }
          continue
        }
        const qs = r
          ? questionsFor(ds, r).filter((q) => q.subject === subject && q.outcome_code === o.code && RELIABLE.includes(q.match) && q.correct_answer)
          : []
        if (!qs.length) continue
        const ans = r?.answers?.[subject]
        if (!r || !r.outcomes_ok || !ans) continue
        let w = false
        for (const q of qs) {
          const ch = ans[q.q_no - 1]
          if (ch === undefined || ch === '?') continue
          total++
          if (ch === q.correct_answer) correct++
          else if (ch !== '_' && ch !== ' ') w = true
        }
        if (w) wrong.push(sid)
      }
      return total ? { p: Math.round((correct / total) * 100), wrong } : { p: null, wrong: [] }
    }),
  }))
}
