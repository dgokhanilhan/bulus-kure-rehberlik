import { describe, it, expect } from 'vitest'
import { academicYear, comparable, contextTitle, examFamily, lastExamDelta, netOf, reportTitle, resolveOptional, totals, validateResult, yksTabs, type ExamTemplate } from './denemeGenel'

const T6: ExamTemplate = {
  id: 't6', name: '6. Sınıf', grade: 6, exam_types: ['GENEL'], wrong_per_correct: 3, strict_counts: true,
  sections: [
    { key: 'TUR', subject_code: 'TUR', label: 'Türkçe', question_count: 15, sort: 1, optional_group: null, outcome_grades: null },
    { key: 'MAT', subject_code: 'MAT', label: 'Matematik', question_count: 15, sort: 2, optional_group: null, outcome_grades: null },
  ],
}
const TYT: ExamTemplate = {
  id: 'tyt', name: 'TYT', grade: 12, exam_types: ['YKS', 'TYT'], wrong_per_correct: 4, strict_counts: true,
  sections: [
    { key: 'TUR', subject_code: 'TUR', label: 'Türkçe', question_count: 40, sort: 1, optional_group: null, outcome_grades: [9, 10, 11, 12], outcome_subject: 'TDE' },
    { key: 'DIN', subject_code: 'DIN', label: 'Din', question_count: 5, sort: 2, optional_group: 'G', outcome_grades: null },
    { key: 'FEL2', subject_code: 'FEL', label: 'Felsefe-2', question_count: 5, sort: 3, optional_group: 'G', outcome_grades: null },
  ],
}

describe('net ve doğrulama', () => {
  it('net kuralı şablondan: D−Y/3, D−Y/4, katsayısız', () => {
    expect(netOf(17, 3, 3)).toBe(16)
    expect(netOf(13, 14, 4)).toBe(9.5)
    expect(netOf(13, 14, null)).toBe(13)
  })
  it('D+Y+B, negatif, net, bilinmeyen bölüm', () => {
    expect(validateResult(T6, { TUR: { d: 10, y: 3, b: 2, net: 9 }, MAT: { d: 12, y: 3, b: 0, net: 11 } })).toEqual([])
    expect(validateResult(T6, { TUR: { d: 10, y: 3, b: 3, net: 9 } })[0]).toMatch(/D\+Y\+B = 16/)
    expect(validateResult(T6, { TUR: { d: 12, y: 3, b: 0, net: 12 } })[0]).toMatch(/kurala uymuyor/)
    expect(validateResult(T6, { TUR: { d: -1, y: 0, b: 16, net: -1 } }).join()).toMatch(/negatif/)
    expect(validateResult(T6, { XYZ: null })[0]).toMatch(/Şablonda olmayan/)
    expect(validateResult(T6, { TUR: { d: NaN, y: 0, b: 0, net: 0 } })[0]).toMatch(/okunamadı/)
  })
  it('seçmeli grup: ikisi birden uygulanamaz; yanıtlanmayan N/A olur (boş değildir)', () => {
    const both = { TUR: { d: 30, y: 8, b: 2, net: 28 }, DIN: { d: 3, y: 1, b: 1, net: 2.75 }, FEL2: { d: 2, y: 1, b: 2, net: 1.75 } }
    expect(validateResult(TYT, both).join()).toMatch(/yalnız biri/)
    const r = resolveOptional(TYT, { TUR: { d: 30, y: 8, b: 2, net: 28 }, DIN: { d: 3, y: 1, b: 1, net: 2.75 }, FEL2: { d: 0, y: 0, b: 5, net: 0 } })
    expect(r.FEL2).toEqual({ na: true })
    expect(validateResult(TYT, r)).toEqual([])
  })
})

describe('toplamlar ve başarı yüzdesi', () => {
  it('başarı yüzdesi = toplam net / uygulanan bölümlerin soru sayısı; N/A ve okunamayan dahil edilmez', () => {
    const t = totals(TYT, { TUR: { d: 30, y: 8, b: 2, net: 28 }, DIN: { d: 3, y: 1, b: 1, net: 2.75 }, FEL2: { na: true } })
    expect(t).toMatchObject({ totalNet: 30.75, maxNet: 45, notApplied: ['FEL2'], unreadable: [] })
    expect(t.successPct).toBeCloseTo((30.75 / 45) * 100, 2)
    const u = totals(T6, { TUR: { d: 10, y: 3, b: 2, net: 9 }, MAT: null })
    expect(u).toMatchObject({ totalNet: 9, maxNet: 15, unreadable: ['MAT'] })
  })
})

