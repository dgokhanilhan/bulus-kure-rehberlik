// Açık rıza: kayıtta ayrı ve zorunlu kutu; onaylamamış mevcut hesap ilk girişte onay ekranını görür ve onaylayınca devam eder.
import { test, expect } from '@playwright/test'
import { DEMO, login, service } from './helpers'

test('kayıt formu açık rıza kutusu olmadan gönderilmez; metin ayrı sayfada', async ({ page }) => {
  await page.goto('/acik-riza')
  await expect(page.getByRole('heading', { name: 'Açık Rıza Metni' })).toBeVisible()
  await expect(page.getByText('DeepSeek')).toBeVisible()
  await page.goto('/')
  await page.getByRole('button', { name: 'Kayıt ol', exact: true }).first().click()
  await expect(page.getByRole('checkbox', { name: /Açık Rıza Metni’ni okudum/ })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Açık rıza metnini oku' })).toHaveAttribute('href', '/acik-riza')
})

test('onaylamamış veli ilk girişte açık rıza ekranını görür; onaylayınca devam eder', async ({ page }) => {
  const svc = service()
  const uid = (await svc.from('profiles').select('id').eq('full_name', 'Ayşe Yıldız').single()).data!.id
  await svc.from('profiles').update({ acik_riza_version: null, acik_riza_at: null }).eq('id', uid)
  await login(page, ...DEMO.veli)
  await expect(page.getByRole('button', { name: 'Devam et' })).toBeDisabled()
  await page.getByRole('checkbox', { name: /Açık Rıza Metni’ni okudum/ }).click()
  await page.getByRole('button', { name: 'Devam et' }).click()
  await expect(page.getByRole('navigation', { name: 'Ana menü' })).toBeVisible()
  expect((await svc.from('profiles').select('acik_riza_version').eq('id', uid).single()).data!.acik_riza_version).toBe('ACIK-RIZA-1.0')
})
