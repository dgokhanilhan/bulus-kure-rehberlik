import { describe, it, expect } from 'vitest'
import { sinifAnalizi, siralama } from './sinifAnalizi'
import type { Dataset, Question, Result } from './analiz'

const q = (exam_id: string, q_no: number, code: string): Question => ({ exam_id, subject: 'MAT', q_no, correct_answer: 'A', outcome_code: code, match: 'code_exact' })
const res = (exam_id: string, student_id: string, score: number | null, mat: number, tur: number, ans = 'AA'): Result => ({
  exam_id,
  student_id,
  score,
  subjects: { MAT: { d: 0, y: 0, b: 0, net: mat }, TUR: { d: 0, y: 0, b: 0, net: tur } },
  answers: { MAT: ans },
  outcomes_ok: true,
})
const ds = (results: Result[]): Dataset => ({
  subjects: [
    { code: 'TUR', ad: 'Türkçe', short: 'Türkçe', q: 20 },
    { code: 'MAT', ad: 'Matematik', short: 'Matematik', q: 20 },
  ],
  exams: [
    { id: 'e1', name: 'TG-1', publisher: null, exam_date: '2026-09-01' },
    { id: 'e2', name: 'TG-2', publisher: null, exam_date: '2026-09-15' },
    { id: 'e3', name: 'TG-3', publisher: null, exam_date: '2026-10-01' },
    { id: 'ex', name: 'Başka şube', publisher: null, exam_date: '2026-10-05' },
  ],
  questionsByExam: new Map(['e1', 'e2', 'e3'].map((e) => [e, [q(e, 1, 'M.1'), q(e, 2, 'M.2')]])),
  outcomes: [
    { code: 'M.1', subject: 'MAT', title: 'Kesirler' },
    { code: 'M.2', subject: 'MAT', title: 'Oran' },
  ],
  results,
})
const OGR = [
  { id: 'a', full_name: 'Ada', target_score: 400 },
  { id: 'b', full_name: 'Bora', target_score: null },
  { id: 'c', full_name: 'Can' },
]

describe('sıralama', () => {
  it('puana göre; eşitler aynı sırada; puan yoksa toplam net', () => {
    const r = siralama([
      { id: 'a', score: 400, net: 50 },
      { id: 'b', score: 450, net: 55 },
      { id: 'c', score: 400, net: 48 },
      { id: 'd', score: 300, net: 30 },
    ])
    expect([...r]).toEqual([['b', 1], ['a', 2], ['c', 2], ['d', 4]])
    expect([...siralama([{ id: 'x', score: null, net: 10 }, { id: 'y', score: null, net: 20 }])]).toEqual([['y', 1], ['x', 2]])
  })
})

describe('sınıf analizi', () => {
  const D = ds([
    res('e1', 'a', 420, 15, 15),
    res('e1', 'b', 380, 12, 12),
    res('e1', 'c', 350, 10, 10),
    res('e2', 'a', 400, 13, 13),
    res('e2', 'b', 410, 14, 14),
    // c e2'ye girmedi
    res('e3', 'a', 380, 10, 12, 'BB'),
    res('e3', 'b', 430, 16, 16, 'BA'),
    res('e3', 'c', 300, 8, 8, 'BA'),
    res('ex', 'z', 500, 20, 20), // başka şubenin öğrencisi
  ])
  const A = sinifAnalizi(D, OGR, {
    bugun: '2026-10-10',
    gorevler: [
      { student_id: 'a', due_date: '2026-10-01', completed_at: null },
      { student_id: 'a', due_date: '2026-10-20', completed_at: null },
      { student_id: 'b', due_date: '2026-10-01', completed_at: '2026-09-30' },
    ],
    gorusmeler: [{ student_id: 'b', starts_at: '2026-10-01T10:00:00Z' }],
    devamsizlik: [
      { student_id: 'c', day: '2026-10-02', status: 'devamsiz' },
      { student_id: 'c', day: '2026-10-03', status: 'izinli' },
    ],
  })
  const row = (id: string) => A.satirlar.find((r) => r.student.id === id)!

  it('yalnız şubenin girdiği denemeler; girmeyen öğrenci o denemede boş, sıfır sayılmaz', () => {
    expect(A.denemeler.map((e) => e.id)).toEqual(['e1', 'e2', 'e3'])
    expect(row('c').hucreler[1]).toEqual({ score: null, net: null, rank: null })
    expect(row('c').katildigi).toBe(2)
    expect(row('c').ortalamaNet).toBe(18) // (20 + 16) / 2
    expect(A.ozet.katilim).toBeCloseTo(8 / 9)
  })

  it('sıra, sıra değişimi ve net değişimi', () => {
    expect(row('a').hucreler.map((h) => h.rank)).toEqual([1, 2, 2])
    expect(row('b').hucreler.map((h) => h.rank)).toEqual([2, 1, 1])
    expect(row('a').siraDegisim).toBe(0)
    expect(row('a').netDegisim).toBe(-4) // 26 → 22
    // c: girdiği son iki deneme e1 (3.) ve e3 (3.)
    expect(row('c').siraDegisim).toBe(0)
  })

  it('işaretler: düşüş, 2 denemedir düşüş, hedefin altı, görüşme yok', () => {
    expect(row('a').isaretler).toEqual(['dusus', 'iki_dusus', 'hedef_alti', 'gorusme_yok'])
    expect(row('b').isaretler).toEqual(['yukselis'])
    expect(row('b').sonGorusme).toBe('2026-10-01')
    expect(row('a').hedefFark).toBe(-20)
  })

  it('görev, devamsızlık ve en zayıf ders', () => {
    expect(row('a')).toMatchObject({ acikGorev: 2, gecikenGorev: 1 })
    expect(row('c').devamsiz).toBe(1)
    expect(row('a').zayifDers).toEqual({ code: 'MAT', pct: 50 })
  })

  it('son denemenin ortak yanlış konuları ve bulgular', () => {
    expect(A.konular.map((k) => [k.outcome.code, k.yanlis.length, k.soruldu])).toEqual([
      ['M.1', 3, 3],
      ['M.2', 1, 3],
    ])
    expect(A.bulgular.map((b) => b.metin)).toContain('Son denemede sınıfın yarısından fazlası (3/3) aynı konuda yanlış yaptı: M.1 Kesirler.')
    expect(A.ozet.sonOrtNet).toBeCloseTo((22 + 32 + 16) / 3)
  })
})
