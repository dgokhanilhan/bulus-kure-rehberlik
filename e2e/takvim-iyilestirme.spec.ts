// Takvim iyileştirmeleri: birikimli sınıf seçimi, çakışma uyarısı, sınıf filtresi, liste görünümü + Excel, aylık afiş PDF.
import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { DEMO, login, service } from './helpers'

const AD = 'E2E Takvim'
const gun = (n: number) => new Date(Date.now() + 3 * 3600_000 + n * 86400_000).toISOString().slice(0, 10)
const tarih = gun(2)
const temizle = async () => {
  await service().from('calendar_events').delete().like('title', `${AD}%`)
}
test.beforeAll(async () => {
  await temizle()
  const svc = service()
  const okul = (await svc.from('profiles').select('school_id').eq('email', DEMO.rehber[0]).single()).data!.school_id
  const cls = (await svc.from('classes').select('id, name').eq('school_id', okul)).data!
  const id = (n: string) => cls.find((c) => c.name === n)!.id
  const { error } = await svc.from('calendar_events').insert([
    {
      school_id: okul,
      title: `${AD} 8 yazılı`,
      type: 'yazili',
      starts_on: tarih,
      ends_on: tarih,
      target: 'sinif',
      class_id: id('8/A'),
      class_ids: [id('8/A'), id('8/B')],
    },
    { school_id: okul, title: `${AD} 6 gezi`, type: 'gezi', starts_on: tarih, ends_on: gun(3), target: 'sinif', class_id: id('6/A'), class_ids: [id('6/A')] },
  ])
  expect(error).toBeNull()
})
test.afterAll(temizle)
test.describe.configure({ mode: 'serial' })

test('sınıf seçimi birikimli; aynı gün aynı sınıf uyarısı çıkar', async ({ page }) => {
  await login(page, ...DEMO.rehber)
  await expect(page).toHaveURL(/\/bugun$/)
  await page.goto('/takvim')
  await page.getByRole('button', { name: 'Etkinlik ekle', exact: true }).click()
  const dlg = page.getByRole('dialog', { name: 'Etkinlik ekle', exact: true })
  await dlg.getByLabel('Kimin için').selectOption('sinif')
  const sekiz = dlg.getByRole('button', { name: /^8\. sınıflar/ })
  const alti = dlg.getByRole('button', { name: /^6\. sınıflar/ })
  await sekiz.click()
  await expect(sekiz).toHaveAttribute('aria-pressed', 'true')
  await alti.click()
  await expect(dlg.getByRole('checkbox', { name: '8/A', exact: true })).toBeChecked()
  await expect(dlg.getByRole('checkbox', { name: '6/A', exact: true })).toBeChecked()
  await sekiz.click()
  await expect(dlg.getByRole('checkbox', { name: '8/A', exact: true })).not.toBeChecked()
  await expect(dlg.getByRole('checkbox', { name: '6/A', exact: true })).toBeChecked()
  await dlg.getByRole('checkbox', { name: '8/B', exact: true }).check()
  await dlg.getByLabel('Başlangıç').fill(tarih)
  const uyari = dlg.getByTestId('cakisma')
  await expect(uyari).toContainText(`${AD} 8 yazılı`)
  await expect(uyari).toContainText(`${AD} 6 gezi`)
  const axe = await new AxeBuilder({ page }).include('.modal').withTags(['wcag2a', 'wcag2aa']).analyze()
  expect(axe.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')).toEqual([])
  await dlg.getByRole('button', { name: 'Vazgeç', exact: true }).click()
})

test('liste görünümü sınıfa göre süzülür, Excel ve aylık afiş iner', async ({ page }) => {
  await login(page, ...DEMO.rehber)
  await expect(page).toHaveURL(/\/bugun$/)
  await page.goto('/takvim')
  const afis = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Afiş indir (PDF)' }).click()
  expect((await afis).suggestedFilename()).toMatch(/^Takvim-.+-\d{4}\.pdf$/)
  await page.getByRole('button', { name: 'Liste', exact: true }).click()
  await expect(page).toHaveURL(/gorunum=liste/)
  const satir = page.getByTestId('liste-satir')
  await expect(satir.filter({ hasText: `${AD} 8 yazılı` })).toContainText('8/A, 8/B')
  await expect(satir.filter({ hasText: `${AD} 6 gezi` })).toBeVisible()
  await page.getByLabel('Sınıf', { exact: true }).selectOption('8')
  await expect(satir.filter({ hasText: `${AD} 6 gezi` })).toHaveCount(0)
  await expect(satir.filter({ hasText: `${AD} 8 yazılı` })).toBeVisible()
  const dl = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Excel indir' }).click()
  expect((await dl).suggestedFilename()).toMatch(/\.xlsx$/)
})

test('veli ekranında sınıf filtresi ve afiş düğmesi yok', async ({ page }) => {
  await login(page, ...DEMO.veli)
  await expect(page).toHaveURL(/\/panel$/)
  await page.goto('/takvim')
  await expect(page.getByRole('heading', { name: 'Takvim' })).toBeVisible()
  await expect(page.getByLabel('Sınıf', { exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Afiş indir (PDF)' })).toHaveCount(0)
})

test('telefonda gün seçilince etkinlikler adıyla listelenir; düğmeler ekrana sığar', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await login(page, ...DEMO.rehber)
  await expect(page).toHaveURL(/\/bugun$/)
  await page.goto('/takvim')
  if (tarih.slice(0, 7) !== gun(0).slice(0, 7)) await page.getByRole('button', { name: 'Sonraki ay' }).click()
  const g = page.locator(`[data-testid=mcal-gun][data-date="${tarih}"]`)
  await g.click()
  await expect(g).toHaveAttribute('aria-pressed', 'true')
  const liste = page.getByRole('region', { name: 'Seçili gün' })
  await expect(liste.getByTestId('mgun-oge').filter({ hasText: `${AD} 8 yazılı` })).toBeVisible()
  await expect(liste.getByTestId('mgun-oge').filter({ hasText: `${AD} 6 gezi` })).toContainText('Gezi')
  expect((await g.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await expect(page.getByRole('button', { name: 'Afiş indir (PDF)' })).toBeVisible()
  // Kart açılış animasyonu bitmeden ölçülen kontrast yanlış hata verir (sonsuz animasyonlar beklenmez).
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getComputedTiming().endTime !== Infinity)
        .map((a) => a.finished.catch(() => null)),
    ),
  )
  const axe = await new AxeBuilder({ page }).include('.mcal').include('.mgun').include('.caltool').withTags(['wcag2a', 'wcag2aa']).analyze()
  expect(axe.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')).toEqual([])
})
