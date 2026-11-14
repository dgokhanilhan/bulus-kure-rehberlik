// Öğretmenler Odası Pano (0075): "okudum" onayı, etkinlik ve katılım, değişimde idare onayı, anonim öneri kutusu.
import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { createClient } from '@supabase/supabase-js'
import { DEMO, login, loginAdmin, resetAdminMfa, service, shot } from './helpers'

const svc = service()
const IZ = 'e2e-p4'
const AYARLAR = ['oda.degisim_onay', 'oda.oneri']
const yarin = () => new Date(Date.now() + 27 * 3600_000).toISOString().slice(0, 10)
const temizle = async () => {
  await svc.from('oda_pano').delete().like('metin', `%${IZ}%`)
  await svc.from('oda_etkinlik').delete().like('baslik', `%${IZ}%`)
  await svc.from('oda_degisim').delete().like('saat', `%${IZ}%`)
  await svc.from('oda_oneri').delete().like('metin', `%${IZ}%`)
  await svc.from('oda_oneri_sayac').delete().gte('gun', '2000-01-01')
  await svc.from('school_settings').delete().in('key', AYARLAR)
  await svc.from('notifications').delete().eq('type', 'oda').or(`text.like.%${IZ}%,text.like.Öneri kutusuna%`)
}
test.beforeAll(async () => {
  await temizle()
  await resetAdminMfa()
})
test.afterAll(temizle)
test.describe.configure({ mode: 'serial' })

const oturum = async (kim: readonly [string, string]) => {
  const c = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!, { auth: { persistSession: false } })
  const { error } = await c.auth.signInWithPassword({ email: kim[0], password: kim[1] })
  expect(error).toBeNull()
  return c
}
const ayarla = async (key: string, value: unknown) => {
  const { data: okul } = await svc.from('profiles').select('school_id').eq('email', DEMO.matematik[0]).single()
  const { error } = await svc.from('school_settings').upsert({ school_id: okul!.school_id, key, value }, { onConflict: 'school_id,key' })
  expect(error).toBeNull()
}

test('okudum onayı: yalnız yönetim ister; onay durumu yazana ve yönetime', async () => {
  const mat = await oturum(DEMO.matematik)
  const reh = await oturum(DEMO.rehber)
  const veli = await oturum(DEMO.veli)
  // Branş öğretmeni onay isteyemez (işaret düşer); rehber isteyebilir
  const m = (
    await mat
      .from('oda_pano')
      .insert({ metin: `${IZ} sıradan not`, onay_iste: true })
      .select('id, onay_iste')
      .single()
  ).data!
  expect(m.onay_iste).toBe(false)
  const r = (
    await reh
      .from('oda_pano')
      .insert({ metin: `${IZ} tören 9.00'da`, onay_iste: true })
      .select('id, onay_iste')
      .single()
  ).data!
  expect(r.onay_iste).toBe(true)
  const matId = (await mat.auth.getUser()).data.user!.id
  const once = (await reh.rpc('oda_pano_onay_durum', { p_ids: [r.id, m.id] })).data as {
    pano_id: string
    okuyan: number
    toplam: number
    okumayanlar: string[]
  }[]
  expect(once).toHaveLength(1) // onay istemeyen not dönmez
  expect(once[0]!.okuyan).toBe(0)
  expect(once[0]!.okumayanlar).toContain('Murat Kaya')
  expect(once[0]!.okumayanlar).not.toContain('Selin Aksoy') // yazan sayılmaz
  // Onay istemeyen nota onay yazılamaz; başkası adına yazılamaz
  expect((await mat.from('oda_pano_onay').insert({ pano_id: m.id, user_id: matId })).error).not.toBeNull()
  expect((await reh.from('oda_pano_onay').insert({ pano_id: r.id, user_id: matId })).error).not.toBeNull()
  expect((await mat.from('oda_pano_onay').insert({ pano_id: r.id, user_id: matId })).error).toBeNull()
  const sonra = (await reh.rpc('oda_pano_onay_durum', { p_ids: [r.id] })).data as typeof once
  expect(sonra[0]!.okuyan).toBe(1)
  expect(sonra[0]!.okumayanlar).not.toContain('Murat Kaya')
  // Branş öğretmeni başkasının notunun durumunu göremez; veli hiçbir şey
  expect((await mat.rpc('oda_pano_onay_durum', { p_ids: [r.id] })).data).toEqual([])
  expect((await veli.rpc('oda_pano_onay_durum', { p_ids: [r.id] })).data ?? []).toEqual([])
  expect((await veli.from('oda_pano_onay').select('pano_id')).data ?? []).toEqual([])
})

