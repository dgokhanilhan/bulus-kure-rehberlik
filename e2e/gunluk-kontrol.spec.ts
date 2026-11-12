// Günlük kontrol (0067): öğretmen gerektiğinde eksik işaretler (yoklamadan bağımsız), veli o günün eksiğini kırmızı görür,
// aynı maddenin ay içindeki 3. eksikliğinde veliye uyarı bildirimi gider; yetki sınırı veritabanında.
import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { createClient } from '@supabase/supabase-js'
import { DEMO, login, service, shot } from './helpers'

const ELIF = '00000000-0000-4000-8001-000000001184' // seed: Elif Yıldız, 8/A (velisi Ayşe Yıldız, matematik öğretmeninin sınıfı)
// Uygulamanın todayISO'su gibi yerel tarih (tarayıcı ve test aynı makinede)
const bugun = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
const temizle = async () => {
  const svc = service()
  await svc.from('gunluk_kontrol').delete().eq('student_id', ELIF)
  await svc.from('gunluk_kontrol_gecmis').delete().eq('eski->>student_id', ELIF)
  await svc.from('notifications').delete().like('text', 'Günlük kontrol:%')
}
test.beforeAll(temizle)
test.afterAll(temizle)

const oturum = async (kim: readonly [string, string]) => {
  const c = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!, { auth: { persistSession: false } })
  const { error } = await c.auth.signInWithPassword({ email: kim[0], password: kim[1] })
  expect(error).toBeNull()
  return c
}

test.describe.configure({ mode: 'serial' })

