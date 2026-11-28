import { describe, expect, it } from 'vitest'
import { lc } from './rapor'
import { trDY } from './format'

describe('rapor metni: konu adı cümle içinde', () => {
  it('ilk harfleri küçültür, kısaltmaları korur', () => {
    expect(lc('Üslü İfadeler')).toBe('üslü ifadeler')
    expect(lc('DNA ve Genetik Kod')).toBe('DNA ve genetik kod')
  })
  it('özel adları küçültmez', () => {
    expect(lc('Gençlik döneminde Mustafa Kemal’in fikir hayatını etkileyen önemli kişiler')).toBe(
      'gençlik döneminde Mustafa Kemal’in fikir hayatını etkileyen önemli kişiler',
    )
    expect(lc('Hz. Muhammed’in örnek şahsiyeti')).toBe('Hz. Muhammed’in örnek şahsiyeti')
    expect(lc("Kur'an-ı Kerim ve Türkiye")).toBe("Kur'an-ı Kerim ve Türkiye")
  })
})

describe('rapor tarihi', () => {
  it('yıl her zaman yazılır', () => {
    expect(trDY('2026-09-19')).toBe('19 Eylül 2026')
  })
})
