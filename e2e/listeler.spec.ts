import { test, expect } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { loginAdmin, resetAdminMfa, service, shot, login, DEMO } from './helpers'

test('liste hazırlama, iletişim, tekrar kullanım, PDF ve Excel', async ({ page }) => {
  test.setTimeout(150_000)
  await resetAdminMfa()
  await loginAdmin(page)
  await page.goto('/yonetim?sekme=listeler')
  await expect(page.getByText('Bir kez düzenle, her ihtiyacında kullan.')).toBeVisible()
  await page.getByRole('button', { name: 'Deneme sınavı listesi', exact: true }).click()
  await page.getByRole('button', { name: '2. Sütunlar ve düzen' }).click()
  await page.getByLabel('Liste adı / başlık').fill('E2E Türkçe Sınav Çizelgesi')
  await expect(page.locator('input[value="Kitapçık"]')).toBeVisible()
  await page.getByRole('button', { name: 'Şablonu kaydet', exact: true }).click()
  await expect(page.getByText('Şablon kaydedildi.', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '3. Önizleme ve çıktı' }).click()
  await page.getByLabel('1. satır Kitapçık', { exact: true }).fill('A')
  await page.evaluate(() => scrollTo(0, 0))
  await shot(page, 'list-center-desktop')
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Excel indir' }).click()
  const file = await download
  await mkdir('e2e-artifacts', { recursive: true })
  await file.saveAs('e2e-artifacts/liste.xlsx')
  await page.getByRole('button', { name: 'PDF önizle', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'PDF önizleme ve yazdırma' })
  await expect(dialog).toBeVisible()
  const dl = page.waitForEvent('download')
  await dialog.getByRole('link', { name: 'PDF indir', exact: true }).click()
  await (await dl).saveAs('e2e-artifacts/liste.pdf')
  await dialog.getByRole('button', { name: 'Kapat', exact: true }).click()
  await page.getByRole('button', { name: 'Sabit kopya kaydet', exact: true }).click()
  await expect(page.getByText('Sabit liste kaydedildi.', { exact: true })).toBeVisible()
  await expect(page.getByText('Sabit kayıt · güncel veriden bağımsız')).toBeVisible()
  await page.setViewportSize({ width: 820, height: 1180 })
  await page.evaluate(() => scrollTo(0, 0))
  await shot(page, 'list-center-ipad')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.evaluate(() => scrollTo(0, 0))
  await shot(page, 'list-center-mobile')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.getByRole('button', { name: 'Veli Listeleri', exact: true }).click()
  await page
    .getByRole('button', { name: /Telefon ekle/ })
    .first()
    .click()
  const contact = page.getByRole('dialog', { name: /iletişim/ })
  await contact.getByLabel('Telefon', { exact: true }).fill('0555 111 22 33')
  await contact.getByRole('button', { name: 'Kaydet', exact: true }).click()
  await expect(contact).toBeHidden()
  await expect(page.getByRole('button', { name: /\+905551112233/ }).first()).toBeVisible()
  await service().from('school_list_documents').delete().eq('name', 'E2E Türkçe Sınav Çizelgesi')
  await service().from('parent_contact_details').delete().eq('phone', '+905551112233')
})

test('kalabalık ve uzun isimli liste A4 dikey/yatay çok sayfa çıktısı', async ({ page }) => {
  test.setTimeout(150_000)
  const svc = service()
  const cls = await svc
    .from('classes')
    .insert({ school_id: '00000000-0000-4000-8000-000000000001', grade: 8, section: 'Z' })
    .select('id')
    .single()
  if (cls.error) throw cls.error
  try {
    const r = await svc
      .from('students')
      .insert(
        Array.from({ length: 85 }, (_, i) => ({
          school_id: '00000000-0000-4000-8000-000000000001',
          class_id: cls.data.id,
          full_name: `Çağrı İpek Şükrü Öztürk Uzun Soyadlı Öğrenci ${String(i + 1).padStart(3, '0')}`,
          school_no: '001',
        })),
      )
    if (r.error) throw r.error
    await resetAdminMfa()
    await loginAdmin(page)
    await page.goto(`/yonetim?sekme=listeler&sinif=${cls.data.id}`)
    await expect(page.getByText('85 kişi / satır bulundu')).toBeVisible()
    await shot(page, 'list-center-people')
    await page.getByRole('button', { name: '2. Sütunlar ve düzen' }).click()
    await page
      .getByLabel('Açıklama', { exact: true })
      .fill(
        'Örnek okul evrakı: Türkçe karakterler ve uzun adlar, tekrarlanan tablo başlıkları, satır bütünlüğü ve sayfa kenarları kontrol edilir.',
      )
    await page.getByLabel('Alt not', { exact: true }).fill('Yalnız yerel test için sentetik veriler.')
    await page.getByLabel('İmza / onay alanı').fill('Hazırlayan:                         Onaylayan:')
    await shot(page, 'list-center-columns')
    for (const orientation of ['portrait', 'landscape']) {
      await page.getByLabel('Sayfa yönü').selectOption(orientation)
      await page.getByRole('button', { name: 'PDF önizle', exact: true }).click()
      const dialog = page.getByRole('dialog', { name: 'PDF önizleme ve yazdırma' })
      await expect(dialog).toBeVisible()
      const dl = page.waitForEvent('download')
      await dialog.getByRole('link', { name: 'PDF indir', exact: true }).click()
      await (await dl).saveAs(`e2e-artifacts/liste-many-${orientation}.pdf`)
      await dialog.getByRole('button', { name: 'Kapat', exact: true }).click()
    }
  } finally {
    await svc.from('students').delete().eq('class_id', cls.data.id)
    await svc.from('classes').delete().eq('id', cls.data.id)
  }
})

test('veli ve öğretmen doğrudan yönetim listesi adresini açamaz', async ({ page }) => {
  for (const account of [DEMO.veli, DEMO.matematik]) {
    await page.context().clearCookies()
    await page.goto('/')
    await page.evaluate(() => localStorage.clear())
    await page.reload()
    await login(page, account[0], account[1])
    await expect(page.getByRole('navigation', { name: 'Ana menü' })).toBeVisible()
    await page.goto('/yonetim?sekme=listeler')
    await expect(page.getByText('Bir kez düzenle, her ihtiyacında kullan.')).not.toBeVisible()
  }
})
