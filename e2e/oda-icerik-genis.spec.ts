// 0085: Günün Şehri yeni düzen (6 ipucu, her yanlış tahminde bir yenisi). "fen" hesabıyla oynanır; diğer oyun testleriyle karışmaz.
import { test, expect } from '@playwright/test'
import { login, service, shot } from './helpers'

const svc = service()
const FEN = ['fen@buluskure.k12.tr', 'Fen12345!'] as const
let ilk: string
let fenId: string
const temizle = () => svc.from('oda_oyun').delete().eq('user_id', fenId).eq('oyun', 'sehir')

test.beforeAll(async () => {
  fenId = (await svc.from('profiles').select('id').eq('email', FEN[0]).single()).data!.id
  ilk = (await svc.from('oda_icerik_surum').select('baslangic').eq('ad', 'sehir6').single()).data!.baslangic
  const bugun = (await svc.rpc('tr_today')).data as string
  await svc.from('oda_icerik_surum').update({ baslangic: bugun }).eq('ad', 'sehir6')
  await temizle()
})
test.afterAll(async () => {
  await svc.from('oda_icerik_surum').update({ baslangic: ilk }).eq('ad', 'sehir6')
  await temizle()
})

test('Günün Şehri: her yanlış tahminde yeni ipucu açılır', async ({ page }) => {
  const bugun = (await svc.rpc('tr_today')).data as string
  const hedef = (await svc.rpc('oda_sehir_gunun', { g: bugun })).data as number
  const ip6 = (await svc.from('oda_sehir').select('ipuclari6').eq('plaka', hedef).single()).data!.ipuclari6 as string[]
  const hedefAd = (await svc.from('oda_sehir').select('ad').eq('plaka', hedef).single()).data!.ad as string
  const yanlis = hedefAd === 'Ankara' ? 'İzmir' : 'Ankara'

  await login(page, ...FEN)
  await expect(page.getByRole('navigation', { name: 'Ana menü' })).toBeVisible()
  await page.goto('/ogretmenler-odasi?sekme=oyunlar')
  await page.getByRole('button', { name: /Günün Şehri/ }).click()
  const ipuclari = page.getByRole('region', { name: 'İpuçları' })
  await expect(ipuclari.getByRole('listitem')).toHaveCount(1)
  await expect(ipuclari).toContainText(ip6[0]!)
  await expect(page.getByText('Her yanlış tahminde yeni bir ipucu açılır; ipuçları giderek kolaylaşır.')).toBeVisible()
  await page.getByLabel(/Tahminin/).fill(yanlis)
  await page.getByRole('button', { name: 'Tahmin et' }).click()
  await expect(ipuclari.getByRole('listitem')).toHaveCount(2)
  await expect(ipuclari).toContainText(ip6[1]!)
  await shot(page, 'sehir-6-ipucu')
})
