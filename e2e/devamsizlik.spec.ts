// Faz E · Devamsızlık: sınıra yaklaşanlar kartı, öğrenci devamsızlık sekmesi ve raporu (PDF), yoklama ayarları, veli görünümü.
import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { DEMO, login, loginAdmin, resetAdminMfa, service, shot } from './helpers'

async function axe(page: Page, label: string) {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.waitForTimeout(300)
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
  const bad = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
  expect(bad.map((v) => `${label}: ${v.id} (${v.nodes.length}) ${v.nodes[0]?.target}`)).toEqual([])
}
const svc = service()
const inApp = (page: Page) => expect(page.getByRole('navigation', { name: 'Ana menü' })).toBeVisible()

test.describe.serial('Devamsızlık', () => {
  test.beforeAll(async () => {
    await svc.from('school_settings').delete().like('key', 'yoklama.%')
    await resetAdminMfa()
  })
  test.afterAll(async () => {
    await svc.from('school_settings').delete().like('key', 'yoklama.%')
  })

  test('rehber: sınıra yaklaşanlar kartı → öğrenci devamsızlık sekmesi → rapor ve PDF', async ({ page }) => {
    await login(page, ...DEMO.rehber)
    const card = page.getByRole('region', { name: 'Devamsızlık sınırına yaklaşanlar' })
    const row = card.getByTestId('watch-row').filter({ hasText: 'Kaan Polat' })
    await expect(row).toContainText('8/10')
    await expect(row).toContainText('sınıra 2 gün kaldı')
    await axe(page, 'bugün (devamsızlık kartı)')
    await row.click()
    await expect(page.getByRole('tab', { name: 'Devamsızlık', selected: true })).toBeVisible()
    await expect(page.getByTestId('att-row')).toHaveCount(8)
    await expect(page.getByTestId('limit-bar').first()).toContainText('8/10 gün')
    await axe(page, 'öğrenci devamsızlık sekmesi')
    await page.getByRole('button', { name: 'Devamsızlık raporu' }).click()
    const dlg = page.getByRole('dialog', { name: 'Devamsızlık raporu' })
    await expect(dlg.getByTestId('report-row')).toHaveCount(8)
    await expect(dlg).toContainText('Raporsuz (gelmedi): 8')
    await dlg.getByRole('button', { name: '2. dönem' }).click()
    await expect(dlg.getByTestId('report-row')).toHaveCount(0)
    await dlg.getByRole('button', { name: 'Bugüne kadar' }).click()
    await axe(page, 'devamsızlık raporu')
    await shot(page, 'e1-devamsizlik-raporu')
    const dl = page.waitForEvent('download')
    await dlg.getByRole('button', { name: 'PDF indir' }).click()
    expect((await dl).suggestedFilename()).toBe('devamsizlik-kaan-polat.pdf')
  })

  test('yönetici sınır ve eşikleri değiştirir; öğrenci turuncuya geçer', async ({ page }) => {
    await loginAdmin(page)
    await inApp(page)
    await page.goto('/yonetim?sekme=yoklama_ayar')
    await page.getByLabel('1. dönem raporsuz sınır (gün)').fill('9')
    await page.getByLabel('Turuncu uyarı (sınırın %’si)').fill('85')
    await page.getByRole('button', { name: 'Kaydet' }).click()
    await expect(page.getByText('Devamsızlık sınırları kaydedildi')).toBeVisible()
    await page.getByLabel('Geç kalma raporsuz devamsızlığa nasıl sayılsın?').selectOption('yarim')
    await axe(page, 'yoklama ayarları')
    await page.goto('/bugun')
    const row = page.getByTestId('watch-row').filter({ hasText: 'Kaan Polat' })
    await expect(row).toContainText('8/9')
    await expect(row).toContainText('sınıra 1 gün kaldı')
  })

  test('veli: Okul sayfasında devamsızlık sınırı (bilgilendirme)', async ({ page }) => {
    await login(page, ...DEMO.veli)
    await page.getByRole('link', { name: 'Okul', exact: true }).click()
    await page.locator('summary', { hasText: 'Devamsızlık' }).click()
    await expect(page.getByTestId('limit-bar').first()).toContainText('/9 gün')
    await expect(page.getByText('Bilgilendirme amaçlıdır')).toBeVisible()
  })
})
