// 0084: Sudoku ipucu (günde 3, +30 sn, çözüm tarayıcıya gitmez) ve hile önlemleri (alt süre, hamle ritmi).
// Lig dışı çözüm yalnız o günün Sudoku sonucunu tablodan/ligden çıkarır; diğer oyunlar sayılır. Eski satırlar aynen kalır.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { service, signIn } from './helpers'

const svc = service()
let fen: SupabaseClient, mat: SupabaseClient, veli: SupabaseClient
let FEN: string, OKUL: string
const bugun = async () => (await svc.rpc('tr_today')).data as string
const cozum = async () => (await svc.rpc('oda_sudoku_uret', { g: await bugun() })).data as { cozum: number[]; ipucu: number[] }
const temizle = async () => {
  await svc.from('oda_oyun').delete().eq('user_id', FEN)
  await svc.from('school_settings').delete().in('key', ['oda.sudoku_alt_sure', 'oda.sudoku_ritim'])
}
// Sudoku'yu "n saniye önce açılmış" gibi göster (süre sunucuda ölçülür)
const geriAl = async (sn: number) => {
  await svc
    .from('oda_oyun')
    .update({ basladi: new Date(Date.now() - sn * 1000).toISOString() })
    .eq('user_id', FEN)
    .eq('oyun', 'sudoku')
}
beforeAll(async () => {
  ;[fen, mat, veli] = await Promise.all([signIn('fen'), signIn('matematik'), signIn('veliElif')])
  const { data } = await svc.from('profiles').select('id, school_id').eq('email', 'fen@buluskure.k12.tr').single()
  FEN = data!.id
  OKUL = data!.school_id
})
beforeEach(temizle)
afterAll(temizle)

describe('Sudoku ipucu', () => {
  it('3 hak; her ipucu tek hücre ve doğru; çözüm gitmez; +30 sn puana eklenir', async () => {
    const ac = (await fen.rpc('oda_sudoku_ac')).data as { cozum: number[] | null; ipucu_hak: number; ipuclari: unknown[] }
    expect(ac.cozum).toBeNull()
    expect(ac.ipucu_hak).toBe(3)
    expect(ac.ipuclari).toEqual([])
    const { cozum: c, ipucu } = await cozum()
    const bos = ipucu.findIndex((x) => x === 0)
    const r1 = (await fen.rpc('oda_sudoku_ipucu', { p_hucre: bos, p_giris: ipucu })).data as { hucre: number; deger: number; ipucu_hak: number }
    expect(r1).toEqual({ hucre: bos, deger: c[bos], ipucu_hak: 2 })
    // Hücre seçilmemiş: en çok dolu komşulu boş hücre, doğru rakamla
    const r2 = (await fen.rpc('oda_sudoku_ipucu', { p_hucre: null, p_giris: ipucu })).data as { hucre: number; deger: number }
    expect(r2.hucre).not.toBe(bos)
    expect(ipucu[r2.hucre]).toBe(0)
    expect(r2.deger).toBe(c[r2.hucre])
    // İpucu hücresi (sabit) istenirse başka hücre verilir
    const sabit = ipucu.findIndex((x) => x > 0)
    const r3 = (await fen.rpc('oda_sudoku_ipucu', { p_hucre: sabit, p_giris: ipucu })).data as { hucre: number; ipucu_hak: number }
    expect(r3.hucre).not.toBe(sabit)
    expect(r3.ipucu_hak).toBe(0)
    expect((await fen.rpc('oda_sudoku_ipucu', { p_hucre: null, p_giris: ipucu })).error?.message).toBe('İpucu hakkın bitti')
    // Yeniden açınca alınan ipuçları ve hak gelir
    const ac2 = (await fen.rpc('oda_sudoku_ac')).data as { ipucu_hak: number; ipuclari: { i: number; v: number }[] }
    expect(ac2.ipucu_hak).toBe(0)
    expect(ac2.ipuclari.map((x) => x.i)).toEqual([bos, r2.hucre, r3.hucre])

    await geriAl(600)
    const b = (await fen.rpc('oda_sudoku_tamamla', { p: c, p_hamle: null, p_sekme: 0 })).data as {
      dogru: boolean
      puan: number
      ham: number
      ipucu: number
      lig_disi: boolean
    }
    expect(b.dogru).toBe(true)
    expect(b.ipucu).toBe(3)
    expect(b.puan).toBe(b.ham + 90)
    expect(b.ham).toBeGreaterThanOrEqual(600)
    expect(b.lig_disi).toBe(false)
    const t = (await fen.rpc('oda_skor_tablosu', { p_oyun: 'sudoku', p_donem: 'gun' })).data as { user_id: string; puan: number; ipucu: number }[]
    expect(t.find((x) => x.user_id === FEN)).toMatchObject({ puan: b.puan, ipucu: 3 })
    expect((await fen.rpc('oda_sudoku_ipucu', { p_hucre: null, p_giris: c })).error?.message).toBe('Bulmaca bitti')
  })
  it('veli ipucu alamaz', async () => {
    expect((await veli.rpc('oda_sudoku_ipucu', { p_hucre: 0, p_giris: null })).error).not.toBeNull()
  })
})

