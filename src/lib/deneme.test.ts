import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { buildPayload, buildReview, pendingCount, type DkPack, type DkQuestion, type DkRecord } from './deneme'
import { SUBJECTS, wrongOutcomes, type Dataset, type Result } from './analiz'
import type { RosterStudent } from './isim'

// Gerçek motorla (public/engine/parser.mjs) sentetik paketi içe al.
const root = new URL('../../', import.meta.url)
// @ts-expect-error — motor saf JS (tip bildirimi yok)
const eng = await import('../../public/engine/parser.mjs')
const cat = JSON.parse(readFileSync(new URL('public/engine/catalog.json', root), 'utf8')).outcomes
const load = (): DkPack => eng.importPack(JSON.parse(readFileSync(new URL('public/ornek/ornek-deneme.json', root), 'utf8')), cat)

const roster: RosterStudent[] = [
  ['elif', 'Elif Yıldız', '8/A', '1184'],
  ['ayse', 'Ayşe Çelik', '8/A', '1185'],
  ['deniz', 'Deniz Arslan', '8/A', '1186'],
  ['zeynep', 'Zeynep Kaya', '8/A', '1187'],
  ['kerem', 'Kerem Aydın', '8/B', '1201'],
  ['mert', 'Mert Demir', '8/B', '1202'],
  ['selin', 'Selin Kurt', '8/B', '1203'],
  ['irem', 'İrem Tekin', '8/C', '1224'],
].map(([id, full_name, class_name, school_no]) => ({ id: id!, full_name: full_name!, class_name: class_name!, school_no: school_no! }))

describe('deneme kontrolü', () => {
  it('yalnız gerçek sorunlar karar ister: listede olmayan isim, D+Y+B tutarsızlığı, tanınmayan sayfa', () => {
    const rv = buildReview(load(), roster)
    const by = (n: string) => rv.rows.find((r) => r.read.name === n)!
    expect(by('ELİF YILDIZ').match).toEqual({ kind: 'exact', id: 'elif', via: 'name' })
    expect(by('ZEGNEP KAYA').match).toEqual({ kind: 'fixed', id: 'zeynep', via: 'name' })
    expect(by('KERM AYDIN').match).toEqual({ kind: 'fixed', id: 'kerem', via: 'name' })
    expect(by('BORA TAN').choice).toBeNull()
    const mert = by('MERT DEMİR')
    expect(mert.subjectIssues).toEqual([{ subject: 'TUR', d: 15, y: 3, b: 1, net: 14, canFix: true, choice: null }])
    expect(mert.badQuestionSubjects).toEqual(['TUR']) // yalnız Türkçe etkilenir
    expect(mert.notes.join(' ')).toMatch(/Türkçe için konu bilgisi sonuçla tutarlı okunamadı/)
    expect(rv.failedPages).toHaveLength(1)
    expect(pendingCount(rv)).toBe(3) // Bora + Mert Türkçe + tanınmayan sayfa
  })

  it('kararlar verilince yayın verisi kurallara uyar; sonuçlar kazanım okumasından bağımsızdır', () => {
    const rv = buildReview(load(), roster)
    rv.rows.find((r) => r.read.name === 'BORA TAN')!.choice = { kind: 'new', class_name: '8/C' }
    rv.rows.find((r) => r.read.name === 'MERT DEMİR')!.subjectIssues[0]!.choice = 'fix'
    rv.failedPages[0]!.skip = true
    expect(pendingCount(rv)).toBe(0)
    const p = buildPayload(rv, { name: 'TG-6', publisher: 'Hız Yayınları', exam_date: '2026-09-26', notify: true })
    expect(p.results).toHaveLength(9)
    expect(p.questions).toHaveLength(90)
    expect(p.questions.every((q) => q.match === 'code_exact' && q.outcome_code)).toBe(true)
    const mert = p.results.find((r) => r.student_id === 'mert')!
    expect(mert.subjects.TUR).toEqual({ d: 15, y: 3, b: 2, net: 14 })
    expect(mert.outcomes_ok).toBe(true)
    expect(mert.answers.TUR).toBe('?'.repeat(20)) // tutarsız dersin cevapları "okunamadı"
    expect(mert.answers.MAT).toMatch(/^[ABCD_]{20}$/)
    const bora = p.results.find((r) => r.new_student)!
    expect(bora.new_student).toEqual({ full_name: 'Bora Tan', class_name: '8/C', school_no: '1299' })
    for (const r of p.results)
      for (const [code, s] of Object.entries(r.subjects)) {
        if (!s) continue
        const n = ['TUR', 'MAT', 'FEN'].includes(code) ? 20 : 10
        expect(s.d + s.y + s.b).toBe(n)
        expect(Math.abs(s.net - (s.d - s.y / 3))).toBeLessThanOrEqual(0.011)
      }
    // Cevap dizisi: soru sayısı uzunluğunda; boş '_' ile, okunamayan '?' ile
    expect(p.results[0]!.answers.TUR).toMatch(/^[ABCD_?]{20}$/)
  })

  it('"Bu dersi boş bırak" seçilirse ders sonucu NULL gider (uydurulmaz)', () => {
    const rv = buildReview(load(), roster)
    rv.rows.find((r) => r.read.name === 'BORA TAN')!.choice = { kind: 'skip' }
    rv.rows.find((r) => r.read.name === 'MERT DEMİR')!.subjectIssues[0]!.choice = 'null'
    const p = buildPayload(rv, { name: 'TG-6', publisher: null, exam_date: '2026-09-26', notify: false })
    expect(p.results).toHaveLength(8)
    expect(p.results.find((r) => r.student_id === 'mert')!.subjects.TUR).toBeNull()
  })
})