test('3. eksikte veliye uyarı; kayıt taşınamaz, düzeltme/kaldırma geçmişte; veli ve öğrenci yalnız okur', async () => {
  const svc = service()
  const { data: mat } = await svc.from('profiles').select('id').eq('email', DEMO.matematik[0]).single()
  const { data: reh } = await svc.from('profiles').select('id').eq('email', DEMO.rehber[0]).single()
  const { data: veli } = await svc.from('profiles').select('id').eq('email', DEMO.veli[0]).single()
  const ogretmen = await oturum(DEMO.matematik)
  const ekle = (tarih: string, extra: Record<string, unknown> = {}) =>
    ogretmen.from('gunluk_kontrol').insert({ student_id: ELIF, tarih, madde: 'kitap_defter', ...extra }).select('id, teacher_id, sira, veli_uyarildi').single()
  // Başka öğretmen adına yazılamaz; sıra sunucuda hesaplanır
  const a = await ekle('2090-03-03', { teacher_id: reh!.id, sira: 9, veli_uyarildi: true })
  expect(a.error).toBeNull()
  expect(a.data).toMatchObject({ teacher_id: mat!.id, sira: 1, veli_uyarildi: false })
  expect((await ekle('2090-03-05')).data).toMatchObject({ sira: 2, veli_uyarildi: false })
  // Aynı gün aynı madde ikinci kez kaydedilmez
  expect((await ekle('2090-03-05')).error).not.toBeNull()
  // Başka ay ayrı sayılır
  expect((await ekle('2090-02-27')).data).toMatchObject({ sira: 1 })
  const ucuncu = await ekle('2090-03-07', { detay: 'E2E matematik kitabı' })
  expect(ucuncu.data).toMatchObject({ sira: 3, veli_uyarildi: true })
  const { data: bil } = await svc.from('notifications').select('user_id, text, link, type').like('text', 'Günlük kontrol:%')
  expect(bil).toHaveLength(1)
  expect(bil![0]).toMatchObject({ user_id: veli!.id, type: 'gunluk_kontrol', link: { page: 'okul' } })
  expect(bil![0]!.text).toMatch(/^Günlük kontrol: Elif Yıldız bu ay 3\. kez ders kitabı \/ defteri yanında değildi \(07\.03\.2090\)/)
  // Geçersiz madde ve uzun detay reddedilir
  expect((await ogretmen.from('gunluk_kontrol').insert({ student_id: ELIF, tarih: '2090-03-09', madde: 'sac' })).error).not.toBeNull()
  expect((await ekle('2090-03-10', { detay: 'x'.repeat(301) })).error).not.toBeNull()
  // Düzeltmede yalnız detay değişir (öğrenci, gün, madde, sıra taşınamaz); eski hâli geçmişte
  await ogretmen.from('gunluk_kontrol').update({ detay: 'düzeltildi', madde: 'telefon', tarih: '2090-04-01', sira: 1 }).eq('id', ucuncu.data!.id)
  const { data: d } = await svc.from('gunluk_kontrol').select('detay, madde, tarih, sira, veli_uyarildi').eq('id', ucuncu.data!.id).single()
  expect(d).toEqual({ detay: 'düzeltildi', madde: 'kitap_defter', tarih: '2090-03-07', sira: 3, veli_uyarildi: true })
  // Öğretmen geçmişi göremez; rehberlik görür
  expect((await ogretmen.from('gunluk_kontrol_gecmis').select('id')).data ?? []).toHaveLength(0)
  const rehber = await oturum(DEMO.rehber)
  const gec = await rehber.from('gunluk_kontrol_gecmis').select('islem, eski').eq('kayit_id', ucuncu.data!.id)
  expect(gec.data).toHaveLength(1)
  expect(gec.data![0]).toMatchObject({ islem: 'duzeltme', eski: { detay: 'E2E matematik kitabı' } })
  // Rehberlik başkasının kaydını düzeltemez ama kaldırabilir (geçmişe yazılır)
  await rehber.from('gunluk_kontrol').update({ detay: 'rehber' }).eq('id', a.data!.id)
  expect((await svc.from('gunluk_kontrol').select('detay').eq('id', a.data!.id).single()).data!.detay).toBeNull()
  expect((await rehber.from('gunluk_kontrol').delete().eq('id', a.data!.id).select('id')).data).toHaveLength(1)
  expect((await rehber.from('gunluk_kontrol_gecmis').select('islem').eq('kayit_id', a.data!.id)).data).toEqual([{ islem: 'kaldirma' }])
  // Veli ve öğrenci kendi kaydını okur, yazamaz
  for (const kim of [DEMO.veli, DEMO.ogrenci]) {
    const c = await oturum(kim)
    expect(((await c.from('gunluk_kontrol').select('id').eq('student_id', ELIF)).data ?? []).length).toBe(3)
    expect((await c.from('gunluk_kontrol').insert({ student_id: ELIF, tarih: '2090-03-20', madde: 'telefon' })).error).not.toBeNull()
    await c.from('gunluk_kontrol').delete().eq('student_id', ELIF)
    expect(((await c.from('gunluk_kontrol_gecmis').select('id')).data ?? []).length).toBe(0)
  }
  expect((await svc.from('gunluk_kontrol').select('id').eq('student_id', ELIF)).data).toHaveLength(3)
  // Onay bekleyen ve oturumsuz kullanıcı hiçbir satır görmez
  const bekleyen = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!, { auth: { persistSession: false } })
  await bekleyen.auth.signInWithPassword({ email: DEMO.bekleyen[0], password: DEMO.bekleyen[1] })
  expect((await bekleyen.from('gunluk_kontrol').select('id')).data ?? []).toHaveLength(0)
  const anon = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!, { auth: { persistSession: false } })
  expect((await anon.from('gunluk_kontrol').select('id')).data ?? []).toHaveLength(0)
  // Atanmadığı sınıfın öğrencisine kayıt açamaz
  const { data: benim } = await svc.rpc('teacher_classes', { uid: mat!.id })
  const { data: baska } = await svc.from('students').select('id').not('class_id', 'in', `(${(benim as string[]).join(',')})`).is('archived_at', null).limit(1)
  if (baska?.length) expect((await ogretmen.from('gunluk_kontrol').insert({ student_id: baska[0]!.id, tarih: '2090-03-03', madde: 'telefon' })).error).not.toBeNull()
  await temizle()
})

