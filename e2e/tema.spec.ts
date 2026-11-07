import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { createClient } from '@supabase/supabase-js'
import { DEMO, login, logout, service, shot } from './helpers'

// Görünüm teması: profil menüsünden seçilir, anında uygulanır, profile kaydedilir; başka kişiyi etkilemez.
// Giriş animasyonu ortasında renkler yarı saydam ölçülmesin
test.use({ reducedMotion: 'reduce' })

const TEMALAR = [
  ['gece', 'Gece Mavisi'], ['defter', 'Okul Defteri'], ['gunbatimi', 'Gün Batımı'], ['lavanta', 'Lavanta'],
  ['grafit', 'Grafit'], ['neon', 'Neon'], ['akademi', 'Akademi'],
  ['ag', 'Ağ Kahramanı'], ['zaman', 'Zaman Yolcusu'], ['uzay', 'Uzay Üssü'], ['piksel', 'Piksel Oyun'],
  ['sakura', 'Sakura'], ['kutup', 'Kutup Işığı'], ['noir', 'Dedektif'],
] as const
const KONSEPT = ['ag', 'zaman', 'uzay', 'piksel', 'sakura', 'kutup', 'noir']

async function temaSec(page: Page, ad: string) {
  await page.getByRole('button', { name: /^Profil:/ }).click()
  await page.getByRole('radio', { name: ad, exact: true }).click()
  await page.keyboard.press('Escape')
}

async function kontrast(page: Page, etiket: string) {
  const r = await new AxeBuilder({ page }).withRules(['color-contrast']).analyze()
  const bad = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
  expect.soft(bad.map((v) => `${etiket}: ${v.id} (${v.nodes.length}) ${v.nodes[0]?.target}`)).toEqual([])
}

test.afterAll(async () => {
  const svc = service()
  await svc.from('profiles').update({ tema: null }).in('email', [DEMO.ogrenci[0], DEMO.rehber[0]])
})

