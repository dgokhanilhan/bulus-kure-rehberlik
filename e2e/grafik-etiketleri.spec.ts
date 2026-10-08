import { test, expect } from '@playwright/test'
import { service, login, DEMO, shot } from './helpers'
const svc = service()
let originals: { id: string; name: string }[] = []
test.beforeAll(async () => {
  originals = (await svc.from('exams').select('id,name').eq('exam_type', 'LGS')).data ?? []
  for (const [i, e] of originals.entries()) {
    const { error } = await svc.from('exams').update({ name: `Çok uzun deneme adı: gelişim ve değerlendirme sınavı ${i + 1}` }).eq('id', e.id)
    expect(error).toBeNull()
  }
})
test.afterAll(async () => {
  for (const e of originals) await svc.from('exams').update({ name: e.name }).eq('id', e.id)
})
test('uzun deneme adları masaüstü ve telefonda çakışmaz; tam ad ve tıklama korunur', async ({ page }) => {
  await login(page, ...DEMO.veli)
  await expect(page.getByRole('navigation', { name: 'Ana menü' })).toBeVisible()
  await page.goto('/ozet')
  const chart = page.locator('svg[aria-label^="Toplam net:"]').first()
  await expect(chart).toBeVisible()
  expect(await chart.locator('text.lbl').count()).toBeGreaterThanOrEqual(5)
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 844 })
    const bounds = await chart.evaluate(svg => {
      const labels = [...svg.querySelectorAll('text.lbl')].map(t => (t as SVGGraphicsElement).getBBox())
      return { width: (svg as SVGSVGElement).viewBox.baseVal.width, labels: labels.map(b => ({ left: b.x, right: b.x + b.width })) }
    })
    expect(bounds.labels[0]!.left).toBeGreaterThanOrEqual(0)
    expect(bounds.labels.at(-1)!.right).toBeLessThanOrEqual(bounds.width)
    for (let i = 1; i < bounds.labels.length; i++) expect(bounds.labels[i]!.left).toBeGreaterThan(bounds.labels[i - 1]!.right)
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow).toBeLessThanOrEqual(1)
  }
  const point = chart.getByRole('button').first()
  await expect(point).toHaveAttribute('aria-label', /Çok uzun deneme adı: gelişim ve değerlendirme sınavı/)
  await point.click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.getByRole('dialog').getByRole('button', { name: 'Kapat', exact: true }).last().click()
  await shot(page, 'grafik-uzun-adlar-telefon')
})
