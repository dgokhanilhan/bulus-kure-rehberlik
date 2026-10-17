import { describe, expect, it } from 'vitest'
import { VARSAYILAN_SAATLER, baslangicSaatleri, cumartesiler, isCumartesi, saatHatasi, sorunlar, yerlesimOner, type Hucre } from './etut'

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
    expect(s.filter((x) => x.ciddi).map((x) => x.text)).toEqual([
      'Elif 1. derste iki etüde yazılmış (Ayşe ve Bora).',
      'ayşe  2. derste iki kez yazılmış.',
      'Ayşe · 2. ders: etüt konusu yok.',
    ])
    expect(s.find((x) => !x.ciddi)!.text).toMatch(/Cem · 3\. ders: etütte öğrenci yok/)
  })
  it('talep yerleşimi: istenen ders uygunsa o, değilse öğretmenin ve öğrencilerin boş olduğu ilk ders', () => {
    const hs = [H({ ders: 1, teacher_name: 'Ayşe', ogrenciler: ['s9'] }), H({ ders: 2, teacher_name: 'Bora', ogrenciler: ['s1'] })]
    expect(yerlesimOner(hs, 'Ayşe', ['s1'], 3)).toBe(3)
    expect(yerlesimOner(hs, 'Ayşe', ['s1'], 1)).toBe(3) // 1: Ayşe dolu, 2: s1 başka etütte
    expect(yerlesimOner(hs, 'Cem', ['s2'], null)).toBe(1)
  })
})
