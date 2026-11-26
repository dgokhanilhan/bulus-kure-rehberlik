import { describe, expect, it } from 'vitest'
import { beklenen, etkiKisa, formGorevleri, gg, kontrolFarki, oneriTarihleri, takipDurumu, verilisGunu, type TakipGorev } from './gorevTakip'

// 20 soru, 21 Kasım'da verildi (Türkiye saati), son gün 30 Kasım: 10 gün
const g = (o: Partial<TakipGorev> = {}): TakipGorev => ({
  id: 'g1',
  subject: 'MAT',
  topic: 'Üslü ifadeler',
  question_count: 20,
  solved: 0,
  due_date: '2026-11-30',
  created_at: '2026-11-20T22:30:00Z',
  completed_at: null,
  ...o,
})

describe('görev takip formu', () => {
  it('veriliş günü Türkiye saatine göre', () => {
    expect(verilisGunu('2026-11-20T22:30:00Z')).toBe('2026-11-21')
  })
  it('önerilen kontrol günleri süreyi üçe böler, sonuncusu son gün', () => {
    expect(oneriTarihleri(g())).toEqual(['2026-11-24', '2026-11-27', '2026-11-30'])
    expect(oneriTarihleri(g({ due_date: '2026-11-21' }))).toEqual(['2026-11-21', '2026-11-21', '2026-11-21'])
  })
  it('beklenen ilerleme günlere eşit dağılır, sınırlarda kalır', () => {
    expect(beklenen(g(), '2026-11-21')).toBe(2)
    expect(beklenen(g(), '2026-11-25')).toBe(10)
    expect(beklenen(g(), '2026-11-30')).toBe(20)
    expect(beklenen(g(), '2026-12-05')).toBe(20)
    expect(beklenen(g(), '2026-11-10')).toBe(0)
  })
  it('kontrol farkı: geride kalan soru, öndeyse 0', () => {
    expect(kontrolFarki(g(), { tarih: '2026-11-25', cozulen: 8 })).toEqual({ beklenen: 10, geride: 2 })
    expect(kontrolFarki(g(), { tarih: '2026-11-25', cozulen: 12 })).toEqual({ beklenen: 10, geride: 0 })
  })
  it('durum çözülen sayıdan türetilir', () => {
    expect(takipDurumu(g())).toBe('baslamadi')
    expect(takipDurumu(g({ solved: 5 }))).toBe('devam')
    expect(takipDurumu(g({ solved: 20 }))).toBe('bitti')
  })
  it('konu etkisi kısa metin; konuya bağlı değilse tire', () => {
    expect(etkiKisa(null)).toBe('—')
    expect(etkiKisa({ once: 1, sonra: [], durum: 'bekliyor', dogruSeri: 0 })).toBe('Henüz sorulmadı')
    expect(etkiKisa({ once: 1, sonra: ['d'], durum: 'duzeldi', dogruSeri: 1 })).toBe('Düzeldi')
    expect(etkiKisa({ once: 1, sonra: ['y'], durum: 'suruyor', dogruSeri: 0 })).toBe('Yine yanlış')
  })
  it('forma açık görevler son güne göre, ardından son 14 günde bitenler', () => {
    const l = [
      g({ id: 'a', due_date: '2026-12-03' }),
      g({ id: 'b', due_date: '2026-11-28' }),
      g({ id: 'c', completed_at: '2026-11-20T10:00:00Z' }),
      g({ id: 'd', completed_at: '2026-10-01T10:00:00Z' }),
    ]
    expect(formGorevleri(l, '2026-11-26').map((x) => x.id)).toEqual(['b', 'a', 'c'])
  })
  it('kısa tarih', () => {
    expect(gg('2026-11-05')).toBe('05.11')
  })
})
