// Faz D (0015): bildirim türleri ve admin ayarı, takvim hedefleri/yetkileri, sınav hatırlatması.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { notesOf, service, signIn, signInAdminAal2, snap, ELIF } from './helpers'

const SCHOOL = '00000000-0000-4000-8000-000000000001'
const svc = service()
let admin: SupabaseClient
let c8A = '', c8B = ''
const today = new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10)
const plus = (n: number) => new Date(Date.parse(today) + n * 86400_000).toISOString().slice(0, 10)
const idOf = async (email: string) => (await svc.from('profiles').select('id').eq('email', email).single()).data!.id as string
const titles = async (c: SupabaseClient) => ((await c.from('calendar_events').select('title')).data ?? []).map((e) => e.title as string)
const ev = (c: SupabaseClient, uid: string, e: Record<string, unknown>) =>
  c.from('calendar_events').insert({ school_id: SCHOOL, created_by: uid, starts_on: plus(5), ends_on: plus(5), type: 'diger', target: 'okul', ...e }).select('id').single()

beforeAll(async () => {
  admin = await signInAdminAal2()
  c8A = (await svc.from('classes').select('id').eq('name', '8/A').single()).data!.id
  c8B = (await svc.from('classes').select('id').eq('name', '8/B').single()).data!.id
  await svc.from('calendar_events').delete().like('title', 'Test %')
  await svc.from('conversations').delete().neq('id', '00000000-0000-0000-0000-000000000000')
})
afterAll(async () => {
  await svc.from('calendar_events').delete().like('title', 'Test %')
  await svc.from('school_settings').delete().or('key.like.bildirim.%,key.like.takvim.%,key.eq.modul.takvim')
})

describe('Bildirim türleri', () => {
  it('bildirimler türüyle kaydedilir; kullanıcı türü değiştiremez', async () => {
    const veli = await signIn('veliElif')
    const mat = await idOf('matematik@buluskure.k12.tr')
    const { data: conv } = await veli.rpc('start_conversation', { p_student: ELIF, p_other: mat })
    const before = await snap()
    await veli.rpc('send_message', { p_conversation: conv, p_body: 'tür testi' })
    const t = await signIn('matematik')
    const { data: n } = await t.from('notifications').select('id, type').order('created_at', { ascending: false }).limit(1).single()
    expect(before.has(n!.id)).toBe(false)
    expect(n!.type).toBe('mesaj')
    await t.from('notifications').update({ type: 'kayit' }).eq('id', n!.id)
    expect((await svc.from('notifications').select('type').eq('id', n!.id).single()).data!.type).toBe('mesaj')
  })

  it('yönetici bir türü kapatınca o bildirim hiç oluşmaz', async () => {
    const veli = await signIn('veliElif')
    const { data: conv } = await svc.from('conversations').select('id').limit(1).single()
    await admin.rpc('set_settings', { p: { 'bildirim.mesaj': false } })
    const before = await snap()
    expect((await veli.rpc('send_message', { p_conversation: conv!.id, p_body: 'sessiz' })).error).toBeNull()
    expect(await notesOf(await signIn('matematik'), before)).toEqual([])
    await admin.rpc('set_settings', { p: { 'bildirim.mesaj': true } })
    const before2 = await snap()
    await veli.rpc('send_message', { p_conversation: conv!.id, p_body: 'sesli' })
    expect(await notesOf(await signIn('matematik'), before2)).toHaveLength(1)
  })
})

