import { describe, it, expect } from 'vitest'
import { buildPayload, buildReview, type DkPack, type DkQuestion, type DkRecord } from './deneme'
import { SUBJECTS, type Dataset } from './analiz'
import {
  adBenzerligi,
  kazanimEsle,
  kazanimTablosuOku,
  konuGruplari,
  planOlustur,
  tekrarKonulari,
  yaklasanOner,
  type KatalogKazanim,
  type YaklasanSoru,
} from './yaklasan'

// Fernus biçimi (yayınevinin gönderdiği tablo): başlık, ders blokları, A ve B kitapçığı numaraları.
const BASLIK = ['', '', '', '', '', '', 'KAZANIM ID', 'KAZANIM KODU', 'KAZANIM KONU', 'KAZANIM']
const blok = (ders: string) => [ders, 'A KiTAPÇIĞI', 'B', 'C', 'D', 'ALT DERS', ...BASLIK.slice(6)]
const satir = (a: number, b: number, kod: string, konu: string, metin: string) => [String(a), '', String(b), '', '', '', '', kod, konu, `${kod} ${metin}`]
const TABLO: string[][] = [
  ['Sınav Adı', '', '', '', '', '', 'Sınav Türü:', 'LGS', '', 'Yanlış Etkisi:', '3'],
  ['8.SINIF TG GELİŞİM-2', '', '', '', '', '', 'Sınıf:', '8', '', 'Tavan Puan:', '500'],
  blok('MATEMATİK'),
  satir(1, 2, 'M.8.1.1.1.', 'Çarpanlar ve Katlar', 'Verilen pozitif tam sayıların çarpanlarını bulur.'),
  satir(2, 1, 'M.8.1.1.2.', 'Çarpanlar ve Katlar', 'İki doğal sayının EBOB ve EKOK değerini hesaplar.'),
  blok('DİN KÜLTÜRÜ'),
  satir(1, 1, 'D.8.1.2.', 'İnsanın İradesi ve Kader', 'İnsanın iradesi ile kader arasında ilişki kurar.'),
  blok('İNGİLİZCE'),
  satir(1, 1, 'E.8.1.1.', 'Friendship', 'Accepting and refusing'),
  blok('SOSYAL BİLGİLER'),
  satir(1, 1, 'SB.7.1.1.', 'Birey', 'x'),
]
const KATALOG: KatalogKazanim[] = [
  { code: 'M.8.1.1.1', subject: 'MAT', title: 'Verilen pozitif tam sayıların çarpanlarını bulur…' },
  { code: 'M.8.1.1.2', subject: 'MAT', title: 'İki doğal sayının EBOB ve EKOK değerini hesaplar' },
  { code: '8.1.2', subject: 'DIN', title: 'İnsanın iradesi ile kader arasında ilişki kurar' },
  { code: 'E8.1', subject: 'ING', title: 'Friendship' },
  { code: 'T.8.3.5', subject: 'TUR', title: 'Bağlamdan yararlanarak bilmediği kelimelerin anlamını tahmin eder' },
]

