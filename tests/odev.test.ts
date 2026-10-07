// Faz B (0013): ödev verme yetkisi, sınıfa otomatik atama, durum işaretleme, görünürlük, ayarlar, hatırlatma.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { notesOf, service, signIn, signInAdminAal2, snap, ELIF, KEREM } from './helpers'

const SCHOOL = '00000000-0000-4000-8000-000000000001'
const svc = service()
let admin: SupabaseClient
let c8A = '', c8B = '', mat = '', turkce = '', matId = ''
const today = new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10)
const plus = (n: number) => new Date(Date.parse(today) + n * 86400_000).toISOString().slice(0, 10)

beforeAll(async () => {
  admin = await signInAdminAal2()
  c8A = (await svc.from('classes').select('id').eq('name', '8/A').single()).data!.id
  c8B = (await svc.from('classes').select('id').eq('name', '8/B').single()).data!.id
  mat = (await svc.from('courses').select('id').eq('name', 'Matematik').single()).data!.id
  turkce = (await svc.from('courses').select('id').eq('name', 'Türkçe').single()).data!.id
  matId = (await svc.from('profiles').select('id').eq('email', 'matematik@buluskure.k12.tr').single()).data!.id
  await svc.from('homework').delete().like('title', 'Test %')
})
afterAll(async () => {
  await svc.from('homework').delete().like('title', 'Test %')
  await svc.from('school_settings').delete().like('key', 'odev.%')
})

const give = (c: SupabaseClient, uid: string, extra: Record<string, unknown>) =>
  c.from('homework').insert({ school_id: SCHOOL, teacher_id: uid, title: 'Test ödev', due_on: plus(3), ...extra }).select('id').single()

describe('Ödev verme yetkisi', () => {
  it('toplu ödevde bir sınıf yetkisizse hiçbir sınıfa kayıt yapılmaz', async () => {
    const t = await signIn('matematik')
    const title = 'Test toplu yetki kontrolü'
    const result = await t.from('homework').insert([c8A, c8B].map((class_id) => ({
      school_id: SCHOOL, teacher_id: matId, class_id, course_id: mat, title, due_on: plus(3),
    })))
    expect(result.error).not.toBeNull()
    const stored = await svc.from('homework').select('id').eq('title', title)
    expect(stored.error).toBeNull()
    expect(stored.data).toEqual([])
  })
  it('öğretmen yalnız ders verdiği sınıf + derse ödev verir; veli ve öğrenci veremez', async () => {
    const t = await signIn('matematik')
    expect((await give(t, matId, { class_id: c8B, course_id: mat })).error).not.toBeNull() // 8/B'de dersi yok
    expect((await give(t, matId, { class_id: c8A, course_id: turkce })).error).not.toBeNull() // 8/A'da Türkçe vermiyor
    const { data, error } = await give(t, matId, { class_id: c8A, course_id: mat, title: 'Test 8A matematik' })
    expect(error).toBeNull()
    const { data: rows } = await svc.from('homework_students').select('student_id, status').eq('homework_id', data!.id)
    const { count } = await svc.from('students').select('id', { count: 'exact', head: true }).eq('class_id', c8A).is('archived_at', null)
    expect(rows).toHaveLength(count!)
    expect(rows!.every((r) => r.status === 'bekliyor')).toBe(true)
    for (const who of ['veliElif', 'elif'] as const) {
      const c = await signIn(who)
      const { data: u } = await c.auth.getUser()
      expect((await give(c, u.user!.id, { class_id: c8A, course_id: mat })).error, who).not.toBeNull()
    }
  })

  it('sınıf öğretmeni kendi sınıfına her dersten ödev verebilir (rehber 8/A sınıf öğretmeni)', async () => {
    const r = await signIn('rehber')
    const { data: u } = await r.auth.getUser()
    expect((await give(r, u.user!.id, { class_id: c8A, course_id: turkce, title: 'Test sınıf öğretmeni' })).error).toBeNull()
    expect((await give(r, u.user!.id, { class_id: c8B, course_id: turkce })).error).not.toBeNull()
  })

  it('son teslim tarihi ayara göre zorunlu; geçmişe tarih verilemez', async () => {
    const t = await signIn('matematik')
    expect((await give(t, matId, { class_id: c8A, course_id: mat, due_on: null })).error?.message).toMatch(/Son teslim/)
    expect((await give(t, matId, { class_id: c8A, course_id: mat, due_on: plus(-5) })).error).not.toBeNull()
    await admin.rpc('set_settings', { p: { 'odev.son_tarih_zorunlu': false } })
    expect((await give(t, matId, { class_id: c8A, course_id: mat, due_on: null, title: 'Test tarihsiz' })).error).toBeNull()
    await admin.rpc('set_settings', { p: { 'odev.son_tarih_zorunlu': true } })
  })
})

