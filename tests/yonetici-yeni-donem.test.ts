import { beforeAll, afterAll, it, expect } from 'vitest'
import { generateSync } from 'otplib'
import { execFileSync } from 'node:child_process'
import { anon, service, signIn, signInAdminAal2 } from './helpers'
import type { SupabaseClient } from '@supabase/supabase-js'
const svc = service(),
  stamp = Date.now(),
  password = 'Deneme123!'
let admin: SupabaseClient,
  school = '',
  year = '',
  oldYear = '',
  uid = '',
  localAdmin: SupabaseClient
let promoted: string,
  graduate: string,
  grade12: string,
  extraAdminId = ''
const familyIds: string[] = []
async function verified(c: SupabaseClient) {
  const f = await c.auth.mfa.enroll({ factorType: 'totp', friendlyName: `admin-test-${stamp}` })
  if (f.error) throw f.error
  const v = await c.auth.mfa.challengeAndVerify({ factorId: f.data.id, code: generateSync({ secret: f.data.totp.secret }) })
  if (v.error) throw v.error
}
beforeAll(async () => {
  admin = await signInAdminAal2()
  const schoolRes = await svc
    .from('schools')
    .insert({ name: 'Dönem Test Okulu', slug: `donem-test-${stamp}` })
    .select('id')
    .single()
  expect(schoolRes.error).toBeNull()
  school = schoolRes.data!.id
  const u = await svc.auth.admin.createUser({
    email: `donem-admin-${stamp}@ornek.com`,
    password,
    email_confirm: true,
    user_metadata: { school: `donem-test-${stamp}`, consent_version: 'v1', full_name: 'Dönem Test Yöneticisi', role: 'ogretmen', branch: 'Matematik' },
  })
  expect(u.error).toBeNull()
  uid = u.data.user!.id
  expect((await svc.from('profiles').update({ role: 'admin', status: 'approved' }).eq('id', uid)).error).toBeNull()
  localAdmin = anon()
  expect((await localAdmin.auth.signInWithPassword({ email: `donem-admin-${stamp}@ornek.com`, password })).error).toBeNull()
  await verified(localAdmin)
  const initial = await svc.from('academic_years').select('id').eq('school_id', school).eq('is_active', true).single()
  expect(initial.error).toBeNull()
  oldYear = initial.data!.id
  expect(
    (
      await svc
        .from('academic_years')
        .update({ name: '2024-2025', starts: '2024-09-01', term1_ends: '2025-01-20', term2_starts: '2025-02-01', ends: '2025-06-30' })
        .eq('id', oldYear)
    ).error,
  ).toBeNull()
  const y = await svc
    .from('academic_years')
    .insert({ school_id: school, name: '2025-2026', starts: '2025-09-01', term1_ends: '2026-01-20', term2_starts: '2026-02-01', ends: '2026-06-30' })
    .select('id')
    .single()
  expect(y.error).toBeNull()
  year = y.data!.id
  for (const grade of [7, 8, 12]) expect((await svc.from('classes').insert({ school_id: school, grade, section: 'A' })).error).toBeNull()
  const students = await svc
    .from('students')
    .insert([
      { school_id: school, full_name: 'Yükselen Test', class_name: '7/A', school_no: '10' },
      { school_id: school, full_name: 'Mezun Sekiz', class_name: '8/A', school_no: '10' },
      { school_id: school, full_name: 'Mezun Oniki', class_name: '12/A', school_no: '10' },
    ])
    .select('id,full_name')
  expect(students.error).toBeNull()
  promoted = students.data!.find((s) => s.full_name === 'Yükselen Test')!.id
  graduate = students.data!.find((s) => s.full_name === 'Mezun Sekiz')!.id
  grade12 = students.data!.find((s) => s.full_name === 'Mezun Oniki')!.id
  expect((await svc.from('meals').insert({ school_id: school, day: '2025-05-01', meal: 'ogle', items: 'Arşiv menüsü' })).error).toBeNull()
  expect((await svc.from('attendance').insert({ school_id: school, student_id: promoted, day: '2025-05-01', status: 'devamsiz' })).error).toBeNull()
})
afterAll(async () => {
  for (const id of familyIds) await svc.auth.admin.deleteUser(id)
  if (extraAdminId) await svc.auth.admin.deleteUser(extraAdminId)
  if (!school) return
  await svc.from('academic_year_archives').delete().eq('school_id', school)
  await svc.from('attendance').delete().eq('school_id', school)
  await svc.from('meals').delete().eq('school_id', school)
  await svc.from('gallery_albums').delete().eq('school_id', school)
  if (uid) await svc.auth.admin.deleteUser(uid)
  await svc.from('students').delete().eq('school_id', school)
  await svc.from('classes').delete().eq('school_id', school)
  for (const t of ['courses', 'bell_times', 'gallery_categories', 'school_roles', 'school_settings', 'academic_years'])
    expect((await svc.from(t).delete().eq('school_id', school)).error).toBeNull()
  expect((await svc.from('schools').delete().eq('id', school)).error).toBeNull()
})
it('aynı okul numarası farklı ad/sınıflarda serbest; kimlikler ayrı kalır', async () => {
  const r = await svc.from('students').select('id').eq('school_id', school).eq('school_no', '10')
  expect(r.data).toHaveLength(3)
  expect(new Set(r.data!.map((x) => x.id)).size).toBe(3)
})
it('yetkisiz/MFA olmayan hesap yönetici rolü ekleyemez; veliye ek rol MFA öncesi yetki vermez', async () => {
  const email = `ek-admin-${stamp}@ornek.com`
  const u = await svc.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      school: 'bulus-kure',
      consent_version: 'v1',
      full_name: 'Ek Yönetici Testi',
      role: 'veli',
      declared: { relation: 'Anne', childName: 'Elif Yıldız', childClass: '8/A' },
    },
  })
  expect(u.error).toBeNull()
  extraAdminId = u.data.user!.id
  await svc.from('profiles').update({ status: 'approved' }).eq('id', extraAdminId)
  expect((await admin.rpc('admin_add_role', { p_profile: extraAdminId, p_role: 'ogretmen', p: { branch: 'Rehberlik' } })).error).toBeNull()
  for (const c of [anon(), await signIn('matematik'), await signIn('admin')])
    expect((await c.rpc('admin_add_role', { p_profile: extraAdminId, p_role: 'admin' })).error).not.toBeNull()
  expect((await admin.rpc('admin_add_role', { p_profile: extraAdminId, p_role: 'admin' })).error).toBeNull()
  const c = anon()
  await c.auth.signInWithPassword({ email, password })
  expect((await c.rpc('is_admin')).data).toBe(false)
  expect((await c.rpc('is_staff')).data).toBe(false)
  expect((await c.rpc('my_school')).data).toBeNull()
  expect((await c.from('students').select('id')).data).toEqual([])
  expect((await c.from('notifications').select('id')).data).toEqual([])
  expect((await c.rpc('set_settings', { p: { 'okul.karsilama': 'olmamalı' } })).error).not.toBeNull()
  await verified(c)
  expect((await c.rpc('is_admin')).data).toBe(true)
  expect((await c.rpc('admin_remove_role', { p_profile: extraAdminId, p_role: 'admin' })).error).not.toBeNull()
  expect((await localAdmin.rpc('admin_remove_role', { p_profile: extraAdminId, p_role: 'admin' })).error).not.toBeNull()
  expect((await admin.rpc('admin_remove_role', { p_profile: extraAdminId, p_role: 'admin' })).error).toBeNull()
  expect((await c.rpc('is_admin')).data).toBe(false)
})
it('önizleme hiçbir kaydı değiştirmez; diğer okul, veli ve MFA olmayan hesap erişemez', async () => {
  const p = await localAdmin.rpc('preview_year_transition', { p_target: year })
  expect(p.error).toBeNull()
  expect(p.data.promoted).toBe(1)
  expect(p.data.graduates).toBe(2)
  expect(p.data.counts.students).toBe(3)
  expect((await svc.from('students').select('class_name').eq('id', promoted).single()).data!.class_name).toBe('7/A')
  expect((await svc.from('meals').select('id').eq('school_id', school)).data).toHaveLength(1)
  for (const c of [admin, anon(), await signIn('veliElif'), await signIn('admin')])
    expect((await c.rpc('preview_year_transition', { p_target: year })).error).not.toBeNull()
  expect((await (await signIn('veliElif')).from('academic_year_archives').select('id')).data).toEqual([])
})
it('başlangıcı gelmeyen gelecek yıl ve yanlış onay mevcut dönemi sıfırlayamaz; doğrudan aktif yapma reddedilir', async () => {
  const f = await svc
    .from('academic_years')
    .insert({ school_id: school, name: '2090-2091', starts: '2090-09-01', term1_ends: '2091-01-20', term2_starts: '2091-02-01', ends: '2091-06-30' })
    .select('id')
    .single()
  expect(f.error).toBeNull()
  expect((await localAdmin.rpc('start_next_academic_year', { p_target: f.data!.id, p_confirm: '2090-2091' })).error?.message).toContain('henüz gelmedi')
  expect((await localAdmin.rpc('start_next_academic_year', { p_target: year, p_confirm: 'yanlış' })).error).not.toBeNull()
  expect((await localAdmin.from('academic_years').update({ is_active: true }).eq('id', year)).error).not.toBeNull()
  expect((await svc.from('students').select('class_name').eq('id', promoted).single()).data!.class_name).toBe('7/A')
  expect((await svc.from('academic_year_archives').select('id').eq('school_id', school)).data).toEqual([])
})
it('işlem ortasındaki hata arşivleme ve sıfırlamanın tamamını geri alır', async () => {
  const sql = (query: string) =>
    execFileSync('docker', ['exec', 'supabase_db_bulus-kure-rehberlik', 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-c', query], {
      stdio: 'pipe',
    })
  sql(
    `create function public.year_test_failure() returns trigger language plpgsql as $$ begin if old.school_id='${school}'::uuid then raise exception 'Yerel geri alma testi'; end if; return old; end $$; create trigger year_test_failure before delete on public.meals for each row execute function public.year_test_failure();`,
  )
  try {
    const r = await localAdmin.rpc('start_next_academic_year', { p_target: year, p_confirm: '2025-2026' })
    expect(r.error?.message).toContain('Yerel geri alma testi')
    expect((await svc.from('academic_year_archives').select('id').eq('school_id', school)).data).toEqual([])
    expect((await svc.from('meals').select('id').eq('school_id', school)).data).toHaveLength(1)
    expect((await svc.from('attendance').select('id').eq('school_id', school)).data).toHaveLength(1)
    expect((await svc.from('students').select('class_name').eq('id', promoted).single()).data!.class_name).toBe('7/A')
    expect((await svc.from('academic_years').select('is_active').eq('id', oldYear).single()).data!.is_active).toBe(true)
  } finally {
    sql('drop trigger year_test_failure on public.meals; drop function public.year_test_failure();')
  }
})
it('geçiş geçmişi arşivler, 7→8 yükseltir, 8/12 mezunları taşımaz; tekrar çalıştırma sınıfı yeniden artırmaz', async () => {
  for (const [index, role] of ['veli', 'veli', 'ogretmen', 'ogrenci'].entries()) {
    const r = await svc.auth.admin.createUser({
      email: `donem-aile-${index}-${stamp}@ornek.com`,
      password,
      email_confirm: true,
      user_metadata: {
        school: `donem-test-${stamp}`,
        full_name: `Dönem Aile ${index}`,
        consent_version: 'v1',
        role,
        branch: role === 'ogretmen' ? 'Matematik' : undefined,
        declared: role === 'ogrenci' ? { className: '8/A', schoolNo: '10' } : { childName: 'Mezun Sekiz', childClass: '8/A', relation: 'Anne' },
      },
    })
    expect(r.error).toBeNull()
    const id = r.data.user!.id
    familyIds.push(id)
    expect(
      (
        await svc
          .from('profiles')
          .update({ status: 'approved', ...(role === 'ogrenci' ? { student_id: graduate } : {}) })
          .eq('id', id)
      ).error,
    ).toBeNull()
    if (role === 'veli')
      expect(
        (
          await svc
            .from('parent_links')
            .insert([
              { parent_id: id, student_id: graduate, relation: 'Anne' },
              ...(index === 1 ? [{ parent_id: id, student_id: promoted, relation: 'Anne' }] : []),
            ])
        ).error,
      ).toBeNull()
    if (role === 'ogretmen')
      expect(
        (await localAdmin.rpc('admin_add_role', { p_profile: id, p_role: 'veli', p: { students: [{ student_id: graduate, relation: 'Anne' }] } })).error,
      ).toBeNull()
  }
  expect((await localAdmin.from('notes').insert({ student_id: promoted, author_id: uid, visibility: 'rehber', body: 'Özel arşiv notu' })).error).toBeNull()
  expect((await localAdmin.from('gallery_albums').insert({ title: 'Eski dönem albümü', event_date: '2025-05-01', audience: 'okul' })).error).toBeNull()
  const r = await localAdmin.rpc('start_next_academic_year', { p_target: year, p_confirm: '2025-2026' })
  expect(r.error).toBeNull()
  const st = await svc.from('students').select('id,class_name,archived_at').eq('school_id', school)
  expect(st.data!.find((s) => s.id === promoted)).toMatchObject({ class_name: '8/A', archived_at: null })
  for (const id of [graduate, grade12]) expect(st.data!.find((s) => s.id === id)!.archived_at).not.toBeNull()
  expect((await svc.from('meals').select('id').eq('school_id', school)).data).toEqual([])
  expect((await svc.from('attendance').select('id').eq('school_id', school)).data).toEqual([])
  const people = await svc.from('profiles').select('id,status').in('id', familyIds)
  expect(people.data!.find((p) => p.id === familyIds[0])!.status).toBe('rejected')
  expect(people.data!.find((p) => p.id === familyIds[1])!.status).toBe('approved')
  expect(people.data!.find((p) => p.id === familyIds[2])!.status).toBe('approved')
  expect(people.data!.find((p) => p.id === familyIds[3])!.status).toBe('rejected')
  expect((await svc.from('gallery_albums').select('status').eq('school_id', school).single()).data!.status).toBe('arsiv')
  const a = await localAdmin.from('academic_year_archives').select('data').eq('id', r.data).single()
  expect(a.error).toBeNull()
  expect(a.data!.data.students).toHaveLength(3)
  expect(a.data!.data.meals[0].items).toBe('Arşiv menüsü')
  expect(a.data!.data.students.find((s: { id: string }) => s.id === promoted).class_name).toBe('7/A')
  expect(a.data!.data.notes[0].body).toBeNull()
  expect(a.data!.data.notes[0].body_enc).toBeTruthy()
  const readable = await localAdmin.rpc('read_academic_year_archive', { p_archive: r.data })
  expect(readable.error).toBeNull()
  expect(readable.data.notes[0].body).toBe('Özel arşiv notu')
  for (const c of [admin, anon(), await signIn('veliElif'), await signIn('admin')])
    expect((await c.rpc('read_academic_year_archive', { p_archive: r.data })).error).not.toBeNull()
  expect((await admin.from('academic_year_archives').select('id').eq('id', r.data)).data).toEqual([])
  expect((await localAdmin.rpc('start_next_academic_year', { p_target: year, p_confirm: '2025-2026' })).error).not.toBeNull()
  expect((await svc.from('students').select('class_name').eq('id', promoted).single()).data!.class_name).toBe('8/A')
})
