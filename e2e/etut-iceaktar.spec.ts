import { test, expect } from '@playwright/test'
import { DEMO, login, menu, service } from './helpers'

// Etüt programını dosyadan içe aktarma: öğretmen ve öğrenciler (sınıf + ad) eşleşir, meşgul hücreler ayrılır, programa aktarılır.
test('CSV içe aktarma: eşleşme, önizleme, programa aktar ve kaydet', async ({ page }) => {
  test.setTimeout(120_000)
  await service().from('etut_gunler').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  await login(page, ...DEMO.rehber)
  await menu(page).filter({ hasText: 'Etüt' }).click()
  await expect(page.locator('.et-tbl')).toBeVisible()
  await page.getByRole('button', { name: /İçe aktar/ }).click()
  await page.locator('.mwrap input[type=file]').setInputFiles('e2e/fixtures/etut/ornek-program.csv')
  await page.getByRole('button', { name: 'Oku', exact: true }).click()
  await expect(page.getByText('2 öğretmen satırı okundu. Bütün adlar eşleşti.')).toBeVisible()
  await expect(page.getByLabel('Murat öğretmeni')).toHaveValue(/.+/)
  await expect(page.getByLabel('Elif öğrencisi')).toContainText('Elif Yıldız (8/A)')
  await expect(page.getByLabel('Kerem öğrencisi')).toContainText('Kerem Aydın (8/B)')
  await expect(page.getByLabel('Konu').first()).toHaveValue('üslü ifadeler')
  await page.getByRole('button', { name: 'Programa aktar' }).click()
  await expect(page.getByText('4 hücre aktarıldı', { exact: false })).toBeVisible()
  await expect(page.locator('.et-cell.etut')).toHaveCount(2)
  await expect(page.locator('.et-cell.busy')).toHaveCount(2)
  await page.getByRole('button', { name: 'Kaydet', exact: true }).click()
  await expect(page.getByText('Taslak kaydedildi')).toBeVisible()
  const { data } = await service().from('etut_ogrenciler').select('student_name, ders')
  expect(data!.map((x) => `${x.ders}:${x.student_name}`).sort()).toEqual(['1:Ayşe Çelik', '1:Elif Yıldız', '2:Kerem Aydın'])
})

// Çok sayfalı Excel (her Cumartesi ayrı sayfa): programın tarihine uyan sayfa seçilir; satır sonuyla ayrılmış adlar, yalnız sınıf
// yazılı hücre (tüm sınıf), kayıtsız öğretmen (adıyla eklenir), konusu yazılmayan etütte öğretmenin branşı.
test('Excel: tarihe uyan sayfa, tüm sınıf, kayıtsız öğretmen', async ({ page }) => {
  test.setTimeout(120_000)
  const svc = service()
  await svc.from('etut_gunler').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  const AY = ['OCAK', 'ŞUBAT', 'MART', 'NİSAN', 'MAYIS', 'HAZİRAN', 'TEMMUZ', 'AĞUSTOS', 'EYLÜL', 'EKİM', 'KASIM', 'ARALIK']
  const d = new Date()
  while (d.getDay() !== 6) d.setDate(d.getDate() + 1)
  const sayfa = `${d.getDate()} ${AY[d.getMonth()]}`
  const { default: ExcelJS } = await import('exceljs')
  const wb = new ExcelJS.Workbook()
  const ekle = (ad: string, satirlar: (string | null)[][]) => {
    const ws = wb.addWorksheet(ad)
    ws.addRow([`TARİH: ${ad} C.TESİ`])
    ws.addRow(['ORTAOKUL DERS TELAFİSİ PROGRAMI'])
    ws.addRow(['ÖĞRETMEN ', null, '09:00-09:40', '09:50-10:30', '10:40-11:20', '11:30-12:10', '12:20-13:00'])
    for (const r of satirlar) ws.addRow(r)
  }
  ekle('1 OCAK', [['ESKİ HOCA', null, '8-A\nElif', null, null, null, null]])
  ekle(sayfa, [
    ['MURAT HOCA', null, '8-A\nElif\n(Üslü ifadeler)', '8-B', 'D', null, null],
    ['GENCO HOCA', null, null, null, '8-A Sınıfı\n(Soru çözümü)', null, null],
  ])
  const buf = Buffer.from(await wb.xlsx.writeBuffer())

  await login(page, ...DEMO.rehber)
  await menu(page).filter({ hasText: 'Etüt' }).click()
  await expect(page.locator('.et-tbl')).toBeVisible()
  await page.getByRole('button', { name: /İçe aktar/ }).click()
  await page.locator('.mwrap input[type=file]').setInputFiles({ name: 'program.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: buf })
  await expect(page.getByLabel('Excel sayfası')).toHaveValue(sayfa)
  await page.getByRole('button', { name: 'Oku', exact: true }).click()
  await expect(page.getByText('2 öğretmen satırı okundu.', { exact: false })).toBeVisible()
  await expect(page.getByText('1 öğretmen sistemde kayıtlı değil', { exact: false })).toBeVisible()
  await expect(page.getByLabel('MURAT öğretmeni')).not.toHaveValue('')
  await expect(page.getByLabel('GENCO öğretmeni')).toHaveValue('__adiyla')
  await expect(page.getByLabel('Elif öğrencisi')).toContainText('Elif Yıldız (8/A)')
  const n8b = (await svc.from('students').select('id', { count: 'exact', head: true }).eq('class_name', '8/B').is('archived_at', null)).count!
  await expect(page.getByText(`Tüm sınıf: 8/B (${n8b})`)).toBeVisible()
  await page.getByRole('button', { name: 'Programa aktar' }).click()
  await page.getByRole('button', { name: 'Kaydet', exact: true }).click()
  await expect(page.getByText('Taslak kaydedildi')).toBeVisible()
  const h = (await svc.from('etut_hucreler').select('ders, teacher_id, teacher_name, tur, konu, etut_ogrenciler(student_name)')).data!
  const m2 = h.find((x) => x.ders === 2)!
  expect(m2).toMatchObject({ tur: 'etut', konu: 'Matematik' })
  expect(m2.etut_ogrenciler).toHaveLength(n8b)
  expect(h.find((x) => x.ders === 1)).toMatchObject({ konu: 'Üslü ifadeler', etut_ogrenciler: [{ student_name: 'Elif Yıldız' }] })
  expect(h.find((x) => x.ders === 3 && x.teacher_name === 'Murat Kaya')).toMatchObject({ tur: 'mesgul' })
  const g = h.find((x) => x.teacher_name === 'Genco')!
  expect(g).toMatchObject({ teacher_id: null, ders: 3, konu: 'Soru çözümü' })
  expect(g.etut_ogrenciler.length).toBeGreaterThan(1)
})
