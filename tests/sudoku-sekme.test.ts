// 0088: Sudoku ayrılma sınırı ve kurallar onayı. Sınır yürürlükten önce yok; 6. ayrılışta oyun sona erer (bitmiş sayılmaz,
// skor tablosuna girmez); sayı geriye gitmez; sona eren oyunda ipucu ve bitiş reddedilir. Onay hesaba yazılır.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { service, signIn } from './helpers'

const svc = service()
let fen: SupabaseClient
let FEN: string
let ilk: string
let bugun: string
let tercih: { sudoku_kural: string | null } | null
type Durum = { sekme?: number; sinir?: number | null; sona_erdi?: boolean; bitti: string | null }
const yururluk = (gun: string) => svc.from('oda_icerik_surum').update({ baslangic: gun }).eq('ad', 'sudoku_sekme')
const temizle = () => svc.from('oda_oyun').delete().eq('user_id', FEN).eq('oyun', 'sudoku').eq('gun', bugun)
const kayit = async () =>
  (await svc.from('oda_oyun').select('bitti, puan, lig_disi, durum').eq('user_id', FEN).eq('oyun', 'sudoku').eq('gun', bugun).maybeSingle()).data
const sekme = async (n: number) => (await fen.rpc('oda_sudoku_sekme', { p_sayi: n })).data as { sekme: number; sinir: number | null; sona_erdi: boolean }

beforeAll(async () => {
  fen = await signIn('fen')
  FEN = (await svc.from('profiles').select('id').eq('email', 'fen@buluskure.k12.tr').single()).data!.id
  ilk = (await svc.from('oda_icerik_surum').select('baslangic').eq('ad', 'sudoku_sekme').single()).data!.baslangic
  bugun = (await svc.rpc('tr_today')).data as string
  tercih = (await svc.from('oda_oyun_tercih').select('sudoku_kural').eq('user_id', FEN).maybeSingle()).data
  await temizle()
})
afterAll(async () => {
  await yururluk(ilk)
  await temizle()
  if (tercih) await svc.from('oda_oyun_tercih').update({ sudoku_kural: tercih.sudoku_kural }).eq('user_id', FEN)
  else await svc.from('oda_oyun_tercih').delete().eq('user_id', FEN)
})

describe('Sudoku ayrılma sınırı', () => {
  it('yürürlükten önce sınır yok: sayı ne olursa olsun oyun sürer', async () => {
    await yururluk('2099-01-01')
    expect(((await fen.rpc('oda_sudoku_kural')).data as { sinir: number | null }).sinir).toBeNull()
    const d = (await fen.rpc('oda_sudoku_ac')).data as Durum
    expect(d).toMatchObject({ sinir: null, sona_erdi: false })
    expect(await sekme(20)).toMatchObject({ sona_erdi: false, sinir: null })
    expect((await kayit())!.lig_disi).toBe(false)
    await temizle()
  })

  it('kurallar onayı hesaba yazılır; kural sorgusu oyunu başlatmaz', async () => {
    await yururluk(bugun)
    await svc.from('oda_oyun_tercih').upsert({ user_id: FEN, sudoku_kural: null })
    const k = (await fen.rpc('oda_sudoku_kural')).data as { onay: boolean; sinir: number; alt_sure: number; ritim: number }
    expect(k).toMatchObject({ onay: false, sinir: 5, alt_sure: 240, ritim: 50 })
    expect(await kayit()).toBeNull()
    expect((await fen.rpc('oda_sudoku_kural_onayla')).error).toBeNull()
    const ilkOnay = (await svc.from('oda_oyun_tercih').select('sudoku_kural').eq('user_id', FEN).single()).data!.sudoku_kural
    expect(ilkOnay).toBeTruthy()
    await fen.rpc('oda_sudoku_kural_onayla')
    expect((await svc.from('oda_oyun_tercih').select('sudoku_kural').eq('user_id', FEN).single()).data!.sudoku_kural).toBe(ilkOnay)
    expect(((await fen.rpc('oda_sudoku_kural')).data as { onay: boolean }).onay).toBe(true)
  })

  it('5 ayrılışa kadar sürer, sayı geriye gitmez; 6.da sona erer; ipucu ve bitiş reddedilir; skor tablosuna girmez', async () => {
    await yururluk(bugun)
    await temizle()
    expect((await fen.rpc('oda_sudoku_ac')).data).toMatchObject({ sekme: 0, sinir: 5, sona_erdi: false })
    expect(await sekme(3)).toMatchObject({ sekme: 3, sona_erdi: false })
    expect(await sekme(1)).toMatchObject({ sekme: 3, sona_erdi: false })
    expect(await sekme(5)).toMatchObject({ sekme: 5, sona_erdi: false })
    expect(await sekme(6)).toMatchObject({ sekme: 6, sona_erdi: true })
    const d = (await fen.rpc('oda_sudoku_ac')).data as Durum & { cozum: unknown }
    expect(d).toMatchObject({ sona_erdi: true, bitti: null, cozum: null, sekme: 6 })
    expect((await fen.rpc('oda_sudoku_ipucu', { p_hucre: null, p_giris: null })).error?.message).toBe('Bugünkü Sudoku sona erdi')
    expect((await fen.rpc('oda_sudoku_tamamla', { p: Array(81).fill(1), p_hamle: null, p_sekme: 0 })).data).toEqual({ dogru: false, sona_erdi: true })
    const k = (await kayit())!
    expect(k).toMatchObject({ bitti: null, puan: null, lig_disi: true })
    expect((k.durum as { neden: string }).neden).toBe('sekme')
    const tablo = (await fen.rpc('oda_skor_tablosu', { p_oyun: 'sudoku', p_donem: 'gun' })).data as { ben: boolean }[]
    expect(tablo.some((x) => x.ben)).toBe(false)
  })

  it('bitişte gelen ayrılma sayısı sınırı aşarsa çözüm kabul edilmez; iç fonksiyon kapalı', async () => {
    await yururluk(bugun)
    await temizle()
    await fen.rpc('oda_sudoku_ac')
    expect((await fen.rpc('oda_sudoku_tamamla', { p: Array(81).fill(1), p_hamle: null, p_sekme: 5 })).data).toEqual({ dogru: false })
    expect((await fen.rpc('oda_sudoku_tamamla', { p: Array(81).fill(1), p_hamle: null, p_sekme: 7 })).data).toEqual({ dogru: false, sona_erdi: true })
    expect((await fen.rpc('oda_sudoku_sekme_sinir', { g: bugun })).error).not.toBeNull()
  })
})
