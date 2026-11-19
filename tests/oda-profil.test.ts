// 0090: Ligde isme tıklanınca açılan profil kartı. Öğretmenler birbirini görür; adını gizleyen başkasına görünmez; veli ve öğrenci
// hiçbir şey göremez; günlük puanların toplamı lig puanına eşittir; kayıtlar değişmez.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { service, signIn, ELIF } from './helpers'

const svc = service()
let mat: SupabaseClient, fen: SupabaseClient, veli: SupabaseClient, elif: SupabaseClient
let M: string, F: string, OKUL: string, bugun: string
type Profil = {
  ad: string
  ben: boolean
  lig: { sira: number; puan: number; bugun: number } | null
  gunler: { gun: string; puan: number }[]
  tavan: number
  bugun: { oyun: string; puan: number }[]
  kursu: { sayi: number }
  ist: { toplam: number; gunler: string[] }
}
const temizle = () => svc.from('oda_oyun').delete().in('user_id', [M, F]).eq('gun', bugun)
const gizle = (v: boolean) => svc.from('oda_oyun_tercih').upsert({ user_id: F, gizli: v })

beforeAll(async () => {
  ;[mat, fen, veli, elif] = await Promise.all([signIn('matematik'), signIn('fen'), signIn('veliElif'), signIn('elif')])
  const { data } = await svc.from('profiles').select('id, email, school_id').in('email', ['matematik@buluskure.k12.tr', 'fen@buluskure.k12.tr'])
  const id = Object.fromEntries(data!.map((p) => [p.email, p.id]))
  M = id['matematik@buluskure.k12.tr']!
  F = id['fen@buluskure.k12.tr']!
  OKUL = data![0]!.school_id
  bugun = (await svc.rpc('tr_today')).data as string
  await temizle()
  await gizle(false)
  const satir = (user_id: string, oyun: string, puan: number) => ({ school_id: OKUL, user_id, oyun, gun: bugun, puan, bitti: new Date().toISOString() })
  expect((await svc.from('oda_oyun').insert([satir(M, 'kelime', 2), satir(M, 'sudoku', 400), satir(F, 'kelime', 3)])).error).toBeNull()
})
afterAll(async () => {
  await gizle(false)
  await temizle()
})

describe('oda profil kartı', () => {
  it('öğretmen başka öğretmenin profilini görür; günlük puanların toplamı lig puanı; bugünkü sonuçlar', async () => {
    const p = (await fen.rpc('oda_profil', { p_user: M })).data as Profil
    expect(p.ad).toBeTruthy()
    expect(p.ben).toBe(false)
    expect(p.tavan).toBeGreaterThanOrEqual(20)
    const lig = ((await fen.rpc('oda_lig')).data as { user_id: string; puan: number; bugun: number }[]).find((r) => r.user_id === M)!
    expect(p.lig!.puan).toBe(lig.puan)
    expect(p.lig!.bugun).toBe(lig.bugun)
    expect(p.gunler.reduce((a, g) => a + g.puan, 0)).toBe(lig.puan)
    // Bugün: Kelime 1. (10) + Sudoku 1. (10)
    expect(p.gunler.find((g) => g.gun === bugun)?.puan).toBe(20)
    expect(p.bugun).toEqual(
      expect.arrayContaining([
        { oyun: 'kelime', puan: 2 },
        { oyun: 'sudoku', puan: 400 },
      ]),
    )
    expect(p.ist.toplam).toBeGreaterThanOrEqual(2)
    expect(p.ist.gunler).toContain(bugun)
    expect((await mat.rpc('oda_profil', { p_user: M })).data).toMatchObject({ ben: true })
  })

  it('adını gizleyen öğretmen başkasına görünmez, kendisine görünür', async () => {
    await gizle(true)
    expect((await mat.rpc('oda_profil', { p_user: F })).data).toBeNull()
    expect((await fen.rpc('oda_profil', { p_user: F })).data).toMatchObject({ ben: true })
    await gizle(false)
    expect((await mat.rpc('oda_profil', { p_user: F })).data).toMatchObject({ ben: false })
  })

  it('veli ve öğrenci hiçbir profili göremez; öğrenci profili açılmaz; kayıtlar değişmez', async () => {
    const once = (await svc.from('oda_oyun').select('id, puan, bitti').order('id')).data
    for (const c of [veli, elif]) expect((await c.rpc('oda_profil', { p_user: M })).data).toBeNull()
    expect((await mat.rpc('oda_profil', { p_user: ELIF })).data).toBeNull()
    expect((await mat.rpc('oda_lig_gun_puanlari', { p_hafta: bugun })).error).not.toBeNull()
    expect((await svc.from('oda_oyun').select('id, puan, bitti').order('id')).data).toEqual(once)
  })
})
