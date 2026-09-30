import { describe, it, expect } from 'vitest'
import { parseCsv, toCsv, toRecords, mapHeaders, TEMPLATE } from './aktarim'

describe('toplu aktarım dosya çözümleme', () => {
  it('noktalı virgül, virgül ve sekme ayırıcı; tırnak, BOM, CRLF', () => {
    expect(parseCsv('﻿Ad soyad;Sınıf\r\n"Kaya; Ali";5/A\r\n\r\n')).toEqual([['Ad soyad', 'Sınıf'], ['Kaya; Ali', '5/A']])
    expect(parseCsv('a,b\n"x ""y""",z')).toEqual([['a', 'b'], ['x "y"', 'z']])
    expect(parseCsv('a\tb\n1\t2')).toEqual([['a', 'b'], ['1', '2']])
    expect(parseCsv(toCsv(TEMPLATE.ogrenci))).toEqual(TEMPLATE.ogrenci)
  })
  it('başlıkları Türkçe karakter ve yazım farkına bakmadan eşler', () => {
    expect(mapHeaders('ogrenci', ['ADI SOYADI', 'Şube', 'Okul Numarası']).missing).toEqual([])
    expect(mapHeaders('ogretmen', ['Ad Soyad', 'E-Posta']).missing).toEqual(['Branş'])
    const { records, missing } = toRecords('ogrenci', [['Ad', 'Soyad', 'Sınıf'], ['Ali', ' Kaya ', '5/A'], ['', '', '']])
    expect(missing).toEqual([])
    expect(records).toEqual([{ full_name: 'Ali Kaya', class_name: '5/A', school_no: '' }])
    expect(toRecords('ogretmen', [['İsim', 'Mail', 'Branşı'], ['Z D', ' Z@X.COM ', 'Fizik']]).records).toEqual([{ full_name: 'Z D', email: 'z@x.com', branch: 'Fizik', phone: '' }])
  })
})