test('etkinlik: katıl, kontenjan, vazgeç; doğrudan yazılamaz', async () => {
  const mat = await oturum(DEMO.matematik)
  const reh = await oturum(DEMO.rehber)
  const veli = await oturum(DEMO.veli)
  const e = (
    await mat
      .from('oda_etkinlik')
      .insert({ baslik: `${IZ} kahvaltı`, tarih: yarin(), kontenjan: 1 })
      .select('id')
      .single()
  ).data!
  expect((await mat.from('oda_etkinlik').insert({ baslik: `${IZ} geçmiş`, tarih: '2020-01-01' })).error?.message).toContain('bugün ya da sonrası')
  const rehId = (await reh.auth.getUser()).data.user!.id
  expect((await reh.from('oda_etkinlik_katilim').insert({ etkinlik_id: e.id, user_id: rehId })).error).not.toBeNull()
  expect((await mat.rpc('oda_etkinlik_katil', { p_id: e.id, p_katil: true })).error).toBeNull()
  expect((await mat.rpc('oda_etkinlik_katil', { p_id: e.id, p_katil: true })).error).toBeNull() // ikinci kez: değişmez
  expect((await reh.rpc('oda_etkinlik_katil', { p_id: e.id, p_katil: true })).error?.message).toContain('Kontenjan doldu')
  expect((await reh.from('oda_etkinlik_katilim').select('user_id').eq('etkinlik_id', e.id)).data).toHaveLength(1)
  expect((await mat.rpc('oda_etkinlik_katil', { p_id: e.id, p_katil: false })).error).toBeNull()
  expect((await reh.rpc('oda_etkinlik_katil', { p_id: e.id, p_katil: true })).error).toBeNull()
  expect((await veli.rpc('oda_etkinlik_katil', { p_id: e.id, p_katil: true })).error).not.toBeNull()
  expect((await veli.from('oda_etkinlik').select('id')).data ?? []).toEqual([])
  // Başkasının etkinliğini branş öğretmeni silemez; açan siler
  const r = (
    await reh
      .from('oda_etkinlik')
      .insert({ baslik: `${IZ} gezi`, tarih: yarin() })
      .select('id')
      .single()
  ).data!
  await mat.from('oda_etkinlik').delete().eq('id', r.id)
  expect((await svc.from('oda_etkinlik').select('id').eq('id', r.id)).data).toHaveLength(1)
})

test('değişimde idare onayı: kapalıyken doğrudan, açıkken yönetici onayıyla', async () => {
  const mat = await oturum(DEMO.matematik)
  const reh = await oturum(DEMO.rehber)
  const yeni = async () =>
    (
      await mat
        .from('oda_degisim')
        .insert({ tur: 'nobet', tarih: yarin(), saat: `${IZ} öğle` })
        .select('id')
        .single()
    ).data!.id as string
  const durum = async (id: string) => (await svc.from('oda_degisim').select('durum, alan, onaylayan').eq('id', id).single()).data!
  // Kapalı (varsayılan): üstlenince kesinleşir
  const a = await yeni()
  expect((await reh.rpc('oda_degisim_al', { p_id: a })).error).toBeNull()
  expect((await durum(a)).durum).toBe('alindi')
  // Açık: onay bekler; rehber onaylayamaz
  await ayarla('oda.degisim_onay', true)
  const b = await yeni()
  expect((await reh.rpc('oda_degisim_al', { p_id: b })).error).toBeNull()
  expect((await durum(b)).durum).toBe('onay')
  expect((await reh.rpc('oda_degisim_onayla', { p_id: b, p_onay: true })).error?.message).toContain('yalnız yönetici')
  expect((await mat.rpc('oda_degisim_onayla', { p_id: b, p_onay: true })).error).not.toBeNull()
  await reh.from('oda_degisim').update({ durum: 'alindi' }).eq('id', b) // doğrudan güncelleme etkisiz
  expect((await durum(b)).durum).toBe('onay')
  // Talep sahibine "onay bekliyor" bildirimi gitti
  const matId = (await mat.auth.getUser()).data.user!.id
  const bildirim = (await svc.from('notifications').select('text').eq('user_id', matId).like('text', `%${IZ}%`)).data!.map((x) => x.text)
  expect(bildirim.some((t) => t.includes('idare onayı bekliyor'))).toBe(true)
})

