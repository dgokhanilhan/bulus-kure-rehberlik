// Okul geneli deneme çekirdeği (5–12; Genel / LGS / TYT / AYT / YKS): yayıncıdan bağımsız normalleştirilmiş sonuç modeli.
// Saf fonksiyonlar, birim testli. Yayıncı yalnız içe aktarma (ayrıştırıcı) meselesidir; analiz bu modelle çalışır.
// Kurallar: okunamayan bölüm null (uydurulmaz), uygulanmayan bölüm { na: true } (boş değildir), net kuralı şablondan gelir.

export type ExamType = 'GENEL' | 'LGS' | 'TYT' | 'AYT' | 'YKS' | 'BRANS' | 'KURUMSAL' | 'DIGER'
export type YksPart = 'TYT' | 'AYT'
export const EXAM_TYPE_TR: Record<ExamType, string> = {
  GENEL: 'Genel deneme', LGS: 'LGS', TYT: 'TYT', AYT: 'AYT', YKS: 'YKS', BRANS: 'Branş denemesi', KURUMSAL: 'Kurumsal deneme', DIGER: 'Diğer',
}

export interface TemplateSection {
  key: string
  subject_code: string
  label: string
  question_count: number
  sort: number
  /** Aynı gruptan yalnız biri uygulanır (ör. Din ↔ Felsefe-2); diğeri N/A. */
  optional_group: string | null
  /** Kazanımın aranacağı sınıflar (TYT/AYT: 9–12). null: denemenin sınıfı. */
  outcome_grades: number[] | null
  /** Kazanım kataloğunda aranacak ders (ör. TYT "Türkçe" → TDE). null: subject_code. */
  outcome_subject?: string | null
}
export interface ExamTemplate {
  id: string
  name: string
  grade: number
  exam_types: ExamType[]
  /** Kaç yanlış bir doğruyu götürür; null: yanlış doğruyu götürmez. */
  wrong_per_correct: number | null
  /** true: D+Y+B = soru sayısı zorunlu; false: ≤ yeterli. */
  strict_counts: boolean
  sections: TemplateSection[]
}

export interface SectionScore {
  d: number
  y: number
  b: number
  net: number
}
export type SectionValue = SectionScore | { na: true } | null
export type SectionResults = Record<string, SectionValue>
export const isNA = (v: SectionValue): v is { na: true } => !!v && 'na' in v
export const isScore = (v: SectionValue): v is SectionScore => !!v && !('na' in v)

const round2 = (n: number) => Math.round(n * 100) / 100
/** Net = D − Y / (yanlış/doğru katsayısı); katsayı yoksa net = D. */
export const netOf = (d: number, y: number, wrongPerCorrect: number | null) => round2(wrongPerCorrect ? d - y / wrongPerCorrect : d)

/** Bir bölümün sonucunu şablona göre denetler. Dönen dizi boşsa geçerlidir. */
export function validateSection(sec: TemplateSection, v: SectionValue, tpl: Pick<ExamTemplate, 'wrong_per_correct' | 'strict_counts'>): string[] {
  if (v === null || isNA(v)) return []
  const e: string[] = []
  const nums = [v.d, v.y, v.b, v.net]
  if (nums.some((n) => typeof n !== 'number' || !Number.isFinite(n))) return [`${sec.label}: sayı okunamadı`]
  if ([v.d, v.y, v.b].some((n) => n < 0 || !Number.isInteger(n))) e.push(`${sec.label}: doğru/yanlış/boş negatif ya da kesirli olamaz`)
  const sum = v.d + v.y + v.b
  if (tpl.strict_counts ? sum !== sec.question_count : sum > sec.question_count) e.push(`${sec.label}: D+Y+B = ${sum}, soru sayısı ${sec.question_count}`)
  if (Math.abs(v.net - netOf(v.d, v.y, tpl.wrong_per_correct)) > 0.011) e.push(`${sec.label}: net ${v.net} kurala uymuyor (beklenen ${netOf(v.d, v.y, tpl.wrong_per_correct)})`)
  return e
}

/** Seçmeli gruplar: her gruptan en çok bir bölüm uygulanır; ikisi birden puanlanmışsa hata. */
export function validateGroups(tpl: ExamTemplate, r: SectionResults): string[] {
  const groups = new Map<string, TemplateSection[]>()
  for (const s of tpl.sections) if (s.optional_group) groups.set(s.optional_group, [...(groups.get(s.optional_group) ?? []), s])
  const e: string[] = []
  for (const [, ss] of groups) {
    const applied = ss.filter((s) => isScore(r[s.key] ?? null) && (r[s.key] as SectionScore).d + (r[s.key] as SectionScore).y > 0)
    if (applied.length > 1) e.push(`${applied.map((s) => s.label).join(' ve ')} aynı anda uygulanmış görünüyor; yalnız biri olmalı`)
  }
  return e
}

