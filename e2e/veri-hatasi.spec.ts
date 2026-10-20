// Veri isteği düşerse ekran sonsuza kadar "Yükleniyor…"da kalmaz: hata mesajı, "Tekrar dene" ile toparlanır.
import { test, expect } from '@playwright/test'
import { DEMO, login, service } from './helpers'

test('öğrenci isteği düşünce Bugün ve Öğrenciler hata gösterir; Tekrar dene ile yüklenir', async ({ page }) => {
  test.setTimeout(90_000)
  await login(page, ...DEMO.rehber)
  await expect(page.getByRole('navigation', { name: 'Ana menü' })).toBeVisible()
  const kes = (r: import('@playwright/test').Route) => r.abort('failed')
  await page.route(/\/rest\/v1\/students\?/, kes)
  await page.goto('/bugun')
  await expect(page.getByTestId('veri-hatasi')).toContainText('Veriler yüklenemedi', { timeout: 30_000 })
  await expect(page.getByRole('button', { name: 'Tekrar dene' })).toBeVisible()
  // Hata yöneticinin görebileceği kayda düşer (kişisel veri yok; sayfa yolu ve sorgu adı)
  await expect
    .poll(async () => (await service().from('hata_kayitlari').select('tur, sayfa, mesaj').eq('sayfa', '/bugun').eq('tur', 'veri').order('created_at', { ascending: false }).limit(1)).data?.[0]?.mesaj ?? '')
    .toContain('[students]')
  await page.unroute(/\/rest\/v1\/students\?/, kes)
  await page.getByRole('button', { name: 'Tekrar dene' }).click()
  await expect(page.getByTestId('veri-hatasi')).toHaveCount(0)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

  await page.route(/\/rest\/v1\/students\?/, kes)
  await page.goto('/ogrenciler')
  await expect(page.getByTestId('veri-hatasi')).toBeVisible({ timeout: 30_000 })
  await page.unroute(/\/rest\/v1\/students\?/, kes)
  await page.getByRole('button', { name: 'Tekrar dene' }).click()
  await expect(page.locator('tr.click').first()).toBeVisible()
})
