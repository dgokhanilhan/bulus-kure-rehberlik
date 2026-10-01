// Çoklu rol (0020): yönetici öğretmene veli rolü ekler; iki rollü hesap girişte rolünü seçer, çıkış yapmadan rol değiştirir.
import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { DEMO, login, loginAdmin, logout, menu, resetAdminMfa, service, shot } from './helpers'

async function axe(page: Page, label: string) {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.waitForTimeout(300)
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
  const bad = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
  expect(bad.map((v) => `${label}: ${v.id} (${v.nodes.length}) ${v.nodes[0]?.target}`)).toEqual([])
}
const svc = service()
const stamp = Date.now() % 100000
const T = { name: `Deniz Çiftrol ${stamp}`, email: `e2e-ciftrol-${stamp}@ornek.com`, pass: 'Ciftrol123!', id: '' }
const TEACHER_MENU = ['Ana sayfa', 'Öğrenciler', 'Ödevler', 'Takvim', /^İletişim/]
const FAMILY_MENU = ['Ana sayfa', 'LGS özeti', 'Okul', 'Ödevler', 'Takvim', /^İletişim/, 'Görevler', 'Raporlar', 'Görüşmeler']
const role = (page: Page) => page.getByRole('button', { name: /^Profil:/ })

test.describe.serial('Çoklu rol', () => {
  test.setTimeout(120_000)
  test.beforeAll(async () => {
    await resetAdminMfa()
    const { data, error } = await svc.auth.admin.createUser({
      email: T.email, password: T.pass, email_confirm: true,
      user_metadata: { school: 'bulus-kure', consent_version: 'v1', full_name: T.name, role: 'ogretmen', branch: 'Fizik' },
    })
    if (error) throw error
    T.id = data.user.id
    await svc.from('profiles').update({ status: 'approved' }).eq('id', T.id)
  })
  test.afterAll(async () => {
    if (T.id) await svc.auth.admin.deleteUser(T.id)
  })

  test('yönetici öğretmene veli rolü ekler (öğrenci + yakınlık)', async ({ page }) => {
    await loginAdmin(page)
    await page.goto('/yonetim?sekme=ogretmenler')
    await page.getByRole('button', { name: `${T.name} düzenle` }).click()
    const dlg = page.getByRole('dialog', { name: /bilgilerini düzenle/ })
    const roles = dlg.getByRole('region', { name: 'Roller' })
    await expect(roles).toContainText('✓ Öğretmen')
    await roles.getByRole('button', { name: 'Veli rolü ekle' }).click()
    const add = page.getByRole('dialog', { name: 'Veli rolü ekle' })
    await add.getByLabel('1. öğrenci', { exact: true }).selectOption({ label: 'Kerem Aydın · 8/B' })
    await add.getByLabel('1. öğrenci yakınlık').selectOption('Baba')
    await axe(page, 'rol ekle')
    await shot(page, 'r1-rol-ekle')
    await add.getByRole('button', { name: 'Rolü ekle' }).click()
    await expect(page.getByText(`${T.name}: Veli rolü eklendi`)).toBeVisible()
    await expect(roles).toContainText('✓ Veli')
    await expect(roles).toContainText('Kerem Aydın · 8/B · Baba')
    // Bağlantı varken veli rolü kaldırılamaz: açık uyarı
    await roles.getByRole('button', { name: 'Veli rolünü kaldır' }).click()
    await expect(roles.getByRole('alert')).toContainText('önce 1 öğrenciyle veli bağlantısını kaldır')
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('teacher-row').filter({ hasText: T.name })).toContainText('+ Veli')
    await logout(page)
  })

  test('iki rollü hesap: girişte rol seçimi, rol değiştirme, yenileme ve çıkış', async ({ page }) => {
    await login(page, T.email, T.pass)
    await expect(page.getByRole('heading', { name: 'Nasıl devam etmek istersiniz?' })).toBeVisible()
    await axe(page, 'rol seçimi')
    await shot(page, 'r2-rol-secimi')
    await page.getByRole('button', { name: 'Öğretmen olarak devam et' }).click()
    await expect(menu(page)).toHaveText(TEACHER_MENU)
    await expect(role(page)).toContainText('Branş öğretmeni')

    // Yenileme: seçim korunur
    await page.reload()
    await expect(menu(page)).toHaveText(TEACHER_MENU)

    // Çıkış yapmadan veliye geç
    await role(page).click()
    await shot(page, 'r3-rol-degistir-menu')
    await page.getByRole('menuitem', { name: 'Rol değiştir: Veli olarak devam et' }).click()
    await expect(menu(page)).toHaveText(FAMILY_MENU)
    await expect(role(page)).toContainText('Veli')
    await expect(page).toHaveURL(/\/panel$/)
    await page.getByRole('navigation', { name: 'Ana menü' }).getByRole('link', { name: 'Okul', exact: true }).click()
    await expect(page.getByRole('heading', { name: "Kerem'in okul günü" })).toBeVisible() // yalnız kendi çocuğu
    await page.reload()
    await expect(menu(page)).toHaveText(FAMILY_MENU)

    // Veliden öğretmene geri
    await role(page).click()
    await page.getByRole('menuitem', { name: 'Rol değiştir: Öğretmen olarak devam et' }).click()
    await expect(menu(page)).toHaveText(TEACHER_MENU)

    // Çıkış seçimi temizler: yeni girişte yine sorulur
    await logout(page)
    await login(page, T.email, T.pass)
    await expect(page.getByRole('heading', { name: 'Nasıl devam etmek istersiniz?' })).toBeVisible()
    await page.getByRole('button', { name: 'Veli olarak devam et' }).click()
    await expect(menu(page)).toHaveText(FAMILY_MENU)
    await logout(page)
  })

  test('tarayıcıdaki rol kaydı değiştirilerek rol kazanılamaz', async ({ page }) => {
    // Tek rollü veli kendine "öğretmen" seçimi yazsa da veli ekranında kalır
    await login(page, ...DEMO.veli)
    await expect(menu(page)).toHaveText(FAMILY_MENU)
    const uid = (await svc.from('profiles').select('id').eq('email', DEMO.veli[0]).single()).data!.id
    await page.evaluate((u) => localStorage.setItem('bk.rol', JSON.stringify({ uid: u, role: 'ogretmen' })), uid)
    await page.reload()
    await expect(menu(page)).toHaveText(FAMILY_MENU)
    await expect(page.getByRole('menuitem', { name: /Rol değiştir/ })).toHaveCount(0)
    await page.goto('/ogrenciler')
    await expect(page).toHaveURL(/\/panel$/)
    await logout(page)
  })
})
