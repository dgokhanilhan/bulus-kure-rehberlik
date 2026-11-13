// Yönetim → Öğretmenler Odası ve Günlük kontrol (0071): bölüm kapatma veritabanında da geçerli; yönetici özel kanal açar
// (yalnız seçilen öğretmen görür), hazır kanalı yeniden adlandırır ve gizler; günlük kontrol maddesi ekler ve kapatır;
// veli uyarı aralığı ayardan. Menüde Öğretmenler Odası Öğrenciler'in hemen altında.
import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { createClient } from '@supabase/supabase-js'
import { DEMO, ELIF, login, loginAdmin, menu, resetAdminMfa, service, shot } from './helpers'

const svc = service()
const AYARLAR = ['oda.pano', 'oda.sohbet', 'oda.oyunlar', 'gunluk_kontrol.uyari_araligi', 'modul.oda']
const IZ = 'E2E Yönetim'
const temizle = async () => {
  await svc.from('school_settings').delete().in('key', AYARLAR)
  await svc.from('oda_kanal').delete().like('ad', `${IZ}%`)
  await svc.from('oda_kanal').delete().eq('kanal', 'genel')
  const { data: m } = await svc.from('gunluk_kontrol_madde').select('kod').like('ad', 'E2E%')
  const kodlar = (m ?? []).map((x) => x.kod)
  if (kodlar.length) {
    await svc.from('gunluk_kontrol').delete().in('madde', kodlar)
    await svc.from('gunluk_kontrol_madde').delete().in('kod', kodlar)
  }
  await svc.from('gunluk_kontrol').delete().eq('student_id', ELIF).gte('tarih', '2091-01-01')
  await svc.from('notifications').delete().like('text', 'Günlük kontrol:%')
}
const ayarla = async (key: string, value: unknown) => {
  const { data: okul } = await svc.from('profiles').select('school_id').eq('email', DEMO.matematik[0]).single()
  await svc.from('school_settings').upsert({ school_id: okul!.school_id, key, value }, { onConflict: 'school_id,key' })
}
const oturum = async (kim: readonly [string, string]) => {
  const c = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!, { auth: { persistSession: false } })
  const { error } = await c.auth.signInWithPassword({ email: kim[0], password: kim[1] })
  expect(error).toBeNull()
  return c
}
const section = (page: Page, name: string | RegExp) => page.getByRole('group', { name: 'Yönetim bölümü' }).getByRole('button', { name })

