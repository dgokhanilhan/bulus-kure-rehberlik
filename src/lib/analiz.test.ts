import { describe, it, expect } from 'vitest'
import { attention, DEFAULT_TODAY, fmt, konuStatus, repeats, totalNet, wrongOutcomes, type Dataset, type Question, type Result } from './analiz'
import { SUBJECTS } from './analiz'

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
    subjects: SUBJECTS,
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
    const list = attention(
      d,
      [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }],
      [{ student_id: 'b', topic: 'Basınç', solved: 3, question_count: 10, due_date: '2026-09-01', completed_at: null }],
      '2026-09-10',
    )
    const by = (sid: string) => list.filter((x) => x.sid === sid).map((x) => `${x.tag}: ${x.short}`)
    expect(by('a')).toEqual(['Düşüş: Matematik 14 → 12 → 9'])
    expect(by('b')).toEqual(['Gecikme: Basınç görevi 3/10', 'Gelişim: Toplam net 14 → 20'])
    expect(by('c')).toEqual(['Eksik: Son 2 denemeye (TG-2, TG-3) girmedi'])
    expect(by('d')).toEqual(['Eksik: Son 2 denemeye (TG-2, TG-3) girmedi'])
    expect(list[0]!.tag).toBe('Düşüş')
  })
  it('sınıfa göre (Bugün): düşüş öğrencinin değişimi − ortalama değişim; herkes düştüyse ayrışmayan listelenmez', () => {
    const d = ds()
    const by = (l: ReturnType<typeof attention>, sid: string) => l.filter((x) => x.sid === sid).map((x) => `${x.tag}: ${x.short}`)
    // a: −3, b: +6 → ortalama +1,5; a sınıfa göre −4,5
    const ab = attention(d, [{ id: 'a' }, { id: 'b' }], [], '2026-09-10', DEFAULT_TODAY, { goreli: true })
    expect(by(ab, 'a')).toEqual(['Düşüş: Matematik 14 → 12 → 9 · sınıfa göre −4,5 net'])
    expect(by(ab, 'b')).toEqual(['Gelişim: Toplam net 14 → 20'])
    // a: −3, e: −6 → ortalama −4,5; ikisi de sınıfa göre belirgin düşmedi (a'nın kalıcı hatası yine görünür)
    d.results.push(res('e2', 'e', 'AA', 10), res('e3', 'e', 'AA', 4))
    const ae = attention(d, [{ id: 'a' }, { id: 'e' }], [], '2026-09-10', DEFAULT_TODAY, { goreli: true })
    expect(by(ae, 'a')).toEqual(['Tekrar eden hata: Üslü ifadeler: 3 denemede yanlış'])
    expect(by(ae, 'e')).toEqual([])
    expect(attention(d, [{ id: 'a' }, { id: 'e' }], [], '2026-09-10').filter((x) => x.tag === 'Düşüş')).toHaveLength(2)
    // tek öğrenci: ham değişim
    expect(by(attention(d, [{ id: 'a' }], [], '2026-09-10', DEFAULT_TODAY, { goreli: true }), 'a')).toEqual(['Düşüş: Matematik 14 → 12 → 9'])
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

import { gorevEtkisi, gorevEtkiOzeti } from './analiz'
describe('görevin etkisi (işe yaradı mı?)', () => {
  // Öğrenci a: M.1 e1, e2, e3'te yanlış; M.2 e1, e2'de doğru, e3'te yanlış
  const gorev = (code: string | null, gun: string) => ({ outcome_code: code, created_at: `${gun}T09:00:00+03:00` })
  it('görevden sonraki denemelerde konu doğruya döndüyse düzeldi; art arda doğru sayılır', () => {
    const d = ds()
    d.exams.push({ id: 'e4', name: 'TG-4', publisher: null, exam_date: '2026-09-04' }, { id: 'e5', name: 'TG-5', publisher: null, exam_date: '2026-09-05' })
    d.questionsByExam.set('e4', [q('e4', 1, 'M.1'), q('e4', 2, 'M.2')])
    d.questionsByExam.set('e5', [q('e5', 1, 'M.1'), q('e5', 2, 'M.2')])
    d.results.push(res('e4', 'a', 'AA'), res('e5', 'a', 'A_'))
    // M.1 görevi e3 günü verildi: önce 3 yanlış, sonra e4 ve e5 doğru
    expect(gorevEtkisi(d, 'a', gorev('M.1', '2026-09-03'))).toEqual({ once: 3, sonra: ['d', 'd'], durum: 'duzeldi', dogruSeri: 2 })
    // M.2: e4 doğru, e5 boş → son durum boş
    expect(gorevEtkisi(d, 'a', gorev('M.2', '2026-09-03'))).toEqual({ once: 1, sonra: ['d', 'b'], durum: 'bos', dogruSeri: 0 })
    expect(gorevEtkiOzeti([gorevEtkisi(d, 'a', gorev('M.1', '2026-09-03')), gorevEtkisi(d, 'a', gorev('M.2', '2026-09-03')), null])).toEqual({
      olculen: 2,
      duzelen: 1,
      bekleyen: 0,
    })
  })
  it('sonraki denemede yine yanlışsa sürüyor; sonra deneme yoksa bekliyor', () => {
    const d = ds()
    expect(gorevEtkisi(d, 'a', gorev('M.1', '2026-09-01'))).toEqual({ once: 1, sonra: ['y', 'y'], durum: 'suruyor', dogruSeri: 0 })
    expect(gorevEtkisi(d, 'a', gorev('M.1', '2026-09-03'))).toEqual({ once: 3, sonra: [], durum: 'bekliyor', dogruSeri: 0 })
    expect(gorevEtkiOzeti([gorevEtkisi(d, 'a', gorev('M.1', '2026-09-03'))])).toEqual({ olculen: 0, duzelen: 0, bekleyen: 1 })
  })
  it('güvenilir okunmayan deneme sayılmaz; kazanımsız ya da bilinmeyen kazanımlı görevde sonuç yok', () => {
    const d = ds()
    // e2'de eşleşme güvenilir değil, e3'te kazanım okunamadı: ikisi de "sonra"ya girmez
    d.questionsByExam.set('e2', [q('e2', 1, 'M.1', 'semantic'), q('e2', 2, 'M.2')])
    d.results[2] = res('e3', 'a', 'BB', 9, false)
    expect(gorevEtkisi(d, 'a', gorev('M.1', '2026-09-01'))).toEqual({ once: 1, sonra: [], durum: 'bekliyor', dogruSeri: 0 })
    expect(gorevEtkisi(d, 'a', gorev(null, '2026-09-01'))).toBeNull()
    expect(gorevEtkisi(d, 'a', gorev('M.99', '2026-09-01'))).toBeNull()
    // Denemeye girmeyen öğrenci: sonra boş
    expect(gorevEtkisi(d, 'c', gorev('M.1', '2026-09-01'))!.durum).toBe('bekliyor')
  })
})
