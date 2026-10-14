import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { login, logout, loginAdmin, resetAdminMfa, service, totpCode } from './helpers'
const svc = service(),
  stamp = Date.now(),
  email = `hesap-${stamp}@ornek.com`,
  password = 'Deneme123!',
  school = '00000000-0000-4000-8000-000000000001'
let uid = '',
  cls = ''
test.beforeAll(async () => {
  const u = await svc.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { school: 'bulus-kure', consent_version: 'v1', full_name: 'Hesap Test Öğretmeni', role: 'ogretmen', branch: 'Rehberlik' },
  })
  if (u.error) throw u.error
  uid = u.data.user!.id
  await svc.from('profiles').update({ status: 'approved' }).eq('id', uid)
})
test.afterAll(async () => {
  if (uid) await svc.auth.admin.deleteUser(uid)
  if (cls) await svc.from('classes').delete().eq('id', cls)
})
test('hesap ayarları: kişisel tema, şifre ve e-posta formları; isteğe bağlı MFA sonraki girişte zorunlu', async ({ page }) => {
  await login(page, email, password)
  await page.getByRole('button', { name: /^Profil:/ }).click()
  await page.getByRole('menuitem', { name: 'Hesap ayarları', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Hesap ayarları', exact: true })).toBeVisible()
  await page.getByLabel('Tema', { exact: true }).selectOption('light')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await expect(page.getByLabel('Mevcut şifre', { exact: true })).toBeVisible()
  await expect(page.getByLabel('Yeni e-posta', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Authenticator ile etkinleştir' }).click()
  const secret = (await page.getByTestId('totp-secret').innerText()).replace(/\s/g, '')
  await page.getByLabel('Kod', { exact: true }).fill(await totpCode(secret))
  await page.getByRole('button', { name: 'Doğrula ve gir' }).click()
  await expect(page.getByText('Aktif', { exact: true })).toBeVisible()
  await logout(page)
  await login(page, email, password)
  await expect(page.getByRole('heading', { name: 'Authenticator kodu' })).toBeVisible()
  const code = await totpCode(secret)
  await page.getByLabel('Kod', { exact: true }).fill(code)
  await page.getByRole('button', { name: 'Doğrula ve gir' }).click()
  await expect(page.getByRole('navigation', { name: 'Ana menü' })).toBeVisible()
  await page.goto('/hesap-ayarlari')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  const ax = await new AxeBuilder({ page }).analyze()
  expect(ax.violations.filter((v) => ['critical', 'serious'].includes(v.impact ?? ''))).toEqual([])
})
test('sınıfta alan seçilir, adında görünür; 10. sınıfta alan yok', async ({ page }) => {
  await resetAdminMfa()
  await loginAdmin(page)
  await page.goto('/yonetim?sekme=siniflar')
  await page.getByRole('button', { name: 'Sınıf ekle', exact: true }).click()
  await page.getByLabel('Düzey', { exact: true }).selectOption('11')
  await page.getByLabel('Şube', { exact: true }).selectOption('Z')
  await page.getByLabel('Alan', { exact: true }).selectOption('EA')
  await page.getByRole('button', { name: 'Kaydet', exact: true }).click()
  const c = await svc.from('classes').select('id,name').eq('school_id', school).eq('grade', 11).eq('section', 'Z').single()
  if (c.error) throw c.error
  cls = c.data.id
  expect(c.data.name).toBe('11/Z · EA')
  await expect(page.getByText('11/Z · EA', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Sınıf ekle', exact: true }).click()
  await page.getByLabel('Düzey', { exact: true }).selectOption('10')
  await expect(page.getByLabel('Alan', { exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Vazgeç', exact: true }).click()
})
