import { describe, expect, it } from 'vitest'
import { defterKur, TEKRAR_GUN } from './destek'

const r = (code: string, title: string, count: number, lastWrong = true) => ({ outcome: { code, title, subject: 'MAT' as const }, count, lastWrong })

describe('yanlış defteri', () => {
  const simdi = Date.parse('2026-11-15T12:00:00Z')
  const gunOnce = (n: number) => new Date(simdi - n * 86400_000).toISOString()
  it('çalışılmamışlar önce (çok tekrarlanan başta), sonra yeniden bakılacaklar, sonra yeni çalışılanlar', () => {
    const l = defterKur(
      [r('A', 'Üslü ifadeler', 2), r('B', 'Kareköklü ifadeler', 4), r('C', 'Olasılık', 3), r('D', 'Cebir', 2)],
      new Map([
        ['C', gunOnce(1)],
        ['D', gunOnce(TEKRAR_GUN + 1)],
      ]),
      () => 'Matematik',
      simdi,
    )
    expect(l.map((x) => [x.konu, x.durum])).toEqual([
      ['B', 'calis'],
      ['A', 'calis'],
      ['D', 'tekrar'],
      ['C', 'tamam'],
    ])
    expect(l[0]).toMatchObject({ baslik: 'Kareköklü ifadeler', ders: 'Matematik', sayi: 4, calistiAt: null })
  })
  it('tam TEKRAR_GUN gün dolunca yeniden bakma zamanı; tekrar eden hata yoksa defter boş', () => {
    expect(defterKur([r('A', 'x', 2)], new Map([['A', gunOnce(TEKRAR_GUN)]]), () => 'M', simdi)[0]!.durum).toBe('tekrar')
    expect(defterKur([r('A', 'x', 2)], new Map([['A', gunOnce(TEKRAR_GUN - 0.5)]]), () => 'M', simdi)[0]!.durum).toBe('tamam')
    expect(defterKur([], new Map([['A', gunOnce(1)]]), () => 'M', simdi)).toEqual([])
  })
})
