// Aşama 1 uçtan uca: giriş, kayıt, onay bekliyor, admin TOTP, Onaylar, rol bazlı menü ve yönlendirme.
import { test, expect } from '@playwright/test'
import { DEMO, completeMfa, login, logout, loginAdmin, menu, resetAdminMfa, service, shot } from './helpers'

test.describe('Giriş ve rol bazlı menü', () => {
  test('hatalı şifre anlaşılır mesaj verir', async ({ page }) => {
    await login(page, DEMO.veli[0], 'yanlis-sifre')
    await expect(page.getByRole('alert')).toHaveText('E-posta veya şifre hatalı.')
    await shot(page, '01-giris')
  })

  test('rehber öğretmen: Bugün, Öğrenciler, Denemeler, Sınıflar — Onaylar yok', async ({ page }) => {
    await login(page, ...DEMO.rehber)
    await expect(page).toHaveURL(/\/bugun$/)
    await expect(menu(page)).toHaveText(['Bugün', 'Öğrenciler', 'Denemeler', 'Sınıflar'])
    await page.goto('/onaylar')
    await expect(page).toHaveURL(/\/bugun$/)
    await expect(page.getByText('Rehber öğretmen').first()).toBeVisible()
    await shot(page, '03-rehber')
    // sağ üstte çıkış simgesi yok; çıkış yan menünün en altındaki düğmeyle
    await expect(page.getByRole('banner').getByRole('button', { name: /Çıkış/ })).toHaveCount(0)
    await page.getByRole('navigation', { name: 'Ana menü' }).getByRole('button', { name: 'Çıkış yap' }).click()
    await expect(page.getByRole('button', { name: 'Giriş yap' }).last()).toBeVisible()
  })

  test('branş öğretmeni yalnız Öğrenciler sekmesini görür', async ({ page }) => {
    await login(page, ...DEMO.matematik)
    await expect(page).toHaveURL(/\/ogrenciler$/)
    await expect(menu(page)).toHaveText(['Öğrenciler'])
    for (const p of ['/bugun', '/denemeler', '/siniflar', '/onaylar', '/ozet']) {
      await page.goto(p)
      await expect(page).toHaveURL(/\/ogrenciler$/)
    }
    await expect(page.getByText('Branş öğretmeni · Matematik')).toBeVisible()
    await shot(page, '04-brans-matematik')
  })

  test('veli yalnız kendi sayfalarını görür', async ({ page }) => {
    await login(page, ...DEMO.veli)
    await expect(page).toHaveURL(/\/ozet$/)
    await expect(menu(page)).toHaveText(['Özet', 'Görevler', 'Raporlar', 'Görüşmeler'])
    for (const p of ['/bugun', '/ogrenciler', '/onaylar']) {
      await page.goto(p)
      await expect(page).toHaveURL(/\/ozet$/)
    }
    await shot(page, '05-veli')
  })

  test('öğrenci yalnız kendi sayfalarını görür', async ({ page }) => {
    await login(page, ...DEMO.ogrenci)
    await expect(page).toHaveURL(/\/ozet$/)
    await expect(menu(page)).toHaveText(['Özet', 'Görevler', 'Raporlar', 'Görüşmeler'])
    await page.goto('/ogrenciler')
    await expect(page).toHaveURL(/\/ozet$/)
    await logout(page)
  })

  test('onay bekleyen hesap yalnız bekleme ekranını görür', async ({ page }) => {
    await login(page, ...DEMO.bekleyen)
    await expect(page.getByRole('heading', { name: 'Kaydın onay bekliyor' })).toBeVisible()
    await expect(page.getByRole('navigation', { name: 'Ana menü' })).toHaveCount(0)
    await page.goto('/ogrenciler')
    await expect(page.getByRole('heading', { name: 'Kaydın onay bekliyor' })).toBeVisible()
    await shot(page, '06-onay-bekliyor')
    await page.getByRole('button', { name: 'Çıkış yap' }).click()
    await expect(page.getByRole('button', { name: 'Giriş yap' }).last()).toBeVisible()
  })
})

