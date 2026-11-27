import { describe, expect, it } from 'vitest'
import { davetAdresi, ilkAd, kodBicim, kodTemizle, whatsappBaglanti, whatsappMetni } from './veliDavetMetin'

describe('veli davet yardımcıları', () => {
  it('kod biçimi ve temizleme', () => {
    expect(kodBicim('R7TK2QXA9M')).toBe('R7TK2-QXA9M')
    expect(kodTemizle(' r7tk2-qxa9m ')).toBe('R7TK2QXA9M')
    expect(kodTemizle('R7TK2QXA9MZZZ')).toBe('R7TK2QXA9M')
  })
  it('bağlantı', () => {
    expect(davetAdresi('https://buluskurementor.com/', 'R7TK2QXA9M')).toBe('https://buluskurementor.com/v/R7TK2-QXA9M')
  })
  it('WhatsApp mesajında yalnız ilk ad var, soyad yok', () => {
    const m = whatsappMetni({ okul: 'Buluş Küre Koleji', cocuk: 'Elif Nur Yıldız', adres: 'https://x/v/AAAAA-BBBBB', son: '2026-12-11T09:00:00Z' })
    expect(ilkAd('Elif Nur Yıldız')).toBe('Elif')
    expect(m).toContain('Elif adına veli hesabınızı')
    expect(m).not.toContain('Yıldız')
    expect(m).toContain('https://x/v/AAAAA-BBBBB')
    expect(m).toContain('11 Aralık 2026')
    expect(whatsappBaglanti('a b\nc')).toBe('https://wa.me/?text=a%20b%0Ac')
  })
})
