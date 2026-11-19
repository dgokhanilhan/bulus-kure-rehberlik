// Okul geri bildirimleri (Kasım): deneme konularını gizle (0081), haftalık lig kürsüsü (0082), profil avatarı (0083),
// profesyonel Sudoku (kalem notu, geri al, kalan rakam). Sudoku "fen" hesabıyla oynanır: diğer oyun testleriyle karışmaz.
import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { DEMO, login, service, shot, surumErtele } from './helpers'

const svc = service()
const FEN = ['fen@buluskure.k12.tr', 'Fen12345!'] as const
const pazartesi = (gun: Date) => {
  const d = new Date(Date.UTC(gun.getUTCFullYear(), gun.getUTCMonth(), gun.getUTCDate()))
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7) - 7)
  return d.toISOString().slice(0, 10)
}
const GECEN = pazartesi(new Date(Date.now() + 3 * 3600_000))
const temizle = async () => {
  await svc.from('oda_lig_kursu').delete().eq('hafta', GECEN)
  await svc.from('profiles').update({ avatar: null }).not('avatar', 'is', null)
  await svc.from('exams').update({ topics_hidden: false }).eq('topics_hidden', true)
  const fen = (await svc.from('profiles').select('id').eq('email', FEN[0]).single()).data!.id
  await svc.from('oda_oyun').delete().eq('user_id', fen)
}
// Bu dosya Sudoku'yu ayrılma sınırı ve kurallar penceresi (0088) olmadan oynar
let surumGeri: () => Promise<void> = async () => {}
test.beforeAll(async () => {
  await temizle()
  surumGeri = await surumErtele(['sudoku_sekme'])
})
test.afterAll(async () => {
  await surumGeri()
  await temizle()
})
test.describe.configure({ mode: 'serial' })

test('denemeler: konuları gizle / göster; puanlar değişmez', async ({ page }) => {
  await login(page, ...DEMO.rehber)
  await expect(page.getByRole('navigation', { name: 'Ana menü' })).toBeVisible()
  await page.goto('/denemeler')
  await page.getByText('Yüklenen denemeler').click()
  const satir = page.getByTestId('exam-row').first()
  const ad = (await satir.locator('b').first().textContent())!.trim()
  await satir.getByRole('button', { name: `${ad} denemesinin konularını gizle` }).click()
  await expect(page.getByText(`${ad}: konular gizlendi; puan ve netler aynen duruyor`)).toBeVisible()
  await expect(satir.getByTestId('exam-konu-gizli')).toBeVisible()
  expect((await svc.from('exams').select('topics_hidden').eq('name', ad).limit(1).single()).data!.topics_hidden).toBe(true)
  await shot(page, 'deneme-konu-gizle')
  await satir.getByRole('button', { name: `${ad} denemesinin konularını göster` }).click()
  await expect(satir.getByTestId('exam-konu-gizli')).toHaveCount(0)
})

test('avatar: profil menüsünden seçilir, üst bilgide görünür', async ({ page }) => {
  await login(page, ...DEMO.rehber)
  await expect(page.getByRole('navigation', { name: 'Ana menü' })).toBeVisible()
  await page.getByRole('button', { name: /^Profil:/ }).click()
  await page.getByRole('button', { name: /^Avatar/ }).click()
  await page.getByRole('radio', { name: 'Tilki' }).click()
  await expect(page.getByRole('radio', { name: 'Tilki' })).toHaveAttribute('aria-checked', 'true')
  await expect.poll(async () => (await svc.from('profiles').select('avatar').eq('email', DEMO.rehber[0]).single()).data?.avatar).toBe('tilki')
  const axe = await new AxeBuilder({ page }).include('#avatar-panel').withTags(['wcag2a', 'wcag2aa']).analyze()
  expect(axe.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')).toEqual([])
  await shot(page, 'avatar-secici', false)
  await page.reload()
  await expect(page.getByRole('button', { name: /^Profil:/ })).toContainText('🦊')
})

test('pano: haftalık lig kürsüsü (1. ortada)', async ({ page }) => {
  const { data: p } = await svc.from('profiles').select('id, full_name, school_id, email').in('email', [DEMO.rehber[0], DEMO.matematik[0], FEN[0]])
  const by = (e: string) => p!.find((x) => x.email === e)!
  const ekle = await svc.from('oda_lig_kursu').insert([
    { school_id: by(DEMO.matematik[0]).school_id, hafta: GECEN, user_id: by(DEMO.matematik[0]).id, sira: 1, ad: by(DEMO.matematik[0]).full_name, puan: 28 },
    { school_id: by(DEMO.rehber[0]).school_id, hafta: GECEN, user_id: by(DEMO.rehber[0]).id, sira: 2, ad: by(DEMO.rehber[0]).full_name, puan: 20 },
    { school_id: by(FEN[0]).school_id, hafta: GECEN, user_id: by(FEN[0]).id, sira: 3, ad: by(FEN[0]).full_name, puan: 12 },
  ])
  expect(ekle.error).toBeNull()
  await login(page, ...DEMO.matematik)
  await expect(page.getByRole('navigation', { name: 'Ana menü' })).toBeVisible()
  await page.goto('/ogretmenler-odasi?sekme=pano')
  const kursu = page.getByTestId('lig-kursu')
  await expect(kursu).toBeVisible()
  const basamak = kursu.getByRole('listitem')
  await expect(basamak).toHaveCount(3)
  await expect(basamak.nth(1)).toHaveAccessibleName(`Haftanın birincisi: ${by(DEMO.matematik[0]).full_name}`)
  await expect(basamak.nth(0)).toHaveAccessibleName(`Haftanın ikincisi: ${by(DEMO.rehber[0]).full_name}`)
  await expect(basamak.nth(2)).toHaveAccessibleName(`Haftanın üçüncüsü: ${by(FEN[0]).full_name}`)
  // Birinci basamak en yüksek, üçüncü en alçak
  const h = await kursu.locator('.pn-kursu-blok').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height))
  expect(h[1]).toBeGreaterThan(h[0]!)
  expect(h[0]).toBeGreaterThan(h[2]!)
  const axe = await new AxeBuilder({ page }).include('main').withTags(['wcag2a', 'wcag2aa']).analyze()
  expect(axe.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')).toEqual([])
  await kursu.scrollIntoViewIfNeeded()
  await shot(page, 'lig-kursu', false)
})

