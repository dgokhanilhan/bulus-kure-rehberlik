import { beforeAll, afterAll, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { anon, service, signIn, signInAdminAal2 } from './helpers'
const svc = service()
let admin: SupabaseClient,
  teacher: SupabaseClient,
  school = '',
  member = '',
  rid = ''
beforeAll(async () => {
  admin = await signInAdminAal2()
  teacher = await signIn('matematik')
  school = (await admin.rpc('my_school')).data!
  member = (await teacher.auth.getUser()).data.user!.id
})
afterAll(async () => {
  if (rid) await svc.from('school_roles').delete().eq('id', rid)
  await svc.from('school_settings').delete().eq('school_id', school).in('key', ['gorunum.tema', 'gorunum.vurgu', 'okul.karsilama'])
})
const args = () => ({ p_id: null, p_name: `Kurucu testi ${Date.now()}`, p_permissions: ['overview'], p_members: [member] })
it('anonim, veli, öğretmen ve MFA doğrulamayan yönetici rol veremez', async () => {
  for (const client of [anon(), await signIn('veliElif'), teacher, await signIn('admin')])
    expect((await client.rpc('manage_school_role', args())).error).not.toBeNull()
  expect((await teacher.rpc('school_role_overview')).error).not.toBeNull()
})
it('yalnız seçili bölüm döner; üyelik kendi rolünü açar, diğer kullanıcıları açmaz', async () => {
  const created = await admin.rpc('manage_school_role', args())
  expect(created.error).toBeNull()
  rid = created.data!
  const summary = await teacher.rpc('school_role_overview')
  expect(summary.error).toBeNull()
  expect(Object.keys(summary.data)).toEqual(['overview'])
  expect(summary.data.overview.students).toBeGreaterThan(0)
  expect((await teacher.from('school_roles').select('id').eq('id', rid)).data).toHaveLength(1)
  expect((await (await signIn('fen')).from('school_roles').select('id').eq('id', rid)).data).toEqual([])
  expect((await (await signIn('veliElif')).rpc('school_role_overview')).error).not.toBeNull()
})
it('doğrudan tablo yazımı ile yetki yükseltilemez; bilinmeyen yetki ve veli üyeliği reddedilir', async () => {
  expect(
    (
      await teacher
        .from('school_roles')
        .update({ permissions: ['students'] })
        .eq('id', rid)
        .select()
    ).data ?? []
  ).toEqual([])
  expect(
    (
      await teacher
        .from('school_role_members')
        .insert({ role_id: rid, school_id: school, profile_id: (await (await signIn('fen')).auth.getUser()).data.user!.id })
    ).error
  ).not.toBeNull()
  expect((await admin.rpc('manage_school_role', { ...args(), p_permissions: ['admin'] })).error).not.toBeNull()
  const parent = (await (await signIn('veliElif')).auth.getUser()).data.user!.id
  expect((await admin.rpc('manage_school_role', { ...args(), p_members: [parent] })).error).not.toBeNull()
})
it('seçili listeler çalışır; ham mesajlar/notlar yoktur; yetki kaldırılması hemen erişimi kapatır', async () => {
  expect(
    (await admin.rpc('manage_school_role', { ...args(), p_id: rid, p_permissions: ['students', 'exams', 'attendance', 'calendar'] })).error
  ).toBeNull()
  const info = await teacher.rpc('school_role_overview')
  expect(info.error).toBeNull()
  expect(Object.keys(info.data).sort()).toEqual(['attendance', 'calendar', 'exams', 'students'])
  expect(Object.keys(info.data.students[0]).sort()).toEqual(['class', 'name', 'schoolNo'])
  expect((await admin.rpc('manage_school_role', { ...args(), p_id: rid, p_permissions: [] })).error).toBeNull()
  expect((await teacher.rpc('school_role_overview')).error).not.toBeNull()
})
it('görünüm seçenekleri MFA ile kaydolur; hatalı seçenek bütün isteği geri alır', async () => {
  expect(
    (await admin.rpc('set_settings', { p: { 'gorunum.tema': 'dark', 'gorunum.vurgu': 'mavi', 'okul.karsilama': 'Hoş geldiniz' } })).error
  ).toBeNull()
  expect((await admin.rpc('setting', { p_key: 'gorunum.tema' })).data).toBe('dark')
  expect((await admin.rpc('set_settings', { p: { 'gorunum.tema': 'light', 'gorunum.vurgu': 'invalid' } })).error).not.toBeNull()
  expect((await admin.rpc('setting', { p_key: 'gorunum.tema' })).data).toBe('dark')
  expect((await teacher.rpc('set_settings', { p: { 'gorunum.tema': 'light' } })).error).not.toBeNull()
})
it('başka okulun rolü, bozuk üyelik ve rol kimliğiyle okul sınırı aşılamaz', async () => {
  const other = (
    await svc
      .from('schools')
      .insert({ name: 'Rol izolasyon testi', slug: `role-test-${Date.now()}` })
      .select('id')
      .single()
  ).data!.id
  let foreign = ''
  try {
    const role = await svc
      .from('school_roles')
      .insert({ school_id: other, name: 'Başka okul müdürü', permissions: ['students'] })
      .select('id')
      .single()
    expect(role.error).toBeNull()
    foreign = role.data!.id
    expect((await svc.from('school_role_members').insert({ role_id: foreign, school_id: other, profile_id: member })).error).toBeNull()
    expect((await teacher.from('school_roles').select('id').eq('id', foreign)).data).toEqual([])
    expect((await teacher.rpc('school_role_overview')).error).not.toBeNull()
    expect((await admin.rpc('manage_school_role', { ...args(), p_id: foreign })).error).not.toBeNull()
  } finally {
    if (foreign) expect((await svc.from('school_roles').delete().eq('id', foreign)).error).toBeNull()
    for (const table of ['classes', 'school_settings', 'bell_times', 'courses', 'academic_years', 'gallery_categories'])
      expect((await svc.from(table).delete().eq('school_id', other)).error).toBeNull()
    expect((await svc.from('schools').delete().eq('id', other)).error).toBeNull()
  }
})
