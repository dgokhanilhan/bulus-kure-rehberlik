// Galeri (0022): yönetici modülü açar, albüm oluşturur, çoklu yükler (sahte dosya reddedilir, diğerleri devam eder),
// ışık kutusu, yayınla + bildirim; sınıf velisi görür, başka sınıf velisi göremez; arşiv/geri al; modül kapalıyken menüde yok; kalıcı silme.
import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import path from 'node:path'
import { DEMO, expectNotification, login, loginAdmin, logout, menu, resetAdminMfa, service, shot } from './helpers'

async function axe(page: Page, label: string) {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.waitForTimeout(300)
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
  const bad = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
  expect(bad.map((v) => `${label}: ${v.id} (${v.nodes.length}) ${v.nodes[0]?.target}`)).toEqual([])
}
const svc = service()
const TITLE = `E2E Çanakkale Gezisi ${Date.now() % 100000}`
const F = (n: string) => path.join(import.meta.dirname, 'fixtures/galeri', n)
let albumUrl = ''

async function cleanup() {
  const { data } = await svc.from('gallery_albums').select('id').like('title', 'E2E %')
  for (const a of data ?? []) {
    const { data: m } = await svc.from('gallery_media').select('path, view_path, thumb_path').eq('album_id', a.id)
    const p = (m ?? []).flatMap((x) => [x.path, x.view_path, x.thumb_path]).filter(Boolean) as string[]
    if (p.length) await svc.storage.from('galeri').remove(p)
    await svc.from('gallery_albums').delete().eq('id', a.id)
  }
  await svc.from('school_settings').delete().or('key.eq.modul.galeri,key.like.galeri.%')
}

