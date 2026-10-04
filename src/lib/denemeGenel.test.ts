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