test('tema seçimi: varsayılan Buluş Küre, seçim kaydedilir, yenilemede ve yeni girişte kalır', async ({ page }) => {
  await login(page, ...DEMO.ogrenci)
  await expect(page.getByRole('button', { name: /^Profil:/ })).toBeVisible()
  await expect(page.locator('html')).not.toHaveAttribute('data-skin')
  await temaSec(page, 'Gece Mavisi')
  await expect(page.locator('html')).toHaveAttribute('data-skin', 'gece')
  // Temanın yazı tipi uygulamanın kendi sunucusundan yüklenir (CSP font-src 'self')
  await expect.poll(() => page.evaluate(() => [...document.fonts].some((f) => f.family.replace(/["']/g, '') === 'Playfair Display' && f.status === 'loaded'))).toBe(true)
  await expect.poll(async () => (await service().from('profiles').select('tema').eq('email', DEMO.ogrenci[0]).single()).data?.tema).toBe('gece')
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-skin', 'gece')
  // Başka kişi bu cihazda girince kendi teması (varsayılan) gelir
  await logout(page)
  await login(page, ...DEMO.rehber)
  await expect(page.getByRole('button', { name: /^Profil:/ })).toBeVisible()
  await expect(page.locator('html')).not.toHaveAttribute('data-skin')
  await logout(page)
  await login(page, ...DEMO.ogrenci)
  await expect(page.getByRole('button', { name: /^Profil:/ })).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('data-skin', 'gece')
  // Buluş Küre'ye dönünce öznitelik kalkar ve profil boşalır
  await temaSec(page, 'Buluş Küre')
  await expect(page.locator('html')).not.toHaveAttribute('data-skin')
  await expect.poll(async () => (await service().from('profiles').select('tema').eq('email', DEMO.ogrenci[0]).single()).data?.tema ?? null).toBeNull()
})

test('her temada öğrenci ekranları okunur (kontrast) ve hata yok', async ({ page }) => {
  test.setTimeout(300_000) // 14 tema × birkaç ekran
  const hatalar: string[] = []
  page.on('pageerror', (e) => hatalar.push(e.message))
  await login(page, ...DEMO.ogrenci)
  await expect(page.getByRole('button', { name: /^Profil:/ })).toBeVisible()
  for (const [id, ad] of TEMALAR) {
    await temaSec(page, ad)
    await expect(page.locator('html')).toHaveAttribute('data-skin', id)
    await page.goto('/')
    await expect(page.getByRole('button', { name: /^Profil:/ })).toBeVisible()
    await page.waitForTimeout(400)
    await shot(page, `tema-${id}-ana`, false)
    await kontrast(page, `${id} ana`)
    for (const yol of ['/ozet', '/gorevler', '/takvim', '/raporlar']) {
      await page.goto(yol)
      await expect(page.getByRole('button', { name: /^Profil:/ })).toBeVisible()
      await page.waitForTimeout(500)
      await kontrast(page, `${id} ${yol}`)
    }
    await page.goto('/')
  }
  expect(hatalar).toEqual([])
})

test('her temada rehber öğretmen ekranları okunur (tablolar, sınıf analizi)', async ({ page }) => {
  test.setTimeout(300_000) // 14 tema × birkaç ekran
  const hatalar: string[] = []
  page.on('pageerror', (e) => hatalar.push(e.message))
  await login(page, ...DEMO.rehber)
  await expect(page.getByRole('button', { name: /^Profil:/ })).toBeVisible()
  for (const [id, ad] of TEMALAR) {
    await temaSec(page, ad)
    for (const yol of ['/ogrenciler', '/denemeler', '/siniflar']) {
      await page.goto(yol)
      await expect(page.getByRole('button', { name: /^Profil:/ })).toBeVisible()
      await page.waitForTimeout(500)
      await kontrast(page, `${id} ${yol}`)
    }
    await shot(page, `tema-${id}-siniflar`, false)
    await page.goto('/')
  }
  await temaSec(page, 'Buluş Küre')
  expect(hatalar).toEqual([])
})

test('konsept temalarda giriş ekranı süsü görünür ve form okunur; cihazdaki son tema girişte uygulanır', async ({ page }) => {
  for (const id of KONSEPT) {
    await page.goto('/')
    await page.evaluate((t) => localStorage.setItem('bk-tema', t), id)
    await page.reload()
    await expect(page.locator('html')).toHaveAttribute('data-skin', id)
    // Kutup Işığı'nda süs yok, yalnız renkli zemin
    if (id !== 'kutup') await expect(page.locator('.login-art .tema-sus')).toBeVisible()
    await page.waitForTimeout(300)
    await shot(page, `tema-${id}-giris`, false)
    await kontrast(page, `${id} giriş`)
  }
  await page.evaluate(() => localStorage.removeItem('bk-tema'))
})

test('tema yalnız geçerli biçimde ve yalnız kendi profiline kaydedilir', async () => {
  await service().from('profiles').update({ tema: null }).in('email', [DEMO.ogrenci[0], DEMO.rehber[0]])
  const c = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!, { auth: { persistSession: false } })
  await c.auth.signInWithPassword({ email: DEMO.ogrenci[0], password: DEMO.ogrenci[1] })
  const kotu = await c.rpc('tema_kaydet', { p_tema: "x'; drop table profiles;--" })
  expect(kotu.error?.message).toMatch(/Geçersiz tema/)
  expect((await c.rpc('tema_kaydet', { p_tema: 'neon' })).error).toBeNull()
  const svc = service()
  const { data } = await svc.from('profiles').select('email, tema').in('email', [DEMO.ogrenci[0], DEMO.rehber[0]])
  expect(Object.fromEntries((data ?? []).map((r) => [r.email, r.tema]))).toEqual({ [DEMO.ogrenci[0]]: 'neon', [DEMO.rehber[0]]: null })
  // Oturumsuz çağrı reddedilir
  const anon = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!, { auth: { persistSession: false } })
  expect((await anon.rpc('tema_kaydet', { p_tema: 'gece' })).error).not.toBeNull()
  await c.rpc('tema_kaydet', { p_tema: null })
})
