import { describe, expect, it } from 'vitest'
import { aileGruplari } from './hedef'

describe('aile okul ekle grupları', () => {
  const l = [
    { id: 'a', taban_puan: 470 },
    { id: 'b', taban_puan: 455 },
    { id: 'c', taban_puan: 400 },
    { id: 'd', taban_puan: 445 },
    { id: 'e', taban_puan: null },
  ]
  it('puana göre üç grup, tabanı olmayan dışarıda', () => {
    const g = aileGruplari(l, 450)
    expect(g.yakin.map((x) => x.id)).toEqual(['b', 'd'])
    expect(g.calis.map((x) => x.id)).toEqual(['a'])
    expect(g.rahat.map((x) => x.id)).toEqual(['c'])
  })
})
