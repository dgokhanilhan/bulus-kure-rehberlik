// Yayın sonrası "sonsuz açılış ekranı": ana JS paketi yerine index.html dönerse açılış bekçisi (public/boot-check.js)
// dosyayı taze indirip bir kez yeniler; hep bozuksa anlaşılır mesaj gösterir. Üretim derlemesinde önbellek başlıkları da denetlenir.
import { test, expect } from '@playwright/test'

const ENTRY = /\/(assets\/index-[\w-]+\.js|src\/main\.tsx)(\?.*)?$/
const DIST = process.env.E2E_DIST === '1'
const FAKE = '<!doctype html><html><body>index.html</body></html>'

test.describe('Açılış bekçisi', () => {
  test('ana paket bir kez HTML dönerse sayfa kendini toparlar', async ({ page }) => {
    let n = 0
    await page.route(ENTRY, (route) => (n++ === 0 ? route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: FAKE }) : route.continue()))
    const logs: string[] = []
    page.on('console', (m) => m.type() === 'error' && logs.push(m.text()))
    await page.goto('/')
    await expect(page.getByRole('button', { name: 'Giriş yap' }).last()).toBeVisible({ timeout: 20_000 })
    expect(n).toBeGreaterThanOrEqual(2)
    expect(logs.some((l) => l.includes('[açılış]'))).toBe(true)
  })

  test('paket hep bozuksa döngüye girmez, mesaj gösterir', async ({ page }) => {
    let n = 0
    await page.route(ENTRY, (route) => {
      n++
      return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: FAKE })
    })
    await page.goto('/')
    await expect(page.getByRole('button', { name: 'Yeniden dene' })).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText('Site güncelleniyor ya da yüklenemedi')).toBeVisible()
    const before = n
    await page.waitForTimeout(1500)
    expect(n).toBe(before) // tek yenileme: ilk yükleme + taze indirme + yeniden yükleme + taze indirme
    expect(n).toBeLessThanOrEqual(4)
  })

  test('önbellek başlıkları: HTML önbelleğe alınmaz, asset doğrulanır, güvenlik başlıkları yerinde', async ({ page, request }) => {
    test.skip(!DIST, 'Yalnız üretim derlemesinde (npm run e2e:dist)')
    const root = await request.get('/')
    expect(root.headers()['cache-control']).toMatch(/no-store/)
    expect(root.headers()['content-security-policy']).toContain("default-src 'self'")
    expect(root.headers()['x-content-type-options']).toBe('nosniff')
    await page.goto('/')
    const src = await page.locator('script[type="module"]').first().getAttribute('src')
    const js = await request.get(src!)
    expect(js.headers()['content-type']).toMatch(/javascript/)
    expect(js.headers()['cache-control']).toBe('public, max-age=0, must-revalidate')
    expect((await request.get('/boot-check.js')).headers()['content-type']).toMatch(/javascript/)
  })
})
