// Etüt öğrenci grupları (0062): rehber 8/A ve 8/B'den "8'ler 1. Grup" oluşturur; içe aktarılan Excel'de "SEKİZLER BİRİNCİ GRUP"
// yazan hücre bu gruba bağlanır (grubun öğrencileri etüde yazılır); hücre düzenlemede "Gruptan ekle".
import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { DEMO, login, menu, service } from './helpers'

const svc = service()
const AD = "E2E 8'ler 1. Grup"

test.afterAll(async () => {
  await svc.from('etut_gruplari').delete().like('ad', 'E2E %')
})

test('grup oluşturulur; Excel hücresindeki grup adı tanınır; Gruptan ekle', async ({ page }) => {
  test.setTimeout(120_000)
  await svc.from('etut_gunler').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  await svc.from('etut_gruplari').delete().like('ad', 'E2E %')
  await login(page, ...DEMO.rehber)
  await menu(page).filter({ hasText: 'Etüt' }).click()
  await expect(page.locator('.et-tbl')).toBeVisible()

  // Grup oluştur: 8/A'dan Elif, 8/B'den Kerem
  await page.getByRole('button', { name: 'Grup oluştur' }).click()
  const dlg = page.getByRole('dialog', { name: 'Grup oluştur' })
  await dlg.getByLabel('Grup adı').fill(AD)
  await dlg.getByLabel('Öğrenci ara').fill('Elif Yıldız')
  await dlg.getByRole('group', { name: 'Öğrenciler' }).getByRole('button', { name: /Elif Yıldız/ }).click()
  await dlg.getByLabel('Öğrenci ara').fill('Kerem Aydın')
  await dlg.getByRole('group', { name: 'Öğrenciler' }).getByRole('button', { name: /Kerem Aydın/ }).click()
  await expect(dlg).toContainText('2 öğrenci seçili')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const ax = await new AxeBuilder({ page }).include('[role="dialog"]').withTags(['wcag2a', 'wcag2aa']).analyze()
  expect(ax.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id)).toEqual([])
  await dlg.getByRole('button', { name: 'Kaydet' }).click()
  await expect(page.getByText('Grup oluşturuldu')).toBeVisible()
  await expect(page.getByTestId('etut-gruplari')).toContainText(`${AD} · 2 öğrenci`)

  // Excel: "SEKİZLER BİRİNCİ GRUP" → grup
  const AY = ['OCAK', 'ŞUBAT', 'MART', 'NİSAN', 'MAYIS', 'HAZİRAN', 'TEMMUZ', 'AĞUSTOS', 'EYLÜL', 'EKİM', 'KASIM', 'ARALIK']
  const d = new Date()
  while (d.getDay() !== 6) d.setDate(d.getDate() + 1)
  const { default: ExcelJS } = await import('exceljs')
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet(`${d.getDate()} ${AY[d.getMonth()]}`)
  ws.addRow(['ÖĞRETMEN', null, '09:00-09:40', '09:50-10:30', '10:40-11:20', '11:30-12:10', '12:20-13:00'])
  ws.addRow(['MURAT HOCA', null, 'SEKİZLER BİRİNCİ GRUP\n(Üslü ifadeler)', null, null, null, null])
  await page.getByRole('button', { name: /İçe aktar/ }).click()
  await page.locator('.mwrap input[type=file]').setInputFiles({ name: 'p.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: Buffer.from(await wb.xlsx.writeBuffer()) })
  await page.getByRole('button', { name: 'Oku', exact: true }).click()
  await expect(page.getByLabel(`Grup: ${AD} (2)`)).toBeChecked()
  await expect(page.getByLabel('Konu').first()).toHaveValue('Üslü ifadeler')
  await page.getByRole('button', { name: 'Programa aktar' }).click()
  await page.getByRole('button', { name: 'Kaydet', exact: true }).click()
  await expect(page.getByText('Taslak kaydedildi')).toBeVisible()
  const h = (await svc.from('etut_hucreler').select('ders, konu, etut_ogrenciler(student_name)').eq('ders', 1)).data!
  expect(h[0]!.konu).toBe('Üslü ifadeler')
  expect(h[0]!.etut_ogrenciler.map((o) => o.student_name).sort()).toEqual(['Elif Yıldız', 'Kerem Aydın'])

  // Hücre düzenleme: Gruptan ekle (Murat Kaya 3. ders)
  await page.locator('.et-tbl tr', { hasText: 'Murat Kaya' }).locator('td').nth(3).click()
  const hm = page.getByRole('dialog', { name: /Murat Kaya · 3\. ders/ })
  await hm.getByLabel('Gruptan ekle').selectOption({ label: `${AD} (2)` })
  await expect(hm.locator('.et-sel .chip')).toHaveCount(2)
  await expect(hm.getByLabel('Konu')).toHaveValue(AD)
})

// 0063 paylaşımlı ders: grubun tamamı aynı derste iki öğretmende → tek bilgi satırı; gruptan olmayan çakışma → uyarı;
// Kaydet → "Yine de kaydet" onayı → kaydedilir.
test('paylaşımlı grup dersi bilgi, diğer çakışma uyarı; Yine de kaydet', async ({ page }) => {
  test.setTimeout(120_000)
  await svc.from('etut_gunler').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  await svc.from('etut_gruplari').delete().like('ad', 'E2E %')
  const ids = (await svc.from('students').select('id').in('full_name', ['Elif Yıldız', 'Kerem Aydın'])).data!.map((x) => x.id)
  const school = (await svc.from('schools').select('id').single()).data!.id
  await svc.from('etut_gruplari').insert({ school_id: school, kademe: 'ortaokul', ad: AD, ogrenciler: ids })

  const AY = ['OCAK', 'ŞUBAT', 'MART', 'NİSAN', 'MAYIS', 'HAZİRAN', 'TEMMUZ', 'AĞUSTOS', 'EYLÜL', 'EKİM', 'KASIM', 'ARALIK']
  const d = new Date()
  while (d.getDay() !== 6) d.setDate(d.getDate() + 1)
  const { default: ExcelJS } = await import('exceljs')
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet(`${d.getDate()} ${AY[d.getMonth()]}`)
  ws.addRow(['ÖĞRETMEN', null, '09:00-09:40', '09:50-10:30', '10:40-11:20', '11:30-12:10', '12:20-13:00'])
  ws.addRow(['MURAT HOCA', null, 'SEKİZLER BİRİNCİ GRUP', '8-B\nAyşe', null, null, null])
  ws.addRow(['ESRA HOCA', null, '8. SINIF 1. GRUP', '8-B\nAyşe', null, null, null])

  await login(page, ...DEMO.rehber)
  await menu(page).filter({ hasText: 'Etüt' }).click()
  await expect(page.locator('.et-tbl')).toBeVisible()
  await page.getByRole('button', { name: /İçe aktar/ }).click()
  await page.locator('.mwrap input[type=file]').setInputFiles({ name: 'p.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: Buffer.from(await wb.xlsx.writeBuffer()) })
  await page.getByRole('button', { name: 'Oku', exact: true }).click()
  await page.getByRole('button', { name: 'Programa aktar' }).click()

  const sorun = page.locator('.et-issues')
  await expect(sorun).toContainText(`${AD} 1. derste 2 öğretmende`)
  await expect(sorun).toContainText('paylaşımlı ders')
  await expect(sorun).not.toContainText('Elif Yıldız 1. derste iki etüde')
  await expect(sorun).toContainText('2. derste iki etüde yazılmış')
  await page.getByRole('button', { name: 'Kaydet', exact: true }).click()
  const onay = page.getByRole('dialog', { name: 'Aynı ders saatinde iki etüt' })
  await expect(onay).toContainText('2. derste iki etüde yazılmış')
  await onay.getByRole('button', { name: 'Yine de kaydet' }).click()
  await expect(page.getByText('Taslak kaydedildi')).toBeVisible()
  const o = (await svc.from('etut_ogrenciler').select('ders, student_name')).data!
  expect(o.filter((x) => x.ders === 1 && x.student_name === 'Elif Yıldız')).toHaveLength(2)
  expect(o.filter((x) => x.ders === 2)).toHaveLength(2)
})
