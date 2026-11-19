// 0088: Sudoku kurallar penceresi (bir kez, oyun açılmadan; süre "Tamam"dan sonra başlar), ayrılma sayacı ve 6. ayrılışta sona erme.
import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { DEMO, login, service, shot } from './helpers'

const svc = service()
const bugun = () => new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10)
let ilk = ''
let matId = ''
let tercih: { sudoku_kural: string | null } | null = null
const temizle = () => svc.from('oda_oyun').delete().eq('user_id', matId).eq('oyun', 'sudoku').eq('gun', bugun())
const kayit = async () =>
  (await svc.from('oda_oyun').select('bitti, lig_disi, durum').eq('user_id', matId).eq('oyun', 'sudoku').eq('gun', bugun()).maybeSingle()).data
// Sayfadan ayrılıp dönmeyi taklit eder (sekme değiştirme / ekran kilidi)
const ayril = (page: Page) =>
  page.evaluate(() => {
    const ayarla = (v: string) => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => v })
      document.dispatchEvent(new Event('visibilitychange'))
    }
    ayarla('hidden')
    ayarla('visible')
  })

test.beforeAll(async () => {
  matId = (await svc.from('profiles').select('id').eq('email', DEMO.matematik[0]).single()).data!.id
  ilk = (await svc.from('oda_icerik_surum').select('baslangic').eq('ad', 'sudoku_sekme').single()).data!.baslangic
  tercih = (await svc.from('oda_oyun_tercih').select('sudoku_kural').eq('user_id', matId).maybeSingle()).data
  await svc.from('oda_icerik_surum').update({ baslangic: bugun() }).eq('ad', 'sudoku_sekme')
  await svc.from('oda_oyun_tercih').upsert({ user_id: matId, sudoku_kural: null })
  await svc.from('school_settings').delete().like('key', 'oda.oyun.%')
  await temizle()
})
test.afterAll(async () => {
  await svc.from('oda_icerik_surum').update({ baslangic: ilk }).eq('ad', 'sudoku_sekme')
  if (tercih) await svc.from('oda_oyun_tercih').update({ sudoku_kural: tercih.sudoku_kural }).eq('user_id', matId)
  else await svc.from('oda_oyun_tercih').delete().eq('user_id', matId)
  await temizle()
})

test('Sudoku: kurallar bir kez çıkar, süre Tamam ile başlar; sayaç işler; 6. ayrılışta oyun sona erer', async ({ page }) => {
  await login(page, ...DEMO.matematik)
  await expect(page.getByRole('navigation', { name: 'Ana menü' })).toBeVisible()
  await page.goto('/ogretmenler-odasi?sekme=oyunlar&oyun=sudoku')

  // Pencere oyun açılmadan çıkar: tahta yok, kayıt (süre) yok
  const pencere = page.getByRole('dialog', { name: '🧩 Sudoku kuralları' })
  await expect(pencere).toBeVisible()
  await expect(pencere.getByText(/Sayfadan en fazla 5 kez ayrılabilirsin/)).toBeVisible()
  await expect(pencere.getByText(/4 dakikadan kısa çözümler/)).toBeVisible()
  await expect(page.getByRole('grid', { name: 'Sudoku tahtası' })).toHaveCount(0)
  expect(await kayit()).toBeNull()
  // Açılış animasyonu bitmeden taranırsa geçiş renkleri yanlış kontrast verir
  await page.waitForFunction(() => (document.querySelector('.mwrap')?.getAnimations({ subtree: true }) ?? []).every((a) => a.playState !== 'running'))
  const axe = await new AxeBuilder({ page }).include('.modal').withTags(['wcag2a', 'wcag2aa']).analyze()
  expect(axe.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')).toEqual([])
  await shot(page, 'sudoku-kurallar', false)

  await pencere.getByRole('button', { name: 'Tamam' }).click()
  await expect(pencere).toHaveCount(0)
  await expect(page.getByRole('grid', { name: 'Sudoku tahtası' })).toBeVisible()
  await expect(page.getByTestId('sd-ayrilma')).toHaveText('↗ Ayrılma 0/5')
  expect(await kayit()).not.toBeNull()
  expect((await svc.from('oda_oyun_tercih').select('sudoku_kural').eq('user_id', matId).single()).data!.sudoku_kural).toBeTruthy()
  // Alttaki kurallar her zaman var; uyarı metni yok
  await expect(page.getByRole('region', { name: 'Sudoku kuralları' })).toBeVisible()
  await expect(page.getByTestId('sd-lig-disi')).toHaveCount(0)

  await ayril(page)
  await ayril(page)
  await expect(page.getByTestId('sd-ayrilma')).toHaveText('↗ Ayrılma 2/5')
  await expect.poll(async () => ((await kayit())!.durum as { sekme_say?: number }).sekme_say).toBe(2)
  await shot(page, 'sudoku-sayac')

  // Yenileyince pencere bir daha çıkmaz, sayaç korunur
  await page.reload()
  await expect(page.getByRole('grid', { name: 'Sudoku tahtası' })).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByTestId('sd-ayrilma')).toHaveText('↗ Ayrılma 2/5')

  for (let i = 0; i < 4; i++) await ayril(page)
  await expect(page.getByTestId('sd-lig-disi')).toContainText('Bugünkü Sudoku sona erdi')
  await expect(page.getByTestId('sd-ayrilma')).toContainText('Sona erdi')
  await expect(page.getByRole('group', { name: 'Araçlar' })).toHaveCount(0)
  await expect(page.getByTestId('sd-sure')).toHaveCount(0)
  const k = (await kayit())!
  expect(k).toMatchObject({ bitti: null, lig_disi: true })
  expect((k.durum as { neden: string }).neden).toBe('sekme')
  await shot(page, 'sudoku-sona-erdi')

  // Yenileyince de sona ermiş kalır
  await page.reload()
  await expect(page.getByTestId('sd-lig-disi')).toContainText('Bugünkü Sudoku sona erdi')
})
