// 0086: Mini Bulmaca 6×6 / 7×7. Takvim, veri bütünlüğü (her kesişim), 5×5 günlerin yanıtı ve haftalık sıralamada yalnız 5×5.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { service, signIn, inDays } from './helpers'

const svc = service()
let fen: SupabaseClient
let FEN: string
let OKUL: string
let ilk: string
const yururluk = (gun: string) => svc.from('oda_icerik_surum').update({ baslangic: gun }).eq('ad', 'bulmaca2')
const temizle = () => svc.from('oda_oyun').delete().eq('user_id', FEN).eq('oyun', 'bulmaca')
const boyut = async (g: string) => (await svc.rpc('oda_bulmaca_boyut', { g })).data as number
const gunAdi = (g: string) => new Date(`${g}T12:00:00Z`).getUTCDay() // 0 pazar … 3 çarşamba, 5 cuma

beforeAll(async () => {
  fen = await signIn('fen')
  const p = (await svc.from('profiles').select('id, school_id').eq('email', 'fen@buluskure.k12.tr').single()).data!
  FEN = p.id
  OKUL = p.school_id
  ilk = (await svc.from('oda_icerik_surum').select('baslangic').eq('ad', 'bulmaca2').single()).data!.baslangic
  await temizle()
})
afterAll(async () => {
  await yururluk(ilk)
  await temizle()
})

describe('büyük bulmaca verisi', () => {
  it('30 adet 6×6, 13 adet 7×7; kelime uzunlukları ve her kesişim tutuyor; kelimeler ipucunda geçmiyor', async () => {
    const b = (await svc.from('oda_bulmaca_buyuk').select('*')).data!
    expect(b.filter((x) => x.boyut === 6)).toHaveLength(30)
    expect(b.filter((x) => x.boyut === 7)).toHaveLength(13)
    for (const x of b) {
      const y = x.yatay as string[]
      const d = x.dusey as string[]
      for (const w of [...y, ...d]) expect([...w]).toHaveLength(x.boyut)
      ;(x.satirlar as number[]).forEach((r, i) => (x.sutunlar as number[]).forEach((c, j) => expect([...y[i]!][c]).toBe([...d[j]!][r])))
      expect(new Set([...y, ...d]).size).toBe(6)
      ;[...(x.yatay_ipucu as string[]), ...(x.dusey_ipucu as string[])].forEach((ip, k) => expect(ip.toLocaleLowerCase('tr')).not.toContain([...y, ...d][k]!))
    }
  })
})

describe('takvim', () => {
  it('yürürlükten önce hep 5×5; sonra çarşamba 6×6, diğer günler (ayın son cuması dahil) 5×5; 7×7 hiç çıkmaz (0087)', async () => {
    await yururluk(inDays(1))
    for (let i = -30; i <= 0; i++) expect(await boyut(inDays(i))).toBe(5)
    let alti = 0
    for (let i = 1; i <= 70; i++) {
      const g = inDays(i)
      const b = await boyut(g)
      expect(b, g).toBe(gunAdi(g) === 3 ? 6 : 5)
      if (b === 6) alti++
    }
    expect(alti).toBeGreaterThanOrEqual(9)
  })
})

describe('oyun', () => {
  it('5×5 günde yanıt boyut ve satır/sütun bilgisini taşır; çözüm aynı', async () => {
    await yururluk(inDays(1))
    await temizle()
    const d = (await fen.rpc('oda_bulmaca_ac')).data as { boyut: number; satirlar: number[]; sutunlar: number[]; yatay: string[]; cozum: unknown }
    expect(d).toMatchObject({ boyut: 5, satirlar: [0, 2, 4], sutunlar: [0, 2, 4], cozum: null })
    expect(d.yatay).toHaveLength(3)
    expect((await fen.rpc('oda_bulmaca_bitir', { p: ['aaaaaa'] })).error?.message).toBe('Bulmaca eksik')
  })
  it('haftalık tablo büyük bulmaca süresini saymaz, günlük tablo sayar', async () => {
    const bugun = (await svc.rpc('tr_today')).data as string
    await temizle()
    await svc.from('oda_oyun').insert({ school_id: OKUL, user_id: FEN, oyun: 'bulmaca', gun: bugun, puan: 3, bitti: new Date().toISOString(), boyut: 6 })
    const gun = (await fen.rpc('oda_skor_tablosu', { p_oyun: 'bulmaca', p_donem: 'gun' })).data as { ben: boolean; puan: number }[]
    expect(gun.find((x) => x.ben)?.puan).toBe(3)
    const hafta = (await fen.rpc('oda_skor_tablosu', { p_oyun: 'bulmaca', p_donem: 'hafta' })).data as { ben: boolean }[]
    expect(hafta.some((x) => x.ben)).toBe(false)
    const lig = (await fen.rpc('oda_lig')).data as { user_id: string }[]
    expect(lig.some((x) => x.user_id === FEN)).toBe(false)
  })
})
