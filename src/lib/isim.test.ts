import { describe, it, expect } from 'vitest'
import { matchStudent, nameDistance, noUyar, type RosterStudent } from './isim'

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
    expect(matchStudent({ name: 'Zegnep Kaya', number: '1187', class: '8/A' }, R)).toEqual({ kind: 'fixed', id: 'zeynep', via: 'name' })
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
  it('karnedeki şube okulda yoksa sınıf yok sayılır, ada bakılır', () => {
    expect(matchStudent({ name: 'KEREM AYDIN', class: '8/XX' }, R)).toEqual({ kind: 'exact', id: 'kerem', via: 'name' })
    expect(matchStudent({ name: 'Kerem Aydın', class: '8/C' }, R).kind).toBe('unknown') // şube var ama başka: eski davranış
  })
  it('okul no tutuyor ama ad bambaşkaysa eşleştirmez', () => {
    expect(matchStudent({ name: 'Mehmet Yılmaz', number: '1187', class: '8/A' }, R).kind).toBe('unknown')
  })
  it('kelime sırası farkı', () => {
    expect(nameDistance('Aydın Kerem', 'Kerem Aydın')).toBe(0)
  })
  it('tekrarlanan okul numarası ad ve sınıf eşleştirmesini değiştirmez', () => {
    const repeated = R.map(s => ({ ...s, school_no: '10' }))
    expect(matchStudent({name:'İrem Tekin',number:'10',class:'8/C'},repeated)).toEqual({kind:'exact',id:'irem',via:'name'})
    expect(matchStudent({name:'İrem Tekin',number:'1187',class:'8/A'},repeated).kind).toBe('unknown')
    const same = [{id:'a',full_name:'Ali Kaya',class_name:'8/A',school_no:'10'},{id:'b',full_name:'Ali Kaya',class_name:'8/B',school_no:'10'}]
    expect(matchStudent({name:'Ali Kaya',number:'10'},same).kind).toBe('unknown')
    expect(matchStudent({name:'Ali Kaya',number:'10',class:'8/B'},same)).toEqual({kind:'exact',id:'b',via:'name'})
  })
})

describe('yayın karnesi farkları (ikinci ad, şube, ön ekli no)', () => {
  const R = [
    { id: 'e1', full_name: 'ELİF DURU TAŞ', class_name: '12/A · SAY', school_no: '57' },
    { id: 'e2', full_name: 'ELİF NAZ TAŞ', class_name: '12/A · SAY', school_no: '58' },
    { id: 'a1', full_name: 'AHSEN YUDUM GÜNAY', class_name: '12/B · EA', school_no: '65' },
    { id: 'o1', full_name: 'OĞUZ KAAN KIRIMLI', class_name: '12/B · EA', school_no: '123' },
    { id: 'k1', full_name: 'KAAN AKTAŞ', class_name: '12/A · SAY', school_no: '77' },
  ]
  it('ikinci ad yazılmamış: sınıfta tek adaysa düzeltilir', () => {
    expect(matchStudent({ name: 'AHSEN GÜNAY', class: '12/B', number: '10065' }, R)).toEqual({ kind: 'fixed', id: 'a1', via: 'name' })
  })
  it('iki aday varsa ön ekli okul numarası ayırır; numara yoksa sorulur', () => {
    expect(matchStudent({ name: 'ELİF TAŞ', class: '12/A', number: '10057' }, R)).toEqual({ kind: 'fixed', id: 'e1', via: 'no' })
    expect(matchStudent({ name: 'ELİF TAŞ', class: '12/A', number: null }, R).kind).toBe('unknown')
  })
  it('şube farklı ama ad soyad okulda tek: kendiliğinden eşleşmez, ilk aday olarak önerilir', () => {
    expect(matchStudent({ name: 'OĞUZ KAAN KIRIMLI', class: '12/A', number: '10123' }, R)).toEqual({ kind: 'unknown', candidates: ['o1'] })
  })
  it('soyad ya da ilk ad farklıysa ikinci ad kuralı uygulanmaz', () => {
    expect(matchStudent({ name: 'MERT TAŞ', class: '12/A', number: null }, R).kind).toBe('unknown')
  })
  it('ön ekli numara: 10057 = 57, 1057 = 57; farklı numara değil', () => {
    expect([noUyar('10057', '57'), noUyar('1057', '57'), noUyar('57', '57'), noUyar('10058', '57'), noUyar('957', '57'), noUyar(null, '57')]).toEqual([true, true, true, false, false, false])
  })
})
