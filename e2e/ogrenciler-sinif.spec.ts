import { test, expect } from '@playwright/test'
import { login, DEMO } from './helpers'

// Öğrenci dosyasından, sol menüden "Öğrenciler" düğmesiyle ya da tarayıcının geri tuşuyla dönünce seçili sınıf korunur.
test('öğrenci listesi: seçili sınıf geri dönüşte korunur', async ({ page }) => {
  await login(page, ...DEMO.rehber)
  await page.getByRole('link', { name: 'Öğrenciler', exact: true }).click()
  const sinif = page.getByLabel('Sınıf')
  await sinif.selectOption('8/B')
  await expect(page).toHaveURL(/sinif=8%2FB/)

  await page.locator('tr.click').first().click()
  await expect(page).toHaveURL(/\/ogrenciler\/[0-9a-f-]+$/)
  await page.locator('a.btn', { hasText: 'Öğrenciler' }).click()
  await expect(sinif).toHaveValue('8/B')

  await page.locator('tr.click').first().click()
  await expect(page).toHaveURL(/\/ogrenciler\/[0-9a-f-]+$/)
  await page.goBack()
  await expect(sinif).toHaveValue('8/B')

  // Sol menüden gelince de son seçilen sınıf açılır
  await page.getByRole('link', { name: 'Bugün', exact: true }).click()
  await page.getByRole('link', { name: 'Öğrenciler', exact: true }).click()
  await expect(sinif).toHaveValue('8/B')
  await expect(page).toHaveURL(/sinif=8%2FB/)

  await sinif.selectOption('all')
  await page.locator('tr.click').first().click()
  await page.locator('a.btn', { hasText: 'Öğrenciler' }).click()
  await expect(sinif).toHaveValue('all')
  await expect(page).toHaveURL(/\/ogrenciler$/)
  await page.getByRole('link', { name: 'Bugün', exact: true }).click()
  await page.getByRole('link', { name: 'Öğrenciler', exact: true }).click()
  await expect(sinif).toHaveValue('all')
})
