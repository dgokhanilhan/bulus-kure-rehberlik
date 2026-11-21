import { describe, expect, it } from 'vitest'
import { adBicimsiz, adYaz, ayniAdliOgrenci, tekrarAdaylari, tutulacak, type VsOgrenci } from './veriSagligi'

const o = (id: string, full_name: string, class_name: string, school_no: string | null = null): VsOgrenci => ({
  id,
  full_name,
  class_id: 'c-' + class_name,
  class_name,
  school_no,
})

describe('adYaz', () => {
  it('Türkçe büyük/küçük harf kurallarıyla yazar', () => {
    expect(adYaz('DENİZ KARA')).toBe('Deniz Kara')
    expect(adYaz('ışıl İNCE')).toBe('Işıl İnce')
    expect(adYaz('IRMAK İLHAN')).toBe('Irmak İlhan')
    expect(adYaz('ayşe nur ak')).toBe('Ayşe Nur Ak')
    expect(adYaz('çağrı ÖZDEMİR')).toBe('Çağrı Özdemir')
  })
  it('tire ve kesme işaretinden sonra da büyük harf, fazla boşluk temizlenir', () => {
    expect(adYaz("  ayşe-nur   o'NEIL ")).toBe("Ayşe-Nur O'Neıl")
  })
  it('rakam içeren sözcüğe dokunmaz', () => {
    expect(adYaz('E2E TEKRAR')).toBe('E2E Tekrar')
    expect(adBicimsiz('E2E Tekrar Öğrenci')).toBe(false)
  })
  it('doğru yazılmış ad biçimsiz sayılmaz', () => {
    expect(adBicimsiz('Mehmet Can')).toBe(false)
    expect(adBicimsiz('Mehmet CAN')).toBe(true)
    expect(adBicimsiz('Mehmet  Can')).toBe(true)
  })
})

describe('tekrarAdaylari', () => {
  const l = [o('1', 'Ada Kılıç', '2/B'), o('2', 'ADA KILIÇ', '2/B'), o('3', 'Can Yılmaz', '2/A'), o('4', 'Can Yilmaz', '2/B'), o('5', 'Ece Ak', '8/A')]
  it('Türkçe harf ve büyüklük farkını yok sayar; aynı sınıftakiler önce', () => {
    const g = tekrarAdaylari(l)
    expect(g.map((x) => x.ogrenciler.map((y) => y.id))).toEqual([
      ['1', '2'],
      ['3', '4'],
    ])
    expect(g.map((x) => x.ayniSinif)).toEqual([true, false])
  })
  it('"farklı kişiler" işaretli çift listelenmez', () => {
    expect(tekrarAdaylari(l, [['4', '3']]).map((x) => x.anahtar)).toEqual(['ada kilic'])
  })
  it('üç kayıttan yalnız bir çift işaretliyse kalan kayıtlar yine görünür', () => {
    const u = [o('a', 'Ali Er', '5/A'), o('b', 'Ali Er', '5/A'), o('c', 'Ali Er', '6/A')]
    const g = tekrarAdaylari(u, [['a', 'b']])
    expect(g[0]!.ogrenciler.map((x) => x.id)).toEqual(['a', 'b', 'c'])
    expect(g[0]!.ayniSinif).toBe(false)
  })
})

describe('ayniAdliOgrenci ve tutulacak', () => {
  it('aynı sınıfta aynı adı bulur, kendisini saymaz', () => {
    const l = [o('1', 'Ada Kılıç', '2/B')]
    expect(ayniAdliOgrenci(l, 'ada kilic', 'c-2/B')?.id).toBe('1')
    expect(ayniAdliOgrenci(l, 'ada kilic', 'c-2/A')).toBeUndefined()
    expect(ayniAdliOgrenci(l, 'Ada Kılıç', 'c-2/B', '1')).toBeUndefined()
  })
  it('verisi çok olan, sonra okul numarası olan tutulur', () => {
    const a = o('a', 'X', '1/A'),
      b = o('b', 'X', '1/A', '12')
    expect(tutulacak(a, b, { a: 3 })[0].id).toBe('a')
    expect(tutulacak(a, b, {})[0].id).toBe('b')
  })
})
