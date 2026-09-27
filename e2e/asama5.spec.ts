// Aşama 5 · §7 Sınıflar ve etüt, okul ayarları (Bugün kuralları), erişilebilirlik (axe).
import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { DEMO, expectNotification, login, loginAdmin, logout, resetAdminMfa, service, shot } from './helpers'

test.describe.serial('§7 Sınıflar ve etüt', () => {
  test('7.1 8/B · Matematik → en zor konu → yanlış yapanlar → öğrenciye git', async ({ page }) => {
    await login(page, ...DEMO.rehber)
    await page.getByRole('link', { name: 'Sınıflar' }).click()
    await page.getByRole('group', { name: 'Şube' }).getByRole('button', { name: '8/B' }).click()
    await page.getByRole('group', { name: 'Ders' }).getByRole('button', { name: 'Matematik' }).click()
    await expect(page.getByRole('table', { name: '8/B Matematik konu doğru oranları' })).toBeVisible()
    await shot(page, '23-siniflar')
    const hard = page.getByTestId('hard-topic').first()
    const title = (await hard.locator('b').innerText()).trim()
    await hard.click()
    const dlg = page.getByRole('dialog', { name: title })
    const first = dlg.getByTestId('konu-student').first()
    const name = (await first.locator('b').innerText()).trim()
    await first.click()
    await expect(page).toHaveURL(/\/ogrenciler\/.+sekme=konular/)
    await expect(page.getByRole('heading', { name })).toBeVisible()
  })

  test('7.2 etüt: yalnız Cumartesiler, 09–13 arası 1 saatlik dilimler, dolu saat seçilemez, konu eklenir, şubeye bildirim', async ({ page }) => {
    await login(page, ...DEMO.rehber)
    await page.getByRole('link', { name: 'Sınıflar' }).click()
    await page.getByRole('button', { name: 'Etüt planla' }).click()
    const dlg = page.getByRole('dialog', { name: 'Etüt planla' })
    const days = await dlg.getByLabel('Cumartesi').locator('option').allInnerTexts()
    expect(days).toHaveLength(4)
    for (const d of days) expect(d).toMatch(/Cumartesi$/)
    await expect(dlg.getByRole('group', { name: 'Saat' }).getByRole('button')).toHaveText(['09.00–10.00', '10.00–11.00', '11.00–12.00', '12.00–13.00'])
    await dlg.getByLabel('Başka konu ekle').fill('E2E karışık tekrar')
    await dlg.getByRole('button', { name: 'Konu ekle' }).click()
    await expect(dlg.getByRole('group', { name: 'Konular' }).getByRole('button', { name: /E2E karışık tekrar/ })).toHaveAttribute('aria-pressed', 'true')
    await dlg.getByRole('button', { name: 'Planla ve bildir' }).click()
    await expect(dlg.getByRole('alert')).toHaveText('Bir saat seç.')
    await dlg.getByRole('button', { name: '11.00–12.00' }).click()
    await shot(page, '24-etut-planla', false)
    await dlg.getByRole('button', { name: 'Planla ve bildir' }).click()
    await expect(page.getByText('Etüt planlandı · şubeye bildirim gitti')).toBeVisible()
    await page.getByText('Planlanan etütler').click()
    await expect(page.getByTestId('etut-row').filter({ hasText: '11.00–12.00' })).toContainText('E2E karışık tekrar')

    // aynı gün aynı saat artık dolu
    await page.getByRole('button', { name: 'Etüt planla' }).click()
    await expect(page.getByRole('dialog', { name: 'Etüt planla' }).getByRole('button', { name: '11.00–12.00 · dolu' })).toBeDisabled()
    await page.keyboard.press('Escape')
    await logout(page)

    await login(page, ...DEMO.veli) // Elif 8/A
    await expectNotification(page, /^Cumartesi etüdü: .* 11\.00–12\.00 · Matematik · .*E2E karışık tekrar/)
    await page.getByText('Cumartesi etütleri').click()
    await expect(page.getByText(/11\.00–12\.00/).first()).toBeVisible()
  })
})

