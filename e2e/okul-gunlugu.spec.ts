// Okul günlüğü: yönetici yoklama, ders programı ve yemek listesi girer; veli bildirim alır ve Okul sayfasında görür.
import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { DEMO, ELIF, expectNotification, login, loginAdmin, resetAdminMfa, service, shot } from './helpers'

const today = new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10)

async function axe(page: Page, label: string) {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.waitForTimeout(300)
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
  const bad = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
  expect(bad.map((v) => `${label}: ${v.id} (${v.nodes.length}) ${v.nodes[0]?.target}`)).toEqual([])
}

const tab = (page: Page, name: string | RegExp) => page.getByRole('group', { name: 'Yönetim bölümü' }).getByRole('button', { name })

test.describe.serial('Okul günlüğü', () => {
  let secret = ''
  const clean = async () => {
    const svc = service()
    await svc.from('attendance').delete().eq('student_id', ELIF).eq('day', today)
    await svc.from('timetable').delete().eq('weekday', 6)
    const { data: muzik } = await svc.from('courses').select('id').eq('name', 'Müzik').single()
    if (muzik) await svc.from('teaching_assignments').delete().eq('course_id', muzik.id)
  }
  test.beforeAll(async () => {
    await resetAdminMfa()
    await clean()
  })
  test.afterAll(clean)

  test('yönetici: yoklama al (Elif gelmedi)', async ({ page }) => {
    secret = await loginAdmin(page)
    await page.goto('/yonetim?sekme=yoklama')
    await page.getByLabel('Sınıf').selectOption({ label: '8/A' })
    const row = page.getByTestId('att-row').filter({ hasText: 'Elif Yıldız' })
    await row.getByRole('button', { name: 'Gelmedi' }).click()
    await page.getByRole('button', { name: /Yoklamayı kaydet \(1\)/ }).click()
    await expect(page.getByText(/Yoklama kaydedildi · 1 öğrenci okulda değil/)).toBeVisible()
    await expect(page.getByText('Gelmedi 1')).toBeVisible()
    await axe(page, 'yoklama')
    await shot(page, 'o1-yoklama')
  })

  test('yönetici: ders programına Cumartesi dersi ekle, yemek listesi gir', async ({ page }) => {
    test.setTimeout(120_000) // yönetici girişi yeni TOTP penceresini bekleyebilir (≤30 sn)
    await loginAdmin(page, secret)
    await page.goto('/yonetim?sekme=program')
    await page.getByLabel('Sınıf').selectOption({ label: '8/A' })
    await expect(page.getByRole('button', { name: 'Pazartesi 1. ders: Türkçe' })).toBeVisible()
    await page.getByRole('checkbox', { name: 'Cumartesi' }).click()
    await page.getByRole('button', { name: 'Cumartesi 1. ders boş' }).click()
    const dlg = page.getByRole('dialog', { name: /Cumartesi 1\. ders/ })
    await dlg.getByRole('combobox', { name: /^Ders/ }).selectOption({ label: 'Müzik' })
    await dlg.getByLabel('Öğretmen (isteğe bağlı)').selectOption({ label: 'Esra Demir · Fen Bilimleri' })
    await dlg.getByRole('button', { name: 'Kaydet' }).click()
    await expect(page.getByRole('button', { name: 'Cumartesi 1. ders: Müzik' })).toContainText('Esra Demir')
    await axe(page, 'ders programı')
    await shot(page, 'o2-ders-programi')

    await tab(page, /^Yemek listesi/).click()
    const box = page.getByRole('textbox', { name: /Kahvaltı/ }).first()
    await box.fill('Peynir, zeytin, domates')
    await page.getByRole('button', { name: 'Haftayı kaydet' }).click()
    await expect(page.getByText('Yemek listesi kaydedildi')).toBeVisible()
    await axe(page, 'yemek listesi')
    await shot(page, 'o3-yemek-listesi')
    await box.fill('')
    await page.getByRole('button', { name: 'Haftayı kaydet' }).click()
  })

  test('veli: devamsızlık bildirimi, Okul sayfasında program, yemek ve devamsızlık', async ({ page }) => {
    await login(page, ...DEMO.veli)
    await expect(page.getByRole('heading', { name: "Elif'in durumu" })).toBeVisible()
    await expectNotification(page, /Elif Yıldız .* günü okula gelmedi\./)
    await page.getByRole('link', { name: 'Okul' }).click()
    await expect(page.getByRole('heading', { name: "Elif'in okul günü" })).toBeVisible()
    const week = page.getByRole('article', { name: 'Haftalık ders programı' })
    await expect(week.getByRole('columnheader', { name: 'Cumartesi' })).toBeVisible()
    await expect(week.getByRole('cell', { name: 'Müzik' }).first()).toBeVisible()
    await expect(week.getByText('T.C. İnkılap Tarihi').first()).toBeVisible()
    await page.locator('summary', { hasText: 'Devamsızlık' }).click()
    await expect(page.getByTestId('att-record').first()).toContainText('Gelmedi')
    await axe(page, 'veli okul')
    await shot(page, 'o4-veli-okul')
  })

  test('öğrenci de kendi Okul sayfasını görür', async ({ page }) => {
    await login(page, ...DEMO.ogrenci)
    await page.getByRole('link', { name: 'Okul' }).click()
    await expect(page.getByRole('heading', { name: 'Okul günün' })).toBeVisible()
    await expect(page.getByRole('article', { name: 'Haftalık ders programı' }).getByText('Matematik').first()).toBeVisible()
  })
})
