// 0085: Günün Şehri 6 ipucu (her yanlış tahminde bir yenisi) ve 5 Soruda Bugün geniş havuz.
// Yürürlük gününden önceki günler eski düzeni korur; skorlar ve oyun satırları değişmez.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { service, signIn, inDays } from './helpers'

const svc = service()
let fen: SupabaseClient
let FEN: string
let ilk: { ad: string; baslangic: string }[] = []
const bugun = async () => (await svc.rpc('tr_today')).data as string
const yururluk = (ad: string, gun: string) => svc.from('oda_icerik_surum').update({ baslangic: gun }).eq('ad', ad)
const temizle = () => svc.from('oda_oyun').delete().eq('user_id', FEN).in('oyun', ['sehir', 'soru'])
const kucuk = (s: string) => s.toLocaleLowerCase('tr')

beforeAll(async () => {
  fen = await signIn('fen')
  FEN = (await svc.from('profiles').select('id').eq('email', 'fen@buluskure.k12.tr').single()).data!.id
  ilk = (await svc.from('oda_icerik_surum').select('ad, baslangic')).data!
  await temizle()
})
afterAll(async () => {
  for (const r of ilk) await yururluk(r.ad, r.baslangic)
  await temizle()
})

describe('içerik', () => {
  it('81 ilin her birinde 6 farklı ipucu var; il adı ipucunda geçmez', async () => {
    const iller = (await svc.from('oda_sehir').select('plaka, ad, ipuclari, ipuclari6')).data!
    expect(iller).toHaveLength(81)
    for (const il of iller) {
      const ip = il.ipuclari6 as string[]
      expect(ip).toHaveLength(6)
      expect(new Set(ip).size).toBe(6)
      for (const x of ip) expect(kucuk(x)).not.toContain(kucuk(il.ad as string))
      expect(il.ipuclari).toHaveLength(3) // eski ipuçları eski günler için yerinde
    }
  })
  it('genel soru havuzu 400+; her soruda 4 farklı seçenek, soru metinleri tekil', async () => {
    const s = (await svc.from('oda_soru').select('soru, secenekler, dogru, havuz').is('ay', null).limit(2000)).data!
    expect(s.length).toBeGreaterThanOrEqual(400)
    expect(s.filter((x) => x.havuz === 1)).toHaveLength(116)
    expect(new Set(s.map((x) => x.soru)).size).toBe(s.length)
    for (const x of s) {
      expect(new Set(x.secenekler as string[]).size).toBe(4)
      expect(x.dogru).toBeGreaterThanOrEqual(1)
      expect(x.dogru).toBeLessThanOrEqual(4)
    }
  })
})

describe('Günün Şehri', () => {
  type D = { ipuclari: string[]; ipucu_toplam: number; cevap: string | null; puan: number | null }
  it('yürürlükten önce: eski 3 ipucu, her iki tahminde bir', async () => {
    const g = await bugun()
    await yururluk('sehir6', inDays(1))
    await temizle()
    const d = (await fen.rpc('oda_sehir_ac')).data as D
    expect(d.ipucu_toplam).toBe(3)
    expect(d.ipuclari).toHaveLength(1)
    const hedef = (await svc.rpc('oda_sehir_gunun', { g })).data as number
    const eski = (await svc.from('oda_sehir').select('ipuclari').eq('plaka', hedef).single()).data!.ipuclari as string[]
    expect(d.ipuclari).toEqual(eski.slice(0, 1))
    const yanlis = hedef === 1 ? 2 : 1
    expect(((await fen.rpc('oda_sehir_tahmin', { p: yanlis })).data as D).ipuclari).toHaveLength(1)
  })

  it('yürürlükte: ilk ipucu açık, her yanlış tahminde bir yenisi; bulununca 6 ipucu ve cevap', async () => {
    const g = await bugun()
    await yururluk('sehir6', g)
    await temizle()
    const hedef = (await svc.rpc('oda_sehir_gunun', { g })).data as number
    const ip6 = (await svc.from('oda_sehir').select('ipuclari6').eq('plaka', hedef).single()).data!.ipuclari6 as string[]
    const d0 = (await fen.rpc('oda_sehir_ac')).data as D
    expect(d0.ipucu_toplam).toBe(6)
    expect(d0.ipuclari).toEqual(ip6.slice(0, 1))
    const yanlislar = [1, 2, 3, 4].filter((p) => p !== hedef).slice(0, 3)
    for (const [k, p] of yanlislar.entries()) {
      const d = (await fen.rpc('oda_sehir_tahmin', { p })).data as D
      expect(d.ipuclari).toEqual(ip6.slice(0, k + 2))
      expect(d.cevap).toBeNull()
    }
    const son = (await fen.rpc('oda_sehir_tahmin', { p: hedef })).data as D
    expect(son.ipuclari).toEqual(ip6)
    expect(son.puan).toBe(4)
    expect(son.cevap).not.toBeNull()
  })
})

describe('5 Soruda Bugün', () => {
  const gunun = async (g: string) => (await svc.rpc('oda_soru_gunun', { g })).data as number[]
  it('yürürlükten önceki günler yalnız ilk havuzdan; sonrası iki havuz, 98 gün boyunca soru tekrarı yok', async () => {
    await yururluk('soru2', inDays(1))
    const havuz = new Map(((await svc.from('oda_soru').select('id, havuz, ay').limit(2000)).data ?? []).map((x) => [x.id as number, x]))
    for (let i = -20; i <= 0; i++) for (const id of await gunun(inDays(i))) expect(havuz.get(id)!.havuz).toBe(1)
    const gorulen: number[] = []
    for (let i = 1; i <= 98; i++) {
      const ids = await gunun(inDays(i))
      expect(ids).toHaveLength(5)
      gorulen.push(...ids.filter((id) => havuz.get(id)!.ay == null))
    }
    expect(new Set(gorulen).size).toBe(gorulen.length)
    expect(gorulen.some((id) => havuz.get(id)!.havuz === 2)).toBe(true)
  })
})
