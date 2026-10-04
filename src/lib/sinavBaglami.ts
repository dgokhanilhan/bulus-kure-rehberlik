// Öğrenci profili / sınıf analizi için tek veri modeli: LGS (mevcut akış, değişmeden) ya da 5–7 / 9–12 genel denemeler
// (0025–0031) aynı Dataset biçimine uyarlanır; kartlar, Gelişim, Denemeler, Konular, raporlar ve sınıf ısı haritası aynı
// saf fonksiyonlarla (analiz.ts) çalışır. Kazanım eşleşmesi sunucuda yapılmıştır (resolve_outcome / öğrenci grubu kuralı):
// burada yalnız exam_items.learning_outcome_id okunur, ön yüzde eşleştirme yapılmaz.
import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from './supabase'
import { pages } from './sayfali'
import { useDataset } from './data'
import { examFamily, examStage, isScore, type SectionResults } from './denemeGenel'
import { profileFor, useExamProfiles, useExamTemplates, useGenelDataset, type GenelExam, type GenelResult, type TemplateRow } from './denemeData'
import type { Dataset, MatchLevel, Outcome, Question, Result, SubjectDef } from './analiz'
import type { Profile } from './denemeGenel'

/** Profilin deneme bağlamı: 8 → LGS (mevcut), 5–7 → okul denemeleri, 9–12 → YKS (TYT / AYT ayrı seri). */
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

export interface ItemRow { exam_id: string; section_key: string; q_no: number; correct_answer: string | null; learning_outcome_id: string | null; match_method: string; learning_outcomes: { code: string | null; title: string } | null }

/** Yayındaki genel denemelerin soru düzeyi verisi (cevap anahtarı + sunucuda eşleşmiş kazanım). RLS: görülebilen denemeler. */
export function useGenelItems(enabled = true) {
  return useQuery({
    queryKey: ['genel-items'],
    enabled,
    staleTime: 60_000,
    queryFn: () =>
      pages<ItemRow & { exams?: unknown }>((a, b) =>
        supabase.from('exam_items').select('exam_id, section_key, q_no, correct_answer, learning_outcome_id, match_method, learning_outcomes(code, title), exams!inner(exam_type, status)')
          .neq('exams.exam_type', 'LGS').eq('exams.status', 'yayinda').order('exam_id').order('section_key').order('q_no').range(a, b),
      ).then((rows) => rows.map(({ exams: _e, ...r }) => r as ItemRow)),
  })
}

const RESOLVED = new Set(['CODE_EXACT', 'CODE_NORMALIZED', 'CONTEXT_EXACT', 'TEXT_EXACT', 'TEXT_MATCH', 'ALIAS', 'MANUAL'])

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
      const sub = input.profile?.subtests.find((x) => x.canonical_subject === s.key || (x.section_subjects.includes(s.subject_code) && !/\d$/.test(s.key) && x.exam_stage === examStage(e)))
        ?? input.profile?.subtests.find((x) => x.canonical_subject === s.key)
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
    if (key && !outcomes.has(key)) outcomes.set(key, { code: key, subject: it.section_key, title: it.learning_outcomes!.title, display: it.learning_outcomes!.code, outcomeId: it.learning_outcome_id! })
  }

  const results: Result[] = input.results.filter((r) => ids.has(r.exam_id)).map((r) => {
    const subjects: Result['subjects'] = {}
    for (const [k, v] of Object.entries(r.subjects as SectionResults)) if (isScore(v)) subjects[k] = { d: v.d, y: v.y, b: v.b, net: v.net }
    const qs = questionsByExam.get(r.exam_id) ?? []
    return { exam_id: r.exam_id, student_id: r.student_id, score: r.score, subjects, answers: r.answers ?? null, outcomes_ok: qs.some((q) => q.outcome_code), kazanim: null }
  })
  return { subjects, exams: exams.map((e) => ({ id: e.id, name: e.name, publisher: e.publisher, exam_date: e.exam_date })), questionsByExam, outcomes: [...outcomes.values()], results }
}

/** Genel bağlamın veri seti (5–7 okul denemeleri ya da 9–12 TYT/AYT); grade profil ve ders adları için. */
export function useGenelContextDataset(kind: ExamCtxKind, fam: YksFamily, grade: number | null | undefined, enabled = true) {
  const on = enabled && kind !== 'LGS'
  const ds = useGenelDataset(on), items = useGenelItems(on), tpls = useExamTemplates(), profiles = useExamProfiles()
  const data = useMemo(() => {
    if (!on || !ds.data || !items.data || !tpls.data) return undefined
    const exams = ds.data.exams.filter((e) => inContext(e, kind, fam))
    const year = exams.length ? Number(exams.at(-1)!.exam_date.slice(0, 4)) - (Number(exams.at(-1)!.exam_date.slice(5, 7)) >= 9 ? 0 : 1) : new Date().getFullYear()
    return genelDataset({ exams, results: ds.data.results, items: items.data, templates: tpls.data, profile: profileFor(profiles.data ?? [], grade, year) })
  }, [on, ds.data, items.data, tpls.data, profiles.data, kind, fam, grade])
  return { data, isLoading: on && (ds.isLoading || items.isLoading || tpls.isLoading), isError: ds.isError || items.isError }
}

/**
 * Profil / sınıf için tek giriş: sınıfa göre bağlam, YKS'de TYT/AYT seçimi (sekmeler arasında ortak) ve o bağlamın veri seti.
 * 8. sınıf (ve sınıfı bilinmeyen) mevcut LGS veri setini aynen kullanır.
 */
export function useExamContext(grade: number | null | undefined, enabled = true) {
  const kind = ctxKind(grade)
  const [fam, setFam] = useState<YksFamily>('TYT')
  const lgs = useDataset(enabled && kind === 'LGS')
  const gen = useGenelContextDataset(kind, fam, grade, enabled)
  const q = kind === 'LGS' ? { data: lgs.data, isLoading: lgs.isLoading, isError: lgs.isError } : gen
  return { kind, fam, setFam, title: ctxTitle(kind), ...q }
}

/** Rapor / deneme detayı: denemenin ait olduğu veri seti (LGS ya da genel bağlam). */
export function useDatasetForExam(eid: string | null, grade: number | null | undefined) {
  const lgs = useDataset(!!eid)
  const g = useGenelDataset(!!eid)
  const inLgs = !!lgs.data?.exams.some((e) => e.id === eid)
  const ge = g.data?.exams.find((e) => e.id === eid)
  const kind: ExamCtxKind = ge ? (examStage(ge) === 'SCHOOL' ? 'OKUL' : 'YKS') : 'LGS'
  const fam: YksFamily = ge && examFamily(ge) === 'AYT' ? 'AYT' : 'TYT'
  const gen = useGenelContextDataset(kind, fam, grade, !!ge)
  if (inLgs) return { data: lgs.data, isLoading: false }
  if (ge) return { data: gen.data, isLoading: gen.isLoading }
  return { data: undefined, isLoading: lgs.isLoading || g.isLoading }
}
