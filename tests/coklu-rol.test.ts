// Çoklu rol (0020): tek hesapta öğretmen + veli. Yetki rol listesinden (has_role) gelir; seçili rol yalnız arayüzdür.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { service, signIn, signInAdminAal2, KEREM, REHBER_ID, snap, notesOf } from './helpers'

const svc = service()
let admin: SupabaseClient
const stamp = Date.now()
const T = { email: `coklu-ogretmen-${stamp}@ornek.com`, name: 'Çoklu Öğretmen', id: '' }
const V = { email: `coklu-veli-${stamp}@ornek.com`, name: 'Çoklu Veli', id: '' }
const PASS = 'Deneme123!'
const ids: Record<string, string> = {} as Record<'6/A' | '8/B' | 'mat', string>

async function makeUser(u: typeof T, meta: Record<string, unknown>) {
  const { data, error } = await svc.auth.admin.createUser({
    email: u.email, password: PASS, email_confirm: true,
    user_metadata: { school: 'bulus-kure', consent_version: 'v1', full_name: u.name, ...meta },
  })
  if (error) throw error
  u.id = data.user.id
  await svc.from('profiles').update({ status: 'approved' }).eq('id', u.id)
}
async function login(u: typeof T) {
  const c = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } })
  const { error } = await c.auth.signInWithPassword({ email: u.email, password: PASS })
  if (error) throw error
  return c
}
const rolesOf = async (id: string) => ((await svc.from('profile_roles').select('role').eq('profile_id', id).order('role')).data ?? []).map((r) => r.role)
const code = (r: { error: { code?: string } | null }) => r.error?.code

beforeAll(async () => {
  admin = await signInAdminAal2()
  await makeUser(T, { role: 'ogretmen', branch: 'Fizik' })
  await makeUser(V, { role: 'veli', declared: { childName: 'Kerem Aydın', childClass: '8/B', relation: 'Anne' } })
  for (const n of ['6/A', '8/B']) ids[n] = (await svc.from('classes').select('id').eq('name', n).single()).data!.id
  ids.mat = (await svc.from('courses').select('id').eq('name', 'Matematik').limit(1).single()).data!.id
})
afterAll(async () => {
  await svc.from('announcements').delete().like('title', 'Çoklu rol %')
  for (const u of [T, V]) if (u.id) await svc.auth.admin.deleteUser(u.id)
})

describe('Rol tablosu', () => {
  it('her profilin ana rolü aktarıldı; yeni kayıt otomatik eklenir', async () => {
    const { data: p } = await svc.from('profiles').select('id, role')
    const { data: r } = await svc.from('profile_roles').select('profile_id, role')
    for (const x of p!) expect(r!.some((y) => y.profile_id === x.id && y.role === x.role), x.id).toBe(true)
    expect(await rolesOf(T.id)).toEqual(['ogretmen'])
    expect(await rolesOf(V.id)).toEqual(['veli'])
  })

  it('kullanıcı rol tablosuna yazamaz; veli başkasının rolünü okuyamaz', async () => {
    const t = await login(T)
    expect((await t.from('profile_roles').insert({ profile_id: T.id, role: 'admin' })).error).not.toBeNull()
    expect(await rolesOf(T.id)).toEqual(['ogretmen'])
    const v = await login(V)
    expect((await v.from('profile_roles').select('role').eq('profile_id', T.id)).data).toEqual([])
    expect((await v.from('profile_roles').select('role').eq('profile_id', V.id)).data).toEqual([{ role: 'veli' }])
    expect((await v.rpc('is_teacher')).data).toBe(false)
  })
})

describe('Yönetici: rol ekleme', () => {
  it('yalnız yönetici + aal2', async () => {
    const body = { p_profile: T.id, p_role: 'veli', p: { students: [{ student_id: KEREM, relation: 'Baba' }] } }
    expect(code(await (await signIn('rehber')).rpc('admin_add_role', body))).toBe('42501')
    expect(code(await (await signIn('admin')).rpc('admin_add_role', body))).toBe('42501') // aal1
    expect(await rolesOf(T.id)).toEqual(['ogretmen'])
  })

  it('öğretmene veli rolü: öğrenci + yakınlık; işlem kaydı ve bildirim', async () => {
    expect(code(await admin.rpc('admin_add_role', { p_profile: T.id, p_role: 'veli', p: { students: [] } }))).toBe('22023')
    const before = await snap()
    const { error } = await admin.rpc('admin_add_role', { p_profile: T.id, p_role: 'veli', p: { students: [{ student_id: KEREM, relation: 'Baba' }] } })
    expect(error).toBeNull()
    expect(await rolesOf(T.id)).toEqual(['ogretmen', 'veli'])
    expect((await svc.from('parent_links').select('relation').eq('parent_id', T.id)).data).toEqual([{ relation: 'Baba' }])
    const { data: log } = await svc.from('audit_log').select('meta').eq('action', 'role_add').eq('entity_id', T.id).single()
    expect(log!.meta).toMatchObject({ role: 'veli', links: 1 })
    expect(await notesOf(await login(T), before)).toEqual(['Hesabına veli rolü eklendi. Profil menüsünden "Rol değiştir" ile geçebilirsin.'])
    expect(code(await admin.rpc('admin_add_role', { p_profile: T.id, p_role: 'veli', p: { students: [{ student_id: KEREM }] } }))).toBe('23505')
    expect(code(await admin.rpc('admin_add_role', { p_profile: REHBER_ID, p_role: 'ogrenci' }))).toBe('22023')
  })

  it('veliye öğretmen rolü: branş + ders ataması (atama tetikleyicisi rolü tanır)', async () => {
    expect(code(await admin.rpc('admin_add_role', { p_profile: V.id, p_role: 'ogretmen', p: { branch: 'Astroloji' } }))).toBe('22023')
    const { error } = await admin.rpc('admin_add_role', { p_profile: V.id, p_role: 'ogretmen', p: { branch: 'Matematik', assignments: [{ class_id: ids['6/A']!, course_id: ids.mat! }] } })
    expect(error).toBeNull()
    expect(await rolesOf(V.id)).toEqual(['ogretmen', 'veli'])
    expect((await svc.from('profiles').select('role, branch').eq('id', V.id).single()).data).toEqual({ role: 'veli', branch: 'Matematik' })
    expect((await svc.from('teaching_assignments').select('class_id').eq('teacher_id', V.id)).data).toEqual([{ class_id: ids['6/A']! }])
    const v = await login(V)
    expect((await v.rpc('is_teacher')).data).toBe(true)
    // Diğer öğretmenler onu öğretmen listesinde görür
    const { data: names } = await (await signIn('matematik')).from('profiles').select('id').eq('id', V.id)
    expect(names).toEqual([{ id: V.id }])
  })
})

