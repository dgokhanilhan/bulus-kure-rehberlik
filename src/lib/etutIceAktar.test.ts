import { describe, expect, it } from 'vitest'
import { hucreCoz, ogrenciEsle, ogretmenEsle, saatAraligi, tabloKelimelerden, tabloSatirlardan, type Kelime } from './etutIceAktar'

const OGR = [
  { id: 'elif10', full_name: 'Elif Kaya', class_name: '10/A' },
  { id: 'berna10', full_name: 'Berna Ak', class_name: '10/A' },
  { id: 'elif11', full_name: 'Elif Demir', class_name: '11/A' },
  { id: 'yigit11', full_name: 'Yiğit Can', class_name: '11/A' },
  { id: 'cinar10', full_name: 'Çınar Çelik', class_name: '10/A' },
  { id: 'cinar10b', full_name: 'Çınar Bal', class_name: '10/A' },
  { id: 'yanki6', full_name: 'Yankı Er', class_name: '6/A' },
  { id: 'durdu', full_name: 'Durdu Mert Aydın', class_name: '6/A' },
  { id: 'gunes', full_name: 'Güneş Ay', class_name: '6/A' },
]

describe('hücre okuma', () => {
  it('lise fotoğrafındaki biçim: sınıf, adlar, konu, salon', () => {
    const h = hucreCoz('11-A ✓ Yiğit, Elif (Üslü Sayılar) ETÜT-4')
    expect(h).toMatchObject({ tur: 'etut', adlar: ['Yiğit', 'Elif'], konu: 'Üslü Sayılar', salon: 'ETÜT-4', sinif: [{ grade: 11, sube: 'A' }] })
    expect(hucreCoz('10-A Toprak, Elif, Çınar Ç. (Dünya\'nın İç Yapısı) ETUT-1').adlar).toEqual(['Toprak', 'Elif', 'Çınar Ç.'])
  })
  it('ortaokul Excel biçimi: ad-ad, ad+sınıf, açıklamalı', () => {
    expect(hucreCoz('Durdu Mert-Güneş,Dünya ve Ay hareketleri')).toMatchObject({ adlar: ['Durdu Mert', 'Güneş', 'Dünya'], konu: 've Ay hareketleri' })
    const h = hucreCoz('Hasan6A-(Pazartesi okula gelmediği için yazıldı)-Yankı 6A (Cuma günü okulda değildi)')
    expect(h.adlar).toEqual(['Hasan', 'Yankı'])
    expect(h.sinif.map((s) => `${s.grade}${s.sube}`)).toEqual(['6A', '6A'])
    expect(hucreCoz('Serra-Yazel 6A soru çözümü')).toMatchObject({ adlar: ['Serra', 'Yazel'], konu: 'soru çözümü' })
    expect(hucreCoz('Eymen 5A-Paragraf soru çözümü').adlar).toEqual(['Eymen', 'Paragraf'])
  })
  it('meşgul ve boş hücreler', () => {
    for (const t of ['D', 'izinli', 'voleybol', '9.30-10.45 8A SINAV GÖZETMENİ', '12.SINIF DENEME GÖZETMENLİĞİ']) expect(hucreCoz(t).tur, t).toBe('mesgul')
    expect(hucreCoz('').tur).toBe('bos')
    expect(hucreCoz('izinli').aciklama).toBe('izinli')
  })
})

describe('öğrenci ve öğretmen eşleme', () => {
  it('sınıf ipucuyla ad eşleşir; baş harf soyadı ayırır; birden çok aday belirsiz kalır', () => {
    expect(ogrenciEsle('Elif', [{ grade: 10, sube: 'A' }], OGR)).toEqual({ durum: 'eslesti', id: 'elif10' })
    expect(ogrenciEsle('Elif', [{ grade: 11, sube: 'A' }], OGR)).toEqual({ durum: 'eslesti', id: 'elif11' })
    expect(ogrenciEsle('Elif', [], OGR)).toEqual({ durum: 'belirsiz', secenekler: ['elif10', 'elif11'] })
    expect(ogrenciEsle('Çınar Ç.', [{ grade: 10, sube: 'A' }], OGR)).toEqual({ durum: 'eslesti', id: 'cinar10' })
    expect(ogrenciEsle('Çınar', [{ grade: 10, sube: 'A' }], OGR).durum).toBe('belirsiz')
    expect(ogrenciEsle('Durdu Mert', [], OGR)).toEqual({ durum: 'eslesti', id: 'durdu' })
    expect(ogrenciEsle('Dünya', [], OGR)).toEqual({ durum: 'yok' })
    expect(ogrenciEsle('Yankı', [{ grade: 6, sube: 'A' }], OGR)).toEqual({ durum: 'eslesti', id: 'yanki6' })
  })
  it('öğretmen: HOCA/Öğretmen eki atılır, ilk adla ve kademeyle eşleşir', () => {
    const T = [
      { id: 'o1', name: 'Özlem Çubukluöz Öztürk' },
      { id: 'e1', name: 'Ebru Çelik' },
      { id: 's1', name: 'Sıla Bozkurt' },
      { id: 's2', name: 'Sıla Kaya' },
    ]
    expect(ogretmenEsle('ÖZLEM HOCA', T).id).toBe('o1')
    expect(ogretmenEsle('Ebru Öğretmen', T).id).toBe('e1')
    expect(ogretmenEsle('SILA HOCA', T)).toEqual({ id: null, secenekler: ['s1', 's2'] })
    expect(ogretmenEsle('SILA HOCA', T, new Set(['s2'])).id).toBe('s2')
  })
})

