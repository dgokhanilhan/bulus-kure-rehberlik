import { test, expect } from '@playwright/test'
import { DEMO, login, menu, service } from './helpers'

// Etüt programını dosyadan içe aktarma: öğretmen ve öğrenciler (sınıf + ad) eşleşir, meşgul hücreler ayrılır, programa aktarılır.
test('CSV içe aktarma: eşleşme, önizleme, programa aktar ve kaydet', async ({ page }) => {
  test.setTimeout(120_000)
  await service().from('etut_gunler').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  await login(page, ...DEMO.rehber)
  await menu(page).filter({ hasText: 'Etüt' }).click()
  await expect(page.locator('.et-tbl')).toBeVisible()
  await page.getByRole('button', { name: /İçe aktar/ }).click()
  await page.locator('.mwrap input[type=file]').setInputFiles('e2e/fixtures/etut/ornek-program.csv')
  await page.getByRole('button', { name: 'Oku', exact: true }).click()
  await expect(page.getByText('2 öğretmen satırı okundu. Bütün adlar eşleşti.')).toBeVisible()
  await expect(page.getByLabel('Murat öğretmeni')).toHaveValue(/.+/)
  await expect(page.getByLabel('Elif öğrencisi')).toContainText('Elif Yıldız (8/A)')
  await expect(page.getByLabel('Kerem öğrencisi')).toContainText('Kerem Aydın (8/B)')
  await expect(page.getByLabel('Konu').first()).toHaveValue('üslü ifadeler')
  await page.getByRole('button', { name: 'Programa aktar' }).click()
  await expect(page.getByText('4 hücre aktarıldı', { exact: false })).toBeVisible()
  await expect(page.locator('.et-cell.etut')).toHaveCount(2)
  await expect(page.locator('.et-cell.busy')).toHaveCount(2)
  await page.getByRole('button', { name: 'Kaydet', exact: true }).click()
  await expect(page.getByText('Taslak kaydedildi')).toBeVisible()
  const { data } = await service().from('etut_ogrenciler').select('student_name, ders')
  expect(data!.map((x) => `${x.ders}:${x.student_name}`).sort()).toEqual(['1:Ayşe Çelik', '1:Elif Yıldız', '2:Kerem Aydın'])
})
