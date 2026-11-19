// 0087: 5 Soruda Bugün'de 1 dakika. Süre "Başla"da başlar, sunucuda ölçülür; dolunca cevap alınmaz, o ana kadarki doğrular kaydedilir.
// Yürürlükten önceki günler süresiz kalır.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { service, signIn } from './helpers'

const svc = service()
let fen: SupabaseClient
let FEN: string
let OKUL: string
let ilk: string
let bugun: string
type Durum = {
  baslamadi?: boolean
  sure?: number
  kalan?: number | null
  bitti: string | null
  puan: number | null
  sure_doldu?: boolean
  sorular: { cevap: number | null; dogru: number | null }[]
}
const yururluk = (gun: string) => svc.from('oda_icerik_surum').update({ baslangic: gun }).eq('ad', 'soru_sure')
const temizle = () => svc.from('oda_oyun').delete().eq('user_id', FEN).eq('oyun', 'soru')
const kayit = async () => (await svc.from('oda_oyun').select('puan, bitti, basladi').eq('user_id', FEN).eq('oyun', 'soru').eq('gun', bugun).maybeSingle()).data

beforeAll(async () => {
  fen = await signIn('fen')
  const p = (await svc.from('profiles').select('id, school_id').eq('email', 'fen@buluskure.k12.tr').single()).data!
  FEN = p.id
  OKUL = p.school_id
  ilk = (await svc.from('oda_icerik_surum').select('baslangic').eq('ad', 'soru_sure').single()).data!.baslangic
  bugun = (await svc.rpc('tr_today')).data as string
  await temizle()
})
afterAll(async () => {
  await yururluk(ilk)
  await temizle()
})

describe('5 Soruda Bugün süresi', () => {
  it('yürürlükten önce süre yok; bakmak oyunu başlatmaz', async () => {
    await yururluk('2099-01-01')
    const d = (await fen.rpc('oda_soru_bak')).data as Durum
    expect(d).toMatchObject({ baslamadi: true, sure: null })
    expect(await kayit()).toBeNull()
    const a = (await fen.rpc('oda_soru_ac')).data as Durum
    expect(a.sure).toBeUndefined()
    expect(a.kalan).toBeUndefined()
    await temizle()
  })

  it('süreli gün: Başla ile süre başlar, cevaplar kaydedilir; süre dolunca cevap alınmaz, doğrular puan olur', async () => {
    await yururluk(bugun)
    const b = (await fen.rpc('oda_soru_bak')).data as Durum
    expect(b).toMatchObject({ baslamadi: true, sure: 60 })
    expect(await kayit()).toBeNull()

    const a = (await fen.rpc('oda_soru_ac')).data as Durum
    expect(a.kalan).toBeGreaterThanOrEqual(55)
    expect(a.kalan).toBeLessThanOrEqual(60)
    expect(a.sorular.every((s) => s.dogru == null)).toBe(true)

    const ids = (await svc.rpc('oda_soru_gunun', { g: bugun })).data as number[]
    const dogru1 = (await svc.from('oda_soru').select('dogru').eq('id', ids[0]!).single()).data!.dogru as number
    const c1 = (await fen.rpc('oda_soru_cevap', { p: dogru1 })).data as Durum
    expect(c1.sorular[0]).toMatchObject({ cevap: dogru1, dogru: dogru1 })
    expect(c1.bitti).toBeNull()

    // Süreyi geçmişe al: sonraki cevap sayılmaz, oyun 1 doğruyla biter
    const basladi = new Date(Date.now() - 61_000).toISOString()
    await svc.from('oda_oyun').update({ basladi }).eq('user_id', FEN).eq('oyun', 'soru').eq('gun', bugun)
    const gec = (await fen.rpc('oda_soru_cevap', { p: 1 })).data as Durum
    expect(gec).toMatchObject({ sure_doldu: true, puan: 1, kalan: null })
    expect(gec.sorular.filter((s) => s.cevap != null)).toHaveLength(1)
    expect(gec.sorular.every((s) => s.dogru != null)).toBe(true)
    const k = (await kayit())!
    expect(k.puan).toBe(1)
    expect(new Date(k.bitti!).getTime() - new Date(k.basladi).getTime()).toBe(60_000)
    // Bittikten sonra cevap durumu değiştirmez; skor tablosunda görünür
    expect(((await fen.rpc('oda_soru_cevap', { p: 2 })).data as Durum).puan).toBe(1)
    const tablo = (await fen.rpc('oda_skor_tablosu', { p_oyun: 'soru', p_donem: 'gun' })).data as { ben: boolean; puan: number }[]
    expect(tablo.find((x) => x.ben)?.puan).toBe(1)
  })

  it('açıp gidenin oyunu zamanlanmış işle 0 doğruyla kapanır; iç fonksiyonlar kapalı', async () => {
    await yururluk(bugun)
    await temizle()
    await svc.from('oda_oyun').insert({
      school_id: OKUL,
      user_id: FEN,
      oyun: 'soru',
      gun: bugun,
      durum: { cevaplar: [] },
      basladi: new Date(Date.now() - 5 * 60_000).toISOString(),
    })
    expect((await fen.rpc('oda_soru_sure_kapat')).error).not.toBeNull()
    expect((await svc.rpc('oda_soru_sure_kapat')).data).toBeGreaterThanOrEqual(1)
    expect(await kayit()).toMatchObject({ puan: 0 })
    expect((await fen.rpc('oda_soru_sure', { g: bugun })).error).not.toBeNull()
  })
})