test('sudoku: kalem notu, geri al, kalan rakam sayısı', async ({ page }) => {
  await login(page, ...FEN)
  await expect(page.getByRole('navigation', { name: 'Ana menü' })).toBeVisible()
  await page.goto('/ogretmenler-odasi?sekme=oyunlar')
  await page.getByRole('button', { name: /Günün Sudokusu/ }).click()
  const tahta = page.getByRole('grid', { name: 'Sudoku tahtası' })
  await expect(tahta).toBeVisible()
  const bos = tahta.getByRole('gridcell', { name: /: boş$/ }).first()
  const bosAd = (await bos.getAttribute('aria-label'))!
  await bos.click()
  // Kalem notu: 3 ve 5 not edilir
  await page.getByRole('button', { name: /Not kapalı/ }).click()
  await expect(page.getByRole('button', { name: /Not açık/ })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: /^3 notu/ }).click()
  await page.getByRole('button', { name: /^5 notu/ }).click()
  const hucre = tahta.getByRole('gridcell', { name: `${bosAd}, notlar 3 5` })
  await expect(hucre).toBeVisible()
  // Rakam: 7 yazılır (notlar silinir); kalan sayı bir azalır; geri al eski hale döndürür
  await page.keyboard.press('n')
  await expect(page.getByRole('button', { name: /Not kapalı/ })).toBeVisible()
  const yedi = page.getByRole('button', { name: /^7, / })
  const once = (await yedi.getAttribute('aria-label'))!
  const kalan = Number(once.match(/(\d+) tane kaldı/)?.[1] ?? 0)
  await yedi.click()
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  await expect(tahta.getByRole('gridcell', { name: new RegExp(`^${esc(bosAd.replace(/boş$/, '7'))}`) })).toBeVisible()
  await expect(page.getByRole('button', { name: /^7, / })).toHaveAttribute('aria-label', kalan > 1 ? `7, ${kalan - 1} tane kaldı` : '7, hepsi yerleşti')
  await page.getByRole('button', { name: /Geri al/ }).click()
  await expect(tahta.getByRole('gridcell', { name: `${bosAd}, notlar 3 5` })).toBeVisible()

  // İpucu (0084): seçili boş hücreye doğru rakam gelir; hak 3 → 2; sayaç cezasız akar
  const dogru = ((await svc.rpc('oda_sudoku_uret', { g: (await svc.rpc('tr_today')).data })).data as { cozum: number[] }).cozum
  const no = Number(
    bosAd
      .match(/Satır (\d+), sütun (\d+)/)!
      .slice(1)
      .reduce((s, x, k) => s + (Number(x) - 1) * (k === 0 ? 9 : 1), 0),
  )
  await tahta.getByRole('gridcell', { name: `${bosAd}, notlar 3 5` }).click()
  await page.getByRole('button', { name: /İpucu al, 3 hakkın var/ }).click()
  await expect(tahta.getByRole('gridcell', { name: new RegExp(`^${esc(bosAd.replace(/boş$/, String(dogru[no])))} \\(alınan ipucu\\)`) })).toBeVisible()
  await expect(page.getByRole('button', { name: /İpucu al, 2 hakkın var/ })).toBeVisible()
  await expect(page.getByText(/Bitişte \+30 sn eklenecek · 2 hakkın kaldı/)).toBeVisible()
  const axe = await new AxeBuilder({ page }).include('main').withTags(['wcag2a', 'wcag2aa']).analyze()
  expect(axe.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')).toEqual([])
  await shot(page, 'sudoku-pro')
})
