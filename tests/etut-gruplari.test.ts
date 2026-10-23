// 0062 etut_gruplari: yalnız rehber / yönetici okur-yazar; öğrenci listesi sunucuda süzülür (okulun arşivlenmemiş
// öğrencileri, tekrar yok); aynı kademede aynı ad iki kez olmaz.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { AYSE_CELIK, ELIF, KEREM, anon, service, signIn } from './helpers'

const svc = service()
const SCHOOL = '00000000-0000-4000-8000-000000000001'
const AD = `E2E 8'ler 1. Grup ${Date.now()}`
let rehber: SupabaseClient, mat: SupabaseClient, veli: SupabaseClient
const temizle = () => svc.from('etut_gruplari').delete().like('ad', 'E2E %')

beforeAll(async () => {
  await temizle()
  rehber = await signIn('rehber')
  mat = await signIn('matematik')
  veli = await signIn('veliElif')
})
afterAll(temizle)

describe('etüt öğrenci grupları', () => {
  it('rehber oluşturur; tekrar eden ve okulda olmayan öğrenci atılır', async () => {
    const yok = '00000000-0000-4000-8001-999999999999'
    const r = await rehber.from('etut_gruplari').insert({ school_id: SCHOOL, kademe: 'ortaokul', ad: `  ${AD}  `, ogrenciler: [ELIF, KEREM, ELIF, yok] }).select('ad, ogrenciler, created_by').single()
    expect(r.error).toBeNull()
    expect(r.data!.ad).toBe(AD)
    expect([...r.data!.ogrenciler].sort()).toEqual([ELIF, KEREM].sort())
    expect(r.data!.created_by).toBe((await rehber.auth.getUser()).data.user!.id)
  })
  it('aynı kademede aynı ad (büyük/küçük harf farkıyla da) iki kez olmaz; güncellenir', async () => {
    expect((await rehber.from('etut_gruplari').insert({ school_id: SCHOOL, kademe: 'ortaokul', ad: AD.toUpperCase(), ogrenciler: [ELIF] })).error?.code).toBe('23505')
    const u = await rehber.from('etut_gruplari').update({ ogrenciler: [AYSE_CELIK] }).eq('ad', AD).select('ogrenciler').single()
    expect(u.data!.ogrenciler).toEqual([AYSE_CELIK])
  })
  it('öğretmen, veli ve anonim göremez, yazamaz', async () => {
    for (const c of [mat, veli, anon()]) {
      expect((await c.from('etut_gruplari').select('id').eq('ad', AD)).data ?? []).toEqual([])
      expect((await c.from('etut_gruplari').insert({ school_id: SCHOOL, kademe: 'ortaokul', ad: 'E2E yetkisiz', ogrenciler: [ELIF] })).error).not.toBeNull()
      await c.from('etut_gruplari').delete().eq('ad', AD)
    }
    expect((await svc.from('etut_gruplari').select('id').eq('ad', AD)).data).toHaveLength(1)
  })
  it('rehber siler', async () => {
    expect((await rehber.from('etut_gruplari').delete().eq('ad', AD)).error).toBeNull()
    expect((await svc.from('etut_gruplari').select('id').eq('ad', AD)).data).toEqual([])
  })
})
