import { test, expect } from '@playwright/test'
import { DEMO, login } from './helpers'

// Ana sayfa kartlarındaki "→" bağlantıları yalnız kişinin girebildiği sayfalara gider (girilemeyen sayfa ana sayfaya geri atıyordu).
for (const [rol, hesap] of [
  ['branş öğretmeni', DEMO.matematik],
  ['rehber', DEMO.rehber],
  ['veli', DEMO.veli],
  ['öğrenci', DEMO.ogrenci],
] as const) {
  test(`${rol}: ana sayfadaki her bağlantı açılabilen bir sayfaya gider`, async ({ page }) => {
    await login(page, ...hesap)
    const nav = page.getByRole('navigation', { name: 'Ana menü' })
    await expect(nav).toBeVisible()
    await page.waitForLoadState('networkidle')
    const menu = await nav.locator('a[href]').evaluateAll((as) => as.map((a) => a.getAttribute('href')!.split(/[/?#]/)[1]))
    const izinli = new Set([...menu, 'bildirimler', 'hesap-ayarlari', 'iletisim', 'ogrenciler'])
    const linkler = await page.locator('main a[href^="/"]').evaluateAll((as) => as.map((a) => a.getAttribute('href')!))
    expect(linkler.filter((h) => !izinli.has(h.split(/[/?#]/)[1]!))).toEqual([])
    if (rol === 'branş öğretmeni') {
      await expect(page.getByText('Dersimde son deneme')).toHaveCount(0)
      await expect(page.locator('main a[href="/okul"]')).toHaveCount(0)
    }
  })
}
