import { describe, expect, it } from 'vitest'
import { katalogBaslik, tekTamamlama, yarimBasliklar } from './baslik'

describe('yarım kazanım başlıkları', () => {
  it('eski katalogda kesik kısa ad tam metinle değişir, sağlam ad kalır', () => {
    expect(katalogBaslik('Hz', 'Hz. Musa’nın (a.s.) hayatını ana hatlarıyla tanır.')).toBe('Hz. Musa’nın (a.s.) hayatını ana hatlarıyla tanır')
    expect(katalogBaslik('Verilen pozitif tam sayıların…', 'Verilen pozitif tam sayıların çarpanlarını bulur.')).toBe('Verilen pozitif tam sayıların çarpanlarını bulur')
    expect(katalogBaslik('Üslü ifadeler', 'Üslü ifadelerle ilgili temel kuralları anlar.')).toBe('Üslü ifadeler')
    expect(katalogBaslik('Hz', null)).toBe('Hz')
  })
  it('yayınevi PDF’inde sütun genişliğinde kesilen başlıklar bulunur', () => {
    const ing = ['Accepting and refusin', 'Making simple inquiri', 'Describing simple pro', 'Expressing likes and', 'Stating personal opin'].map((title) => ({ subject: 'ING', title }))
    const y = yarimBasliklar([...ing, { subject: 'FEN', title: 'Basit makinelerin günlük yaşamdaki kullanım alanlarını açıklar' }])
    expect([...y].sort()).toEqual(ing.map((x) => x.title).sort())
  })
  it('tek bir resmî başlık eşleşirse tamamlanır, belirsizse tamamlanmaz', () => {
    expect(tekTamamlama('Metnin ana fikr', ['Metnin ana fikrini belirler.', 'Metnin konusunu belirler.'])).toBe('Metnin ana fikrini belirler')
    expect(tekTamamlama('Metnin', ['Metnin ana fikrini belirler.', 'Metnin konusunu belirler.'])).toBeNull()
    expect(tekTamamlama('Hz', ['Hz. Musa’nın hayatını tanır.'])).toBeNull()
  })
})
