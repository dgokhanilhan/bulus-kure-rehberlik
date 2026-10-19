// "Derslere göre analiz" sonuç belgesi (ör. Mobese karnesi): sentetik sayfa ile biçim ailesi. Gerçek PDF (kişisel veri)
// git'e girmez; maskeli beklenti fixtures/beklenen-genel/7-sinif-mobese-deneme-1.json (regresyon-genel.test.ts).
import { describe, it, expect } from 'vitest'

// @ts-expect-error — motor saf JS
const eng = await import('../public/engine/genel.mjs')

type Line = { x: number; y: number; t: string }
type Ch = { c: string; x0: number; y0: number; x1: number; y1: number }
function sayfa(rows: [number, number, string, number?][]) {
  const lines: Line[] = [],
    cs: Ch[] = []
  for (const [x, y, t, cw = 4.2] of rows) {
    lines.push({ x, y, t: t.replace(/\s+/g, ' ').trim() })
    ;[...t].forEach((c, i) => {
      if (c !== ' ') cs.push({ c, x0: x + i * cw, y0: y + 1, x1: x + i * cw + cw * 0.9, y1: y + 7 })
    })
  }
  return { n: 1, lines, cs, text: lines.map((l) => l.t).join('\n') }
}

const KEY_T = 'BDADBBACABCADCCADCCD'
const ANS_T = 'BDAcBcAbABCADCCA*dda' // 13 doğru, 7 yanlış (17. soru çift işaret: "*")
const KEY_S = 'DBDAACCBDC'
const ANS_S = 'bBDAACaBDC' // 8 doğru, 2 yanlış
const KEY_M = 'BCBCAACADBBADCCDADDC'
const ANS_M = 'abBCAA  cBc  C DAbbd' // 8 doğru, 7 yanlış, 5 boş

const P = sayfa([
  [120, 26, 'SONUÇ BELGESİ'],
  [300, 23, '7. SINIF MOBESE DENEME-1'],
  [26, 59, 'Öğrenci'],
  [211, 59, 'Numara'],
  [266, 59, 'Sınıf'],
  [26, 73, 'ÖĞRENCİ BİR'],
  [224, 73, '0'],
  [268, 73, '7-XX'],
  [37, 105, 'Türü'],
  [26, 121, 'LGS'],
  [78, 120, '354,378'],
  [129, 121, '339,530'],
  [51, 156, 'Ders'],
  [26, 175, 'Türkçe'],
  [103, 175, '20'], [126, 175, '13'], [151, 175, '7'], [169, 175, '10,67'], [202, 175, '53'],
  [26, 189, 'SOSYAL BİLGİLER'],
  [103, 189, '10'], [128, 189, '8'], [151, 189, '2'], [171, 189, '7,33'], [202, 189, '73'],
  [26, 203, 'Matematik'],
  [103, 203, '20'], [128, 203, '8'], [151, 203, '7'], [171, 203, '5,67'], [202, 203, '28'],
  [63, 260, 'Toplam:'],
  [26, 274, 'Soru No'],
  [82, 274, '12345678901234567890'],
  [26, 288, 'TÜRKÇE'],
  [82, 289, ANS_T],
  [26, 299, 'Cevap Anh.'],
  [71, 299, 'B'],
  [82, 300, KEY_T],
  // Ders adı cevap satırına yapışık basılır: son harfi ilk cevabın hemen solunda
  [17.5, 313, 'SOSYAL BİLGİLER'],
  [82, 313, ANS_S],
  [26, 325, 'Cevap Anh.'],
  [71, 325, 'B'],
  [82, 325, KEY_S],
  [26, 390, 'MATEMATİK'],
  [82, 391, ANS_M],
  [26, 401, 'Cevap Anh.'],
  [71, 401, 'B'],
  [82, 402, KEY_M],
  // Sağ panel: kazanım satırları ve S/D/Y sayıları "Soru No" ile aynı hizada olabilir
  [389, 43, 'DERSLERE GÖRE ANALİZ'],
  [309, 64, 'Türkçe'],
  [309, 274, 'Metni okuyup anlayabilme'],
  [542, 274, '2'], [549, 274, '1'], [556, 274, '1'], [564, 274, '50'],
  [309, 300, 'Sözcükte anlam ilişkileri'],
])

