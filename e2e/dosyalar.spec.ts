// Faz C · Dosyalar: mesaj eki, duyuru kapak görseli + PDF, ödev eki ve öğrenci teslimi, okul logosu.
import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { DEMO, login, loginAdmin, logout, resetAdminMfa, service, shot } from './helpers'

async function axe(page: Page, label: string) {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.waitForTimeout(300)
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
  const bad = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
  expect(bad.map((v) => `${label}: ${v.id} (${v.nodes.length}) ${v.nodes[0]?.target}`)).toEqual([])
}
const svc = service()
const PNG = { name: 'afis.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64') }
const PDF = (name: string) => ({ name, mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n') })
const inApp = (page: Page) => expect(page.getByRole('navigation', { name: 'Ana menü' })).toBeVisible()
const file = (page: Page, label: string) => page.locator(`input[type=file][aria-label="${label}"]`)

test.describe.serial('Dosyalar', () => {
  let secret = ''
  test.beforeAll(async () => {
    await svc.from('conversations').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    await svc.from('announcements').delete().like('title', 'E2E %')
    await svc.from('homework').delete().like('title', 'E2E %')
    await svc.from('school_settings').delete().or('key.like.dosya.%,key.like.mesaj.%,key.like.duyuru.%,key.like.odev.%,key.eq.genel.logo')
    await resetAdminMfa()
  })
  test.afterAll(async () => {
    await svc.from('school_settings').delete().or('key.like.odev.%,key.eq.genel.logo')
  })

  test('veli mesajına PDF ekler; öğretmen eki görür', async ({ page }) => {
    await login(page, ...DEMO.veli)
    await inApp(page)
    await page.goto('/iletisim')
    await page.getByRole('button', { name: 'Yeni mesaj' }).click()
    const dlg = page.getByRole('dialog', { name: 'Yeni mesaj' })
    await dlg.getByLabel('Kime').selectOption({ label: 'Murat Kaya · Matematik' })
    await dlg.getByLabel('Mesaj').fill('Ödev fotoğrafını gönderiyorum.')
    await dlg.getByRole('button', { name: 'Gönder' }).click()
    const thread = page.getByRole('region', { name: 'Murat Kaya ile yazışma' })
    await file(page, 'Dosya').setInputFiles(PDF('odev-sayfa.pdf'))
    await expect(thread.getByRole('button', { name: 'odev-sayfa.pdf dosyasını çıkar' })).toBeVisible()
    await thread.getByRole('button', { name: 'Gönder' }).click()
    await expect(thread.getByRole('button', { name: 'odev-sayfa.pdf dosyasını aç' })).toBeVisible()
    await axe(page, 'mesaj eki')
    await logout(page)

    await login(page, ...DEMO.matematik)
    await inApp(page)
    await page.goto('/iletisim')
    await page.getByTestId('conversation').first().click()
    const pop = page.waitForEvent('popup')
    await page.getByRole('button', { name: 'odev-sayfa.pdf dosyasını aç' }).click()
    // Yeni sekme ancak dosya oturumla indirilip blob adresi üretildikten sonra açılır
    await (await pop).close()
  })

  test('rehberlik kapak görselli ve PDF ekli duyuru yayınlar; veli görür', async ({ page }) => {
    await login(page, ...DEMO.rehber)
    await page.getByRole('link', { name: 'Duyurular', exact: true }).click()
    await page.getByRole('button', { name: 'Duyuru yaz' }).click()
    const dlg = page.getByRole('dialog', { name: 'Duyuru yaz' })
    await dlg.getByLabel('Başlık').fill('E2E Çanakkale gezisi')
    await dlg.getByLabel('Metin').fill('Gezi 15 Ekim Cuma. İzin belgesini imzalayıp gönderiniz.')
    await file(page, 'Kapak görseli').setInputFiles(PNG)
    await file(page, 'Dosya ekle').setInputFiles(PDF('veli-izin-belgesi.pdf'))
    await dlg.getByRole('button', { name: 'Yayınla' }).click()
    await expect(page.getByRole('article', { name: 'E2E Çanakkale gezisi' }).getByRole('img', { name: /kapak görseli/ })).toBeVisible()
    await logout(page)

    await login(page, ...DEMO.veli)
    await page.getByRole('link', { name: 'Duyurular', exact: true }).click()
    const card = page.getByRole('article', { name: 'E2E Çanakkale gezisi' })
    await expect(card.getByRole('img', { name: /kapak görseli/ })).toBeVisible()
    await expect(card.getByRole('button', { name: 'veli-izin-belgesi.pdf dosyasını aç' })).toBeVisible()
    await axe(page, 'duyuru ekleri')
    await shot(page, 'c1-duyuru-ekli')
  })

  test('öğretmen ödeve dosya ekler; yönetici öğrenci teslimini açar; öğrenci yükler, öğretmen görür', async ({ page }) => {
    await login(page, ...DEMO.matematik)
    await page.getByRole('link', { name: 'Ödevler' }).click()
    await page.getByRole('button', { name: 'Ödev ver' }).click()
    const dlg = page.getByRole('dialog', { name: 'Ödev ver' })
    await dlg.getByLabel('Başlık').fill('E2E Çalışma kağıdı')
    await dlg.getByLabel('Son teslim').fill(new Date(Date.now() + 5 * 86400_000).toISOString().slice(0, 10))
    await file(page, 'Dosya / görsel ekle').setInputFiles(PDF('calisma-kagidi.pdf'))
    await dlg.getByRole('button', { name: 'Ödevi ver' }).click()
    await expect(page.getByRole('button', { name: 'calisma-kagidi.pdf dosyasını aç' })).toBeVisible()
    await logout(page)

    secret = await loginAdmin(page)
    await inApp(page)
    await page.goto('/yonetim?sekme=odev')
    await page.getByRole('switch', { name: /Öğrenci dosya yükleyebilir/ }).click()
    await expect(page.getByRole('switch', { name: /Öğrenci dosya yükleyebilir/ })).toHaveAttribute('aria-checked', 'true')
    await logout(page)

    await login(page, ...DEMO.ogrenci)
    await page.getByRole('link', { name: 'Ödevler' }).click()
    const card = page.getByRole('article', { name: 'E2E Çalışma kağıdı' })
    await expect(card.getByRole('button', { name: 'calisma-kagidi.pdf dosyasını aç' })).toBeVisible()
    await card.locator('input[type=file][aria-label="Ödevimi yükle"]').setInputFiles(PNG)
    await expect(card.getByText('Teslim edilen')).toBeVisible()
    await logout(page)

    await login(page, ...DEMO.matematik)
    await page.getByRole('link', { name: 'Ödevler' }).click()
    await page.getByTestId('homework-card').filter({ hasText: 'E2E Çalışma kağıdı' }).click()
    await expect(page.getByTestId('hw-row').filter({ hasText: 'Elif Yıldız' }).getByRole('button', { name: 'afis.png dosyasını aç' })).toBeVisible()
  })

  test('yönetici logo yükler; giriş ekranında görünür; dosya ayarları erişilebilir', async ({ page }) => {
    await loginAdmin(page, secret)
    await inApp(page)
    await page.goto('/yonetim?sekme=genel')
    await page.locator('input[type=file][aria-label="Logo yükle"]').setInputFiles(PNG)
    await expect(page.getByText('Logo güncellendi')).toBeVisible()
    await page.goto('/yonetim?sekme=dosya')
    await expect(page.getByLabel('Öğretmen hangi kapsamda duyuru yapabilir?')).toBeVisible()
    await axe(page, 'dosya ve duyuru ayarları')
    await logout(page)
    await expect(page.locator('.login img').first()).toBeVisible()
  })
})
