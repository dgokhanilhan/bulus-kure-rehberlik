import { describe, expect, it } from 'vitest'
import { grupBul, grupImza } from './etutGruplari'

const G = [
  { id: 'g81', ad: "8'ler 1. Grup", ogrenciler: ['a'] },
  { id: 'g82', ad: "8'ler 2. Grup", ogrenciler: ['b'] },
  { id: 'g71', ad: '7. Sınıf 1. Grup', ogrenciler: ['c'] },
  { id: 'lgs', ad: 'LGS Hızlandırma', ogrenciler: ['d'] },
]

describe('grup adı imzası', () => {
  it('düzey + sıra farklı yazımlarda aynı', () => {
    for (const t of ["8'ler 1. Grup", 'Sekizler birinci grup', '8. sınıf 1. grup', '8.SINIF 1.GRUP', '1. GRUP 8LER', '8 I. GRUP', "8'LER GRUP 1"])
      expect(grupImza(t), t).toMatchObject({ duzey: 8, sira: '1' })
    expect(grupImza('Sekizler ikinci grubu')).toMatchObject({ duzey: 8, sira: '2' })
    expect(grupImza('A grubu')).toMatchObject({ duzey: null, sira: 'a' })
    expect(grupImza('8-A Elif')).toBeNull()
  })
})

describe('hücrede grup bulma', () => {
  it('imzayla eşleşir; grup ifadesi çıkarılır, kalan (konu, ad) korunur', () => {
    expect(grupBul('Sekizler birinci grup', G)).toEqual({ grup: G[0], kalan: '' })
    expect(grupBul("8'LER 2. GRUP\n(Üslü ifadeler)", G)).toEqual({ grup: G[1], kalan: '(Üslü ifadeler)' })
    expect(grupBul('7. sınıflar 1. grup Kesirler', G)).toEqual({ grup: G[2], kalan: 'Kesirler' })
    expect(grupBul('LGS Hızlandırma (Paragraf)', G).grup).toBe(G[3])
  })
  it('düzeyi ya da sırası tutmayan, belirsiz ya da grup sözcüğü olmayan hücre eşleşmez', () => {
    expect(grupBul('8. sınıf 3. grup', G).grup).toBeNull()
    expect(grupBul('1. grup', G).grup).toBeNull() // 8'ler 1 ve 7. sınıf 1: belirsiz
    expect(grupBul('8-A\nElif, Beril', G)).toEqual({ grup: null, kalan: '8-A\nElif, Beril' })
    expect(grupBul('Sekizler birinci grup', []).grup).toBeNull()
  })
})

it('grup adındaki diğer sözcükler (ör. "Sayısal") hücrede de yazılmışsa konuya karışmaz', () => {
  const S = [{ id: 's', ad: '12 Sayısal 1. Grup', ogrenciler: [] }]
  expect(grupBul('12 SAYISAL 1. GRUP (Türev)', S)).toEqual({ grup: S[0], kalan: '(Türev)' })
  expect(grupBul('E2E SEKİZLER BİRİNCİ GRUP', [{ id: 'e', ad: "E2E 8'ler 1. Grup", ogrenciler: [] }]).kalan).toBe('')
})
