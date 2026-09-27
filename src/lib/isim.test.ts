import { describe, it, expect } from 'vitest'
import { matchStudent, nameDistance, type RosterStudent } from './isim'

const R: RosterStudent[] = [
  { id: 'zeynep', full_name: 'Zeynep Kaya', class_name: '8/A', school_no: '1187' },
  { id: 'zehra', full_name: 'Zehra Kaya', class_name: '8/C', school_no: '1221' },
  { id: 'kerem', full_name: 'Kerem Aydın', class_name: '8/B', school_no: '1201' },
  { id: 'irem', full_name: 'İrem Tekin', class_name: '8/C', school_no: '1224' },
  { id: 'ali', full_name: 'Ali Koç', class_name: '8/B', school_no: '1205' },
  { id: 'ali2', full_name: 'Ali Koca', class_name: '8/C', school_no: '1230' },
]

describe('isim eşleştirme', () => {
  it('büyük harf ve Türkçe karakter farkı aynı kişidir', () => {
    expect(matchStudent({ name: 'İREM TEKİN' }, R)).toEqual({ kind: 'exact', id: 'irem', via: 'name' })
    expect(matchStudent({ name: 'Irem Tekın' }, R)).toEqual({ kind: 'exact', id: 'irem', via: 'name' })
    expect(matchStudent({ name: 'KAYA ZEYNEP', class: '8/A' }, R).kind).toBe('fixed')
  })
  it('şube + okul no ile yazım hatası düzeltilir', () => {
    expect(matchStudent({ name: 'Zegnep Kaya', number: '1187', class: '8/A' }, R)).toEqual({ kind: 'fixed', id: 'zeynep', via: 'no' })
  })
  it('no yoksa tek ve yakın aday varsa düzeltilir', () => {
    expect(matchStudent({ name: 'Kerm Aydın' }, R)).toEqual({ kind: 'fixed', id: 'kerem', via: 'name' })
  })
  it('iki aday birbirine yakınsa tahmin edilmez', () => {
    const r = matchStudent({ name: 'Ali Koc' }, R)
    // "Ali Koç" katlanınca birebir; "Ali Koca" 1 fark → yine de birebir eşleşme önceliklidir
    expect(r).toEqual({ kind: 'exact', id: 'ali', via: 'name' })
    const amb = matchStudent({ name: 'Ali Kocc' }, R)
    expect(amb.kind).toBe('unknown')
  })
  it('listede olmayan isim kontrol ister', () => {
    const r = matchStudent({ name: 'Bora Tan', class: '8/C' }, R)
    expect(r.kind).toBe('unknown')
  })
  it('okul no tutuyor ama ad bambaşkaysa eşleştirmez', () => {
    expect(matchStudent({ name: 'Mehmet Yılmaz', number: '1187', class: '8/A' }, R).kind).toBe('unknown')
  })
  it('kelime sırası farkı', () => {
    expect(nameDistance('Aydın Kerem', 'Kerem Aydın')).toBe(0)
  })
})
