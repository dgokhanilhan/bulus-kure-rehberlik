// Kullanım panosu ve KVKK: veli Hesap ayarlarından başvurur, yönetici Yönetim › KVKK başvurularından yanıtlar,
// öğrenci sayfasındaki KVKK sekmesinde rıza durumu ve erişim kaydı görünür. Panolar yalnız yöneticiye.
import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { DEMO, ELIF, login, loginAdmin, resetAdminMfa, service, shot } from './helpers'

const svc = service()
const ACIKLAMA = 'E2E KVKK: hangi verilerin tutulduğunu öğrenmek istiyorum.'
const temizle = async () => {
  await svc.from('kvkk_talep').delete().like('aciklama', 'E2E KVKK%')
}

test.describe.serial('Kullanım panosu ve KVKK', () => {
  test.beforeAll(async () => {
    await resetAdminMfa()
    await temizle()
  })
  test.afterAll(temizle)

  test('veli başvurur, yönetici yanıtlar; kullanım panosu ve öğrenci KVKK dosyası görünür', async ({ page, browser }) => {
    // Öğretmen öğrenci sayfasını açar → erişim kaydı
    const rehber = await (await browser.newContext()).newPage()
    await login(rehber, ...DEMO.rehber)
    await expect(rehber.getByRole('navigation', { name: 'Ana menü' })).toBeVisible()
    await rehber.goto(`/ogrenciler/${ELIF}`)
    await expect(rehber.getByRole('tab', { name: 'KVKK' })).toHaveCount(0) // yalnız yöneticiye

    // Veli başvurusu
    const veli = await (await browser.newContext()).newPage()
    await veli.emulateMedia({ reducedMotion: 'reduce' })
    await login(veli, ...DEMO.veli)
    await expect(veli.getByRole('navigation', { name: 'Ana menü' })).toBeVisible()
    await veli.goto('/hesap-ayarlari')
    const form = veli.getByTestId('kvkk-basvuru')
    await form.getByLabel('Başvuru konusu').selectOption('bilgi')
    await expect(form.getByLabel('Kimin verileri')).toHaveValue(ELIF)
    await form.getByLabel('Açıklama (isteğe bağlı)').fill(ACIKLAMA)
    await form.getByRole('button', { name: 'Başvuruyu gönder' }).click()
    await expect(form.getByTestId('kvkk-basvurum').first()).toContainText('Alındı')
    const axe = await new AxeBuilder({ page: veli }).include('main').withTags(['wcag2a', 'wcag2aa']).analyze()
    expect(axe.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')).toEqual([])

    // Yönetici: başvuruyu yanıtla
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await loginAdmin(page)
    await page.goto('/yonetim?sekme=kvkk')
    const talep = page.getByTestId('kvkk-talep').filter({ hasText: ACIKLAMA })
    await expect(talep).toContainText('Elif Yıldız')
    await expect(talep).toContainText('30 gün kaldı')
    await talep.getByLabel('Yanıt (başvurana gider)').fill('Tutulan veriler e-postanıza gönderildi.')
    await talep.getByRole('button', { name: 'Sonuçlandı' }).click()
    await expect(page.getByTestId('kvkk-talep').filter({ hasText: ACIKLAMA })).toHaveCount(0) // bekleyenlerden düştü
    await shot(page, 'kvkk-basvurulari')

    await veli.reload()
    await expect(veli.getByTestId('kvkk-basvurum').filter({ hasText: 'Sonuçlandı' }).first()).toContainText('Tutulan veriler e-postanıza gönderildi.')

    // Kullanım panosu
    await page.goto('/yonetim?sekme=kullanim')
    const pano = page.getByTestId('kullanim-panosu')
    await expect(pano).toContainText('Bölüm kullanımı')
    await expect(pano).toContainText('Görev atama')
    await expect(pano.getByTestId('pasif-hesaplar')).toBeVisible()
    const axe2 = await new AxeBuilder({ page }).include('main').withTags(['wcag2a', 'wcag2aa']).analyze()
    expect(axe2.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')).toEqual([])
    await shot(page, 'kullanim-panosu')

    // Öğrenci KVKK dosyası
    await page.goto(`/ogrenciler/${ELIF}?sekme=kvkk`)
    const dosya = page.getByTestId('kvkk-dosyasi')
    await expect(dosya).toContainText('Ayşe Yıldız')
    await expect(dosya.getByTestId('kvkk-erisim')).toContainText('Selin Aksoy')
    await expect(dosya.getByTestId('kvkk-erisim')).toContainText('öğrenci sayfası')
    await shot(page, 'kvkk-dosyasi')
  })
})
