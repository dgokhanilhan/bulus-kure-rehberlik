import { test, expect } from '@playwright/test'
import { generateSync } from 'otplib'
import AxeBuilder from '@axe-core/playwright'
import { DEMO, login, loginAdmin, logout, resetAdminMfa, service } from './helpers'
const svc = service(),
  stamp = Date.now(),
  SCHOOL = '00000000-0000-4000-8000-000000000001',
  email = `e2e-admin-role-${stamp}@ornek.com`,
  password = 'Deneme123!'
let uid = '',
  futureYear = '',
  hw = '',
  guidanceId = ''
test.beforeAll(async () => {
  const u = await svc.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      school: 'bulus-kure',
      consent_version: 'v1', acik_riza_version: 'ACIK-RIZA-1.0',
      full_name: 'E2E Yeni Yönetici',
      role: 'veli',
      declared: { childName: 'Elif Yıldız', childClass: '8/A', relation: 'Anne' },
    },
  })
  if (u.error) throw u.error
  uid = u.data.user!.id
  await svc.from('profiles').update({ status: 'approved' }).eq('id', uid)
  await svc.from('parent_links').insert({ parent_id: uid, student_id: '00000000-0000-4000-8001-000000001184', relation: 'Anne' })
})
test.afterAll(async () => {
  if (uid) await svc.auth.admin.deleteUser(uid)
  if (guidanceId) await svc.auth.admin.deleteUser(guidanceId)
  if (futureYear) await svc.from('academic_years').delete().eq('id', futureYear)
  if (hw) await svc.from('homework').delete().eq('id', hw)
})
test('mevcut veli hesabına yönetici atanır; MFA kurulmadan yönetim açılmaz; rol geçişleri korunur', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await resetAdminMfa()
  await loginAdmin(page)
  await page.goto('/yonetim?sekme=guvenlik')
  await page.getByLabel('Kullanıcı', { exact: true }).selectOption(uid)
  await page.getByRole('button', { name: 'Yönetici rolü ekle', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Yönetici rolü ekle' })
  await expect(dialog.getByText(/seninle aynı yönetici yetkilerine/)).toBeVisible()
  await dialog.getByRole('button', { name: 'Rolü ekle', exact: true }).click()
  await expect(page.getByText('E2E Yeni Yönetici: Yönetici rolü eklendi')).toBeVisible()
  await logout(page)
  await login(page, email, password)
  await expect(page.getByText('İki adımlı doğrulama')).toBeVisible()
  await page.goto('/yonetim')
  await expect(page.getByRole('heading', { name: 'Yönetim Merkezi' })).not.toBeVisible()
  const secret = (await page.getByTestId('totp-secret').innerText()).replace(/\s/g, '')
  await page.getByLabel('Kod', { exact: true }).fill(generateSync({ secret }))
  await page.getByRole('button', { name: 'Doğrula ve gir' }).click()
  await page.getByRole('button', { name: 'Yönetici olarak devam et', exact: true }).click()
  await page.getByRole('link', { name: 'Yönetim', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Yönetim Merkezi' })).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Ana menü' }).getByRole('link', { name: 'Okul yönetimi', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: /Profil:/ }).click()
  await page.getByRole('menuitem', { name: 'Rol değiştir: Veli olarak devam et' }).click()
  await expect(page.getByRole('navigation', { name: 'Ana menü' }).getByRole('link', { name: 'Yönetim', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: /Profil:/ }).click()
  await page.getByRole('menuitem', { name: 'Rol değiştir: Yönetici olarak devam et' }).click()
  await expect(page.getByRole('navigation', { name: 'Ana menü' }).getByRole('link', { name: 'Yönetim', exact: true })).toBeVisible()
})
test('gelecek dönem önizlemesi mevcut kayıtları değiştirmez; erken başlatma düğmesi kapalı', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const y = await svc
    .from('academic_years')
    .insert({ school_id: SCHOOL, name: '2027-2028', starts: '2027-09-01', term1_ends: '2028-01-20', term2_starts: '2028-02-01', ends: '2028-06-30' })
    .select('id')
    .single()
  if (y.error) throw y.error
  futureYear = y.data.id
  const before = await svc.from('students').select('id,class_name,archived_at').eq('school_id', SCHOOL).order('id')
  await resetAdminMfa()
  await loginAdmin(page)
  await page.goto('/yonetim?sekme=yillar')
  await page.getByRole('button', { name: '2027-2028 yeni dönemi başlat' }).click()
  const dialog = page.getByRole('dialog', { name: '2027-2028 yeni dönemi başlat' })
  await expect(dialog.getByText(/henüz gelmedi/)).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Arşivle ve yeni dönemi başlat' })).toBeDisabled()
  await expect(dialog.getByText(/mezun arşivine alınacak/)).toBeVisible()
  const a11y = await new AxeBuilder({ page }).include('[role="dialog"]').withTags(['wcag2a', 'wcag2aa']).analyze()
  expect(
    a11y.violations
      .filter((v) => v.impact === 'serious' || v.impact === 'critical')
      .map((v) => ({ id: v.id, nodes: v.nodes.map((n) => ({ target: n.target, reason: n.failureSummary })) })),
  ).toEqual([])
  await page.screenshot({ path: 'e2e-artifacts/yeni-donem-onizleme.png', fullPage: true })
  expect((await svc.from('students').select('id,class_name,archived_at').eq('school_id', SCHOOL).order('id')).data).toEqual(before.data)
})
test('Getirmedi ödev durumu işaretlenir ve kaydedilir', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const teacher = (await svc.from('profiles').select('id').eq('email', DEMO.matematik[0]).single()).data!.id
  const cls = (await svc.from('classes').select('id').eq('school_id', SCHOOL).eq('name', '8/A').single()).data!.id
  const course = (await svc.from('courses').select('id').eq('school_id', SCHOOL).eq('name', 'Matematik').single()).data!.id
  const h = await svc
    .from('homework')
    .insert({ school_id: SCHOOL, teacher_id: teacher, class_id: cls, course_id: course, due_on: '2090-01-02', title: `E2E Getirmedi ${stamp}` })
    .select('id')
    .single()
  if (h.error) throw h.error
  hw = h.data.id
  await login(page, ...DEMO.matematik)
  await expect(page.getByRole('navigation', { name: 'Ana menü' })).toBeVisible()
  await page.goto(`/odevler?odev=${hw}`)
  await expect(page.getByRole('heading', { name: `E2E Getirmedi ${stamp}`, exact: true })).toBeVisible()
  const row = page.getByRole('row').filter({ hasText: 'Elif Yıldız' })
  await row.getByRole('button', { name: 'Getirmedi', exact: true }).click()
  await page.getByRole('button', { name: /Kaydet/ }).click()
  await expect(page.getByText(/öğrencinin durumu kaydedildi/)).toBeVisible()
  expect(
    (await svc.from('homework_students').select('status').eq('homework_id', hw).eq('student_id', '00000000-0000-4000-8001-000000001184').single()).data!.status,
  ).toBe('getirmedi')
})

