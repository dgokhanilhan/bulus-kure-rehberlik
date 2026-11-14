import { describe, expect, it } from 'vitest'
import { anilanlar, anmaAramasi, anmaParcala, cizgiNoktalari, dikkatNedenleri, kanalAdi, kanalSirala, odaAdi, odevOzeti, secimOku, suzgecUyar } from './oda'

describe('Öğretmenler Odası', () => {
  it('ad kademeye göre', () => {
    expect(odaAdi(['genel', 'ortaokul', 'zumre:Matematik'])).toBe('Ortaokul Öğretmenler Odası')
    expect(odaAdi(['genel', 'lise'])).toBe('Lise Öğretmenler Odası')
    expect(odaAdi(['lise', 'genel', 'ortaokul'])).toBe('Ortaokul/Lise Öğretmenler Odası')
    expect(odaAdi(['genel'])).toBe('Öğretmenler Odası')
  })
  it('kanal adları ve sırası', () => {
    expect(kanalAdi('genel')).toBe('Genel')
    expect(kanalAdi('zumre:Fen Bilimleri')).toBe('Fen Bilimleri zümresi')
    expect(kanalAdi('lise')).toBe('Lise')
    expect(kanalSirala(['zumre:Türkçe', 'lise', 'genel', 'zumre:Matematik', 'ortaokul'])).toEqual(['genel', 'ortaokul', 'lise', 'zumre:Matematik', 'zumre:Türkçe'])
  })
  it('anma: yalnız metinde kalanlar; öneri araması', () => {
    const k = [{ id: 'a', ad: 'Murat Kaya' }, { id: 'b', ad: 'Zehra Yılmaz' }]
    expect(anilanlar('Merhaba @Murat Kaya nasılsın', k)).toEqual(['a'])
    expect(anilanlar('Merhaba', k)).toEqual([])
    expect(anmaAramasi('selam @Mur', 10)).toEqual({ bas: 6, q: 'Mur' })
    expect(anmaAramasi('mail@okul', 9)).toBeNull()
    expect(anmaAramasi('@', 1)).toEqual({ bas: 0, q: '' })
    expect(anmaParcala('selam @Murat Kaya!', ['Murat Kaya'])).toEqual([
      { t: 'selam ', anma: false },
      { t: '@Murat Kaya', anma: true },
      { t: '!', anma: false },
    ])
  })
  it('ödev özeti: bekleyen, izinli, gelmedi sayılmaz', () => {
    expect(odevOzeti(['yapti', 'yapti', 'yapmadi', 'bekliyor', 'izinli', 'gelmedi', 'eksik'])).toEqual({ yapti: 2, toplam: 4, oran: 0.5 })
    expect(odevOzeti(['bekliyor']).oran).toBeNull()
  })
  it('dikkat nedenleri ve süzgeç', () => {
    const r = { d: -2, odevOran: 0.5, devSeviye: 'turuncu' as const, gkAy: 3 }
    expect(dikkatNedenleri(r)).toEqual(['Düşüşte', 'Ödevi eksik', 'Devamsızlık', 'Günlük kontrol'])
    const iyi = { d: 1, odevOran: 0.9, devSeviye: 'sari' as const, gkAy: 1 }
    expect(dikkatNedenleri(iyi)).toEqual([])
    expect(suzgecUyar(iyi, 'dikkat')).toBe(false)
    expect(suzgecUyar(r, 'devamsizlik')).toBe(true)
    expect(suzgecUyar({ ...iyi, d: null }, 'dusus')).toBe(false)
  })
  it('gidişat çizgisi ve seçim', () => {
    expect(cizgiNoktalari([5])).toBeNull()
    expect(cizgiNoktalari([1, 2], 84, 22, 2)).toBe('2,20 82,2')
    expect(secimOku('["8/A","9/Z"]', ['8/A', '8/B'])).toEqual(['8/A'])
    expect(secimOku('bozuk', ['8/A'])).toEqual([])
  })
})

describe('sınıf seçici grupları', () => {
  it('okulun kademe sırasıyla gruplar; boş grup yok; kademesi bilinmeyen Diğer', async () => {
    const { sinifGruplari } = await import('./oda')
    const k: Record<string, string> = { '1/A': 'ilkokul', '8/A': 'ortaokul', '8/B': 'ortaokul', '11/A · SAY': 'lise' }
    expect(sinifGruplari(['8/A', '1/A', 'Kurs', '8/B', '11/A · SAY'], (a) => k[a])).toEqual([
      { id: 'ilkokul', ad: 'İlkokul', siniflar: ['1/A'] },
      { id: 'ortaokul', ad: 'Ortaokul', siniflar: ['8/A', '8/B'] },
      { id: 'lise', ad: 'Lise', siniflar: ['11/A · SAY'] },
      { id: 'diger', ad: 'Diğer', siniflar: ['Kurs'] },
    ])
    expect(sinifGruplari(['8/A'], () => 'ortaokul')).toHaveLength(1)
    expect(sinifGruplari([], () => null)).toEqual([])
  })
})
