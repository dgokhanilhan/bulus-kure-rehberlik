// Veli davet kampanyası (0103): yönetici öğrenciye özel kod hazırlar (QR kart PDF / WhatsApp), veli /v/<kod> ile kaydolur,
// kayıt Onaylar'a öğrencisi seçili düşer. Kod 2 kez kullanılır; kayıt kapalıyken de geçerli kodla veli kaydı alınır.
import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { createClient } from '@supabase/supabase-js'
import { DEMO, login, loginAdmin, resetAdminMfa, service, shot } from './helpers'

const svc = service()
const SCHOOL = '00000000-0000-4000-8000-000000000001'
const AYSE = '00000000-0000-4000-8001-000000001185' // 8/A Ayşe Çelik (velisi bağlı değil)
const E1 = 'davet.anne@ornek.com'
const E2 = 'davet.baba@ornek.com'
const E3 = 'davet.ucuncu@ornek.com'
const E4 = 'davet.yok@ornek.com'
const anon = () => createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } })
const uye = (email: string, davet?: string) =>
  anon().auth.signUp({
    email,
    password: 'Veli1234!',
    options: {
      data: {
        school: 'bulus-kure', consent_version: 'KVKK-1.3', acik_riza_version: 'ACIK-RIZA-1.0', full_name: 'Deneme Veli', role: 'veli',
        declared: { childName: 'Ayşe Ç.', childClass: '8/A', relation: 'Baba' }, ...(davet ? { davet } : {}),
      },
    },
  })

async function axe(page: Page, label: string) {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.waitForTimeout(300)
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
  const bad = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
  expect(bad.map((v) => `${label}: ${v.id} (${v.nodes.length}) ${v.nodes[0]?.target}`)).toEqual([])
}
async function temizle() {
  const { data } = await svc.from('profiles').select('id').in('email', [E1, E2, E3, E4])
  for (const p of data ?? []) await svc.auth.admin.deleteUser(p.id)
  await svc.from('veli_davet').delete().eq('student_id', AYSE)
  await svc.from('school_settings').delete().eq('school_id', SCHOOL).eq('key', 'kayit.acik')
}
let kod = ''
let sir = ''

