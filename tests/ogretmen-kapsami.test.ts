// Öğretmen yalnız atandığı sınıfların öğrencilerini görür (0023); çok çocuklu veli yalnız bağlı çocuklarını görür.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { service, signIn, signInAdminAal2, ELIF, KEREM } from './helpers'

const svc = service()
let admin: SupabaseClient
let mat: SupabaseClient
const stamp = Date.now()
const ids: Record<string, string> = {}
const V = { email: `kapsam-veli-${stamp}@ornek.com`, id: '' }
const T = { email: `kapsam-ogretmen-${stamp}@ornek.com`, id: '' }
const PASS = 'Deneme123!'

async function makeUser(u: typeof V, meta: Record<string, unknown>) {
  const { data, error } = await svc.auth.admin.createUser({ email: u.email, password: PASS, email_confirm: true, user_metadata: { school: 'bulus-kure', consent_version: 'v1', ...meta } })
  if (error) throw error
  u.id = data.user.id
  await svc.from('profiles').update({ status: 'approved' }).eq('id', u.id)
}
async function login(email: string) {
  const c = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } })
  const { error } = await c.auth.signInWithPassword({ email, password: PASS })
  if (error) throw error
  return c
}
const classesSeen = async (c: SupabaseClient) => [...new Set(((await c.from('students').select('class_name')).data ?? []).map((s) => s.class_name))].sort()

beforeAll(async () => {
  admin = await signInAdminAal2()
  mat = await signIn('matematik')
  for (const n of ['8/A', '8/B', '8/C']) ids[n] = (await svc.from('classes').select('id').eq('name', n).single()).data!.id
  ids.mat = (await svc.from('profiles').select('id').eq('email', 'matematik@buluskure.k12.tr').single()).data!.id
  ids.course = (await svc.from('courses').select('id').eq('name', 'Matematik').limit(1).single()).data!.id
  ids.ogr8C = (await svc.from('students').select('id').eq('class_name', '8/C').limit(1).single()).data!.id
  await makeUser(V, { role: 'veli', full_name: 'Üç Çocuklu Kapsam', declared: { childName: 'Elif Yıldız', childClass: '8/A', relation: 'Anne' } })
  await makeUser(T, { role: 'ogretmen', full_name: 'Kapsam Öğretmen', branch: 'Fizik' })
})
afterAll(async () => {
  await svc.from('teaching_assignments').delete().eq('teacher_id', ids.mat!).eq('class_id', ids['8/B']!)
  await svc.from('classes').update({ homeroom_teacher_id: null }).eq('id', ids['8/C']!).eq('homeroom_teacher_id', T.id)
  for (const u of [V, T]) if (u.id) await svc.auth.admin.deleteUser(u.id)
})