describe('Görünürlük ve bildirim', () => {
  it('yeni ödev öğrenci ve velisine bildirilir; başka sınıfın velisi görmez', async () => {
    const before = await snap()
    const t = await signIn('matematik')
    const { data } = await give(t, matId, { class_id: c8A, course_id: mat, title: 'Test bildirim' })
    const veli = await signIn('veliElif')
    expect((await notesOf(veli, before)).some((n) => n.startsWith('Yeni ödev · Matematik: Test bildirim'))).toBe(true)
    expect(((await veli.from('homework').select('id').eq('id', data!.id)).data ?? []).length).toBe(1)
    const veliKerem = await signIn('veliKerem')
    expect((await veliKerem.from('homework').select('id').eq('id', data!.id)).data ?? []).toEqual([])
    expect((await veliKerem.from('homework_students').select('student_id').eq('homework_id', data!.id)).data ?? []).toEqual([])
    // Öğrenci yalnız kendi satırını görür
    const elif = await signIn('elif')
    expect(((await elif.from('homework_students').select('student_id').eq('homework_id', data!.id)).data ?? []).map((r) => r.student_id)).toEqual([ELIF])
  })

  it('veli durum görmesi ayarla kapanır', async () => {
    const { data: hw } = await svc.from('homework').select('id').eq('title', 'Test bildirim').single()
    const veli = await signIn('veliElif')
    expect((await veli.from('homework_students').select('status').eq('homework_id', hw!.id)).data).toHaveLength(1)
    await admin.rpc('set_settings', { p: { 'odev.veli_durum_gorur': false } })
    expect((await veli.from('homework_students').select('status').eq('homework_id', hw!.id)).data ?? []).toEqual([])
    expect(((await veli.from('homework').select('id').eq('id', hw!.id)).data ?? []).length).toBe(1) // ödevin kendisi görünür
    await admin.rpc('set_settings', { p: { 'odev.veli_durum_gorur': true } })
  })
})

