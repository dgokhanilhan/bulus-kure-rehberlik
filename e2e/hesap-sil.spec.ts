// Kapalı hesaplar → Tamamen sil: reddedilen başvuru adı yazılıp onaylanınca kalıcı silinir (e-posta yeniden kayıt için boşalır).
import { test, expect } from '@playwright/test'
import { loginAdmin, resetAdminMfa, service } from './helpers'

const svc = service()
const E = `e2e-sil-${Date.now()}@ornek.com`
let id = ''

test.afterAll(async () => {
  if (id) await svc.auth.admin.deleteUser(id).catch(() => null)
})

test('reddedilen hesap Kapalı hesaplar\'dan tamamen silinir', async ({ page }) => {
  const { data, error } = await svc.auth.admin.createUser({
    email: E,
    password: 'Deneme2026!',
    email_confirm: true,
    user_metadata: { school: 'bulus-kure', role: 'ogretmen', branch: 'Fizik', full_name: 'Silinecek Başvuru', consent_version: 'v1', acik_riza_version: 'ACIK-RIZA-1.0' },
  })
  if (error) throw error
  id = data.user!.id
  await svc.from('profiles').update({ status: 'rejected' }).eq('id', id)
  await resetAdminMfa()
  await loginAdmin(page)
  await page.goto('/yonetim?sekme=kapali')
  const row = page.getByTestId('closed-row').filter({ hasText: 'Silinecek Başvuru' })
  await row.getByRole('button', { name: 'Silinecek Başvuru hesabını tamamen sil' }).click()
  const dlg = page.getByRole('dialog', { name: 'Hesabı tamamen sil' })
  await expect(dlg).toContainText(E)
  await expect(dlg.getByRole('button', { name: /Kalıcı olarak sil/ })).toBeDisabled()
  await dlg.getByLabel('Onaylamak için “Silinecek Başvuru” yaz').fill('Silinecek Başvuru')
  await dlg.getByRole('button', { name: /Kalıcı olarak sil/ }).click()
  await expect(page.getByText('Silinecek Başvuru hesabı kalıcı olarak silindi')).toBeVisible()
  await expect(page.getByTestId('closed-row').filter({ hasText: 'Silinecek Başvuru' })).toHaveCount(0)
  expect((await svc.from('profiles').select('id').eq('id', id).maybeSingle()).data).toBeNull()
  id = ''
})
