import { test, expect } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { DEMO, login, menu, service, shot } from './helpers'

// Cumartesi etütleri (0051): öğretmen talebi → rehber programa yerleştirir, yayınlar, PDF alır → veli kendi etüdünü görür.
test('etüt talebi, rehber planı, yayın ve veli görünümü', async ({ page }) => {
  test.setTimeout(150_000)
  const svc = service()
  await svc.from('etut_gunler').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  await svc.from('etut_talepler').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  page.on('dialog', (d) => d.accept())

  // Öğretmen talep oluşturur
  await login(page, ...DEMO.matematik)
  await menu(page).filter({ hasText: 'Etüt' }).click()
  await expect(page.getByRole('heading', { name: 'Etüt', exact: true })).toBeVisible()
  await page.getByLabel('Konu').fill('E2E Kesirler tekrar')
  await page.getByLabel('Öğrenci ara (en az 2 harf)').fill('Elif')
  await page.getByRole('checkbox', { name: /Elif Yıldız/ }).check()
  await page.getByRole('button', { name: 'Talebi gönder' }).click()
  await expect(page.getByText('Talep rehber öğretmene iletildi')).toBeVisible()
  await expect(page.getByText('Bekliyor', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: /^Profil:/ }).click()
  await page.getByRole('menuitem', { name: 'Çıkış yap' }).click()

  // Rehber talebi programa yerleştirir, kaydeder, yayınlar, PDF alır
  await login(page, ...DEMO.rehber)
  await menu(page).filter({ hasText: 'Etüt' }).click()
  await expect(page.getByText('E2E Kesirler tekrar')).toBeVisible()
  await page.getByRole('button', { name: 'Bu programa yerleştir' }).click()
  await expect(page.getByText('Kaydedilmemiş değişiklik')).toBeVisible()
  await expect(page.locator('.et-cell.etut')).toHaveCount(1)
  await page.getByRole('button', { name: 'Kaydet', exact: true }).click()
  await expect(page.getByText('Taslak kaydedildi')).toBeVisible()
  await page.getByRole('button', { name: 'Yayınla', exact: true }).click()
  await expect(page.getByText('Program yayınlandı')).toBeVisible()
  await expect(page.getByText('Yayında', { exact: true })).toBeVisible()
  await shot(page, 'etut-rehber')
  const dl = page.waitForEvent('download')
  await page.getByRole('button', { name: 'PDF indir / yazdır' }).click()
  await mkdir('e2e-artifacts', { recursive: true })
  await (await dl).saveAs('e2e-artifacts/etut.pdf')
  await page.getByRole('button', { name: /^Profil:/ }).click()
  await page.getByRole('menuitem', { name: 'Çıkış yap' }).click()

  // Veli yalnız çocuğunun etüdünü görür
  await login(page, ...DEMO.veli)
  await menu(page).filter({ hasText: 'Etüt' }).click()
  await expect(page.getByRole('heading', { name: 'Yaklaşan etütler' })).toBeVisible()
  await expect(page.getByText(/E2E Kesirler tekrar/)).toBeVisible()
  await shot(page, 'etut-veli')
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
})