// ---------- A/B kitapçığı (Hız soru satırlı karne) ----------
// Kitapçıklar aynı soru numarasında farklı anahtar ve kazanım taşır. Öğrenci KENDİ kitapçığıyla değerlendirilmeli:
// B kitapçığında tamamı doğru olan öğrencide yanlış konu çıkmamalı (eskiden A anahtarıyla karşılaştırılıyordu).
describe('A/B kitapçığı', () => {
  const KEY = { A: 'ABCDABCDABCDABCDABCD', B: 'DCBADCBADCBADCBADCBA' } as const
  const CODE = { A: ['M.8.1.1.1', 'M.8.1.1.2'], B: ['M.8.1.1.2', 'M.8.1.1.1'] } as const
  const rec = (id: string, name: string, booklet: 'A' | 'B', answers: string): DkRecord => {
    const questions: DkQuestion[] = [...KEY[booklet]].map((k, i): DkQuestion => {
      const a = answers[i]!
      const unmatched = i === 19 // 20. soru: PDF'teki kod resmî listede yok → Eşleşmeyen hedefler
      return {
        subject: 'MAT',
        number: i + 1,
        booklet,
        correctAnswer: k,
        studentAnswer: a === '_' ? null : a,
        status: a === '_' ? 'blank' : a === k ? 'correct' : 'wrong',
        sourceOutcomeCode: unmatched ? 'M.8.9.9' : CODE[booklet][i % 2]!,
        sourceOutcomeText: unmatched ? 'Yayının kendi hedefi' : 'Metin',
        officialOutcomeCode: unmatched ? null : CODE[booklet][i % 2]!,
        outcomeMatchMethod: unmatched ? 'UNVERIFIED' : 'CODE_EXACT',
        questionOutcomeMethod: 'SOURCE_ROW',
      }
    })
    const d = questions.filter((q) => q.status === 'correct').length
    const y = questions.filter((q) => q.status === 'wrong').length
    return {
      recordId: id,
      source: { filename: 'x.pdf', sha256: 'sha', pages: [1], adapter: 'hiz_cards_v1' },
      student: { name, number: id, class: '8/A' },
      exam: { name: 'TG-1', score: 400, totalNet: d - y / 3 },
      subjects: [{ id: 'MAT', questionCount: 20, correct: d, wrong: y, blank: 20 - d - y, net: d - y / 3 }],
      questions,
      validation: { errors: [], warnings: [] },
    }
  }
  const pack: DkPack = {
    schemaVersion: '1.0.0',
    records: [
      rec('1', 'ADA A', 'A', 'BBCDABCDABCDABCDABCD'), // A: 1. soru yanlış (M.8.1.1.1)
      rec('2', 'BORA A', 'A', KEY.A),
      rec('3', 'CAN B', 'B', KEY.B), // B: hepsi doğru
      rec('4', 'DERYA B', 'B', 'DCBADCBADCBADCBADCB_'), // B: 20. soru boş
    ],
  }
  const roster: RosterStudent[] = pack.records.map((r) => ({ id: r.student.name, full_name: r.student.name, class_name: '8/A', school_no: r.student.number! }))
  const p = buildPayload(buildReview(pack, roster), { name: 'TG-1', publisher: 'Hız Yayınları', exam_date: '2026-10-15', notify: false })
  const res = (n: string) => p.results.find((r) => r.student_id === n)!
  const ds: Dataset = {
    subjects: SUBJECTS,
    exams: [{ id: 'e', name: 'TG-1', publisher: null, exam_date: '2026-10-15' }],
    questionsByExam: new Map([['e', p.questions.map((q) => ({ exam_id: 'e', ...q }))]]),
    outcomes: [
      { code: 'M.8.1.1.1', subject: 'MAT', title: 'Çarpanlar' },
      { code: 'M.8.1.1.2', subject: 'MAT', title: 'EBOB-EKOK' },
    ],
    results: p.results.map((r) => ({ exam_id: 'e', student_id: r.student_id!, score: r.score, subjects: r.subjects, answers: r.answers, outcomes_ok: r.outcomes_ok, kazanim: r.kazanim }) as Result),
  }
  const wrong = (n: string) => wrongOutcomes(ds, ds.results.find((r) => r.student_id === n)!).wrong.map((o) => o.code)

  it('B kitapçığında yanlışı olmayan öğrencide yanlış konu çıkmaz; A öğrencisi kendi anahtarıyla değerlendirilir', () => {
    expect(wrong('CAN B')).toEqual([])
    expect(wrong('DERYA B')).toEqual([])
    expect(wrong('BORA A')).toEqual([])
    expect(wrong('ADA A')).toEqual(['M.8.1.1.1'])
    expect(res('CAN B').outcomes_ok).toBe(true)
    expect(res('CAN B').source.booklets).toEqual({ MAT: 'B' })
    // Kazanım × D/Y/B öğrencinin kendi kitapçığından (eşleşmeyen 20. soru analize girmez)
    expect(res('CAN B').kazanim).toEqual({ subjects: ['MAT'], g: { 'M.8.1.1.2': [10, 10, 0, 0], 'M.8.1.1.1': [9, 9, 0, 0] } })
    expect(res('DERYA B').kazanim!.g).toEqual({ 'M.8.1.1.2': [10, 10, 0, 0], 'M.8.1.1.1': [9, 9, 0, 0] })
  })

  it('soru tablosu A kitapçığıdır; eşleşmeyen sorular kitapçık başına Eşleşmeyen hedefler kuyruğuna ayrılır', () => {
    expect(p.questions).toHaveLength(20)
    expect(p.questions.map((q) => q.correct_answer).join('')).toBe(KEY.A)
    expect(p.unresolved).toEqual([
      { subject: 'MAT', booklet: 'A', q_no: 20, correct_answer: 'D', raw_code: 'M.8.9.9', raw_text: 'Yayının kendi hedefi' },
      { subject: 'MAT', booklet: 'B', q_no: 20, correct_answer: 'A', raw_code: 'M.8.9.9', raw_text: 'Yayının kendi hedefi' },
    ])
  })

  it('anahtarı kendi kitapçığının çoğunluğuyla uyuşmayan öğrencinin konu analizi kapanır', () => {
    const odd = rec('5', 'EMRE B', 'B', KEY.B)
    odd.questions[0]!.correctAnswer = 'A' // B kitapçığında 1. sorunun anahtarı D olmalı
    const pk: DkPack = { ...pack, records: [...pack.records, odd] }
    const p2 = buildPayload(buildReview(pk, [...roster, { id: 'EMRE B', full_name: 'EMRE B', class_name: '8/A', school_no: '5' }]), {
      name: 'TG-1',
      publisher: null,
      exam_date: '2026-10-15',
      notify: false,
    })
    const emre = p2.results.find((r) => r.student_id === 'EMRE B')!
    expect(emre.outcomes_ok).toBe(false)
    expect(emre.kazanim).toBeNull() // analiz edilebilir dersi kalmadı; tek anahtarlı soru tablosuna da düşmez (outcomes_ok=false)
    expect(p2.results.find((r) => r.student_id === 'CAN B')!.outcomes_ok).toBe(true)
  })

  it('çift işaretli cevap (*) yanlış sayılır ve "*" olarak saklanır; şık uydurulmaz', () => {
    const r = rec('6', 'FUNDA A', 'A', KEY.A)
    r.questions[1] = { ...r.questions[1]!, studentAnswer: '*', status: 'wrong' }
    r.subjects[0] = { ...r.subjects[0]!, correct: 19, wrong: 1, net: 19 - 1 / 3 }
    const p3 = buildPayload(buildReview({ ...pack, records: [r] }, [{ id: 'f', full_name: 'FUNDA A', class_name: '8/A', school_no: '6' }]), {
      name: 'TG-1',
      publisher: null,
      exam_date: '2026-10-15',
      notify: false,
    })
    expect(p3.results[0]!.answers.MAT![1]).toBe('*')
    expect(p3.results[0]!.kazanim!.g['M.8.1.1.2']).toEqual([9, 8, 1, 0]) // A: çift sıralı 9 soru (20. soru eşleşmedi)
  })
})
