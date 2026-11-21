import { describe, expect, it } from 'vitest'
import type { TakvimEv } from './takvim'
import { acik, aralikYaz, ayHaftalari, cakisanlar, egitimYili, etkinlikSeviyeleri, haftaBantlari, seviyeDegistir, seviyeyeUyar, sinifEtiketi } from './takvim'

const C = [
  { id: 'a5', name: '5/A', grade: 5, level: 'ortaokul' as const },
  { id: 'b5', name: '5/B', grade: 5, level: 'ortaokul' as const },
  { id: 'a6', name: '6/A', grade: 6, level: 'ortaokul' as const },
  { id: 'a7', name: '7/A', grade: 7, level: 'ortaokul' as const },
  { id: 'a8', name: '8/A', grade: 8, level: 'ortaokul' as const },
  { id: 'b8', name: '8/B', grade: 8, level: 'ortaokul' as const },
  { id: 'a3', name: '3/A', grade: 3, level: 'ilkokul' as const },
]
const S = [{ id: 's1', class_id: 'a8' }]
const ev = (p: Partial<TakvimEv> & { title?: string; teacher_id?: string }) => ({
  id: 'x',
  title: 'T',
  description: null,
  type: 'yazili' as string,
  starts_on: '2027-01-12',
  ends_on: '2027-01-12',
  starts_at: null,
  ends_at: null,
  location: null,
  target: 'okul' as TakvimEv['target'],
  level: null as TakvimEv['level'],
  class_id: null as string | null,
  class_ids: [] as string[],
  student_id: null as string | null,
  teacher_id: null,
  course_id: null,
  audience: ['veli', 'ogrenci', 'ogretmen'],
  created_by: null,
  ...p,
})

describe('sınıf etiketi', () => {
  it('aralıkları kısa yazar', () => {
    expect(aralikYaz([7, 5, 6])).toBe('5-7')
    expect(aralikYaz([6, 8])).toBe('6, 8')
    expect(aralikYaz([5, 6, 8, 8])).toBe('5-6, 8')
    expect(aralikYaz([])).toBe('')
  })
  it('hedefe göre etiket verir', () => {
    expect(sinifEtiketi(ev({ target: 'okul' }), C)).toBe('Tümü')
    expect(sinifEtiketi(ev({ target: 'kademe', level: 'ortaokul' }), C)).toBe('5-8')
    expect(sinifEtiketi(ev({ target: 'sinif', class_id: 'a8', class_ids: ['a8'] }), C)).toBe('8/A')
    expect(sinifEtiketi(ev({ target: 'sinif', class_id: 'a8', class_ids: ['a8', 'b8'] }), C)).toBe('8')
    expect(sinifEtiketi(ev({ target: 'sinif', class_id: 'a5', class_ids: ['a5', 'b5', 'a6', 'a7'] }), C)).toBe('5-7')
    expect(sinifEtiketi(ev({ target: 'sinif', class_id: 'a8', class_ids: [] }), C)).toBe('8/A')
    expect(sinifEtiketi(ev({ target: 'ogrenci', student_id: 's1' }), C)).toBeNull()
    expect(sinifEtiketi(ev({ target: 'ogretmen', teacher_id: 't' }), C)).toBeNull()
  })
})

describe('sınıf filtresi', () => {
  it('seviyeleri hedeften çıkarır', () => {
    expect(etkinlikSeviyeleri(ev({ target: 'okul' }), C, S)).toBe('hepsi')
    expect(etkinlikSeviyeleri(ev({ target: 'kademe', level: 'ortaokul' }), C, S)).toEqual([5, 6, 7, 8])
    expect(etkinlikSeviyeleri(ev({ target: 'ogrenci', student_id: 's1' }), C, S)).toEqual([8])
    expect(etkinlikSeviyeleri(ev({ target: 'ogretmen' }), C, S)).toEqual([])
  })
  it('tatil her zaman görünür, öğretmen etkinliği yalnız tümünde', () => {
    expect(seviyeyeUyar(ev({ type: 'tatil', target: 'kademe', level: 'ilkokul' }), 8, C, S)).toBe(true)
    expect(seviyeyeUyar(ev({ target: 'ogretmen' }), 8, C, S)).toBe(false)
    expect(seviyeyeUyar(ev({ target: 'ogretmen' }), 'all', C, S)).toBe(true)
    expect(seviyeyeUyar(ev({ target: 'sinif', class_ids: ['a5', 'a7'] }), 6, C, S)).toBe(false)
    expect(seviyeyeUyar(ev({ target: 'sinif', class_ids: ['a5', 'a7'] }), 7, C, S)).toBe(true)
    expect(seviyeyeUyar(ev({ target: 'okul' }), 3, C, S)).toBe(true)
  })
})

