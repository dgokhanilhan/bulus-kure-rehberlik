// Öğretmen yalnız atandığı sınıfları görür (0023); çok çocuklu veli: öğrenci seçimi, çıkış yapmadan değiştirme, LGS kartı, yenileme,
// tarayıcı kaydı değiştirilerek yetki kazanılamaz; iki rollü hesap: öğretmen modunda yalnız öğretmen kapsamı, veli modunda çocuk seçimi.
import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { DEMO, ELIF, KEREM, login, logout, menu, service, shot } from './helpers'

async function axe(page: Page, label: string) {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.waitForTimeout(300)
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
  const bad = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
  expect(bad.map((v) => `${label}: ${v.id} (${v.nodes.length}) ${v.nodes[0]?.target}`)).toEqual([])
}
const svc = service()
const SCHOOL = '00000000-0000-4000-8000-000000000001'
const stamp = Date.now() % 100000
const PASS = 'Kapsam123!'
const V = { email: `e2e-ucocuk-${stamp}@ornek.com`, id: '' }
const T = { email: `e2e-ogrveli-${stamp}@ornek.com`, id: '' }
let S6 = ''
const PICK = 'Hangi öğrenci için devam etmek istersiniz?'
const lgsCard = (page: Page) => page.locator('section[data-card="lgs"]')
const profil = (page: Page) => page.getByRole('button', { name: /^Profil:/ })

async function user(u: typeof V, meta: Record<string, unknown>) {
  const { data, error } = await svc.auth.admin.createUser({ email: u.email, password: PASS, email_confirm: true, user_metadata: { school: 'bulus-kure', consent_version: 'v1', ...meta } })
  if (error) throw error
  u.id = data.user.id
  await svc.from('profiles').update({ status: 'approved' }).eq('id', u.id)
}