describe('kazanım tablosu', () => {
  it('ders bloklarını, kitapçık numaralarını ve sınav adını okur; tanınmayan dersi bildirir', () => {
    const d = kazanimTablosuOku(TABLO)
    expect(d.ad).toBe('8.SINIF TG GELİŞİM-2')
    expect(d.sinif).toBe(8)
    expect(d.sorular.map((s) => `${s.subject}${s.q_no}/${s.q_b}`)).toEqual(['MAT1/2', 'MAT2/1', 'DIN1/1', 'ING1/1'])
    expect(d.sorular[0]).toMatchObject({ raw_code: 'M.8.1.1.1.', konu: 'Çarpanlar ve Katlar', outcome_code: null, match: 'none' })
    expect(d.uyarilar.join(' ')).toMatch(/SOSYAL BİLGİLER/)
  })

  it('eşleşme deneme motorunun kuralıyla: tam kod, üst kod, Din ön eki; İngilizce üst koda gitmez; metin çelişirse eşleşmez', () => {
    const e = (subject: YaklasanSoru['subject'], raw_code: string, raw_text: string | null = null) => kazanimEsle({ subject, raw_code, raw_text }, KATALOG)
    expect(e('MAT', 'M.8.1.1.1.', 'M.8.1.1.1. Verilen pozitif tam sayıların çarpanlarını bulur.')).toEqual({ outcome_code: 'M.8.1.1.1', match: 'code_exact' })
    expect(e('DIN', 'D.8.1.2.')).toEqual({ outcome_code: '8.1.2', match: 'code_exact' })
    expect(e('TUR', 'T.8.3.5.1.', 'T.8.3.5.1. Bağlamdan yararlanarak bilmediği kelimelerin anlamını tahmin eder.')).toEqual({
      outcome_code: 'T.8.3.5',
      match: 'code_inferred',
    })
    expect(e('ING', 'E.8.1.1.')).toEqual({ outcome_code: null, match: 'none' })
    expect(e('MAT', 'M.8.1.1.1.', 'M.8.1.1.1. Üçgende açılar ve kenarlar arasındaki ilişkiyi açıklar.')).toEqual({ outcome_code: null, match: 'none' })
    expect(e('MAT', 'M.8.9.9.')).toEqual({ outcome_code: null, match: 'none' })
  })

  it('konular ders ders ve soru sayısıyla gruplanır', () => {
    const g = konuGruplari(
      [
        { ders: 'MAT', no: 1, konu: 'Üslü İfadeler', kod: null },
        { ders: 'MAT', no: 2, konu: 'Kareköklü İfadeler', kod: null },
        { ders: 'MAT', no: 3, konu: 'Kareköklü İfadeler', kod: null },
        { ders: 'TUR', no: 1, konu: null, kod: 'T.8.3.5' },
      ],
      (k) => (k === 'T.8.3.5' ? 'Sözcükte anlam' : undefined),
    )
    expect(g).toEqual([
      { ders: 'TUR', toplam: 1, konular: [{ konu: 'Sözcükte anlam', sayi: 1 }] },
      {
        ders: 'MAT',
        toplam: 3,
        konular: [
          { konu: 'Kareköklü İfadeler', sayi: 2 },
          { konu: 'Üslü İfadeler', sayi: 1 },
        ],
      },
    ])
  })
})

describe('sonuç yüklemede öneri', () => {
  const list = [
    { id: 'a', name: 'Hız TG 2', exam_date: '2026-11-26', grade: 8, exam_id: null },
    { id: 'b', name: 'Fenomen 3', exam_date: '2026-11-20', grade: 8, exam_id: null },
    { id: 'c', name: 'Hız TG 1', exam_date: '2026-10-20', grade: 8, exam_id: 'x' }, // sonucu yüklenmiş
    { id: 'd', name: 'Hız TG 3', exam_date: '2026-12-20', grade: 8, exam_id: null }, // henüz yapılmadı
    { id: 'e', name: 'Hız 7 TG 2', exam_date: '2026-11-26', grade: 7, exam_id: null }, // LGS akışı yalnız 8. sınıf
  ]
  it('sonucu yüklenmemiş, tarihi gelmiş denemeler; adı benzeyen başta', () => {
    expect(yaklasanOner(list, { ad: 'HIZ TG-2 8. SINIF', bugun: '2026-12-01' }).map((x) => x.id)).toEqual(['a', 'b'])
    expect(yaklasanOner(list, { ad: null, bugun: '2026-12-01', tarih: '2026-11-21' }).map((x) => x.id)).toEqual(['b', 'a'])
    expect(adBenzerligi('Hız TG 2', 'HIZ TG 2')).toBe(1)
  })
})

