import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { DEMO, login, loginAdmin, resetAdminMfa, service } from './helpers'
const svc = service(),
  name = `Okul kurucusu E2E ${Date.now()}`
test.afterAll(async () => {
  await svc.from('school_roles').delete().eq('name', name)
  await svc
    .from('school_settings')
    .delete()
    .in('key', [
      'genel.alt_baslik',
      'okul.karsilama',
      'gorunum.tema',
      'gorunum.vurgu',
      'gorunum.yazi',
      'gorunum.yogunluk',
      'gorunum.baslik',
      'gorunum.kose',
      'gorunum.hareket',
    ])
})
test('rol oluşturma, sınırlı öğretmen görünümü ve yönetilebilir tasarım', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await resetAdminMfa()
  await loginAdmin(page)
  await page.goto('/yonetim?sekme=guvenlik')
  const roles = page.getByRole('region', { name: 'Özel okul rolleri' })
  await roles.getByRole('button', { name: 'Kurucu şablonu' }).click()
  await roles.getByLabel('Rol adı', { exact: true }).fill(name)
  const teacher = (await svc.from('profiles').select('full_name').eq('email', DEMO.matematik[0]).single()).data!.full_name
  await roles.getByRole('checkbox', { name: teacher, exact: true }).check()
  await roles.getByRole('button', { name: 'Rolü kaydet' }).click()
  await expect(page.getByText('Okul rolü ve yetkileri kaydedildi')).toBeVisible()
  await page.goto('/yonetim?sekme=genel')
  const appearance = page.getByRole('region', { name: 'Görünüm ve karşılama' })
  await appearance.getByLabel('Varsayılan tema').selectOption('light')
  await appearance.getByLabel('Vurgu rengi').selectOption('mor')
  await appearance.getByLabel('Ana sayfa karşılama mesajı').fill('Okulumuza hoş geldiniz')
  await appearance.getByRole('button', { name: 'Görünümü kaydet' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-accent', 'mor')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  const a11y = await new AxeBuilder({ page }).include('main').withTags(['wcag2a', 'wcag2aa']).analyze()
  expect(a11y.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id)).toEqual([])
  await page.screenshot({ path: 'e2e-artifacts/okul-gorunum-ayarlari.png', fullPage: true })
  await appearance.getByLabel('Varsayılan tema').selectOption('dark')
  await appearance.getByLabel('Vurgu rengi').selectOption('mavi')
  await appearance.getByRole('button', { name: 'Görünümü kaydet' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  const darkA11y = await new AxeBuilder({ page }).include('main').withTags(['wcag2a', 'wcag2aa']).analyze()
  expect(
    darkA11y.violations
      .filter((v) => v.impact === 'serious' || v.impact === 'critical')
      .map((v) => ({ id: v.id, nodes: v.nodes.map((n) => ({ target: n.target, reason: n.failureSummary })) }))
  ).toEqual([])
  await page.context().clearCookies()
  await page.evaluate(() => localStorage.clear())
  await login(page, ...DEMO.matematik)
  await expect(page.getByRole('navigation', { name: 'Ana menü' })).toBeVisible()
  await page.goto('/okul-yonetimi')
  await expect(page.getByRole('heading', { name: 'Okul yönetimi', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Okul özeti', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Öğrenci listesi (ad, sınıf, okul no)', exact: true })).not.toBeVisible()
  await page.goto('/panel')
  await expect(page.getByText('Okulumuza hoş geldiniz')).toBeVisible()
  const title = page.locator('.pcard-title').first()
  await expect(title).toHaveCSS('font-weight', '700')
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(title).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: 'e2e-artifacts/ogretmen-panel-mobil.png', fullPage: true })
  await page.context().clearCookies()
  await page.evaluate(() => localStorage.clear())
  await login(page, ...DEMO.veli)
  await expect(page.getByRole('navigation', { name: 'Ana menü' })).toBeVisible()
  await page.goto('/okul-yonetimi')
  await expect(page.getByRole('heading', { name: 'Okul yönetimi', exact: true })).not.toBeVisible()
})
