// İletişim: duyurular (rehberlik → veliler; branş öğretmeni → yalnız kendi sınıfı) ve veli–öğretmen mesajlaşması.
import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { DEMO, expectNotification, login, loginAdmin, logout, resetAdminMfa, service, shot } from './helpers'

async function axe(page: Page, label: string) {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.waitForTimeout(300)
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
  const bad = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
  expect(bad.map((v) => `${label}: ${v.id} (${v.nodes.length}) ${v.nodes[0]?.target}`)).toEqual([])
}

const MSG = `Merhaba, Elif matematik ödevini anlamadı (${Date.now()}).`

test.describe.serial('İletişim', () => {
  test.beforeAll(async () => {
    const svc = service()
    await svc.from('announcements').delete().like('title', 'E2E %')
    await svc.from('conversations').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    await resetAdminMfa()
  })

  test('rehberlik velilere okul duyurusu yayınlar', async ({ page }) => {
    await login(page, ...DEMO.rehber)
    await page.getByRole('link', { name: 'Duyurular', exact: true }).click()
    await page.getByRole('button', { name: 'Duyuru yaz' }).click()
    const dlg = page.getByRole('dialog', { name: 'Duyuru yaz' })
    await dlg.getByLabel('Başlık').fill('E2E Veli toplantısı')
    await dlg.getByLabel('Metin').fill('Cuma 17.00, konferans salonunda.')
    await dlg.getByRole('checkbox', { name: 'Öğrenciler' }).click()
    await dlg.getByRole('button', { name: 'Yayınla' }).click()
    await expect(page.getByRole('article', { name: 'E2E Veli toplantısı' })).toContainText('Tüm okul')
    await axe(page, 'duyurular (rehber)')
    await shot(page, 'i1-duyurular-rehber')
  })

  test('branş öğretmeni yalnız ders verdiği sınıfa duyuru yayınlar', async ({ page }) => {
    await login(page, ...DEMO.matematik)
    await page.getByRole('link', { name: 'Duyurular', exact: true }).click()
    await page.getByRole('button', { name: 'Duyuru yaz' }).click()
    const dlg = page.getByRole('dialog', { name: 'Duyuru yaz' })
    await expect(dlg.getByRole('group', { name: 'Kapsam' })).toHaveCount(0)
    await expect(dlg.getByLabel('Sınıf').locator('option')).toHaveText(['8/A'])
    await dlg.getByLabel('Başlık').fill('E2E Cetvel')
    await dlg.getByLabel('Metin').fill('Yarın cetvel ve pergel getirin.')
    await dlg.getByRole('button', { name: 'Yayınla' }).click()
    await expect(page.getByRole('article', { name: 'E2E Cetvel' })).toContainText('8/A')
  })

  test('veli: duyuruları görür, çocuğunun matematik öğretmenine yazar', async ({ page }) => {
    await login(page, ...DEMO.veli)
    await expectNotification(page, 'Duyuru: E2E Cetvel')
    // Duyuru bildirimi Duyurular sayfasını açar
    await page.getByRole('button', { name: /^Bildirimler/ }).click()
    await page.getByRole('dialog', { name: 'Bildirimler' }).getByText('Duyuru: E2E Cetvel').first().click()
    await expect(page).toHaveURL(/\/duyurular\?d=/)
    await expect(page.getByRole('heading', { name: 'Duyurular', exact: true })).toBeVisible()
    await expect(page.getByRole('article', { name: 'E2E Veli toplantısı' })).toBeVisible()
    await expect(page.getByRole('article', { name: 'E2E Cetvel' })).toContainText('Murat Kaya · Matematik öğretmeni')
    await axe(page, 'duyurular (veli)')

    // İletişim doğrudan mesajlaşmadır (sekme yok); eski ?sekme=duyurular bağlantısı Duyurular'a gider
    await page.getByRole('navigation', { name: 'Ana menü' }).getByRole('link', { name: /^İletişim/ }).click()
    await expect(page.getByRole('group', { name: 'İletişim bölümü' })).toHaveCount(0)
    await expect(page.getByRole('article', { name: 'E2E Cetvel' })).toHaveCount(0)
    await page.getByRole('button', { name: 'Yeni mesaj' }).click()
    const dlg = page.getByRole('dialog', { name: 'Yeni mesaj' })
    await dlg.getByLabel('Kime').selectOption({ label: 'Murat Kaya · Matematik' })
    await dlg.getByLabel('Mesaj').fill(MSG)
    await dlg.getByRole('button', { name: 'Gönder' }).click()
    const thread = page.getByRole('region', { name: 'Murat Kaya ile yazışma' })
    await expect(thread.getByTestId('message')).toContainText(MSG)
    await axe(page, 'mesajlar (veli)')
    await shot(page, 'i2-mesaj-veli')
  })

  test('öğretmen: menüde okunmamış sayısı, yazışmayı açar ve cevaplar', async ({ page }) => {
    await login(page, ...DEMO.matematik)
    await expect(page.getByRole('link', { name: /İletişim/ }).getByLabel('1 okunmamış mesaj')).toBeVisible()
    await expectNotification(page, 'Ayşe Yıldız mesaj gönderdi (Elif Yıldız)')
    await page.getByRole('button', { name: /^Bildirimler/ }).click()
    await page.getByRole('dialog', { name: 'Bildirimler' }).getByText('Ayşe Yıldız mesaj gönderdi (Elif Yıldız)').first().click()
    const thread = page.getByRole('region', { name: 'Ayşe Yıldız ile yazışma' })
    await expect(thread.getByTestId('message')).toContainText(MSG)
    await thread.getByLabel('Mesajın').fill('Yarın ders sonunda birlikte bakalım.')
    await thread.getByLabel('Mesajın').press('Enter')
    await expect(thread.getByTestId('message').last()).toContainText('Yarın ders sonunda birlikte bakalım.')
    await expect(page.getByRole('link', { name: /İletişim/ }).getByLabel(/okunmamış/)).toHaveCount(0)
    await logout(page)

    await login(page, ...DEMO.veli)
    await expect(page.getByRole('navigation', { name: 'Ana menü' })).toBeVisible()
    await page.goto('/iletisim')
    await page.getByTestId('conversation').first().click()
    await expect(page.getByTestId('message').first()).toContainText('okundu')
    await expect(page.getByTestId('message').last()).toContainText('Yarın ders sonunda birlikte bakalım.')
    // Eski bağlantılar: ?sekme=duyurular ve ?tab=duyurular → /duyurular
    await page.goto('/iletisim?sekme=duyurular')
    await expect(page).toHaveURL(/\/duyurular$/)
    await page.goto('/iletisim?tab=duyurular')
    await expect(page).toHaveURL(/\/duyurular$/)
  })

  test('öğretmen yeni mesajda önce sınıf, sonra o sınıfın öğrencisini seçer; lise sınıfları da listede', async ({ page }) => {
    // Seed'de lise öğrencisi yok: geçici bir 10/A öğrencisi (sonda silinir)
    const svc = service()
    const c10 = (await svc.from('classes').select('id, school_id').eq('name', '10/A').single()).data!
    const lise = (await svc.from('students').insert({ full_name: 'E2E Lise Öğrencisi', class_id: c10.id, school_id: c10.school_id }).select('id').single()).data!
    try {
    await login(page, ...DEMO.rehber)
    await expect(page.getByRole('navigation', { name: 'Ana menü' })).toBeVisible()
    await page.goto('/iletisim')
    await page.getByRole('button', { name: 'Yeni mesaj' }).click()
    const dlg = page.getByRole('dialog', { name: 'Yeni mesaj' })
    const ogr = dlg.locator('#mStu')
    await expect(ogr).toBeDisabled()
    const sinif = dlg.locator('#mCls')
    await expect(sinif.locator('optgroup[label="Lise"] option', { hasText: '10/A' })).toHaveCount(1)
    await expect(sinif.locator('optgroup[label="Ortaokul"] option', { hasText: '8/A' })).toHaveCount(1)
    await sinif.selectOption({ label: '8/A' })
    await expect(ogr).toBeEnabled()
    const adlar = (await ogr.locator('option').allInnerTexts()).slice(1)
    expect(adlar.length).toBeGreaterThan(0)
    expect(adlar).toEqual([...adlar].sort((a, b) => a.localeCompare(b, 'tr')))
    await ogr.selectOption({ label: 'Elif Yıldız' })
    await expect(dlg.getByLabel('Veli').locator('option', { hasText: 'Ayşe Yıldız' })).toHaveCount(1)
    // Arama: sınıftan bağımsız, ad ya da okul no; sonuçta sınıf adı da yazar
    await dlg.getByLabel('Öğrenci ara').fill('elif yıl')
    await expect(sinif).toBeDisabled()
    await expect(ogr.locator('option', { hasText: 'Elif Yıldız · 8/A' })).toHaveCount(1)
    await ogr.selectOption({ label: 'Elif Yıldız · 8/A' })
    await expect(dlg.getByLabel('Veli').locator('option', { hasText: 'Ayşe Yıldız' })).toHaveCount(1)
    await dlg.getByLabel('Öğrenci ara').fill('1184')
    await expect(ogr.locator('option', { hasText: 'Elif Yıldız · 8/A' })).toHaveCount(1)
    await dlg.getByLabel('Öğrenci ara').fill('zzzz')
    await expect(ogr.locator('option').first()).toHaveText('Eşleşen öğrenci yok')
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await axe(page, 'yeni mesaj (öğretmen)')
    } finally {
      await svc.from('students').delete().eq('id', lise.id)
    }
  })

  test('yönetici yazışmayı görür ama yazamaz; öğrencide Mesajlar yok', async ({ page }) => {
    await loginAdmin(page)
    await expect(page.getByRole('navigation', { name: 'Ana menü' })).toBeVisible()
    await page.goto('/iletisim')
    await page.getByTestId('conversation').first().click()
    await expect(page.getByText('Yönetici olarak bu yazışmayı yalnız görüntülüyorsun.')).toBeVisible()
    await expect(page.getByLabel('Mesajın')).toHaveCount(0)
    await logout(page)

    await login(page, ...DEMO.ogrenci)
    await expect(page.getByRole('navigation', { name: 'Ana menü' }).getByRole('link', { name: 'Duyurular' })).toBeVisible()
    await expect(page.getByRole('navigation', { name: 'Ana menü' }).getByRole('link', { name: /^İletişim/ })).toHaveCount(0)
    await page.goto('/iletisim?sekme=duyurular') // eski bağlantı
    await expect(page).toHaveURL(/\/duyurular$/)
    await expect(page.getByRole('article', { name: 'E2E Cetvel' })).toBeVisible()
    await expect(page.getByRole('article', { name: 'E2E Veli toplantısı' })).toHaveCount(0)
  })
})
