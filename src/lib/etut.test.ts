import { describe, expect, it } from 'vitest'
import { VARSAYILAN_SAATLER, baslangicSaatleri, cumartesiler, isCumartesi, ogrenciOzeti, saatHatasi, sorunlar, yerlesimOner, type Hucre } from './etut'

const H = (x: Partial<Hucre> & Pick<Hucre, 'ders' | 'teacher_name'>): Hucre => ({ teacher_id: null, tur: 'etut', konu: 'Konu', ogrenciler: [], ...x })

describe('Cumartesi etütleri', () => {
  it('Cumartesi tarihleri ve kademe saatleri', () => {
    expect(isCumartesi('2026-10-17')).toBe(true)
    expect(isCumartesi('2026-10-16')).toBe(false)
    expect(cumartesiler('2026-10-15', 3)).toEqual(['2026-10-17', '2026-10-24', '2026-10-31'])
    expect(VARSAYILAN_SAATLER.ortaokul[0]).toEqual({ bas: '09:00', bit: '09:40' })
    expect(VARSAYILAN_SAATLER.lise[4]).toEqual({ bas: '12:40', bit: '13:20' })
    expect(saatHatasi(VARSAYILAN_SAATLER.ortaokul)).toBeNull()
    expect(saatHatasi(VARSAYILAN_SAATLER.lise)).toBeNull()
  })
  it('geçersiz saat düzeni açıklamayla reddedilir', () => {
    const s = VARSAYILAN_SAATLER.ortaokul.map((x) => ({ ...x }))
    s[2] = { bas: '10:20', bit: '11:00' } // 2. ders 10:30'da biter
    expect(saatHatasi(s)).toMatch(/3\. ders/)
    expect(saatHatasi(s.slice(0, 4))).toMatch(/5 ders/)
  })
  it('yeni program aynı kademenin son programının saatlerini alır; yoksa varsayılan', () => {
    const ozel = VARSAYILAN_SAATLER.lise.map((x, i) => (i === 0 ? { bas: '09:30', bit: '10:10' } : x))
    const gunler = [
      { tarih: '2026-10-10', kademe: 'lise' as const, saatler: VARSAYILAN_SAATLER.lise },
      { tarih: '2026-10-17', kademe: 'lise' as const, saatler: ozel },
    ]
    expect(baslangicSaatleri(gunler, 'lise')[0]).toEqual({ bas: '09:30', bit: '10:10' })
    expect(baslangicSaatleri(gunler, 'ortaokul')).toEqual(VARSAYILAN_SAATLER.ortaokul)
  })
  it('aynı öğrenci aynı derste iki etütte, öğretmen aynı derste iki kez, konusuz etüt bildirilir', () => {
    const s = sorunlar(
      [
        H({ ders: 1, teacher_name: 'Ayşe', ogrenciler: ['s1'] }),
        H({ ders: 1, teacher_name: 'Bora', ogrenciler: ['s1', 's2'] }),
        H({ ders: 2, teacher_name: 'Ayşe', konu: '', ogrenciler: ['s1'] }),
        H({ ders: 2, teacher_name: 'ayşe ', tur: 'mesgul', konu: null }),
        H({ ders: 3, teacher_name: 'Cem' }),
      ],
      (id) => (id === 's1' ? 'Elif' : id),
    )
    // Aynı derste iki etüt uyarıdır (kaydı durdurmaz; "yine de kaydet" sorulur)
    expect(s.filter((x) => x.ciddi).map((x) => x.text)).toEqual(['ayşe  2. derste iki kez yazılmış.', 'Ayşe · 2. ders: etüt konusu yok.'])
    expect(s.filter((x) => x.tur === 'cakisma').map((x) => x.text)).toEqual(['Elif 1. derste iki etüde yazılmış (Ayşe ve Bora).'])
    expect(s.find((x) => !x.ciddi && !x.tur)!.text).toMatch(/Cem · 3\. ders: etütte öğrenci yok/)
  })
  it('grubun tamamı aynı derste birden çok öğretmende: tek bilgi satırı, öğrenci öğrenci uyarı yok; gruptan olmayan çakışma uyarı', () => {
    const G = [{ ad: "8'ler 1. Grup", ogrenciler: ['s1', 's2'] }]
    const s = sorunlar(
      [
        H({ ders: 3, teacher_name: 'İngilizce', ogrenciler: ['s1', 's2'] }),
        H({ ders: 3, teacher_name: 'Din', ogrenciler: ['s1', 's2', 's3'] }),
        H({ ders: 3, teacher_name: 'Fen', ogrenciler: ['s3'] }),
        H({ ders: 4, teacher_name: 'İngilizce', ogrenciler: ['s1'] }),
        H({ ders: 4, teacher_name: 'Din', ogrenciler: ['s1'] }),
      ],
      (id) => id,
      G,
    )
    expect(s.filter((x) => x.tur === 'bilgi').map((x) => x.text)).toEqual(["8'ler 1. Grup 3. derste 2 öğretmende: İngilizce, Din (paylaşımlı ders)."])
    expect(s.filter((x) => x.tur === 'cakisma').map((x) => x.text)).toEqual(['s3 3. derste iki etüde yazılmış (Din ve Fen).', 's1 4. derste iki etüde yazılmış (İngilizce ve Din).'])
    expect(s.some((x) => x.ciddi)).toBe(false)
  })
  it('talep yerleşimi: istenen ders uygunsa o, değilse öğretmenin ve öğrencilerin boş olduğu ilk ders', () => {
    const hs = [H({ ders: 1, teacher_name: 'Ayşe', ogrenciler: ['s9'] }), H({ ders: 2, teacher_name: 'Bora', ogrenciler: ['s1'] })]
    expect(yerlesimOner(hs, 'Ayşe', ['s1'], 3)).toBe(3)
    expect(yerlesimOner(hs, 'Ayşe', ['s1'], 1)).toBe(3) // 1: Ayşe dolu, 2: s1 başka etütte
    expect(yerlesimOner(hs, 'Cem', ['s2'], null)).toBe(1)
  })
})

it('PDF öğrenci özeti: grubun ve sınıfın tamamı tek satır, kalanlar adlarıyla', () => {
  const S = new Map([
    ['5/A', ['a1', 'a2', 'a3']],
    ['6/A', ['b1', 'b2']],
  ])
  const G = [{ ad: "8'ler 1. Grup", ogrenciler: ['g1', 'g2'] }]
  const ad = (id: string) => id.toUpperCase()
  expect(ogrenciOzeti(['a1', 'a2', 'a3'], S, G, ad)).toEqual(['5/A (tüm sınıf)'])
  expect(ogrenciOzeti(['g1', 'g2'], S, G, ad)).toEqual(["8'ler 1. Grup"])
  expect(ogrenciOzeti(['b2', 'b1', 'a1'], S, G, ad)).toEqual(['6/A (tüm sınıf)', 'A1'])
  expect(ogrenciOzeti(['a1', 'a2'], S, G, ad)).toEqual(['A1', 'A2'])
  expect(ogrenciOzeti([], S, G, ad)).toEqual([])
})
