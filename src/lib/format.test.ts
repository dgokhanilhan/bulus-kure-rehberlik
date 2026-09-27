import { describe, it, expect } from 'vitest'
import { fold, initials, ago } from './format'

describe('format', () => {
  it('Türkçe karakterleri katlar', () => {
    expect(fold('  Zeynep  KAYA ')).toBe('zeynep kaya')
    expect(fold('İrem Çınar Öztürk Şahin Güneş Işık')).toBe(fold('irem cinar ozturk sahin gunes isik'))
  })
  it('baş harfleri Türkçe büyük harfle üretir', () => {
    expect(initials('irem tekin')).toBe('İT')
    expect(initials('Okul Yöneticisi')).toBe('OY')
  })
  it('geçen süreyi Türkçe yazar', () => {
    const now = Date.parse('2026-09-27T12:00:00Z')
    expect(ago('2026-09-27T11:59:30Z', now)).toBe('şimdi')
    expect(ago('2026-09-27T07:00:00Z', now)).toBe('5 sa önce')
    expect(ago('2026-09-25T12:00:00Z', now)).toBe('2 gün önce')
  })
})

import { addDays, gen, nextDow, trD, trDW, localHM, localDate, toTs } from './format'
describe('tarih ve dil', () => {
  it('iyelik eki', () => {
    expect(gen('Elif')).toBe("Elif'in")
    expect(gen('Ayşe')).toBe("Ayşe'nin")
    expect(gen('Mert')).toBe("Mert'in")
    expect(gen('Burak')).toBe("Burak'ın")
    expect(gen('Kaan')).toBe("Kaan'ın")
    expect(gen('Ömer')).toBe("Ömer'in")
    expect(gen('Umut')).toBe("Umut'un")
  })
  it('gün hesabı ve Türkçe tarih', () => {
    expect(addDays('2026-09-27', 7)).toBe('2026-10-04')
    expect(nextDow(5, '2026-09-27')).toBe('2026-10-02') // Pazar → Cuma
    expect(nextDow(7, '2026-09-27')).toBe('2026-10-04') // bugünden sonra
    expect(trD('2026-10-02')).toBe('2 Ekim')
    expect(trDW('2026-10-02')).toBe('2 Ekim Cuma')
  })
  it('Türkiye saati', () => {
    const ts = toTs('2026-10-02', '14:10')
    expect(localHM(ts)).toBe('14:10')
    expect(localDate('2026-10-01T22:30:00Z')).toBe('2026-10-02')
  })
})
