// Hedef simülatörü (LGS): öğretmen Hedef sekmesinde, öğrenci ve veli Özet → Hedefler altında. Tahmini puan, önerilen dağılım, sıfırla.
import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { DEMO, ELIF, login, logout, openStudent, service, shot } from './helpers'

const YIL = 2093
const sayi = async (page: Page) => Number((await page.getByTestId('hsim-tahmin').innerText()).replace(/\./g, '').replace(',', '.'))

test.beforeAll(async () => {
  const svc = service()
  const s = (await svc.from('students').select('school_id').eq('id', ELIF).single()).data!
  const { data } = await svc
    .from('hedef_programlar')
    .insert({
      school_id: s.school_id,
      sinav: 'LGS',
      yil: YIL,
      kod: 'E2E-SIM-1',
      kurum: 'E2E Simülatör Fen Lisesi',
      il: 'Bartın',
      ilce: 'Merkez',
      taban_puan: 480.5,
      yuzdelik: 1.2,
    })
    .select('id')
    .single()
  await svc.from('ogrenci_hedefleri').insert({ school_id: s.school_id, student_id: ELIF, program_id: data!.id })
})
test.afterAll(async () => {
  const svc = service()
  const ids = ((await svc.from('hedef_programlar').select('id').eq('yil', YIL)).data ?? []).map((x) => x.id)
  if (ids.length) await svc.from('ogrenci_hedefleri').delete().in('program_id', ids)
  await svc.from('hedef_programlar').delete().eq('yil', YIL)
})

test('öğretmen: hedef seçili gelir, önerilen dağılım puanı yükseltir, sıfırla ve kaydırıcı çalışır', async ({ page }) => {
  test.setTimeout(90_000)
  await login(page, ...DEMO.rehber)
  await openStudent(page, ELIF, 'hedef')
  const sim = page.getByTestId('hedef-simulator')
  await expect(sim.getByRole('heading', { name: 'Hedef simülatörü' })).toBeVisible()
  await expect(sim.locator('#hsimHedef')).toContainText('E2E Simülatör Fen Lisesi')
  await expect(sim).toContainText('Tahminidir, resmî LGS puanı değildir.')
  await expect(sim.getByRole('slider').first()).toBeVisible()

  const oneri = await sayi(page)
  await sim.getByRole('button', { name: 'Sıfırla' }).click()
  const sifir = await sayi(page)
  expect(oneri).toBeGreaterThan(sifir)
  await expect(sim.getByTestId('hsim-kalan')).toContainText('↓')

  const k = sim.getByRole('slider').first()
  await k.focus()
  await k.press('ArrowRight')
  await expect.poll(() => sayi(page)).toBeGreaterThan(sifir)
  await sim.getByRole('button', { name: 'Önerilen dağılım' }).click()
  await expect.poll(() => sayi(page)).toBe(oneri)

  await sim.locator('#hsimHedef').selectOption('elle')
  await sim.locator('#hsimPuan').fill('200')
  await expect(sim.getByTestId('hsim-kalan')).toContainText('Hedef tabanına ulaşıyor')

  const axe = await new AxeBuilder({ page }).include('[data-testid="hedef-simulator"]').withTags(['wcag2a', 'wcag2aa']).analyze()
  expect(axe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id)).toEqual([])
  await shot(page, 'hedef-simulator')
  await page.setViewportSize({ width: 375, height: 800 })
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0)
})

test('öğrenci "sen", veli "siz" diliyle simülatörü Özet sayfasında görür', async ({ page }) => {
  await login(page, ...DEMO.ogrenci)
  await expect(page.getByRole('navigation', { name: 'Ana menü' })).toBeVisible()
  await page.goto('/ozet')
  const sim = page.getByTestId('hedef-simulator')
  await expect(sim.getByRole('heading', { name: 'Hedefine nasıl ulaşırsın?' })).toBeVisible()
  await expect(sim).not.toContainText('sınıf')
  await shot(page, 'hedef-simulator-ogrenci')
  await logout(page)
  await login(page, ...DEMO.veli)
  await expect(page.getByRole('navigation', { name: 'Ana menü' })).toBeVisible()
  await page.goto('/ozet')
  await expect(page.getByTestId('hedef-simulator').getByRole('heading', { name: 'Hedefe nasıl ulaşılır?' })).toBeVisible()
})
