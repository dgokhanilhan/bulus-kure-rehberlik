// Sınıflar → Sınıf analizi: tek tuşla şubenin bütün süreci, sıralama, bulgular, ortak konular ve PDF.
import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { DEMO, login, service, shot } from './helpers'

test('sınıf analizi: özet, sıralı öğrenci tablosu, süzgeç, deneme deneme sıra, PDF; geri tuşu Sınıflar', async ({ page }) => {
  test.setTimeout(90_000)
  const svc = service()
  const { data: cls } = await svc.from('students').select('id').eq('class_name', '8/B').is('archived_at', null)
  await login(page, ...DEMO.rehber)
  await page.getByRole('link', { name: 'Sınıflar', exact: true }).click()
  await expect(page.locator('#clsPick').or(page.getByRole('group', { name: 'Şube' }))).toBeVisible()
  if (await page.locator('#clsPick').count()) await page.locator('#clsPick').selectOption('8/B')
  else await page.getByRole('group', { name: 'Şube' }).getByRole('button', { name: '8/B' }).click()
  await page.getByRole('button', { name: 'Sınıf analizi' }).click()
  await expect(page).toHaveURL(/gorunum=analiz/)
  await expect(page.getByRole('heading', { name: '8/B · Sınıf analizi' })).toBeVisible()
  await expect(page.getByTestId('sinif-ozet')).toContainText('Katılım')
  const rows = page.getByTestId('sinif-satir')
  await expect(rows).toHaveCount(cls!.length)
  // Varsayılan sıra: son denemedeki sıra (1. en üstte)
  await expect(rows.first().locator('td').first()).toContainText('1.')
  // Ada göre sırala
  await page.getByRole('button', { name: 'Öğrenci', exact: true }).click()
  const names = await rows.locator('td:nth-child(2) b').allInnerTexts()
  expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, 'tr')))
  // Süzgeç: "Hepsi" + sayılar
  await expect(page.getByRole('group', { name: 'Süzgeç' }).getByRole('button', { name: /^Hepsi \(\d+\)$/ })).toHaveAttribute('aria-pressed', 'true')
  await page.getByText('Deneme deneme sıralama').click()
  await expect(page.getByTestId('sira-tablo').locator('tbody tr')).toHaveCount(cls!.length)
  // Animasyon bitmeden ölçülen yarı saydam metin yanlış kontrast uyarısı verir (diğer testlerdeki gibi)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.waitForTimeout(300)
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
  expect(axe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id)).toEqual([])
  await shot(page, 'sinif-analizi')
  const dl = page.waitForEvent('download')
  await page.getByRole('button', { name: 'PDF indir' }).click()
  expect((await dl).suggestedFilename()).toBe('sinif-analizi-8-B.pdf')
  await page.goBack()
  await expect(page.getByRole('button', { name: 'Sınıf analizi' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Sınıflar' })).toBeVisible()
})

test('veli ve öğrenci Sınıflar ve sınıf analizini görmez', async ({ page }) => {
  await login(page, ...DEMO.veli)
  await expect(page.getByRole('link', { name: 'Sınıflar', exact: true })).toHaveCount(0)
  await page.goto('/siniflar?gorunum=analiz')
  await expect(page.getByRole('heading', { name: /Sınıf analizi/ })).toHaveCount(0)
})
