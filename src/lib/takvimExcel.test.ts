import { describe, expect, it } from 'vitest'
import { saatOku, sinifOku, takvimTablosuOku, tarihOku, turOku } from './takvimExcel'

const C = [
  { id: 'a5', name: '5/A', grade: 5, level: 'ortaokul' as const },
  { id: 'a6', name: '6/A', grade: 6, level: 'ortaokul' as const },
  { id: 'a7', name: '7/A', grade: 7, level: 'ortaokul' as const },
  { id: 'a8', name: '8/A', grade: 8, level: 'ortaokul' as const },
  { id: 'b8', name: '8/B', grade: 8, level: 'ortaokul' as const },
  { id: 'x8', name: '8/X', grade: 8, level: 'ortaokul' as const, active: false },
]
const T = { yazili: 'Yazılı', deneme: 'Deneme', bursluluk: 'Bursluluk sınavı', tatil: 'Tatil', veli_toplantisi: 'Veli toplantısı' }

describe('alan okuma', () => {
  it('tarih', () => {
    expect(tarihOku(new Date(Date.UTC(2027, 0, 12)))).toBe('2027-01-12')
    expect(tarihOku('12.01.2027')).toBe('2027-01-12')
    expect(tarihOku('2/3/2027')).toBe('2027-03-02')
    expect(tarihOku('2027-01-12')).toBe('2027-01-12')
    expect(tarihOku(46399)).toBe('2027-01-12')
    expect(tarihOku('31.02.2027')).toBeNull()
    expect(tarihOku('yarın')).toBeNull()
    expect(tarihOku('')).toBeNull()
  })
  it('saat', () => {
    expect(saatOku('9:30')).toBe('09:30')
    expect(saatOku('14.05')).toBe('14:05')
    expect(saatOku(0.5)).toBe('12:00')
    expect(saatOku('')).toBeNull()
    expect(saatOku(null)).toBeNull()
    expect(saatOku('25:00')).toBeUndefined()
  })
  it('tür', () => {
    expect(turOku('Deneme', T)).toBe('deneme')
    expect(turOku('YAZILI', T)).toBe('yazili')
    expect(turOku('bursluluk', T)).toBe('bursluluk')
    expect(turOku('tatil', T)).toBe('tatil')
    expect(turOku('Konser', T)).toBeNull()
  })
  it('sınıflar', () => {
    expect(sinifOku('', C)).toEqual({ target: 'okul', level: null, ids: [] })
    expect(sinifOku('Tümü', C)).toEqual({ target: 'okul', level: null, ids: [] })
    expect(sinifOku('Ortaokul', C)).toEqual({ target: 'kademe', level: 'ortaokul', ids: [] })
    expect(sinifOku('8', C)).toEqual({ target: 'sinif', level: null, ids: ['a8', 'b8'] })
    expect(sinifOku('8. sınıflar', C)).toEqual({ target: 'sinif', level: null, ids: ['a8', 'b8'] })
    expect(sinifOku('5-7', C)).toEqual({ target: 'sinif', level: null, ids: ['a5', 'a6', 'a7'] })
    expect(sinifOku('8A; 6/a', C)).toEqual({ target: 'sinif', level: null, ids: ['a6', 'a8'] })
    expect(sinifOku('8/X', C)).toEqual({ hata: '"8/x" sınıfı bulunamadı' })
    expect(sinifOku('9', C)).toEqual({ hata: '9. sınıf bulunamadı' })
  })
})

describe('tablo', () => {
  it('başlık satırını bulur, hatalı satırı uydurmadan işaretler, boş satırı atlar', () => {
    const rows = [
      ['2026-2027 2. dönem takvimi'],
      ['Başlangıç', 'Bitiş', 'Etkinlik', 'Tür', 'Sınıflar', 'Saat', 'Yer', 'Açıklama'],
      [new Date(Date.UTC(2027, 0, 12)), null, 'LGS Deneme 4', 'Deneme', '8', '09:30', 'Spor salonu', null],
      ['25.01.2027', '05.02.2027', 'Yarıyıl tatili', 'Tatil', 'Tümü', null, null, null],
      [null, null, null, null, null, null, null, null],
      ['13.01.2027', null, 'Konser', 'Konser', '8', null, null, null],
      ['14.01.2027', null, 'Fen yazılı', 'Yazılı', '9', null, null, null],
      ['15.01.2027', '14.01.2027', 'Gezi', 'Yazılı', '5', null, null, null],
    ]
    const { satirlar, hata } = takvimTablosuOku(rows, C, T)
    expect(hata).toBeUndefined()
    expect(satirlar.map((s) => s.no)).toEqual([3, 4, 6, 7, 8])
    expect(satirlar[0]!.event).toEqual({
      title: 'LGS Deneme 4',
      type: 'deneme',
      starts_on: '2027-01-12',
      ends_on: '2027-01-12',
      starts_at: '09:30',
      location: 'Spor salonu',
      description: null,
      target: 'sinif',
      level: null,
      class_id: 'a8',
      class_ids: ['a8', 'b8'],
    })
    expect(satirlar[1]!.event).toMatchObject({ target: 'okul', starts_on: '2027-01-25', ends_on: '2027-02-05', class_ids: [] })
    expect(satirlar[2]).toMatchObject({ hata: 'Tür okunamadı ("Konser")' })
    expect(satirlar[2]!.event).toBeUndefined()
    expect(satirlar[3]).toMatchObject({ hata: '9. sınıf bulunamadı' })
    expect(satirlar[4]).toMatchObject({ hata: 'Bitiş, başlangıçtan önce' })
  })
  it('başlık yoksa açıklayıcı hata', () => {
    expect(takvimTablosuOku([['a', 'b']], C, T).hata).toMatch(/Başlık satırı bulunamadı/)
  })
})
