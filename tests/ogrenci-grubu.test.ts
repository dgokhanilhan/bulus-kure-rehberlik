// Öğrenci grubu (kohort) kuralı (0028 + 0029): konu sınıfının programı, öğrencilerin o sınıfı okuduğu yılın programıdır.
// 2026–2027'de 12. sınıf TYT'deki 9. sınıf konusu eski programa gider, TYMM kaydına bağlanmaz; 11. sınıfta TYMM'ye gider.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { service, signIn } from './helpers'

const svc = service()
let rehber: SupabaseClient
let school = ''
const ids: Record<string, string> = {}

const versions = async (grades: number[], student: number, subject: string, year: number) => {
  const { data, error } = await svc.rpc('cohort_versions', { p_content_grades: grades, p_student_grade: student, p_subject: subject, p_year: year })
  expect(error).toBeNull()
  const { data: vs } = await svc.from('curriculum_versions').select('id, grade, curriculum_type, year_from').in('id', data as string[])
  return (data as string[]).map((id) => vs!.find((v) => v.id === id)!).map((v) => `${v.grade}:${v.curriculum_type}:${v.year_from}`)
}

beforeAll(async () => {
  rehber = await signIn('rehber')
  school = (await svc.from('schools').select('id').single()).data!.id
  const { data: c } = await svc.from('classes').insert({ school_id: school, grade: 12, section: 'Z' }).select('id, name').single()
  ids.c12 = c!.id
  const { data: s } = await svc.from('students').insert({ school_id: school, full_name: 'Kohort Onikinci', class_id: ids.c12 }).select('id').single()
  ids.s12 = s!.id
  ids.tyt = (await svc.from('exam_templates').select('id').eq('builtin', true).eq('grade', 12).like('name', '%TYT%').single()).data!.id
})
afterAll(async () => {
  await svc.from('exams').delete().eq('school_id', school).like('name', 'Kohort %')
  await svc.from('students').delete().eq('id', ids.s12)
  await svc.from('classes').delete().eq('id', ids.c12)
})

describe('Öğrenci grubu kuralı', () => {
  it('2026–2027: 12. sınıfın 9–12. sınıf konuları eski program; 11. sınıfın 9–11 konuları TYMM (okudukları sürüm)', async () => {
    expect(await versions([9, 10, 11, 12], 12, 'MAT', 2026)).toEqual(['9:LEGACY:2018', '10:LEGACY:2018', '11:LEGACY:2018', '12:LEGACY:2018'])
    expect(await versions([9, 10, 11], 11, 'MAT', 2026)).toEqual(['9:TYMM:2024', '10:TYMM:2025', '11:TYMM:2026'])
    // aynı sınıfta güncel konu: denemenin yılı (9. sınıf 2026–2027 → TYMM 2026 sürümü)
    expect(await versions([9], 9, 'MAT', 2026)).toEqual(['9:TYMM:2026'])
    // Tarih eski programı 2023'ten: 12. sınıfın 9. sınıf Tarih konusu 2023 programında
    expect(await versions([9, 10], 12, 'TAR', 2026)).toEqual(['9:LEGACY:2023', '10:LEGACY:2023'])
  })

  it('12. sınıf TYT içe aktarma: TYMM 9 kodu bağlanmaz (UNRESOLVED), eski 9. sınıf kodu bağlanır; elle eşleme de aynı kurala uyar', async () => {
    const { data, error } = await rehber.rpc('import_exam', {
      p: {
        name: 'Kohort TYT', exam_date: '2026-09-25', grade: 12, exam_type: 'YKS', yks_part: 'TYT', template_id: ids.tyt,
        items: [
          { section_key: 'MAT', q_no: 1, raw_code: 'MAT.9.1.1', raw_text: null }, // TYMM 9: bu öğrenci grubu okumadı
          { section_key: 'MAT', q_no: 2, raw_code: '9.1.1.1', raw_text: null }, // eski program 9. sınıf
        ],
        results: [{ student_id: ids.s12, score: null, sections: { MAT: { d: 20, y: 8, b: 12, net: 18 } }, answers: {}, source: {} }],
      },
    })
    expect(error).toBeNull()
    expect([data.items, data.resolved, data.unresolved]).toEqual([2, 1, 1])
    const { data: items } = await svc.from('exam_items').select('q_no, match_method, outcome_grade, curriculum_versions(curriculum_type, year_from)').eq('exam_id', data.exam_id).order('q_no')
    expect(items![0]).toMatchObject({ q_no: 1, match_method: 'UNRESOLVED' })
    expect(items![1]).toMatchObject({ q_no: 2, match_method: 'CODE_EXACT', outcome_grade: 9, curriculum_versions: { curriculum_type: 'LEGACY', year_from: 2018 } })

    const pick = async (type: string, year: number, code: string) =>
      (await svc.from('learning_outcomes').select('id, curriculum_versions!inner(curriculum_type, year_from)').eq('grade', 9).eq('subject_code', 'MAT').eq('code', code)
        .eq('curriculum_versions.curriculum_type', type).eq('curriculum_versions.year_from', year).single()).data!.id
    const tymm9 = await pick('TYMM', 2024, 'MAT.9.1.1')
    const eski9 = await pick('LEGACY', 2018, '9.1.1.2')
    expect((await rehber.rpc('set_item_outcome', { p_exam: data.exam_id, p_section: 'MAT', p_q: 1, p_outcome: tymm9 })).error?.message).toMatch(/öğrenci grubunun okuduğu program/)
    expect((await rehber.rpc('set_item_outcome', { p_exam: data.exam_id, p_section: 'MAT', p_q: 1, p_outcome: eski9 })).error).toBeNull()
  })

  it('0027 resolve_outcome aynı davranır (denemenin yılı): 2026 + 9. sınıf → TYMM', async () => {
    const r = ((await rehber.rpc('resolve_outcome', { p_subject: 'MAT', p_grades: [9], p_year: 2026, p_code: 'MAT.9.1.1', p_text: null, p_school: school })).data ?? [])[0]
    expect(r?.method).toBe('CODE_EXACT')
  })
})
