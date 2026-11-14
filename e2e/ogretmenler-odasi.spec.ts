// Öğretmenler Odası (0068): kademeye göre ad, Öğrenci Takip, öğretmenler arası canlı sohbet (anma bildirimi, tepki, silme),
// 30 günlük saklama ve yetki sınırı (veli/öğrenci hiçbir şey göremez ve yazamaz; kanal dışına yazılamaz).
import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { createClient } from '@supabase/supabase-js'
import { DEMO, login, menu, service, shot } from './helpers'

const IZ = 'e2e-oda'
const temizle = async () => {
  const svc = service()
  await svc.from('oda_mesaj').delete().like('metin', `%${IZ}%`)
  await svc.from('notifications').delete().eq('type', 'oda').like('text', `%${IZ}%`)
}
test.beforeAll(temizle)
test.afterAll(temizle)
test.describe.configure({ mode: 'serial' })

const oturum = async (kim: readonly [string, string]) => {
  const c = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!, { auth: { persistSession: false } })
  const { error } = await c.auth.signInWithPassword({ email: kim[0], password: kim[1] })
  expect(error).toBeNull()
  return c
}
const odaAc = async (page: Page) => {
  await menu(page).filter({ hasText: 'Öğretmenler Odası' }).click()
  await expect(page.getByRole('heading', { level: 1, name: /Öğretmenler Odası$/ })).toBeVisible()
}

test('yetki: veli ve öğrenci okuyamaz/yazamaz; öğretmen yalnız kendi kanallarına yazar; 30 gün temizliği', async () => {
  const svc = service()
  const veli = await oturum(DEMO.veli)
  const ogr = await oturum(DEMO.ogrenci)
  const mat = await oturum(DEMO.matematik)
  const reh = await oturum(DEMO.rehber)

  // Veli ve öğrencinin kanalı yok; yazamaz, okuyamaz
  for (const c of [veli, ogr]) {
    expect((await c.rpc('oda_kanallari')).data).toEqual([])
    expect((await c.from('oda_mesaj').insert({ kanal: 'genel', metin: `${IZ} sızma` })).error).not.toBeNull()
  }
  const kM = (await mat.rpc('oda_kanallari')).data as string[]
  expect(kM).toContain('genel')
  expect(kM).toContain('zumre:Matematik')
  expect(kM).not.toContain('zumre:Türkçe')
  // Başka zümreye yazamaz; yazan ve okul sunucuda damgalanır
  expect((await mat.from('oda_mesaj').insert({ kanal: 'zumre:Türkçe', metin: `${IZ} başka zümre` })).error).not.toBeNull()
  const { data: m, error } = await mat
    .from('oda_mesaj')
    .insert({ kanal: 'genel', metin: `  ${IZ} merhaba  ` })
    .select('id, yazan, metin')
    .single()
  expect(error).toBeNull()
  const { data: matP } = await svc.from('profiles').select('id').eq('email', DEMO.matematik[0]).single()
  expect(m).toMatchObject({ yazan: matP!.id, metin: `${IZ} merhaba` })
  // Rehberlik görür; veli/öğrenci görmez; mesaj düzeltilemez
  expect((await reh.from('oda_mesaj').select('id').eq('id', m!.id)).data).toHaveLength(1)
  for (const c of [veli, ogr]) expect((await c.from('oda_mesaj').select('id').eq('id', m!.id)).data).toEqual([])
  await mat.from('oda_mesaj').update({ metin: 'değişti' }).eq('id', m!.id)
  expect((await svc.from('oda_mesaj').select('metin').eq('id', m!.id).single()).data!.metin).toBe(`${IZ} merhaba`)
  // Veli devamsızlık özetini alamaz
  const { data: el } = await svc.from('students').select('id').limit(1).single()
  expect((await veli.rpc('oda_devamsizlik', { p_ogrenciler: [el!.id] })).data ?? []).toEqual([])

  // 30 günü geçen mesaj gece temizliğinde silinir, yenisi kalır
  const { data: eski } = await mat
    .from('oda_mesaj')
    .insert({ kanal: 'genel', metin: `${IZ} eski` })
    .select('id')
    .single()
  await svc
    .from('oda_mesaj')
    .update({ created_at: new Date(Date.now() - 31 * 86400_000).toISOString() })
    .eq('id', eski!.id)
  await svc.rpc('oda_temizlik')
  expect((await svc.from('oda_mesaj').select('id').eq('id', eski!.id)).data).toEqual([])
  expect((await svc.from('oda_mesaj').select('id').eq('id', m!.id)).data).toHaveLength(1)
})

