// Aşama 2 bitti şartı: docs/test-senaryolari.md §2 Yetkiler, §3 Görevler, §4 Görüşmeler ve notlar.
import { test, expect } from '@playwright/test'
import { DEMO, ELIF, KEREM, expectNotification, login, loginAdmin, logout, menu, openStudent, resetAdminMfa, service, shot } from './helpers'

test.describe('§2 Yetkiler', () => {
  test('2.1 matematik öğretmeni: yalnız Öğrenciler; dosyada görev/rapor/görüşme düğmesi yok; not ekleyebilir', async ({ page }) => {
    await login(page, ...DEMO.matematik)
    await expect(menu(page)).toHaveText(['Ana sayfa', 'Öğrenciler', 'Ödevler', 'Takvim', /^İletişim/])
    await menu(page).filter({ hasText: 'Öğrenciler' }).click()
    await page.getByRole('row', { name: 'Elif Yıldız dosyası' }).click()
    await expect(page.getByRole('heading', { name: 'Elif Yıldız' })).toBeVisible()
    for (const name of ['Görev ata', 'Görüşme planla', 'Veli raporu', 'Öğretmen raporu']) await expect(page.getByRole('button', { name })).toHaveCount(0)
    await page.getByRole('tab', { name: 'Görevler' }).click()
    await expect(page.getByTestId('task-card').first()).toBeVisible()
    await expect(page.getByRole('button', { name: 'Düzenle' })).toHaveCount(0)

    await page.getByRole('tab', { name: 'Notlar' }).click()
    await expect(page.getByLabel('Kim görsün').locator('option')).toHaveText(['Öğretmenler'])
    await expect(page.getByTestId('note').filter({ hasText: 'Gizli' })).toHaveCount(0)
    await page.getByLabel('Not ekle').fill('E2E: derste soru sorma isteği arttı.')
    await page.getByRole('button', { name: 'Kaydet' }).click()
    await expect(page.getByTestId('note').filter({ hasText: 'E2E: derste soru sorma isteği arttı.' })).toBeVisible()
    await shot(page, '11-brans-ogrenci-dosyasi')
  })

  test('2.2 veli yalnız kendi çocuğunu görür; başka öğrencinin dosyası açılmaz, API boş döner', async ({ page }) => {
    await login(page, ...DEMO.veli)
    await expect(page.getByRole('heading', { name: /^Merhaba/ })).toBeVisible()
    await page.goto(`/ogrenciler/${KEREM}`)
    await expect(page).toHaveURL(/\/panel$/)
    await page.goto('/ozet')
    await expect(page.getByRole('heading', { name: "Elif'in durumu" })).toBeVisible()
    // Tarayıcıdaki velinin oturum anahtarıyla doğrudan API'ye Kerem'in sonuçlarını sor → boş.
    const token = await page.evaluate(() => JSON.parse(localStorage.getItem('bk-auth') ?? '{}').access_token as string)
    const res = await fetch(`${process.env.VITE_SUPABASE_URL}/rest/v1/exam_results?student_id=eq.${KEREM}`, {
      headers: { apikey: process.env.VITE_SUPABASE_ANON_KEY!, Authorization: `Bearer ${token}` },
    })
    const rows = await res.json()
    expect(rows).toEqual([])
    await shot(page, '12-veli-ozet')
  })

  test('2.3 rehber öğrenci dosyasında tüm düğmeleri görür', async ({ page }) => {
    await login(page, ...DEMO.rehber)
    await openStudent(page, ELIF)
    await expect(page.getByRole('button', { name: 'Görev ata' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Görüşme planla' })).toBeVisible()
    await expect(page.getByText('Veli bağlı', { exact: false })).toBeVisible()
    await shot(page, '13-rehber-ogrenci-dosyasi')
  })
})

test.describe.serial('§3 Görevler', () => {
  test('3.1 rehber iki görev atar: tekrar eden hata etiketli konu + "Kaydet ve yeni ekle" ile serbest konu, 1 hafta, haftalık', async ({ page }) => {
    await login(page, ...DEMO.rehber)
    await openStudent(page, ELIF, 'gorevler')
    await page.getByRole('button', { name: 'Görev ata' }).first().click()
    const dlg = page.getByRole('dialog', { name: 'Görev ata' })
    const konu = dlg.getByRole('group', { name: 'Konu' }).getByRole('button', { name: /Kareköklü ifadeler/ })
    await expect(konu.getByText(/Tekrar eden hata · \d deneme/)).toBeVisible()
    await konu.click()
    await dlg.getByRole('button', { name: 'Kaydet ve yeni ekle' }).click()
    await expect(page.getByText('Görev atandı')).toBeVisible()

    await dlg.getByLabel('Başka bir konu yaz').fill('E2E karışık deneme testi')
    await dlg.getByRole('button', { name: '1 hafta' }).click()
    await dlg.getByRole('switch', { name: /Her hafta tekrarla/ }).click()
    await shot(page, '14-gorev-ata')
    await dlg.getByRole('button', { name: 'Görevi ata' }).click()
    await expect(dlg).toHaveCount(0)
    const card = page.getByTestId('task-card').filter({ hasText: 'E2E karışık deneme testi' })
    await expect(card).toContainText('Haftalık')
    await expect(page.getByTestId('task-card').filter({ hasText: 'Kareköklü ifadeler' })).toHaveCount(2) // seed + yeni
  })

  test('3.2–3.3 öğrenci iki görevi ve bildirimi görür; +5 soru, Tamamladım → rehbere ve veliye bildirim; haftalık kopya açılır', async ({ page }) => {
    await login(page, ...DEMO.ogrenci)
    await expectNotification(page, /^Yeni görev: E2E karışık deneme testi · 20 soru · son gün .* · her hafta$/)
    await expectNotification(page, /^Yeni görev: Kareköklü ifadeler/)
    await menu(page).getByText('Görevler', { exact: true }).click()
    const card = page.getByTestId('task-card').filter({ hasText: 'E2E karışık deneme testi' })
    await card.getByRole('button', { name: '+5 soru' }).click()
    await expect(card).toContainText('5 / 20')
    await card.getByRole('button', { name: 'Tamamladım' }).click()
    await expect(page.getByText('Tebrikler, görev tamam!')).toBeVisible()
    const all = page.getByTestId('task-card').filter({ hasText: 'E2E karışık deneme testi' })
    await expect(all).toHaveCount(2)
    await expect(all.filter({ hasText: 'Tamamlandı' })).toHaveCount(1)
    await expect(all.filter({ hasText: /(?<!\d)0 \/ 20/ })).toHaveCount(1)
    await expectNotification(page, /^Haftalık görevin yenilendi: E2E karışık deneme testi · 20 soru/)
    await shot(page, '15-ogrenci-gorevler')
    await logout(page)

    await login(page, ...DEMO.rehber)
    await expectNotification(page, 'Elif Yıldız görevini tamamladı: E2E karışık deneme testi')
    await logout(page)
    await login(page, ...DEMO.veli)
    await expectNotification(page, 'Elif Yıldız görevini tamamladı: E2E karışık deneme testi')
  })

  test('3.4 son günü geçmiş görev → günlük iş sonrası adminde "Görev aksadı" (bir kez)', async ({ page }) => {
    const svc = service()
    expect((await svc.rpc('gunluk_isler')).error).toBeNull()
    expect((await svc.rpc('gunluk_isler')).data.gecikme_bildirimi).toBe(0)
    await resetAdminMfa()
    await loginAdmin(page)
    await page.getByRole('button', { name: /^Bildirimler/ }).click()
    const panel = page.getByRole('dialog', { name: 'Bildirimler' })
    await expect(panel.getByText(/^Görev aksadı: Ayşe Çelik · Paragrafta ana düşünce \(22\/40, son gün/)).toHaveCount(1)
    await panel.getByText(/^Görev aksadı: Ayşe Çelik/).click()
    await expect(page).toHaveURL(/\/ogrenciler\/.*sekme=gorevler/)
    await expect(page.getByTestId('task-card').filter({ hasText: 'Gecikti' })).toBeVisible()
  })
})

test.describe.serial('§4 Görüşmeler ve notlar', () => {
  test('4.1 rehber "Veli ve öğrenci" görüşmesi planlar → veli ve öğrenciye bildirim', async ({ page }) => {
    await login(page, ...DEMO.rehber)
    await openStudent(page, ELIF)
    await page.getByRole('button', { name: 'Görüşme planla' }).click()
    const dlg = page.getByRole('dialog', { name: 'Görüşme planla' })
    await dlg.getByRole('button', { name: 'Veli ve öğrenci' }).click()
    await dlg.getByLabel('Saat').selectOption('15:30')
    await dlg.getByLabel('Konu / ayrıntı').fill('E2E deneme değerlendirmesi')
    await expect(dlg.getByText('Kaydedince veliye ve öğrenciye bildirim gider.')).toBeVisible()
    await shot(page, '16-gorusme-planla')
    await dlg.getByRole('button', { name: 'Planla ve bildir' }).click()
    await expect(page.getByText(/Görüşme planlandı · bildirim gitti/)).toBeVisible()
    await logout(page)
    for (const who of [DEMO.veli, DEMO.ogrenci]) {
      await login(page, who[0], who[1])
      await expectNotification(page, /^Görüşme planlandı: .* 15:30 · E2E deneme değerlendirmesi$/)
      await logout(page)
    }
  })

  test('4.2 Bugün → Görüşmeler → Değiştir ile saat değişir → ikisine "saat değişti"', async ({ page }) => {
    await login(page, ...DEMO.rehber)
    await page.getByText('Görüşmeler', { exact: true }).click()
    const row = page.getByTestId('today-meeting').filter({ hasText: '15:30' }).filter({ hasText: 'Elif Yıldız' })
    await row.getByRole('button', { name: 'Değiştir' }).click()
    const dlg = page.getByRole('dialog', { name: 'Görüşmeyi değiştir' })
    await dlg.getByLabel('Saat').selectOption('16:30')
    await dlg.getByRole('button', { name: 'Değişikliği kaydet' }).click()
    await expect(page.getByTestId('today-meeting').filter({ hasText: '16:30' })).toBeVisible()
    await shot(page, '17-bugun')
    await logout(page)
    for (const who of [DEMO.veli, DEMO.ogrenci]) {
      await login(page, who[0], who[1])
      await expectNotification(page, /^Görüşme saati değişti: .* 15:30 → .* 16:30$/)
      await logout(page)
    }
  })

  test('4.3 veli "Katılacağım" → rehbere bildirim', async ({ page }) => {
    await login(page, ...DEMO.veli)
    await page.getByRole('link', { name: 'Görüşmeler' }).click()
    const row = page.getByTestId('meeting-row').filter({ hasText: 'E2E deneme değerlendirmesi' })
    await row.getByRole('button', { name: 'Katılacağım' }).click()
    await expect(row).toContainText('Katılım onaylandı')
    await shot(page, '18-veli-gorusmeler')
    await logout(page)
    await login(page, ...DEMO.rehber)
    await expectNotification(page, /^Ayşe Yıldız görüşmeye katılacağını bildirdi: Elif Yıldız · .* 16:30$/)
  })

  test('4.4 "Veli görsün" not → veli bildirimi; "Gizli" not → matematik öğretmeni göremez', async ({ page }) => {
    await login(page, ...DEMO.rehber)
    await openStudent(page, ELIF, 'notlar')
    await page.getByLabel('Not ekle').fill('E2E veliye not: bu hafta çok düzenliydi.')
    await page.getByLabel('Kim görsün').selectOption({ label: 'Veli de görsün' })
    await page.getByRole('button', { name: 'Kaydet' }).click()
    await expect(page.getByTestId('note').filter({ hasText: 'E2E veliye not' })).toContainText('Veli görüyor')
    await page.getByLabel('Not ekle').fill('E2E gizli rehberlik notu')
    await page.getByLabel('Kim görsün').selectOption({ label: 'Yalnız rehberlik ve yönetim' })
    await page.getByRole('button', { name: 'Kaydet' }).click()
    await expect(page.getByTestId('note').filter({ hasText: 'E2E gizli rehberlik notu' })).toContainText('Gizli')
    await logout(page)

    await login(page, ...DEMO.veli)
    await expectNotification(page, 'Öğretmen notu: E2E veliye not: bu hafta çok düzenliydi.')
    await page.goto('/ozet')
    await page.getByText('Öğretmen notları').click()
    await expect(page.getByText('E2E veliye not: bu hafta çok düzenliydi.').first()).toBeVisible()
    await expect(page.getByText('E2E gizli rehberlik notu')).toHaveCount(0)
    await logout(page)

    await login(page, ...DEMO.matematik)
    await openStudent(page, ELIF, 'notlar')
    await expect(page.getByTestId('note').filter({ hasText: 'E2E veliye not' })).toBeVisible()
    await expect(page.getByText('E2E gizli rehberlik notu')).toHaveCount(0)
  })
})
