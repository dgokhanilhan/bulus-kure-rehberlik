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
