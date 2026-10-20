// Öğrenciler → sınıf → Veli toplantısı: özet (sıralama yok), gözlem formu kaydı, PDF (tek öğrenci ve tüm sınıf).
import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { DEMO, login, service, shot } from './helpers'

const TARIH = '2090-11-21'
test.afterAll(async () => {
  await service().from('veli_toplanti_formlari').delete().eq('toplanti_tarihi', TARIH)
})

test('veli toplantısı: öğrenci özeti, gözlem formu kaydı, PDF', async ({ page }) => {
  test.setTimeout(120_000)
  const svc = service()
  await login(page, ...DEMO.rehber)
  await page.getByRole('link', { name: 'Öğrenciler', exact: true }).click()
  await page.getByLabel('Sınıf').selectOption('8/B')
  await page.getByRole('button', { name: 'Veli toplantısı' }).click()
  await expect(page.getByRole('heading', { name: '8/B · Veli toplantısı' })).toBeVisible()
  await page.locator('#vtTarih').fill(TARIH)
  const kart = page.getByTestId('vt-kart')
  await expect(kart).toContainText('Deneme gelişimi')
  await expect(kart).not.toContainText(/sıra|sınıf ortalaması/i)
  const ad = (await kart.locator('h2').innerText()).trim()
  await kart.getByRole('group', { name: 'Ödevlerini düzenli yapıyor' }).getByRole('button', { name: 'Evet' }).click()
  await kart.getByRole('group', { name: 'Ek kaynak çözüyor' }).getByRole('button', { name: 'Kısmen' }).click()
  await page.getByLabel('Görüşmeye katılan').fill('Anne')
  await page.getByLabel('Birlikte alınan kararlar').fill('Haftada 3 gün 40 paragraf sorusu.')
  await expect(page.getByText('Kaydedilmemiş değişiklik var.')).toBeVisible()
  // Animasyon bitmeden ölçülen yarı saydam metin yanlış kontrast uyarısı verir (diğer testlerdeki gibi)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.waitForTimeout(300)
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
  expect(axe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id)).toEqual([])
  await shot(page, 'veli-toplantisi')
  await page.getByRole('button', { name: 'Kaydet ve sonraki öğrenci' }).click()
  await expect(page.getByText('Form kaydedildi.')).toBeVisible()
  await expect(page.getByTestId('vt-ogrenci').filter({ hasText: ad })).toContainText('dolduruldu')
  await expect(kart.locator('h2')).not.toHaveText(ad)
  const row = (await svc.from('veli_toplanti_formlari').select('gozlemler, katilan, kararlar, students!inner(full_name)').eq('toplanti_tarihi', TARIH).eq('students.full_name', ad).single()).data!
  expect(row).toMatchObject({ gozlemler: { odev: 'evet', kaynak: 'kismen' }, katilan: 'Anne', kararlar: 'Haftada 3 gün 40 paragraf sorusu.' })
  // Önceki öğrenciye dönünce kayıtlı form yüklenir
  await page.getByTestId('vt-ogrenci').filter({ hasText: ad }).click()
  await expect(page.getByLabel('Birlikte alınan kararlar')).toHaveValue('Haftada 3 gün 40 paragraf sorusu.')
  await expect(kart.getByRole('group', { name: 'Ödevlerini düzenli yapıyor' }).getByRole('button', { name: /Evet/ })).toHaveAttribute('aria-pressed', 'true')
  const tek = page.waitForEvent('download')
  await page.getByRole('button', { name: "Bu öğrencinin PDF'i" }).click()
  expect((await tek).suggestedFilename()).toMatch(/^veli-toplantisi-8-B-.+\.pdf$/)
  const hepsi = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Tüm sınıf PDF' }).click()
  const dosya = await hepsi
  expect(dosya.suggestedFilename()).toBe('veli-toplantisi-8-B.pdf')
  await dosya.saveAs('e2e-artifacts/veli-toplantisi-8-B.pdf')
  await page.getByRole('button', { name: 'Öğrenciler' }).first().click()
  await expect(page.getByRole('heading', { name: 'Öğrenciler', exact: true })).toBeVisible()
})

test('veli öğrenci listesinde veli toplantısı formunu açamaz', async ({ page }) => {
  await login(page, ...DEMO.veli)
  await page.goto('/ogrenciler?sinif=8%2FA&gorunum=veli-toplantisi')
  await expect(page.getByRole('heading', { name: /Veli toplantısı/ })).toHaveCount(0)
})
