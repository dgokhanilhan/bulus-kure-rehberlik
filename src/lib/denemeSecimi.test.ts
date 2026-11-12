import { describe, expect, it } from 'vitest'
import { bransDersleri, denemeNetleri, denemeSuz, dersSuz, kapsamDenemeleri, konuToplam } from './denemeSecimi'
import { sinifAnalizi } from './sinifAnalizi'
import { totalNet, type Dataset, type Result } from './analiz'

const res = (exam_id: string, student_id: string, score: number | null, mat: number, tur: number): Result => ({
  exam_id,
  student_id,
  score,
  subjects: { MAT: { d: 0, y: 0, b: 0, net: mat }, TUR: { d: 0, y: 0, b: 0, net: tur } },
  answers: null,
  outcomes_ok: true,
})
const ds: Dataset = {
  subjects: [
    { code: 'TUR', ad: 'Türkçe', short: 'Türkçe', q: 20 },
    { code: 'MAT', ad: 'Matematik', short: 'Matematik', q: 20 },
    { code: 'FEN', ad: 'Fen Bilimleri', short: 'Fen', q: 20 },
    { code: 'INK', ad: 'T.C. İnkılap Tarihi ve Atatürkçülük', short: 'İnkılap', q: 10 },
  ],
  exams: [
    { id: 'e1', name: 'D-1', publisher: null, exam_date: '2026-09-01' },
    { id: 'e2', name: 'D-2', publisher: null, exam_date: '2026-09-15' },
    { id: 'e3', name: 'D-3', publisher: null, exam_date: '2026-10-01' },
  ],
  questionsByExam: new Map(),
  outcomes: [
    { code: 'M.1', subject: 'MAT', title: 'Kesirler' },
    { code: 'T.1', subject: 'TUR', title: 'Paragraf' },
  ],
  results: [res('e1', 'a', 300, 10, 12), res('e1', 'b', 250, 6, 8), res('e2', 'a', 320, 12, 12), res('e3', 'a', 340, 14, 10), res('e3', 'b', 280, 9, 9)],
}

describe('analiz kapsamı', () => {
  it('tüm denemeler, son deneme ve seçilenler; seçim boşsa son deneme', () => {
    expect(kapsamDenemeleri(ds.exams, 'tum', []).map((e) => e.id)).toEqual(['e1', 'e2', 'e3'])
    expect(kapsamDenemeleri(ds.exams, 'son', ['e1']).map((e) => e.id)).toEqual(['e3'])
    expect(kapsamDenemeleri(ds.exams, 'sec', ['e3', 'e1']).map((e) => e.id)).toEqual(['e1', 'e3'])
    expect(kapsamDenemeleri(ds.exams, 'sec', []).map((e) => e.id)).toEqual(['e3'])
    expect(kapsamDenemeleri([], 'son', [])).toEqual([])
  })
  it('denemeye daraltma yalnız o denemelerin sonuçlarını bırakır; sayılar değişmez', () => {
    const d = denemeSuz(ds, [ds.exams[0]!, ds.exams[2]!])
    expect(d.exams.map((e) => e.id)).toEqual(['e1', 'e3'])
    expect(d.results).toHaveLength(4)
    expect(d.results.find((r) => r.exam_id === 'e3' && r.student_id === 'b')).toEqual(ds.results[4])
  })
})

describe('branş öğretmeni: yalnız kendi dersi', () => {
  it('branş adı deneme dersiyle eşleşir; eşleşmeyen branşta boş liste', () => {
    expect(bransDersleri(ds.subjects, 'Matematik')).toEqual(['MAT'])
    expect(bransDersleri(ds.subjects, 'Fen Bilimleri')).toEqual(['FEN'])
    expect(bransDersleri(ds.subjects, 'T.C. İnkılap Tarihi')).toEqual(['INK'])
    expect(bransDersleri(ds.subjects, 'Beden Eğitimi')).toEqual([])
    expect(bransDersleri(ds.subjects, null)).toEqual([])
  })
  it('derse daraltınca net yalnız o dersten toplanır, puan uydurulmaz, kaynak veri değişmez', () => {
    const d = dersSuz(ds, ['MAT'])
    expect(d.subjects.map((s) => s.code)).toEqual(['MAT'])
    expect(d.outcomes.map((o) => o.code)).toEqual(['M.1'])
    expect(d.results.map(totalNet)).toEqual([10, 6, 12, 14, 9])
    expect(d.results.every((r) => r.score === null)).toBe(true)
    expect(ds.results[0]!.score).toBe(300)
    expect(totalNet(ds.results[0]!)).toBe(22)
    // Sınıf analizi o dersin netiyle sıralar ve ortalar
    const A = sinifAnalizi(d, [{ id: 'a', full_name: 'A' }, { id: 'b', full_name: 'B' }], { bugun: '2026-10-10' })
    expect(A.ozet.sonOrtNet).toBe(11.5)
    expect(A.ozet.sonOrtPuan).toBeNull()
    expect(A.satirlar.find((r) => r.student.id === 'b')!.hucreler.map((h) => h.net)).toEqual([6, null, 9])
  })
})

describe('deneme netleri ve konu toplamı', () => {
  it('deneme deneme ortalama net: girmeyen öğrenci sıfır sayılmaz', () => {
    const n = denemeNetleri(ds, ['a', 'b'], 'MAT', ds.exams)
    expect(n.map((x) => [x.giren, x.ort])).toEqual([
      [2, 8],
      [1, 12],
      [2, 11.5],
    ])
    expect(denemeNetleri(ds, ['z'], 'MAT', ds.exams)[0]).toMatchObject({ giren: 0, ort: null })
  })
  it('konu toplamı: okunan denemelerin ortalaması ve herhangi birinde yanlış yapanlar', () => {
    const o = { code: 'M.1', subject: 'MAT' as const, title: 'Kesirler' }
    expect(konuToplam({ outcome: o, cells: [{ p: 40, wrong: ['a'] }, { p: null, wrong: [] }, { p: 61, wrong: ['a', 'b'] }] })).toEqual({ p: 51, wrong: ['a', 'b'] })
    expect(konuToplam({ outcome: o, cells: [{ p: null, wrong: [] }] })).toEqual({ p: null, wrong: [] })
  })
})
