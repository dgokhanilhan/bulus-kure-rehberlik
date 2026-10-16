import { describe, expect, it } from 'vitest'
import { kitapcikAyir } from './kitapcik'

const A = 'ABCDABCDABCDABCDABCD'
const B = 'DCBADCBADCBADCBADCBA'

describe('kitapçık ayırma', () => {
  it('kitapçığı yazmayan karneleri anahtarına göre ayırır (en sık anahtar A)', () => {
    expect(kitapcikAyir([A, B, A, A, B].map((key) => ({ known: null, key })))).toEqual(['A', 'B', 'A', 'A', 'B'])
  })
  it('kitapçığı bilinen karnelerin anahtarıyla eşleştirir', () => {
    expect(kitapcikAyir([{ known: 'B', key: A }, { known: 'A', key: B }, { known: null, key: A }, { known: null, key: B }])).toEqual(['B', 'A', 'B', 'A'])
  })
  it('birkaç okuma hatası kitapçığı değiştirmez; okunamayan sorular yok sayılır', () => {
    const misread = 'ABCDABCDABCDABCDABCA' // 1 harf farklı
    const holes = 'AB?DABCD??CDABCDABCD'
    expect(kitapcikAyir([A, misread, holes].map((key) => ({ known: null, key })))).toEqual(['A', 'A', 'A'])
  })
  it('çok az soru okunmuşsa ya da üçüncü bir anahtar varsa karar vermez', () => {
    const few = 'AB??????????????????'
    const third = 'BBBBBBBBBBBBBBBBBBBB'
    expect(kitapcikAyir([A, B, few, third].map((key) => ({ known: null, key })))).toEqual(['A', 'B', null, null])
  })
  it('hepsi biliniyorsa dokunmaz', () => {
    expect(kitapcikAyir([{ known: 'A', key: B }])).toEqual(['A'])
  })
})