export function validateResult(tpl: ExamTemplate, r: SectionResults): string[] {
  const known = new Set(tpl.sections.map((s) => s.key))
  const e = Object.keys(r).filter((k) => !known.has(k)).map((k) => `Şablonda olmayan bölüm: ${k}`)
  for (const s of tpl.sections) e.push(...validateSection(s, r[s.key] ?? null, tpl))
  return [...e, ...validateGroups(tpl, r)]
}

/**
 * Seçmeli gruptaki yanıtlanmamış bölümü N/A yapar: grubun bir bölümünde doğru/yanlış varsa diğerleri
 * (tamamı boşsa) "uygulanmadı" sayılır. Hiçbiri yanıtlanmamışsa grup olduğu gibi kalır (karar verilmez).
 */
export function resolveOptional(tpl: ExamTemplate, r: SectionResults): SectionResults {
  const out = { ...r }
  const groups = new Map<string, TemplateSection[]>()
  for (const s of tpl.sections) if (s.optional_group) groups.set(s.optional_group, [...(groups.get(s.optional_group) ?? []), s])
  for (const [, ss] of groups) {
    const answered = ss.filter((s) => { const v = out[s.key] ?? null; return isScore(v) && v.d + v.y > 0 })
    if (answered.length !== 1) continue
    for (const s of ss) { const v = out[s.key] ?? null; if (s !== answered[0] && (v === null || (isScore(v) && v.d + v.y === 0))) out[s.key] = { na: true } }
  }
  return out
}

export interface Totals {
  totalNet: number
  /** Uygulanan ve okunabilen bölümlerin toplam soru sayısı (= en yüksek olası net). */
  maxNet: number
  /** Başarı yüzdesi = toplam net / en yüksek olası net × 100. Net ile karıştırılmaz. */
  successPct: number | null
  d: number
  y: number
  b: number
  unreadable: string[]
  notApplied: string[]
}
export function totals(tpl: ExamTemplate, r: SectionResults): Totals {
  let totalNet = 0, maxNet = 0, d = 0, y = 0, b = 0
  const unreadable: string[] = [], notApplied: string[] = []
  for (const s of tpl.sections) {
    const v = r[s.key] ?? null
    if (isNA(v)) { notApplied.push(s.key); continue }
    if (v === null) { if (!s.optional_group) unreadable.push(s.key); continue }
    totalNet += v.net; maxNet += s.question_count; d += v.d; y += v.y; b += v.b
  }
  totalNet = round2(totalNet)
  return { totalNet, maxNet, successPct: maxNet ? round2((totalNet / maxNet) * 100) : null, d, y, b, unreadable, notApplied }
}

// ---------------------------------------------------------------- karşılaştırılabilirlik ve bağlam
/** Karşılaştırma ailesi: YKS-TYT ile TYT aynı aile; TYT ile AYT asla karşılaştırılmaz. */
export function examFamily(e: { exam_type: ExamType | null; yks_part?: YksPart | null }): string {
  if (e.exam_type === 'YKS') return e.yks_part ?? 'YKS'
  return e.exam_type ?? 'LGS'
}
export const comparable = (a: { exam_type: ExamType | null; yks_part?: YksPart | null }, b: { exam_type: ExamType | null; yks_part?: YksPart | null }) => examFamily(a) === examFamily(b)

/** Öğrencinin sınıfına göre deneme bölümünün başlığı (öğrenci/veli/öğretmen ekranları ve rapor). */
export function contextTitle(grade: number | null | undefined): string {
  if (grade === 8) return 'LGS Özeti'
  if (grade != null && grade >= 9 && grade <= 12) return 'YKS Özeti'
  return 'Deneme Özeti'
}
/** Rapor başlığı: 5–7 Deneme Analizi · 8 LGS · 9–10 TYT · 11 AYT · 12 YKS – TYT/AYT. Türü sınıftan değil denemeden alır. */
export function reportTitle(e: { exam_type: ExamType | null; yks_part?: YksPart | null }): string {
  const f = examFamily(e)
  if (e.exam_type === 'YKS') return `YKS – ${e.yks_part ?? ''} Deneme Analizi`.replace('–  ', '– ')
  if (f === 'LGS') return 'LGS Deneme Analizi'
  if (f === 'TYT' || f === 'AYT') return `${f} Deneme Analizi`
  return 'Deneme Analizi'
}
/** 9–12. sınıflarda YKS alt sekmeleri: TYT ve AYT ayrı gösterilir. */
export const yksTabs = (grade: number | null | undefined): YksPart[] =>
  grade != null && grade >= 9 && grade <= 12 ? ['TYT', 'AYT'] : []

