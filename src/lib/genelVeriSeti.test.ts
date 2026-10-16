import { describe, it, expect } from 'vitest'
import { genelDataset, withCatalogItems, type ItemRow } from './genelVeriSeti'
import { SUBJECTS, classHeat, konuStatus, questionsFor, wrongOutcomes, type Dataset, type Result } from './analiz'

describe('genel veri seti: ders adları profilden, oturuma göre', () => {
  const sub = (sort: number, exam_stage: 'TYT' | 'AYT', display_name: string, canonical_subject: string) => ({
    sort,
    exam_stage,
    display_name,
    canonical_subject,
    section_subjects: [canonical_subject],
    language_code: null,
  })
  const profile = {
    academic_year: 2026,
    student_grade: 12,
    school_type: 'ANADOLU_LISESI',
    program_family: 'LEGACY' as const,
    outcome_term: 'KAZANIM' as const,
    subtests: [sub(1, 'TYT', 'TYT Türkçe', 'TUR'), sub(2, 'TYT', 'TYT Temel Matematik', 'MAT'), sub(10, 'AYT', 'AYT Matematik', 'MAT')],
  }
  const tpl = (id: string, keys: string[]) => ({
    id,
    sections: keys.map((k, i) => ({
      key: k,
      subject_code: k.replace(/\d$/, ''),
      label: k,
      question_count: 40,
      sort: i,
      optional_group: null,
      outcome_grades: null,
    })),
  })
  const exam = (id: string, part: 'TYT' | 'AYT') => ({
    id,
    name: id,
    exam_date: '2026-09-20',
    grade: 12,
    exam_type: 'YKS' as const,
    yks_part: part,
    exam_code: null,
    publisher: null,
    exam_template_id: id,
  })
  it('AYT denemesinde MAT "AYT Matematik"; TYT denemesinde "TYT Temel Matematik"; profil dışı bölüm sonda', () => {
    const ayt = genelDataset({ exams: [exam('a', 'AYT')], results: [], items: [], templates: [tpl('a', ['TDE', 'MAT'])], profile })
    expect(ayt.subjects.map((s) => s.ad)).toEqual(['AYT Matematik', 'TDE'])
    const tyt = genelDataset({ exams: [exam('t', 'TYT')], results: [], items: [], templates: [tpl('t', ['TUR', 'MAT'])], profile })
    expect(tyt.subjects.map((s) => s.ad)).toEqual(['TYT Türkçe', 'TYT Temel Matematik'])
  })
  it('"uygulanmadı" bölüm sonuçta yer almaz; kazanım anahtarı bölüm + katalog kimliği', () => {
    const ds = genelDataset({
      exams: [exam('t', 'TYT')],
      templates: [tpl('t', ['TUR', 'MAT'])],
      profile,
      results: [{ exam_id: 't', student_id: 's', score: null, subjects: { TUR: { d: 30, y: 4, b: 6, net: 29 }, MAT: { na: true } }, answers: { TUR: 'A' } }],
      items: [
        {
          exam_id: 't',
          section_key: 'TUR',
          q_no: 1,
          correct_answer: 'A',
          learning_outcome_id: 'lo1',
          match_method: 'CODE_EXACT',
          learning_outcomes: { code: '9.1.1', title: 'Başlık' },
        },
      ],
    })
    expect(Object.keys(ds.results[0]!.subjects)).toEqual(['TUR'])
    expect(ds.outcomes[0]).toMatchObject({ code: 'TUR:lo1', display: '9.1.1', outcomeId: 'lo1' })
  })
})
it('A/B kitapçığına göre kazanım, veli raporu ve sınıf analizi ayrılır', () => {
  const items = ['A', 'B'].map((booklet, i) => ({
    exam_id: 'e',
    booklet,
    section_key: 'MAT',
    q_no: 1,
    correct_answer: 'C',
    learning_outcome_id: 'o' + i,
    match_method: 'CODE_EXACT',
    learning_outcomes: { code: 'MAT.11.1.' + i, title: 'Hedef ' + booklet },
  }))
  const ds = genelDataset({
    exams: [{ id: 'e', name: 'Deneme', exam_date: '2026-10-14', exam_type: 'AYT', yks_part: null, publisher: null, exam_template_id: 't' }],
    results: ['A', 'B'].map((booklet) => ({
      exam_id: 'e',
      student_id: booklet,
      score: null,
      subjects: { MAT: { d: 0, y: 1, b: 0, net: -0.25 } },
      answers: { MAT: 'b' },
      source: { booklets: { MAT: booklet } },
    })),
    items,
    templates: [
      { id: 't', sections: [{ key: 'MAT', subject_code: 'MAT', label: 'Matematik', question_count: 1, sort: 1, optional_group: null, outcome_grades: null }] },
    ],
    profile: null,
  })
  expect(questionsFor(ds, ds.results[0]!)[0]!.outcome_code).toBe('MAT:o0')
  expect(questionsFor(ds, ds.results[1]!)[0]!.outcome_code).toBe('MAT:o1')
  expect(wrongOutcomes(ds, ds.results[0]!).wrong.map((o) => o.title)).toEqual(['Hedef A'])
  expect(wrongOutcomes(ds, ds.results[1]!).wrong.map((o) => o.title)).toEqual(['Hedef B'])
  expect(classHeat(ds, ['B'], 'MAT', ds.exams).map((r) => r.outcome.title)).toEqual(['Hedef B'])
})

