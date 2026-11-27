// Etkinlik günlüğü (0100): açılış ve sayfa kaydı; yalnız etkinlik_yetki'deki yönetici görür (yetki veritabanında).
import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { createClient } from '@supabase/supabase-js'
import { DEMO, login, loginAdmin, resetAdminMfa, service, shot } from './helpers'

const svc = service()
const ADMIN = '00000000-0000-4000-8003-000000000001'
const MAT = '00000000-0000-4000-8003-000000000003'
const anon = () => createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } })

test.describe.serial('Etkinlik günlüğü', () => {
  test.beforeAll(async () => {
    await resetAdminMfa()
    await svc.from('etkinlik_yetki').upsert({ user_id: ADMIN })
  })
  test.afterAll(async () => {
    await svc.from('etkinlik_yetki').upsert({ user_id: ADMIN })
  })

  test('öğretmenin açılışı ve sayfaları kaydedilir; öğretmen günlüğü göremez', async ({ page }) => {
    const once = new Date().toISOString()
    await login(page, ...DEMO.matematik)
    await expect(page.getByRole('navigation', { name: 'Ana menü' })).toBeVisible()
    await page.goto('/odevler')
    await expect(page.getByRole('heading', { name: 'Ödevler' }).first()).toBeVisible()
    // Kayıtlar toplu gönderilir (birkaç saniye içinde)
    await expect
      .poll(async () => (await svc.from('etkinlik_kaydi').select('tur, sayfa, cihaz').eq('user_id', MAT).gte('at', once)).data ?? [], { timeout: 20_000 })
      .toEqual(expect.arrayContaining([expect.objectContaining({ tur: 'giris', cihaz: 'bilgisayar' }), expect.objectContaining({ tur: 'sayfa', sayfa: '/odevler' })]))

    // Menüde bağlantı yok; adres yazılırsa ana sayfaya döner
    await page.getByRole('button', { name: /^Profil:/ }).click()
    await expect(page.getByRole('menuitem', { name: 'Etkinlik günlüğü' })).toHaveCount(0)
    await page.keyboard.press('Escape')
    await page.goto('/etkinlik')
    await expect(page).not.toHaveURL(/\/etkinlik/)

    // Veritabanı da kapalı: tablo okunamaz, günlük fonksiyonu reddeder
    const c = anon()
    await c.auth.signInWithPassword({ email: DEMO.matematik[0], password: DEMO.matematik[1] })
    const tablo = await c.from('etkinlik_kaydi').select('id').limit(1)
    expect(tablo.error).not.toBeNull()
    const gun = await c.rpc('etkinlik_gun', { p_gun: new Date().toISOString().slice(0, 10) })
    expect(gun.error?.code).toBe('42501')
    // Sahte rol ve geçersiz yol kaydedilmez
    await c.rpc('etkinlik_yaz', { p_olaylar: [{ rol: 'hack', tur: 'sayfa', sayfa: '/x' }, { rol: 'brans', tur: 'sayfa', sayfa: '/<script>' }] })
    const sahte = await svc.from('etkinlik_kaydi').select('id').eq('user_id', MAT).in('sayfa', ['/x', '/<script>'])
    expect(sahte.data ?? []).toHaveLength(0)
  })

  test('yetkili yönetici günü ve kişinin dökümünü görür; yetki kalkınca sayfa kapanır', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await loginAdmin(page)
    await page.getByRole('button', { name: /^Profil:/ }).click()
    await page.getByRole('menuitem', { name: 'Etkinlik günlüğü' }).click()
    await expect(page.getByRole('heading', { name: 'Etkinlik günlüğü' })).toBeVisible()
    await expect(page.getByTestId('etk-gun-baslik')).toContainText('bugün')

    const liste = page.getByTestId('etk-girenler')
    await expect(liste.getByRole('button', { name: /Murat Kaya/ })).toBeVisible()
    await page.getByLabel('İsim ara').fill('murat')
    await expect(liste.getByRole('button')).toHaveCount(1)
    await liste.getByRole('button', { name: /Murat Kaya/ }).click()
    const akis = page.getByTestId('etk-akis')
    await expect(akis).toContainText('Uygulamayı açtı (bilgisayar)')
    await expect(akis).toContainText('Ödevler')
    await expect(akis).toContainText('Şifreyle giriş yaptı') // oturum kaydı (sayfa kaydı başlamadan önceki günler için de)
    await expect(liste.getByRole('button', { name: /Murat Kaya/ })).toContainText('giriş')
    await expect(page.getByTestId('etk-detay')).toContainText('Mesaj, not ve görüşme içerikleri burada görünmez.')

    // Girmeyenler listesi
    await page.getByLabel('İsim ara').fill('')
    await page.getByRole('group', { name: 'Liste' }).getByRole('button', { name: 'Girmeyenler' }).click()
    await expect(page.getByTestId('etk-girmeyenler').or(page.getByText('Bu gün herkes girmiş.'))).toBeVisible()
    // Son görülme şifreyle girişten değil, en yeni etkinlikten (oturum yenileme dahil)
    await expect(page.getByTestId('etk-girmeyenler').getByText(/Son görülme|Hiç girmedi/).first()).toBeVisible()
    await page.getByRole('group', { name: 'Liste' }).getByRole('button', { name: 'Girenler' }).click()

    // Önceki güne geçilir, sonraki gün bugünden ileri gitmez
    await expect(page.getByRole('button', { name: 'Sonraki gün' })).toBeDisabled()
    await page.getByRole('button', { name: 'Önceki gün' }).click()
    await expect(page.getByTestId('etk-gun-baslik')).not.toContainText('bugün')
    await page.getByRole('button', { name: 'Sonraki gün' }).click()

    const axe = await new AxeBuilder({ page }).include('main').withTags(['wcag2a', 'wcag2aa']).analyze()
    expect(axe.violations).toEqual([])
    await shot(page, 'etkinlik-gunlugu')

    // Günlüğü açmak da işlem kaydına yazılır
    const kayit = await svc.from('audit_log').select('id').eq('user_id', ADMIN).eq('action', 'etkinlik_gunlugu').limit(1)
    expect(kayit.data ?? []).toHaveLength(1)

    // Yetki kalkınca (diğer yöneticiler gibi) sayfa ve bağlantı kapanır
    await svc.from('etkinlik_yetki').delete().eq('user_id', ADMIN)
    await page.reload()
    await expect(page).not.toHaveURL(/\/etkinlik/)
    await page.getByRole('button', { name: /^Profil:/ }).click()
    await expect(page.getByRole('menuitem', { name: 'Okul ayarları' })).toBeVisible()
    await expect(page.getByRole('menuitem', { name: 'Etkinlik günlüğü' })).toHaveCount(0)
  })
})
