import { describe, it, expect } from 'vitest'
import { durum, lgsTablo, oneriler, osymTablo4, referansPuan, uniIl, type HedefProgram } from './hedef'

describe('üniversitenin ili', () => {
  it('parantez, adın başı, istisna; KKTC ve yurt dışı; bulunamazsa null', () => {
    expect(uniIl('ABDULLAH GÜL ÜNİVERSİTESİ (KAYSERİ)')).toBe('Kayseri')
    expect(uniIl('BARTIN ÜNİVERSİTESİ')).toBe('Bartın')
    expect(uniIl('İSTANBUL TEKNİK ÜNİVERSİTESİ')).toBe('İstanbul')
    expect(uniIl('BOĞAZİÇİ ÜNİVERSİTESİ (İSTANBUL)')).toBe('İstanbul')
    expect(uniIl('GEBZE TEKNİK ÜNİVERSİTESİ')).toBe('Kocaeli')
    expect(uniIl('YAKIN DOĞU ÜNİVERSİTESİ (KKTC-LEFKOŞA)')).toBe('KKTC')
    expect(uniIl('ULUSLARARASI BALKAN ÜNİVERSİTESİ (ÜSKÜP-MAKEDONYA)')).toBe('Yurt dışı')
    expect(uniIl('BİLİNMEYEN ÜNİVERSİTE')).toBeNull()
  })
})

describe('ÖSYM Tablo-4', () => {
  const rows = [
    ['TABLO-4 2025 Yılı Merkezi Yerleştirme İle Öğrenci Alan Yükseköğretim Lisans Programları'],
    [null, null, null, null, null, null, 'Genel Kontenjan', null, null, null, 'Okul Birincisi Kontenjanı'],
    ['Program Kodu', 'Üniversite Türü', 'Üniversite Adı', 'Fakülte/Yüksekokul Adı', 'Program Adı', 'Puan Türü', 'Kontenjan', 'Yerleşen', 'En Küçük Puan', 'En Büyük Puan', 'Kontenjan', 'Yerleşen', 'En Küçük Puan', 'En Büyük Puan'],
    ['101690110', 'DEVLET', 'BARTIN ÜNİVERSİTESİ', 'Bartın Orman Fakültesi', 'Orman Endüstrisi Mühendisliği', 'SAY', 25, 26, 268.85675, 293.7169, 1, 1, 250.1, 250.1],
    ['106510090', 'DEVLET', 'ABDULLAH GÜL ÜNİVERSİTESİ (KAYSERİ)', 'İnsan ve Toplum Bilimleri Fakültesi', 'Psikoloji (İngilizce)', 'EA', 40, 40, 380.15232, 410.17757, '--', '--', '--', '--'],
    ['106510099', 'DEVLET', 'ABDULLAH GÜL ÜNİVERSİTESİ (KAYSERİ)', 'Mühendislik Fakültesi', 'Boş Kalan Program', 'SAY', 30, 0, '--', '--'],
    ['106510100', 'DEVLET', 'ORTA DOĞU TEKNİK ÜNİVERSİTESİ (ANKARA)', 'ODTÜ Kuzey Kıbrıs Kampusu (KKTC-Güzelyurt)', 'Bilgisayar Mühendisliği', 'SAY', 25, 25, 317.2, 380.1],
    ['açıklama satırı', null, null],
  ]
  it('genel kontenjan sütunları okunur (okul birincisi değil); boş kalan programın tabanı yok; geçersiz satır atlanır', () => {
    const r = osymTablo4(rows, 2025)
    expect(r.hata).toBeNull()
    expect(r.atlanan).toBe(1)
    expect(r.programlar).toHaveLength(4)
    expect(r.programlar[3]!.il).toBe('KKTC') // başka ildeki kampüs
    expect(r.programlar[0]).toMatchObject({ sinav: 'YKS', yil: 2025, kod: '101690110', il: 'Bartın', puan_turu: 'SAY', taban_puan: 268.85675, tavan_puan: 293.7169, kontenjan: 25, yerlesen: 26 })
    expect(r.programlar[1]).toMatchObject({ il: 'Kayseri', puan_turu: 'EA', taban_puan: 380.15232 })
    expect(r.programlar[2]!.taban_puan).toBeNull()
  })
  it('başlık yoksa açık hata', () => {
    expect(osymTablo4([['a', 'b']], 2025).hata).toMatch(/başlığı/)
  })
})

describe('LGS şablonu', () => {
  it('başlık adına göre okunur; Türkçe sayı biçimi; il adı düzeltilir; geçersiz satır atlanır', () => {
    const r = lgsTablo(
      [
        ['Okul', 'İl', 'İlçe', 'Okul türü', 'Alan / dil', 'Taban puan', 'Yüzdelik', 'Kontenjan'],
        ['Hasan Sabri Çavuşoğlu Fen Lisesi', 'BARTIN', 'Merkez', 'Fen Lisesi', 'İngilizce', '438,212', '4,86', '150'],
        ['Örnek Anadolu Lisesi', 'bartın', 'Amasra', 'Anadolu Lisesi', '', '1.234,5', '', ''],
        ['Taban yok Lisesi', 'Bartın', '', '', '', '', '', ''],
        ['Yanlış Yüzdelik', 'Bartın', '', '', '', '400', '120', ''],
      ],
      2025,
    )
    expect(r.atlanan).toBe(3)
    expect(r.programlar).toHaveLength(1)
    expect(r.programlar[0]).toMatchObject({ sinav: 'LGS', kurum: 'Hasan Sabri Çavuşoğlu Fen Lisesi', il: 'Bartın', ilce: 'Merkez', birim: 'Fen Lisesi', program: 'İngilizce', taban_puan: 438.212, yuzdelik: 4.86, kontenjan: 150 })
  })
  it('başlık bulunamazsa şablon uyarısı', () => {
    expect(lgsTablo([['x', 'y']], 2025).hata).toMatch(/Şablonu kullan/)
  })
})

describe('öneriler', () => {
  const p = (kod: string, taban: number | null): HedefProgram => ({ sinav: 'LGS', yil: 2025, kod, kurum: kod, il: 'Bartın', birim: null, program: null, puan_turu: null, taban_puan: taban, yuzdelik: null, kontenjan: null })
  it('ulaşılabilir / yakın / zorlayıcı (±15 puan); tabanı olmayan dışarıda', () => {
    expect(durum(420, 400)).toBe('ulasilabilir')
    expect(durum(420, 410)).toBe('yakin')
    expect(durum(420, 434)).toBe('yakin')
    expect(durum(420, 436)).toBe('zorlayici')
    const g = oneriler([p('a', 380), p('b', 404), p('c', 415), p('d', 430), p('e', 470), p('f', 450), p('g', null)], 420)
    expect(g.ulasilabilir.map((x) => x.kod)).toEqual(['b', 'a'])
    expect(g.yakin.map((x) => [x.kod, x.fark])).toEqual([['d', -10], ['c', 5]])
    expect(g.zorlayici.map((x) => x.kod)).toEqual(['f', 'e']) // en yakın olan önce
  })
  it('referans puan: son 3 denemenin ortalaması; puansız deneme sayılmaz', () => {
    expect(referansPuan([300, null, 330, 360, 390])).toBe(360)
    expect(referansPuan([null, undefined])).toBeNull()
  })
})