test('rehber öğretmene yönetici eklenince rehber rolündeki bütün öğrenci erişimi korunur', async ({ page }) => {
  const guidanceEmail = `e2e-rehber-admin-${stamp}@ornek.com`
  const u = await svc.auth.admin.createUser({
    email: guidanceEmail,
    password,
    email_confirm: true,
    user_metadata: { school: 'bulus-kure', consent_version: 'v1', acik_riza_version: 'ACIK-RIZA-1.0', full_name: 'E2E Rehber Yönetici', role: 'ogretmen', branch: 'Rehberlik' },
  })
  if (u.error) throw u.error
  guidanceId = u.data.user!.id
  await svc.from('profiles').update({ status: 'approved' }).eq('id', guidanceId)
  const total = (await svc.from('students').select('id', { count: 'exact', head: true }).eq('school_id', SCHOOL).is('archived_at', null)).count!
  await login(page, guidanceEmail, password)
  await expect(page.getByRole('navigation', { name: 'Ana menü' })).toBeVisible()
  await page.goto('/ogrenciler')
  await expect(page.locator('tbody tr')).toHaveCount(total)
  await logout(page)
  await resetAdminMfa()
  await loginAdmin(page)
  await page.goto('/yonetim?sekme=guvenlik')
  await page.getByLabel('Kullanıcı', { exact: true }).selectOption(guidanceId)
  await page.getByRole('button', { name: 'Yönetici rolü ekle', exact: true }).click()
  await page.getByRole('dialog', { name: 'Yönetici rolü ekle' }).getByRole('button', { name: 'Rolü ekle', exact: true }).click()
  await expect(page.getByText('E2E Rehber Yönetici: Yönetici rolü eklendi')).toBeVisible()
  await logout(page)
  await login(page, guidanceEmail, password)
  const secret = (await page.getByTestId('totp-secret').innerText()).replace(/\s/g, '')
  await page.getByLabel('Kod', { exact: true }).fill(generateSync({ secret }))
  await page.getByRole('button', { name: 'Doğrula ve gir' }).click()
  await page.getByRole('button', { name: 'Öğretmen olarak devam et', exact: true }).click()
  await page.goto('/ogrenciler')
  await expect(page.locator('tbody tr')).toHaveCount(total)
  await expect(page.getByRole('navigation', { name: 'Ana menü' }).getByRole('link', { name: 'Yönetim', exact: true })).toHaveCount(0)
})
