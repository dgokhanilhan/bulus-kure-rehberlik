// Aşama 5 · §7 Sınıflar ve etüt, okul ayarları (Bugün kuralları), erişilebilirlik (axe).
import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { DEMO, expectNotification, login, loginAdmin, logout, resetAdminMfa, service, shot } from './helpers'

test.describe.serial('§7 Sınıflar ve etüt', () => {
  test('7.1 8/B · Matematik → en zor konu → yanlış yapanlar → öğrenciye git', async ({ page }) => {
    await login(page, ...DEMO.rehber)
    await page.getByRole('link', { name: 'Sınıflar', exact: true }).click()
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

  // Etüt planla (0061): Sınıflar'dan planlanan etüt Cumartesi etüt programına (1–5. ders, programın saatleri) taslak olarak düşer;
  // öğrenci / veli bildirimi rehber öğretmen programı yayınlayınca gider.
  test('7.2 etüt: Cumartesiler, programın 5 ders saati, konu eklenir, programa taslak düşer; yayınlanınca veli görür', async ({ page }) => {
    const svc = service()
    await login(page, ...DEMO.rehber)
    await page.getByRole('link', { name: 'Sınıflar', exact: true }).click()
    await page.getByRole('button', { name: 'Etüt planla' }).click()
    const dlg = page.getByRole('dialog', { name: 'Etüt planla' })
    const days = await dlg.getByLabel('Cumartesi').locator('option').allInnerTexts()
    expect(days).toHaveLength(4)
    for (const d of days) expect(d).toMatch(/Cumartesi/)
    // Diğer etüt testleriyle çakışmasın: üçüncü Cumartesi
    const tarih = (await dlg.getByLabel('Cumartesi').locator('option').nth(2).getAttribute('value'))!
    await svc.from('etut_gunler').delete().eq('tarih', tarih)
    await dlg.getByLabel('Cumartesi').selectOption(tarih)
    const saat = dlg.getByRole('group', { name: 'Ders saati' }).getByRole('button')
    await expect(saat).toHaveCount(5)
    await expect(saat.first()).toContainText('1. ders')
    await expect(saat.first()).toContainText('09:00–09:40')
    await dlg.getByLabel('Ek not / konu (isteğe bağlı)').fill('E2E karışık tekrar')
    await dlg.getByLabel('Öğretmen').selectOption({ label: 'Murat Kaya · Matematik' })
    await dlg.getByRole('button', { name: 'Programa ekle' }).click()
    await expect(dlg.getByRole('alert')).toHaveText('Bir ders saati seç.')
    await saat.nth(2).click()
    await shot(page, '24-etut-planla', false)
    await dlg.getByRole('button', { name: 'Programa ekle' }).click()
    await expect(page.getByText('etüt programına eklendi', { exact: false })).toBeVisible()
    const row = page.getByTestId('etut-row').filter({ hasText: '3. ders' })
    await expect(row).toContainText('E2E karışık tekrar')
    await expect(row).toContainText('Taslak')

    // Aynı öğretmen, aynı ders: "etüdü var" (öğrenciler o etüde eklenir)
    await page.getByRole('button', { name: 'Etüt planla' }).click()
    await dlg.getByLabel('Cumartesi').selectOption(tarih)
    await dlg.getByLabel('Öğretmen').selectOption({ label: 'Murat Kaya · Matematik' })
    await expect(dlg.getByRole('group', { name: 'Ders saati' }).getByRole('button').nth(2)).toContainText('etüdü var')
    await page.keyboard.press('Escape')

    // Etüt programını aç → yayınla → veli (Elif 8/A) görür
    page.once('dialog', (d) => d.accept())
    await page.goto(`/etut?tarih=${tarih}&kademe=ortaokul`)
    await page.getByRole('button', { name: 'Yayınla', exact: true }).click()
    await expect(page.getByText('Program yayınlandı')).toBeVisible()
    const elifte = (await svc.from('etut_ogrenciler').select('id').eq('student_name', 'Elif Yıldız')).data!.length > 0
    await logout(page)
    if (elifte) {
      await login(page, ...DEMO.veli)
      await expectNotification(page, /^Cumartesi etüt programı yayınlandı/)
    }
    await svc.from('etut_gunler').delete().eq('tarih', tarih)
  })
})

test.describe.serial('Okul ayarları', () => {
  test('yönetici Bugün eşiğini değiştirir → Bugün listesi yeniden hesaplanır; işlem kaydı görünür', async ({ page }) => {
    await resetAdminMfa()
    await loginAdmin(page)
    await page.getByRole('link', { name: 'Bugün', exact: true }).click()
    const before = Number((await page.getByRole('heading', { name: /^Bugün \d+ öğrenciye bakmalısın\.$/ }).innerText()).match(/\d+/)![0])
    await page.getByRole('button', { name: /^Profil:/ }).click()
    await page.getByRole('menuitem', { name: 'Okul ayarları' }).click()
    await page.getByLabel('Düşüş eşiği (net)').fill('50')
    await page.getByLabel('Kalıcı hata (deneme sayısı)').fill('50')
    await page.getByLabel('Gelişim eşiği (net)').fill('50')
    await page.getByRole('button', { name: 'Kaydet', exact: true }).click()
    await expect(page.getByText('Ayarlar kaydedildi')).toBeVisible()
    await page.getByText('İşlem kayıtları').click()
    await expect(page.getByTestId('audit-row').filter({ hasText: 'Okul ayarlarını değiştirdi' }).first()).toBeVisible()
    await shot(page, '25-okul-ayarlari')
    await page.getByRole('link', { name: 'Bugün', exact: true }).click()
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
    await expect(page.getByRole('heading', { name: /^Merhaba/ })).toBeVisible()
    await axe(page, 'veli ana sayfa')
    await page.goto('/ozet')
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
