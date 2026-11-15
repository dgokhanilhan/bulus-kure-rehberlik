import { describe, expect, it } from 'vitest'
import { haftaBasi, haftalikOzet, hazirlikKararlari, ozetBosMu, sonDenemeler, type Karar } from './haftalik'

const gorev = (topic: string, p: Partial<{ due_date: string; parent_visible: boolean; created_at: string; completed_at: string | null }> = {}) => ({
  topic,
  due_date: p.due_date ?? '2026-11-20',
  parent_visible: p.parent_visible ?? true,
  created_at: p.created_at ?? '2026-11-01T09:00:00Z',
  completed_at: p.completed_at ?? null,
})

describe('haftaBasi', () => {
  it('haftanın pazartesisini verir', () => {
    expect(haftaBasi('2026-11-15')).toBe('2026-11-09') // pazar
    expect(haftaBasi('2026-11-09')).toBe('2026-11-09') // pazartesi
    expect(haftaBasi('2026-11-12')).toBe('2026-11-09')
  })
})

describe('haftalikOzet', () => {
  const bugun = '2026-11-13' // cuma; hafta 9–15 Kasım
  it('yalnız bu haftanın denemelerini alır; fark bir önceki denemeye göre', () => {
    const o = haftalikOzet({
      bugun,
      denemeler: [
        { ad: 'D1', tarih: '2026-11-02', net: 50 },
        { ad: 'D2', tarih: '2026-11-10', net: 55.333 },
      ],
      gorevler: [],
      yoklama: null,
    })
    expect(o.bas).toBe('2026-11-09')
    expect(o.bit).toBe('2026-11-15')
    expect(o.denemeler).toEqual([{ ad: 'D2', tarih: '2026-11-10', net: 55.33, fark: 5.33 }])
    expect(o.devamsizlik).toBeNull()
  })
  it('ilk denemenin farkı yok (uydurma yok)', () => {
    const o = haftalikOzet({ bugun, denemeler: [{ ad: 'D1', tarih: '2026-11-11', net: 40 }], gorevler: [], yoklama: null })
    expect(o.denemeler[0]!.fark).toBeNull()
  })
  it('veliye kapalı görevler özete girmez; tamamlanan, yeni ve süresi geçenler sayılır', () => {
    const o = haftalikOzet({
      bugun,
      denemeler: [],
      gorevler: [
        gorev('Paragraf', { completed_at: '2026-11-10T15:00:00Z' }),
        gorev('Gizli', { parent_visible: false, completed_at: '2026-11-10T15:00:00Z' }),
        gorev('Üslü', { due_date: '2026-11-11' }),
        gorev('Kesir', { created_at: '2026-11-12T08:00:00Z' }),
        gorev('Eski', { completed_at: '2026-11-03T08:00:00Z' }),
      ],
      yoklama: null,
    })
    expect(o.gorev).toEqual({ tamamlanan: ['Paragraf'], tamamSayi: 1, yeni: 1, geciken: 1, acik: 2 })
  })
  it('pazar gecesi Türkiye saatiyle tamamlanan görev o haftaya sayılır', () => {
    // 15 Kasım 22:30 TR = 19:30 UTC; 15 Kasım 23:30 TR'den sonrası (ertesi pazartesi) sayılmaz
    const o = haftalikOzet({
      bugun,
      denemeler: [],
      gorevler: [gorev('A', { completed_at: '2026-11-15T19:30:00Z' }), gorev('B', { completed_at: '2026-11-15T21:30:00Z' })],
      yoklama: null,
    })
    expect(o.gorev.tamamlanan).toEqual(['A'])
  })
  it('devamsızlık yalnız bu hafta için sayılır', () => {
    const o = haftalikOzet({
      bugun,
      denemeler: [],
      gorevler: [],
      yoklama: [
        { day: '2026-11-10', status: 'devamsiz' },
        { day: '2026-11-11', status: 'gec' },
        { day: '2026-11-02', status: 'devamsiz' },
      ],
    })
    expect(o.devamsizlik).toEqual({ gelmedi: 1, gec: 1, izinli: 0, raporlu: 0 })
  })
  it('boş hafta algılanır', () => {
    expect(ozetBosMu(haftalikOzet({ bugun, denemeler: [], gorevler: [], yoklama: [] }))).toBe(true)
    expect(ozetBosMu(haftalikOzet({ bugun, denemeler: [], gorevler: [gorev('X')], yoklama: [] }))).toBe(false)
  })
})

describe('görüşme hazırlığı', () => {
  it('son 3 deneme ve farkları', () => {
    const d = [10, 12, 11, 15].map((net, i) => ({ ad: `D${i + 1}`, tarih: `2026-10-0${i + 1}`, net }))
    expect(sonDenemeler(d).map((x) => [x.ad, x.fark])).toEqual([
      ['D2', 2],
      ['D3', -1],
      ['D4', 4],
    ])
    expect(sonDenemeler(d.slice(0, 1))[0]!.fark).toBeNull()
  })
  it('açık kararlar eskiden yeniye, kontrol edilenler son kontrol önce', () => {
    const k = (id: string, durum: Karar['durum'], created_at: string, kontrol_at: string | null = null): Karar => ({
      id,
      student_id: 's',
      meeting_id: null,
      metin: id,
      durum,
      task_id: null,
      kontrol_at,
      created_at,
    })
    const r = hazirlikKararlari([
      k('b', 'acik', '2026-11-05'),
      k('a', 'acik', '2026-11-01'),
      k('x', 'yapildi', '2026-10-01', '2026-11-02'),
      k('y', 'yapilmadi', '2026-10-01', '2026-11-04'),
    ])
    expect(r.acik.map((x) => x.id)).toEqual(['a', 'b'])
    expect(r.kontrol.map((x) => x.id)).toEqual(['y', 'x'])
  })
})
