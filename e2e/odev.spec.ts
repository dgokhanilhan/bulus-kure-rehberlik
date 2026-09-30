// Faz B · Ödev: öğretmen ödev verir ve kontrol eder; veli ve öğrenci görür; ödev ayarları.
import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { DEMO, expectNotification, login, loginAdmin, logout, resetAdminMfa, service, shot } from './helpers'

async function axe(page: Page, label: string) {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.waitForTimeout(300)
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
  const bad = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
  expect(bad.map((v) => `${label}: ${v.id} (${v.nodes.length}) ${v.nodes[0]?.target}`)).toEqual([])
}
const svc = service()
const TITLE = `E2E Kesirler testi ${Date.now() % 100000}`
const due = new Date(Date.now() + 3 * 3600_000 + 4 * 86400_000).toISOString().slice(0, 10)

test.describe.serial('Ödev', () => {
  test.beforeAll(async () => {
    await svc.from('homework').delete().like('title', 'E2E %')
    await svc.from('school_settings').delete().like('key', 'odev.%')
    await resetAdminMfa()
  })
  test.afterAll(async () => {
    await svc.from('homework').delete().like('title', 'E2E %')
    await svc.from('school_settings').delete().like('key', 'odev.%')
  })

  test('öğretmen ödev verir: yalnız atandığı sınıf ve ders seçilebilir', async ({ page }) => {
    await login(page, ...DEMO.matematik)
    await page.getByRole('link', { name: 'Ödevler' }).click()
    await expect(page.getByTestId('homework-card').filter({ hasText: 'Çarpanlar ve katlar' })).toBeVisible()
    await axe(page, 'ödevler (öğretmen)')
    await page.getByRole('button', { name: 'Ödev ver' }).click()
    const dlg = page.getByRole('dialog', { name: 'Ödev ver' })
    await expect(dlg.locator('#hCls option')).toHaveText(['8/A'])
    await expect(dlg.locator('#hCourse option')).toHaveText(['Matematik'])
    await dlg.getByLabel('Başlık').fill(TITLE)
    await dlg.getByLabel('Açıklama (isteğe bağlı)').fill('Kitap s. 50–52.')
    await dlg.getByLabel('Son teslim').fill(due)
    await dlg.getByRole('button', { name: 'Ödevi ver' }).click()
    await expect(page.getByRole('heading', { name: TITLE })).toBeVisible()
    await expect(page.getByTestId('hw-row')).toHaveCount(7)
  })

  test('öğretmen kontrol eder: eksik + not, bekleyenlerin hepsi yaptı', async ({ page }) => {
    await login(page, ...DEMO.matematik)
    await page.getByRole('link', { name: 'Ödevler' }).click()
    await page.getByTestId('homework-card').filter({ hasText: TITLE }).click()
    const elif = page.getByTestId('hw-row').filter({ hasText: 'Elif Yıldız' })
    await elif.getByRole('button', { name: 'Eksik' }).click()
    await elif.getByLabel('Elif Yıldız notu').fill('4. sorudan sonrası eksik.')
    await page.getByRole('button', { name: 'Bekleyenlerin hepsi yaptı' }).click()
    await page.getByRole('button', { name: /^Kaydet \(7\)/ }).click()
    await expect(page.getByText('7 öğrencinin durumu kaydedildi')).toBeVisible()
    await expect(page.getByText('Yaptı 6')).toBeVisible()
    await expect(page.getByText('Eksik 1')).toBeVisible()
    await axe(page, 'ödev detayı')
    await shot(page, 'b1-odev-kontrol')
  })

  test('veli: bildirim, geciken sekmesinde eksik ödev ve öğretmen notu; bekleyen ödev', async ({ page }) => {
    await login(page, ...DEMO.veli)
    await expectNotification(page, `Ödev kontrol edildi · Matematik: ${TITLE} — Eksik`)
    await page.getByRole('link', { name: 'Ödevler' }).click()
    await expect(page.getByRole('heading', { name: "Elif'in ödevleri" })).toBeVisible()
    await expect(page.getByRole('article', { name: 'Çarpanlar ve katlar — test 3' })).toBeVisible()
    await page.getByRole('group', { name: 'Ödev listesi' }).getByRole('button', { name: /^Geciken/ }).click()
    const card = page.getByRole('article', { name: TITLE })
    await expect(card).toContainText('Eksik')
    await expect(card).toContainText('Öğretmen notu: 4. sorudan sonrası eksik.')
    await axe(page, 'ödevler (veli)')
    await shot(page, 'b2-odev-veli')
  })

  test('öğrenci kendi ödevlerini görür; yönetici veli durum görmesini kapatır', async ({ page }) => {
    await login(page, ...DEMO.ogrenci)
    await page.getByRole('link', { name: 'Ödevler' }).click()
    await expect(page.getByRole('heading', { name: 'Ödevlerin' })).toBeVisible()
    await expect(page.getByRole('article', { name: 'Çarpanlar ve katlar — test 3' })).toBeVisible()
    await logout(page)

    await loginAdmin(page)
    await page.goto('/yonetim?sekme=odev')
    await page.getByRole('switch', { name: /Veli ödev durumunu görür/ }).click()
    await expect(page.getByRole('switch', { name: /Veli ödev durumunu görür/ })).toHaveAttribute('aria-checked', 'false')
    await axe(page, 'ödev ayarları')
    await logout(page)

    await login(page, ...DEMO.veli)
    await page.getByRole('link', { name: 'Ödevler' }).click()
    await expect(page.getByText('Okul, ödev durumlarını velilere göstermiyor')).toBeVisible()
    await expect(page.getByText('Öğretmen notu:')).toHaveCount(0)
  })
})
