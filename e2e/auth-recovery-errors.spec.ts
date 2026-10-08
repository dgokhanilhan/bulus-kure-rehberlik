import { expect, test } from '@playwright/test'
test('şifre sıfırlama sunucu hatası başarı olarak gösterilmez; tekrar denenebilir', async ({ page }) => {
  let status = 500
  await page.route('**/auth/v1/recover*', async route => {
    await new Promise(resolve => setTimeout(resolve, 200))
    await route.fulfill({ status, contentType: 'application/json', body: status === 200 ? '{}' : '{"msg":"temporary error"}' })
  })
  await page.goto('/')
  await page.getByLabel('E-posta').fill('uydurma@ornek.com')
  const button = page.getByRole('button', { name: 'Şifremi unuttum' })
  await button.click()
  await expect(button).toBeDisabled()
  await expect(page.getByRole('alert')).toContainText('isteği tamamlanamadı')
  await expect(button).toBeEnabled()
  status = 200
  await button.click()
  await expect(page.getByRole('alert')).toContainText('bir hesap varsa')
})
test('süresi dolan bağlantı açık hata verir ve şifre ekranı açılmaz', async ({ page }) => {
  await page.goto('/#error=access_denied&error_code=otp_expired&type=recovery')
  await expect(page.getByRole('alert')).toContainText('Bağlantı geçersiz veya süresi dolmuş')
  await expect(page.getByRole('heading', { name: 'Şifreni belirle' })).toHaveCount(0)
  expect(page.url()).not.toContain('error_code')
})
