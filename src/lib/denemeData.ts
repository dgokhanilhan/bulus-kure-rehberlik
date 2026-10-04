// Okul geneli deneme altyapısı (0025–0027) için veri erişimi: şablonlar, yayınlar, biçimler, sınıf varsayılanları,
// içe aktarım geçmişi, eşleşmeyen kazanımlar, kazanım kataloğu araması. Yetki veritabanında (RLS + RPC).
import { useQuery } from '@tanstack/react-query'
import { supabase } from './supabase'
import { pages } from './sayfali'
import type { ExamTemplate, ExamType, Profile, SectionResults, Subtest, TemplateSection, YksPart } from './denemeGenel'

export interface TemplateRow extends ExamTemplate {
  school_id: string | null
  publisher_id: string | null
  format_id: string | null
  status: 'hazir' | 'bekliyor' | 'pasif'
  builtin: boolean
  source_note: string | null
}
export function useExamTemplates() {
  return useQuery({
    queryKey: ['exam_templates'],
    queryFn: async (): Promise<TemplateRow[]> => {
      const { data, error } = await supabase.from('exam_templates').select('*, exam_template_sections(*)').order('grade').order('name')
      if (error) throw error
      return (data as (Omit<TemplateRow, 'sections'> & { exam_template_sections: TemplateSection[] })[]).map(({ exam_template_sections, ...t }) => ({
        ...t,
        wrong_per_correct: t.wrong_per_correct === null ? null : Number(t.wrong_per_correct),
        sections: [...exam_template_sections].sort((a, b) => a.sort - b.sort),
      }))
    },
  })
}

export interface Publisher { id: string; school_id: string | null; name: string; series: string[]; active: boolean }
export const usePublishers = () =>
  useQuery({ queryKey: ['publishers'], queryFn: async () => ((await supabase.from('publishers').select('*').order('name')).data ?? []) as Publisher[] })

export interface FormatRow {
  id: string; school_id: string | null; code: string; name: string; parser_family: string; supported_grades: number[]; supported_exam_types: string[]
  detect: Record<string, unknown>; status: 'aktif' | 'test' | 'pasif'; builtin: boolean; notes: string | null; publisher_formats: { publisher_id: string }[]
}
export const useFormats = () =>
  useQuery({ queryKey: ['exam_format_profiles'], queryFn: async () => ((await supabase.from('exam_format_profiles').select('*, publisher_formats(publisher_id)').order('code')).data ?? []) as FormatRow[] })

export interface TypeDefault { school_id: string | null; grade: number; exam_type: ExamType; yks_part: YksPart | null }
export const useTypeDefaults = () =>
  useQuery({ queryKey: ['exam_type_defaults'], queryFn: async () => ((await supabase.from('exam_type_defaults').select('*').order('grade')).data ?? []) as TypeDefault[] })

export interface ImportRow {
  id: string; exam_id: string | null; created_at: string; source_kind: string; filename: string | null; format_code: string | null; grade: number | null; exam_type: string | null
  student_count: number; result_count: number; outcome_count: number; unresolved_count: number; status: string; detection: Record<string, unknown>; exams: { name: string; status: string } | null
}
export const useExamImports = () =>
  useQuery({ queryKey: ['exam_imports'], queryFn: async () => ((await supabase.from('exam_imports').select('*, exams(name, status)').order('created_at', { ascending: false }).limit(200)).data ?? []) as ImportRow[] })

export interface UnresolvedRow {
  exam_id: string; exam_name: string; grade: number; exam_type: string; section_key: string; subject_code: string; q_no: number; raw_code: string | null; raw_text: string | null; outcome_grade: number | null
}
export const useUnresolved = () =>
  useQuery({ queryKey: ['unresolved_outcomes'], queryFn: async () => ((await supabase.from('unresolved_outcomes').select('*').order('exam_name').order('section_key').order('q_no').limit(1000)).data ?? []) as UnresolvedRow[] })

export interface CurriculumVersion { id: string; name: string; curriculum_type: 'LEGACY' | 'TYMM'; grade: number; subject_code: string; year_from: number; year_to: number | null; active: boolean; source_title: string; source_url: string; notes: string | null }
export const useCurriculumVersions = () =>
  useQuery({ queryKey: ['curriculum_versions'], staleTime: 10 * 60_000, queryFn: async () => ((await supabase.from('curriculum_versions').select('id, name, curriculum_type, grade, subject_code, year_from, year_to, active, source_title, source_url, notes').order('grade').order('subject_code')).data ?? []) as CurriculumVersion[] })

export interface Subject { code: string; name: string; short_name: string; levels: string[]; sort: number }
export const useSubjects = () => useQuery({ queryKey: ['subjects'], staleTime: 60 * 60_000, queryFn: async () => ((await supabase.from('subjects').select('*').order('sort')).data ?? []) as Subject[] })

/** Eğitim yılında geçerli sürüm (veritabanındaki curriculum_for ile aynı kural). */
export const versionFor = (vs: CurriculumVersion[], grade: number, subject: string, year: number) =>
  vs.filter((v) => v.active && v.grade === grade && v.subject_code === subject && v.year_from <= year && (v.year_to === null || v.year_to >= year)).sort((a, b) => b.year_from - a.year_from)[0] ?? null

