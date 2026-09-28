// İletişim (0010): duyuru kapsamı ve yetkileri, veli–öğretmen mesajlaşması.
import { describe, it, expect, beforeAll } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { anon, notesOf, service, signIn, signInAdminAal2, snap, ELIF, KEREM } from './helpers'

const SCHOOL = '00000000-0000-4000-8000-000000000001'
let cls8A = ''
let cls8B = ''
const idOf = async (email: string) => (await service().from('profiles').select('id').eq('email', email).single()).data!.id as string
const titles = async (c: SupabaseClient) => ((await c.from('announcements').select('title')).data ?? []).map((a) => a.title as string)

beforeAll(async () => {
  const svc = service()
  cls8A = (await svc.from('classes').select('id').eq('name', '8/A').single()).data!.id
  cls8B = (await svc.from('classes').select('id').eq('name', '8/B').single()).data!.id
  await svc.from('announcements').delete().like('title', 'Test %')
  await svc.from('conversations').delete().neq('id', '00000000-0000-0000-0000-000000000000')
})

describe('Duyurular', () => {
  it('veli ve öğrenci yayınlayamaz; öğretmen yalnız ders verdiği sınıfa yayınlar', async () => {
    for (const who of ['veliElif', 'elif'] as const) {
      const c = await signIn(who)
      const { data: u } = await c.auth.getUser()
      expect((await c.from('announcements').insert({ school_id: SCHOOL, title: 'Test veli', body: 'x', scope: 'okul', created_by: u.user!.id })).error, who).not.toBeNull()
    }
    const mat = await signIn('matematik')
    const me = await idOf('matematik@buluskure.k12.tr')
    expect((await mat.from('announcements').insert({ school_id: SCHOOL, title: 'Test okul', body: 'x', scope: 'okul', created_by: me })).error).not.toBeNull()
    expect((await mat.from('announcements').insert({ school_id: SCHOOL, title: 'Test 8B', body: 'x', scope: 'sinif', class_id: cls8B, created_by: me })).error).not.toBeNull()
    expect((await mat.from('announcements').insert({ school_id: SCHOOL, title: 'Test 8A matematik', body: 'Yarın cetvel getirin.', scope: 'sinif', class_id: cls8A, created_by: me })).error).toBeNull()
  })

  it('sınıf duyurusu yalnız o sınıfın velisine ve öğrencisine görünür; bildirim gider', async () => {
    const veliElif = await signIn('veliElif')
    const veliKerem = await signIn('veliKerem')
    expect(await titles(veliElif)).toContain('Test 8A matematik')
    expect(await titles(await signIn('elif'))).toContain('Test 8A matematik')
    expect(await titles(veliKerem)).not.toContain('Test 8A matematik')
    expect(await notesOf(veliElif, new Set())).toContain('Duyuru: Test 8A matematik')
    expect((await anon().from('announcements').select('id')).data ?? []).toEqual([])
  })

  it('okul duyurusu hedef kitleye göre; kademe duyurusu yalnız o kademedeki sınıflara', async () => {
    const rehber = await signIn('rehber')
    const me = await idOf('rehber@buluskure.k12.tr')
    const before = await snap()
    expect((await rehber.from('announcements').insert({ school_id: SCHOOL, title: 'Test veli toplantısı', body: 'Cuma 17.00', scope: 'okul', audience: ['veli'], created_by: me })).error).toBeNull()
    expect((await rehber.from('announcements').insert({ school_id: SCHOOL, title: 'Test lise gezisi', body: 'x', scope: 'kademe', level: 'lise', audience: ['veli', 'ogrenci'], created_by: me })).error).toBeNull()
    expect((await rehber.from('announcements').insert({ school_id: SCHOOL, title: 'Test ortaokul', body: 'x', scope: 'kademe', level: 'ortaokul', audience: ['veli'], created_by: me })).error).toBeNull()

    const veliKerem = await signIn('veliKerem')
    expect(await titles(veliKerem)).toEqual(expect.arrayContaining(['Test veli toplantısı', 'Test ortaokul']))
    expect(await titles(veliKerem)).not.toContain('Test lise gezisi')
    // Yalnız velilere: öğrenci ve branş öğretmeni görmez
    expect(await titles(await signIn('elif'))).not.toContain('Test veli toplantısı')
    expect(await titles(await signIn('matematik'))).not.toContain('Test veli toplantısı')
    expect(await notesOf(veliKerem, before)).toEqual(expect.arrayContaining(['Duyuru: Test veli toplantısı', 'Duyuru: Test ortaokul']))
    expect(await notesOf(veliKerem, before)).not.toContain('Duyuru: Test lise gezisi')
  })

  it('duyuruyu yazan ya da yönetici siler; başka öğretmen silemez', async () => {
    const { data: a } = await service().from('announcements').select('id').eq('title', 'Test 8A matematik').single()
    const fen = await signIn('fen')
    await fen.from('announcements').delete().eq('id', a!.id)
    expect((await service().from('announcements').select('id').eq('id', a!.id)).data).toHaveLength(1)
    const admin = await signInAdminAal2()
    await admin.from('announcements').delete().eq('id', a!.id)
    expect((await service().from('announcements').select('id').eq('id', a!.id)).data).toHaveLength(0)
  })
})