describe('İki rollü hesabın yetkileri', () => {
  it('veli olarak: çocuğunun öğretmenleri (kendisi hariç); veli sıfatıyla yazışma', async () => {
    const t = await login(T)
    expect((await t.rpc('is_parent_of', { sid: KEREM })).data).toBe(true)
    const { data: contacts } = await t.rpc('child_contacts', { p_student: KEREM })
    const list = contacts as { id: string; role: string }[]
    expect(list.some((c) => c.id === REHBER_ID && c.role === 'ogretmen')).toBe(true)
    expect(list.some((c) => c.id === T.id)).toBe(false)
    const { data: conv, error } = await t.rpc('start_conversation', { p_student: KEREM, p_other: REHBER_ID })
    expect(error).toBeNull()
    expect((await svc.from('conversations').select('parent_id, teacher_id').eq('id', conv).single()).data).toEqual({ parent_id: T.id, teacher_id: REHBER_ID })
    expect((await t.rpc('start_conversation', { p_student: KEREM, p_other: T.id })).error?.message).toMatch(/Kendinle/)
  })

  it('duyuru: veli hedefi çocuğun sınıfına göre, öğretmen hedefi ders verdiği sınıfa göre', async () => {
    const rehber = await signIn('rehber')
    const add = async (title: string, class_id: string, audience: string[]) =>
      (await rehber.from('announcements').insert({ title, body: 'x', scope: 'sinif', class_id, audience, school_id: (await svc.from('classes').select('school_id').eq('id', class_id).single()).data!.school_id, created_by: REHBER_ID }).select('id').single()).data!.id as string
    const velis8B = await add('Çoklu rol veli 8/B', ids['8/B']!, ['veli'])
    const velis6A = await add('Çoklu rol veli 6/A', ids['6/A']!, ['veli'])
    const ogr6A = await add('Çoklu rol öğretmen 6/A', ids['6/A']!, ['ogretmen'])
    const seen = async (c: SupabaseClient) => ((await c.from('announcements').select('id').like('title', 'Çoklu rol %')).data ?? []).map((r) => r.id).sort()
    // T: 8/B'de çocuğu var, 6/A'ya ders vermiyor → yalnız 8/B veli duyurusu
    expect(await seen(await login(T))).toEqual([velis8B])
    // V: bağlı çocuğu yok, 6/A sınıfına ders veriyor → veli hedefli 6/A duyurusunu ALMAZ, öğretmen hedefli 6/A duyurusunu alır
    const v = await seen(await login(V))
    expect(v).toContain(ogr6A)
    expect(v).not.toContain(velis6A)
  })
})

describe('Yönetici: rol kaldırma', () => {
  it('ana rol kaldırılamaz; ilişki varken kaldırılmaz, ilişki kalkınca kaldırılır', async () => {
    expect((await admin.rpc('admin_remove_role', { p_profile: T.id, p_role: 'ogretmen' })).error?.message).toMatch(/ana rolü/)
    expect((await admin.rpc('admin_remove_role', { p_profile: T.id, p_role: 'veli' })).error?.message).toMatch(/1 öğrenciyle veli bağlantısını/)
    expect((await admin.rpc('admin_remove_role', { p_profile: V.id, p_role: 'ogretmen' })).error?.message).toMatch(/1 ders ataması/)
    expect(code(await (await signIn('rehber')).rpc('admin_remove_role', { p_profile: T.id, p_role: 'veli' }))).toBe('42501')
    await admin.from('parent_links').delete().eq('parent_id', T.id)
    expect((await admin.rpc('admin_remove_role', { p_profile: T.id, p_role: 'veli' })).error).toBeNull()
    expect(await rolesOf(T.id)).toEqual(['ogretmen'])
    expect((await svc.from('audit_log').select('meta').eq('action', 'role_remove').eq('entity_id', T.id).single()).data!.meta).toEqual({ role: 'veli' })
  })

  it('ana rol elle değişirse eski otomatik satır kalkar, yöneticinin eklediği rol kalır', async () => {
    await svc.from('profiles').update({ role: 'ogretmen' }).eq('id', V.id) // yalnız veritabanından yapılabilen bir düzeltme
    expect(await rolesOf(V.id)).toEqual(['ogretmen'])
    await svc.from('profiles').update({ role: 'veli' }).eq('id', V.id)
    expect(await rolesOf(V.id)).toEqual(['ogretmen', 'veli']) // ogretmen satırı yöneticinin eklediği (created_by dolu)
  })
})