describe('Durum işaretleme', () => {
  it('aynı sınıf ve derse yetkisi olsa bile başka öğretmenin ödevini yalnız okur', async () => {
    const owner = await signIn('rehber')
    const uid = (await owner.auth.getUser()).data.user!.id
    const h = await give(owner, uid, { class_id: c8A, course_id: mat, title: 'Test başka öğretmen aynı ders' })
    expect(h.error).toBeNull()
    const other = await signIn('matematik')
    expect((await other.from('homework').select('id').eq('id', h.data!.id)).data).toHaveLength(1)
    expect((await other.rpc('can_check_homework', { p_hw: h.data!.id })).data).toBe(false)
    expect((await other.rpc('set_homework_statuses', { p_homework: h.data!.id, p_items: [{ student_id: ELIF, status: 'yapti' }] })).error?.code).toBe('42501')
    expect((await owner.rpc('can_check_homework', { p_hw: h.data!.id })).data).toBe(true)
    expect((await admin.rpc('can_check_homework', { p_hw: h.data!.id })).data).toBe(true)
  })
  it('öğretmen toplu işaretler; not kaydedilir; veliye "kontrol edildi" bildirimi', async () => {
    const { data: hw } = await svc.from('homework').select('id').eq('title', 'Test 8A matematik').single()
    const t = await signIn('matematik')
    const before = await snap()
    const { data: n, error } = await t.rpc('set_homework_statuses', {
      p_homework: hw!.id,
      p_items: [{ student_id: ELIF, status: 'eksik', note: '4. sorudan sonrası eksik.' }],
    })
    expect(error).toBeNull()
    expect(n).toBe(1)
    const { data: row } = await svc.from('homework_students').select('status, note, checked_by').eq('homework_id', hw!.id).eq('student_id', ELIF).single()
    expect(row).toEqual({ status: 'eksik', note: '4. sorudan sonrası eksik.', checked_by: matId })
    expect(await notesOf(await signIn('veliElif'), before)).toEqual(['Ödev kontrol edildi · Matematik: Test 8A matematik — Eksik'])
    // Aynı durum tekrar: değişiklik yok, bildirim yok
    expect((await t.rpc('set_homework_statuses', { p_homework: hw!.id, p_items: [{ student_id: ELIF, status: 'eksik', note: '4. sorudan sonrası eksik.' }] })).data).toBe(0)
  })

  it('yetkisiz öğretmen ve veli işaretleyemez; sınıfta olmayan öğrenci işaretlenemez; doğrudan güncelleme yok', async () => {
    const { data: hw } = await svc.from('homework').select('id').eq('title', 'Test 8A matematik').single()
    // Fen öğretmeni 8/A'da ders veriyor ama matematik ödevini işaretleyemez
    const fen = await signIn('fen')
    expect((await fen.rpc('set_homework_statuses', { p_homework: hw!.id, p_items: [{ student_id: ELIF, status: 'yapti' }] })).error?.code).toBe('42501')
    const veli = await signIn('veliElif')
    expect((await veli.rpc('set_homework_statuses', { p_homework: hw!.id, p_items: [{ student_id: ELIF, status: 'yapti' }] })).error?.code).toBe('42501')
    const t = await signIn('matematik')
    expect((await t.rpc('set_homework_statuses', { p_homework: hw!.id, p_items: [{ student_id: KEREM, status: 'yapti' }] })).error?.code).toBe('P0002')
    expect((await t.rpc('set_homework_statuses', { p_homework: hw!.id, p_items: [{ student_id: ELIF, status: 'uydurma' }] })).error?.message).toMatch(/Geçersiz durum/)
    await t.from('homework_students').update({ status: 'yapti' }).eq('homework_id', hw!.id).eq('student_id', ELIF)
    expect((await svc.from('homework_students').select('status').eq('homework_id', hw!.id).eq('student_id', ELIF).single()).data!.status).toBe('eksik')
    // Başka öğretmen ödevi silemez; veren silebilir
    await fen.from('homework').delete().eq('id', hw!.id)
    expect((await svc.from('homework').select('id').eq('id', hw!.id)).data).toHaveLength(1)
  })

  it('modül kapalıyken ödev verilemez ve işaretlenemez', async () => {
    const { data: hw } = await svc.from('homework').select('id').eq('title', 'Test 8A matematik').single()
    await admin.rpc('set_settings', { p: { 'modul.odev': false } })
    const t = await signIn('matematik')
    expect((await give(t, matId, { class_id: c8A, course_id: mat })).error).not.toBeNull()
    expect((await t.rpc('set_homework_statuses', { p_homework: hw!.id, p_items: [{ student_id: ELIF, status: 'yapti' }] })).error).not.toBeNull()
    expect((await (await signIn('veliElif')).from('homework').select('id')).data ?? []).toEqual([])
    await admin.rpc('set_settings', { p: { 'modul.odev': true } })
  })
})

describe('Hatırlatma', () => {
  it('son teslime X gün kala bekleyenlere bir kez hatırlatır', async () => {
    const t = await signIn('matematik')
    const { data } = await give(t, matId, { class_id: c8A, course_id: mat, title: 'Test hatırlatma', due_on: plus(1) })
    const before = await snap()
    const { data: n } = await svc.rpc('odev_hatirlatma')
    expect(n).toBeGreaterThanOrEqual(1)
    const veli = await signIn('veliElif')
    expect((await notesOf(veli, before)).some((x) => x.startsWith('Ödev hatırlatma · Matematik: Test hatırlatma'))).toBe(true)
    const before2 = await snap()
    await svc.rpc('odev_hatirlatma')
    expect((await notesOf(veli, before2)).some((x) => x.includes('Test hatırlatma'))).toBe(false)
    expect((await svc.from('homework').select('reminded_on').eq('id', data!.id).single()).data!.reminded_on).toBe(today)
  })
})