// ---------- Yayın verisi: liste yalnız kazanımı tamamlar ----------
// PDF'te kazanım okunamayan (UNRESOLVED) A/B kitapçıklı karne. Liste: A1/B2 = M.8.1.1.1, A2/B1 = M.8.1.1.2 (diğer sorular listede yok).
describe('yaklaşan deneme listesiyle yayın', () => {
  const KEY = { A: 'ABCDABCDABCDABCDABCD', B: 'DCBADCBADCBADCBADCBA' } as const
  const rec = (id: string, booklet: 'A' | 'B', answers: string, pdfKod: string | null = null): DkRecord => {
    const questions: DkQuestion[] = [...KEY[booklet]].map((k, i): DkQuestion => {
      const a = answers[i]!
      const kod = i === 0 ? pdfKod : null
      return {
        subject: 'MAT',
        number: i + 1,
        booklet,
        correctAnswer: k,
        studentAnswer: a === '_' ? null : a,
        status: a === '_' ? 'blank' : a === k ? 'correct' : 'wrong',
        sourceOutcomeCode: kod,
        sourceOutcomeText: kod ? 'Metin' : null,
        officialOutcomeCode: kod,
        outcomeMatchMethod: kod ? 'CODE_EXACT' : 'UNVERIFIED',
        questionOutcomeMethod: kod ? 'SOURCE_ROW' : 'UNRESOLVED',
      }
    })
    const d = questions.filter((q) => q.status === 'correct').length
    const y = questions.filter((q) => q.status === 'wrong').length
    return {
      recordId: id,
      source: { filename: 'x.pdf', sha256: 'sha', pages: [1], adapter: 'hiz_cards_v1' },
      student: { name: id, number: id, class: '8/A' },
      exam: { name: 'TG-2', score: 410, totalNet: d - y / 3 },
      subjects: [{ id: 'MAT', questionCount: 20, correct: d, wrong: y, blank: 20 - d - y, net: d - y / 3 }],
      questions,
      validation: { errors: [], warnings: [] },
    }
  }
  const pack = (pdfKod: string | null = null): DkPack => ({
    schemaVersion: '1.0.0',
    records: [
      rec('ADA', 'A', 'BBCDABCDABCDABCDABCD', pdfKod), // A1 yanlış
      rec('CAN', 'B', 'DACADCBADCBADCBADCBA'), // B2 (= A1) yanlış
    ],
  })
  const roster = ['ADA', 'CAN'].map((n) => ({ id: n, full_name: n, class_name: '8/A', school_no: n }))
  const meta = { name: 'TG-2', publisher: null, exam_date: '2026-11-26', notify: false }
  const plan = planOlustur([
    { subject: 'MAT', q_no: 1, q_b: 2, q_c: null, q_d: null, outcome_code: 'M.8.1.1.1', match: 'code_exact' },
    { subject: 'MAT', q_no: 2, q_b: 1, q_c: null, q_d: null, outcome_code: 'M.8.1.1.2', match: 'code_exact' },
    { subject: 'MAT', q_no: 3, q_b: 3, q_c: null, q_d: null, outcome_code: null, match: 'none' }, // güvenilir değil → plana girmez
  ])

  it("PDF'te okunamayan kazanımı öğrencinin kendi kitapçığındaki numarayla tamamlar", () => {
    const p = buildPayload(buildReview(pack(), roster), meta, plan)
    expect(p.questions.filter((q) => q.outcome_code).map((q) => [q.q_no, q.outcome_code, q.match])).toEqual([
      [1, 'M.8.1.1.1', 'code_exact'],
      [2, 'M.8.1.1.2', 'code_exact'],
    ])
    const k = (id: string) => p.results.find((r) => r.student_id === id)!.kazanim
    expect(k('ADA')).toEqual({ subjects: ['MAT'], g: { 'M.8.1.1.1': [1, 0, 1, 0], 'M.8.1.1.2': [1, 1, 0, 0] } })
    // CAN B kitapçığında: B2 = M.8.1.1.1 yanlış, B1 = M.8.1.1.2 doğru
    expect(k('CAN')).toEqual({ subjects: ['MAT'], g: { 'M.8.1.1.1': [1, 0, 1, 0], 'M.8.1.1.2': [1, 1, 0, 0] } })
    expect(p.plan_ozet).toEqual({ doldurulan: 2, ayni: 0, farkli: 0 })
  })

  it('liste D/Y/B, net, puan ve cevapları asla değiştirmez (CLAUDE.md §2)', () => {
    const sabit = (x: ReturnType<typeof buildPayload>) =>
      x.results
        .map((r) => ({ s: r.subjects, a: r.answers, p: r.score, ok: r.outcomes_ok, id: r.student_id }))
        .concat([{ k: x.questions.map((q) => q.correct_answer) } as never])
    expect(sabit(buildPayload(buildReview(pack(), roster), meta, plan))).toEqual(sabit(buildPayload(buildReview(pack(), roster), meta)))
    expect(buildPayload(buildReview(pack(), roster), meta).results.every((r) => r.kazanim === null)).toBe(true)
    expect(buildPayload(buildReview(pack(), roster), meta).plan_ozet).toBeUndefined()
  })

  it("PDF'teki güvenilir kazanım esas alınır; farklıysa özet bildirir", () => {
    const p = buildPayload(buildReview(pack('M.8.1.1.2'), roster), meta, plan)
    expect(p.questions.find((q) => q.q_no === 1)!.outcome_code).toBe('M.8.1.1.2')
    expect(p.plan_ozet).toEqual({ doldurulan: 1, ayni: 0, farkli: 1 })
    expect(buildPayload(buildReview(pack('M.8.1.1.1'), roster), meta, plan).plan_ozet).toEqual({ doldurulan: 1, ayni: 1, farkli: 0 })
  })

  it('listeden gelen kazanım Eşleşmeyen hedeflere düşmez', () => {
    const r = pack('M.8.9.9')
    r.records[0]!.questions[0]!.officialOutcomeCode = null
    r.records[0]!.questions[0]!.outcomeMatchMethod = 'UNVERIFIED'
    expect(buildPayload(buildReview(r, roster), meta).unresolved.map((u) => u.q_no)).toEqual([1])
    expect(buildPayload(buildReview(r, roster), meta, plan).unresolved).toEqual([])
  })
})

