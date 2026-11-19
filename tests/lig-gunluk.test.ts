// 0089: Haftalık lig günlük toplamla hesaplanır (her gün her oyun ayrı sıralanır). Yürürlükten önceki haftalar eski kuralla kalır;
// kürsü aynı kuralı kullanır; oyun kayıtları değişmez; "bugun" yalnız bugünkü günlük puandır.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { service, signIn } from './helpers'

const svc = service()
const ESKI = '2025-01-27' // pazartesi, eski kural
const YENI = '2025-02-03' // pazartesi, yeni kural (yürürlük bu güne çekilir)
const gun = (h: string, n: number) => new Date(Date.parse(`${h}T12:00:00Z`) + n * 86400_000).toISOString().slice(0, 10)
let mat: SupabaseClient
let fen: SupabaseClient
let M: string, R: string, F: string, OKUL: string
let ilk: string
type Lig = { user_id: string; puan: number; oyun_sayisi: number; bugun: number; ben: boolean; sira: number }

const temizle = async () => {
  await svc.from('oda_lig_kursu').delete().in('hafta', [ESKI, YENI])
  await svc.from('oda_oyun').delete().gte('gun', ESKI).lte('gun', gun(YENI, 6))
}

beforeAll(async () => {
  ;[mat, fen] = await Promise.all([signIn('matematik'), signIn('fen')])
  const { data } = await svc
    .from('profiles')
    .select('id, email, school_id')
    .in('email', ['rehber@buluskure.k12.tr', 'matematik@buluskure.k12.tr', 'fen@buluskure.k12.tr'])
  const id = Object.fromEntries(data!.map((p) => [p.email, p.id]))
  M = id['matematik@buluskure.k12.tr']!
  R = id['rehber@buluskure.k12.tr']!
  F = id['fen@buluskure.k12.tr']!
  OKUL = data![0]!.school_id
  ilk = (await svc.from('oda_icerik_surum').select('baslangic').eq('ad', 'lig_gunluk').single()).data!.baslangic
  await svc.from('oda_icerik_surum').update({ baslangic: YENI }).eq('ad', 'lig_gunluk')
  await temizle()
  const satir = (user_id: string, oyun: string, g: string, puan: number, boyut: number | null = null) => ({
    school_id: OKUL,
    user_id,
    oyun,
    gun: g,
    puan,
    boyut,
    bitti: `${g}T10:00:00Z`,
  })
  // Her iki haftada aynı oyunlar: 1. gün Sudoku M 300 / R 400 ve F'nin 6×6 bulmacası; 2. gün Sudoku R 300 / M 400, Kelime M 2
  const hafta = (h: string) => [
    satir(M, 'sudoku', h, 300),
    satir(R, 'sudoku', h, 400),
    satir(F, 'bulmaca', h, 100, 6),
    satir(R, 'sudoku', gun(h, 1), 300),
    satir(M, 'sudoku', gun(h, 1), 400),
    satir(M, 'kelime', gun(h, 1), 2),
  ]
  expect((await svc.from('oda_oyun').insert([...hafta(ESKI), ...hafta(YENI)])).error).toBeNull()
})
afterAll(async () => {
  await svc.from('oda_icerik_surum').update({ baslangic: ilk }).eq('ad', 'lig_gunluk')
  await temizle()
  await svc
    .from('oda_oyun')
    .delete()
    .eq('user_id', F)
    .eq('oyun', 'kelime')
    .eq('gun', (await svc.rpc('tr_today')).data as string)
})

const puanlar = (l: Lig[]) => Object.fromEntries(l.map((r) => [r.user_id, [r.puan, r.oyun_sayisi]]))

describe('günlük toplam lig', () => {
  it('yeni haftada her gün ayrı sıralanır ve toplanır; büyük bulmaca o günün sıralamasına girer', async () => {
    const l = (await mat.rpc('oda_lig', { p_hafta_basi: YENI })).data as Lig[]
    // M: 10 (1. gün Sudoku) + 8 (2. gün Sudoku) + 10 (Kelime) = 28 · R: 8 + 10 = 18 · F: 10 (bulmaca)
    expect(puanlar(l)).toEqual({ [M]: [28, 3], [R]: [18, 2], [F]: [10, 1] })
    expect(l.map((r) => r.sira)).toEqual([1, 2, 3])
    expect(l.find((r) => r.ben)!.user_id).toBe(M)
    expect(l.every((r) => r.bugun === 0)).toBe(true) // geçmiş hafta: bugün puanı yok
  })

  it('yürürlükten önceki hafta eski kuralla kalır (haftanın en iyisi; büyük bulmaca sayılmaz)', async () => {
    const l = (await mat.rpc('oda_lig', { p_hafta_basi: ESKI })).data as Lig[]
    // Sudoku en iyiler M 300 ve R 300 → ikisi de 10; Kelime M 10
    expect(puanlar(l)).toEqual({ [M]: [20, 2], [R]: [10, 1] })
  })

  it('kürsü aynı kuralı kullanır; oyun kayıtları değişmez', async () => {
    const once = (await svc.from('oda_oyun').select('id, user_id, oyun, gun, puan, bitti').order('id')).data
    expect((await svc.rpc('oda_lig_kursu_yaz', { p_hafta: YENI, p_bildir: false })).data).toBe(3)
    expect((await svc.rpc('oda_lig_kursu_yaz', { p_hafta: ESKI, p_bildir: false })).data).toBe(2)
    const k = (await svc.from('oda_lig_kursu').select('hafta, user_id, sira, puan').in('hafta', [ESKI, YENI]).order('hafta').order('sira')).data
    expect(k).toEqual([
      { hafta: ESKI, user_id: M, sira: 1, puan: 20 },
      { hafta: ESKI, user_id: R, sira: 2, puan: 10 },
      { hafta: YENI, user_id: M, sira: 1, puan: 28 },
      { hafta: YENI, user_id: R, sira: 2, puan: 18 },
      { hafta: YENI, user_id: F, sira: 3, puan: 10 },
    ])
    expect((await svc.from('oda_oyun').select('id, user_id, oyun, gun, puan, bitti').order('id')).data).toEqual(once)
  })

  it('bu hafta: bugünkü günlük puan ayrı döner', async () => {
    await svc.from('oda_icerik_surum').update({ baslangic: ilk }).eq('ad', 'lig_gunluk')
    const bugun = (await svc.rpc('tr_today')).data as string
    await svc.from('oda_oyun').delete().eq('user_id', F).eq('oyun', 'kelime').eq('gun', bugun)
    expect(
      (await svc.from('oda_oyun').insert({ school_id: OKUL, user_id: F, oyun: 'kelime', gun: bugun, puan: 1, bitti: new Date().toISOString() })).error,
    ).toBeNull()
    const ben = ((await fen.rpc('oda_lig')).data as Lig[]).find((r) => r.ben)!
    expect(ben.bugun).toBeGreaterThanOrEqual(2)
    expect(ben.bugun).toBeLessThanOrEqual(ben.puan)
  })
})
