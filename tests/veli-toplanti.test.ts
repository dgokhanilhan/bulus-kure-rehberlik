// Veli toplantısı görüşme formu (0053): yetki (RLS), gözlem değerleri, sunucu damgası.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { ELIF, anon, service, signIn } from './helpers'

const svc = service()
const SCHOOL = '00000000-0000-4000-8000-000000000001'
const TARIH = '2090-11-20'
let rehber: SupabaseClient, mat: SupabaseClient, veliElif: SupabaseClient, elif: SupabaseClient, bekleyen: SupabaseClient
let gorulmeyen = '' // matematik öğretmeninin atanmadığı sınıftan bir öğrenci
let rehberId = ''
const form = (student_id: string, extra: object = {}) => ({ school_id: SCHOOL, student_id, toplanti_tarihi: TARIH, gozlemler: { odev: 'evet', kaynak: 'kismen' }, ...extra })
const temizle = () => svc.from('veli_toplanti_formlari').delete().eq('toplanti_tarihi', TARIH)

beforeAll(async () => {
  await temizle()
  rehber = await signIn('rehber')
  mat = await signIn('matematik')
  veliElif = await signIn('veliElif')
  elif = await signIn('elif')
  bekleyen = await signIn('bekleyenMert')
  rehberId = (await rehber.auth.getUser()).data.user!.id
  const all = (await svc.from('students').select('id').eq('school_id', SCHOOL).is('archived_at', null)).data!.map((s) => s.id)
  const gor = new Set((await mat.from('students').select('id')).data!.map((s) => s.id))
  gorulmeyen = all.find((id) => !gor.has(id))!
})
afterAll(temizle)

describe('veli toplantısı formu', () => {
  it('rehber yazar; yazan ve zaman sunucuda konur', async () => {
    const r = await rehber.from('veli_toplanti_formlari').insert(form(ELIF, { created_by: '00000000-0000-0000-0000-000000000000', kararlar: 'Haftada 3 gün 40 soru.' })).select().single()
    expect(r.error).toBeNull()
    expect(r.data).toMatchObject({ created_by: rehberId, updated_by: rehberId, kararlar: 'Haftada 3 gün 40 soru.' })
    // Aynı öğrenci + aynı tarih ikinci kez eklenmez (güncellenir)
    expect((await rehber.from('veli_toplanti_formlari').insert(form(ELIF))).error).not.toBeNull()
    const u = await rehber.from('veli_toplanti_formlari').update({ notlar: 'Anne katıldı.' }).eq('student_id', ELIF).eq('toplanti_tarihi', TARIH).select().single()
    expect(u.data?.notlar).toBe('Anne katıldı.')
  })

  it('gözlemde yalnız evet / kısmen / hayır kabul edilir', async () => {
    const bad = await rehber.from('veli_toplanti_formlari').update({ gozlemler: { odev: 'belki' } }).eq('student_id', ELIF).eq('toplanti_tarihi', TARIH)
    expect(bad.error).not.toBeNull()
    const sayi = await rehber.from('veli_toplanti_formlari').update({ gozlemler: { odev: 3 } }).eq('student_id', ELIF).eq('toplanti_tarihi', TARIH)
    expect(sayi.error).not.toBeNull()
  })

  it('öğretmen yalnız atandığı sınıfın öğrencisine yazar ve onu görür', async () => {
    expect(gorulmeyen).toBeTruthy()
    expect((await mat.from('veli_toplanti_formlari').insert(form(gorulmeyen))).error).not.toBeNull()
    expect((await mat.from('veli_toplanti_formlari').select('id').eq('student_id', ELIF)).data).toHaveLength(1)
    await rehber.from('veli_toplanti_formlari').insert(form(gorulmeyen))
    expect((await mat.from('veli_toplanti_formlari').select('id').eq('student_id', gorulmeyen)).data).toEqual([])
  })

  it('veli, öğrenci, onay bekleyen ve anonim hiçbir formu görmez ve yazamaz', async () => {
    for (const c of [veliElif, elif, bekleyen, anon()]) {
      expect((await c.from('veli_toplanti_formlari').select('id')).data ?? []).toEqual([])
      expect((await c.from('veli_toplanti_formlari').insert(form(ELIF, { toplanti_tarihi: '2090-12-01' }))).error).not.toBeNull()
    }
  })
})
