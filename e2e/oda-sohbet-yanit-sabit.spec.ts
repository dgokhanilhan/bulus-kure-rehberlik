// Öğretmenler Odası sohbeti (0074): yanıtlama, kanalda arama, sabit mesajlar, okundu bilgisi.
import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { createClient } from '@supabase/supabase-js'
import { DEMO, login, service, shot } from './helpers'

const svc = service()
const IZ = 'e2e-yanit'
const temizle = async () => {
  await svc.from('oda_mesaj').delete().like('metin', `%${IZ}%`)
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
const yaz = async (c: Awaited<ReturnType<typeof oturum>>, satir: Record<string, unknown>) => {
  const r = await c
    .from('oda_mesaj')
    .insert({ anilan: [], ...satir })
    .select('id, yanit_id, sabit_at')
    .single()
  expect(r.error).toBeNull()
  return r.data!
}

test('veritabanı: yanıt aynı kanalda kalır; sabitlemeyi yalnız yönetim yapar; okundu bilgisi; sabit silinmez', async () => {
  const mat = await oturum(DEMO.matematik)
  const reh = await oturum(DEMO.rehber)
  const veli = await oturum(DEMO.veli)
  const asil = await yaz(mat, { kanal: 'genel', metin: `${IZ} toplantı Işık salonunda` })
  // Yanıt: aynı kanalda bağlanır; başka kanaldaki mesaja yanıt bağı düşer; istemci sabit_at yazamaz
  const yanit = await yaz(reh, { kanal: 'genel', metin: `${IZ} tamam, geliyorum`, yanit_id: asil.id })
  expect(yanit.yanit_id).toBe(asil.id)
  const capraz = await yaz(reh, { kanal: 'ortaokul', metin: `${IZ} başka kanal`, yanit_id: asil.id, sabit_at: new Date().toISOString() })
  expect(capraz.yanit_id).toBeNull()
  expect(capraz.sabit_at).toBeNull()

  // Sabitleme: branş öğretmeni yapamaz, rehber yapar; kanal başına en çok 3
  expect((await mat.rpc('oda_mesaj_sabitle', { p_id: asil.id, p_sabit: true })).error?.message).toContain('yalnız yönetici ve rehber')
  expect((await mat.from('oda_mesaj').update({ sabit_at: new Date().toISOString() }).eq('id', asil.id)).error).not.toBeNull()
  expect((await reh.rpc('oda_mesaj_sabitle', { p_id: asil.id, p_sabit: true })).error).toBeNull()
  const ek = [] as string[]
  for (let i = 0; i < 3; i++) ek.push((await yaz(reh, { kanal: 'genel', metin: `${IZ} ek ${i}` })).id)
  expect((await reh.rpc('oda_mesaj_sabitle', { p_id: ek[0], p_sabit: true })).error).toBeNull()
  expect((await reh.rpc('oda_mesaj_sabitle', { p_id: ek[1], p_sabit: true })).error).toBeNull()
  expect((await reh.rpc('oda_mesaj_sabitle', { p_id: ek[2], p_sabit: true })).error?.message).toContain('en çok 3')
  expect((await reh.rpc('oda_mesaj_sabitle', { p_id: ek[0], p_sabit: false })).error).toBeNull()
  expect((await reh.rpc('oda_mesaj_sabitle', { p_id: ek[1], p_sabit: false })).error).toBeNull()

  // Okundu bilgisi: yazan sayıyı görür, adları görmez; yönetim adları da görür; ilgisiz öğretmen göremez
  const benim = (await mat.rpc('oda_okundu_bilgisi', { p_id: asil.id })).data as { okuyan: number; toplam: number; okumayanlar: string[] | null }
  expect(benim.toplam).toBeGreaterThanOrEqual(1)
  expect(benim.okumayanlar).toBeNull()
  const once = (await reh.rpc('oda_okundu_bilgisi', { p_id: asil.id })).data as { okuyan: number; toplam: number; okumayanlar: string[] }
  expect(once.okumayanlar).toContain('Selin Aksoy')
  const rehId = (await reh.auth.getUser()).data.user!.id
  await reh.from('oda_okundu').upsert({ user_id: rehId, kanal: 'genel', zaman: new Date().toISOString() })
  const sonra = (await reh.rpc('oda_okundu_bilgisi', { p_id: asil.id })).data as { okuyan: number; okumayanlar: string[] }
  expect(sonra.okuyan).toBe(once.okuyan + 1)
  expect(sonra.okumayanlar).not.toContain('Selin Aksoy')
  expect((await mat.rpc('oda_okundu_bilgisi', { p_id: yanit.id })).error?.message).toContain('mesajı yazan ve yönetim')
  expect((await veli.rpc('oda_okundu_bilgisi', { p_id: asil.id })).error).not.toBeNull()
  expect((await veli.rpc('oda_mesaj_sabitle', { p_id: asil.id, p_sabit: false })).error).not.toBeNull()

  // Saklama temizliği: süresi dolan sabit mesaj kalır, sabit olmayan silinir; asıl silinince yanıt kalır, bağ düşer
  await svc.from('oda_mesaj').update({ created_at: '2020-01-01T00:00:00Z' }).in('id', [asil.id, ek[2]])
  expect((await svc.rpc('oda_temizlik')).error).toBeNull()
  expect((await svc.from('oda_mesaj').select('id').in('id', [asil.id, ek[2]])).data!.map((x) => x.id)).toEqual([asil.id])
  await svc.from('oda_mesaj').update({ created_at: new Date().toISOString() }).eq('id', asil.id)
  const silinecek = await yaz(mat, { kanal: 'genel', metin: `${IZ} silinecek` })
  const bagli = await yaz(reh, { kanal: 'genel', metin: `${IZ} bağlı yanıt`, yanit_id: silinecek.id })
  await mat.from('oda_mesaj').delete().eq('id', silinecek.id)
  expect((await svc.from('oda_mesaj').select('yanit_id').eq('id', bagli.id).single()).data!.yanit_id).toBeNull()
})

test('arayüz: yanıtla, ara, sabit mesaj ve okuyanlar', async ({ page }) => {
  await login(page, ...DEMO.rehber)
  await expect(page.getByRole('navigation', { name: 'Ana menü' })).toBeVisible()
  await page.goto('/ogretmenler-odasi?sekme=sohbet&kanal=genel')
  const asil = page.getByRole('article').filter({ has: page.locator('.oda-metin', { hasText: `${IZ} toplantı Işık salonunda` }) })
  await expect(asil).toBeVisible()
  // Sabit mesaj kanalın üstünde
  const sabitler = page.getByRole('list', { name: 'Sabitlenmiş mesajlar' })
  await expect(sabitler).toContainText(`${IZ} toplantı Işık salonunda`)

  // Yanıtla
  await asil.hover()
  await asil.getByRole('button', { name: 'Yanıtla' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'adlı kişiye yanıt' })).toContainText('Murat Kaya')
  await page.getByLabel(/kanalına mesaj/).fill(`${IZ} arayüzden yanıt`)
  await page.getByRole('button', { name: 'Gönder' }).click()
  const yeni = page.getByRole('article').filter({ hasText: `${IZ} arayüzden yanıt` })
  await expect(yeni.getByRole('button', { name: /mesajına yanıt/ })).toContainText('Işık salonunda')

  // Ara: Türkçe büyük-küçük harf (ışık ↔ Işık), vurgulu sonuç, bulunamayan
  await page.getByRole('button', { name: 'Kanalda ara' }).click()
  await page.getByRole('searchbox', { name: 'Kanalda ara' }).fill('IŞIK')
  const sonuclar = page.getByRole('list', { name: 'Arama sonuçları' })
  await expect(sonuclar.locator('mark').first()).toHaveText('Işık')
  const axe = await new AxeBuilder({ page }).include('main').withTags(['wcag2a', 'wcag2aa']).analyze()
  expect(axe.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')).toEqual([])
  await shot(page, 'oda-sohbet-arama')
  await page.getByRole('searchbox', { name: 'Kanalda ara' }).fill('zzqq-yok')
  await expect(page.getByText(/için bu kanalda mesaj bulunamadı/)).toBeVisible()
  await page.getByRole('button', { name: 'Aramayı kapat' }).click()
  await expect(asil).toBeVisible()

  // Okuyanlar (yönetim adları görür)
  await sabitler.getByRole('button', { name: 'Okuyanlar' }).first().click()
  const dlg = page.getByRole('dialog', { name: 'Okundu bilgisi' })
  await expect(dlg).toContainText(/öğretmenden \d+ kişi bu mesajdan sonra kanalı açtı/)
  await shot(page, 'oda-sohbet-okundu')
  await page.keyboard.press('Escape')

  // Sabiti kaldır, yeniden sabitle
  await sabitler.getByRole('button', { name: 'Sabiti kaldır' }).first().click()
  await expect(page.getByRole('list', { name: 'Sabitlenmiş mesajlar' })).toHaveCount(0)
  await asil.hover()
  await asil.getByRole('button', { name: 'Mesajı sabitle' }).click()
  await expect(page.getByRole('list', { name: 'Sabitlenmiş mesajlar' })).toContainText('Işık salonunda')
  const axe2 = await new AxeBuilder({ page }).include('main').withTags(['wcag2a', 'wcag2aa']).analyze()
  expect(axe2.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')).toEqual([])
  await shot(page, 'oda-sohbet-sabit')
})

test('arayüz: branş öğretmeni sabitleyemez; kendi mesajının okundu sayısını görür', async ({ page }) => {
  await login(page, ...DEMO.matematik)
  await expect(page.getByRole('navigation', { name: 'Ana menü' })).toBeVisible()
  await page.goto('/ogretmenler-odasi?sekme=sohbet&kanal=genel')
  const asil = page.getByRole('article').filter({ has: page.locator('.oda-metin', { hasText: `${IZ} toplantı Işık salonunda` }) })
  await expect(asil).toBeVisible()
  await asil.hover()
  await expect(asil.getByRole('button', { name: 'Mesajı sabitle' })).toHaveCount(0)
  await expect(asil.getByRole('button', { name: 'Sabiti kaldır' })).toHaveCount(0)
  await asil.getByRole('button', { name: 'Okundu bilgisi' }).click()
  const dlg = page.getByRole('dialog', { name: 'Okundu bilgisi' })
  await expect(dlg).toContainText(/kişi bu mesajdan sonra kanalı açtı/)
  await expect(dlg.getByText(/Henüz açmayanlar/)).toHaveCount(0)
})
