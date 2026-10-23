import { describe, expect, it } from 'vitest'
import { bransUyar, grupKonu, grupOgrencileri, kademeOfGrade, type KonuKaynak } from './etutGrup'

// 3 deneme (eskiden yeniye); a: tam sayılar, b: kesirler
const K: KonuKaynak[] = [
  { code: 'a', title: 'Tam sayılarla işlemler', wrongByExam: [['s1', 's2'], ['s2'], ['s2', 's3']] },
  { code: 'b', title: 'Kesirler', wrongByExam: [['s4'], [], ['s3', 's5']] },
]
const ad = (s: string) => ({ s1: 'Ada', s2: 'Bora', s3: 'Cem', s4: 'Defne', s5: 'Ege' })[s] ?? s

describe('gruba etüt: öğrenci seçimi', () => {
  it('son deneme: seçilen konuda son denemede yanlış yapanlar', () => {
    expect(grupOgrencileri(K, new Set(['a']), 1, 1, ad)).toEqual([
      { sid: 's2', kez: 1 },
      { sid: 's3', kez: 1 },
    ])
  })
  it('birden çok deneme ve konu: her öğrenci bir kez, kaç denemede yanlış yaptığıyla; tekrar edenler önce', () => {
    expect(grupOgrencileri(K, new Set(['a', 'b']), 3, 1, ad)).toEqual([
      { sid: 's2', kez: 3 },
      { sid: 's1', kez: 1 },
      { sid: 's3', kez: 1 },
      { sid: 's4', kez: 1 },
      { sid: 's5', kez: 1 },
    ])
    // Aynı denemede iki konuda yanlış yapan (s3, 3. deneme) bir kez sayılır
    expect(grupOgrencileri(K, new Set(['a', 'b']), 1, 1, ad).find((x) => x.sid === 's3')).toEqual({ sid: 's3', kez: 1 })
  })
  it('yalnız tekrar edenler (en az 2 denemede)', () => {
    expect(grupOgrencileri(K, new Set(['a']), 3, 2, ad)).toEqual([{ sid: 's2', kez: 3 }])
  })
  it('konu seçilmezse kimse yok; kapsam deneme sayısını aşarsa hepsi', () => {
    expect(grupOgrencileri(K, new Set(), 3)).toEqual([])
    expect(grupOgrencileri(K, new Set(['b']), 10, 1, ad).map((x) => x.sid)).toEqual(['s3', 's4', 's5'])
  })
})

describe('gruba etüt: yardımcılar', () => {
  it('konu metni 120 karakteri aşınca kısalır, tamamı açıklamada kalır', () => {
    expect(grupKonu(['Kesirler', 'Ondalık'], ' soru çözümü ')).toEqual({ konu: 'Kesirler · Ondalık · soru çözümü', aciklama: null })
    const uzun = grupKonu(['x'.repeat(80), 'y'.repeat(80)], '')
    expect(uzun.konu.length).toBe(118)
    expect(uzun.konu.endsWith('…')).toBe(true)
    expect(uzun.aciklama).toBe(`${'x'.repeat(80)} · ${'y'.repeat(80)}`.slice(0, 200))
    expect(grupKonu([], '  ').konu).toBe('')
  })
  it('kademe ve branş eşleşmesi', () => {
    expect([4, 5, 8, 9, 12, null].map(kademeOfGrade)).toEqual([null, 'ortaokul', 'ortaokul', 'lise', 'lise', null])
    expect(bransUyar('Matematik', 'Matematik')).toBe(true)
    expect(bransUyar('Fen Bilimleri', 'Fen Bilimleri')).toBe(true)
    expect(bransUyar('T.C. İnkılap Tarihi ve Atatürkçülük', 'T.C. İnkılap Tarihi')).toBe(true)
    expect(bransUyar('Türkçe', 'Matematik')).toBe(false)
    expect(bransUyar('Matematik', null)).toBe(false)
  })
})