describe('tekrar etmesi iyi olacak konular', () => {
  const ds: Dataset = {
    subjects: SUBJECTS,
    exams: [
      { id: 'e1', name: 'TG-1', publisher: null, exam_date: '2026-10-01' },
      { id: 'e2', name: 'TG-2', publisher: null, exam_date: '2026-11-01' },
    ],
    questionsByExam: new Map(),
    outcomes: [
      { code: 'M.8.1.1.1', subject: 'MAT', title: 'Çarpanlar' },
      { code: 'M.8.1.1.2', subject: 'MAT', title: 'EBOB' },
      { code: 'M.8.1.1.3', subject: 'MAT', title: 'Aralarında asal' },
    ],
    results: [
      {
        exam_id: 'e1',
        student_id: 's',
        score: 1,
        subjects: {},
        answers: null,
        outcomes_ok: true,
        kazanim: { subjects: ['MAT'], g: { 'M.8.1.1.1': [2, 0, 2, 0], 'M.8.1.1.2': [1, 1, 0, 0] } },
      },
      {
        exam_id: 'e2',
        student_id: 's',
        score: 1,
        subjects: {},
        answers: null,
        outcomes_ok: true,
        kazanim: { subjects: ['MAT'], g: { 'M.8.1.1.1': [1, 0, 1, 0], 'M.8.1.1.2': [1, 0, 1, 0] } },
      },
    ],
  }
  it('yalnız bu denemede çıkacak ve önceki denemelerde yanlış yapılan kazanımlar, en çok yanlış başta', () => {
    const t = tekrarKonulari(ds, 's', [
      { ders: 'MAT', no: 1, konu: 'Çarpanlar ve Katlar', kod: 'M.8.1.1.1' },
      { ders: 'MAT', no: 2, konu: 'Çarpanlar ve Katlar', kod: 'M.8.1.1.1' },
      { ders: 'MAT', no: 3, konu: 'EBOB', kod: 'M.8.1.1.2' },
      { ders: 'MAT', no: 4, konu: 'Aralarında asal', kod: 'M.8.1.1.3' }, // hiç soru gelmemiş → önerilmez
      { ders: 'MAT', no: 5, konu: 'Bilinmeyen', kod: null }, // kodu güvenilir değil → önerilmez
    ])
    expect(t).toEqual([
      { ders: 'MAT', kod: 'M.8.1.1.1', konu: 'Çarpanlar ve Katlar', soru: 2, girdigi: 2, yanlis: 2 },
      { ders: 'MAT', kod: 'M.8.1.1.2', konu: 'EBOB', soru: 1, girdigi: 2, yanlis: 1 },
    ])
  })
})
