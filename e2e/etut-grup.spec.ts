// Gruba etüt (0061): Sınıflar → konu satırı → yanlış yapan öğrenciler → "Bu öğrencilere etüt planla" → öğretmen, Cumartesi,
// ders saati (Etüt programındaki saatlerle) → programa eklenir; Planlanan etütler ve öğrenci dosyası → Etüt'te görünür.
import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { DEMO, login, service } from './helpers'

const svc = service()
let tarih = ''

test.afterAll(async () => {
  if (tarih) await svc.from('etut_gunler').delete().eq('tarih', tarih)
})

test('rehber: konuyu yanlış yapan öğrencilere etüt planlar; etüt programına ve öğrenci dosyasına düşer', async ({ page }) => {
  test.setTimeout(120_000)
  await login(page, ...DEMO.rehber)
  await expect(page.getByRole('navigation', { name: 'Ana menü' })).toBeVisible()
  await page.goto('/siniflar')

  // Isı haritasındaki konu satırı tıklanabilir; en çok zorlanılan konudan öğrenci listesi
  await expect(page.getByTestId('heat-konu').first()).toBeVisible()
  await page.getByTestId('hard-topic').first().click()
  const liste = page.getByRole('dialog')
  const n = await liste.getByTestId('konu-student').count()
  expect(n).toBeGreaterThan(0)
  const ilk = (await liste.getByTestId('konu-student').first().locator('b').innerText()).trim()
  await liste.getByRole('button', { name: 'Bu öğrencilere etüt planla' }).click()

  const dlg = page.getByRole('dialog', { name: 'Etüt planla' })
  await expect(dlg.getByTestId('grup-ogrenciler').getByRole('button')).toHaveCount(n)
  await expect(dlg.getByTestId('grup-ogrenciler')).toContainText(ilk)
  // Öğretmen: sınıfın matematik öğretmeni önerilir
  await expect(dlg.getByLabel('Öğretmen')).toHaveValue(/.+/)
  await dlg.getByLabel('Öğretmen').selectOption({ label: 'Murat Kaya · Matematik' })
  // İkinci Cumartesi (diğer etüt testleriyle çakışmasın)
  tarih = await dlg.getByLabel('Cumartesi').locator('option').nth(1).getAttribute('value') as string
  await dlg.getByLabel('Cumartesi').selectOption(tarih)
  await dlg.getByRole('group', { name: 'Ders saati' }).getByRole('button', { name: /2\. ders/ }).click()
  await expect(dlg.getByRole('group', { name: 'Ders saati' }).getByRole('button', { name: /2\. ders/ })).toHaveAttribute('aria-pressed', 'true')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const ax = await new AxeBuilder({ page }).include('[role="dialog"]').withTags(['wcag2a', 'wcag2aa']).analyze()
  expect(ax.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id)).toEqual([])
  await dlg.getByRole('button', { name: 'Programa ekle' }).click()
  await expect(page.getByText(`${n} öğrenci etüt programına eklendi`, { exact: false })).toBeVisible()

  // Veritabanı: taslak gün, Murat Kaya 2. ders, n öğrenci
  const g = (await svc.from('etut_gunler').select('id, durum').eq('tarih', tarih).eq('kademe', 'ortaokul').single()).data!
  expect(g.durum).toBe('taslak')
  const h = (await svc.from('etut_hucreler').select('ders, teacher_name, tur, etut_ogrenciler(student_name)').eq('gun_id', g.id)).data!
  expect(h).toHaveLength(1)
  expect(h[0]).toMatchObject({ ders: 2, teacher_name: 'Murat Kaya', tur: 'etut' })
  expect(h[0]!.etut_ogrenciler.map((o) => o.student_name)).toContain(ilk)

  // Sınıflar → Planlanan etütler (yeni program)
  await expect(page.getByTestId('etut-row').filter({ hasText: '2. ders' }).filter({ hasText: 'Murat Kaya' }).first()).toBeAttached()
  // Öğrenci dosyası → Etüt
  const sid = (await svc.from('students').select('id').eq('full_name', ilk).single()).data!.id
  await page.goto(`/ogrenciler/${sid}?sekme=etut`)
  const satir = page.getByTestId('ogr-etut').filter({ hasText: '2. ders' }).filter({ hasText: 'Taslak' }).first()
  await expect(satir).toContainText('Murat Kaya')
  await expect(page.getByRole('button', { name: 'Etüt planla' })).toBeVisible()
})