describe('sınıf seçici', () => {
  it('seviye düğmesi ekler, hepsi seçiliyse çıkarır, diğer seçimi korur', () => {
    expect(seviyeDegistir(['a6'], ['a8', 'b8'])).toEqual(['a6', 'a8', 'b8'])
    expect(seviyeDegistir(['a6', 'a8'], ['a8', 'b8'])).toEqual(['a6', 'a8', 'b8'])
    expect(seviyeDegistir(['a6', 'a8', 'b8'], ['a8', 'b8'])).toEqual(['a6'])
    expect(seviyeDegistir(['a6'], [])).toEqual(['a6'])
  })
})

describe('çakışma uyarısı', () => {
  const tatil = ev({ id: 't', type: 'tatil', title: 'Yarıyıl', starts_on: '2027-01-25', ends_on: '2027-02-05' })
  const sekiz = ev({ id: 'y8', title: '8 Türkçe', starts_on: '2027-01-12', target: 'sinif', class_id: 'a8', class_ids: ['a8', 'b8'] })
  const alti = ev({ id: 'y6', title: '6 Fen', starts_on: '2027-01-12', target: 'sinif', class_id: 'a6', class_ids: ['a6'] })
  const ogretmen = ev({ id: 'og', title: 'Zümre', starts_on: '2027-01-12', target: 'ogretmen', teacher_id: 't1' })
  const L = [tatil, sekiz, alti, ogretmen]
  it('aynı gün aynı sınıfı yakalar, başka sınıfı ve öğretmen etkinliğini saymaz', () => {
    const r = cakisanlar(
      { starts_on: '2027-01-12', ends_on: '2027-01-12', target: 'sinif', level: null, class_id: null, class_ids: ['b8'], student_id: null },
      L,
      C,
      S,
    )
    expect(r.ayniSinif.map((x) => x.id)).toEqual(['y8'])
    expect(r.tatil).toEqual([])
  })
  it('tatile denk geleni ve tüm okul etkinliğinin herkesle çakışmasını bildirir', () => {
    const r = cakisanlar(
      { starts_on: '2027-01-12', ends_on: '2027-01-27', target: 'okul', level: null, class_id: null, class_ids: [], student_id: null },
      L,
      C,
      S,
    )
    expect(r.tatil.map((x) => x.id)).toEqual(['t'])
    expect(r.ayniSinif.map((x) => x.id).sort()).toEqual(['y6', 'y8'])
  })
  it('düzenlenen etkinlik kendisiyle çakışmaz', () => {
    const r = cakisanlar(
      { id: 'y8', starts_on: '2027-01-12', ends_on: '2027-01-12', target: 'sinif', level: null, class_id: null, class_ids: ['a8'], student_id: null },
      L,
      C,
      S,
    )
    expect(r.ayniSinif).toEqual([])
  })
})

describe('çok günlü bantlar', () => {
  const hafta = ['2027-01-25', '2027-01-26', '2027-01-27', '2027-01-28', '2027-01-29', '2027-01-30', '2027-01-31']
  it('haftayı aşan bandı keser, çakışanları alt şeride koyar, tek günlüleri almaz', () => {
    const items = [
      { k: 'tatil', starts_on: '2027-01-25', ends_on: '2027-02-05' },
      { k: 'gezi', starts_on: '2027-01-27', ends_on: '2027-01-28' },
      { k: 'once', starts_on: '2027-01-20', ends_on: '2027-01-26' },
      { k: 'tek', starts_on: '2027-01-27', ends_on: '2027-01-27' },
    ]
    const { bantlar, serit } = haftaBantlari(hafta, items)
    const b = Object.fromEntries(bantlar.map((x) => [x.item.k, x]))
    expect(Object.keys(b).sort()).toEqual(['gezi', 'once', 'tatil'])
    expect(b.once).toMatchObject({ bas: 0, son: 1, oncedenGelir: true, sonraSurer: false, serit: 0 })
    expect(b.tatil).toMatchObject({ bas: 0, son: 6, oncedenGelir: false, sonraSurer: true, serit: 1 })
    expect(b.gezi).toMatchObject({ bas: 2, son: 3, serit: 0 })
    expect(serit).toBe(2)
  })
})

describe('afiş yardımcıları', () => {
  it('eğitim yılını eylülden başlatır', () => {
    expect(egitimYili('2027-01-01')).toEqual({ from: '2026-09-01', to: '2027-08-31', ad: '2026-2027 eğitim yılı' })
    expect(egitimYili('2026-09-01').from).toBe('2026-09-01')
  })
  it('ayın haftalarını pazartesiden kurar', () => {
    const h = ayHaftalari(2027, 1)
    expect(h[0]![0]).toBe('2026-12-28')
    expect(h.at(-1)!.at(-1)).toBe('2027-01-31')
    expect(h).toHaveLength(5)
    expect(ayHaftalari(2026, 11)).toHaveLength(6)
  })
  it('rengi beyazla karıştırır', () => {
    expect(acik('#000000', 0.5)).toBe('#808080')
    expect(acik('#c92a2a', 0)).toBe('#c92a2a')
    expect(acik('#c92a2a', 1)).toBe('#ffffff')
  })
})