test('öğretmen işaretler ve detay yazar; kayıtlarda görünür; veli Okul sayfasında o günün eksiğini kırmızı görür', async ({ page, browser }) => {
  test.setTimeout(150_000)
  const t = bugun()
  const gun = Number(t.slice(8, 10))
  // Ayın 3'ünden sonraysa aynı ay içinde iki eski kayıt: bugünkü 3. olur ve öğretmen kaydetmeden önce uyarıyı görür
  const ogretmen = await oturum(DEMO.matematik)
  if (gun >= 3)
    for (const g of [1, 2])
      await ogretmen.from('gunluk_kontrol').insert({ student_id: ELIF, tarih: `${t.slice(0, 8)}0${g}`, madde: 'kitap_defter' })

  await login(page, ...DEMO.matematik)
  await page.getByRole('link', { name: 'Öğrenciler', exact: true }).click()
  const sinifSec = page.getByLabel('Sınıf')
  await expect.poll(async () => (await sinifSec.locator('option').allInnerTexts()).includes('8/A')).toBe(true)
  await sinifSec.selectOption('8/A')
  // Mevcut düğmeler yerinde; yeni düğme yanında
  await expect(page.getByRole('button', { name: 'Veli toplantısı', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Günlük kontrol', exact: true }).click()
  await expect(page).toHaveURL(/gorunum=gunluk-kontrol/)
  await expect(page.getByRole('heading', { name: '8/A · Günlük kontrol' })).toBeVisible()
  const satir = page.getByTestId('gk-ogrenci').filter({ hasText: 'Elif Yıldız' })
  const dugme = satir.getByRole('group', { name: 'Elif Yıldız eksikleri' }).getByRole('button', { name: 'Kitap / defter' })
  await dugme.click()
  await expect(dugme).toHaveAttribute('aria-pressed', 'true')
  await satir.getByLabel('Kitap / defter · detay (isteğe bağlı)').fill('E2E Matematik kitabı yanında değildi')
  if (gun >= 3) await expect(satir.getByTestId('gk-uyari-onizleme')).toContainText('Bu ay 3. kez · kaydedince veliye uyarı bildirimi gidecek')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.waitForTimeout(300)
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
  expect(axe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id)).toEqual([])
  await shot(page, 'gunluk-kontrol-ogretmen')
  await page.getByRole('button', { name: /^Kaydet/ }).click()
  await expect(page.getByText(gun >= 3 ? /Kaydedildi\. 1 öğrencinin velisine uyarı bildirimi gitti\./ : /^Kaydedildi\.$/)).toBeVisible()
  const { data: rows } = await service().from('gunluk_kontrol').select('madde, detay, tarih').eq('student_id', ELIF).eq('tarih', t)
  expect(rows).toEqual([{ madde: 'kitap_defter', detay: 'E2E Matematik kitabı yanında değildi', tarih: t }])
  // Kayıtlar görünümü
  await page.getByRole('group', { name: 'Görünüm' }).getByRole('button', { name: 'Kayıtlar' }).click()
  await expect(page.getByTestId('gk-kayit').filter({ hasText: 'E2E Matematik kitabı' })).toContainText('Elif Yıldız')
  // Öğrenci sayfasındaki sekme
  await page.goto(`/ogrenciler/${ELIF}?sekme=gunluk-kontrol`)
  await expect(page.getByTestId('gk-sekme')).toContainText('E2E Matematik kitabı yanında değildi')

  // Veli: Okul sayfasında kart açık gelir, bugünün eksiği kırmızı kutuda
  const ctx = await browser.newContext()
  const vp = await ctx.newPage()
  await login(vp, ...DEMO.veli)
  await vp.getByRole('navigation', { name: 'Ana menü' }).getByRole('link', { name: 'Okul', exact: true }).click()
  const kutu = vp.getByTestId('gk-bugun')
  await expect(kutu).toContainText('Kitap / defter: E2E Matematik kitabı yanında değildi')
  if (gun >= 3) await expect(kutu).toContainText('Bu ay 3. kez · size uyarı bildirimi gönderildi')
  await expect(vp.getByTestId('gk-kart')).not.toContainText(/sıra|sınıf ortalaması|başarısız|yetersiz/i)
  await vp.emulateMedia({ reducedMotion: 'reduce' })
  await vp.waitForTimeout(300)
  const axe2 = await new AxeBuilder({ page: vp }).withTags(['wcag2a', 'wcag2aa']).analyze()
  expect(axe2.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id)).toEqual([])
  await shot(vp, 'gunluk-kontrol-veli')
  await ctx.close()

  // Öğretmen işareti kaldırınca kayıt silinir
  await page.goto('/ogrenciler?sinif=8%2FA&gorunum=gunluk-kontrol')
  const satir2 = page.getByTestId('gk-ogrenci').filter({ hasText: 'Elif Yıldız' })
  const d2 = satir2.getByRole('group', { name: 'Elif Yıldız eksikleri' }).getByRole('button', { name: 'Kitap / defter' })
  await expect(d2).toHaveAttribute('aria-pressed', 'true')
  await d2.click()
  await page.getByRole('button', { name: /^Kaydet/ }).click()
  await expect(page.getByText(/^Kaydedildi\.$/)).toBeVisible()
  await expect.poll(async () => ((await service().from('gunluk_kontrol').select('id').eq('student_id', ELIF).eq('tarih', t)).data ?? []).length).toBe(0)
})