export interface OutcomeRow { id: string; code: string | null; title: string; theme: string | null; unit: string | null; grade: number; subject_code: string; outcome_type: string; curriculum_version_id: string; source_note: string | null }
/** Katalog araması: tüm katalog istemciye çekilmez; sürüm(ler) + metin/kod ile en çok 200 kayıt. */
export async function searchOutcomes(p: { versionIds: string[]; q?: string; limit?: number }): Promise<OutcomeRow[]> {
  if (!p.versionIds.length) return []
  let qb = supabase.from('learning_outcomes').select('id, code, title, theme, unit, grade, subject_code, outcome_type, curriculum_version_id, source_note').in('curriculum_version_id', p.versionIds)
  const q = (p.q ?? '').trim()
  if (q) qb = qb.or(`code.ilike.%${q.replace(/[,()%]/g, ' ')}%,title.ilike.%${q.replace(/[,()%]/g, ' ')}%`)
  const { data, error } = await qb.order('grade').order('sort_order').limit(p.limit ?? 200)
  if (error) throw error
  return data as OutcomeRow[]
}

export interface ExamAdminRow {
  id: string; name: string; exam_date: string; grade: number | null; exam_type: ExamType | null; yks_part: YksPart | null; exam_code: string | null; status: 'taslak' | 'yayinda' | 'arsiv'
  publisher: string | null; academic_year: string | null; exam_template_id: string | null; published_at: string | null; archived_at: string | null
}
export const useExamsAdmin = () =>
  useQuery({
    queryKey: ['exams-admin'],
    queryFn: async () => ((await supabase.from('exams').select('id, name, exam_date, grade, exam_type, yks_part, exam_code, status, publisher, academic_year, exam_template_id, published_at, archived_at').order('exam_date', { ascending: false })).data ?? []) as ExamAdminRow[],
  })

// ---------------------------------------------------------------- 5–7 / 9–12 genel denemeler (öğrenci, veli, öğretmen ekranları)
export interface GenelExam { id: string; name: string; exam_date: string; grade: number; exam_type: ExamType; yks_part: YksPart | null; exam_code: string | null; publisher: string | null; exam_template_id: string | null }
export interface GenelResult { exam_id: string; student_id: string; score: number | null; subjects: SectionResults; answers: Record<string, string> | null; total_net: number | null; success_pct: number | null }
/** Yayındaki LGS dışı denemeler ve görülebilen sonuçlar (RLS: veli/öğrenci yalnız kendi, öğretmen kendi sınıfları). LGS: useDataset. */
export function useGenelDataset(enabled = true) {
  return useQuery({
    queryKey: ['genel-dataset'],
    enabled,
    staleTime: 60_000,
    queryFn: async () => {
      const [e, r] = await Promise.all([
        supabase.from('exams').select('id, name, exam_date, grade, exam_type, yks_part, exam_code, publisher, exam_template_id').neq('exam_type', 'LGS').eq('status', 'yayinda').order('exam_date'),
        pages<GenelResult & { exams?: unknown }>((a, b) =>
          supabase.from('exam_results').select('exam_id, student_id, score, subjects, answers, total_net, success_pct, exams!inner(exam_type, status)').neq('exams.exam_type', 'LGS').eq('exams.status', 'yayinda').order('exam_id').order('student_id').range(a, b)),
      ])
      if (e.error) throw e.error
      const results = r.map(({ exams: _e, ...x }) => ({ ...x, total_net: x.total_net === null ? null : Number(x.total_net), success_pct: x.success_pct === null ? null : Number(x.success_pct) }))
      return { exams: e.data as GenelExam[], results }
    },
  })
}

// ---------------------------------------------------------------- deneme profilleri (0030) ve soru düzeyi
export const useExamProfiles = () =>
  useQuery({
    queryKey: ['exam_profiles'],
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from('exam_profiles').select('*, exam_subtests(*)').order('student_grade')
      if (error) throw error
      return (data as (Omit<Profile, 'subtests'> & { id: string; school_id: string | null; exam_subtests: Subtest[] })[]).map(({ exam_subtests, ...p }) => ({ ...p, subtests: [...exam_subtests].sort((a, b) => a.sort - b.sort) }))
    },
  })
/** Öğrencinin sınıfı ve denemenin eğitim yılı için profil: okulun kendi profili önce, sonra yerleşik; o yıl yoksa en yakın önceki yıl. */
export function profileFor<P extends Profile & { school_id: string | null }>(ps: P[], grade: number | null | undefined, year: number) {
  if (!grade) return null
  const type = grade <= 8 ? 'ORTAOKUL' : 'ANADOLU_LISESI'
  return ps.filter((p) => p.student_grade === grade && p.school_type === type && p.academic_year <= year)
    .sort((a, b) => b.academic_year - a.academic_year || Number(!!b.school_id) - Number(!!a.school_id))[0] ?? null
}

export interface ItemRow { section_key: string; q_no: number; correct_answer: string | null; learning_outcome_id: string | null; match_method: string; learning_outcomes: { code: string | null; title: string } | null }
export const useExamItems = (examId: string | null) =>
  useQuery({
    queryKey: ['exam_items', examId],
    enabled: !!examId,
    queryFn: async () => ((await supabase.from('exam_items').select('section_key, q_no, correct_answer, learning_outcome_id, match_method, learning_outcomes(code, title)').eq('exam_id', examId!).order('section_key').order('q_no')).data ?? []) as unknown as ItemRow[],
  })
