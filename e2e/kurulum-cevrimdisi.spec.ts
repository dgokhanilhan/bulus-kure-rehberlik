// Bağlantısız günlük kontrol: bağlantı yokken kaydedilen işaret cihazda sıraya girer, şerit görünür; bağlantı gelince
// kendiliğinden gönderilir. Kurulum sihirbazı: adımlar ve durumları yönetici için görünür, düğme ilgili bölüme götürür.
import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { DEMO, login, loginAdmin, resetAdminMfa, service, shot } from './helpers'

const ELIF = '00000000-0000-4000-8001-000000001184'
const bugun = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(new Date())
const temizle = async () => {
  await service().from('gunluk_kontrol').delete().eq('student_id', ELIF).eq('tarih', bugun()).eq('madde', 'ajanda')
}

test.describe.serial('Bağlantısız kayıt ve kurulum sihirbazı', () => {
  test.beforeAll(async () => {
    await resetAdminMfa()
    await temizle()
  })
  test.afterAll(temizle)

  test('bağlantı yokken günlük kontrol sıraya girer, bağlantı gelince gönderilir', async ({ page, context }) => {
    await login(page, ...DEMO.matematik)
    await expect(page.getByRole('navigation', { name: 'Ana menü' })).toBeVisible()
    await page.goto('/ogrenciler?sinif=8%2FA&gorunum=gunluk-kontrol')
    const satir = page.getByTestId('gk-ogrenci').filter({ hasText: 'Elif Yıldız' })
    const dugme = satir.getByRole('group', { name: 'Elif Yıldız eksikleri' }).getByRole('button', { name: 'Ajanda' })
    await expect(dugme).toBeVisible()
    await dugme.click()

    await context.setOffline(true)
    await page.getByRole('button', { name: /^Kaydet/ }).click()
    await expect(page.getByText('Bağlantı yok: işaretler bu cihazda bekliyor, bağlantı gelince gönderilecek.')).toBeVisible()
    const serit = page.getByTestId('cevrimdisi-serit')
    await expect(serit).toContainText('1 kayıt bu cihazda bekliyor')
    expect((await service().from('gunluk_kontrol').select('id').eq('student_id', ELIF).eq('tarih', bugun()).eq('madde', 'ajanda')).data).toHaveLength(0)
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await shot(page, 'cevrimdisi-serit')

    await context.setOffline(false)
    await expect(serit).toHaveCount(0, { timeout: 15_000 })
    await expect
      .poll(async () => (await service().from('gunluk_kontrol').select('id').eq('student_id', ELIF).eq('tarih', bugun()).eq('madde', 'ajanda')).data?.length)
      .toBe(1)
  })

  test('kurulum sihirbazı adımları gösterir ve bölüme götürür', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await loginAdmin(page)
    await page.goto('/yonetim?sekme=kurulum')
    const s = page.getByTestId('kurulum-sihirbazi')
    await expect(s.getByTestId('kurulum-adim')).toHaveCount(10)
    await expect(s.getByTestId('kurulum-adim').filter({ has: page.getByText('Sınıflar', { exact: true }) })).toContainText('✓ Tamam')
    await expect(s.getByRole('progressbar', { name: 'Kurulum ilerlemesi' })).toBeVisible()
    const axe = await new AxeBuilder({ page }).include('main').withTags(['wcag2a', 'wcag2aa']).analyze()
    expect(axe.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')).toEqual([])
    await shot(page, 'kurulum-sihirbazi')
    await s.getByTestId('kurulum-adim').filter({ hasText: 'Öğrenciler (Excel)' }).getByRole('button', { name: 'Toplu aktarıma git' }).click()
    await expect(page).toHaveURL(/sekme=aktarim/)
  })
})
