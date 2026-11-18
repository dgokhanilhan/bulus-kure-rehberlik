// BK Akıllı Yoklama (0080): idare tahtayı bağlar (eşleştirme kodu), öğretmen Hesap ayarlarından PIN alır.
import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { DEMO, login, loginAdmin, resetAdminMfa, service, shot } from './helpers'

async function axe(page: Page, label: string) {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.waitForTimeout(300)
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
  const bad = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
  expect(bad.map((v) => `${label}: ${v.id} (${v.nodes.length}) ${v.nodes[0]?.target}`)).toEqual([])
}
const svc = service()
const inApp = (page: Page) => expect(page.getByRole('navigation', { name: 'Ana menü' })).toBeVisible()
const cleanup = async () => {
  const { data } = await svc.from('classes').select('id').in('name', ['8/A', '8/B'])
  await svc.from('tahta').delete().in('class_id', (data ?? []).map((c) => c.id))
  await svc.from('tahta_pin').delete().eq('profile_id', '00000000-0000-4000-8003-000000000003')
  await svc.from('school_settings').delete().eq('key', 'yoklama.bildirim_saati')
}

test.describe.serial('Akıllı tahta yoklaması', () => {
  test.beforeAll(async () => {
    await cleanup()
    await resetAdminMfa()
  })
  test.afterAll(cleanup)

  test('öğretmen: okulda tahta yokken PIN kartı görünmez', async ({ page }) => {
    await login(page, ...DEMO.matematik)
    await inApp(page)
    await page.goto('/hesap-ayarlari')
    await expect(page.getByRole('heading', { name: 'Şifre değiştir' })).toBeVisible()
    await expect(page.getByRole('heading', { name: "Tahta yoklama PIN'in" })).toHaveCount(0)
  })

  test('yönetici 8/A ve 8/B tahtasını ekler, kodu görür, bildirim saatini değiştirir', async ({ page }) => {
    await loginAdmin(page)
    await inApp(page)
    await page.goto('/yonetim?sekme=yoklama_ayar')
    const box = page.getByRole('region', { name: /Akıllı tahtalar/ })
    await expect(box).toContainText('Henüz tahta bağlanmadı')
    for (const c of ['8/A', '8/B']) {
      await box.getByLabel('Tahta ekle: sınıf').selectOption({ label: c })
      await box.getByRole('button', { name: 'Tahta ekle ve kod al' }).click()
      const kod = box.getByRole('status')
      await expect(kod).toContainText(`${c} tahtası için eşleştirme kodu`)
      await expect(kod).toContainText(/[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}/)
      if (c === '8/B') await shot(page, 'tahta-1-yonetim-kod')
      await kod.getByRole('button', { name: 'Tamam' }).click()
    }
    await expect(box.getByRole('listitem')).toHaveCount(2)
    await expect(box.getByRole('listitem').first()).toContainText('Kod bekliyor')
    await expect(box.getByLabel('Tahta ekle: sınıf').locator('option', { hasText: '8/A' })).toHaveCount(0)
    await box.getByLabel('Pilot sınıflarda veli bildirimi saati').selectOption('10:30')
    await expect(page.getByText('Veli bildirim saati kaydedildi')).toBeVisible()
    await axe(page, 'akıllı tahtalar')
  })

  test('öğretmen PIN alır; kod bir kez gösterilir, yenisi istenebilir', async ({ page }) => {
    await login(page, ...DEMO.matematik)
    await inApp(page)
    await page.goto('/hesap-ayarlari')
    const card = page.getByRole('region', { name: "Tahta yoklama PIN'in" })
    await card.getByRole('button', { name: 'PIN al' }).click()
    await expect(card.getByTestId('tahta-pin')).toHaveText(/^\d{4}$/)
    await shot(page, 'tahta-2-ogretmen-pin')
    await axe(page, 'tahta PIN kartı')
    await card.getByRole('button', { name: 'Ezberledim, gizle' }).click()
    await expect(card).toContainText("PIN'in var")
    await expect(card).toContainText('Henüz kullanılmadı.')
    await card.getByRole('button', { name: 'Yeni PIN al' }).click()
    await card.getByRole('button', { name: 'Evet, yeni PIN ver' }).click()
    await expect(card.getByTestId('tahta-pin')).toHaveText(/^\d{4}$/)
  })
})
