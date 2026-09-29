// Faz A · Yönetim Merkezi: modül aç/kapat, genel ayarlar, eğitim yılı, ders kataloğu, dinamik ders saatleri, ders atamaları.
import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { DEMO, login, loginAdmin, logout, menu, resetAdminMfa, service, shot } from './helpers'

async function axe(page: Page, label: string) {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.waitForTimeout(300)
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
  const bad = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
  expect(bad.map((v) => `${label}: ${v.id} (${v.nodes.length}) ${v.nodes[0]?.target}`)).toEqual([])
}
const section = (page: Page, name: string | RegExp) => page.getByRole('group', { name: 'Yönetim bölümü' }).getByRole('button', { name })
const svc = service()

test.describe.serial('Yönetim Merkezi', () => {
  let secret = ''
  const clean = async () => {
    await svc.from('school_settings').delete().like('key', 'modul.%')
    await svc.from('courses').delete().eq('name', 'Robotik')
    await svc.from('bell_times').delete().gt('period', 8)
    const { data: mat } = await svc.from('profiles').select('id').eq('email', 'matematik@buluskure.k12.tr').single()
    const { data: c8b } = await svc.from('classes').select('id').eq('name', '8/B').single()
    await svc.from('teaching_assignments').delete().eq('teacher_id', mat!.id).eq('class_id', c8b!.id)
  }
  test.beforeAll(async () => {
    await resetAdminMfa()
    await clean()
  })
  test.afterAll(clean)

  test('gruplu menü, genel ayarlar ve eğitim yılı', async ({ page }) => {
    secret = await loginAdmin(page)
    await page.getByRole('link', { name: 'Yönetim' }).click()
    await expect(page.getByRole('heading', { name: 'Yönetim Merkezi' })).toBeVisible()
    await section(page, 'Genel ayarlar').click()
    await page.getByLabel('Telefon').fill('0212 555 00 00')
    await page.getByRole('button', { name: 'Kaydet' }).click()
    await expect(page.getByText('Genel ayarlar kaydedildi')).toBeVisible()
    await axe(page, 'genel ayarlar')
    await section(page, 'Eğitim yılları').click()
    await expect(page.getByTestId('year-row').filter({ hasText: 'Aktif' })).toHaveCount(1)
    await axe(page, 'eğitim yılları')
  })

  test('modül kapatılınca veli ve rehber ekranından kalkar', async ({ page }) => {
    await loginAdmin(page, secret)
    await page.goto('/yonetim?sekme=moduller')
    await page.getByRole('switch', { name: 'Yemek listesi modülü' }).click()
    await expect(page.getByRole('switch', { name: 'Yemek listesi modülü' })).toHaveAttribute('aria-checked', 'false')
    await page.getByRole('switch', { name: 'LGS / Deneme modülü' }).click()
    await expect(page.getByRole('switch', { name: 'LGS / Deneme modülü' })).toHaveAttribute('aria-checked', 'false')
    await axe(page, 'modüller')
    await shot(page, 'm1-moduller')
    await logout(page)

    await login(page, ...DEMO.veli)
    await page.getByRole('link', { name: 'Okul' }).click()
    await expect(page.getByRole('article', { name: 'Haftalık ders programı' })).toBeVisible()
    await expect(page.getByRole('article', { name: 'Bugünün yemeği' })).toHaveCount(0)
    await expect(menu(page)).not.toContainText(['Raporlar'])
    await logout(page)

    await login(page, ...DEMO.rehber)
    await expect(menu(page)).toHaveText(['Bugün', 'Öğrenciler', /^İletişim/])
    await logout(page)

    await loginAdmin(page, secret)
    await page.goto('/yonetim?sekme=moduller')
    await page.getByRole('switch', { name: 'Yemek listesi modülü' }).click()
    await page.getByRole('switch', { name: 'LGS / Deneme modülü' }).click()
    await expect(page.getByRole('switch', { name: 'LGS / Deneme modülü' })).toHaveAttribute('aria-checked', 'true')
  })

  test('ders kataloğu: ders ekle, düzenle, sil', async ({ page }) => {
    await loginAdmin(page, secret)
    await page.goto('/yonetim?sekme=dersler')
    await page.getByRole('button', { name: 'Ders ekle' }).click()
    const dlg = page.getByRole('dialog', { name: 'Ders ekle' })
    await dlg.getByLabel('Ders adı').fill('Robotik')
    await dlg.getByLabel('Kısa ad (en fazla 8)').fill('rob')
    await dlg.getByRole('checkbox', { name: 'Ortaokul' }).click()
    await dlg.getByRole('radio', { name: 'Renk #3b5bdb' }).click()
    await dlg.getByRole('button', { name: 'Kaydet' }).click()
    const row = page.getByTestId('course-row').filter({ hasText: 'Robotik' })
    await expect(row).toContainText('ROB')
    await expect(row).toContainText('Ortaokul')
    await axe(page, 'dersler')
    await shot(page, 'm2-dersler')
    await page.getByRole('button', { name: 'Robotik dersini sil' }).click()
    const del = page.getByRole('dialog', { name: 'Robotik dersini sil' })
    await del.getByLabel('Onaylamak için “Robotik” yaz').fill('Robotik')
    await del.getByRole('button', { name: 'Kalıcı olarak sil' }).click()
    await expect(row).toHaveCount(0)
  })

  test('ders saatleri: 9. ders eklenir, programda görünür, silinir', async ({ page }) => {
    await loginAdmin(page, secret)
    await page.goto('/yonetim?sekme=saatler')
    await expect(page.getByTestId('bell-row')).toHaveCount(8)
    await page.getByLabel('Yeni ders başlangıç').fill('15:50')
    await page.getByLabel('Bitiş', { exact: true }).fill('16:30')
    await page.getByRole('button', { name: 'Ders saati ekle' }).click()
    await expect(page.getByTestId('bell-row')).toHaveCount(9)
    await axe(page, 'ders saatleri')
    await shot(page, 'm3-ders-saatleri')
    await section(page, /^Ders programı/).click()
    await page.getByLabel('Sınıf').selectOption({ label: '8/A' })
    await expect(page.getByRole('button', { name: 'Pazartesi 9. ders boş' })).toBeVisible()
    await section(page, 'Ders saatleri').click()
    await page.getByRole('button', { name: '9. ders saatini sil' }).click()
    await page.getByRole('dialog', { name: '9. ders saatini sil' }).getByRole('button', { name: 'Sil' }).click()
    await expect(page.getByTestId('bell-row')).toHaveCount(8)
  })

  test('ders ataması: öğretmen atandığı sınıfa duyuru yapabilir', async ({ page }) => {
    await loginAdmin(page, secret)
    await page.goto('/yonetim?sekme=atamalar')
    await page.getByLabel('Sınıf').selectOption({ label: '8/B' })
    await page.getByRole('combobox', { name: /^Ders/ }).selectOption({ label: 'Matematik' })
    await page.getByLabel('Öğretmen').selectOption({ label: 'Murat Kaya · Matematik' })
    await page.getByRole('button', { name: 'Ata', exact: true }).click()
    await expect(page.getByTestId('assignment-row').filter({ hasText: 'Murat Kaya' })).toContainText('Matematik')
    await axe(page, 'ders atamaları')
    await shot(page, 'm4-ders-atamalari')
    await logout(page)

    await login(page, ...DEMO.matematik)
    await page.getByRole('link', { name: /İletişim/ }).click()
    await page.getByRole('button', { name: 'Duyuru yaz' }).click()
    await expect(page.getByRole('dialog', { name: 'Duyuru yaz' }).getByLabel('Sınıf').locator('option')).toHaveText(['8/A', '8/B'])
  })
})
