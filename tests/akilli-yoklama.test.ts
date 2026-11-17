import { describe, expect, it } from 'vitest'
import { planDailyAttendance, type DailyBoardDraft } from '../src/lib/akilliYoklama'

const students = [
  { id: 'a', full_name: 'Öğrenci A', class_id: '8a' },
  { id: 'b', full_name: 'Öğrenci B', class_id: '8a' },
]
const draft: DailyBoardDraft = {
  class_id: '8a',
  day: '2026-11-17',
  selections: [{ student_id: 'a', status: 'geldi' }, { student_id: 'b', status: 'gec' }],
}

describe('akıllı yoklama taslak kuralları', () => {
  it('geldi durumunu mevcut kayıttan siler, geç geleni upsert eder', () => {
    expect(planDailyAttendance(draft, students, new Map([['a', 'row-a']]))).toEqual({
      deletes: ['row-a'],
      upserts: [{ student_id: 'b', day: '2026-11-17', status: 'gec' }],
    })
  })
  it('eksik öğrenci seçimini reddeder', () => {
    expect(() => planDailyAttendance({ ...draft, selections: draft.selections.slice(0, 1) }, students, new Map())).toThrow()
  })
  it('tekrarlı veya yabancı öğrenciyi reddeder', () => {
    expect(() => planDailyAttendance({ ...draft, selections: [{ student_id: 'a', status: 'geldi' }, { student_id: 'a', status: 'gec' }] }, students, new Map())).toThrow()
    expect(() => planDailyAttendance({ ...draft, selections: [{ student_id: 'a', status: 'geldi' }, { student_id: 'x', status: 'gec' }] }, students, new Map())).toThrow()
  })
  it('başka sınıfın öğrenci listesini reddeder', () => {
    expect(() => planDailyAttendance(draft, [{ ...students[0], class_id: '8b' }, students[1]], new Map())).toThrow()
  })
  it('geçersiz tarihi reddeder', () => {
    expect(() => planDailyAttendance({ ...draft, day: '2026-02-30' }, students, new Map())).toThrow()
  })
})
