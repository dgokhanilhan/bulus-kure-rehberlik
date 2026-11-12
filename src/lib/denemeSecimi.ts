// Sınıflar / Sınıf analizi: analizin hangi denemeleri kapsadığı (bütün denemeler, yalnız son deneme ya da tek tek seçilenler)
// ve branş öğretmeni için yalnız kendi dersine daraltma. Saf fonksiyonlar: veri okunur, hiçbir sonuç yeniden hesaplanmaz
// (D/Y/B/net/puan exam_results'tan gelir; kural 2).
import { indexResults, type Dataset, type Exam, type HeatRow, type Subject, type SubjectDef } from './analiz'
import { bransUyar } from './etutGrup'

export type Kapsam = 'tum' | 'son' | 'sec'
export const KAPSAM_TR: Record<Kapsam, string> = { tum: 'Tüm denemeler', son: 'Son deneme', sec: 'Deneme seç' }

/** Kapsama giren denemeler (tarih sırası korunur). "Deneme seç"te hiçbiri işaretli değilse son deneme. */
export function kapsamDenemeleri(exams: Exam[], kapsam: Kapsam, secili: readonly string[]): Exam[] {
  if (kapsam === 'tum') return exams
  const son = exams.slice(-1)
  if (kapsam === 'son') return son
  const x = exams.filter((e) => secili.includes(e.id))
  return x.length ? x : son
}

/** Veri setini verilen denemelere daraltır. */
export function denemeSuz(ds: Dataset, exams: Exam[]): Dataset {
  const ids = new Set(exams.map((e) => e.id))
  return { ...ds, exams: ds.exams.filter((e) => ids.has(e.id)), results: ds.results.filter((r) => ids.has(r.exam_id)) }
}

/**
 * Veri setini verilen derslere daraltır (branş öğretmeni kendi dersini görür): net yalnız o derslerden toplanır.
 * Puan bütün derslerin ortak sonucu olduğundan tek derse indirgenemez; boş bırakılır (uydurulmaz).
 */
export function dersSuz(ds: Dataset, codes: readonly Subject[]): Dataset {
  const set = new Set(codes)
  return {
    ...ds,
    subjects: ds.subjects.filter((s) => set.has(s.code)),
    outcomes: ds.outcomes.filter((o) => set.has(o.subject)),
    results: ds.results.map((r) => ({
      ...r,
      score: null,
      scores: undefined,
      subjects: Object.fromEntries(Object.entries(r.subjects).filter(([k]) => set.has(k as Subject))),
    })),
  }
}

/** Öğretmenin branşına karşılık gelen deneme dersleri (ör. "Fen Bilimleri" → Fen). Eşleşme yoksa boş liste. */
export function bransDersleri(subjects: SubjectDef[], brans: string | null | undefined): Subject[] {
  return subjects.filter((s) => bransUyar(s.ad, brans) || bransUyar(s.short, brans)).map((s) => s.code)
}

export interface DenemeNet {
  exam: Exam
  /** Denemeye giren (o derste sonucu olan) öğrenci sayısı */
  giren: number
  /** Girenlerin ortalama neti; kimse girmediyse null */
  ort: number | null
}
/** Deneme deneme sınıfın bir dersteki ortalama neti (girmeyen öğrenci sıfır sayılmaz). */
export function denemeNetleri(ds: Dataset, studentIds: string[], subject: Subject, exams: Exam[]): DenemeNet[] {
  const idx = indexResults(ds.results)
  return exams.map((exam) => {
    const ns = studentIds.flatMap((id) => {
      const n = idx.get(`${exam.id}|${id}`)?.subjects[subject]?.net
      return typeof n === 'number' ? [n] : []
    })
    return { exam, giren: ns.length, ort: ns.length ? ns.reduce((a, b) => a + b, 0) / ns.length : null }
  })
}

/** Seçili denemelerin tamamında bir konunun durumu: doğru oranlarının ortalaması ve en az bir denemede yanlış yapan öğrenciler. */
export function konuToplam(r: HeatRow): { p: number | null; wrong: string[] } {
  const ps = r.cells.flatMap((c) => (c.p === null ? [] : [c.p]))
  return { p: ps.length ? Math.round(ps.reduce((a, b) => a + b, 0) / ps.length) : null, wrong: [...new Set(r.cells.flatMap((c) => c.wrong))] }
}

/** Talep başlığı: "Matematik: Kareköklü ifadeler, Üslü ifadeler" (120 karaktere sığacak kadar konu). */
export function talepKonusu(dersAdi: string, basliklar: string[], ek: string): string {
  const parca = [...basliklar, ek.trim()].filter(Boolean)
  let out = dersAdi
  let ilk = true
  for (const b of parca) {
    const next = `${out}${ilk ? ': ' : ', '}${b}`
    if (next.length > 120) continue
    out = next
    ilk = false
  }
  return out.slice(0, 120)
}
