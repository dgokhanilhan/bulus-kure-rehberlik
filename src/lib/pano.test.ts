import { describe, expect, it } from 'vitest'
import { haftaninTesekkuru, trGun, yaklasanDogumGunleri } from './pano'

describe('pano', () => {
  it('haftanın teşekkürü: bu hafta en çok alkış, eşitlikte en yeni', () => {
    const l = [
      { id: 'a', created_at: '2026-11-09T08:00:00Z', oda_tesekkur_alkis: [1, 2] },
      { id: 'b', created_at: '2026-11-12T08:00:00Z', oda_tesekkur_alkis: [1, 2] },
      { id: 'c', created_at: '2026-11-06T08:00:00Z', oda_tesekkur_alkis: [1, 2, 3, 4] }, // geçen hafta
      { id: 'd', created_at: '2026-11-13T08:00:00Z', oda_tesekkur_alkis: [] },
    ]
    expect(haftaninTesekkuru(l, '2026-11-13')?.id).toBe('b')
    expect(haftaninTesekkuru([l[3]!], '2026-11-13')).toBeNull()
  })
  it('Türkiye günü', () => {
    expect(trGun('2026-11-08T22:30:00Z')).toBe('2026-11-09')
  })
  it('yaklaşan doğum günleri, yıl dönümü dahil', () => {
    const l = [
      { id: 'a', ay: 11, gun: 13 },
      { id: 'b', ay: 11, gun: 19 },
      { id: 'c', ay: 11, gun: 25 },
      { id: 'd', ay: 1, gun: 2 },
    ]
    expect(yaklasanDogumGunleri(l, '2026-11-13').map((x) => [x.id, x.kalan])).toEqual([
      ['a', 0],
      ['b', 6],
    ])
    expect(yaklasanDogumGunleri(l, '2026-12-30').map((x) => x.id)).toEqual(['d'])
  })
})
