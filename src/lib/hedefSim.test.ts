import { describe, expect, it } from 'vitest'
import { dersNetleri, NET_PUAN, sonLgsNetleri, oneriDagilim, pay, tahminiArtis, varsayilanHedef } from './hedefSim'

const N = { TUR: 15.33, MAT: 11.67, FEN: 14, INK: 8, DIN: 9.33, ING: 6 }

describe('hedef simülatörü', () => {
  it('ders netlerini okur; LGS dışı ve sayı olmayanı atlar, sınırlar', () => {
    expect(dersNetleri({ MAT: { net: 11.33 }, SOS: { net: 5 }, FEN: { net: null }, TUR: { net: 25 } })).toEqual({ MAT: 11.33, TUR: 20 })
    expect(dersNetleri(null)).toEqual({})
  })
  it('katsayılı puan artışı: ana derste bir net ≈ 4,52, diğerlerinde ≈ 1,13', () => {
    expect(tahminiArtis({ MAT: 1 })).toBeCloseTo(4 * NET_PUAN, 5)
    expect(tahminiArtis({ ING: 1 })).toBeCloseTo(NET_PUAN, 5)
    expect(tahminiArtis({ MAT: 4, FEN: 2, TUR: 1, ING: 2 })).toBeCloseTo(30 * NET_PUAN, 5)
  })
  it('kalan soru tam sayıya yuvarlanır', () => {
    expect(pay(N, 'MAT')).toBe(8)
    expect(pay(N, 'ING')).toBe(4)
    expect(pay({}, 'TUR')).toBe(20)
  })
  it('öneri en çok puan kaybedilen dersten başlar ve gereken puanı karşılar', () => {
    const { ek, yeter } = oneriDagilim(N, 33.5)
    expect(yeter).toBe(true)
    expect(tahminiArtis(ek)).toBeGreaterThanOrEqual(33.5)
    expect(tahminiArtis(ek) - 4 * NET_PUAN).toBeLessThan(33.5) // gereğinden fazla ana ders neti eklemez
    expect(ek.MAT).toBeGreaterThanOrEqual(ek.TUR ?? 0)
    expect(Object.keys(ek).every((k) => ['TUR', 'MAT', 'FEN', 'INK', 'DIN', 'ING'].includes(k))).toBe(true)
  })
  it('yalnız netleri bilinen dersleri kullanır; yetmezse söyler', () => {
    const r = oneriDagilim({ MAT: 18 }, 100)
    expect(r).toEqual({ ek: { MAT: 2 }, yeter: false })
    expect(oneriDagilim(N, 0)).toEqual({ ek: {}, yeter: true })
  })
  it('varsayılan hedef: puanın üstündeki en düşük taban, yoksa en yüksek', () => {
    const h = [{ taban: 480 }, { taban: 440 }, { taban: 400 }]
    expect(varsayilanHedef(h, 410)?.taban).toBe(440)
    expect(varsayilanHedef(h, 490)?.taban).toBe(480)
    expect(varsayilanHedef([], 400)).toBeUndefined()
  })
  it('ders netleri son 3 LGS denemesinin ortalamasıdır; netsiz ve LGS dışı denemeler atlanır', () => {
    const r = (exam_type: string | null, subjects: unknown) => ({ exam_type: null, subjects, exams: { exam_type } })
    const rs = [
      r('LGS', { MAT: { net: 2 } }),
      r('LGS', { MAT: { net: 10 }, TUR: { net: 12 } }),
      r('TYT', { MAT: { net: 40 } }),
      r(null, { MAT: { net: 14 }, TUR: { net: 15 } }),
      r('LGS', {}),
      r('LGS', { MAT: { net: 12 } }),
    ]
    expect(sonLgsNetleri(rs)).toEqual({ MAT: 12, TUR: 13.5 })
    expect(sonLgsNetleri([])).toEqual({})
  })
})