test.describe.serial('Okul ayarları', () => {
  test('yönetici Bugün eşiğini değiştirir → Bugün listesi yeniden hesaplanır; işlem kaydı görünür', async ({ page }) => {
    await resetAdminMfa()
    await loginAdmin(page)
    await page.getByRole('link', { name: 'Bugün' }).click()
    const before = Number((await page.getByRole('heading', { name: /^Bugün \d+ öğrenciye bakmalısın\.$/ }).innerText()).match(/\d+/)![0])
    await page.getByRole('button', { name: /^Profil:/ }).click()
    await page.getByRole('menuitem', { name: 'Okul ayarları' }).click()
    await page.getByLabel('Düşüş eşiği (net)').fill('50')
    await page.getByLabel('Kalıcı hata (deneme sayısı)').fill('50')
    await page.getByLabel('Gelişim eşiği (net)').fill('50')
    await page.getByRole('button', { name: 'Kaydet' }).click()
    await expect(page.getByText('Ayarlar kaydedildi')).toBeVisible()
    await page.getByText('İşlem kayıtları').click()
    await expect(page.getByTestId('audit-row').filter({ hasText: 'Okul ayarlarını değiştirdi' }).first()).toBeVisible()
    await shot(page, '25-okul-ayarlari')
    await page.getByRole('link', { name: 'Bugün' }).click()
    const after = Number((await page.getByRole('heading', { name: /^Bugün \d+ öğrenciye bakmalısın\.$/ }).innerText()).match(/\d+/)![0])
    expect(after).toBeLessThan(before)
    await service().from('schools').update({ settings: {} }).eq('id', '00000000-0000-4000-8000-000000000001')
  })
})

async function axe(page: Page, label: string) {
  // Giriş animasyonu (saydamlık) ölçümü bozmasın: hareket azaltılmış ve animasyon bitmiş hâl denetlenir.
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.waitForTimeout(300)
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
  const bad = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
  expect(bad.map((v) => `${label}: ${v.id} (${v.nodes.length}) ${v.nodes[0]?.target}`)).toEqual([])
}

test.describe('Erişilebilirlik (axe, WCAG 2 AA: ciddi/kritik ihlal yok)', () => {
  test('giriş ve kayıt', async ({ page }) => {
    await page.goto('/')
    await axe(page, 'giriş')
    await page.getByRole('button', { name: 'Kayıt ol' }).click()
    await axe(page, 'kayıt')
  })
  test('rehber ekranları', async ({ page }) => {
    await login(page, ...DEMO.rehber)
    await expect(page.getByRole('heading', { name: /öğrenciye bakmalısın/ })).toBeVisible()
    await axe(page, 'bugün')
    for (const [link, check] of [
      ['Öğrenciler', /Öğrenciler/],
      ['Denemeler', /Denemeler/],
      ['Sınıflar', /Sınıflar/],
    ] as const) {
      await page.getByRole('link', { name: link }).click()
      await expect(page.getByRole('heading', { name: check }).first()).toBeVisible()
      await axe(page, link)
    }
    await page.goto('/ogrenciler/00000000-0000-4000-8001-000000001184')
    await expect(page.getByRole('tablist')).toBeVisible()
    await axe(page, 'öğrenci dosyası')
  })
  test('veli ekranları ve klavye ile menü', async ({ page }) => {
    await login(page, ...DEMO.veli)
    await expect(page.getByRole('heading', { name: "Elif'in durumu" })).toBeVisible()
    await axe(page, 'veli özet')
    // Klavye: Tab ile menüye ulaşılır, Enter ile sayfa değişir
    const link = page.getByRole('navigation', { name: 'Ana menü' }).getByRole('link', { name: 'Görevler' })
    await link.focus()
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/\/gorevler$/)
    await axe(page, 'veli görevler')
  })
})