/** Sınıfın varsayılan sınav türü (okul satırı varsa o, yoksa genel; kodda sabit değil, exam_type_defaults'tan). */
export function defaultExamType(grade: number, defaults: { school_id: string | null; grade: number; exam_type: ExamType; yks_part: YksPart | null }[]) {
  const rows = defaults.filter((d) => d.grade === grade)
  return rows.find((d) => d.school_id) ?? rows.find((d) => !d.school_id) ?? null
}

/** Öğrenci grubu kuralı (veritabanındaki cohort_year ile aynı): konu sınıfının programı, öğrencinin o sınıfı okuduğu yılınkidir.
 *  2026–2027'de 12. sınıf + 9. sınıf konusu → 2023 (eski program); 11. sınıf + 9. sınıf konusu → 2024 (TYMM). */
export const cohortYear = (year: number, studentGrade: number | null | undefined, contentGrade: number) => year - Math.max((studentGrade ?? contentGrade) - contentGrade, 0)

/** Eğitim yılı (Eylül ve sonrası o yılın başlangıcı): 2026-03-10 → "2025-2026". */
export function academicYear(date: string): string {
  const [y, m] = date.split('-').map(Number) as [number, number]
  const s = m >= 9 ? y : y - 1
  return `${s}-${s + 1}`
}

/** Son deneme kartı: önceki **karşılaştırılabilir** denemeye göre net ve yüzde değişimi (TYT↔AYT kıyaslanmaz). */
export function lastExamDelta<E extends { id: string; exam_date: string; exam_type: ExamType | null; yks_part?: YksPart | null }>(
  exams: E[],
  res: Map<string, { totalNet: number; successPct: number | null }>,
) {
  const done = exams.filter((e) => res.has(e.id)).sort((a, b) => a.exam_date.localeCompare(b.exam_date))
  const last = done.at(-1)
  if (!last) return null
  const prev = done.slice(0, -1).reverse().find((e) => comparable(e, last))
  const L = res.get(last.id)!, P = prev ? res.get(prev.id)! : null
  return {
    exam: last,
    totalNet: L.totalNet,
    successPct: L.successPct,
    previous: prev ?? null,
    deltaNet: P ? round2(L.totalNet - P.totalNet) : null,
    deltaPct: P && L.successPct !== null && P.successPct !== null ? round2(L.successPct - P.successPct) : null,
  }
}

// ---------------------------------------------------------------- deneme profili (0030): alt test sırası, "ölçülmedi", terim
export type ExamStage = 'SCHOOL' | 'LGS' | 'TYT' | 'AYT'
export interface Subtest { sort: number; exam_stage: ExamStage; display_name: string; canonical_subject: string; section_subjects: string[]; language_code: string | null }
export interface Profile { academic_year: number; student_grade: number; school_type: string; program_family: 'TYMM' | 'LEGACY'; outcome_term: 'OGRENME_CIKTISI' | 'KAZANIM'; subtests: Subtest[] }

/** TYMM profillerinde "Öğrenme Çıktısı Analizi", eski programda "Kazanım Analizi"; profil yoksa tarafsız "Öğrenme Hedefleri". */
export const outcomeTerm = (p: Pick<Profile, 'outcome_term'> | null | undefined, kind: 'analiz' | 'tekil' | 'cogul' = 'analiz') => {
  if (!p) return kind === 'analiz' ? 'Öğrenme Hedefleri Analizi' : kind === 'tekil' ? 'öğrenme hedefi' : 'öğrenme hedefleri'
  const t = p.outcome_term === 'KAZANIM' ? ['Kazanım Analizi', 'kazanım', 'kazanımlar'] : ['Öğrenme Çıktısı Analizi', 'öğrenme çıktısı', 'öğrenme çıktıları']
  return t[kind === 'analiz' ? 0 : kind === 'tekil' ? 1 : 2]!
}

/** Denemenin aşaması: 8/LGS → LGS; TYT/AYT (YKS alt türü dahil) → TYT/AYT; diğerleri okul denemesi. */
export const examStage = (e: { exam_type: ExamType | null; yks_part?: YksPart | null }): ExamStage =>
  e.exam_type === 'LGS' ? 'LGS' : e.exam_type === 'YKS' ? (e.yks_part ?? 'TYT') : e.exam_type === 'TYT' || e.exam_type === 'AYT' ? e.exam_type : 'SCHOOL'

