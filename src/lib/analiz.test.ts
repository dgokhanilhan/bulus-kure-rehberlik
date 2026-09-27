import { describe, it, expect } from 'vitest'
import { attention, fmt, konuStatus, repeats, totalNet, wrongOutcomes, type Dataset, type Question, type Result } from './analiz'

const q = (exam_id: string, q_no: number, code: string | null, match: Question['match'] = 'code_exact', correct = 'A'): Question => ({
  exam_id,
  subject: 'MAT',
  q_no,
  correct_answer: correct,
  outcome_code: code,
  match,
})
const res = (exam_id: string, student_id: string, mat: string, net = 10, ok = true): Result => ({
  exam_id,
  student_id,
  score: null,
  subjects: { MAT: { d: 10, y: 0, b: 0, net }, TUR: { d: 5, y: 3, b: 0, net: 4 } },
  answers: { MAT: mat },
  outcomes_ok: ok,
})

describe('konuStatus', () => {
  const qs = [q('e1', 1, 'M.1'), q('e1', 2, 'M.1'), q('e1', 3, 'M.2', 'semantic'), q('e1', 4, 'M.3')]
  it('bir yanlış varsa yanlış; hepsi doğruysa doğru; boş varsa boş', () => {
    expect(konuStatus(res('e1', 's', 'AB__'), qs, 'MAT', 'M.1')).toBe('y')
    expect(konuStatus(res('e1', 's', 'AA__'), qs, 'MAT', 'M.1')).toBe('d')
    expect(konuStatus(res('e1', 's', 'A___'), qs, 'MAT', 'M.1')).toBe('b')
  })
  it('okunamayan cevap boş sayılmaz ve tahmin edilmez', () => {
    expect(konuStatus(res('e1', 's', 'A?__'), qs, 'MAT', 'M.1')).toBe('o')
    expect(konuStatus(res('e1', 's', 'B?__'), qs, 'MAT', 'M.1')).toBe('y')
  })
  it('güvenilir olmayan eşleşme (semantic) analize girmez', () => {
    expect(konuStatus(res('e1', 's', 'AAB_'), qs, 'MAT', 'M.2')).toBe('o')
  })
  it('kazanım bölümü okunamadıysa ya da denemede kazanım yoksa okunamadı', () => {
    expect(konuStatus(res('e1', 's', 'BBBB', 10, false), qs, 'MAT', 'M.1')).toBe('o')
    expect(konuStatus(res('e1', 's', 'BBBB'), [q('e1', 1, null, 'none')], 'MAT', 'M.1')).toBe('o')
  })
  it('soru yoksa "soru yok", girmediyse "girmedi"', () => {
    expect(konuStatus(res('e1', 's', 'AAAA'), qs, 'MAT', 'M.9')).toBe('n')
    expect(konuStatus(undefined, qs, 'MAT', 'M.1')).toBe('x')
  })
})

const ds = (): Dataset => {
  const exams = ['e1', 'e2', 'e3'].map((id, i) => ({ id, name: `TG-${i + 1}`, publisher: null, exam_date: `2026-09-0${i + 1}` }))
  const questionsByExam = new Map(exams.map((e) => [e.id, [q(e.id, 1, 'M.1'), q(e.id, 2, 'M.2')]]))
  return {
    exams,
    questionsByExam,
    outcomes: [
      { code: 'M.1', subject: 'MAT', title: 'Üslü ifadeler' },
      { code: 'M.2', subject: 'MAT', title: 'Kareköklü ifadeler' },
    ],
    results: [
      res('e1', 'a', 'BA', 14),
      res('e2', 'a', 'BA', 12),
      res('e3', 'a', 'BB', 9),
      res('e1', 'b', 'AA', 10),
      res('e2', 'b', 'AA', 10),
      res('e3', 'b', 'AA', 16),
      res('e1', 'c', 'AA', 10),
    ],
  }
}

describe('repeats / wrongOutcomes', () => {
  it('≥ 2 denemede yanlış olan kazanım tekrar eden hatadır', () => {
    const r = repeats(ds(), 'a')
    expect(r.map((x) => [x.outcome.code, x.count, x.lastWrong])).toEqual([['M.1', 3, true]])
    expect(r[0]!.hist).toEqual(['y', 'y', 'y'])
    expect(repeats(ds(), 'a', 'e2')[0]!.count).toBe(2)
  })
  it('bir denemedeki yanlış konular', () => {
    const d = ds()
    expect(wrongOutcomes(d, d.results[2]!).wrong.map((o) => o.code)).toEqual(['M.1', 'M.2'])
  })
})

describe('attention (Bugün)', () => {
  it('düşüş, kalıcı hata, gelişim, eksik ve gecikme kuralları', () => {
    const d = ds()
    const list = attention(d, [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }], [
      { student_id: 'b', topic: 'Basınç', solved: 3, question_count: 10, due_date: '2026-09-01', completed_at: null },
    ], '2026-09-10')
    const by = (sid: string) => list.filter((x) => x.sid === sid).map((x) => `${x.tag}: ${x.short}`)
    expect(by('a')).toEqual(['Düşüş: Matematik 14 → 12 → 9'])
    expect(by('b')).toEqual(['Gecikme: Basınç görevi 3/10', 'Gelişim: Toplam net 14 → 20'])
    expect(by('c')).toEqual(['Eksik: Son 2 denemeye (TG-2, TG-3) girmedi'])
    expect(by('d')).toEqual(['Eksik: Son 2 denemeye (TG-2, TG-3) girmedi'])
    expect(list[0]!.tag).toBe('Düşüş')
  })
})

describe('biçim', () => {
  it('ondalık virgül ve toplam net', () => {
    expect(fmt(69.666, 2)).toBe('69,67')
    expect(totalNet(res('e1', 'x', 'A', 10))).toBe(14)
  })
})

import { classHeat } from './analiz'
describe('classHeat', () => {
  it('konu başına doğru oranı ve yanlış yapanlar; okunamayan öğrenci sayılmaz', () => {
    const d = ds()
    const rows = classHeat(d, ['a', 'b', 'c'], 'MAT', d.exams)
    const m1 = rows.find((r) => r.outcome.code === 'M.1')!
    // e1: a yanlış(B), b doğru, c doğru → %67; e3: a yanlış, b doğru → %50
    expect(m1.cells.map((c) => c.p)).toEqual([67, 50, 50])
    expect(m1.cells[2]!.wrong).toEqual(['a'])
    d.results.find((r) => r.student_id === 'a' && r.exam_id === 'e3')!.outcomes_ok = false
    expect(classHeat(d, ['a', 'b'], 'MAT', d.exams)[0]!.cells[2]).toEqual({ p: 100, wrong: [] })
  })
})