// 8. sınıf (LGS): Eşleşmeyen hedefler'den eşlenen/eklenen hedefler kitapçık başınadır; outcomes_ok sonradan açılmaz.
describe('LGS yeni katalog hedefleri (withCatalogItems)', () => {
  const lo = (code: string) => ({ code, title: `Hedef ${code}`, outcome_type: 'KAZANIM' as const, curriculum_versions: { curriculum_type: 'PDF' } })
  const items: ItemRow[] = [
    { exam_id: 'e', section_key: 'ING', q_no: 1, booklet: 'A', correct_answer: 'A', learning_outcome_id: 'x', match_method: 'MANUAL', learning_outcomes: lo('E.8.1.1') },
    { exam_id: 'e', section_key: 'ING', q_no: 1, booklet: 'B', correct_answer: 'C', learning_outcome_id: 'y', match_method: 'ALIAS', learning_outcomes: lo('E.8.1.2') },
    { exam_id: 'e', section_key: 'ING', q_no: 2, booklet: 'A', correct_answer: 'B', learning_outcome_id: null, match_method: 'UNRESOLVED', learning_outcomes: null },
  ]
  const result = (sid: string, ans: string, booklet: string | null, outcomes_ok = true) =>
    ({ exam_id: 'e', student_id: sid, score: 300, subjects: {}, answers: { ING: ans }, outcomes_ok, kazanim: { subjects: ['MAT'], g: {} }, source: booklet ? { booklets: { ING: booklet } } : {} }) as Result & { source: unknown }
  const base = {
    subjects: SUBJECTS,
    exams: [{ id: 'e', name: 'TG-1', publisher: null, exam_date: '2026-10-15' }],
    questionsByExam: new Map([['e', [{ exam_id: 'e', subject: 'ING', q_no: 1, correct_answer: 'A', outcome_code: null, match: 'none' as const }]]]),
    outcomes: [],
  }
  const ds: Dataset = withCatalogItems({ ...base, results: [result('a', 'B_________', 'A'), result('b', 'C_________', 'B'), result('eski', 'A_________', null), result('kapali', 'C_________', 'B', false)] }, items)
  const st = (sid: string, code: string) => {
    const r = ds.results.find((x) => x.student_id === sid)!
    return konuStatus(r, questionsFor(ds, r), 'ING', code)
  }
  it('öğrenci yalnız kendi kitapçığının hedefiyle ve anahtarıyla değerlendirilir', () => {
    expect(st('a', 'ING:x')).toBe('y') // A: anahtar A, cevap B
    expect(st('a', 'ING:y')).toBe('n') // B kitapçığının hedefi A öğrencisine bağlanmaz
    expect(st('b', 'ING:y')).toBe('d') // B: anahtar C, cevap C
    expect(st('b', 'ING:x')).toBe('n')
    expect(st('eski', 'ING:x')).toBe('d') // kitapçık bilgisi olmayan eski kayıt A sayılır
    expect(ds.outcomes.map((o) => o.code).sort()).toEqual(['ING:x', 'ING:y'])
    expect(ds.outcomes.every((o) => o.source === 'pdf')).toBe(true)
  })
  it('yayında konu analizi kapatılan sonuç (outcomes_ok=false) yeni hedeflerle açılmaz', () => {
    expect(ds.results.find((x) => x.student_id === 'kapali')!.outcomes_ok).toBe(false)
    expect(st('kapali', 'ING:y')).toBe('o')
  })
})
