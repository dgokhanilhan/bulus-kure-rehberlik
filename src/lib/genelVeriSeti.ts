// Genel denemeler → profil veri modeli (saf; arayüzden bağımsız, birim testli). Kancalar: sinavBaglami.ts.
import { examFamily, examStage, isScore, type ExamType, type Profile, type SectionResults, type TemplateSection, type YksPart } from './denemeGenel'
import type { Dataset, MatchLevel, Outcome, Question, Result, SubjectDef } from './analiz'
import { outcomeTitle } from './outcomeTitle'

/** Profilin deneme bağlamı: 8 → LGS (mevcut), 5–7 → okul denemeleri, 9–12 → YKS (TYT / AYT ayrı seri). */
// Yapısal tipler (denemeData'nın satırlarıyla uyumlu; Supabase istemcisine bağımlılık yok)
export interface GenelExam { id: string; name: string; exam_date: string; exam_type: ExamType | null; yks_part: YksPart | null; publisher: string | null; exam_template_id: string | null }
export interface GenelResult { exam_id: string; student_id: string; score: number | null; subjects: SectionResults; answers: Record<string, string> | null }
export interface TemplateRow { id: string; sections: TemplateSection[] }

export type ExamCtxKind = 'LGS' | 'OKUL' | 'YKS'
export type YksFamily = 'TYT' | 'AYT'
export const ctxKind = (grade: number | null | undefined): ExamCtxKind => (grade == null || grade === 8 ? 'LGS' : grade >= 9 ? 'YKS' : 'OKUL')
export const ctxTitle = (k: ExamCtxKind) => (k === 'LGS' ? 'LGS Özeti' : k === 'YKS' ? 'YKS Özeti' : 'Deneme Özeti')

/** Bir deneme bu bağlama ait mi? YKS'de aile exam_type / yks_part alanından (sınav adından tahmin yok). */
export function inContext(e: Pick<GenelExam, 'exam_type' | 'yks_part'>, kind: ExamCtxKind, fam: YksFamily) {
  if (kind === 'YKS') return examFamily(e) === fam
  if (kind === 'OKUL') return examStage(e) === 'SCHOOL'
  return false
}

export interface ItemRow { exam_id: string; section_key: string; q_no: number; correct_answer: string | null; learning_outcome_id: string | null; match_method: string; learning_outcomes: { code: string | null; title: string; outcome_type?: 'KAZANIM' | 'OGRENME_CIKTISI'; curriculum_versions?: { curriculum_type: string } | null } | null }

const RESOLVED = new Set(['CODE_EXACT', 'CODE_NORMALIZED', 'CONTEXT_EXACT', 'TEXT_EXACT', 'TEXT_MATCH', 'ALIAS', 'MANUAL'])

/** LGS'nin eski katalog/gruplu sonuçlarını korur; yeni katalog hedeflerini UUID anahtarıyla ayrıca bağlar. */
export function withCatalogItems(ds: Dataset, items: ItemRow[]): Dataset {
  const ids = new Set(ds.exams.map(e=>e.id)), questionsByExam = new Map(ds.questionsByExam), outcomes = new Map(ds.outcomes.map(o=>[o.code,o]))
  for(const item of items) {
    if(!ids.has(item.exam_id) || !item.learning_outcomes || !item.learning_outcome_id || !RESOLVED.has(item.match_method)) continue
    const key=`${item.section_key}:${item.learning_outcome_id}`, meta=item.learning_outcomes
    const old=questionsByExam.get(item.exam_id)??[]
    // Aynı soru eski katalogda güvenilir biçimde eşleşmişse iki kez sayılmaz.
    if(old.some(q=>q.subject===item.section_key && q.q_no===item.q_no && q.outcome_code && q.match!=='none' && q.match!=='semantic')) continue
    questionsByExam.set(item.exam_id,[...old.filter(q=>q.subject!==item.section_key||q.q_no!==item.q_no),{exam_id:item.exam_id,subject:item.section_key,q_no:item.q_no,correct_answer:item.correct_answer,outcome_code:key,match:'code_exact'}])
    outcomes.set(key,{code:key,subject:item.section_key,rawTitle:meta.title,title:outcomeTitle(meta.title, meta.curriculum_versions?.curriculum_type==='PDF'?'pdf':'official'),display:meta.code,outcomeId:item.learning_outcome_id,source:meta.curriculum_versions?.curriculum_type==='PDF'?'pdf':'official',outcomeType:meta.outcome_type})
  }
  return {...ds,questionsByExam,outcomes:[...outcomes.values()],results:ds.results.map(r=>({...r,outcomes_ok:r.outcomes_ok||(questionsByExam.get(r.exam_id)??[]).some(q=>!!q.outcome_code)}))}
}