test('öneri kutusu: adsız saklanır, günlük sınır, yalnız yönetici okur; kapalıyken alınmaz', async () => {
  const mat = await oturum(DEMO.matematik)
  const reh = await oturum(DEMO.rehber)
  const veli = await oturum(DEMO.veli)
  expect((await mat.rpc('oda_oneri_gonder', { p_metin: 'kısa' })).error?.message).toContain('5 ile 1000')
  for (let i = 1; i <= 3; i++) expect((await mat.rpc('oda_oneri_gonder', { p_metin: `${IZ} öneri ${i}` })).error).toBeNull()
  expect((await mat.rpc('oda_oneri_gonder', { p_metin: `${IZ} öneri 4` })).error?.message).toContain('en çok 3')
  expect((await veli.rpc('oda_oneri_gonder', { p_metin: `${IZ} veli önerisi` })).error).not.toBeNull()
  // Satırda yazan bilgisi yok: tablonun sütunları
  const satir = (await svc.from('oda_oneri').select('*').like('metin', `${IZ}%`)).data!
  expect(satir).toHaveLength(3)
  expect(Object.keys(satir[0]!).sort()).toEqual(['durum', 'gun', 'id', 'metin', 'school_id'])
  // Öğretmen ve rehber okuyamaz; doğrudan ekleyemez
  expect((await mat.from('oda_oneri').select('id')).data ?? []).toEqual([])
  expect((await reh.from('oda_oneri').select('id')).data ?? []).toEqual([])
  expect((await mat.from('oda_oneri').insert({ metin: `${IZ} doğrudan` })).error).not.toBeNull()
  expect((await mat.from('oda_oneri_sayac').select('sayi')).error).not.toBeNull()
  // Yöneticiye bildirim gitti (kimden olduğu yazmaz)
  const adminId = (await svc.from('profiles').select('id').eq('email', DEMO.admin[0]).single()).data!.id
  const b = (await svc.from('notifications').select('text').eq('user_id', adminId).like('text', 'Öneri kutusuna%')).data!
  expect(b.length).toBe(3)
  expect(b[0]!.text).toBe('Öneri kutusuna yeni bir öneri bırakıldı.')
  // Kapalıyken alınmaz
  await ayarla('oda.oneri', false)
  expect((await reh.rpc('oda_oneri_gonder', { p_metin: `${IZ} kapalıyken` })).error?.message).toContain('Öneri kutusu kapalı')
  await svc.from('school_settings').delete().eq('key', 'oda.oneri')
})

