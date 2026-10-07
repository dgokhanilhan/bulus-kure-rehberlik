// Mobil (Capacitor) paketi: telefon boyutunda açılır, giriş çalışır, PDF okuma (MuPDF, AGPL) pakette yoktur.
// Yalnız `npm run e2e:mobil` ile çalışır (dist-mobil sunulur; normal e2e'de atlanır).
import { test, expect } from '@playwright/test'
import { DEMO, login } from './helpers'

test.skip(process.env.E2E_MOBIL !== '1', 'Yalnız mobil paket testinde (npm run e2e:mobil)')

test('mobil paket: CSP meta, güvenli alan, açılış bekçisi yok', async ({ page }) => {
  const errors: string[] = []
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Giriş yap' }).last()).toBeVisible()
  await expect(page.locator('meta[http-equiv="Content-Security-Policy"]')).toHaveAttribute('content', /default-src 'self'/)
  await expect(page.locator('meta[name="viewport"]')).toHaveAttribute('content', /viewport-fit=cover/)
  expect(await page.locator('script[src="/boot-check.js"]').count()).toBe(0)
  expect(errors.filter((e) => /Content Security Policy/i.test(e))).toEqual([])
})

test('MuPDF ve PDF motoru pakette yok', async ({ request }) => {
  for (const p of ['/engine/mupdf/mupdf.js', '/engine/genel.mjs', '/engine/app-worker.mjs']) {
    const r = await request.get(p)
    // SPA geri dönüşü: dosya yoksa index.html gelir, JS gelmez
    expect(r.headers()['content-type'], p).toContain('text/html')
  }
})

test('giriş çalışır; deneme yüklemede PDF yerine bilgisayar notu, Excel ve elle giriş kalır', async ({ page }) => {
  await login(page, ...DEMO.rehber)
  await expect(page.getByRole('button', { name: /^Profil:/ })).toBeVisible()
  await page.goto('/denemeler')
  await expect(page.getByTestId('mobil-pdf-yok')).toBeVisible()
  await expect(page.locator('#upFile')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Excel / CSV ile yükle' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Elle gir' })).toBeVisible()
  // Sayfa yenilenince oturum korunur (mobilde güvenli depo; web önizlemede eklentinin tarayıcı yedeği)
  await page.reload()
  await expect(page.getByRole('button', { name: /^Profil:/ })).toBeVisible()
})
