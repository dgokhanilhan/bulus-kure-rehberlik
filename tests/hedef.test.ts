// Hedef listeleri ve öğrenci hedefleri (0054/0055): yetki (RLS + RPC), yerleşik ÖSYM verisi, okul listesi yükleme.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { ELIF, anon, service, signIn, signInAdminAal2 } from './helpers'

const svc = service()
const SCHOOL = '00000000-0000-4000-8000-000000000001'
const YIL = 2091
let admin: SupabaseClient, rehber: SupabaseClient, mat: SupabaseClient, veliElif: SupabaseClient, elif: SupabaseClient
let gorulmeyen = ''
const satir = (kurum: string, taban: number) => ({ kod: `bartin|${kurum}`, kurum, il: 'Bartın', ilce: 'Merkez', birim: 'Anadolu Lisesi', program: null, puan_turu: null, taban_puan: taban, tavan_puan: null, yuzdelik: 10.5, kontenjan: 120, yerlesen: null })
const temizle = async () => {
  await svc.from('hedef_programlar').delete().eq('yil', YIL)
}

beforeAll(async () => {
  await temizle()
  admin = await signInAdminAal2()
  rehber = await signIn('rehber')
  mat = await signIn('matematik')
  veliElif = await signIn('veliElif')
  elif = await signIn('elif')
  const all = (await svc.from('students').select('id').eq('school_id', SCHOOL).is('archived_at', null)).data!.map((s) => s.id)
  const gor = new Set((await mat.from('students').select('id')).data!.map((s) => s.id))
  gorulmeyen = all.find((id) => !gor.has(id))!
})
afterAll(temizle)

describe('hedef listeleri', () => {
  it('yerleşik ÖSYM 2025 Tablo-4 verisi öğretmene açık; veli, öğrenci ve anonim göremez', async () => {
    const r = await rehber.from('hedef_programlar').select('kurum, il, puan_turu, taban_puan').eq('sinav', 'YKS').eq('yil', 2025).eq('kod', '101690110').single()
    expect(r.data).toMatchObject({ kurum: 'BARTIN ÜNİVERSİTESİ', il: 'Bartın', puan_turu: 'SAY' })
    expect(Number(r.data!.taban_puan)).toBeCloseTo(268.85675, 4)
    for (const c of [veliElif, elif, anon()]) expect((await c.from('hedef_programlar').select('id').limit(1)).data ?? []).toEqual([])
  })

  it('liste yalnız yönetici yükler; doğrudan yazma kapalı; ikinci yükleme öncekini değiştirir', async () => {
    for (const c of [rehber, mat, veliElif]) expect((await c.rpc('hedef_yukle', { p_sinav: 'LGS', p_yil: YIL, p_kaynak: 'test', p_satirlar: [satir('A Lisesi', 400)], p_bastan: true })).error).not.toBeNull()
    expect((await rehber.from('hedef_programlar').insert({ sinav: 'LGS', yil: YIL, kod: 'x', kurum: 'x', school_id: SCHOOL })).error).not.toBeNull()
    expect((await admin.rpc('hedef_yukle', { p_sinav: 'LGS', p_yil: YIL, p_kaynak: 'MEB e-Okul test', p_satirlar: [satir('A Lisesi', 400), satir('B Lisesi', 350)], p_bastan: true })).data).toBe(2)
    expect((await admin.rpc('hedef_yukle', { p_sinav: 'LGS', p_yil: YIL, p_kaynak: 'MEB e-Okul test', p_satirlar: [satir('C Lisesi', 420)], p_bastan: true })).data).toBe(1)
    expect((await rehber.from('hedef_programlar').select('kurum').eq('yil', YIL)).data!.map((x) => x.kurum)).toEqual(['C Lisesi'])
    const oz = (await rehber.rpc('hedef_ozet')).data as { sinav: string; yil: number; yerlesik: boolean; satir: number }[]
    expect(oz.find((x) => x.sinav === 'LGS' && x.yil === YIL)).toMatchObject({ yerlesik: false, satir: 1 })
    expect(oz.find((x) => x.sinav === 'YKS' && x.yil === 2025)).toMatchObject({ yerlesik: true, satir: 12265 })
  })

  it('öğrenci hedefi: öğretmen yalnız görebildiği öğrenciye ekler; veli göremez; liste kalkınca hedef de kalkar', async () => {
    const pid = (await rehber.from('hedef_programlar').select('id').eq('yil', YIL).single()).data!.id
    const ek = await rehber.from('ogrenci_hedefleri').insert({ school_id: SCHOOL, student_id: ELIF, program_id: pid }).select('created_by').single()
    expect(ek.error).toBeNull()
    expect((await rehber.from('ogrenci_hedefleri').insert({ school_id: SCHOOL, student_id: ELIF, program_id: pid })).error).not.toBeNull() // aynı hedef iki kez
    expect((await mat.from('ogrenci_hedefleri').insert({ school_id: SCHOOL, student_id: gorulmeyen, program_id: pid })).error).not.toBeNull()
    expect((await veliElif.from('ogrenci_hedefleri').select('id')).data ?? []).toEqual([])
    expect((await rehber.from('ogrenci_hedefleri').select('id').eq('student_id', ELIF)).data).toHaveLength(1)
    expect((await rehber.rpc('hedef_sil', { p_sinav: 'LGS', p_yil: YIL })).error).not.toBeNull()
    expect((await admin.rpc('hedef_sil', { p_sinav: 'LGS', p_yil: YIL })).data).toBe(1)
    expect((await rehber.from('ogrenci_hedefleri').select('id').eq('student_id', ELIF)).data).toEqual([])
  })
})