test.describe.serial('Öğretmen kapsamı ve çok çocuklu veli', () => {
  test.setTimeout(120_000)
  test.beforeAll(async () => {
    const c6 = (await svc.from('classes').select('id').eq('name', '6/A').single()).data!.id
    S6 = (await svc.from('students').insert({ school_id: SCHOOL, full_name: 'Deniz Altı', class_id: c6, class_name: '6/A' }).select('id').single()).data!.id
    await user(V, { role: 'veli', full_name: 'Üç Çocuklu Veli', declared: { childName: 'Elif Yıldız', childClass: '8/A', relation: 'Anne' } })
    await user(T, { role: 'ogretmen', full_name: 'Çift Rollü Öğretmen', branch: 'Fizik' })
    await svc.from('parent_links').insert([
      { parent_id: V.id, student_id: S6, relation: 'Anne' },
      { parent_id: V.id, student_id: ELIF, relation: 'Anne' },
      { parent_id: V.id, student_id: KEREM, relation: 'Anne' },
      { parent_id: T.id, student_id: ELIF, relation: 'Baba' },
      { parent_id: T.id, student_id: S6, relation: 'Baba' },
    ])
    await svc.from('profile_roles').insert({ profile_id: T.id, role: 'veli' })
    await svc.from('classes').update({ homeroom_teacher_id: T.id }).eq('name', '8/C')
  })
  test.afterAll(async () => {
    await svc.from('classes').update({ homeroom_teacher_id: null }).eq('name', '8/C').eq('homeroom_teacher_id', T.id)
    for (const u of [V, T]) if (u.id) await svc.auth.admin.deleteUser(u.id)
    if (S6) await svc.from('students').delete().eq('id', S6)
  })

  test('öğretmen: Öğrenciler yalnız atandığı sınıf; filtre yalnız o sınıflar; başka öğrencinin adresi açılmaz', async ({ page }) => {
    await login(page, ...DEMO.matematik)
    await expect(page.getByRole('navigation', { name: 'Ana menü' })).toBeVisible()
    await page.getByRole('navigation', { name: 'Ana menü' }).getByRole('link', { name: 'Öğrenciler' }).click()
    const rows = page.getByRole('row', { name: /dosyası$/ })
    await expect(rows).toHaveCount(7)
    for (const r of await rows.all()) await expect(r).toContainText('8/A')
    await expect(page.getByLabel('Sınıf').locator('option')).toHaveText(['Tüm öğrencilerim', '8/A'])
    await axe(page, 'öğrenciler (öğretmen)')
    await page.goto(`/ogrenciler/${KEREM}`)
    await expect(page.getByText('Öğrenci bulunamadı.')).toBeVisible()
    await logout(page)
  })

  test('tek çocuklu veli seçim ekranı görmez; profil menüsünde öğrenci değiştir yok', async ({ page }) => {
    await login(page, ...DEMO.veli)
    await expect(page.getByRole('heading', { name: /^Merhaba/ })).toBeVisible()
    await expect(page.getByRole('heading', { name: PICK })).toHaveCount(0)
    await profil(page).click()
    await expect(page.getByTestId('aktif-ogrenci')).toContainText('Elif Yıldız')
    await expect(page.getByRole('menuitemradio')).toHaveCount(0)
    await page.keyboard.press('Escape')
    await logout(page)
  })

  test('üç çocuklu veli: seçim, öğrenci değiştirme, LGS kartı, yenileme, tarayıcı kaydı, çıkış', async ({ page }) => {
    await login(page, V.email, PASS)
    await expect(page.getByRole('heading', { name: PICK })).toBeVisible()
    const kids = page.getByRole('group', { name: 'Öğrenciler' }).getByRole('button')
    await expect(kids).toHaveCount(3)
    await expect(kids).toContainText(['Deniz Altı', 'Elif Yıldız', 'Kerem Aydın'])
    await axe(page, 'öğrenci seçimi')
    await shot(page, 'k1-ogrenci-secimi')
    await kids.filter({ hasText: 'Deniz Altı' }).click()

    // 6. sınıf: LGS kartı yok
    await expect(page.getByRole('heading', { name: /^Merhaba/ })).toBeVisible()
    await expect(page.locator('section[data-card="odev"]')).toBeVisible()
    await expect(lgsCard(page)).toHaveCount(0)

    // Çıkış yapmadan öğrenci değiştir → 8. sınıf: LGS kartı görünür
    await profil(page).click()
    await expect(page.getByTestId('aktif-ogrenci')).toContainText('Deniz Altı · 6/A')
    await expect(page.getByRole('menuitemradio', { name: /Deniz Altı/ })).toHaveAttribute('aria-checked', 'true')
    await shot(page, 'k2-ogrenci-degistir')
    await page.getByRole('menuitemradio', { name: /Elif Yıldız/ }).click()
    await expect(lgsCard(page)).toBeVisible()
    await page.getByRole('navigation', { name: 'Ana menü' }).getByRole('link', { name: 'Okul', exact: true }).click()
    await expect(page.getByRole('heading', { name: "Elif'in okul günü" })).toBeVisible()

    // Yenileme: aktif öğrenci korunur
    await page.reload()
    await expect(page.getByRole('heading', { name: "Elif'in okul günü" })).toBeVisible()

    // 8 → 6: LGS kartı kaybolur
    await page.goto('/panel')
    await profil(page).click()
    await page.getByRole('menuitemradio', { name: /Deniz Altı/ }).click()
    await expect(page.locator('section[data-card="odev"]')).toBeVisible()
    await expect(lgsCard(page)).toHaveCount(0)

    // Tarayıcı kaydına bağlı olmayan öğrenci yazılırsa yok sayılır: seçim ekranı, o öğrenci listede yok
    const yabanci = (await svc.from('students').select('id, full_name').eq('class_name', '8/A').neq('id', ELIF).limit(1).single()).data!
    await page.evaluate(([u, s]) => localStorage.setItem('bk.cocuk', JSON.stringify({ uid: u, sid: s })), [V.id, yabanci.id])
    await page.reload()
    await expect(page.getByRole('heading', { name: PICK })).toBeVisible()
    await expect(page.getByText(yabanci.full_name)).toHaveCount(0)
    await page.getByRole('group', { name: 'Öğrenciler' }).getByRole('button').filter({ hasText: 'Kerem Aydın' }).click()
    await expect(page.getByRole('heading', { name: /^Merhaba/ })).toBeVisible()

    // Çıkış seçimi temizler
    await logout(page)
    expect(await page.evaluate(() => localStorage.getItem('bk.cocuk'))).toBeNull()
    await login(page, V.email, PASS)
    await expect(page.getByRole('heading', { name: PICK })).toBeVisible()
    await page.getByRole('group', { name: 'Öğrenciler' }).getByRole('button').first().click()
    await logout(page)
  })

  test('iki rollü hesap: veli modunda çocuk seçer; öğretmen modunda yalnız öğretmen kapsamı', async ({ page }) => {
    await login(page, T.email, PASS)
    await expect(page.getByRole('heading', { name: 'Nasıl devam etmek istersiniz?' })).toBeVisible()
    await page.getByRole('button', { name: 'Veli olarak devam et' }).click()
    await expect(page.getByRole('heading', { name: PICK })).toBeVisible()
    await page.getByRole('group', { name: 'Öğrenciler' }).getByRole('button').filter({ hasText: 'Elif Yıldız' }).click()
    await expect(lgsCard(page)).toBeVisible()

    // Öğretmen moduna geç: Öğrenciler yalnız 8/C (sınıf öğretmenliği); kendi çocukları (8/A, 6/A) listede yok
    await profil(page).click()
    await page.getByRole('menuitem', { name: 'Rol değiştir: Öğretmen olarak devam et' }).click()
    await expect(menu(page)).toContainText(['Öğrenciler'])
    await page.getByRole('navigation', { name: 'Ana menü' }).getByRole('link', { name: 'Öğrenciler' }).click()
    const rows = page.getByRole('row', { name: /dosyası$/ })
    await expect(rows.first()).toBeVisible()
    for (const r of await rows.all()) await expect(r).toContainText('8/C')
    await expect(page.getByRole('row', { name: 'Elif Yıldız dosyası' })).toHaveCount(0)
    await expect(page.getByRole('row', { name: 'Deniz Altı dosyası' })).toHaveCount(0)

    // Veliye geri: aktif öğrenci korunur
    await profil(page).click()
    await page.getByRole('menuitem', { name: 'Rol değiştir: Veli olarak devam et' }).click()
    await expect(lgsCard(page)).toBeVisible()
    await logout(page)
  })
})
