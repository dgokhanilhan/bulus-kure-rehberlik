// Öğretmenler Odası oyunlar (0069) ve Pano (0070): sunucu doğrulamalı günlük bulmacalar, skor sınırları, lig, gizlenme;
// pano notu, anket (gizli oy), teşekkür kartı (bildirim), ders değişimi ("Ben girerim"); veli/öğrenci hiçbir şeye erişemez.
import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { createClient } from '@supabase/supabase-js'
import { DEMO, login, service, shot } from './helpers'

const IZ = 'e2e-pano'
const temizle = async () => {
  const svc = service()
  const ids = (await svc.from('profiles').select('id').in('email', [DEMO.rehber[0], DEMO.matematik[0], DEMO.admin[0]])).data!.map((p) => p.id)
  await svc.from('oda_oyun').delete().in('user_id', ids)
  await svc.from('oda_oyun_tercih').delete().in('user_id', ids)
  await svc.from('oda_pano').delete().like('metin', `%${IZ}%`)
  await svc.from('oda_anket').delete().like('soru', `%${IZ}%`)
  await svc.from('oda_tesekkur').delete().like('metin', `%${IZ}%`)
  await svc.from('oda_degisim').delete().like('saat', `%${IZ}%`)
  await svc.from('oda_dogum_gunu').delete().in('user_id', ids)
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

test('oyunlar: sudoku ve kelime sunucuda doğrulanır; skor sınırları; lig; veli erişemez', async () => {
  const mat = await oturum(DEMO.matematik)
  const reh = await oturum(DEMO.rehber)
  const veli = await oturum(DEMO.veli)
  const svc = service()

  // Sudoku: yanlış çözüm kabul edilmez; doğru çözüm (sunucunun ürettiği) süreyle kaydedilir; cevap bitmeden gelmez
  const s = (await mat.rpc('oda_sudoku_ac')).data as { ipucu: number[]; cozum: number[] | null; bitti: string | null }
  expect(s.ipucu).toHaveLength(81)
  expect(s.cozum).toBeNull()
  expect(((await mat.rpc('oda_sudoku_bitir', { p: s.ipucu.map((x) => x || 1) })).data as { dogru: boolean }).dogru).toBe(false)
  const { data: dogru } = await svc.rpc('oda_sudoku_uret', { g: (await svc.rpc('tr_today')).data })
  const r = (await mat.rpc('oda_sudoku_bitir', { p: (dogru as { cozum: number[] }).cozum })).data as { dogru: boolean; puan: number }
  expect(r.dogru).toBe(true)
  expect(r.puan).toBeGreaterThanOrEqual(1)
  // Doğrudan yazılamaz
  expect((await mat.from('oda_oyun').insert({ oyun: 'yilan', puan: 999 })).error).not.toBeNull()

  // Kelime: geçersiz tahmin reddedilir; 6 yanlışta biter ve cevap gösterilir
  await mat.rpc('oda_kelime_ac')
  expect((await mat.rpc('oda_kelime_tahmin', { p: 'abc' })).error).not.toBeNull()
  let k = (await mat.rpc('oda_kelime_tahmin', { p: 'zzzzz' })).data as { tahminler: { r: number[] }[]; cevap: string | null; bitti: string | null }
  expect(k.tahminler[0]!.r).toEqual([0, 0, 0, 0, 0])
  expect(k.cevap).toBeNull()
  for (let i = 0; i < 5; i++) k = (await mat.rpc('oda_kelime_tahmin', { p: 'zzzzz' })).data as typeof k
  expect(k.bitti).not.toBeNull()
  expect(k.cevap).toMatch(/^.{5}$/u)

  // Tarayıcı oyunları: makul olmayan skor reddedilir
  expect((await mat.rpc('oda_skor_kaydet', { p_oyun: 'yilan', p_puan: 5000, p_sure_ms: 600000 })).error).not.toBeNull()
  expect((await mat.rpc('oda_skor_kaydet', { p_oyun: 'yilan', p_puan: 50, p_sure_ms: 100 })).error).not.toBeNull()
  expect((await mat.rpc('oda_skor_kaydet', { p_oyun: 'mayin', p_puan: 2, p_sure_ms: 2000 })).error).not.toBeNull()
  expect((await mat.rpc('oda_skor_kaydet', { p_oyun: 'yilan', p_puan: 12, p_sure_ms: 30000 })).error).toBeNull()
  expect((await reh.rpc('oda_skor_kaydet', { p_oyun: 'yilan', p_puan: 20, p_sure_ms: 40000 })).error).toBeNull()

  // Skor tablosu: yüksek olan önde; lig puanı
  const t = (await mat.rpc('oda_skor_tablosu', { p_oyun: 'yilan', p_donem: 'gun' })).data as { ad: string; puan: number; ben: boolean }[]
  expect(t.map((x) => x.puan).slice(0, 2)).toEqual([20, 12])
  const lig = (await mat.rpc('oda_lig')).data as { puan: number; ben: boolean }[]
  // Sudoku 1. (10) + Yılan 2. (8); bulunamayan kelime ligde sayılmaz
  expect(lig.find((x) => x.ben)!.puan).toBe(18)
  // Gizlenen öğretmen başkasının tablosunda görünmez, kendininkinde görünür
  await reh.from('oda_oyun_tercih').upsert({ user_id: (await reh.auth.getUser()).data.user!.id, gizli: true })
  expect(((await mat.rpc('oda_skor_tablosu', { p_oyun: 'yilan', p_donem: 'gun' })).data as unknown[]).length).toBe(1)
  expect(((await reh.rpc('oda_skor_tablosu', { p_oyun: 'yilan', p_donem: 'gun' })).data as unknown[]).length).toBe(2)

  // Veli: hiçbir şey
  expect((await veli.rpc('oda_sudoku_ac')).error).not.toBeNull()
  expect((await veli.rpc('oda_skor_tablosu', { p_oyun: 'yilan', p_donem: 'gun' })).data).toEqual([])
  expect((await veli.from('oda_oyun').select('id')).data).toEqual([])
})

test('pano: not, anket (gizli oy), teşekkür (bildirim), ders değişimi; veli erişemez', async () => {
  const mat = await oturum(DEMO.matematik)
  const reh = await oturum(DEMO.rehber)
  const veli = await oturum(DEMO.veli)
  const svc = service()
  const matId = (await mat.auth.getUser()).data.user!.id
  const rehId = (await reh.auth.getUser()).data.user!.id

  expect((await mat.from('oda_pano').insert({ metin: `${IZ} not`, renk: 'mavi' })).error).toBeNull()
  expect((await veli.from('oda_pano').insert({ metin: `${IZ} veli` })).error).not.toBeNull()
  expect((await veli.from('oda_pano').select('id')).data).toEqual([])
  expect((await reh.from('oda_pano').select('id').like('metin', `%${IZ}%`)).data).toHaveLength(1)

  const { data: a } = await reh
    .from('oda_anket')
    .insert({ soru: `${IZ} toplantı günü?`, secenekler: ['Salı', 'Perşembe', ' '] })
    .select('id, secenekler')
    .single()
  expect(a!.secenekler).toEqual(['Salı', 'Perşembe'])
  expect((await mat.rpc('oda_anket_oyla', { p_anket: a!.id, p_secim: 1 })).error).toBeNull()
  expect((await mat.rpc('oda_anket_oyla', { p_anket: a!.id, p_secim: 5 })).error).not.toBeNull()
  // Rehber oyu kimin verdiğini göremez, yalnız sayıyı görür
  expect((await reh.from('oda_anket_oy').select('user_id').eq('anket_id', a!.id)).data).toEqual([])
  expect((await reh.rpc('oda_anket_sonuc', { p_anketler: [a!.id] })).data).toEqual([{ anket_id: a!.id, secim: 1, sayi: 1 }])

  expect((await mat.from('oda_tesekkur').insert({ alan: matId, metin: `${IZ} kendime` })).error).not.toBeNull()
  expect((await mat.from('oda_tesekkur').insert({ alan: rehId, metin: `${IZ} nöbet için teşekkürler` })).error).toBeNull()
  expect((await svc.from('notifications').select('id').eq('user_id', rehId).eq('type', 'oda').like('text', `%${IZ}%`)).data).toHaveLength(1)

  const yarin = new Date(Date.now() + 86400_000 + 3 * 3600_000).toISOString().slice(0, 10)
  const { data: d } = await mat
    .from('oda_degisim')
    .insert({ tur: 'ders', tarih: yarin, saat: `3. ders ${IZ}`, sinif: '8/A' })
    .select('id')
    .single()
  expect((await mat.rpc('oda_degisim_al', { p_id: d!.id })).error).not.toBeNull() // kendi talebi
  expect((await reh.rpc('oda_degisim_al', { p_id: d!.id })).error).toBeNull()
  expect((await svc.from('oda_degisim').select('durum, alan').eq('id', d!.id).single()).data).toEqual({ durum: 'alindi', alan: rehId })
  expect((await svc.from('notifications').select('id').eq('user_id', matId).eq('type', 'oda').like('text', `%${IZ}%`)).data).toHaveLength(1)
  expect((await veli.rpc('oda_degisim_al', { p_id: d!.id })).error).not.toBeNull()
})

test('arayüz: oyunlar ve pano sekmeleri, sudoku ve kelime oynanır', async ({ page }) => {
  await login(page, ...DEMO.rehber)
  await expect(page.getByRole('navigation', { name: 'Ana menü' })).toBeVisible()
  await page.goto('/ogretmenler-odasi?sekme=oyunlar')
  await expect(page.getByRole('heading', { name: /Haftalık lig/ })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Rozetlerim' })).toBeVisible()
  await shot(page, 'oda-oyunlar')
  await page.getByRole('button', { name: /Hafıza Kartları/ }).click()
  await expect(page.getByRole('grid', { name: 'Hafıza kartları' }).getByRole('gridcell')).toHaveCount(16)
  await page.getByRole('button', { name: 'Oyunlar' }).click()
  await page.getByRole('button', { name: /Günün Kelimesi/ }).click()
  await expect(page.getByRole('grid', { name: 'Tahminler' })).toBeVisible()
  await page.keyboard.type('kalem')
  await page.keyboard.press('Enter')
  await expect(page.getByRole('grid', { name: 'Tahminler' }).getByRole('row').first().getByRole('gridcell').first()).toHaveAttribute('aria-label', /K: /)
  // Renklerin anlamı oyundaki kutuların aynısıyla açıklanır
  const aciklama = page.getByTestId('kelime-aciklama')
  await expect(aciklama).toContainText('Doğru yerde (✓)')
  await expect(aciklama).toContainText('Yeri yanlış (↔)')
  await expect(aciklama).toContainText('Kelimede yok')
  const axeK = await new AxeBuilder({ page }).include('main').withTags(['wcag2a', 'wcag2aa']).analyze()
  expect(axeK.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')).toEqual([])
  await shot(page, 'oda-kelime')
  await page.getByRole('button', { name: 'Oyunlar' }).click()

  // Hesap Sprinti: her doğruda seviye artar, hızlı doğruda daha çok; yanlışta aynı kalır
  await page.getByRole('button', { name: /Hesap Sprinti/ }).click()
  await page.getByRole('button', { name: 'Başla (60 sn)' }).click()
  const seviye = page.getByTestId('sprint-seviye')
  await expect(seviye).toHaveText('Seviye 1')
  const islem = page.locator('.sp-islem')
  const coz = async () => {
    const m = (await islem.innerText()).replace('=', '').replace(/−/g, '-').replace(/×/g, '*').replace(/÷/g, '/')
    return String(await page.evaluate((x) => Function(`return (${x})`)(), m))
  }
  await page.getByLabel('Cevap').fill(await coz())
  await page.keyboard.press('Enter')
  await expect(seviye).toHaveText('Seviye 3') // hızlı doğru: +2
  await expect(page.getByText('Hızlı! +2 seviye')).toBeVisible()
  await page.getByLabel('Cevap').fill(String(Number(await coz()) + 1))
  await page.keyboard.press('Enter')
  await expect(page.getByText('✗ 1')).toBeVisible()
  await expect(seviye).toHaveText('Seviye 3') // yanlış: aynı
  await expect(page.getByText('Olmadı; seviye aynı kaldı.')).toBeVisible()
  await shot(page, 'oda-sprint')
  await page.getByRole('button', { name: 'Oyunlar' }).click()
  await page.getByRole('button', { name: /Günün Sudokusu/ }).click()
  await expect(page.getByRole('grid', { name: 'Sudoku tahtası' })).toBeVisible()
  const axe = await new AxeBuilder({ page }).include('main').withTags(['wcag2a', 'wcag2aa']).analyze()
  expect(axe.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')).toEqual([])
  await shot(page, 'oda-sudoku')

  await page.goto('/ogretmenler-odasi?sekme=pano')
  await page.getByRole('button', { name: 'Not as' }).click()
  await page.getByLabel('Not', { exact: true }).fill(`${IZ} arayüz notu`)
  await page.getByRole('button', { name: 'Panoya as' }).click()
  await expect(page.locator('.pn-not', { hasText: `${IZ} arayüz notu` })).toBeVisible()
  await shot(page, 'oda-pano')

  // Doğum günü: isteğe bağlı paylaşım, "Bugün okulda"da görünür, kaldırılabilir
  const bugun = new Date(Date.now() + 3 * 3600_000)
  const AY = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'][bugun.getUTCMonth()]!
  await page.getByRole('tab', { name: 'Oda' }).click()
  await page.getByRole('button', { name: 'Doğum gününü paylaş (isteğe bağlı)' }).click()
  await page.getByLabel('Ay').selectOption({ label: AY })
  await page.getByLabel('Gün').selectOption({ label: String(bugun.getUTCDate()) })
  await page.getByRole('button', { name: 'Odada göster' }).click()
  await expect(page.locator('.oda-dogum .chip.gold')).toContainText('Bugün')
  await expect(page.getByRole('button', { name: /Doğum günün: .* · Değiştir/ })).toBeVisible()
  await shot(page, 'oda-dogum')
  await page.getByRole('button', { name: /Doğum günün: .* · Değiştir/ }).click()
  await page.getByRole('button', { name: 'Kaldır' }).click()
  await expect(page.getByRole('button', { name: 'Doğum gününü paylaş (isteğe bağlı)' })).toBeVisible()
})