test.describe.serial('Galeri', () => {
  let secret = ''
  test.setTimeout(120_000)
  test.beforeAll(async () => {
    await cleanup()
    await resetAdminMfa()
  })
  test.afterAll(cleanup)

  test('yönetici: modülü açar, albüm oluşturur, çoklu yükler, ışık kutusu, yayınlar', async ({ page }) => {
    secret = await loginAdmin(page)
    await expect(menu(page)).not.toContainText(['Galeri'])
    await page.goto('/yonetim?sekme=moduller')
    await page.getByRole('switch', { name: 'Galeri modülü' }).click()
    await expect(page.getByRole('switch', { name: 'Galeri modülü' })).toHaveAttribute('aria-checked', 'true')
    await page.goto('/')
    await page.getByRole('navigation', { name: 'Ana menü' }).getByRole('link', { name: 'Galeri' }).click()
    await expect(page.getByRole('heading', { name: 'Galeri', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Albüm oluştur' }).click()
    const dlg = page.getByRole('dialog', { name: 'Albüm oluştur' })
    await dlg.getByLabel('Başlık').fill(TITLE)
    await dlg.getByLabel('Kategori').selectOption({ label: 'Geziler' })
    await dlg.getByLabel('Kimler görsün').selectOption('sinif')
    await dlg.getByRole('group', { name: 'Sınıflar' }).getByRole('button', { name: '8/A' }).click()
    await axe(page, 'albüm formu')
    await dlg.getByRole('button', { name: 'Kaydet' }).click()
    await expect(page.getByRole('heading', { name: TITLE })).toBeVisible()
    albumUrl = page.url()
    await expect(page.getByText('Taslak', { exact: true })).toBeVisible()

    // Çoklu yükleme: sahte dosya reddedilir, diğerleri devam eder
    await page.getByLabel('Fotoğraf ya da video seç').setInputFiles([F('gezi-1.jpg'), F('gezi-2.jpg'), F('sahte.jpg'), F('renk.png'), F('kisa.webm'), F('kisa.mp4')])
    await expect(page.getByRole('alert')).toContainText('sahte.jpg: Dosya içeriği uzantısıyla uyuşmuyor.')
    await expect(page.getByText('5 dosya yüklendi')).toBeVisible()
    await expect(page.getByTestId('media')).toHaveCount(5)
    await expect(page.getByTestId('media').first().locator('img')).toBeVisible() // küçük önizleme (imzalı bağlantı)
    await axe(page, 'albüm (yönetici)')
    await shot(page, 'gal1-album-yonetici')

    // Işık kutusu: sayaç, sonraki, kapak, kapat
    await page.getByTestId('media').first().click()
    const lb = page.getByRole('dialog', { name: new RegExp(`${TITLE} · 1 / 5`) })
    await expect(lb).toBeVisible()
    await expect(lb.locator('img.glmedia')).toBeVisible()
    await lb.getByRole('button', { name: 'Kapak fotoğrafı yap' }).click()
    await expect(page.getByText('Kapak fotoğrafı seçildi')).toBeVisible()
    await page.keyboard.press('ArrowRight')
    await expect(page.getByRole('dialog', { name: new RegExp(`· 2 / 5`) })).toBeVisible()
    await expect(lb.getByRole('button', { name: 'İndir' })).toHaveCount(0) // indirme kapalı
    await axe(page, 'ışık kutusu')
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toHaveCount(0)

    // Yayınla + bildirim
    await page.getByRole('button', { name: 'Yayınla' }).click()
    await page.getByRole('dialog', { name: 'Albümü yayınla' }).getByRole('button', { name: 'Yayınla' }).click()
    await expect(page.getByText('Albüm yayınlandı')).toBeVisible()
    await expect(page.getByText('Yayında', { exact: true })).toBeVisible()
    await logout(page)
  })

  test('sınıf velisi görür (telefonda), başka sınıf velisi göremez', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await login(page, ...DEMO.veli) // Elif · 8/A
    await expectNotification(page, `Galeri: ${TITLE} albümü eklendi`)
    await page.goto('/galeri')
    await expect(page.getByTestId('album-card').filter({ hasText: TITLE })).toContainText('5 medya')
    await page.getByTestId('album-card').filter({ hasText: TITLE }).click()
    await expect(page.getByTestId('media')).toHaveCount(5)
    await expect(page.getByRole('button', { name: 'Albümü kalıcı sil' })).toHaveCount(0)
    await expect(page.getByLabel('Fotoğraf ya da video seç')).toHaveCount(0)
    await axe(page, 'albüm (veli)')
    await shot(page, 'gal2-album-veli-telefon', false)
    await page.getByTestId('media').nth(3).click() // video (webm)
    await expect(page.getByRole('dialog').locator('video')).toBeVisible()
    await page.keyboard.press('Escape')
    await logout(page)

    await page.setViewportSize({ width: 1280, height: 800 })
    await login(page, 'kerem.veli@ornek.com', 'Veli1234!') // Kerem · 8/B
    await expect(page.getByRole('navigation', { name: 'Ana menü' })).toBeVisible()
    await page.goto('/galeri')
    await expect(page.getByTestId('album-card').filter({ hasText: TITLE })).toHaveCount(0)
    await page.goto(albumUrl.replace(/^https?:\/\/[^/]+/, ''))
    await expect(page.getByText('Albüm bulunamadı ya da görme yetkin yok.')).toBeVisible()
    await logout(page)
  })

  test('arşiv/geri al; modül kapalıyken menüde yok; kalıcı silmede uyarı ve dosyalar da silinir', async ({ page }) => {
    await loginAdmin(page, secret)
    await page.goto(albumUrl.replace(/^https?:\/\/[^/]+/, ''))
    await page.getByRole('button', { name: 'Arşivle' }).click()
    await expect(page.getByText('Albüm arşivlendi')).toBeVisible()
    await page.goto('/galeri')
    await expect(page.getByTestId('album-card').filter({ hasText: TITLE })).toHaveCount(0)
    await page.getByRole('button', { name: 'Arşiv' }).click()
    await page.getByTestId('album-card').filter({ hasText: TITLE }).click()
    await page.getByRole('button', { name: 'Geri al' }).click()
    await expect(page.getByText('Albüm geri alındı')).toBeVisible()

    const { data: alb } = await svc.from('gallery_albums').select('id').eq('title', TITLE).single()
    const { data: files } = await svc.from('gallery_media').select('path').eq('album_id', alb!.id)
    expect(files).toHaveLength(5)
    await page.getByRole('button', { name: 'Albümü kalıcı sil' }).click()
    const dd = page.getByRole('dialog', { name: 'Albümü kalıcı sil' })
    await expect(dd).toContainText('Bu albümde 5 medya dosyası var.')
    await dd.getByRole('button', { name: 'Kalıcı sil' }).click()
    await expect(page.getByText('Albüm ve dosyaları silindi')).toBeVisible()
    const folder = files![0]!.path.split('/').slice(0, 3).join('/')
    expect((await svc.storage.from('galeri').list(folder)).data ?? []).toEqual([])

    await page.goto('/yonetim?sekme=moduller')
    await page.getByRole('switch', { name: 'Galeri modülü' }).click()
    await page.getByRole('dialog', { name: 'Galeri modülünü kapat' }).getByRole('button', { name: 'Modülü kapat' }).click()
    await expect(page.getByRole('switch', { name: 'Galeri modülü' })).toHaveAttribute('aria-checked', 'false')
    await logout(page)
    await login(page, ...DEMO.veli)
    await expect(page.getByRole('navigation', { name: 'Ana menü' })).toBeVisible()
    await expect(menu(page)).not.toContainText(['Galeri'])
    await page.goto('/galeri')
    await expect(page).toHaveURL(/\/panel$/)
  })
})