describe('tablo kurma', () => {
  it('Excel satırlarından: başlık, saatler, öğretmen ve 5 hücre', () => {
    const t = tabloSatirlardan([
      ['ETÜT ÇİZELGESİ'],
      ['Öğretmen', '1. Ders\n09.00–09.40', '2. Ders\n09.50–10.30', '3. Ders\n10.40–11.20', '4. Ders\n11.30–12.10', '5. Ders\n12.20–13.00'],
      ['Ebru Öğretmen', '', 'Durdu Mert-Güneş,Dünya ve Ay hareketleri', '', 'Serra-Yazel 6A soru çözümü', null],
      ['Bestem Öğretmen', 'izinli', '', '', '', ''],
    ])
    expect(t.saatler?.[0]).toEqual({ bas: '09:00', bit: '09:40' })
    expect(t.satirlar.map((r) => r.ogretmen)).toEqual(['Ebru', 'Bestem'])
    expect(t.satirlar[0]!.hucreler[3]).toBe('Serra-Yazel 6A soru çözümü')
  })
  it('OCR kelimelerinden: başlık saatleri sütunları, sol sütun öğretmen satırlarını belirler', () => {
    const W = (t: string, x: number, y: number, w = 60): Kelime => ({ t, x0: x, y0: y, x1: x + w, y1: y + 14 })
    const xs = [300, 420, 540, 660, 780]
    const ws: Kelime[] = [
      W('ÖĞRETMEN', 100, 100),
      ...['09:20-10:00', '10:10-10:50', '11:00-11:40', '11:50-12:30', '12:40-13:20'].map((s, i) => W(s, xs[i]! - 30, 100)),
      W('ÖZLEM', 90, 200, 50),
      W('HOCA', 145, 200, 40),
      W('10-A', 400, 185, 30),
      W('Nisa,', 395, 200, 30),
      W('Berra', 430, 200, 30),
      W('SILA', 90, 300, 40),
      W('HOCA', 135, 300, 40),
      W('D', 535, 300, 10),
    ]
    const t = tabloKelimelerden(ws, new Set(['ozlem', 'sila']))
    expect(t.saatler?.map((s) => s.bas)).toEqual(['09:20', '10:10', '11:00', '11:50', '12:40'])
    expect(t.satirlar.map((r) => r.ogretmen)).toEqual(['ÖZLEM', 'SILA'])
    expect(t.satirlar[0]!.hucreler[1]).toBe('10-A Nisa, Berra')
    expect(t.satirlar[1]!.hucreler[2]).toBe('D')
  })
  it('saat aralığı biçimleri', () => {
    expect(saatAraligi('09.50–10.30')).toEqual({ bas: '09:50', bit: '10:30' })
    expect(saatAraligi('9:20-10:00')).toEqual({ bas: '09:20', bit: '10:00' })
  })
})

describe('OCR gürültüsü', () => {
  it('çizgi ve süslü parantez atılır; GA/SA/TA sınıf adı olur; kısa gürültü boş', () => {
    expect(hucreCoz('Serra-Yazel GA soru çözümü').sinif).toEqual([{ grade: 6, sube: 'A' }])
    expect(hucreCoz('Eymen SA-Paragraf soru çözümü').sinif).toEqual([{ grade: 5, sube: 'A' }])
    expect(hucreCoz('Durdu Mert-Güneş,Dünya| ve Ay hareketleri').adlar).toEqual(['Durdu Mert', 'Güneş', 'Dünya'])
    expect(hucreCoz('rf').tur).toBe('bos')
    expect(hucreCoz('D').tur).toBe('mesgul')
  })
  it('tek harf hatalı ad (OCR) kendiliğinden seçilmez, aday olarak sorulur', () => {
    expect(ogrenciEsle('Yank', [{ grade: 6, sube: 'A' }], OGR)).toEqual({ durum: 'belirsiz', secenekler: ['yanki6'] })
  })
})

it('OCR gürültüsüyle gelen meşgul sözcüğü meşgul sayılır', () => {
  expect(hucreCoz('voleybol aa ıı ıı e')).toMatchObject({ tur: 'mesgul', aciklama: 'voleybol' })
  expect(hucreCoz('izinli ————— —')).toMatchObject({ tur: 'mesgul', aciklama: 'izinli' })
  expect(hucreCoz('Yankı 6A (Cuma günü okulda değildi)').tur).toBe('etut')
})
