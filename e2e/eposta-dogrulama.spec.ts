// Giriş: e-postası doğrulanmamış hesap için açık mesaj ve "Doğrulama bağlantısını yeniden gönder".
// Yerel Supabase'de e-posta doğrulaması kapalı olduğundan Auth yanıtı, canlıdaki biçimiyle taklit edilir.
import { test, expect } from '@playwright/test'
import { DEMO, login, logout } from './helpers'

const EMAIL = 'dogrulanmamis@ornek.com'

test.describe('Doğrulanmamış e-posta', () => {
  test('açık mesaj, yeniden gönderme; normal giriş ve hatalı şifre etkilenmez', async ({ page }) => {
    let resent: unknown = null
    await page.route('**/auth/v1/token?grant_type=password', async (route) => {
      const body = route.request().postDataJSON() as { email: string }
      if (body.email !== EMAIL) return route.continue()
      await route.fulfill({ status: 400, contentType: 'application/json', headers: { 'x-supabase-api-version': '2024-01-01' }, body: JSON.stringify({ code: 'email_not_confirmed', message: 'Email not confirmed' }) })
    })
    await page.route('**/auth/v1/resend*', async (route) => {
      resent = route.request().postDataJSON()
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
    })

    await login(page, EMAIL, 'Deneme123!')
    await expect(page.getByRole('alert')).toHaveText('E-posta adresin henüz doğrulanmadı. Kayıttan sonra gönderilen bağlantıya tıkla.')
    await page.getByRole('button', { name: 'Doğrulama bağlantısını yeniden gönder' }).click()
    await expect(page.getByRole('alert')).toContainText('Doğrulama bağlantısı yeniden gönderildi.')
    await expect(page.getByRole('button', { name: 'Doğrulama bağlantısını yeniden gönder' })).toHaveCount(0)
    expect(resent).toMatchObject({ type: 'signup', email: EMAIL })

    // Hatalı şifre: eski mesaj, yeniden gönderme düğmesi yok
    await page.getByLabel('E-posta').fill(DEMO.veli[0])
    await page.getByLabel('Şifre', { exact: true }).fill('yanlis-sifre')
    await page.getByRole('button', { name: 'Giriş yap' }).last().click()
    await expect(page.getByRole('alert')).toHaveText('E-posta veya şifre hatalı.')
    await expect(page.getByRole('button', { name: 'Doğrulama bağlantısını yeniden gönder' })).toHaveCount(0)

    // Normal giriş çalışır
    await login(page, ...DEMO.veli)
    await expect(page.getByRole('navigation', { name: 'Ana menü' })).toBeVisible()
    await logout(page)
  })
})
