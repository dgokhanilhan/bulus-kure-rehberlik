import { test, expect } from '@playwright/test'
import { loginAdmin, menu, resetAdminMfa, service, shot } from './helpers'

// Yönetim → Tüm ayarlar: ayarı değiştir → etkisini ekranda gör → geçmişte bul → varsayılana dön.
test('ayar değişir, anında etkili olur, geçmişe yazılır ve varsayılana döner', async ({ page }) => {
  test.setTimeout(120_000)
  await service().from('school_settings').delete().eq('school_id', '00000000-0000-4000-8000-000000000001').eq('key', 'menu.ad.duyurular')
  page.on('dialog', (d) => d.accept())
  await resetAdminMfa()
  await loginAdmin(page)
  await page.goto('/yonetim?sekme=tum_ayarlar')
  await page.getByLabel('Ayar ara').fill('Menü adı: Duyurular')
  const input = page.getByLabel('Menü adı: Duyurular', { exact: true })
  await input.fill('Haberler')
  await expect(page.getByText('1 kaydedilmemiş değişiklik')).toBeVisible()
  await page.getByRole('button', { name: 'Kaydet', exact: true }).click()
  const ozet = page.getByRole('dialog', { name: 'Değişiklik özeti' })
  await expect(ozet.getByText('Haberler')).toBeVisible()
  await shot(page, 'ayar-ozet')
  await ozet.getByRole('button', { name: 'Onayla ve kaydet' }).click()
  await expect(page.getByText('1 ayar kaydedildi')).toBeVisible()
  await expect(menu(page).filter({ hasText: 'Haberler' })).toHaveCount(1)

  await page.goto('/yonetim?sekme=ayar_gecmisi')
  await expect(page.getByText(/Menü adı: Duyurular/).first()).toBeVisible()

  await page.goto('/yonetim?sekme=tum_ayarlar')
  await page.getByLabel('Ayar ara').fill('Menü adı: Duyurular')
  await page.getByRole('button', { name: 'Varsayılana dön', exact: true }).click()
  await expect(page.getByText('Varsayılana dönüldü')).toBeVisible()
  await expect(menu(page).filter({ hasText: 'Haberler' })).toHaveCount(0)
  await expect(menu(page).filter({ hasText: 'Duyurular' })).toHaveCount(1)
  await page.getByLabel('Ayar ara').fill('')
  await shot(page, 'ayarlar')
})
