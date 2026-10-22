// 0059 · Yönetici öğrenci hesabının e-postasını listede ve düzenlemede görür; öğretmene yeni şifre verir (şifre bir kez gösterilir).
import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { createClient } from '@supabase/supabase-js'
import { loginAdmin, resetAdminMfa, service } from './helpers'

const svc = service()
const stamp = Date.now()
const T = { name: 'Selin Giriş', email: `e2e-giris-${stamp}@ornek.com`, password: 'IlkSifre2026' }
let tid = ''
let secret = ''

test.describe.serial('Giriş bilgileri', () => {
  test.beforeAll(async () => {
    await resetAdminMfa()
    const { data, error } = await svc.auth.admin.createUser({
      email: T.email,
      password: T.password,
      email_confirm: true,
      user_metadata: { school: 'bulus-kure', role: 'ogretmen', branch: 'Kimya', full_name: T.name, consent_version: 'v1', acik_riza_version: 'ACIK-RIZA-1.0' },
    })
    if (error) throw error
    tid = data.user!.id
    await svc.from('profiles').update({ status: 'approved' }).eq('id', tid)
  })
  test.afterAll(async () => {
    if (tid) await svc.auth.admin.deleteUser(tid)
  })

  test('öğrenci listesinde ve düzenlemede hesabın e-postası görünür', async ({ page }) => {
    secret = await loginAdmin(page)
    await page.goto('/yonetim?sekme=ogrenciler')
    await page.getByLabel('Ara').fill('Elif Yıldız')
    const row = page.getByTestId('student-row').filter({ hasText: 'Elif Yıldız' })
    await expect(row.getByTestId('student-email')).toHaveText('elif.yildiz@ornek.com')
    await row.getByRole('button', { name: 'Elif Yıldız düzenle' }).click()
    const dlg = page.getByRole('dialog', { name: 'Öğrenciyi düzenle' })
    await expect(dlg.getByRole('region', { name: 'Giriş bilgileri' }).getByLabel('E-posta')).toHaveValue('elif.yildiz@ornek.com')
    await expect(dlg.getByRole('button', { name: 'Yeni şifre ver' })).toBeVisible()
    await expect(dlg.getByText('Mevcut şifre kimseye görünmez.', { exact: false })).toBeVisible()
  })

  test('öğretmene yeni şifre verilir; şifre bir kez gösterilir, öğretmen yeni şifreyle girer', async ({ page }) => {
    await loginAdmin(page, secret)
    await page.goto('/yonetim?sekme=ogretmenler')
    await page.getByRole('button', { name: `${T.name} düzenle` }).click()
    const dlg = page.getByRole('dialog')
    const giris = dlg.getByRole('region', { name: 'Giriş bilgileri' })
    await expect(giris.getByLabel('E-posta')).toHaveValue(T.email)
    await giris.getByRole('button', { name: 'Yeni şifre ver' }).click()
    const yeni = 'OgretmenYeni2026'
    await giris.getByLabel('Yeni şifre').fill(yeni)
    await page.emulateMedia({ reducedMotion: 'reduce' })
    const r = await new AxeBuilder({ page }).include('[role="dialog"]').withTags(['wcag2a', 'wcag2aa']).analyze()
    expect(r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id)).toEqual([])
    await giris.getByRole('button', { name: 'Şifreyi kaydet' }).click()
    await expect(giris.getByTestId('yeni-sifre')).toHaveText(yeni)

    const c = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!, { auth: { persistSession: false } })
    expect((await c.auth.signInWithPassword({ email: T.email, password: yeni })).error).toBeNull()
    expect((await c.auth.signInWithPassword({ email: T.email, password: T.password })).error).not.toBeNull()
  })
})
