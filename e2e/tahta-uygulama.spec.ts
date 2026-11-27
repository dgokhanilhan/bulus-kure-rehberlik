// BK Akıllı Yoklama Windows programının ekranları (tahta/), tarayıcıda yerel Supabase'e karşı:
// tahtayı bağlama → liste → işaretleme → PIN → kaydedildi; PIN 15 dk hatırlanır; bağlantı yokken bekletip sonra gönderme.
import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { createHash } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { DEMO, service, shot } from './helpers'

const svc = service()
const SCHOOL = '00000000-0000-4000-8000-000000000001'
const MAT = '00000000-0000-4000-8003-000000000003'
const ELIF = '00000000-0000-4000-8001-000000001184'
const AYSE = '00000000-0000-4000-8001-000000001185'
const KOD = 'TEST-2345'
const bugun = new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10)
const URL = '/tahta/index.html'
let sinif = ''
let pin = ''

async function axe(page: Page, label: string) {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
  const bad = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
  expect(bad.map((v) => `${label}: ${v.id} (${v.nodes.length}) ${v.nodes[0]?.target}`)).toEqual([])
}
async function temizle() {
  await svc.from('tahta').delete().eq('class_id', sinif)
  await svc.from('tahta_pin').delete().eq('profile_id', MAT)
  await svc.from('attendance').delete().in('student_id', [ELIF, AYSE]).eq('day', bugun)
  await svc.from('yoklama_bildirim').delete().in('student_id', [ELIF, AYSE])
  await svc.from('yoklama_oturum').delete().eq('class_id', sinif).eq('day', bugun)
}
const durumu = async (id: string) => (await svc.from('attendance').select('status, kaynak').eq('student_id', id).eq('day', bugun).maybeSingle()).data