describe('Sudoku hile önlemleri', () => {
  it('alt süreden kısa çözüm kaydedilir ama tabloya ve lige girmez; diğer oyunlar sayılır', async () => {
    await fen.rpc('oda_sudoku_ac')
    await svc.from('oda_oyun').insert({ school_id: OKUL, user_id: FEN, oyun: 'kelime', gun: await bugun(), puan: 2, bitti: new Date().toISOString() })
    const { cozum: c } = await cozum()
    await geriAl(60)
    const b = (await fen.rpc('oda_sudoku_tamamla', { p: c, p_hamle: null, p_sekme: 2 })).data as { dogru: boolean; lig_disi: boolean; neden: string }
    expect(b).toMatchObject({ dogru: true, lig_disi: true, neden: 'sure' })
    const satir = (await svc.from('oda_oyun').select('puan, bitti, lig_disi, durum').eq('user_id', FEN).eq('oyun', 'sudoku').single()).data!
    expect(satir.bitti).not.toBeNull()
    expect(satir.lig_disi).toBe(true)
    expect(satir.durum).toMatchObject({ neden: 'sure', sekme: 2 })
    expect(((await mat.rpc('oda_skor_tablosu', { p_oyun: 'sudoku', p_donem: 'gun' })).data as { user_id: string }[]).some((x) => x.user_id === FEN)).toBe(false)
    expect(((await mat.rpc('oda_skor_tablosu', { p_oyun: 'kelime', p_donem: 'gun' })).data as { user_id: string }[]).some((x) => x.user_id === FEN)).toBe(true)
    const lig = (await mat.rpc('oda_lig')).data as { user_id: string; oyun_sayisi: number }[]
    expect(lig.find((x) => x.user_id === FEN)?.oyun_sayisi).toBe(1) // yalnız kelime
    // Kişi kendi durumunda lig dışı ve nedenini görür
    expect((await fen.rpc('oda_sudoku_ac')).data).toMatchObject({ lig_disi: true, neden: 'sure' })
  })

  it('hamle ritmi: rakamların çoğu son dakikada girildiyse lige girmez; doğal ritim girer; eski istemci ritimsiz', async () => {
    const { cozum: c, ipucu } = await cozum()
    const bosHucre = ipucu.map((x, i) => (x === 0 ? i : -1)).filter((i) => i >= 0)
    // Kopyalama: 10 dk açık, rakamların hepsi son 40 saniyede
    await fen.rpc('oda_sudoku_ac')
    await geriAl(600)
    const kopya = Array(81).fill(0) as number[]
    bosHucre.forEach((i, k) => (kopya[i] = 560_000 + k * 800))
    const r1 = (await fen.rpc('oda_sudoku_tamamla', { p: c, p_hamle: kopya, p_sekme: 0 })).data as { lig_disi: boolean; neden: string }
    expect(r1).toMatchObject({ lig_disi: true, neden: 'ritim' })

    // Doğal: aynı süre, rakamlar 10 dakikaya yayılmış
    await svc.from('oda_oyun').delete().eq('user_id', FEN)
    await fen.rpc('oda_sudoku_ac')
    await geriAl(600)
    const dogal = Array(81).fill(0) as number[]
    bosHucre.forEach((i, k) => (dogal[i] = 20_000 + Math.floor((k * 570_000) / bosHucre.length)))
    const r2 = (await fen.rpc('oda_sudoku_tamamla', { p: c, p_hamle: dogal, p_sekme: 0 })).data as { lig_disi: boolean }
    expect(r2.lig_disi).toBe(false)

    // Eski istemci (oda_sudoku_bitir): ritim yok, alt süre var
    await svc.from('oda_oyun').delete().eq('user_id', FEN)
    await fen.rpc('oda_sudoku_ac')
    await geriAl(600)
    const r3 = (await fen.rpc('oda_sudoku_bitir', { p: c })).data as { dogru: boolean; lig_disi: boolean }
    expect(r3).toMatchObject({ dogru: true, lig_disi: false })
  })

  it('ayarlar: alt süre 0 ve ritim 100 denetimi kapatır; yanlış çözüm hâlâ reddedilir', async () => {
    await svc.from('school_settings').upsert([
      { school_id: OKUL, key: 'oda.sudoku_alt_sure', value: 0 },
      { school_id: OKUL, key: 'oda.sudoku_ritim', value: 100 },
    ])
    const { cozum: c, ipucu } = await cozum()
    await fen.rpc('oda_sudoku_ac')
    await geriAl(30)
    expect(((await fen.rpc('oda_sudoku_tamamla', { p: ipucu.map((x) => x || 1), p_hamle: null, p_sekme: 0 })).data as { dogru: boolean }).dogru).toBe(false)
    const kopya = ipucu.map((x) => (x ? 0 : 29_000))
    const r = (await fen.rpc('oda_sudoku_tamamla', { p: c, p_hamle: kopya, p_sekme: 0 })).data as { dogru: boolean; lig_disi: boolean }
    expect(r).toMatchObject({ dogru: true, lig_disi: false })
  })
})
