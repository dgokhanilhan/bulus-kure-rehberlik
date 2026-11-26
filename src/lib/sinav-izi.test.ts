import { describe, it, expect } from 'vitest'
import { examTrack, navItems, MODULE_DEFAULTS } from './roles'

describe('sınav izi (LGS / YKS uygunluğu)', () => {
  it('yalnız 8 → LGS, yalnız 12 → YKS; diğerleri ve bilinmeyen → yok', () => {
    const got = Array.from({ length: 12 }, (_, i) => [i + 1, examTrack(i + 1)])
    expect(got.filter(([, t]) => t === 'lgs')).toEqual([[8, 'lgs']])
    expect(got.filter(([, t]) => t === 'yks')).toEqual([[12, 'yks']])
    expect(examTrack(null)).toBeNull()
    expect(examTrack(undefined)).toBeNull()
  })
  it('menü: LGS uygun değilse ya da modül kapalıysa "Özet"; öğrencide İletişim yok, Duyurular var', () => {
    const label = (fam: { lgs: boolean }, mods = MODULE_DEFAULTS) => navItems('veli', mods, fam).find((n) => n.id === 'ozet')!.label
    expect(label({ lgs: true })).toBe('LGS özeti')
    expect(label({ lgs: false })).toBe('Özet')
    expect(label({ lgs: true }, { ...MODULE_DEFAULTS, lgs: false })).toBe('Özet')
    const ogr = navItems('ogrenci').map((n) => n.id)
    expect(ogr).toContain('duyurular')
    expect(ogr).not.toContain('iletisim')
    expect(navItems('veli', { ...MODULE_DEFAULTS, duyuru: false }).map((n) => n.id)).not.toContain('duyurular')
    expect(navItems('veli', { ...MODULE_DEFAULTS, mesaj: false }).map((n) => n.id)).not.toContain('iletisim')
  })
  it("menü: Hedefim Ödevler'in hemen altında (telefonda alt çubuk değişmez); hedef sınıfı (8, 11, 12) yoksa ya da LGS modülü kapalıysa yok; öğretmende yok", () => {
    const ids = (fam: { lgs: boolean; hedef?: boolean }, mods = MODULE_DEFAULTS) => navItems('veli', mods, fam).map((n) => n.id)
    const v = ids({ lgs: true, hedef: true })
    expect(v.indexOf('hedefim')).toBe(v.indexOf('odevler') + 1)
    expect(v.slice(0, 4)).toEqual(['panel', 'ozet', 'okul', 'odevler'])
    expect(navItems('ogrenci').map((n) => n.id)).toContain('hedefim')
    expect(navItems('veli').find((n) => n.id === 'hedefim')!.label).toBe('Hedefim')
    expect(ids({ lgs: false, hedef: true })).toContain('hedefim') // 11–12. sınıf (YKS hedefi)
    expect(ids({ lgs: true, hedef: false })).not.toContain('hedefim')
    expect(ids({ lgs: false })).not.toContain('hedefim')
    expect(ids({ lgs: true, hedef: true }, { ...MODULE_DEFAULTS, lgs: false })).not.toContain('hedefim')
    for (const r of ['admin', 'rehber', 'brans'] as const) expect(navItems(r).map((n) => n.id)).not.toContain('hedefim')
  })
})
