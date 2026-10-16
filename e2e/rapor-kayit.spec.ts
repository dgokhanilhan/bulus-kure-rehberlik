import { test, expect, type Page } from '@playwright/test'
import { DEMO, ELIF, login, service } from './helpers'

// Kaydet → sayfa yenile: raporun son hâli (rehber öğretmen yorumu dahil) birebir geri gelmeli.
// Eski hata: rapor zaten kayıtlıyken yeniden kaydedilince rehber yorumu sessizce yazılmıyordu.
async function openVeli(page: Page) {
  await page.goto(`/ogrenciler/${ELIF}`)
  await page.getByRole('button', { name: 'Veli raporu', exact: true }).first().click()
  await expect(page.getByTestId('report-paper')).toBeVisible()
}

test('veli raporu: rehber yorumu boş başlar; her kayıttan sonra son hâl korunur', async ({ page }) => {
  test.setTimeout(120_000)
  await service().from('reports').delete().eq('student_id', ELIF)
  await login(page, ...DEMO.rehber)
  await expect(page.getByRole('navigation', { name: 'Ana menü' })).toBeVisible()
  await openVeli(page)
  const rehber = page.getByLabel('Rehber öğretmen yorumu')
  const genel = page.getByLabel('Genel değerlendirme')
  await expect(rehber).toHaveValue('')

  // 1. kayıt (yeni rapor)
  await rehber.fill('İlk rehber yorumu.')
  await page.getByRole('button', { name: 'Kaydet' }).click()
  await expect(page.getByText('Rapor kaydedildi')).toBeVisible()

  // 2. ve 3. kayıt (var olan rapor güncellenir)
  for (const n of [2, 3]) {
    await rehber.fill(`Rehber yorumu sürüm ${n}.`)
    await genel.fill(`Genel değerlendirme sürüm ${n}.`)
    await page.getByRole('button', { name: 'Kaydet' }).click()
    await expect(page.getByText('Rapor kaydedildi').last()).toBeVisible()
    await page.reload()
    await openVeli(page)
    await expect(rehber).toHaveValue(`Rehber yorumu sürüm ${n}.`)
    await expect(genel).toHaveValue(`Genel değerlendirme sürüm ${n}.`)
  }

  const { data } = await service().from('reports').select('rehber_enc').eq('student_id', ELIF).eq('type', 'veli')
  expect(data).toHaveLength(1)
  expect(data![0]!.rehber_enc).toBeTruthy()

  // Rehber yorumu silinip kaydedilirse boş kalır (taslak geri gelmez)
  await rehber.fill('')
  await page.getByRole('button', { name: 'Kaydet' }).click()
  await expect(page.getByText('Rapor kaydedildi').last()).toBeVisible()
  await page.reload()
  await openVeli(page)
  await expect(rehber).toHaveValue('')
})
