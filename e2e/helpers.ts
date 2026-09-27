import { expect, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { generateSync } from 'otplib'

export const DEMO = {
  admin: ['admin@buluskure.k12.tr', 'Admin123!'],
  rehber: ['rehber@buluskure.k12.tr', 'Rehber123!'],
  matematik: ['matematik@buluskure.k12.tr', 'Mat12345!'],
  veli: ['ayse.yildiz@ornek.com', 'Veli1234!'],
  ogrenci: ['elif.yildiz@ornek.com', 'Ogrenci123!'],
  bekleyen: ['mert.demir@ornek.com', 'Ogrenci123!'],
} as const

export const service = () =>
  createClient(process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

export const shot = (page: Page, name: string, fullPage = true) => page.screenshot({ path: `e2e-artifacts/${name}.png`, fullPage, animations: 'disabled' })

export async function login(page: Page, email: string, password: string) {
  await page.goto('/')
  await page.getByLabel('E-posta').fill(email)
  await page.getByLabel('Şifre', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Giriş yap' }).last().click()
}

/** Çıkış: profil kartına tıkla → "Çıkış yap". */
export async function logout(page: Page) {
  await page.getByRole('button', { name: /^Profil:/ }).click()
  await page.getByRole('menuitem', { name: 'Çıkış yap' }).click()
  await expect(page.getByRole('button', { name: 'Giriş yap' }).last()).toBeVisible()
}

export const menu = (page: Page) => page.getByRole('navigation', { name: 'Ana menü' }).getByRole('link')

/** Admin'in mevcut TOTP faktörlerini siler: bir sonraki girişte QR kurulumu açılır (yalnız yerel). */
export async function resetAdminMfa() {
  const svc = service()
  const { data } = await svc.from('profiles').select('id').eq('email', DEMO.admin[0]).single()
  const { data: list } = await svc.auth.admin.mfa.listFactors({ userId: data!.id })
  for (const f of list?.factors ?? []) await svc.auth.admin.mfa.deleteFactor({ userId: data!.id, id: f.id })
}

/** Bir önceki kodla çakışmasın diye yeni 30 sn dilimini bekleyip kod üretir. */
let lastCode = ''
export async function totpCode(secret: string) {
  let code = generateSync({ secret })
  while (code === lastCode) {
    await new Promise((r) => setTimeout(r, 1000))
    code = generateSync({ secret })
  }
  lastCode = code
  return code
}

/** Admin girişi: gerekirse QR kurulumu, sonra kod. Kurulumda görülen anahtar döner. */
export async function loginAdmin(page: Page, secret?: string): Promise<string> {
  await login(page, ...DEMO.admin)
  return completeMfa(page, secret)
}

/** TOTP ekranındaki oturumu doğrular (kurulum ekranındaysa anahtarı sayfadan okur). */
export async function completeMfa(page: Page, secret?: string): Promise<string> {
  await expect(page.getByText('İki adımlı doğrulama')).toBeVisible()
  const secretEl = page.getByTestId('totp-secret')
  const verifyText = page.getByText('“Buluş Küre” hesabının 6 haneli kodunu yaz')
  await expect(secretEl.or(verifyText)).toBeVisible()
  let s = secret ?? ''
  if (await secretEl.isVisible()) s = (await secretEl.innerText()).replace(/\s/g, '')
  if (!s) throw new Error('Admin TOTP anahtarı bilinmiyor; önce resetAdminMfa() çağır.')
  await page.getByLabel('Kod').fill(await totpCode(s))
  await page.getByRole('button', { name: 'Doğrula ve gir' }).click()
  await expect(page.getByRole('link', { name: /Onaylar/ })).toBeVisible()
  return s
}

export const ELIF = '00000000-0000-4000-8001-000000001184'
export const KEREM = '00000000-0000-4000-8001-000000001201'

/** Zili açıp bildirimde metni arar, paneli kapatır. */
export async function expectNotification(page: Page, text: string | RegExp) {
  await page.getByRole('button', { name: /^Bildirimler/ }).click()
  const panel = page.getByRole('dialog', { name: 'Bildirimler' })
  await expect(panel.getByText(text).first()).toBeVisible()
  await page.keyboard.press('Escape')
}

export async function openStudent(page: Page, sid: string, tab?: string) {
  // Girişin tamamlanmasını bekle (yoksa sayfa değişimi oturum isteğini keser).
  await expect(page.getByRole('navigation', { name: 'Ana menü' })).toBeVisible()
  await page.goto(`/ogrenciler/${sid}${tab ? `?sekme=${tab}` : ''}`)
  await expect(page.getByRole('tablist', { name: 'Öğrenci dosyası' })).toBeVisible()
}