describe('bağlam ve karşılaştırma', () => {
  it('TYT ile AYT karşılaştırılmaz; YKS-TYT ile TYT aynı aile', () => {
    expect(comparable({ exam_type: 'YKS', yks_part: 'TYT' }, { exam_type: 'YKS', yks_part: 'AYT' })).toBe(false)
    expect(comparable({ exam_type: 'YKS', yks_part: 'TYT' }, { exam_type: 'TYT' })).toBe(true)
    expect(examFamily({ exam_type: null })).toBe('LGS') // eski kayıtlar
  })
  it('sınıfa göre başlıklar: 5–7 Deneme Analizi, 8 LGS Atlas, 9–10 TYT, 11 AYT, 12 YKS (TYT/AYT sekmeleri)', () => {
    expect([5, 6, 7, 8, 9, 10, 11, 12].map(contextTitle)).toEqual(['Deneme Analizi', 'Deneme Analizi', 'Deneme Analizi', 'LGS Atlas', 'TYT Denemeleri', 'TYT Denemeleri', 'AYT Denemeleri', 'YKS'])
    expect(yksTabs(12)).toEqual(['TYT', 'AYT'])
    expect(yksTabs(11)).toEqual([])
    expect(reportTitle({ exam_type: 'YKS', yks_part: 'AYT' })).toBe('YKS – AYT Deneme Analizi')
    expect(reportTitle({ exam_type: 'GENEL' })).toBe('Deneme Analizi')
    expect(reportTitle({ exam_type: 'LGS' })).toBe('LGS Deneme Analizi')
  })
  it('eğitim yılı Eylül\'de başlar', () => {
    expect(academicYear('2026-08-31')).toBe('2025-2026')
    expect(academicYear('2026-09-01')).toBe('2026-2027')
  })
  it('son deneme: önceki karşılaştırılabilir denemeye göre değişim (araya giren AYT atlanır)', () => {
    const exams = [
      { id: 'a', exam_date: '2026-01-10', exam_type: 'YKS' as const, yks_part: 'TYT' as const },
      { id: 'b', exam_date: '2026-02-10', exam_type: 'YKS' as const, yks_part: 'AYT' as const },
      { id: 'c', exam_date: '2026-03-10', exam_type: 'YKS' as const, yks_part: 'TYT' as const },
    ]
    const res = new Map([['a', { totalNet: 60, successPct: 50 }], ['b', { totalNet: 30, successPct: 18.75 }], ['c', { totalNet: 66, successPct: 55 }]])
    const d = lastExamDelta(exams, res)!
    expect(d.previous?.id).toBe('a')
    expect([d.deltaNet, d.deltaPct]).toEqual([6, 5])
    const onlyAyt = lastExamDelta([exams[1]!], res)!
    expect(onlyAyt.deltaNet).toBeNull()
  })
})

describe('öğrenci grubu yılı', () => {
  it('12. sınıf 9. sınıf konusu 3 yıl önce; aynı sınıf konusu denemenin yılı', async () => {
    const { cohortYear } = await import('./denemeGenel')
    expect([cohortYear(2026, 12, 9), cohortYear(2026, 11, 9), cohortYear(2026, 9, 9), cohortYear(2026, null, 9)]).toEqual([2023, 2024, 2026, 2026])
  })
})

