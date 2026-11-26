// Ana sayfa 2 (0097): veli "Bu hafta" + "Sizden beklenen", öğrenci haftalık özet + Yapılacaklar, öğretmen günün özeti + hızlı ödev.
// Kartlar gruplu; boş kart gizli; üç ekran genişliğinde taşma yok ve erişilebilirlik (axe) temiz.
import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { DEMO, login, shot } from './helpers'

const EKRAN = [
  ['bilgisayar', 1440, 1000],
  ['ipad', 834, 1112],
  ['telefon', 390, 844],
] as const

async function denetle(page: Page, ad: string) {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  for (const [cihaz, w, h] of EKRAN) {
    await page.setViewportSize({ width: w, height: h })
    await page.waitForTimeout(250)
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), `${ad} ${cihaz}: yatay taşma`).toBeLessThanOrEqual(0)
    await shot(page, `ana-sayfa-${ad}-${cihaz}`)
  }
  await page.setViewportSize({ width: 1440, height: 1000 })
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
  expect(r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${ad}: ${v.id} ${v.nodes[0]?.target}`)).toEqual([])
}

test('veli: Bu hafta özeti, Sizden beklenen, gruplu kartlar; teknik terim ve sıralama yok', async ({ page }) => {
  test.setTimeout(90_000)
  await login(page, ...DEMO.veli)
  await expect(page).toHaveURL(/\/panel$/)
  const ozet = page.getByTestId('bu-hafta')
  await expect(ozet).toBeVisible()
  await expect(ozet).toContainText('Ödev')
  await expect(ozet).toContainText('Görev')
  await expect(page.getByTestId('sizden-beklenen')).toBeVisible()
  await expect(page.getByRole('region', { name: 'Çalışma ve gelişim' })).toBeVisible()
  await expect(page.locator('section[data-card="odev"]')).toBeVisible()
  await expect(page.locator('main')).not.toContainText(/sıralama|sınıf ortalaması|confidence|OCR/i)
  await denetle(page, 'veli')
})

test('öğrenci: haftalık özet ve Yapılacaklar (görev + ödev tek listede)', async ({ page }) => {
  test.setTimeout(90_000)
  await login(page, ...DEMO.ogrenci)
  await expect(page).toHaveURL(/\/panel$/)
  await expect(page.getByTestId('haftalik-ozet')).toBeVisible()
  const yap = page.locator('section[data-card="odev"]')
  await expect(yap).toBeVisible()
  await expect(yap.getByRole('heading', { name: 'Yapılacaklar' })).toBeVisible()
  await expect(page.locator('main')).not.toContainText(/sıralama|sınıf ortalaması/i)
  await denetle(page, 'ogrenci')
})

test('öğretmen: günün özeti, derslerim; "＋ Ödev" ödev penceresini o sınıfla açar', async ({ page }) => {
  test.setTimeout(90_000)
  await login(page, ...DEMO.matematik)
  await expect(page).toHaveURL(/\/panel$/)
  await expect(page.getByTestId('ogretmen-ozet')).toBeVisible()
  const ders = page.locator('section[data-card="derslerim"]')
  await expect(ders).toBeVisible()
  await expect(ders.getByText('Yoklama')).toHaveCount(0)
  await denetle(page, 'ogretmen')
  const odev = ders.getByRole('link', { name: /için ödev ver$/ }).first()
  if (await odev.count()) {
    const sinif = (await odev.getAttribute('aria-label'))!.split(' ')[0]!
    await odev.click()
    const dlg = page.getByRole('dialog', { name: 'Ödev ver' })
    await expect(dlg).toBeVisible()
    const secili = dlg.getByRole('combobox', { name: 'Sınıf' })
    await expect(secili.locator('option:checked')).toHaveText(sinif)
    await expect(page).toHaveURL(/\/odevler$/)
  }
})
