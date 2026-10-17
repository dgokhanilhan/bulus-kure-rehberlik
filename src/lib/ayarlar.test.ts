import { describe, expect, it } from 'vitest'
import { ayarOkuyucu, menuAyarla } from './ayarOku'
import { navItems } from './roles'

const ids = (x: { id: string }[]) => x.map((n) => n.id)

describe('ayar okuyucu', () => {
  it('kayıt yoksa varsayılan; liste ve saat biçimleri', () => {
    const a = ayarOkuyucu({ 'etut.salonlar': 'A, B ,,C', 'rapor.ai': false })
    expect(a.list('etut.salonlar')).toEqual(['A', 'B', 'C'])
    expect(a.bool('rapor.ai')).toBe(false)
    expect(a.bool('rapor.logo')).toBe(true)
    expect(a.num('analiz.tekrar_esik')).toBe(2)
    expect(a.saatler('etut.saatler_lise')[0]).toEqual({ bas: '09:20', bit: '10:00' })
    expect(a.text('rapor.veli_baslik')).toBe('Veli Gelişim Raporu')
  })
})

describe('menü ayarları', () => {
  it('ad değiştirme, gizleme ve sıra; yönetici Yönetim\'i gizleyemez', () => {
    const a = ayarOkuyucu({ 'menu.ad.duyurular': 'Haberler', 'menu.gizli.admin': 'galeri,yonetim,nobet_takip,takvim', 'menu.sira.admin': 'yonetim,etut' })
    const m = menuAyarla(navItems('admin'), 'admin', a)
    expect(m.find((n) => n.id === 'duyurular')!.label).toBe('Haberler')
    expect(ids(m)).not.toContain('takvim')
    expect(ids(m)).toContain('yonetim')
    expect(ids(m).slice(0, 2)).toEqual(['yonetim', 'etut'])
  })
  it('veli/öğrenci bölüm ayarları menüden de kaldırır; öğretmen etkilenmez', () => {
    const a = ayarOkuyucu({ 'aile.gorevler': false, 'aile.etut': false })
    expect(ids(menuAyarla(navItems('veli'), 'veli', a))).not.toContain('gorevler')
    expect(ids(menuAyarla(navItems('ogrenci'), 'ogrenci', a))).not.toContain('etut')
    expect(ids(menuAyarla(navItems('brans'), 'brans', a))).toContain('etut')
  })
  it('ayar yoksa menü değişmez', () => {
    for (const r of ['admin', 'rehber', 'brans', 'veli', 'ogrenci'] as const) expect(menuAyarla(navItems(r), r, ayarOkuyucu({}))).toEqual(navItems(r))
  })
})
