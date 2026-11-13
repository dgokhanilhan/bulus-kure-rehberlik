import { describe, expect, it } from 'vitest'
import {
  hafizaDeste, harfDurumlari, islemUret, kelimeTemizle, mayinAc, mayinBitti, mayinKur, mayinSay, ROZETLER, seri, skorYaz,
  sudokuCakisma, sudokuDolu, yilanAdim, yilanBasla, YILAN_N, type Istatistik,
} from './oyunlar'

// Tekrarlanabilir rastgele (mulberry32)
const rnd = (t = 1) => () => {
  t |= 0
  t = (t + 0x6d2b79f5) | 0
  let r = Math.imul(t ^ (t >>> 15), 1 | t)
  r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r
  return ((r ^ (r >>> 14)) >>> 0) / 4294967296
}

describe('oyunlar', () => {
  it('sudoku: çakışmalar ve doluluk', () => {
    const a = Array<number>(81).fill(0)
    a[0] = 5
    a[8] = 5 // aynı satır
    a[40] = 5 // çakışmaz
    expect([...sudokuCakisma(a)].sort((x, y) => x - y)).toEqual([0, 8])
    const tam = Array.from({ length: 81 }, (_, i) => ((Math.floor(i / 9) * 3 + Math.floor(i / 27) + (i % 9)) % 9) + 1)
    expect(sudokuCakisma(tam).size).toBe(0)
    expect(sudokuDolu(tam)).toBe(true)
    expect(sudokuDolu(a)).toBe(false)
  })
  it('kelime: Türkçe küçük harf ve klavye renkleri', () => {
    expect(kelimeTemizle('IŞIK!')).toBe('ışık')
    expect(kelimeTemizle('İnsan12')).toBe('insan')
    expect(kelimeTemizle('kalemler')).toBe('kalem')
    const m = harfDurumlari([{ t: 'kalem', r: [0, 1, 0, 0, 0] }, { t: 'ateşe', r: [2, 0, 0, 0, 0] }])
    expect(m.get('a')).toBe(2)
    expect(m.get('k')).toBe(0)
  })
  it('mayın: ilk tıklama güvenli, taşma ve bitiş', () => {
    for (let s = 1; s < 30; s++) {
      const m = mayinKur(40, rnd(s))
      expect(m.filter(Boolean)).toHaveLength(10)
      expect(m[40]).toBe(false)
      expect(mayinSay(m, 40)).toBe(0)
      const acik = mayinAc(m, new Set(), 40)
      expect(acik.size).toBeGreaterThan(1)
      expect([...acik].some((i) => m[i])).toBe(false)
    }
    const m = Array<boolean>(81).fill(false)
    m[0] = true
    expect(mayinBitti(m, mayinAc(m, new Set(), 80))).toBe(true)
  })
  it('hafıza destesi 8 çift', () => {
    const d = hafizaDeste(rnd(3))
    expect(d).toHaveLength(16)
    expect(new Set(d).size).toBe(8)
  })
  it('hesap sprinti: cevaplar doğru, eksi ve kesir yok', () => {
    const r = rnd(7)
    for (let i = 0; i < 400; i++) {
      const q = islemUret(i % 10, r)
      const [a, op, b] = q.metin.split(' ')
      const x = Number(a)
      const y = Number(b)
      const beklenen = op === '+' ? x + y : op === '−' ? x - y : op === '×' ? x * y : x / y
      expect(q.cevap).toBe(beklenen)
      expect(Number.isInteger(q.cevap) && q.cevap >= 0).toBe(true)
    }
  })
  it('yılan: yer, büyür, duvara ve kendine çarpar, ters dönemez', () => {
    let d = yilanBasla(rnd(1))
    d = { ...d, yem: d.govde[0]! + 1 }
    d = yilanAdim(d, null, rnd(2))
    expect(d.puan).toBe(1)
    expect(d.govde).toHaveLength(4)
    const geri = yilanAdim(d, 'l')
    expect(geri.yon).toBe('r')
    expect(geri.bitti).toBe(false)
    let e = { ...yilanBasla(rnd(1)), yem: 0 }
    for (let i = 0; i < YILAN_N; i++) e = yilanAdim(e, 'r')
    expect(e.bitti).toBe(true)
    // kendine çarpma: uzun gövdeyle U dönüşü
    const n = YILAN_N
    let k = { govde: [5 * n + 5, 5 * n + 4, 5 * n + 3, 5 * n + 2, 5 * n + 1], yon: 'r' as const, yem: 0, puan: 0, bitti: false }
    k = yilanAdim(yilanAdim(yilanAdim(k, 'd'), 'l'), 'u') as typeof k
    expect(k.bitti).toBe(true)
  })
  it('seri ve rozetler', () => {
    expect(seri(['2026-11-13', '2026-11-12', '2026-11-11', '2026-11-09'], '2026-11-13')).toBe(3)
    expect(seri(['2026-11-12', '2026-11-11'], '2026-11-13')).toBe(2)
    expect(seri(['2026-11-10'], '2026-11-13')).toBe(0)
    const i: Istatistik = { toplam: 3, sudoku: 1, sudoku_en_iyi: 250, kelime_bulunan: 0, kelime_ikide: 0, yilan_en_iyi: 5, sprint_en_iyi: null, oyun_turu: 2, gunler: [] }
    expect(ROZETLER.filter((r) => r.kosul(i, 3)).map((r) => r.id)).toEqual(['ilk', 'seri3', 'sudoku5'])
    expect(skorYaz('sudoku', 125)).toBe('2:05')
    expect(skorYaz('kelime', 7)).toBe('Bulamadı')
    expect(skorYaz('yilan', 12)).toBe('12 puan')
  })
})
