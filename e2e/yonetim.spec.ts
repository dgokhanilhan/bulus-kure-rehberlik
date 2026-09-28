// Yönetim paneli: sınıf ekle/düzenle/sil, öğrenci ekle/taşı/sil, öğretmen düzenle, hesap kapat/aç, veli bağla; erişilebilirlik.
import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { DEMO, login, loginAdmin, menu, resetAdminMfa, service, shot } from './helpers'

async function axe(page: Page, label: string) {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.waitForTimeout(300)
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
  const bad = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
  expect(bad.map((v) => `${label}: ${v.id} (${v.nodes.length}) ${v.nodes[0]?.target}`)).toEqual([])
}

const tab = (page: Page, name: string) => page.getByRole('group', { name: 'Yönetim bölümü' }).getByRole('button', { name })

test.describe.serial('Yönetim paneli', () => {
  let secret = ''
  test.beforeAll(async () => {
    await resetAdminMfa()
    // Önceki koşudan kalmış olabilecek test kayıtları
    const svc = service()
    await svc.from('students').delete().eq('full_name', 'Deniz Yönetim')
    await svc.from('classes').delete().eq('grade', 5).eq('section', 'Y')
  })

  test('menü ve sınıflar: kademelere göre liste, sınıf ekle/düzenle', async ({ page }) => {
    secret = await loginAdmin(page)
    await expect(menu(page)).toHaveText(['Bugün', 'Öğrenciler', 'Denemeler', 'Sınıflar', 'Yönetim', /Onaylar/])
    await page.getByRole('link', { name: 'Yönetim' }).click()
    await expect(page.getByRole('heading', { name: 'Yönetim' })).toBeVisible()
    for (const k of ['İlkokul', 'Ortaokul', 'Lise']) await expect(page.getByRole('region', { name: k })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Lise' }).getByText('10/A')).toBeVisible()

    await page.getByRole('button', { name: 'Sınıf ekle' }).click()
    const dlg = page.getByRole('dialog', { name: 'Sınıf ekle' })
    await dlg.getByLabel('Düzey').selectOption('5')
    await dlg.getByLabel('Şube').selectOption('Y')
    await dlg.getByLabel('Sınıf öğretmeni (isteğe bağlı)').selectOption({ label: 'Esra Demir · Fen Bilimleri' })
    await dlg.getByRole('button', { name: 'Kaydet' }).click()
    const row = page.getByTestId('class-row').filter({ hasText: '5/Y' })
    await expect(row).toContainText('Esra Demir')
    await axe(page, 'yönetim sınıflar')
    await shot(page, 'y1-yonetim-siniflar')

    // Aynı sınıf ikinci kez açılamaz
    await page.getByRole('button', { name: 'Sınıf ekle' }).click()
    await dlg.getByLabel('Düzey').selectOption('5')
    await dlg.getByLabel('Şube').selectOption('Y')
    await dlg.getByRole('button', { name: 'Kaydet' }).click()
    await expect(dlg.getByRole('alert')).toHaveText('5/Y sınıfı zaten var.')
    await dlg.getByRole('button', { name: 'Vazgeç' }).click()
  })

  test('öğrenci ekle, sınıfını değiştir; dolu sınıf silinmez; öğrenci ve sınıf silinir', async ({ page }) => {
    await loginAdmin(page, secret)
    await page.goto('/yonetim?sekme=ogrenciler')
    await page.getByRole('button', { name: 'Öğrenci ekle' }).click()
    const dlg = page.getByRole('dialog', { name: 'Öğrenci ekle' })
    await dlg.getByLabel('Ad soyad').fill('Deniz Yönetim')
    await dlg.getByLabel('Sınıf').selectOption({ label: '5/Y' })
    await dlg.getByLabel('Okul no (isteğe bağlı)').fill('5901')
    await dlg.getByRole('button', { name: 'Kaydet' }).click()
    const row = page.getByTestId('student-row').filter({ hasText: 'Deniz Yönetim' })
    await expect(row).toContainText('5/Y')
    await axe(page, 'yönetim öğrenciler')
    await shot(page, 'y2-yonetim-ogrenciler')

    // Dolu sınıf silinmez
    await tab(page, 'Sınıflar').click()
    await page.getByRole('button', { name: '5/Y sınıfını sil' }).click()
    let del = page.getByRole('dialog', { name: '5/Y sınıfını sil' })
    await del.getByLabel('Onaylamak için “5/Y” yaz').fill('5/Y')
    await del.getByRole('button', { name: 'Kalıcı olarak sil' }).click()
    await expect(del.getByRole('alert')).toContainText('1 öğrenci var')
    await del.getByRole('button', { name: 'Vazgeç' }).click()

    // Öğrenciyi 3/A'ya taşı, sonra sil
    await tab(page, 'Öğrenciler').click()
    await page.getByRole('button', { name: 'Deniz Yönetim düzenle' }).click()
    const ed = page.getByRole('dialog', { name: 'Öğrenciyi düzenle' })
    await ed.getByLabel('Sınıf').selectOption({ label: '3/A' })
    await ed.getByRole('button', { name: 'Kaydet' }).click()
    await expect(row).toContainText('3/A')
    await page.getByRole('button', { name: 'Deniz Yönetim sil' }).click()
    del = page.getByRole('dialog', { name: 'Öğrenciyi sil' })
    await del.getByLabel('Onaylamak için “Deniz Yönetim” yaz').fill('deniz yönetim')
    await del.getByRole('button', { name: 'Kalıcı olarak sil' }).click()
    await expect(row).toHaveCount(0)

    await tab(page, 'Sınıflar').click()
    await page.getByRole('button', { name: '5/Y sınıfını sil' }).click()
    del = page.getByRole('dialog', { name: '5/Y sınıfını sil' })
    await del.getByLabel('Onaylamak için “5/Y” yaz').fill('5/Y')
    await del.getByRole('button', { name: 'Kalıcı olarak sil' }).click()
    await expect(page.getByTestId('class-row').filter({ hasText: '5/Y' })).toHaveCount(0)
  })

  test('öğretmen düzenle; hesap kapat → giremez; yeniden aç', async ({ page, browser }) => {
    await loginAdmin(page, secret)
    await page.goto('/yonetim?sekme=ogretmenler')
    await axe(page, 'yönetim öğretmenler')
    await shot(page, 'y3-yonetim-ogretmenler')
    await page.getByRole('button', { name: 'Esra Demir düzenle' }).click()
    const ed = page.getByRole('dialog', { name: /bilgilerini düzenle/ })
    await ed.getByLabel('Branş').selectOption('Fizik')
    await ed.getByRole('button', { name: 'Kaydet' }).click()
    await expect(page.getByTestId('teacher-row').filter({ hasText: 'Esra Demir' })).toContainText('Fizik')

    await page.getByRole('button', { name: 'Esra Demir hesabını kapat' }).click()
    await page.getByRole('dialog', { name: 'Hesabı kapat' }).getByRole('button', { name: 'Hesabı kapat' }).click()
    await expect(page.getByTestId('teacher-row').filter({ hasText: 'Esra Demir' })).toHaveCount(0)

    // Kapalı hesapla giriş: uygulamaya erişemez
    const other = await (await browser.newContext()).newPage()
    await login(other, 'fen@buluskure.k12.tr', 'Fen12345!')
    await expect(other.getByRole('navigation', { name: 'Ana menü' })).toHaveCount(0)
    await expect(other.getByRole('heading', { name: 'Hesabına erişim yok' })).toBeVisible()

    await tab(page, 'Kapalı hesaplar').click()
    await page.getByRole('button', { name: 'Esra Demir hesabını yeniden aç' }).click()
    await tab(page, 'Öğretmenler').click()
    await page.getByRole('button', { name: 'Esra Demir düzenle' }).click()
    await ed.getByLabel('Branş').selectOption('Fen Bilimleri')
    await ed.getByRole('button', { name: 'Kaydet' }).click()
    await expect(page.getByTestId('teacher-row').filter({ hasText: 'Esra Demir' })).toContainText('Fen Bilimleri')
  })

  test('veliye öğrenci bağla ve bağlantıyı kaldır', async ({ page }) => {
    await loginAdmin(page, secret)
    await page.goto('/yonetim?sekme=veliler')
    const card = page.getByTestId('parent-row').filter({ hasText: 'Ayşe Yıldız' })
    await expect(card).toContainText('Elif Yıldız')
    await axe(page, 'yönetim veliler')
    const sel = card.getByLabel('Öğrenci bağla')
    const kerem = await sel.locator('option', { hasText: 'Kerem' }).first().getAttribute('value')
    await sel.selectOption(kerem!)
    await card.getByRole('button', { name: 'Bağla', exact: true }).click()
    await expect(card.locator('.chip', { hasText: 'Kerem' })).toBeVisible()
    await card.getByRole('button', { name: /Kerem .* bağlantısını kaldır/ }).click()
    await expect(card.locator('.chip', { hasText: 'Kerem' })).toHaveCount(0)
  })

  test('kayıt formu: lise ve ilkokul sınıfları kademeye göre listelenir', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Kayıt ol' }).click()
    const sel = page.getByLabel('Sınıfın')
    await expect(sel.locator('optgroup[label="Lise"] option', { hasText: '10/A' })).toHaveCount(1)
    await expect(sel.locator('optgroup[label="İlkokul"] option', { hasText: '3/A' })).toHaveCount(1)
  })

  test('rehber: Yönetim menüsü yok, adresle de açılmaz', async ({ page }) => {
    await login(page, ...DEMO.rehber)
    await expect(menu(page)).toHaveText(['Bugün', 'Öğrenciler', 'Denemeler', 'Sınıflar'])
    await page.goto('/yonetim')
    await expect(page).toHaveURL(/\/bugun$/)
  })
})
