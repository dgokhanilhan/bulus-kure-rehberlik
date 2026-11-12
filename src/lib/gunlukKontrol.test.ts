import { describe, expect, it } from 'vitest'
import { MADDELER, MADDE_CUMLE, ayBasi, ayOzeti, aySonu, donemBasi, farkBul, kacinci, taslakKur, uyariGider, type Kayit, type Madde } from './gunlukKontrol'

let n = 0
const k = (student_id: string, tarih: string, madde: Madde, teacher_id = 'ben', extra: Partial<Kayit> = {}): Kayit => ({
  id: `k${++n}`,
  student_id,
  teacher_id,
  tarih,
  madde,
  detay: null,
  sira: 1,
  veli_uyarildi: false,
  created_at: `${tarih}T08:00:00Z`,
  ...extra,
})

describe('tarih aralıkları', () => {
  it('ay başı / sonu ve eğitim yılı başı', () => {
    expect(ayBasi('2026-11-12')).toBe('2026-11-01')
    expect(aySonu('2026-11-12')).toBe('2026-11-30')
    expect(aySonu('2028-02-10')).toBe('2028-02-29')
    expect(donemBasi('2026-11-12')).toBe('2026-09-01')
    expect(donemBasi('2027-03-01')).toBe('2026-09-01')
  })
})

describe('kaçıncı eksik ve uyarı', () => {
  const kayitlar = [k('a', '2026-11-03', 'ajanda', 'x', { sira: 1 }), k('a', '2026-11-05', 'ajanda', 'x', { sira: 2 }), k('a', '2026-10-30', 'ajanda'), k('b', '2026-11-04', 'ajanda')]
  it('yalnız aynı öğrencinin aynı ayki aynı maddesi sayılır', () => {
    expect(kacinci(kayitlar, 'a', 'ajanda', '2026-11-12')).toBe(3)
    expect(kacinci(kayitlar, 'a', 'kiyafet', '2026-11-12')).toBe(1)
    expect(kacinci(kayitlar, 'b', 'ajanda', '2026-11-12')).toBe(2)
    expect(kacinci(kayitlar, 'a', 'ajanda', '2026-12-01')).toBe(1)
  })
  it('o gün zaten kayıtlıysa yeni sıra değil kaydın sırası döner', () => {
    expect(kacinci(kayitlar, 'a', 'ajanda', '2026-11-05')).toBe(2)
  })
  it('uyarı her 3. eksikte', () => {
    expect([1, 2, 3, 4, 5, 6, 9].map(uyariGider)).toEqual([false, false, true, false, false, true, true])
    expect(uyariGider(0)).toBe(false)
  })
})

describe('kaydetme farkı', () => {
  const gun = [k('a', '2026-11-12', 'ajanda', 'ben', { id: 'benim' }), k('b', '2026-11-12', 'kiyafet', 'baska', { id: 'onun', detay: 'ceket' })]
  it('dokunulmadıysa değişiklik yok', () => {
    expect(farkBul(gun, taslakKur(gun), '2026-11-12', 'ben')).toEqual({ ekle: [], sil: [], guncelle: [] })
  })
  it('yeni işaret eklenir, detay kırpılır; boş detay null', () => {
    const t = taslakKur(gun)
    t.c = { telefon: '  sınıfa getirdi  ', kitap_defter: '   ' }
    expect(farkBul(gun, t, '2026-11-12', 'ben').ekle).toEqual([
      { student_id: 'c', tarih: '2026-11-12', madde: 'telefon', detay: 'sınıfa getirdi' },
      { student_id: 'c', tarih: '2026-11-12', madde: 'kitap_defter', detay: null },
    ])
  })
  it('öğretmen yalnız kendi kaydını kaldırır ve düzeltir; başkasınınki kalır', () => {
    const t = taslakKur(gun)
    delete t.a!.ajanda
    t.b = { kiyafet: 'değişti' }
    expect(farkBul(gun, t, '2026-11-12', 'ben')).toEqual({ ekle: [], sil: ['benim'], guncelle: [] })
    delete t.b.kiyafet
    expect(farkBul(gun, t, '2026-11-12', 'ben').sil).toEqual(['benim'])
    // rehberlik / yönetici başkasının kaydını da kaldırabilir
    expect(farkBul(gun, t, '2026-11-12', 'ben', true).sil).toEqual(['benim', 'onun'])
  })
  it('kendi kaydının detayı değişince güncellenir', () => {
    const t = taslakKur(gun)
    t.a = { ajanda: 'imza yok' }
    expect(farkBul(gun, t, '2026-11-12', 'ben').guncelle).toEqual([{ id: 'benim', detay: 'imza yok' }])
  })
})

describe('ay özeti (veli kartı)', () => {
  it('bu ayın sayıları, bugünün eksikleri ayrı, yeniden eskiye', () => {
    const r = [k('a', '2026-11-12', 'kitap_defter'), k('a', '2026-11-10', 'kitap_defter'), k('a', '2026-11-03', 'ajanda'), k('a', '2026-10-28', 'kiyafet')]
    const o = ayOzeti(r, '2026-11-12')
    expect(o.toplam).toBe(3)
    expect(o.sayac).toEqual({ kitap_defter: 2, ajanda: 1 })
    expect(o.bugun.map((x) => x.tarih)).toEqual(['2026-11-12'])
    expect(o.liste.map((x) => x.tarih)).toEqual(['2026-11-12', '2026-11-10', '2026-11-03'])
    expect(ayOzeti(r, '2026-11-12', '2026-10-01').toplam).toBe(1)
  })
})

describe('veliye giden metinler', () => {
  it('her maddenin cümlesi var; etiketleyici ifade yok', () => {
    for (const [m] of MADDELER) expect(MADDE_CUMLE[m]).toBeTruthy()
    expect(Object.values(MADDE_CUMLE).join(' ')).not.toMatch(/başarısız|yetersiz|tembel|dikkatsiz|kötü|sorumsuz/i)
  })
})
