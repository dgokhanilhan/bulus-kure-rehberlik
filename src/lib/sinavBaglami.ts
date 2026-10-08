// Öğrenci profili / sınıf analizi için tek veri modeli: LGS (mevcut akış, değişmeden) ya da 5–7 / 9–12 genel denemeler
// (0025–0031) aynı Dataset biçimine uyarlanır; kartlar, Gelişim, Denemeler, Konular, raporlar ve sınıf ısı haritası aynı
// saf fonksiyonlarla (analiz.ts) çalışır. Kazanım eşleşmesi sunucuda yapılmıştır (resolve_outcome / öğrenci grubu kuralı):
// burada yalnız exam_items.learning_outcome_id okunur, ön yüzde eşleştirme yapılmaz.
import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from './supabase'
import { pages } from './sayfali'
import { useDataset } from './data'
import { examFamily, examStage } from './denemeGenel'
import { profileFor, useExamProfiles, useExamTemplates, useGenelDataset } from './denemeData'
import { ctxKind, ctxTitle, genelDataset, inContext, type ExamCtxKind, type ItemRow, type YksFamily } from './genelVeriSeti'

export * from './genelVeriSeti'

/** Yayındaki genel denemelerin soru düzeyi verisi (cevap anahtarı + sunucuda eşleşmiş kazanım). RLS: görülebilen denemeler. */
export function useGenelItems(enabled = true) {
  return useQuery({
    queryKey: ['genel-items'],
    enabled,
    staleTime: 60_000,
    queryFn: () =>
      pages<ItemRow & { exams?: unknown }>((a, b) =>
        supabase.from('exam_items').select('exam_id, section_key, q_no, correct_answer, learning_outcome_id, match_method, learning_outcomes(code, title, outcome_type, curriculum_versions(curriculum_type)), exams!inner(exam_type, status)')
          .neq('exams.exam_type', 'LGS').eq('exams.status', 'yayinda').order('exam_id').order('section_key').order('q_no').range(a, b),
      ).then((rows) => rows.map(({ exams: _e, ...r }) => r as ItemRow)),
  })
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
