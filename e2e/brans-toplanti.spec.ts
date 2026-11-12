// Öğrenciler → sınıf → Branş veli toplantısı: öğretmenin kendi dersi için özet, derse özel gözlem formu, PDF'ler ve yetki sınırı.
import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { createClient } from '@supabase/supabase-js'
import { DEMO, login, service, shot } from './helpers'

const TARIH = '2090-11-22'
test.afterAll(async () => {
  await service().from('brans_toplanti_formlari').delete().eq('toplanti_tarihi', TARIH)
})
const oturum = async (kim: readonly [string, string]) => {
  const c = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!, { auth: { persistSession: false } })
  await c.auth.signInWithPassword({ email: kim[0], password: kim[1] })
  return c
}

test('branş veli toplantısı: yalnız kendi dersi, ödev ve deneme özeti, derse özel gözlem formu kaydı, PDF\'ler', async ({ page }) => {
  test.setTimeout(150_000)
  const svc = service()
  await svc.from('brans_toplanti_formlari').delete().eq('toplanti_tarihi', TARIH)
  const { data: ogr } = await svc.from('profiles').select('id').eq('email', DEMO.matematik[0]).single()
  await login(page, ...DEMO.matematik)
  await page.getByRole('link', { name: 'Öğrenciler', exact: true }).click()
  const sinifSec = page.getByLabel('Sınıf')
  // Sınıf listesi öğrenciler yüklenince dolar (yalnız öğretmenin şubeleri)
  await expect.poll(async () => (await sinifSec.locator('option').allInnerTexts()).some((x) => /^\d+\//.test(x))).toBe(true)
  const sinif = (await sinifSec.locator('option').allInnerTexts()).find((x) => /^\d+\//.test(x))!
  await sinifSec.selectOption(sinif)
  // Düğmede öğretmenin branşı yazar; genel veli toplantısı düğmesi de yerinde
  await expect(page.getByRole('button', { name: 'Veli toplantısı', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Branş veli toplantısı · Matematik' }).click()
  await expect(page).toHaveURL(/gorunum=brans-toplantisi/)
  await expect(page.getByRole('heading', { name: `${sinif} · Branş veli toplantısı · Matematik` })).toBeVisible()
  await expect(page.locator('#btDers option:checked')).toHaveText('Matematik')
  await page.locator('#btTarih').fill(TARIH)
  const kart = page.getByTestId('bt-kart')
  await expect(kart.getByTestId('bt-odev')).toContainText('Ödevler')
  await expect(kart.getByTestId('bt-deneme')).toContainText('Denemelerde Matematik')
  // Veliye gidecek sayfa: sıralama, sınıf ortalaması, teknik terim ve etiketleyici ifade yok
  await expect(kart).not.toContainText(/sıra|sınıf ortalaması|OCR|başarısız|yetersiz/i)
  const ad = (await kart.locator('h2').first().innerText()).trim()
  const form = page.getByTestId('bt-form')
  // Ders içi + Matematik'e özel sorular
  await form.getByRole('group', { name: 'Derse etkin katılıyor (söz alıyor, soru soruyor)' }).getByRole('button', { name: 'Evet' }).click()
  await form.getByRole('group', { name: 'Dersin temposuna uyumu' }).getByRole('button', { name: 'Destekle takip ediyor' }).click()
  await form.getByRole('group', { name: 'Çözümünü adım adım yazıyor' }).getByRole('button', { name: 'Kısmen' }).click()
  await form.getByRole('group', { name: 'Yanlışların kaynağı çoğunlukla' }).getByRole('button', { name: 'Konu eksiği' }).click()
  await form.getByLabel('Evde yapmanızı önerdiklerimiz').fill('Her gün 20 soru; yanlışlar deftere yazılsın.')
  await form.getByLabel('Kendime not (veliye verilen çıktıda yer almaz)').fill('E2E iç not')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.waitForTimeout(300)
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
  expect(axe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id)).toEqual([])
  await shot(page, 'brans-toplanti')
  await form.getByRole('button', { name: 'Kaydet', exact: true }).click()
  await expect(page.getByText('Form kaydedildi.')).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Öğrenciler' }).getByRole('button', { name: new RegExp(ad) })).toContainText('dolduruldu')
  const { data: rows } = await svc.from('brans_toplanti_formlari').select('teacher_id, ders, cevaplar, ic_not').eq('toplanti_tarihi', TARIH)
  expect(rows).toHaveLength(1)
  expect(rows![0]).toMatchObject({
    teacher_id: ogr!.id,
    ders: 'Matematik',
    ic_not: 'E2E iç not',
    cevaplar: { katilim: 'evet', tempo: 'destekle', m_adim: 'kismen', m_hata: 'konu', evde: 'Her gün 20 soru; yanlışlar deftere yazılsın.' },
  })
  // Yenilemede form geri gelir
  await page.reload()
  await page.locator('#btTarih').fill(TARIH)
  await expect(page.getByTestId('bt-form').getByRole('group', { name: 'Çözümünü adım adım yazıyor' }).getByRole('button', { name: 'Kısmen' })).toHaveAttribute('aria-pressed', 'true')
  // PDF'ler: öğrenci, yalnız gözlem formu, tüm sınıf, tüm sınıf gözlem formları
  const indir = async (dugme: string, ad: RegExp) => {
    const dl = page.waitForEvent('download')
    await page.getByRole('button', { name: dugme, exact: true }).click()
    const d = await dl
    expect(d.suggestedFilename()).toMatch(ad)
    await d.saveAs(`e2e-artifacts/brans-${dugme.replace(/[^a-zA-Z]+/g, "-")}.pdf`)
  }
  await indir('Bu öğrenci PDF', /^brans-veli-toplantisi-matematik-.+-.+\.pdf$/)
  await indir('Yalnız gözlem formu', /^gozlem-formu-matematik-.+-.+\.pdf$/)
  await indir('Tüm sınıf PDF', /^brans-veli-toplantisi-matematik-[^-]+-[^-]+\.pdf$/)
  await indir('Gözlem formları PDF', /^gozlem-formu-matematik-[^-]+-[^-]+\.pdf$/)
})

test('branş formu: yalnız yazan öğretmen değiştirir; rehberlik okur; veli ve öğrenci göremez; geçersiz cevap reddedilir', async () => {
  const svc = service()
  await svc.from('brans_toplanti_formlari').delete().eq('toplanti_tarihi', TARIH).eq('ders', 'E2E Ders')
  const { data: mat } = await svc.from('profiles').select('id, school_id').eq('email', DEMO.matematik[0]).single()
  const { data: reh } = await svc.from('profiles').select('id').eq('email', DEMO.rehber[0]).single()
  const { data: benim } = await svc.rpc('teacher_classes', { uid: mat!.id })
  const { data: st } = await svc.from('students').select('id, class_id').in('class_id', benim as string[]).is('archived_at', null).limit(1)
  const { data: baska } = await svc.from('students').select('id, class_id').not('class_id', 'in', `(${(benim as string[]).join(',')})`).is('archived_at', null).limit(1)
  const sid = st![0]!.id
  const ogretmen = await oturum(DEMO.matematik)
  const satir = { student_id: sid, school_id: mat!.school_id, ders: 'E2E Ders', toplanti_tarihi: TARIH, cevaplar: { katilim: 'evet' } }
  // Başka öğretmen adına yazılamaz: yazan sunucuda oturum sahibidir
  const ek = await ogretmen.from('brans_toplanti_formlari').insert({ ...satir, teacher_id: reh!.id }).select('teacher_id').single()
  expect(ek.error).toBeNull()
  expect(ek.data!.teacher_id).toBe(mat!.id)
  // Geçersiz cevap biçimi reddedilir
  expect((await ogretmen.from('brans_toplanti_formlari').update({ cevaplar: { katilim: 5 } }).eq('toplanti_tarihi', TARIH).eq('ders', 'E2E Ders')).error).not.toBeNull()
  expect((await ogretmen.from('brans_toplanti_formlari').update({ cevaplar: { 'Kötü Anahtar': 'x' } }).eq('toplanti_tarihi', TARIH).eq('ders', 'E2E Ders')).error).not.toBeNull()
  // Atanmadığı sınıfın öğrencisine form yazamaz
  if (baska?.length) expect((await ogretmen.from('brans_toplanti_formlari').insert({ ...satir, student_id: baska[0]!.id })).error).not.toBeNull()
  // Rehberlik okur ama başkasının formunu değiştiremez
  const rehber = await oturum(DEMO.rehber)
  const okur = await rehber.from('brans_toplanti_formlari').select('cevaplar').eq('toplanti_tarihi', TARIH).eq('ders', 'E2E Ders')
  expect(okur.data).toHaveLength(1)
  await rehber.from('brans_toplanti_formlari').update({ ic_not: 'değişti' }).eq('toplanti_tarihi', TARIH).eq('ders', 'E2E Ders')
  const { data: sonra } = await svc.from('brans_toplanti_formlari').select('ic_not, cevaplar').eq('toplanti_tarihi', TARIH).eq('ders', 'E2E Ders').single()
  expect(sonra).toMatchObject({ ic_not: null, cevaplar: { katilim: 'evet' } })
  // Veli, öğrenci ve oturumsuz kullanıcı hiçbir satır görmez
  for (const kim of [DEMO.veli, DEMO.ogrenci]) {
    const c = await oturum(kim)
    expect((await c.from('brans_toplanti_formlari').select('id')).data ?? []).toHaveLength(0)
  }
  const anon = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!, { auth: { persistSession: false } })
  expect((await anon.from('brans_toplanti_formlari').select('id')).data ?? []).toHaveLength(0)
})

test('rehberlik: branş veli toplantısında dersi içeriden seçer; derse özel sorular değişir', async ({ page }) => {
  await login(page, ...DEMO.rehber)
  await page.getByRole('link', { name: 'Öğrenciler', exact: true }).click()
  await page.getByLabel('Sınıf').selectOption('8/B')
  await page.getByRole('button', { name: 'Branş veli toplantısı', exact: true }).click()
  await expect(page.getByRole('heading', { name: /^8\/B · Branş veli toplantısı/ })).toBeVisible()
  await page.locator('#btDers').selectOption({ label: 'İngilizce' })
  const form = page.getByTestId('bt-form')
  await expect(form.getByRole('group', { name: 'Kelime çalışmasını düzenli yapıyor' })).toBeVisible()
  await expect(form.getByRole('group', { name: 'Çözümünü adım adım yazıyor' })).toHaveCount(0)
  await page.locator('#btDers').selectOption({ label: 'Türkçe' })
  await expect(form.getByRole('group', { name: 'Düzenli kitap okuyor' })).toBeVisible()
  await expect(form.getByLabel('Okuduğu / önerilen kitaplar')).toBeVisible()
})
