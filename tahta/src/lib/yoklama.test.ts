import { describe, it, expect } from 'vitest'
import {
  bekleyenAyikla,
  bekleyenEkle,
  bildirimCumlesi,
  dokunus,
  istanbul,
  kayitHazirla,
  karisikTuslar,
  kodBicimle,
  kodTamam,
  otomatikPencerede,
  sayac,
  type Bekleyen,
  type Ogrenci,
} from './yoklama'

describe('Tahta yoklaması yardımcıları', () => {
  it('Türkiye saati: UTC+3, gün sınırı doğru', () => {
    expect(istanbul(new Date('2026-11-18T06:10:00Z'))).toEqual({ gun: '2026-11-18', dakika: 9 * 60 + 10 })
    expect(istanbul(new Date('2026-11-18T21:30:00Z'))).toEqual({ gun: '2026-11-19', dakika: 30 })
  })

  it('kendiliğinden açılma yalnız 08:30–09:40', () => {
    expect(otomatikPencerede(8 * 60 + 29)).toBe(false)
    expect(otomatikPencerede(8 * 60 + 30)).toBe(true)
    expect(otomatikPencerede(9 * 60 + 40)).toBe(true)
    expect(otomatikPencerede(9 * 60 + 41)).toBe(false)
  })

  it('tuş takımı her rakamı bir kez içerir ve karışır', () => {
    let s = 7
    const r = () => ((s = (s * 9301 + 49297) % 233280) / 233280)
    const a = karisikTuslar(r)
    expect([...a].sort()).toEqual(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'])
    expect(a.join('')).not.toBe('0123456789')
    expect(karisikTuslar()).toHaveLength(10)
  })

  it('eşleştirme kodu biçimlenir', () => {
    expect(kodBicimle('kre7 q4mx')).toBe('KRE7-Q4MX')
    expect(kodBicimle('KRE-7Q4MX')).toBe('KRE7-Q4MX')
    expect(kodBicimle('ab')).toBe('AB')
    expect(kodBicimle('abcd efgh ijk')).toBe('ABCD-EFGH')
    expect(kodTamam('KRE7-Q4MX')).toBe(true)
    expect(kodTamam('KRE7-Q4M')).toBe(false)
  })

  it('kilitli öğrenci gönderilmez; sayaç ve dokunuş', () => {
    const l: Ogrenci[] = [
      { id: 'a', ad: 'A', no: '1', durum: 'geldi', kilitli: false },
      { id: 'b', ad: 'B', no: '2', durum: 'devamsiz', kilitli: false },
      { id: 'c', ad: 'C', no: '3', durum: 'raporlu', kilitli: true },
    ]
    expect(kayitHazirla(l)).toEqual({ a: 'geldi', b: 'devamsiz' })
    expect(sayac(l)).toEqual({ geldi: 1, devamsiz: 1, gec: 0, izinli: 0, raporlu: 1 })
    expect(dokunus('geldi')).toBe('devamsiz')
    expect(dokunus('devamsiz')).toBe('geldi')
    expect(dokunus('gec')).toBe('geldi')
  })

  it('bekleyen yoklama: aynı sınıfınki yerini alır, eski gün ayrılır', () => {
    const b = (id: string, gun: string, sinifId: string): Bekleyen => ({ id, gun, sinifId, sinifAd: sinifId, dakika: 550, kayit: {} })
    let l = bekleyenEkle([], b('1', '2026-11-18', 'A'))
    l = bekleyenEkle(l, b('2', '2026-11-18', 'A'))
    l = bekleyenEkle(l, b('3', '2026-11-18', 'B'))
    expect(l.map((x) => x.id)).toEqual(['2', '3'])
    const { gecerli, eskimis } = bekleyenAyikla([...l, b('4', '2026-11-17', 'A')], '2026-11-18')
    expect(gecerli.map((x) => x.id)).toEqual(['2', '3'])
    expect(eskimis.map((x) => x.id)).toEqual(['4'])
  })

  it('bildirim cümlesi', () => {
    expect(bildirimCumlesi('10:00', true, 2)).toContain("10:00'da gidecek (2 öğrenci)")
    expect(bildirimCumlesi('10:00', false, 1)).toContain('gönderildi')
    expect(bildirimCumlesi('10:00', true, 0)).toBe('Bugün velilere yoklama bildirimi gitmeyecek.')
  })
})