test('arayüz: öğretmen okudum der, etkinliğe katılır, öneri bırakır', async ({ page }) => {
  await login(page, ...DEMO.matematik)
  await expect(page.getByRole('navigation', { name: 'Ana menü' })).toBeVisible()
  await page.goto('/ogretmenler-odasi?sekme=pano')
  const not = page.locator('.pn-not', { hasText: `${IZ} tören` })
  await expect(not).toContainText('Herkes okusun')
  await expect(not.getByRole('button', { name: '✓ Okudun' })).toBeDisabled() // önceki testte onayladı
  await expect(not.getByText(/öğretmen okudu/)).toHaveCount(0) // durum yalnız yazana ve yönetime
  // Etkinlik aç ve katıl
  const etk = page.getByRole('region', { name: 'Etkinlikler' })
  await etk.getByRole('button', { name: 'Etkinlik', exact: true }).click()
  await etk.getByLabel('Etkinlik', { exact: true }).fill(`${IZ} arayüz kahvaltısı`)
  await etk.getByLabel(/Kontenjan/).fill('12')
  await etk.getByRole('button', { name: 'Etkinliği as' }).click()
  const satir = etk.getByRole('listitem').filter({ hasText: `${IZ} arayüz kahvaltısı` })
  await expect(satir).toContainText('0/12')
  await satir.getByRole('button', { name: 'Katılıyorum' }).click()
  await expect(satir).toContainText('1/12')
  await expect(satir).toContainText('Murat Kaya')
  await expect(satir.getByText('✓ Katılıyorsun')).toBeVisible()
  // Onay bekleyen değişim görünür; öğretmende onay düğmesi yok
  const deg = page.getByRole('region', { name: 'Ders ve nöbet değişimi' })
  await expect(deg.getByText(/İdare onayı bekliyor: Selin Aksoy/)).toBeVisible()
  await expect(deg.getByRole('button', { name: 'Onayla' })).toHaveCount(0)
  // Öneri kutusu (bugünkü hakkı doldu: önceki test 3 öneri bıraktı)
  const kutu = page.getByRole('region', { name: 'Öneri kutusu' })
  await kutu.getByLabel('Önerin').fill(`${IZ} arayüzden öneri`)
  await kutu.getByRole('button', { name: 'Adsız gönder' }).click()
  await expect(page.getByText('Bugün en çok 3 öneri bırakabilirsin.')).toBeVisible()
  const axe = await new AxeBuilder({ page }).include('main').withTags(['wcag2a', 'wcag2aa']).analyze()
  expect(axe.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')).toEqual([])
  await shot(page, 'oda-pano-yeni')
})

test('arayüz: yönetici onay ister, değişimi onaylar, önerileri okur, ayarları değiştirir', async ({ page }) => {
  await loginAdmin(page)
  await page.goto('/ogretmenler-odasi?sekme=pano')
  // Onay isteyen not as; rehberin notunda durum görünür
  const pano = page.getByRole('region', { name: 'Pano', exact: true })
  await pano.getByRole('button', { name: 'Not as' }).click()
  await pano.getByLabel('Not', { exact: true }).fill(`${IZ} yönetici duyurusu`)
  await pano.getByLabel(/Herkes okusun/).check()
  await pano.getByRole('button', { name: 'Panoya as' }).click()
  const benim = page.locator('.pn-not', { hasText: `${IZ} yönetici duyurusu` })
  await expect(benim.getByRole('button', { name: /0\/\d+ öğretmen okudu/ })).toBeVisible()
  const tor = page.locator('.pn-not', { hasText: `${IZ} tören` })
  await tor.getByRole('button', { name: /1\/\d+ öğretmen okudu/ }).click()
  await expect(tor.getByText(/Henüz onaylamayanlar:/)).toBeVisible()
  await expect(tor.getByText(/Henüz onaylamayanlar:/)).not.toContainText('Murat Kaya')
  // Değişimi onayla
  const deg = page.getByRole('region', { name: 'Ders ve nöbet değişimi' })
  await deg.getByRole('listitem').filter({ hasText: 'İdare onayı bekliyor' }).getByRole('button', { name: 'Onayla' }).click()
  await expect(page.getByText('Değişim onaylandı; iki öğretmene bildirildi.')).toBeVisible()
  await expect(deg.getByText(/İdare onayı bekliyor/)).toHaveCount(0)
  await shot(page, 'oda-pano-yonetici')

  // Yönetim: öneriler ve ayarlar
  await page.goto('/yonetim?sekme=oda')
  const liste = page.getByTestId('oneri-liste')
  await expect(liste.getByRole('listitem')).toHaveCount(3)
  await expect(liste).not.toContainText('Murat Kaya')
  await liste.getByRole('listitem').first().getByRole('button', { name: 'Okundu' }).click()
  await expect(liste.getByRole('listitem').first()).toContainText('okundu')
  await liste.getByRole('listitem').last().getByRole('button', { name: 'Öneriyi sil' }).click()
  await expect(liste.getByRole('listitem')).toHaveCount(2)
  await page.getByRole('switch', { name: /Anonim öneri kutusu/ }).click()
  await expect.poll(async () => (await svc.from('school_settings').select('value').eq('key', 'oda.oneri').maybeSingle()).data?.value).toBe(false)
  await expect.poll(async () => (await svc.from('school_settings').select('value').eq('key', 'oda.degisim_onay').maybeSingle()).data?.value).toBe(true)
  const axe = await new AxeBuilder({ page }).include('main').withTags(['wcag2a', 'wcag2aa']).analyze()
  expect(axe.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')).toEqual([])
  await shot(page, 'yonetim-oda-oneri')
})