test.describe.serial('Admin iki adımlı doğrulama ve kayıt onayı', () => {
  let secret = ''

  test('ilk girişte QR ile kurulum, sonra Onaylar sayfası', async ({ page }) => {
    await resetAdminMfa()
    await login(page, ...DEMO.admin)
    await expect(page.getByRole('heading', { name: 'Authenticator kurulumu' })).toBeVisible()
    await expect(page.getByAltText('Authenticator için QR kodu')).toBeVisible()
    // aal1'de admin sayfalarına geçilemez
    await page.goto('/onaylar')
    await expect(page.getByRole('heading', { name: 'Authenticator kurulumu' })).toBeVisible()
    await shot(page, '02-admin-totp-kurulum')

    await page.getByLabel('Kod').fill('000000')
    await page.getByRole('button', { name: 'Doğrula ve gir' }).click()
    await expect(page.getByRole('alert')).toContainText('Kod hatalı')

    secret = await completeMfa(page)
    await expect(menu(page)).toHaveText(['Bugün', 'Öğrenciler', 'Denemeler', 'Sınıflar', 'Yönetim', /Onaylar/])
    await page.getByRole('link', { name: /Onaylar/ }).click()
    await expect(page.getByRole('heading', { name: 'Kayıt onayları' })).toBeVisible()
    await expect(page.getByTestId('pending-card')).toHaveCount(await pendingCount())
    await shot(page, '07-admin-onaylar')
  })

  test('sonraki girişte yalnız kod istenir', async ({ page }) => {
    test.skip(!secret, 'önceki test çalışmadı')
    await login(page, ...DEMO.admin)
    await expect(page.getByRole('heading', { name: 'Authenticator kodu' })).toBeVisible()
    await expect(page.getByTestId('totp-secret')).toHaveCount(0)
    await completeMfa(page, secret)
  })

  test('kayıt → bekleme → admin onayı (veli eşleşmesi önceden seçili) → giriş', async ({ page }) => {
    test.skip(!secret, 'önceki test çalışmadı')
    const email = `e2e-veli-${Date.now()}@ornek.com`
    await page.goto('/')
    await page.getByRole('button', { name: 'Kayıt ol' }).click()
    await page.getByRole('button', { name: 'Veli' }).click()

    // doğrulama mesajları
    await page.getByRole('button', { name: 'Kayıt ol' }).last().click()
    await expect(page.getByRole('alert')).toContainText('Ad soyad gerekli.')

    await page.getByLabel('Ad soyad').fill('Deneme Veli')
    await page.getByLabel('E-posta').fill(email)
    await page.getByLabel('Şifre', { exact: true }).fill('Deneme123!')
    await page.getByLabel('Şifre tekrar').fill('Deneme12!')
    await page.getByLabel('Öğrencinin adı soyadı').fill('kerem aydin')
    await page.getByLabel('Öğrencinin sınıfı').selectOption('8/B')
    await page.getByLabel('Yakınlığın').selectOption('Baba')
    await page.getByRole('button', { name: 'Kayıt ol' }).last().click()
    await expect(page.getByRole('alert')).toHaveText('Şifreler aynı değil. Aydınlatma metnini onayla.')
    await shot(page, '08-kayit-veli')
    await page.getByLabel('Şifre tekrar').fill('Deneme123!')
    await page.getByRole('button', { name: 'Kayıt ol' }).last().click()
    await expect(page.getByRole('alert')).toHaveText('Aydınlatma metnini onayla.')
    await page.getByRole('checkbox', { name: /Aydınlatma metnini/ }).click()
    await page.getByRole('button', { name: 'Kayıt ol' }).last().click()
    await expect(page.getByRole('heading', { name: 'Kaydın alındı' })).toBeVisible()

    // aynı e-posta ikinci kez kaydolamaz
    await page.getByRole('button', { name: 'Giriş ekranına dön' }).click()
    await login(page, email, 'Deneme123!')
    await expect(page.getByRole('heading', { name: 'Kaydın onay bekliyor' })).toBeVisible()
    await page.getByRole('button', { name: 'Çıkış yap' }).click()

    // admin onaylar: "kerem aydin" → Kerem Aydın (8/B) önceden seçili
    await loginAdmin(page, secret)
    await expect(page.getByRole('link', { name: /Onaylar/ }).locator('.badge')).toHaveText(String(await pendingCount()))
    await page.getByRole('link', { name: /Onaylar/ }).click()
    const card = page.getByTestId('pending-card').filter({ hasText: email })
    await expect(card.getByLabel('Kimin velisi')).toHaveValue('00000000-0000-4000-8001-000000001201')
    await card.getByRole('button', { name: 'Onayla' }).click()
    await expect(page.getByText('Deneme Veli onaylandı')).toBeVisible()
    await expect(card).toHaveCount(0)
    await logout(page)

    // veli artık uygulamaya girer ve onay bildirimini görür
    await login(page, email, 'Deneme123!')
    await expect(page).toHaveURL(/\/ozet$/)
    await page.getByRole('button', { name: /Bildirimler, 1 okunmamış/ }).click()
    await expect(page.getByText('Kaydın onaylandı. Hoş geldin!')).toBeVisible()
    await shot(page, '09-veli-onaylandi-bildirim')
  })

  test('admin reddeder → kullanıcı "onaylanmadı" ekranını görür', async ({ page }) => {
    test.skip(!secret, 'önceki test çalışmadı')
    const email = `e2e-ogretmen-${Date.now()}@ornek.com`
    await page.goto('/')
    await page.getByRole('button', { name: 'Kayıt ol' }).click()
    await page.getByRole('button', { name: 'Öğretmen' }).click()
    await page.getByLabel('Ad soyad').fill('Deneme Öğretmen')
    await page.getByLabel('E-posta').fill(email)
    await page.getByLabel('Şifre', { exact: true }).fill('Deneme123!')
    await page.getByLabel('Şifre tekrar').fill('Deneme123!')
    await page.getByLabel('Branşın').selectOption('Fen Bilimleri')
    await page.getByRole('checkbox', { name: /Aydınlatma metnini/ }).click()
    await page.getByRole('button', { name: 'Kayıt ol' }).last().click()
    await expect(page.getByRole('heading', { name: 'Kaydın alındı' })).toBeVisible()

    await loginAdmin(page, secret)
    await page.getByRole('link', { name: /Onaylar/ }).click()
    const card = page.getByTestId('pending-card').filter({ hasText: email })
    await expect(card).toContainText('Branş: Fen Bilimleri · yalnızca Öğrenciler sekmesi')
    await card.getByRole('button', { name: 'Reddet' }).click()
    await expect(page.getByText('Deneme Öğretmen reddedildi')).toBeVisible()
    await logout(page)

    await login(page, email, 'Deneme123!')
    await expect(page.getByRole('heading', { name: 'Hesabına erişim yok' })).toBeVisible()
  })

  test('mobil görünüm: menü üstte yatay', async ({ page }) => {
    test.skip(!secret, 'önceki test çalışmadı')
    await page.setViewportSize({ width: 390, height: 844 })
    await loginAdmin(page, secret)
    await page.getByRole('link', { name: /Onaylar/ }).click()
    await expect(page.getByRole('heading', { name: 'Kayıt onayları' })).toBeVisible()
    await shot(page, '10-admin-onaylar-mobil')
  })
})

async function pendingCount() {
  const { count } = await service().from('profiles').select('id', { count: 'exact', head: true }).eq('status', 'pending')
  return count ?? 0
}
