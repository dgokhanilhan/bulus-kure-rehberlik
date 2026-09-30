// Aşama 3 · docs/test-senaryolari.md §5 Denemeler (sentetik Deneme Köprüsü paketiyle; gerçek PDF regresyonu tests/regresyon.test.ts).
import { test, expect } from '@playwright/test'
import { DEMO, ELIF, expectNotification, login, logout, openStudent, shot } from './helpers'

const PACK = 'public/ornek/ornek-deneme.json'
const TINY_PDF = Buffer.from(
  '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 200]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj\n4 0 obj<</Length 44>>stream\nBT /F1 18 Tf 20 100 Td (Merhaba dunya) Tj ET\nendstream endobj\n5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF',
)

test.describe.serial('§5 Denemeler', () => {
  test('tanınmayan PDF uydurulmaz: açık bir hata gösterilir', async ({ page }) => {
    await login(page, ...DEMO.rehber)
    await expect(page.getByRole('navigation', { name: 'Ana menü' })).toBeVisible()
    await page.goto('/denemeler')
    await page.locator('#upFile').setInputFiles({ name: 'tanimsiz.pdf', mimeType: 'application/pdf', buffer: TINY_PDF })
    await expect(page.getByRole('alert')).toContainText('Bu sayfa düzeni henüz tanınmıyor.')
  })

  test('5.1–5.3 yükle → oku (yazım hataları düzeltilir) → kontrol (yalnız gerçek sorunlar, çözülmeden Yayınla pasif) → yayınla → profillere işlenir → sil', async ({ page }) => {
    await login(page, ...DEMO.rehber)
    await expect(page.getByRole('navigation', { name: 'Ana menü' })).toBeVisible()
    await page.goto('/denemeler')
    await page.locator('#upFile').setInputFiles(PACK)

    // Oku
    await expect(page.getByText('9 öğrenci sayfası bulundu · 1 sayfa tanınmadı')).toBeVisible()
    await expect(page.getByText(/Konular resmî listeyle eşleştirildi \(%100\)/)).toBeVisible()

    // Kontrol
    await expect(page.getByTestId('pending-chip')).toHaveText('3 kontrol bekliyor')
    await expect(page.getByText('ZEGNEP KAYA → Zeynep Kaya · KERM AYDIN → Kerem Aydın')).toBeVisible()
    const publish = page.getByRole('button', { name: 'Önce kontrolleri bitir' })
    await expect(publish).toBeDisabled()
    const issues = page.getByTestId('issue')
    await expect(issues).toHaveCount(3)
    await shot(page, '19-deneme-kontrol')

    await issues.filter({ hasText: 'BORA TAN' }).getByRole('button', { name: /Yeni öğrenci olarak ekle \(Bora Tan · 8\/C\)/ }).click()
    await issues.filter({ hasText: 'Mert Demir · Türkçe' }).getByRole('button', { name: 'Boş = 2 olarak düzelt' }).click()
    await issues.filter({ hasText: 'SAYFA OKUNAMADI' }).getByRole('button', { name: 'Bu sayfayı atla' }).click()
    await expect(page.getByTestId('pending-chip')).toHaveText('Hepsi tamam')
    await page.getByRole('button', { name: 'Yayınla' }).click()
    await expect(page.getByRole('heading', { name: 'TG-6 yayınlandı' })).toBeVisible()
    await expect(page.getByText('9 öğrencinin sonucu profillerine işlendi, veli ve öğrencilere bildirim gitti')).toBeVisible()
    await shot(page, '20-deneme-yayinlandi')

    // Profile işlendi, Bugün yeniden hesaplandı
    await openStudent(page, ELIF, 'denemeler')
    await expect(page.getByRole('row').filter({ hasText: 'TG-6' })).toBeVisible()
    await page.getByRole('link', { name: 'Bugün', exact: true }).click()
    await expect(page.getByText('Son deneme · TG-6')).toBeVisible()
    await logout(page)

    // Veli bildirimi
    await login(page, ...DEMO.veli)
    await expectNotification(page, 'TG-6 sonucu yayınlandı: Elif Yıldız')
    await expect(page.getByText('TG-6').first()).toBeVisible()
    await logout(page)

    // Sil: deneme adı yazılmadan düğme açılmaz
    await login(page, ...DEMO.rehber)
    await expect(page.getByRole('navigation', { name: 'Ana menü' })).toBeVisible()
    await page.goto('/denemeler')
    await page.getByText('Yüklenen denemeler').click()
    await page.getByRole('button', { name: 'TG-6 denemesini sil' }).click()
    const dlg = page.getByRole('dialog', { name: 'Denemeyi sil' })
    await expect(dlg.getByRole('button', { name: 'Kalıcı olarak sil' })).toBeDisabled()
    await dlg.getByLabel(/Onaylamak için/).fill('TG-6')
    await dlg.getByRole('button', { name: 'Kalıcı olarak sil' }).click()
    await expect(page.getByText('TG-6 silindi')).toBeVisible()
    await expect(page.getByTestId('exam-row').filter({ hasText: 'TG-6' })).toHaveCount(0)
  })
})
