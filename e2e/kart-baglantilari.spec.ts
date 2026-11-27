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
    await login(page, hesap[0], hesap[1])
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

test('silinmiş etkinliğe giden bildirim bağlantısı: uyarı verir, takvimi boş ayrıntıda bırakmaz', async ({ page }) => {
  await login(page, DEMO.veli[0], DEMO.veli[1])
  await expect(page.getByRole('navigation', { name: 'Ana menü' })).toBeVisible()
  await page.goto('/takvim?etkinlik=00000000-0000-4000-8fff-000000000099')
  await expect(page.getByText('Bu etkinlik kaldırılmış ya da artık takvimde görünmüyor.')).toBeVisible()
  await expect(page).not.toHaveURL(/etkinlik=/)
})

test('telefonda Daha menüsü Escape, dışarı dokunma ve aynı sayfaya dokununca kapanır', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await login(page, DEMO.matematik[0], DEMO.matematik[1])
  const nav = page.getByRole('navigation', { name: 'Ana menü' })
  const menu = page.getByRole('menu', { name: 'Diğer sayfalar' })
  await nav.getByRole('button', { name: 'Daha' }).click()
  await expect(menu).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(menu).toBeHidden()
  await nav.getByRole('button', { name: 'Daha' }).click()
  await page.locator('main h1').first().click()
  await expect(menu).toBeHidden()
  await nav.getByRole('button', { name: 'Daha' }).click()
  await menu.getByRole('menuitem').first().click()
  await expect(menu).toBeHidden()
  await nav.getByRole('button', { name: 'Daha' }).click()
  await menu.getByRole('menuitem').first().click() // zaten açık olan sayfa
  await expect(menu).toBeHidden()
})

test('pencerede Tab odağı pencerenin içinde döner', async ({ page }) => {
  await login(page, DEMO.rehber[0], DEMO.rehber[1])
  await expect(page.getByRole('navigation', { name: 'Ana menü' })).toBeVisible()
  await page.goto('/takvim')
  await page.getByRole('button', { name: 'Etkinlik ekle' }).click()
  const dlg = page.getByRole('dialog')
  await expect(dlg).toBeVisible()
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press('Tab')
    expect(await dlg.evaluate((d) => d.contains(document.activeElement))).toBe(true)
  }
  await page.keyboard.press('Escape')
  await expect(dlg).toBeHidden()
})