test.describe.serial('Veli davet kampanyası', () => {
  test.beforeAll(async () => {
    await temizle()
    await resetAdminMfa()
  })
  test.afterAll(temizle)

  test('yönetici: sınıf bazlı kapsam, kart PDF, WhatsApp mesajı yalnız ilk adla', async ({ page }) => {
    sir = await loginAdmin(page)
    await page.goto('/yonetim?sekme=veli_davet')
    await expect(page.getByRole('heading', { name: 'Veli daveti (QR · WhatsApp)' })).toBeVisible()
    const tablo = page.getByRole('table')
    await tablo.getByRole('button', { name: /8\/A/ }).click()
    const liste = page.getByRole('list', { name: '8/A öğrencileri' })
    await expect(liste.getByRole('listitem').filter({ hasText: 'Elif Yıldız' })).toContainText('veli bağlı')
    const ayse = liste.getByRole('listitem').filter({ hasText: 'Ayşe Çelik' })
    await expect(ayse).toContainText('Davet hazırlanmadı')
    await axe(page, 'veli daveti')

    const indir = page.waitForEvent('download')
    await ayse.getByRole('button', { name: 'Ayşe Çelik için kart indir' }).click()
    const dosya = await indir
    expect(dosya.suggestedFilename()).toBe('veli-davet-karti-Ayşe-Çelik.pdf')
    await dosya.saveAs('e2e-artifacts/veli-davet-karti.pdf')
    await expect(ayse).toContainText(/Kod [A-HJ-NP-Z2-9]{5}-[A-HJ-NP-Z2-9]{5}/)
    await expect(ayse).toContainText('kart')
    const d = (await svc.from('veli_davet').select('kod, kullanim, kart_at').eq('student_id', AYSE).single()).data!
    expect(d.kod).toMatch(/^[A-HJ-NP-Z2-9]{10}$/)
    expect(d.kart_at).not.toBeNull()
    kod = d.kod

    await page.context().route(/wa\.me|whatsapp\.com/, (r) => r.fulfill({ body: 'ok' }))
    const acilan = page.waitForEvent('popup')
    await ayse.getByRole('button', { name: "Ayşe Çelik için WhatsApp'ta paylaş" }).click()
    const wa = await acilan
    await expect.poll(() => wa.url()).toContain('wa.me')
    const metin = new URL(wa.url()).searchParams.get('text') ?? ''
    expect(metin).toContain('Ayşe adına veli hesabınızı')
    expect(metin).not.toContain('Çelik')
    expect(metin).toContain(`/v/${kod.slice(0, 5)}-${kod.slice(5)}`)
    await wa.close()
    await expect(ayse).toContainText('WhatsApp')
    await shot(page, 'veli-davet-1-yonetim')
  })

  test('veli kod sayfası: kısaltılmış ad, kayıt, Onaylar\'da öğrencisi seçili', async ({ page, browser }) => {
    // Geçersiz kod
    await page.goto('/v/AAAAA-AAAAA')
    await expect(page.getByRole('alert')).toContainText('Bu davet kodu bulunamadı')

    await page.goto(`/v/${kod.slice(0, 5)}-${kod.slice(5)}`)
    await expect(page.getByRole('heading', { name: 'Ayşe Ç. · 8/A için veli hesabı' })).toBeVisible()
    await expect(page.getByText('Çelik')).toHaveCount(0)
    await axe(page, 'veli davet kayıt')
    await shot(page, 'veli-davet-2-kayit', false)
    await page.getByLabel('Yakınlığınız').selectOption('Anne')
    await page.getByLabel('Adınız soyadınız').fill('Deneme Anne')
    await page.getByLabel('E-posta').fill(E1)
    await page.getByLabel('Şifre', { exact: true }).fill('Veli1234!')
    await page.getByLabel('Şifre tekrar').fill('Veli1234!')
    await page.getByRole('checkbox', { name: /Aydınlatma Metni/ }).click()
    await page.getByRole('checkbox', { name: /Açık Rıza|açık rıza|onaylıyorum/i }).click()
    await page.getByRole('button', { name: 'Hesabımı aç' }).click()
    await expect(page.getByRole('heading', { name: 'Kaydınız alındı' })).toBeVisible()

    const p = (await svc.from('profiles').select('id, status, role, declared').eq('email', E1).single()).data!
    expect(p.status).toBe('pending')
    expect(p.declared).toMatchObject({ childName: 'Ayşe Çelik', childClass: '8/A', relation: 'Anne', davetStudent: AYSE })
    expect((await svc.from('veli_davet').select('kullanim').eq('student_id', AYSE).single()).data!.kullanim).toBe(1)

    // Yönetici onaylar: öğrenci önceden seçili
    const adm = await browser.newContext()
    const ap = await adm.newPage()
    await loginAdmin(ap, sir)
    await ap.goto('/onaylar')
    const kart = ap.getByTestId('pending-card').filter({ hasText: 'Deneme Anne' })
    await expect(kart).toContainText('Davet koduyla geldi')
    await expect(kart.getByLabel('Kimin velisi')).toHaveValue(AYSE)
    await kart.getByRole('button', { name: 'Onayla' }).click()
    await expect(ap.getByText('Deneme Anne onaylandı')).toBeVisible()
    const l = (await svc.from('parent_links').select('student_id, relation').eq('parent_id', p.id)).data
    expect(l).toEqual([{ student_id: AYSE, relation: 'Anne' }])
    await adm.close()
  })

  test('kod 2 kez kullanılır; kayıt kapalıyken kodla veli kaydı alınır, kodsuz alınmaz', async () => {
    await svc.from('school_settings').upsert({ school_id: SCHOOL, key: 'kayit.acik', value: false }, { onConflict: 'school_id,key' })
    expect((await uye(E4)).error).not.toBeNull()
    const ikinci = await uye(E2, kod)
    expect(ikinci.error).toBeNull()
    expect((await svc.from('veli_davet').select('kullanim').eq('student_id', AYSE).single()).data!.kullanim).toBe(2)
    expect((await uye(E3, kod)).error).not.toBeNull()
    const b = (await anon().rpc('veli_davet_bilgi', { p_kod: kod })).data
    expect(b).toEqual({ gecerli: false, neden: 'dolu' })
  })

  test('öğretmen ve veli davet listesini göremez', async ({ page }) => {
    const ogr = anon()
    await ogr.auth.signInWithPassword({ email: DEMO.matematik[0], password: DEMO.matematik[1] })
    expect((await ogr.rpc('veli_davet_ozet')).error?.code).toBe('42501')
    expect((await ogr.rpc('veli_davet_hazirla', { p_students: [AYSE] })).error?.code).toBe('42501')
    await login(page, ...DEMO.veli)
    await page.goto('/yonetim?sekme=veli_davet')
    await expect(page.getByRole('heading', { name: 'Veli daveti (QR · WhatsApp)' })).toHaveCount(0)
  })
})