describe('deneme profili', () => {
  const S = (key: string, subject_code: string, label: string, question_count: number, sort: number, optional_group: string | null = null) => ({ key, subject_code, label, question_count, sort, optional_group, outcome_grades: null })
  const sub = (sort: number, exam_stage: 'SCHOOL' | 'TYT' | 'AYT', display_name: string, canonical_subject: string, section_subjects = [canonical_subject]) => ({ sort, exam_stage, display_name, canonical_subject, section_subjects, language_code: canonical_subject === 'ING' ? 'en' : null })
  const P9 = { academic_year: 2026, student_grade: 9, school_type: 'ANADOLU_LISESI', program_family: 'TYMM' as const, outcome_term: 'OGRENME_CIKTISI' as const,
    subtests: [sub(1, 'SCHOOL', 'Türk Dili ve Edebiyatı', 'TDE'), sub(2, 'SCHOOL', 'Matematik', 'MAT'), sub(3, 'SCHOOL', 'Yabancı Dil', 'ING')] }
  const P12 = { ...P9, student_grade: 12, program_family: 'LEGACY' as const, outcome_term: 'KAZANIM' as const,
    subtests: [sub(1, 'TYT', 'TYT Türkçe', 'TUR', ['TUR', 'TDE']), sub(2, 'TYT', 'TYT Temel Matematik', 'MAT'), sub(3, 'TYT', 'TYT Felsefe', 'FEL'), sub(4, 'TYT', 'TYT Din Kültürü ve Ahlak Bilgisi', 'DIN'), sub(5, 'AYT', 'AYT Matematik', 'MAT')] }
  it('profil sırası; denemede olmayan alt test "ölçülmedi"; profil dışı bölüm sonda', async () => {
    const { profileRows } = await import('./denemeGenel')
    const rows = profileRows(P9, { exam_type: 'TYT' }, [S('MAT', 'MAT', 'Matematik', 30, 1), S('TDE', 'TDE', 'Türk Dili', 30, 2), S('COG', 'COG', 'Coğrafya', 12, 3)],
      { MAT: { d: 20, y: 4, b: 6, net: 19 }, TDE: { d: 25, y: 4, b: 1, net: 24 }, COG: { d: 6, y: 2, b: 4, net: 5.5 } })
    expect(rows.map((r) => [r.subtest?.display_name ?? r.section!.label, r.status])).toEqual([['Türk Dili ve Edebiyatı', 'olculdu'], ['Matematik', 'olculdu'], ['Yabancı Dil', 'olculmedi'], ['Coğrafya', 'profil_disi']])
  })
  it('12 TYT: yalnız TYT alt testleri (AYT Matematik ayrı), Felsefe-2 profil dışı, seçmeli Din "uygulanmadı"', async () => {
    const { profileRows } = await import('./denemeGenel')
    const secs = [S('TUR', 'TUR', 'Türkçe', 40, 1), S('FEL', 'FEL', 'Felsefe', 5, 2), S('DIN', 'DIN', 'Din', 5, 3, 'G'), S('FEL2', 'FEL', 'Felsefe-2', 5, 4, 'G'), S('MAT', 'MAT', 'Matematik', 40, 5)]
    const rows = profileRows(P12, { exam_type: 'YKS', yks_part: 'TYT' }, secs, { TUR: { d: 30, y: 4, b: 6, net: 29 }, FEL: { d: 4, y: 0, b: 1, net: 4 }, DIN: { na: true }, FEL2: { d: 3, y: 0, b: 2, net: 3 }, MAT: { d: 20, y: 8, b: 12, net: 18 } })
    expect(rows.map((r) => [r.subtest?.display_name ?? r.section!.label, r.status])).toEqual([
      ['TYT Türkçe', 'olculdu'], ['TYT Temel Matematik', 'olculdu'], ['TYT Felsefe', 'olculdu'], ['TYT Din Kültürü ve Ahlak Bilgisi', 'uygulanmadi'], ['Felsefe-2', 'profil_disi']])
  })
  it('terim profile göre', async () => {
    const { outcomeTerm } = await import('./denemeGenel')
    expect([outcomeTerm(P9), outcomeTerm(P12), outcomeTerm(null), outcomeTerm(P12, 'cogul')]).toEqual(['Öğrenme Çıktısı Analizi', 'Kazanım Analizi', 'Öğrenme Hedefleri Analizi', 'kazanımlar'])
  })
})

describe('kazanım analizi', () => {
  const it2 = (section_key: string, q_no: number, id: string | null, code = id) => ({ section_key, q_no, learning_outcome_id: id, learning_outcomes: id ? { code, title: `Başlık ${id}` } : null })
  it('yalnız ölçülen sorular; eşleşmeyen sayılmaz; tutarsız bölüm hesaplanmaz', async () => {
    const { outcomeAnalysis } = await import('./denemeGenel')
    const items = [it2('MAT', 1, 'k1'), it2('MAT', 2, 'k1'), it2('MAT', 3, 'k2'), it2('MAT', 4, null), it2('TUR', 1, 'k3'), it2('TUR', 2, 'k3')]
    const r = outcomeAnalysis(items, { MAT: 'Ab_C', TUR: 'A' })
    expect(r.rows.map((x) => [x.id, x.n, x.d, x.y, x.b])).toEqual([['k2', 1, 0, 0, 1], ['k1', 2, 1, 1, 0]]) // en zayıf önce
    expect([r.unresolved, r.skipped]).toEqual([1, ['TUR']])
    expect(outcomeAnalysis(items, null).rows).toEqual([])
  })
})
