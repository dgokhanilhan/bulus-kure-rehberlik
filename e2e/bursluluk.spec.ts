// Faz G · Bursluluk: yönetici sınav tanımlar; girişsiz başvuru formu; yönetici başvuruyu işler (onay, salon/saat, Excel, okul öğrencisi).
import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { loginAdmin, logout, resetAdminMfa, service, shot } from './helpers'

async function axe(page: Page, label: string) {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.waitForTimeout(300)
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
  const bad = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
  expect(bad.map((v) => `${label}: ${v.id} (${v.nodes.length}) ${v.nodes[0]?.target}`)).toEqual([])
}
const svc = service()
const day = (n: number) => new Date(Date.now() + 3 * 3600_000 + n * 86400_000).toISOString().slice(0, 10)
const NAME = `E2E Bursluluk ${Date.now() % 100000}`
const inApp = (page: Page) => expect(page.getByRole('navigation', { name: 'Ana menü' })).toBeVisible()

test.describe.serial('Bursluluk', () => {
  let secret = ''
  test.beforeAll(async () => {
    await svc.from('scholarship_exams').delete().like('name', 'E2E %')
    await svc.from('school_settings').delete().or('key.eq.modul.bursluluk,key.like.bursluluk.%')
    await resetAdminMfa()
  })
  test.afterAll(async () => {
    await svc.from('scholarship_exams').delete().like('name', 'E2E %')
    await svc.from('school_settings').delete().or('key.eq.modul.bursluluk,key.like.bursluluk.%')
  })

  test('modül kapalıyken başvuru sayfası boş; yönetici modülü açar ve sınav oluşturur', async ({ page }) => {
    await page.goto('/bursluluk')
    await expect(page.getByText('Şu anda başvuruya açık bursluluk sınavı yok.')).toBeVisible()
    secret = await loginAdmin(page)
    await inApp(page)
    await page.goto('/yonetim?sekme=moduller')
    await page.getByRole('switch', { name: 'Bursluluk modülü' }).click()
    await expect(page.getByRole('switch', { name: 'Bursluluk modülü' })).toHaveAttribute('aria-checked', 'true')
    await page.goto('/yonetim?sekme=bursluluk')
    await page.getByRole('button', { name: 'Bursluluk sınavı oluştur' }).click()
    const dlg = page.getByRole('dialog', { name: 'Bursluluk sınavı oluştur' })
    await dlg.getByLabel('Sınav adı').fill(NAME)
    await dlg.getByLabel('Sınav tarihi').fill(day(20))
    await dlg.getByLabel('Kontenjan (boş = sınırsız)').fill('10')
    await dlg.getByLabel('Başvuru başlangıcı').fill(day(0))
    await dlg.getByLabel('Son başvuru').fill(day(10))
    await dlg.getByRole('group', { name: 'Sınıf seviyeleri' }).getByRole('button', { name: '5', exact: true }).click()
    await dlg.getByRole('group', { name: 'Sınıf seviyeleri' }).getByRole('button', { name: '8', exact: true }).click()
    await dlg.getByLabel('Sınav yeri (isteğe bağlı)').fill('Ana bina')
    await dlg.getByRole('button', { name: 'Kaydet' }).click()
    await expect(page.getByText('Başvuru 0 / 10')).toBeVisible()
    await axe(page, 'bursluluk yönetimi')
  })

  test('girişsiz başvuru formu: başvuru numarası', async ({ page }) => {
    await page.goto('/bursluluk')
    await expect(page.getByRole('heading', { name: 'Bursluluk sınavı başvurusu' })).toBeVisible()
    const v = await page.getByLabel('Sınav').locator('option', { hasText: NAME }).getAttribute('value')
    await page.getByLabel('Sınav').selectOption(v!)
    await page.getByLabel('Öğrencinin adı soyadı').fill('Mina Çelik')
    await page.getByLabel('Şu anki sınıfı').selectOption('5')
    await page.getByLabel('Okulu (isteğe bağlı)').fill('Cumhuriyet İlkokulu')
    await page.getByLabel('Velinin adı soyadı').fill('Serkan Çelik')
    await page.getByLabel('Telefon').fill('0532 444 55 66')
    await page.getByRole('button', { name: 'Başvur' }).click()
    await expect(page.getByRole('alert')).toHaveText('Aydınlatma metnini onayla.')
    await axe(page, 'başvuru formu')
    await page.getByRole('checkbox', { name: /Aydınlatma metnini okudum/ }).click()
    await page.getByRole('button', { name: 'Başvur' }).click()
    await expect(page.getByTestId('application-code')).toHaveText(/^[0-9A-F]{8}$/)
    await shot(page, 'g1-bursluluk-basvuru')
  })

  test('yönetici başvuruyu işler: salon/saat, onay, süzme, Excel, okul öğrencisi', async ({ page }) => {
    await loginAdmin(page, secret)
    await inApp(page)
    await page.goto('/yonetim?sekme=bursluluk')
    const row = page.getByTestId('application-row').filter({ hasText: 'Mina Çelik' })
    await expect(row).toContainText('Bekliyor')
    await row.getByLabel('Mina Çelik salon').fill('A-3')
    await row.getByLabel('Mina Çelik saat').fill('10:00')
    await row.getByRole('button', { name: 'Kaydet' }).click()
    await expect(page.getByText('Mina Çelik: salon ve saat kaydedildi')).toBeVisible()
    await row.getByRole('button', { name: 'Mina Çelik onayla' }).click()
    await expect(row).toContainText('Onaylandı')
    await page.getByLabel('Okul öğrencisinden başvuru oluştur').selectOption({ label: 'Elif Yıldız · 8/A' })
    await page.getByRole('button', { name: 'Ekle', exact: true }).click()
    await expect(page.getByTestId('application-row').filter({ hasText: 'Elif Yıldız' })).toContainText('okul öğrencisi')
    await page.getByLabel('Sınıf seviyesi').selectOption('5')
    await expect(page.getByTestId('application-row')).toHaveCount(1)
    const dl = page.waitForEvent('download')
    await page.getByRole('button', { name: /Excel'e aktar \(1\)/ }).click()
    const file = await dl
    expect(file.suggestedFilename()).toMatch(/^bursluluk-e2e-bursluluk-\d+\.csv$/)
    const csv = (await (await file.createReadStream()).toArray()).map(String).join('')
    expect(csv).toContain('Mina Çelik;5. sınıf;Cumhuriyet İlkokulu;Serkan Çelik;0532 444 55 66;;Onaylandı;A-3;10:00')
    await axe(page, 'başvurular')
    await shot(page, 'g2-bursluluk-basvurular')
    await logout(page)
  })
})