describe('Takvim', () => {
  it('okul geneli veli toplantısı yalnız velilere; bildirim "etkinlik"', async () => {
    const rehber = await signIn('rehber')
    const before = await snap()
    const { error } = await ev(rehber, await idOf('rehber@buluskure.k12.tr'), { title: 'Test veli toplantısı', type: 'veli_toplantisi', audience: ['veli'], starts_at: '17:00', ends_at: '18:30' })
    expect(error).toBeNull()
    expect(await titles(await signIn('veliElif'))).toContain('Test veli toplantısı')
    expect(await titles(await signIn('veliKerem'))).toContain('Test veli toplantısı')
    expect(await titles(await signIn('elif'))).not.toContain('Test veli toplantısı')
    expect(await titles(await signIn('matematik'))).not.toContain('Test veli toplantısı')
    const { data: n } = await (await signIn('veliElif')).from('notifications').select('id, text, type')
    const mine = n!.filter((x) => !before.has(x.id))
    expect(mine).toEqual([expect.objectContaining({ type: 'etkinlik', text: expect.stringMatching(/^Veli toplantısı: Test veli toplantısı · /) })])
  })

  it('öğretmen yalnız ders verdiği sınıfa sınav ekler; okul geneline ekleyemez; ayarla kapanır', async () => {
    const t = await signIn('matematik')
    const me = await idOf('matematik@buluskure.k12.tr')
    const before = await snap()
    expect((await ev(t, me, { title: 'Test 8A yazılı', type: 'yazili', target: 'sinif', class_id: c8A })).error).toBeNull()
    expect((await ev(t, me, { title: 'Test 8B yazılı', type: 'yazili', target: 'sinif', class_id: c8B })).error).not.toBeNull()
    expect((await ev(t, me, { title: 'Test okul', type: 'diger' })).error).not.toBeNull()
    const veli = await signIn('veliElif')
    expect(await titles(veli)).toContain('Test 8A yazılı')
    expect(await titles(await signIn('veliKerem'))).not.toContain('Test 8A yazılı')
    expect((await veli.from('notifications').select('id, type').eq('type', 'sinav')).data!.some((x) => !before.has(x.id))).toBe(true)
    await admin.rpc('set_settings', { p: { 'takvim.ogretmen_ekler': false } })
    expect((await ev(t, me, { title: 'Test kapalı', type: 'proje', target: 'sinif', class_id: c8A })).error).not.toBeNull()
    await admin.rpc('set_settings', { p: { 'takvim.ogretmen_ekler': true } })
  })

  it('öğrenci ve öğretmen hedefli etkinlikler yalnız ilgiliye görünür', async () => {
    const t = await signIn('matematik')
    const me = await idOf('matematik@buluskure.k12.tr')
    expect((await ev(t, me, { title: 'Test Elif telafi', type: 'yazili', target: 'ogrenci', student_id: ELIF })).error).toBeNull()
    expect(await titles(await signIn('veliElif'))).toContain('Test Elif telafi')
    expect(await titles(await signIn('elif'))).toContain('Test Elif telafi')
    expect(await titles(await signIn('veliKerem'))).not.toContain('Test Elif telafi')
    const rehber = await signIn('rehber')
    const fen = await idOf('fen@buluskure.k12.tr')
    expect((await ev(rehber, await idOf('rehber@buluskure.k12.tr'), { title: 'Test fen zümre', type: 'diger', target: 'ogretmen', teacher_id: fen })).error).toBeNull()
    expect(await titles(await signIn('fen'))).toContain('Test fen zümre')
    expect(await titles(t)).not.toContain('Test fen zümre')
    expect(await titles(admin)).toContain('Test fen zümre') // yönetim her şeyi görür
  })

  it('yalnız ekleyen ya da yönetici siler; tarih sırası doğrulanır; modül kapalıyken görünmez', async () => {
    const { data: e } = await svc.from('calendar_events').select('id').eq('title', 'Test 8A yazılı').single()
    await (await signIn('fen')).from('calendar_events').delete().eq('id', e!.id)
    expect((await svc.from('calendar_events').select('id').eq('id', e!.id)).data).toHaveLength(1)
    const rehber = await signIn('rehber')
    const me = await idOf('rehber@buluskure.k12.tr')
    expect((await ev(rehber, me, { title: 'Test ters', starts_on: plus(3), ends_on: plus(1) })).error).not.toBeNull()
    await admin.rpc('set_settings', { p: { 'modul.takvim': false } })
    expect(await titles(await signIn('veliElif'))).toEqual([])
    expect((await ev(rehber, me, { title: 'Test kapalıyken' })).error).not.toBeNull()
    await admin.rpc('set_settings', { p: { 'modul.takvim': true } })
  })

  it('yaklaşan sınav bir kez hatırlatılır', async () => {
    const rehber = await signIn('rehber')
    const { data: e } = await ev(rehber, await idOf('rehber@buluskure.k12.tr'), { title: 'Test deneme sınavı', type: 'deneme', target: 'sinif', class_id: c8A, starts_on: plus(1), ends_on: plus(1) })
    const before = await snap()
    await svc.rpc('takvim_hatirlatma')
    const veli = await signIn('veliElif')
    expect(await notesOf(veli, before)).toContain(`Yaklaşan deneme: Test deneme sınavı · ${plus(1).split('-').reverse().join('.')}`)
    const before2 = await snap()
    await svc.rpc('takvim_hatirlatma')
    expect(await notesOf(veli, before2)).toEqual([])
    expect((await svc.from('calendar_events').select('reminded_on').eq('id', e!.id).single()).data!.reminded_on).toBe(today)
  })
})