test.describe.serial('BK Akıllı Yoklama programı', () => {
  test.beforeAll(async () => {
    sinif = (await svc.from('classes').select('id').eq('name', '8/A').single()).data!.id
    await temizle()
    // İdarenin "Tahta ekle" adımı (bilinen kodla)
    const { error } = await svc.from('tahta').insert({
      school_id: SCHOOL,
      class_id: sinif,
      ad: '8/A tahtası',
      kod_hash: createHash('sha256').update(KOD.replace('-', '')).digest('hex'),
      kod_son: new Date(Date.now() + 10 * 60_000).toISOString(),
    })
    expect(error).toBeNull()
    // Öğretmenin "PIN al" adımı
    const ogr = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!, { auth: { persistSession: false } })
    await ogr.auth.signInWithPassword({ email: DEMO.matematik[0], password: DEMO.matematik[1] })
    pin = (await ogr.rpc('tahta_pin_yenile')).data as string
    expect(pin).toMatch(/^\d{4}$/)
  })
  test.afterAll(temizle)

  test('tahta bağlanır, öğretmen işaretler ve PIN ile gönderir', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 })
    await page.goto(URL)
    await expect(page.getByRole('heading', { name: 'Bu tahtayı okula bağla' })).toBeVisible()
    await page.getByLabel('Eşleştirme kodu').fill('test 2345')
    await expect(page.getByLabel('Eşleştirme kodu')).toHaveValue(KOD)
    await page.getByRole('button', { name: 'Bağla' }).click()

    await expect(page.getByText('Bu tahta: 8/A tahtası')).toBeVisible()
    // Hangi tahtada hangi sürüm var: ana ekranın alt satırında
    await expect(page.getByText(/^Sürüm \d+\.\d+\.\d+$/)).toBeVisible()
    await page.getByRole('button', { name: '8/A yoklamasını al' }).click()
    await expect(page.getByRole('heading', { name: /8\/A · \d+ öğrenci/ })).toBeVisible()

    await page.getByRole('button', { name: 'Elif Yıldız: Geldi' }).click()
    await expect(page.getByRole('button', { name: 'Elif Yıldız: Gelmedi' })).toBeVisible()
    await page.getByRole('button', { name: 'Ayşe Çelik için diğer durumlar' }).click()
    await page.getByRole('menuitem', { name: /Geç geldi/ }).click()
    await expect(page.getByRole('button', { name: 'Ayşe Çelik: Geç geldi' })).toBeVisible()
    await expect(page.getByText('Gelmedi 1')).toBeVisible()
    await axe(page, 'tahta liste')
    await shot(page, 'tahta-uyg-1-liste', false)

    await page.getByRole('button', { name: 'Yoklamayı gönder' }).click()
    const pinEkrani = page.getByRole('dialog', { name: '8/A yoklamasını gönder' })
    await expect(pinEkrani).toBeVisible()
    await shot(page, 'tahta-uyg-2-pin', false)
    // Yanlış PIN
    const yanlis = pin === '2580' ? '2581' : '2580'
    await page.keyboard.type(yanlis)
    await expect(pinEkrani.getByRole('alert')).toHaveText('PIN eşleşmedi. 4 hakkın kaldı.')
    expect(await durumu(ELIF)).toBeNull()
    // Doğru PIN (dokunarak)
    for (const r of pin) await pinEkrani.getByRole('button', { name: r, exact: true }).click()
    await expect(page.getByRole('heading', { name: '8/A yoklaması kaydedildi' })).toBeVisible()
    await expect(page.getByText('Murat Kaya')).toBeVisible()
    await shot(page, 'tahta-uyg-3-kaydedildi', false)
    expect(await durumu(ELIF)).toEqual({ status: 'devamsiz', kaynak: 'tahta' })
    expect(await durumu(AYSE)).toEqual({ status: 'gec', kaynak: 'tahta' })
  })

  test('düzeltme: PIN 15 dakika hatırlanır; bağlantı yokken bekler, gelince gönderilir', async ({ page }) => {
    // Tahta anahtarı önceki testin tarayıcısında kaldı: yeniden bağla (yeni kodla)
    const yeni = 'TEST-6789'
    await svc.from('tahta').update({ kod_hash: createHash('sha256').update(yeni.replace('-', '')).digest('hex'), kod_son: new Date(Date.now() + 600_000).toISOString() }).eq('class_id', sinif)
    await page.goto(URL)
    await page.getByLabel('Eşleştirme kodu').fill(yeni)
    await page.getByRole('button', { name: 'Bağla' }).click()
    await expect(page.getByText(/8\/A yoklaması alındı · \d\d:\d\d · Murat Kaya/)).toBeVisible()
    await page.getByRole('button', { name: '8/A yoklamasını düzelt' }).click()
    await expect(page.getByRole('button', { name: 'Elif Yıldız: Gelmedi' })).toBeVisible()
    await page.getByRole('button', { name: 'Elif Yıldız: Gelmedi' }).click()
    await page.getByRole('button', { name: 'Yoklamayı gönder' }).click()
    for (const r of pin) await page.getByRole('dialog').getByRole('button', { name: r, exact: true }).click()
    await expect(page.getByRole('heading', { name: '8/A yoklaması kaydedildi' })).toBeVisible()
    expect(await durumu(ELIF)).toBeNull()

    // 15 dk içinde ikinci düzeltme: PIN sorulmaz. Bu sefer bağlantı yok → bekler.
    await page.route('**/rest/v1/rpc/tahta_yoklama_gonder', (r) => r.abort())
    await page.getByRole('button', { name: 'Düzelt' }).click()
    await page.getByRole('button', { name: 'Elif Yıldız: Geldi' }).click()
    await page.getByRole('button', { name: 'Yoklamayı gönder' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(page.getByRole('heading', { name: '8/A yoklaması bekliyor' })).toBeVisible()
    await expect(page.getByText(/8\/A yoklaması \(\d\d:\d\d\) bu tahtada bekliyor/)).toBeVisible()
    await shot(page, 'tahta-uyg-4-bekliyor', false)
    expect(await durumu(ELIF)).toBeNull()

    await page.unroute('**/rest/v1/rpc/tahta_yoklama_gonder')
    await expect(page.getByRole('heading', { name: '8/A yoklaması gönderildi' })).toBeVisible({ timeout: 30_000 })
    await expect(page.getByText(/bu tahtada bekliyor/)).toHaveCount(0)
    expect(await durumu(ELIF)).toEqual({ status: 'devamsiz', kaynak: 'tahta' })
  })

  test('telefonla QR onayı: PIN olmadan, yalnız öğretmen onaylar, kod tek kullanımlık', async ({ page, browser }) => {
    const yeni = 'TEST-QRAB'
    await svc.from('attendance').delete().in('student_id', [ELIF, AYSE]).eq('day', bugun)
    await svc.from('tahta').update({ kod_hash: createHash('sha256').update(yeni.replace('-', '')).digest('hex'), kod_son: new Date(Date.now() + 600_000).toISOString() }).eq('class_id', sinif)
    await page.setViewportSize({ width: 1366, height: 768 })
    await page.goto(URL)
    await page.getByLabel('Eşleştirme kodu').fill(yeni)
    await page.getByRole('button', { name: 'Bağla' }).click()
    await page.getByRole('button', { name: /8\/A yoklamasını (al|düzelt)/ }).click()
    await page.getByRole('button', { name: 'Hepsi geldi' }).click()
    await page.getByRole('button', { name: 'Elif Yıldız: Geldi' }).click()
    await page.getByRole('button', { name: 'Yoklamayı gönder' }).click()
    const pinEkrani = page.getByRole('dialog', { name: '8/A yoklamasını gönder' })
    await expect(pinEkrani.getByRole('heading', { name: 'Telefonla onayla' })).toBeVisible()
    await expect(pinEkrani.getByRole('button', { name: 'Vazgeç' })).toBeVisible() // PIN tuşları yerinde
    const qr = pinEkrani.getByRole('img', { name: 'Telefonla okutulacak onay kodu' })
    await expect(qr).toBeVisible()
    await expect(pinEkrani.getByRole('status')).toHaveText('Telefondan onay bekleniyor…')
    await axe(page, 'tahta QR onayı')
    await shot(page, 'tahta-uyg-5-qr', false)
    const adres = (await qr.getAttribute('data-adres'))!
    const yol = new globalThis.URL(adres).pathname
    expect(yol).toMatch(/^\/t\/[A-HJ-NP-Z2-9]{4}(-[A-HJ-NP-Z2-9]{4}){3}$/)

    // Veli hesabı okutursa onaylayamaz
    const veli = await browser.newContext()
    const vp = await veli.newPage()
    await vp.goto(yol)
    await vp.getByLabel('E-posta').fill(DEMO.veli[0])
    await vp.getByLabel('Şifre', { exact: true }).fill(DEMO.veli[1])
    await vp.getByRole('button', { name: 'Giriş yap' }).last().click()
    await expect(vp.getByRole('alert')).toContainText('Bu işlem için yetkin yok')
    await veli.close()
    expect(await durumu(ELIF)).toBeNull()

    // Öğretmen: bağlantı giriş sonrasında da açık kalır; listeyi görür, onaylar
    const ogr = await browser.newContext({ viewport: { width: 390, height: 844 } })
    const op = await ogr.newPage()
    await op.goto(yol)
    await op.getByLabel('E-posta').fill(DEMO.matematik[0])
    await op.getByLabel('Şifre', { exact: true }).fill(DEMO.matematik[1])
    await op.getByRole('button', { name: 'Giriş yap' }).last().click()
    await expect(op.getByRole('heading', { name: '8/A yoklamasını onaylıyor musun?' })).toBeVisible()
    const ozet = op.getByRole('region', { name: 'Yoklama özeti' })
    await expect(ozet.getByRole('listitem')).toHaveCount(1)
    await expect(ozet.getByRole('listitem')).toContainText('Elif Yıldız')
    await expect(ozet.getByRole('listitem')).toContainText('Gelmedi')
    await axe(op, 'telefon onay')
    await shot(op, 'tahta-uyg-6-telefon-onay', false)
    await op.getByRole('button', { name: 'Onayla ve gönder' }).click()
    await expect(op.getByRole('heading', { name: '8/A yoklaması gönderildi' })).toBeVisible()

    // Tahta sonucu kendisi alır
    await expect(page.getByRole('heading', { name: '8/A yoklaması kaydedildi' })).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText(/Murat Kaya/)).toBeVisible()
    expect(await durumu(ELIF)).toEqual({ status: 'devamsiz', kaynak: 'tahta' })
    const o = (await svc.from('yoklama_oturum').select('yontem, profile_id').eq('class_id', sinif).eq('day', bugun).single()).data
    expect(o).toEqual({ yontem: 'qr', profile_id: MAT })

    // Aynı kod ikinci kez kullanılamaz
    await op.goto(yol)
    await expect(op.getByRole('alert')).toContainText('tarafından onaylandı')
    await expect(op.getByRole('button', { name: 'Onayla ve gönder' })).toHaveCount(0)
    await ogr.close()
  })

  test('idare tahtayı kaldırınca program yeniden kod ister', async ({ page }) => {
    const yeni = 'TEST-ABCD'
    await svc.from('tahta').update({ kod_hash: createHash('sha256').update(yeni.replace('-', '')).digest('hex'), kod_son: new Date(Date.now() + 600_000).toISOString() }).eq('class_id', sinif)
    await page.goto(URL)
    await page.getByLabel('Eşleştirme kodu').fill(yeni)
    await page.getByRole('button', { name: 'Bağla' }).click()
    await expect(page.getByText('Bu tahta: 8/A tahtası')).toBeVisible()
    await svc.from('tahta').delete().eq('class_id', sinif)
    await page.reload()
    await expect(page.getByText('Bu tahtanın okulla bağlantısı kaldırılmış.')).toBeVisible()
    await expect(page.getByLabel('Eşleştirme kodu')).toBeVisible()
  })
})
