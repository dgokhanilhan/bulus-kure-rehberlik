import { describe, it, expect } from 'vitest'
import { genelDataset } from './genelVeriSeti'

describe('genel veri seti: ders adları profilden, oturuma göre', () => {
  const sub = (sort: number, exam_stage: 'TYT' | 'AYT', display_name: string, canonical_subject: string) => ({ sort, exam_stage, display_name, canonical_subject, section_subjects: [canonical_subject], language_code: null })
  const profile = { academic_year: 2026, student_grade: 12, school_type: 'ANADOLU_LISESI', program_family: 'LEGACY' as const, outcome_term: 'KAZANIM' as const,
    subtests: [sub(1, 'TYT', 'TYT Türkçe', 'TUR'), sub(2, 'TYT', 'TYT Temel Matematik', 'MAT'), sub(10, 'AYT', 'AYT Matematik', 'MAT')] }
  const tpl = (id: string, keys: string[]) => ({ id,
    sections: keys.map((k, i) => ({ key: k, subject_code: k.replace(/\d$/, ''), label: k, question_count: 40, sort: i, optional_group: null, outcome_grades: null })) })
  const exam = (id: string, part: 'TYT' | 'AYT') => ({ id, name: id, exam_date: '2026-09-20', grade: 12, exam_type: 'YKS' as const, yks_part: part, exam_code: null, publisher: null, exam_template_id: id })
  it('AYT denemesinde MAT "AYT Matematik"; TYT denemesinde "TYT Temel Matematik"; profil dışı bölüm sonda', () => {
    const ayt = genelDataset({ exams: [exam('a', 'AYT')], results: [], items: [], templates: [tpl('a', ['TDE', 'MAT'])], profile })
    expect(ayt.subjects.map((s) => s.ad)).toEqual(['AYT Matematik', 'TDE'])
    const tyt = genelDataset({ exams: [exam('t', 'TYT')], results: [], items: [], templates: [tpl('t', ['TUR', 'MAT'])], profile })
    expect(tyt.subjects.map((s) => s.ad)).toEqual(['TYT Türkçe', 'TYT Temel Matematik'])
  })
  it('"uygulanmadı" bölüm sonuçta yer almaz; kazanım anahtarı bölüm + katalog kimliği', () => {
    const ds = genelDataset({ exams: [exam('t', 'TYT')], templates: [tpl('t', ['TUR', 'MAT'])], profile,
      results: [{ exam_id: 't', student_id: 's', score: null, subjects: { TUR: { d: 30, y: 4, b: 6, net: 29 }, MAT: { na: true } }, answers: { TUR: 'A' } }],
      items: [{ exam_id: 't', section_key: 'TUR', q_no: 1, correct_answer: 'A', learning_outcome_id: 'lo1', match_method: 'CODE_EXACT', learning_outcomes: { code: '9.1.1', title: 'Başlık' } }] })
    expect(Object.keys(ds.results[0]!.subjects)).toEqual(['TUR'])
    expect(ds.outcomes[0]).toMatchObject({ code: 'TUR:lo1', display: '9.1.1', outcomeId: 'lo1' })
  })
})
