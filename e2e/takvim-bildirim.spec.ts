// Faz D · Takvim ve bildirim merkezi: etkinlikler + ödev teslim günleri, öğretmen sınav ekler, bildirim listesi, ayarlar, mobil "Daha".
import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { DEMO, login, loginAdmin, logout, resetAdminMfa, service, shot } from './helpers'

async function axe(page: Page, label: string) {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.waitForTimeout(300)
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
  const bad = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
  expect(bad.map((v) => `${label}: ${v.id} (${v.nodes.length}) ${v.nodes[0]?.target}`)).toEqual([])
}
const svc = service()
const inApp = (page: Page) => expect(page.getByRole('navigation', { name: 'Ana menü' })).toBeVisible()
const TITLE = `E2E Fen yazılısı ${Date.now() % 100000}`

test.describe.serial('Takvim ve bildirimler', () => {
  test.beforeAll(async () => {
    await svc.from('calendar_events').delete().like('title', 'E2E %')
    await svc.from('school_settings').delete().or('key.like.bildirim.%,key.like.takvim.%')
    await resetAdminMfa()
  })
  test.afterAll(async () => {
    await svc.from('calendar_events').delete().like('title', 'E2E %')
    await svc.from('school_settings').delete().or('key.like.bildirim.%,key.like.takvim.%')
  })

  test('veli takvimi: etkinlikler, sınav ve ödev teslim günü; etkinlik ayrıntısı', async ({ page }) => {
    await login(page, ...DEMO.veli)
    await page.getByRole('link', { name: 'Takvim' }).click()
    await expect(page.getByRole('heading', { name: 'Takvim' })).toBeVisible()
    const up = page.getByRole('complementary', { name: 'Yaklaşanlar' })
    await expect(up.getByText('Matematik 1. yazılı')).toBeVisible()
    await expect(up.getByText('Çarpanlar ve katlar — test 3')).toBeVisible()
    await up.getByRole('button', { name: /1\. dönem veli toplantısı/ }).click()
    const dlg = page.getByRole('dialog', { name: '1. dönem veli toplantısı' })
    await expect(dlg).toContainText('17:00–18:30')
    await expect(dlg).toContainText('Konferans salonu')
    await expect(dlg.getByRole('button', { name: 'Sil' })).toHaveCount(0)
    await axe(page, 'takvim (veli)')
    await page.keyboard.press('Escape')
    await shot(page, 'd1-takvim-veli')
  })

  test('öğretmen yalnız kendi sınıfına sınav ekler; veliye "Sınav" bildirimi', async ({ page }) => {
    await login(page, ...DEMO.matematik)
    await page.getByRole('link', { name: 'Takvim' }).click()
    await page.getByRole('button', { name: 'Etkinlik ekle' }).click()
    const dlg = page.getByRole('dialog', { name: 'Etkinlik ekle' })
    await expect(dlg.getByLabel('Kimin için').locator('option')).toHaveText(['Sınıfım', 'Öğrencim', 'Kendim'])
    await expect(dlg.getByRole('checkbox', { name: '8/A', exact: true })).toBeVisible()
    await expect(dlg.getByRole('checkbox', { name: '8/B', exact: true })).toHaveCount(0)
    await dlg.getByRole('checkbox', { name: '8/A', exact: true }).check()
    await dlg.getByLabel('Başlık').fill(TITLE)
    const d = new Date(Date.now() + 3 * 3600_000 + 4 * 86400_000).toISOString().slice(0, 10)
    await dlg.getByLabel('Başlangıç').fill(d)
    await dlg.getByRole('checkbox', { name: 'Tüm gün' }).click()
    await dlg.getByLabel('Saat', { exact: true }).fill('11:00')
    await dlg.getByRole('button', { name: 'Kaydet' }).click()
    await expect(page.getByRole('complementary', { name: 'Yaklaşanlar' }).getByText(TITLE)).toBeVisible()
    await axe(page, 'takvim (öğretmen)')
    await logout(page)

    await login(page, ...DEMO.veli)
    await inApp(page)
    await page.goto('/bildirimler')
    await page.getByLabel('Bildirim türü').selectOption({ label: 'Sınav' })
    await expect(page.getByTestId('notification').filter({ hasText: TITLE })).toBeVisible()
    await axe(page, 'bildirim merkezi')
    await shot(page, 'd2-bildirimler')
    await page.getByTestId('notification').filter({ hasText: TITLE }).click()
    await expect(page.getByRole('dialog', { name: TITLE })).toBeVisible()
  })

  test('bildirim merkezi: tümünü okundu işaretle', async ({ page }) => {
    const { data: v } = await svc.from('profiles').select('id').eq('email', DEMO.veli[0]).single()
    await svc.from('notifications').insert({ user_id: v!.id, text: 'E2E okunmamış bildirim', link: {} })
    await login(page, ...DEMO.veli)
    await inApp(page)
    await page.goto('/bildirimler')
    await page.getByRole('button', { name: 'Tümünü okundu işaretle' }).click()
    await expect(page.getByRole('button', { name: 'Okunmamış (0)' })).toBeVisible()
    await expect(page.getByRole('button', { name: /^Bildirimler$/ })).toBeVisible()
  })

  test('yönetici bildirim ve takvim ayarları', async ({ page }) => {
    await loginAdmin(page)
    await inApp(page)
    await page.goto('/yonetim?sekme=bildirim')
    const sw = page.getByRole('switch', { name: /Yeni duyuru/ })
    await sw.click()
    await expect(sw).toHaveAttribute('aria-checked', 'false')
    await axe(page, 'bildirim ayarları')
    await page.goto('/yonetim?sekme=takvim')
    await expect(page.getByLabel('Sınavdan kaç gün önce hatırlatılsın? (0 = kapalı)')).toHaveValue('1')
    await axe(page, 'takvim ayarları')
  })

  test('telefonda alt çubuk: ilk 4 sayfa + Daha menüsü', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 })
    await login(page, ...DEMO.veli)
    await inApp(page)
    const nav = page.getByRole('navigation', { name: 'Ana menü' })
    await expect(nav.getByRole('link', { name: 'Görevler' })).toBeHidden()
    await nav.getByRole('button', { name: 'Daha' }).click()
    const menu = page.getByRole('menu', { name: 'Diğer sayfalar' })
    await expect(nav.getByRole('link', { name: 'Ödevler' })).toBeVisible()
    await expect(menu.getByRole('menuitem')).toHaveText(['Takvim', 'Duyurular', /^İletişim/, 'Görevler', 'Raporlar', 'Görüşmeler'])
    await menu.getByRole('menuitem', { name: 'Görüşmeler' }).click()
    await expect(page).toHaveURL(/\/gorusmeler$/)
    await expect(menu).toBeHidden()
    await shot(page, 'd3-mobil-daha', false)
  })
})