export interface ProfileRow { subtest: Subtest | null; section: TemplateSection | null; value: SectionValue; status: 'olculdu' | 'uygulanmadi' | 'olculmedi' | 'profil_disi' }
/** Profil sırasıyla bölümler. Çok aşamalı profilde (11–12) yalnız denemenin aşaması (TYT ya da AYT) gösterilir: TYT ve AYT
 *  netleri birleşmez. Denemede olmayan alt test "ölçülmedi" (başarısız sayılmaz); profilde olmayan bölüm sonda "profil dışı". */
export function profileRows(p: Profile | null, e: { exam_type: ExamType | null; yks_part?: YksPart | null }, sections: TemplateSection[], r: SectionResults): ProfileRow[] {
  const st = (v: SectionValue): ProfileRow['status'] => (isNA(v) ? 'uygulanmadi' : v === null ? 'olculmedi' : 'olculdu')
  if (!p) return sections.map((s) => ({ subtest: null, section: s, value: r[s.key] ?? null, status: st(r[s.key] ?? null) }))
  const stage = examStage(e), multi = new Set(p.subtests.map((s) => s.exam_stage)).size > 1
  const subs = p.subtests.filter((s) => !multi || s.exam_stage === stage).sort((a, b) => a.sort - b.sort)
  const used = new Set<string>()
  const rows: ProfileRow[] = subs.map((sub) => {
    // önce kodu dersle aynı bölüm (FEL ↔ Felsefe; FEL2 değil), sonra izinli derslerden ilki
    const sec = sections.find((s) => !used.has(s.key) && s.key === sub.canonical_subject) ?? sections.find((s) => !used.has(s.key) && sub.section_subjects.includes(s.subject_code) && !/\d$/.test(s.key))
    if (sec) used.add(sec.key)
    const v = sec ? (r[sec.key] ?? null) : null
    return { subtest: sub, section: sec ?? null, value: v, status: sec ? st(v) : 'olculmedi' }
  })
  for (const s of sections) if (!used.has(s.key) && (r[s.key] ?? null) !== null) rows.push({ subtest: null, section: s, value: r[s.key] ?? null, status: 'profil_disi' })
  return rows
}

// ---------------------------------------------------------------- öğrenme çıktısı / kazanım analizi (yalnız ölçülmüş soru kanıtı)
export interface OutcomeItem { section_key: string; q_no: number; learning_outcome_id: string | null; learning_outcomes: { code: string | null; title: string } | null }
export interface OutcomeStat { id: string; code: string | null; title: string; sections: string[]; n: number; d: number; y: number; b: number }
/** Öğrencinin soru cevapları (answers: bölüm başına soru sırasıyla; büyük harf/"?" doğru, küçük harf yanlış, "_" boş) + denemenin
 *  soru-kazanım eşleşmeleri → kazanım başına D/Y/B. Soru verisi yoksa ya da sayı tutmuyorsa o bölüm hesaplanmaz (toplamdan türetilmez);
 *  eşleşmeyen soru sayılmaz; listede olmayan kazanım ölçülmemiştir (başarısız değil). Bir soru tek kazanıma bağlıdır (çift sayım yok). */
export function outcomeAnalysis(items: OutcomeItem[], answers: Record<string, string> | null | undefined) {
  const by = new Map<string, OutcomeStat>(), skipped: string[] = []
  let unresolved = 0
  const secs = [...new Set(items.map((i) => i.section_key))]
  for (const key of secs) {
    const qs = items.filter((i) => i.section_key === key).sort((a, b) => a.q_no - b.q_no)
    const s = answers?.[key] ?? ''
    if (!s || s.length !== qs.length) { skipped.push(key); continue }
    qs.forEach((q, k) => {
      if (!q.learning_outcome_id || !q.learning_outcomes) { unresolved++; return }
      const ch = s[k]!
      const st = by.get(q.learning_outcome_id) ?? { id: q.learning_outcome_id, code: q.learning_outcomes.code, title: q.learning_outcomes.title, sections: [], n: 0, d: 0, y: 0, b: 0 }
      if (!st.sections.includes(key)) st.sections.push(key)
      st.n++
      if (ch === '_' || ch === ' ') st.b++
      else if (ch === '?' || (ch >= 'A' && ch <= 'Z')) st.d++
      else st.y++
      by.set(q.learning_outcome_id, st)
    })
  }
  return { rows: [...by.values()].sort((a, b) => a.d / a.n - b.d / b.n || (a.code ?? '').localeCompare(b.code ?? '')), unresolved, skipped }
}
