// Faz F · Yönetici öğretmen/veli hesabı açar; davet e-postasındaki bağlantıyla şifre belirleme ve ilk girişte KVKK onayı;
// "Şifremi unuttum". E-postalar yerel Mailpit'ten okunur.
import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { loginAdmin, logout, resetAdminMfa, service, shot } from './helpers'

async function axe(page: Page, label: string) {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.waitForTimeout(300)
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
  const bad = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
  expect(bad.map((v) => `${label}: ${v.id} (${v.nodes.length}) ${v.nodes[0]?.target}`)).toEqual([])
}
const svc = service()
const MAIL = 'http://127.0.0.1:54324'
const stamp = Date.now()
const T = { name: 'Aylin Ertem', email: `e2e-ogretmen-${stamp}@ornek.com` }
const V = { name: 'Kemal Aydın', email: `e2e-veli-${stamp}@ornek.com` }
const inApp = (page: Page) => expect(page.getByRole('navigation', { name: 'Ana menü' })).toBeVisible()

/** Mailpit'te bu adrese giden son e-postadaki doğrulama bağlantısı. */
async function mailLink(to: string, type: 'invite' | 'recovery'): Promise<string> {
  for (let i = 0; i < 20; i++) {
    const s = await (await fetch(`${MAIL}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`)).json()
    for (const m of s.messages ?? []) {
      const full = await (await fetch(`${MAIL}/api/v1/message/${m.ID}`)).json()
      const href = /href="([^"]*\/verify\?[^"]*)"/.exec(full.HTML ?? '')?.[1]?.replace(/&amp;/g, '&')
      if (href && href.includes(`type=${type}`)) return href
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error(`${to} için ${type} e-postası bulunamadı`)
}

test.describe.serial('Hesap açma (davet)', () => {
  let secret = ''
  test.beforeAll(async () => {
    await resetAdminMfa()
  })
  test.afterAll(async () => {
    for (const e of [T.email, V.email]) {
      const { data } = await svc.from('profiles').select('id').eq('email', e).maybeSingle()
      if (data) await svc.auth.admin.deleteUser(data.id)
    }
  })

  test('yönetici öğretmen ekler: davet bekliyor', async ({ page }) => {
    secret = await loginAdmin(page)
    await page.goto('/yonetim?sekme=ogretmenler')
    await page.getByRole('button', { name: 'Öğretmen ekle' }).click()
    const dlg = page.getByRole('dialog', { name: 'Öğretmen ekle' })
    await dlg.getByLabel('Ad soyad').fill(T.name)
    await dlg.getByLabel('E-posta').fill(T.email)
    await dlg.getByLabel('Branş / görev').selectOption('Fizik')
    await dlg.getByLabel('Sınıf öğretmenliği (isteğe bağlı)').selectOption({ label: '10/A' })
    await dlg.getByRole('button', { name: 'Ders ataması ekle' }).click()
    await dlg.getByLabel('1. atama sınıf').selectOption({ label: '10/A' })
    await dlg.getByLabel('1. atama ders').selectOption({ label: 'Fizik' })
    await axe(page, 'öğretmen ekle')
    await dlg.getByRole('button', { name: 'Davet gönder' }).click()
    const row = page.getByTestId('teacher-row').filter({ hasText: T.name })
    await expect(row).toContainText('Davet bekliyor')
    await expect(row).toContainText('Fizik')
    await shot(page, 'f1-ogretmen-ekle')
  })

  test('öğretmen davet bağlantısıyla şifre belirler, KVKK onaylar, uygulamaya girer', async ({ page }) => {
    await page.goto(await mailLink(T.email, 'invite'))
    await expect(page.getByRole('heading', { name: 'Şifreni belirle' })).toBeVisible()
    await axe(page, 'şifre belirle')
    await page.getByLabel('Yeni şifre (en az 8 karakter)').fill('Fizik12345!')
    await page.getByLabel('Yeni şifre tekrar').fill('Fizik12345!')
    await page.getByRole('button', { name: 'Şifreyi kaydet' }).click()
    await expect(page.getByRole('heading', { name: 'Hoş geldin, Aylin' })).toBeVisible()
    await axe(page, 'KVKK onayı')
    await expect(page.getByRole('button', { name: 'Devam et' })).toBeDisabled()
    await page.getByRole('checkbox', { name: /Kişisel Verilerin Korunması Hakkında Aydınlatma Metni’ni okudum/ }).click()
    await page.getByRole('button', { name: 'Devam et' }).click()
    await inApp(page)
    await expect(page.getByRole('link', { name: 'Ödevler' })).toBeVisible()
    await page.getByRole('link', { name: 'Ödevler' }).click()
    await page.getByRole('button', { name: 'Ödev ver' }).click()
    await expect(page.getByRole('dialog', { name: 'Ödev ver' }).locator('#hCls option')).toHaveText(['10/A'])
  })

  test('yönetici veli ekler, öğrencisine bağlanır; davet bekliyor kalkar mı', async ({ page }) => {
    await loginAdmin(page, secret)
    await page.goto('/yonetim?sekme=ogretmenler')
    await expect(page.getByTestId('teacher-row').filter({ hasText: T.name })).not.toContainText('Davet bekliyor')
    await page.goto('/yonetim?sekme=veliler')
    await page.getByRole('button', { name: 'Veli ekle' }).click()
    const dlg = page.getByRole('dialog', { name: 'Veli ekle' })
    await dlg.getByLabel('Ad soyad').fill(V.name)
    await dlg.getByLabel('E-posta').fill(V.email)
    await dlg.getByLabel('Telefon (isteğe bağlı)').fill('0532 111 22 33')
    await dlg.getByLabel('1. öğrenci', { exact: true }).selectOption({ label: 'Kerem Aydın · 8/B' })
    await dlg.getByLabel('1. öğrenci yakınlık').selectOption('Baba')
    await axe(page, 'veli ekle')
    await dlg.getByRole('button', { name: 'Davet gönder' }).click()
    const card = page.getByTestId('parent-row').filter({ hasText: V.name })
    await expect(card).toContainText('Kerem Aydın · 8/B')
    await expect(card).toContainText('Davet bekliyor')
    await expect(card).toContainText('0532 111 22 33')
    await card.getByRole('button', { name: 'Daveti yeniden gönder' }).click()
    await expect(page.getByText('Davet e-postası yeniden gönderildi')).toBeVisible()
    await logout(page)
  })

  test('şifremi unuttum: bağlantıyla yeni şifre', async ({ page }) => {
    await page.goto('/')
    await page.getByLabel('E-posta').fill(T.email)
    await page.getByRole('button', { name: 'Şifremi unuttum' }).click()
    await expect(page.getByRole('alert')).toContainText('şifre belirleme bağlantısı gönderildi')
    await page.goto(await mailLink(T.email, 'recovery'))
    await expect(page.getByRole('heading', { name: 'Şifreni belirle' })).toBeVisible()
    await page.getByLabel('Yeni şifre (en az 8 karakter)').fill('Yeni12345!')
    await page.getByLabel('Yeni şifre tekrar').fill('Yeni12345!')
    await page.getByRole('button', { name: 'Şifreyi kaydet' }).click()
    await inApp(page)
  })
})