describe('Derslere göre analiz sonuç belgesi', () => {
  it('tanınır; öğrenci, sınıf, puan ve ders sonuçları okunur', () => {
    const d = eng.detect([P])
    expect(d.family).toBe('DERS_ANALIZ')
    expect(d.grade.value).toBe(7)
    expect(d.publisher.value).toBe('Mobese')
    const { recs, failed } = eng.FAMILIES.DERS_ANALIZ.parse([P])
    expect(failed).toEqual([])
    const r = recs[0]
    expect(r.student).toEqual({ name: 'ÖĞRENCİ BİR', number: null, class: '7/XX', classGrade: 7 })
    expect(r.score).toBe(354.378)
    expect(r.sections).toEqual([
      { label: 'TÜRKÇE', n: 20, d: 13, y: 7, b: 0, net: 10.67 },
      { label: 'SOSYAL BİLGİLER', n: 10, d: 8, y: 2, b: 0, net: 7.33 },
      { label: 'MATEMATİK', n: 20, d: 8, y: 7, b: 5, net: 5.67 },
    ])
  })

  it('soru düzeyi: anahtar, kitapçık, doğru/yanlış/boş; çift işaret yanlış; sayılar sonuç tablosuyla tutar', () => {
    const r = eng.FAMILIES.DERS_ANALIZ.parse([P]).recs[0]
    const of = (s: string) => r.items.filter((q: { section: string }) => q.section === s)
    expect(of('TÜRKÇE').map((q: { key: string }) => q.key).join('')).toBe(KEY_T)
    expect(new Set(r.items.map((q: { booklet: string }) => q.booklet))).toEqual(new Set(['B']))
    expect(of('TÜRKÇE')[16]).toMatchObject({ q: 17, answer: null, mark: '-' })
    expect(of('SOSYAL BİLGİLER')[0]).toMatchObject({ q: 1, answer: 'B', mark: '-' })
    expect(of('MATEMATİK')[6]).toMatchObject({ q: 7, answer: null, mark: null })
    r.items = eng.bindItems(r.sections, r.items)
    expect(eng.check(r, 3)).toEqual([])
  })

  it('başka biçimin karnesini almaz', () => {
    const hiz = sayfa([
      [100, 20, 'ÖĞRENCİ SINAV'],
      [100, 30, 'SONUÇ BELGESİ'],
    ])
    expect(eng.FAMILIES.DERS_ANALIZ.detect([hiz]).score).toBe(0)
  })
})

describe('kazanım bağlama (kazanimCoz)', () => {
  // 4 soru, 2 kazanım (K0: 2 soru, K1: 2 soru). Öğrencilerin soru sonuçları ve kazanım başına D/Y'si
  const K = [{ s: 2 }, { s: 2 }]
  it('bütün öğrencilerle tek tutarlı atama varsa her soru bağlanır', () => {
    const M = [
      ['+', '-', '+', '+'],
      ['+', '+', '-', '-'],
      ['-', '+', '+', '-'],
    ]
    // Doğru atama: K0 = {1, 3}, K1 = {2, 4}
    const T = [
      [{ d: 2, y: 0 }, { d: 1, y: 1 }],
      [{ d: 1, y: 1 }, { d: 1, y: 1 }],
      [{ d: 1, y: 1 }, { d: 1, y: 1 }],
    ]
    expect(eng.kazanimCoz(K, M, T)).toEqual([0, 1, 0, 1])
  })
  it('birden çok atama tutarlıysa yalnız her çözümde aynı kalan soru bağlanır; tutarsız veri hiç bağlanmaz', () => {
    const M = [['+', '+', '+', '-']]
    const T = [[{ d: 2, y: 0 }, { d: 1, y: 1 }]]
    // 1, 2, 3'ün hangi ikisi K0'da belirsiz; 4 (tek yanlış) kesin K1
    expect(eng.kazanimCoz(K, M, T)).toEqual([null, null, null, 1])
    expect(eng.kazanimCoz(K, M, [[{ d: 2, y: 1 }, { d: 0, y: 0 }]])).toBeNull()
  })
})
