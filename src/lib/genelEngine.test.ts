import { describe, it, expect } from 'vitest'
import { nonLgsGrade } from './genelEngine'

describe('LGS akışı sınıf koruması', () => {
  it('8. sınıf karnesi geçer; 5–7 karnesi durdurulur; sınıf bilgisi yoksa karar verilmez', () => {
    expect(nonLgsGrade(['8/A', '8/B', '8-C', '8 D'])).toBeNull()
    expect(nonLgsGrade(['6/A', '6/A', '6/B'])).toBe(6)
    expect(nonLgsGrade(['7-A', '7-B', '8/A'])).toBe(7)
    expect(nonLgsGrade([null, null, '6/A'])).toBeNull() // çoğunluk okunamadı: mevcut davranış
    expect(nonLgsGrade(['6/A', '8/A'])).toBeNull() // belirgin çoğunluk yok
  })
})

describe('yönlendirme', () => {
  const pack = (family: string, grade: number | null, examType: string | null = null) => ({ detection: { family, grade: grade === null ? undefined : { value: grade }, examType: { value: examType } } }) as never
  it('Hız 8 ve tanınmayan biçim LGS motoruna; Akbim 8 (TÖDER, Sinan Kuzucu) genel akışa LGS türünde; 5–7 genel', async () => {
    const { goesToLegacy } = await import('./genelEngine')
    expect(goesToLegacy(pack('HIZ_ORTAOKUL', 8))).toBe(true)
    expect(goesToLegacy(pack('UNKNOWN', null))).toBe(true)
    expect(goesToLegacy(pack('AKBIM', 8, 'LGS'))).toBe(false)
    expect(goesToLegacy(pack('HIZ_ORTAOKUL', 6))).toBe(false)
    expect(goesToLegacy(pack('AKBIM', 6))).toBe(false)
  })
})