/**
 * Genel denemeler → Dataset. Ders = şablon bölümü (sıra profilden; ad profildeki alt test adı). Kazanım anahtarı bölüm + katalog
 * kimliği (resmî kod tek başına tekil değildir: eski lise "10.1.1" dersler arasında tekrar eder). "Uygulanmadı" bölüm sonuçta yoktur.
 */
export function genelDataset(input: { exams: GenelExam[]; results: GenelResult[]; items: ItemRow[]; templates: TemplateRow[]; profile: Profile | null }): Dataset {
  const exams = [...input.exams].sort((a, b) => a.exam_date.localeCompare(b.exam_date))
  const ids = new Set(exams.map((e) => e.id))
  const tplOf = new Map(exams.map((e) => [e.id, input.templates.find((t) => t.id === e.exam_template_id)]))
  // Dersler: denemelerin şablon bölümleri; profil sırası ve adıyla (profil dışı bölüm sonda)
  const defs = new Map<string, SubjectDef & { order: number }>()
  for (const e of exams)
    for (const s of tplOf.get(e.id)?.sections ?? []) {
      // Profil alt testi denemenin aşamasında aranır (11–12'de TYT ve AYT aynı ders kodunu taşır: MAT → "TYT Temel Matematik" / "AYT Matematik")
      const pool = input.profile?.subtests.filter((x) => x.exam_stage === examStage(e))
      const subs = pool?.length ? pool : (input.profile?.subtests ?? [])
      const sub = subs.find((x) => x.canonical_subject === s.key) ?? subs.find((x) => x.section_subjects.includes(s.subject_code) && !/\d$/.test(s.key))
      const cur = defs.get(s.key)
      const name = sub?.display_name ?? s.label
      if (!cur) defs.set(s.key, { code: s.key, ad: name, short: name.replace(/^(TYT|AYT) /, ''), q: s.question_count, base: s.subject_code, order: sub ? sub.sort : 100 + s.sort })
      else cur.q = Math.max(cur.q, s.question_count)
    }
  const subjects = [...defs.values()].sort((a, b) => a.order - b.order).map(({ order: _o, ...d }) => d)

  const questionsByExam = new Map<string, Question[]>()
  const outcomes = new Map<string, Outcome>()
  for (const it of input.items) {
    if (!ids.has(it.exam_id)) continue
    const ok = !!it.learning_outcome_id && !!it.learning_outcomes && RESOLVED.has(it.match_method)
    const key = ok ? `${it.section_key}:${it.learning_outcome_id}` : null
    const q: Question = { exam_id: it.exam_id, subject: it.section_key, q_no: it.q_no, correct_answer: it.correct_answer, outcome_code: key, match: (ok ? 'code_exact' : 'none') as MatchLevel }
    questionsByExam.set(it.exam_id, [...(questionsByExam.get(it.exam_id) ?? []), q])
    if (key && !outcomes.has(key)) outcomes.set(key, { code: key, subject: it.section_key, rawTitle: it.learning_outcomes!.title, title: outcomeTitle(it.learning_outcomes!.title, it.learning_outcomes!.curriculum_versions?.curriculum_type === 'PDF' ? 'pdf' : 'official'), display: it.learning_outcomes!.code, outcomeId: it.learning_outcome_id!, source: it.learning_outcomes!.curriculum_versions?.curriculum_type === 'PDF' ? 'pdf' : 'official', outcomeType: it.learning_outcomes!.outcome_type })
  }

  const results: Result[] = input.results.filter((r) => ids.has(r.exam_id)).map((r) => {
    const subjects: Result['subjects'] = {}
    for (const [k, v] of Object.entries(r.subjects as SectionResults)) if (isScore(v)) subjects[k] = { d: v.d, y: v.y, b: v.b, net: v.net }
    const qs = questionsByExam.get(r.exam_id) ?? []
    return { exam_id: r.exam_id, student_id: r.student_id, score: r.score, subjects, answers: r.answers ?? null, answer_format:'status', outcomes_ok: qs.some((q) => q.outcome_code), kazanim: null }
  })
  return { subjects, exams: exams.map((e) => ({ id: e.id, name: e.name, publisher: e.publisher, exam_date: e.exam_date })), questionsByExam, outcomes: [...outcomes.values()], results }
}

