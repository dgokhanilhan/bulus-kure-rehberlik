// Yönetim Merkezi genişletme (0024): sınıf aktif/pasif, öğrenci/modül işlem kaydı, "öğretmenler ödev verebilir", kart genişliği, yönetici paneli.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { anon, service, signIn, signInAdminAal2, ELIF } from './helpers'

const svc = service()
let admin: SupabaseClient
const ids: Record<string, string> = {}

beforeAll(async () => {
  admin = await signInAdminAal2()
  ids.c6 = (await svc.from('classes').select('id').eq('name', '6/A').single()).data!.id
  ids.c8a = (await svc.from('classes').select('id').eq('name', '8/A').single()).data!.id
  ids.mat = (await svc.from('courses').select('id').eq('name', 'Matematik').limit(1).single()).data!.id
})
afterAll(async () => {
  await svc.from('classes').update({ active: true }).eq('id', ids.c6!)
  await svc.from('students').update({ archived_at: null }).eq('id', ELIF)
  await svc.from('school_settings').delete().in('key', ['odev.ogretmen_verebilir', 'panel.veli', 'panel.yonetim', 'modul.yemek'])
})

describe('Sınıf aktif/pasif', () => {
  it('pasif sınıf kayıt listesinde görünmez; yalnız yönetici (aal2) değiştirir; işlem kaydı', async () => {
    const names = async () => ((await anon().rpc('signup_classes', { p_school: 'bulus-kure' })).data as { name: string }[]).map((c) => c.name)
    expect(await names()).toContain('6/A')
    expect((await (await signIn('rehber')).from('classes').update({ active: false }).eq('id', ids.c6!).select('id')).data ?? []).toEqual([])
    expect((await (await signIn('admin')).from('classes').update({ active: false }).eq('id', ids.c6!).select('id')).data ?? []).toEqual([]) // aal1
    expect((await admin.from('classes').update({ active: false }).eq('id', ids.c6!)).error).toBeNull()
    expect(await names()).not.toContain('6/A')
    const { data: log } = await svc.from('audit_log').select('action, meta').eq('entity', 'classes').eq('entity_id', ids.c6!).order('id', { ascending: false }).limit(1).single()
    expect(log!.action).toBe('update')
    expect((log!.meta as { yeni: { active: boolean } }).yeni.active).toBe(false)
    await admin.from('classes').update({ active: true }).eq('id', ids.c6!)
    expect(await names()).toContain('6/A')
  })
})

describe('Öğrenci arşivi ve işlem kaydı', () => {
  it('arşivlenen öğrenci listeden düşer, geri alınır; değişiklik kaydedilir', async () => {
    expect((await admin.from('students').update({ archived_at: new Date().toISOString() }).eq('id', ELIF)).error).toBeNull()
    const active = (await admin.from('students').select('id').is('archived_at', null)).data!.map((s) => s.id)
    expect(active).not.toContain(ELIF)
    await admin.from('students').update({ archived_at: null }).eq('id', ELIF)
    const { data: log } = await svc.from('audit_log').select('action').eq('entity', 'students').eq('entity_id', ELIF).order('id', { ascending: false }).limit(2)
    expect(log!.map((l) => l.action)).toEqual(['update', 'update'])
    expect((await (await signIn('rehber')).from('students').update({ archived_at: new Date().toISOString() }).eq('id', ELIF).select('id')).data ?? []).toEqual([])
  })
})

describe('Modül açma/kapama', () => {
  it('module_toggle kaydı oluşur; yönetici olmayan değiştiremez', async () => {
    expect((await admin.rpc('set_settings', { p: { 'modul.yemek': false } })).error).toBeNull()
    const { data: log } = await svc.from('audit_log').select('meta').eq('action', 'module_toggle').order('id', { ascending: false }).limit(1).single()
    expect(log!.meta).toEqual({ module: 'yemek', on: false })
    expect((await (await signIn('rehber')).rpc('set_settings', { p: { 'modul.yemek': true } })).error?.code).toBe('42501')
    await admin.rpc('set_settings', { p: { 'modul.yemek': true } })
  })
})

describe('Öğretmenler ödev verebilir', () => {
  it('kapalıyken öğretmen ödev veremez (veritabanında), yönetici verebilir', async () => {
    const mat = await signIn('matematik')
    const can = async (c: SupabaseClient) => (await c.rpc('can_assign_homework', { p_class: ids.c8a, p_course: ids.mat })).data
    expect(await can(mat)).toBe(true)
    await admin.rpc('set_settings', { p: { 'odev.ogretmen_verebilir': false } })
    expect(await can(mat)).toBe(false)
    expect(await can(admin)).toBe(true)
    await admin.rpc('set_settings', { p: { 'odev.ogretmen_verebilir': true } })
    expect(await can(mat)).toBe(true)
  })
})

describe('Kart düzeni', () => {
  it('kartlara isteğe bağlı genişlik (dar/genis); yönetici "Bugün" düzeni; geçersiz değer reddedilir', async () => {
    expect((await admin.rpc('set_settings', { p: { 'panel.veli': [{ id: 'odev', on: true, w: 'genis' }, { id: 'duyuru', on: true }] } })).error).toBeNull()
    expect((await admin.rpc('set_settings', { p: { 'panel.veli': [{ id: 'odev', on: true, w: 'kocaman' }] } })).error?.message).toMatch(/kart düzeni geçersiz/)
    expect((await admin.rpc('set_settings', { p: { 'panel.veli': [{ id: 'odev', on: true, x: 1 }] } })).error?.message).toMatch(/kart düzeni geçersiz/)
    expect((await admin.rpc('set_settings', { p: { 'panel.yonetim': [{ id: 'gorusmeler', on: true }, { id: 'deneme', on: false }] } })).error).toBeNull()
    expect((await admin.rpc('set_settings', { p: { 'panel.yonetim': [{ id: 'lgs', on: true }] } })).error?.message).toMatch(/kart düzeni geçersiz/)
  })
})
