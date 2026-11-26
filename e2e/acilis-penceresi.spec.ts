// Açılış penceresi (0096): yönetici taslak hazırlar, önizler, yayınlar; veli girişte görür; önemli "Okudum" ister; Yenilikler listesi.
import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { DEMO, ELIF, login, loginAdmin, logout, resetAdminMfa, service, shot } from './helpers'

const AD = 'E2E Açılış'

test.describe.configure({ mode: 'serial' })
test.afterAll(async () => {
  await service().from('acilis_pencereleri').delete().like('baslik', `${AD}%`)
})

test('yönetici taslak hazırlar, önizler ve yayınlar', async ({ page }) => {
  test.setTimeout(90_000)
  page.on('dialog', (d) => d.accept())
  await resetAdminMfa()
  await loginAdmin(page)
  await page.goto('/duyurular')
  const y = page.getByTestId('acilis-yonetim')
  await y.getByRole('button', { name: 'Yeni pencere' }).click()
  const m = page.getByRole('dialog', { name: 'Yeni açılış penceresi' })
  await m.getByLabel('Başlık').fill(`${AD} yenilik`)
  await m.getByLabel(/^Metin/).fill('Hedefler sayfasına okul ekleyebilirsiniz.\nTahminidir, resmî puan değildir.')
  await m.getByLabel('8', { exact: true }).check()
  await m.getByLabel('Düğme yazısı (isteğe bağlı)').fill('Hedefleri gör')
  await m.getByLabel('Düğme adresi').fill('/ozet')
  await m.getByRole('button', { name: 'Önizle' }).click()
  await expect(page.getByTestId('acilis-onizleme')).toContainText(`${AD} yenilik`)
  await page.getByRole('dialog', { name: 'Önizleme' }).getByRole('button', { name: 'Kapat' }).click()
  await m.getByRole('button', { name: 'Taslak olarak kaydet' }).click()
  const k = y.getByTestId('acilis-kayit').filter({ hasText: `${AD} yenilik` })
  await expect(k).toContainText('Taslak')
  await shot(page, 'acilis-yonetim')
  await k.getByRole('button', { name: 'Yayınla' }).click()
  await expect(k).toContainText('Yayında')
  await expect(k.getByTestId('acilis-istatistik')).toContainText(/^0 \/ \d+ kişi gördü/)

  // Önemli duyuru doğrudan (servis) — veli ve öğrenciye
  const okul = (await service().from('students').select('school_id').eq('id', ELIF).single()).data!.school_id
  const r = await service()
    .from('acilis_pencereleri')
    .insert({ school_id: okul, tur: 'onemli', baslik: `${AD} önemli`, metin: 'Veli toplantısı Cuma 18:00.', roller: ['veli', 'ogrenci'], durum: 'yayinda' })
  expect(r.error).toBeNull()
})

test('veli girişte önce önemliyi, sonra yeniliği görür; Okudum ve düğme çalışır', async ({ page }) => {
  await login(page, ...DEMO.veli)
  const p = page.getByTestId('acilis-penceresi')
  await expect(p).toContainText(`${AD} önemli`)
  await expect(p).toContainText('1 / 2')
  await page.keyboard.press('Escape')
  await expect(p).toContainText(`${AD} önemli`)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const axe = await new AxeBuilder({ page }).include('[data-testid="acilis-penceresi"]').withTags(['wcag2a', 'wcag2aa']).analyze()
  expect(axe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id)).toEqual([])
  await shot(page, 'acilis-penceresi')
  await p.getByRole('button', { name: 'Okudum' }).click()
  await expect(p).toContainText(`${AD} yenilik`)
  await p.getByRole('button', { name: 'Hedefleri gör' }).click()
  await expect(page).toHaveURL(/\/ozet$/)
  await expect(p).toHaveCount(0)

  await page.reload()
  await expect(page.getByRole('navigation', { name: 'Ana menü' })).toBeVisible()
  await expect(p).toHaveCount(0)
  await page.goto('/duyurular')
  await expect(page.getByTestId('yenilikler')).toContainText(`${AD} yenilik`)
  await logout(page)
})

test('öğretmen veli/öğrenci penceresini görmez', async ({ page }) => {
  await login(page, ...DEMO.rehber)
  await expect(page).toHaveURL(/\/bugun$/)
  await expect(page.getByTestId('acilis-penceresi')).toHaveCount(0)
})