test('veli menüde görmez, adrese gidince açılmaz', async ({ page }) => {
  await login(page, ...DEMO.veli)
  await expect(page.getByRole('navigation', { name: 'Ana menü' })).toBeVisible()
  await expect(menu(page).filter({ hasText: 'Öğretmenler Odası' })).toHaveCount(0)
  await page.goto('/ogretmenler-odasi')
  await expect(page.getByRole('heading', { level: 1, name: /Öğretmenler Odası/ })).toHaveCount(0)
})

test('rehber: Oda, Öğrenci Takip ve Sohbet; matematik öğretmeni anılınca bildirim alır', async ({ page, browser }) => {
  const svc = service()
  const { data: matP } = await svc.from('profiles').select('full_name').eq('email', DEMO.matematik[0]).single()
  await login(page, ...DEMO.rehber)
  await odaAc(page)
  await expect(page.getByRole('heading', { name: 'Bugün okulda' })).toBeVisible()
  await shot(page, 'oda-giris')

  // Öğrenci Takip: sınıf seç, tablo, ayrıntı
  await page.getByRole('tab', { name: 'Öğrenci Takip' }).click()
  // Ekranda yalnız seçili sınıflar durur; "Sınıf ekle" listeyi açar
  const secili = page.getByRole('group', { name: 'Seçili sınıflar' })
  await expect(secili.getByRole('button', { name: 'Sınıf ekle' })).toHaveAttribute('aria-expanded', 'false')
  await expect(page.getByRole('group', { name: 'Sınıf seçimi' })).toHaveCount(0)
  await secili.getByRole('button', { name: 'Sınıf ekle' }).click()
  const sinif8A = page.getByRole('group', { name: 'Sınıf seçimi' }).getByRole('button', { name: '8/A' })
  if ((await sinif8A.getAttribute('aria-pressed')) !== 'true') await sinif8A.click()
  await expect(secili.getByRole('button', { name: '8/A: seçimden çıkar' })).toBeVisible()
  await shot(page, 'oda-sinif-secici')
  await secili.getByRole('button', { name: 'Listeyi kapat' }).click()
  await expect(page.getByRole('group', { name: 'Sınıf seçimi' })).toHaveCount(0)
  const satir = page.locator('.oda-tbl tbody tr.click').first()
  await expect(satir).toBeVisible()
  await expect(page.locator('.oda-tbl thead')).toContainText('Notlar')
  await expect(page.locator('.oda-tbl thead')).not.toContainText('Görev')
  await satir.getByRole('button', { name: /ayrıntı$/ }).click()
  await expect(satir.getByRole('button', { name: /ayrıntı$/ })).toHaveAttribute('aria-expanded', 'true')
  await expect(page.getByRole('heading', { name: 'Son ödevler' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Not ekle' })).toBeVisible()
  const axe = await new AxeBuilder({ page }).include('main').withTags(['wcag2a', 'wcag2aa']).analyze()
  expect(axe.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')).toEqual([])
  await shot(page, 'oda-takip')

  // Sohbet: @ ile anma, gönder, tepki
  await page.getByRole('tab', { name: 'Sohbet' }).click()
  await expect(page.getByRole('tab', { name: /Genel/ })).toHaveAttribute('aria-selected', 'true')
  const kutu = page.getByRole('textbox', { name: /kanalına mesaj/ })
  await kutu.fill(`${IZ} toplantı 15.00'te @${matP!.full_name.slice(0, 3)}`)
  await page
    .getByRole('listbox', { name: 'Öğretmen an' })
    .getByRole('button', { name: new RegExp(matP!.full_name) })
    .click()
  await kutu.press('End')
  await kutu.type('lütfen notları getir')
  await kutu.press('Enter')
  const mesaj = page.locator('.oda-mesaj', { hasText: `${IZ} toplantı` })
  await expect(mesaj).toBeVisible()
  await expect(mesaj.locator('.oda-anma')).toHaveText(`@${matP!.full_name}`)
  await expect(kutu).toHaveValue('')
  await mesaj.hover()
  await mesaj.getByRole('button', { name: 'Tepki ekle' }).click()
  await mesaj.getByRole('button', { name: '👍 tepkisi' }).click()
  await expect(mesaj.getByRole('button', { name: '👍 1' })).toHaveAttribute('aria-pressed', 'true')
  await shot(page, 'oda-sohbet')

  // Matematik öğretmeni: menüde okunmamış rozeti, anma bildirimi, mesaj canlı görünür
  const ctx = await browser.newContext({ baseURL: test.info().project.use.baseURL, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' })
  const p2 = await ctx.newPage()
  await login(p2, ...DEMO.matematik)
  await expect(menu(p2).filter({ hasText: 'Öğretmenler Odası' }).locator('.badge')).toBeVisible()
  const { data: bild } = await svc.from('notifications').select('text, link').eq('type', 'oda').like('text', `%${IZ}%`)
  expect(bild).toHaveLength(1)
  expect(bild![0]!.link).toMatchObject({ page: 'ogretmenler-odasi', tab: 'sohbet', kanal: 'genel' })
  await odaAc(p2)
  await expect(p2.getByRole('heading', { level: 1 })).toHaveText(/^(Ortaokul|Lise|İlkokul)(\/(Ortaokul|Lise))* Öğretmenler Odası$/)
  await p2.getByRole('tab', { name: /Sohbet/ }).click()
  await expect(p2.locator('.oda-mesaj', { hasText: `${IZ} toplantı` })).toHaveClass(/anildi/)
  // Canlı: rehberin yeni mesajı sayfa yenilenmeden gelir
  await kutu.fill(`${IZ} canlı deneme`)
  await kutu.press('Enter')
  await expect(p2.locator('.oda-mesaj', { hasText: `${IZ} canlı deneme` })).toBeVisible({ timeout: 35_000 })
  // Başkasının mesajında silme düğmesi yok
  await expect(p2.locator('.oda-mesaj', { hasText: `${IZ} canlı deneme` }).getByRole('button', { name: 'Mesajı sil' })).toHaveCount(0)
  await ctx.close()

  // Rehber kendi mesajını siler
  const canli = page.locator('.oda-mesaj', { hasText: `${IZ} canlı deneme` })
  await canli.hover()
  await canli.getByRole('button', { name: 'Mesajı sil' }).click()
  await page.getByRole('button', { name: 'Sil', exact: true }).click()
  await expect(canli).toHaveCount(0)
})

test('telefonda: sohbet kanalları üstte, yazı kutusu ekranda', async ({ browser }) => {
  const ctx = await browser.newContext({
    baseURL: test.info().project.use.baseURL,
    viewport: { width: 390, height: 844 },
    locale: 'tr-TR',
    timezoneId: 'Europe/Istanbul',
    hasTouch: true,
  })
  const page = await ctx.newPage()
  await login(page, ...DEMO.matematik)
  await expect(page.getByRole('navigation', { name: 'Ana menü' })).toBeVisible()
  await page.goto('/ogretmenler-odasi?sekme=sohbet')
  const kutu = page.getByRole('textbox', { name: /kanalına mesaj/ })
  await expect(kutu).toBeInViewport()
  // Yazı kutusu alttaki menünün üstünde kalır
  const kutuAlt = await kutu.evaluate((el) => el.getBoundingClientRect().bottom)
  const menuUst = await page
    .getByRole('navigation', { name: 'Ana menü' })
    .locator('.nav')
    .evaluate((el) => el.getBoundingClientRect().top)
  expect(kutuAlt).toBeLessThanOrEqual(menuUst)
  const w = await page.evaluate(() => document.documentElement.scrollWidth)
  expect(w).toBeLessThanOrEqual(390)
  await shot(page, 'oda-sohbet-mobil', false)
  await page.goto('/ogretmenler-odasi?sekme=takip')
  await expect(page.getByRole('group', { name: 'Seçili sınıflar' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  await shot(page, 'oda-takip-mobil', false)
  await ctx.close()
})
