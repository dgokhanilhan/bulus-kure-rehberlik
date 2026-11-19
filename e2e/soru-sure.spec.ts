// 0087: 5 Soruda Bugün 1 dakika. Süre "Başla"ya basınca başlar; dolunca seçenekler kapanır, o ana kadarki doğrular kaydedilir.
import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { DEMO, login, service, shot } from './helpers'

const svc = service()
const bugun = () => new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10)
let ilk = ''
let matId = ''
const temizle = () => svc.from('oda_oyun').delete().eq('user_id', matId).eq('oyun', 'soru')

test.beforeAll(async () => {
  matId = (await svc.from('profiles').select('id').eq('email', DEMO.matematik[0]).single()).data!.id
  ilk = (await svc.from('oda_icerik_surum').select('baslangic').eq('ad', 'soru_sure').single()).data!.baslangic
  await svc.from('oda_icerik_surum').update({ baslangic: bugun() }).eq('ad', 'soru_sure')
  await svc.from('school_settings').delete().like('key', 'oda.oyun.%')
  await temizle()
})
test.afterAll(async () => {
  await svc.from('oda_icerik_surum').update({ baslangic: ilk }).eq('ad', 'soru_sure')
  await temizle()
})

test('5 Soruda Bugün: Başla ile süre işler; süre dolunca cevap verilemez, doğrular kaydedilir', async ({ page }) => {
  const ids = (await svc.rpc('oda_soru_gunun', { g: bugun() })).data as number[]
  const ilkSoru = (await svc.from('oda_soru').select('soru, dogru').eq('id', ids[0]!).single()).data as { soru: string; dogru: number }
  await login(page, ...DEMO.matematik)
  await expect(page.getByRole('navigation', { name: 'Ana menü' })).toBeVisible()
  await page.goto('/ogretmenler-odasi?sekme=oyunlar&oyun=soru')

  // Başlamadan önce soru görünmez ve kayıt açılmaz
  await expect(page.getByRole('button', { name: 'Başla' })).toBeVisible()
  await expect(page.getByText(/Süre “Başla”ya bastığında başlar/)).toBeVisible()
  expect((await svc.from('oda_oyun').select('id').eq('user_id', matId).eq('oyun', 'soru')).data).toHaveLength(0)
  const axe = await new AxeBuilder({ page }).include('.oy-soru').withTags(['wcag2a', 'wcag2aa']).analyze()
  expect(axe.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')).toEqual([])

  await page.getByRole('button', { name: 'Başla' }).click()
  await expect(page.getByRole('heading', { name: ilkSoru.soru })).toBeVisible()
  await expect(page.getByRole('timer')).toContainText(/0:5\d|1:00/)
  await page
    .getByRole('group', { name: 'Seçenekler' })
    .getByRole('button')
    .nth(ilkSoru.dogru - 1)
    .click()
  await expect(page.getByText('Doğru!')).toBeVisible()
  await page.getByRole('button', { name: 'Sonraki soru' }).click()
  await shot(page, 'oda-soru-sure')

  // Süreyi sunucuda bitmek üzere al ve sayfayı yenile: geri sayım biter, sonuç gelir
  await svc
    .from('oda_oyun')
    .update({ basladi: new Date(Date.now() - 57_000).toISOString() })
    .eq('user_id', matId)
    .eq('oyun', 'soru')
  await page.reload()
  await expect(page.getByRole('timer')).toBeVisible()
  await expect(page.getByText(/Süre doldu: 1 soru cevapladın, 1 doğru/)).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText('cevaplanmadı', { exact: false }).first()).toBeVisible()
  await expect(page.getByRole('group', { name: 'Seçenekler' })).toHaveCount(0)
  const k = (await svc.from('oda_oyun').select('puan, bitti').eq('user_id', matId).eq('oyun', 'soru').single()).data!
  expect(k.puan).toBe(1)
  expect(k.bitti).not.toBeNull()
})