describe('Mesajlaşma', () => {
  let conv = ''

  it('veli yalnız çocuğunun öğretmenlerini, rehberliği ve yönetimi görür', async () => {
    const veliElif = await signIn('veliElif')
    const { data } = await veliElif.rpc('child_contacts', { p_student: ELIF })
    const names = (data as { full_name: string; subjects: string[]; homeroom: boolean }[]).map((x) => x.full_name)
    expect(names).toEqual(expect.arrayContaining(['Okul Yöneticisi']))
    const mat = (data as { id: string; subjects: string[] }[]).find((x) => x.subjects.includes('Matematik'))
    expect(mat).toBeTruthy()
    // Kerem 8/B: matematik öğretmeni o sınıfta ders vermiyor
    const veliKerem = await signIn('veliKerem')
    const { data: k } = await veliKerem.rpc('child_contacts', { p_student: KEREM })
    expect((k as { id: string }[]).map((x) => x.id)).not.toContain(mat!.id)
    // Başkasının çocuğu için liste boş
    expect(((await veliKerem.rpc('child_contacts', { p_student: ELIF })).data ?? []) as unknown[]).toEqual([])
  })

  it('veli yazışma başlatır, öğretmen bildirim alır, cevaplar; okundu bilgisi', async () => {
    const veliElif = await signIn('veliElif')
    const matId = await idOf('matematik@buluskure.k12.tr')
    expect((await veliElif.rpc('start_conversation', { p_student: KEREM, p_other: matId })).error?.code).toBe('42501')
    const { data: id, error } = await veliElif.rpc('start_conversation', { p_student: ELIF, p_other: matId })
    expect(error).toBeNull()
    conv = id as string
    // Aynı kişiyle ikinci kez başlatınca aynı yazışma döner
    expect((await veliElif.rpc('start_conversation', { p_student: ELIF, p_other: matId })).data).toBe(conv)

    const before = await snap()
    expect((await veliElif.rpc('send_message', { p_conversation: conv, p_body: '  Merhaba hocam, Elif ödevi yapamadı.  ' })).error).toBeNull()
    const mat = await signIn('matematik')
    expect(await notesOf(mat, before)).toEqual(['Ayşe Yıldız mesaj gönderdi (Elif Yıldız)'])
    const { data: list } = await mat.rpc('my_conversations')
    expect(list).toEqual([expect.objectContaining({ id: conv, student_name: 'Elif Yıldız', parent_name: 'Ayşe Yıldız', last_body: 'Merhaba hocam, Elif ödevi yapamadı.', unread: 1 })])
    await mat.rpc('mark_conversation_read', { p_conversation: conv })
    expect(((await mat.rpc('my_conversations')).data as { unread: number }[])[0]!.unread).toBe(0)
    expect((await mat.rpc('send_message', { p_conversation: conv, p_body: 'Sorun değil, yarın birlikte bakalım.' })).error).toBeNull()
    const { data: msgs } = await veliElif.from('messages').select('body').eq('conversation_id', conv).order('created_at')
    expect(msgs!.map((m) => m.body)).toEqual(['Merhaba hocam, Elif ödevi yapamadı.', 'Sorun değil, yarın birlikte bakalım.'])
  })

  it('yazışmayı yalnız taraflar ve yönetici görür; kimse doğrudan mesaj ekleyemez', async () => {
    const veliKerem = await signIn('veliKerem')
    expect((await veliKerem.from('messages').select('id').eq('conversation_id', conv)).data ?? []).toEqual([])
    expect((await veliKerem.rpc('send_message', { p_conversation: conv, p_body: 'x' })).error?.code).toBe('P0002')
    const fen = await signIn('fen')
    expect((await fen.from('conversations').select('id')).data ?? []).toEqual([])
    const admin = await signInAdminAal2()
    expect((await admin.from('messages').select('id').eq('conversation_id', conv)).data).toHaveLength(2)
    const veliElif = await signIn('veliElif')
    const { data: u } = await veliElif.auth.getUser()
    expect((await veliElif.from('messages').insert({ conversation_id: conv, sender_id: u.user!.id, body: 'x' })).error).not.toBeNull()
  })

  it('öğretmen yalnız ders verdiği öğrencinin velisine yazar; rehberlik her veliye', async () => {
    const veliKeremId = await idOf('kerem.veli@ornek.com')
    const mat = await signIn('matematik')
    expect(((await mat.rpc('student_parents', { p_student: KEREM })).data ?? []) as unknown[]).toEqual([])
    expect((await mat.rpc('start_conversation', { p_student: KEREM, p_other: veliKeremId })).error?.code).toBe('42501')
    const rehber = await signIn('rehber')
    expect(((await rehber.rpc('student_parents', { p_student: KEREM })).data as { id: string }[]).map((x) => x.id)).toContain(veliKeremId)
    expect((await rehber.rpc('start_conversation', { p_student: KEREM, p_other: veliKeremId })).error).toBeNull()
  })
})