test.describe.serial('Yönetim: Öğretmenler Odası ve Günlük kontrol', () => {
  test.beforeAll(async () => {
    await resetAdminMfa()
    await temizle()
  })
  test.afterAll(temizle)

  test('bölüm kapatılınca veri veritabanında da kapanır; uyarı aralığı ayardan', async () => {
    const mat = await oturum(DEMO.matematik)
    // Pano kapalı: öğretmen yazamaz ve okuyamaz
    await ayarla('oda.pano', false)
    expect((await mat.from('oda_pano').insert({ metin: `${IZ} not`, renk: 'sari' })).error).not.toBeNull()
    expect((await mat.from('oda_pano').select('id')).data).toEqual([])
    // Sohbet kapalı: kanal yok, mesaj yazılamaz
    await ayarla('oda.sohbet', false)
    expect((await mat.rpc('oda_kanallari')).data).toEqual([])
    expect((await mat.from('oda_mesaj').insert({ kanal: 'genel', metin: `${IZ} mesaj` })).error).not.toBeNull()
    // Oyunlar kapalı: bulmaca açılmaz
    await ayarla('oda.oyunlar', false)
    expect((await mat.rpc('oda_sudoku_ac')).error).not.toBeNull()
    // Modül kapalı: hepsi kapanır, açınca geri gelir
    await svc.from('school_settings').delete().in('key', ['oda.pano', 'oda.sohbet', 'oda.oyunlar'])
    await ayarla('modul.oda', false)
    expect((await mat.rpc('oda_kanallari')).data).toEqual([])
    await svc.from('school_settings').delete().eq('key', 'modul.oda')
    expect((await mat.rpc('oda_kanallari')).data).toContain('genel')

    // Günlük kontrol: uyarı aralığı 2 → 2. eksikte veliye uyarı; tanımsız madde reddedilir
    await ayarla('gunluk_kontrol.uyari_araligi', 2)
    const ekle = (tarih: string, madde = 'ajanda') =>
      mat.from('gunluk_kontrol').insert({ student_id: ELIF, tarih, madde }).select('sira, veli_uyarildi').single()
    expect((await ekle('2091-02-02')).data).toEqual({ sira: 1, veli_uyarildi: false })
    expect((await ekle('2091-02-03')).data).toEqual({ sira: 2, veli_uyarildi: true })
    expect((await ekle('2091-02-04', 'yok_boyle')).error).not.toBeNull()
    const { data: bil } = await svc.from('notifications').select('text').like('text', 'Günlük kontrol:%')
    expect(bil!.map((b) => b.text)).toContain('Günlük kontrol: Elif Yıldız bu ay 2. kez ajanda imzası eksikti (03.02.2091). Ayrıntılar Okul sayfasında.')
    // 0 = uyarı yok
    await ayarla('gunluk_kontrol.uyari_araligi', 0)
    expect((await ekle('2091-03-02')).data).toEqual({ sira: 1, veli_uyarildi: false })
    expect((await ekle('2091-03-03')).data).toEqual({ sira: 2, veli_uyarildi: false })
    await svc.from('school_settings').delete().eq('key', 'gunluk_kontrol.uyari_araligi')
  })

  test('menüde Öğretmenler Odası Öğrenciler\'in altında; yönetici kanal ve madde düzenler', async ({ page }) => {
    await loginAdmin(page)
    await expect(menu(page).nth(1)).toHaveText('Öğrenciler')
    await expect(menu(page).nth(2)).toHaveText(/^Öğretmenler Odası/)

    // ---- Öğretmenler Odası ayarları
    await page.goto('/yonetim?sekme=oda')
    await expect(page.getByRole('region', { name: 'Öğretmenler Odası bölümleri' })).toBeVisible()
    const kanallar = page.getByTestId('oda-kanal-liste')
    await expect(kanallar.getByTestId('oda-kanal').first()).toContainText('Genel')

    // Özel kanal: yalnız matematik öğretmeni
    const { data: matP } = await svc.from('profiles').select('id, full_name').eq('email', DEMO.matematik[0]).single()
    await page.getByRole('button', { name: 'Yeni kanal' }).click()
    const dlg = page.getByRole('dialog', { name: 'Yeni sohbet kanalı' })
    await dlg.getByLabel(/Kanal adı/).fill(`${IZ} 8. sınıf öğretmenleri`)
    await dlg.getByRole('radio', { name: 'Seçtiğim öğretmenler' }).click()
    await dlg.getByLabel('Öğretmen ara').fill(matP!.full_name.split(' ')[0]!)
    await dlg.getByRole('checkbox', { name: new RegExp(matP!.full_name) }).click()
    await dlg.getByRole('button', { name: 'Kaydet' }).click()
    await expect(dlg).toHaveCount(0)
    await expect(kanallar).toContainText(`${IZ} 8. sınıf öğretmenleri`)
    await expect(kanallar).toContainText('1 öğretmen')
    const { data: ozel } = await svc.from('oda_kanal').select('kanal, uyeler').like('ad', `${IZ}%`).single()
    expect(ozel!.uyeler).toEqual([matP!.id])
    const mat = await oturum(DEMO.matematik)
    const reh = await oturum(DEMO.rehber)
    expect((await mat.rpc('oda_kanallari')).data).toContain(ozel!.kanal)
    expect((await reh.rpc('oda_kanallari')).data).not.toContain(ozel!.kanal)
    expect((await mat.from('oda_mesaj').insert({ kanal: ozel!.kanal, metin: `${IZ} merhaba` })).error).toBeNull()
    expect((await reh.from('oda_mesaj').insert({ kanal: ozel!.kanal, metin: `${IZ} merhaba` })).error).not.toBeNull()

    // Hazır kanal: yeniden adlandır, sonra gizle
    const genel = kanallar.getByTestId('oda-kanal').filter({ hasText: '# Genel' })
    await genel.getByRole('button', { name: 'Düzenle' }).click()
    const dlg2 = page.getByRole('dialog', { name: '#Genel kanalı' })
    await dlg2.getByLabel(/Kanal adı/).fill(`${IZ} Öğretmenler`)
    await dlg2.getByRole('button', { name: 'Kaydet' }).click()
    await expect(kanallar).toContainText(`${IZ} Öğretmenler`)
    await expect(kanallar).toContainText('asıl adı: Genel')
    await kanallar.getByTestId('oda-kanal').filter({ hasText: `${IZ} Öğretmenler` }).getByRole('button', { name: 'Gizle' }).click()
    await expect(kanallar.getByTestId('oda-kanal').filter({ hasText: `${IZ} Öğretmenler` })).toContainText('Gizli')
    expect((await mat.rpc('oda_kanallari')).data).not.toContain('genel')
    const axe = await new AxeBuilder({ page }).include('main').withTags(['wcag2a', 'wcag2aa']).analyze()
    expect(axe.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious').map((v) => v.id)).toEqual([])
    await shot(page, 'yonetim-oda')

    // Bölüm kapatma ayar ekranından
    await page.getByRole('switch', { name: /Oyunlar/ }).click()
    await expect.poll(async () => (await svc.from('school_settings').select('value').eq('key', 'oda.oyunlar').maybeSingle()).data?.value).toBe(false)

    // ---- Günlük kontrol maddeleri
    await section(page, 'Günlük kontrol').click()
    const liste = page.getByTestId('gk-madde-liste')
    await expect(liste.getByTestId('gk-madde')).toHaveCount(5)
    await page.getByRole('button', { name: 'Yeni madde' }).click()
    const dlg3 = page.getByRole('dialog', { name: 'Yeni kontrol maddesi' })
    await dlg3.getByLabel(/Kısa ad/).fill('E2E Saç')
    await dlg3.getByLabel('Veliye görünen cümle').fill('Saç kurallara uygun değildi')
    await dlg3.getByRole('button', { name: 'Kaydet' }).click()
    await expect(liste.getByTestId('gk-madde')).toHaveCount(6)
    const { data: yeni } = await svc.from('gunluk_kontrol_madde').select('kod, aktif').eq('ad', 'E2E Saç').single()
    expect(yeni!.aktif).toBe(true)
    expect((await mat.from('gunluk_kontrol').insert({ student_id: ELIF, tarih: '2091-04-01', madde: yeni!.kod })).error).toBeNull()
    // Kullanılmış madde silinmez; kapatılır, kapalı madde işaretlenemez
    await liste.getByTestId('gk-madde').filter({ hasText: 'E2E Saç' }).getByRole('button', { name: 'E2E Saç maddesini sil' }).click()
    const sil = page.getByRole('dialog', { name: 'Maddeyi sil' })
    await sil.getByRole('textbox').fill('E2E Saç')
    await sil.getByRole('button', { name: 'Kalıcı olarak sil' }).click()
    await expect(sil.getByRole('alert')).toContainText('kullanılmış')
    await sil.getByRole('button', { name: 'Vazgeç' }).click()
    await liste.getByTestId('gk-madde').filter({ hasText: 'E2E Saç' }).getByRole('button', { name: 'Kapat' }).click()
    await expect(liste.getByTestId('gk-madde').filter({ hasText: 'E2E Saç' })).toContainText('Kapalı')
    expect((await mat.from('gunluk_kontrol').insert({ student_id: ELIF, tarih: '2091-04-02', madde: yeni!.kod })).error).not.toBeNull()
    await shot(page, 'yonetim-gunluk-kontrol')
  })

  test('öğretmen ekranı: kapalı bölüm sekmesi yok, kanal yeni adıyla', async ({ page }) => {
    await svc.from('oda_kanal').update({ gizli: false }).eq('kanal', 'genel')
    await login(page, ...DEMO.matematik)
    await expect(page.getByRole('navigation', { name: 'Ana menü' })).toBeVisible()
    await page.goto('/ogretmenler-odasi')
    await expect(page.getByRole('tab', { name: 'Pano' })).toBeVisible()
    await expect(page.getByRole('tab', { name: 'Oyunlar' })).toHaveCount(0)
    await page.getByRole('tab', { name: /Sohbet/ }).click()
    const kanallar = page.getByRole('tablist', { name: 'Sohbet kanalları' })
    await expect(kanallar).toContainText(`${IZ} Öğretmenler`)
    await expect(kanallar).toContainText(`${IZ} 8. sınıf öğretmenleri`)
  })
})