describe('Öğretmen öğrenci kapsamı', () => {
  it('yönetici (aal2) ve rehberlik tüm öğrencileri görür', async () => {
    expect(await classesSeen(admin)).toEqual(['8/A', '8/B', '8/C'])
    expect(await classesSeen(await signIn('rehber'))).toEqual(['8/A', '8/B', '8/C'])
  })

  it('öğretmen yalnız atandığı sınıfı görür; başka sınıf öğrencisi kimlikle, sorguyla ve RPC ile açılamaz', async () => {
    expect(await classesSeen(mat)).toEqual(['8/A'])
    expect((await mat.from('students').select('id').eq('id', KEREM)).data).toEqual([])
    expect((await mat.rpc('can_see_student', { sid: KEREM })).data).toBe(false)
    expect((await mat.rpc('can_see_student', { sid: ELIF })).data).toBe(true)
    expect((await mat.from('exam_results').select('student_id').eq('student_id', KEREM)).data).toEqual([])
    expect((await mat.from('attendance').select('id').eq('student_id', KEREM)).data).toEqual([])
    expect((await mat.from('notes').insert({ student_id: KEREM, author_id: ids.mat, body: 'x', visibility: 'ogretmen' })).error).not.toBeNull()
    expect(((await mat.rpc('child_contacts', { p_student: KEREM })).data ?? []) as unknown[]).toEqual([])
  })

  it('yeni atama erişimi hemen açar, kaldırılınca kapanır; birden çok sınıfın hepsi görünür', async () => {
    expect((await admin.from('teaching_assignments').insert({ school_id: '00000000-0000-4000-8000-000000000001', class_id: ids['8/B'], course_id: ids.course, teacher_id: ids.mat })).error).toBeNull()
    expect(await classesSeen(mat)).toEqual(['8/A', '8/B'])
    expect((await mat.rpc('can_see_student', { sid: KEREM })).data).toBe(true)
    await admin.from('teaching_assignments').delete().eq('teacher_id', ids.mat!).eq('class_id', ids['8/B']!)
    expect(await classesSeen(mat)).toEqual(['8/A'])
    expect((await mat.rpc('can_see_student', { sid: KEREM })).data).toBe(false)
  })

  it('sınıf öğretmenliği de erişim verir; ataması olmayan öğretmen öğrenci görmez', async () => {
    const t = await login(T.email)
    expect(await classesSeen(t)).toEqual([])
    await admin.from('classes').update({ homeroom_teacher_id: T.id }).eq('id', ids['8/C']!)
    expect(await classesSeen(t)).toEqual(['8/C'])
    expect((await t.rpc('can_see_student', { sid: ids.ogr8C })).data).toBe(true)
  })

  it('iki rollü hesap: veritabanında öğretmen sınıfı + kendi çocuğu; başkası değil', async () => {
    expect((await admin.rpc('admin_add_role', { p_profile: T.id, p_role: 'veli', p: { students: [{ student_id: KEREM, relation: 'Baba' }] } })).error).toBeNull()
    const t = await login(T.email)
    const seen = ((await t.from('students').select('id, class_name')).data ?? [])
    expect(new Set(seen.map((s) => s.class_name))).toEqual(new Set(['8/B', '8/C']))
    expect(seen.filter((s) => s.class_name === '8/B').map((s) => s.id)).toEqual([KEREM]) // 8/B'de yalnız kendi çocuğu
    expect((await t.rpc('can_see_student', { sid: ELIF })).data).toBe(false)
  })

  it('devamsızlık uyarı listesi yalnız görebildiği öğrencileri içerir', async () => {
    const mine = ((await mat.rpc('attendance_watchlist')).data ?? []) as { class_name: string }[]
    expect(mine.every((r) => r.class_name === '8/A')).toBe(true)
    const t = ((await (await login(T.email)).rpc('attendance_watchlist')).data ?? []) as { class_name: string }[]
    expect(t.some((r) => r.class_name === '8/A')).toBe(false)
  })
})

describe('Çok çocuklu veli', () => {
  it('yönetici bir veliye üç öğrenci bağlar; veli yalnız bu üçünü görür; bağlantılar işlem kaydına yazılır', async () => {
    const kids = [ELIF, KEREM, ids.ogr8C!]
    for (const sid of kids) expect((await admin.from('parent_links').insert({ parent_id: V.id, student_id: sid, relation: 'Anne' })).error).toBeNull()
    const v = await login(V.email)
    expect(((await v.from('students').select('id')).data ?? []).map((s) => s.id).sort()).toEqual([...kids].sort())
    const other = (await svc.from('students').select('id').eq('class_name', '8/A').neq('id', ELIF).limit(1).single()).data!.id
    expect((await v.rpc('can_see_student', { sid: other })).data).toBe(false)
    expect((await v.from('attendance').select('id').eq('student_id', other)).data).toEqual([])
    const { data: log } = await svc.from('audit_log').select('action').eq('entity_id', V.id).eq('action', 'parent_link_add')
    expect(log).toHaveLength(3)
    // Bağlantı kaldırılınca erişim kalkar ve kaydedilir
    await admin.from('parent_links').delete().eq('parent_id', V.id).eq('student_id', KEREM)
    expect((await v.rpc('can_see_student', { sid: KEREM })).data).toBe(false)
    expect((await svc.from('audit_log').select('action').eq('entity_id', V.id).eq('action', 'parent_link_remove')).data).toHaveLength(1)
    // Veli bağlantı ekleyemez/silemez
    expect((await v.from('parent_links').insert({ parent_id: V.id, student_id: other })).error).not.toBeNull()
  })
})
