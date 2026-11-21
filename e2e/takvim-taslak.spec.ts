// Takvim taslakları (0092): Excel'den yüklenen etkinlikler taslak olur, veli görmez; "Tümünü yayınla" ile görünür ve tek bildirim gider.
import { test, expect } from '@playwright/test'
import ExcelJS from 'exceljs'
import { DEMO, login, service } from './helpers'

const AD = 'E2E Excel'
const gun = (n: number) => new Date(Date.now() + 3 * 3600_000 + n * 86400_000).toISOString().slice(0, 10)
const tr = (iso: string) => iso.split('-').reverse().join('.')
const temizle = async () => {
  const svc = service()
  await svc.from('notifications').delete().like('text', `%${AD}%`)
  await svc.from('calendar_events').delete().like('title', `${AD}%`)
}
test.beforeAll(temizle)
test.afterAll(temizle)
test.describe.configure({ mode: 'serial' })

async function dosya() {
  const book = new ExcelJS.Workbook()
  const sh = book.addWorksheet('Takvim')
  sh.addRow(['Başlangıç', 'Bitiş', 'Etkinlik', 'Tür', 'Sınıflar', 'Saat', 'Yer', 'Açıklama'])
  sh.addRow([tr(gun(3)), '', `${AD} deneme`, 'Deneme', '8', '09:30', '', ''])
  sh.addRow([tr(gun(4)), tr(gun(5)), `${AD} gezi`, 'Gezi', 'Tümü', '', '', ''])
  sh.addRow([tr(gun(6)), '', `${AD} hatalı`, 'Konser', '8', '', '', ''])
  return Buffer.from(await book.xlsx.writeBuffer())
}

test('rehber Excel ile taslak ekler; veli görmez; yayınlayınca görür', async ({ page, browser }) => {
  await login(page, ...DEMO.rehber)
  await expect(page).toHaveURL(/\/bugun$/)
  await page.goto('/takvim')
  await page.getByRole('button', { name: "Excel'den yükle" }).click()
  const dlg = page.getByRole('dialog', { name: "Excel'den etkinlik yükle" })
  await dlg
    .getByLabel('Excel dosyası')
    .setInputFiles({ name: 'takvim.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: await dosya() })
  await expect(dlg.getByRole('status')).toContainText('2 etkinlik eklenecek')
  await expect(dlg.getByRole('status')).toContainText('1 satır okunamadı')
  await expect(dlg).toContainText('Okunamadı: Tür okunamadı ("Konser")')
  await dlg.getByRole('button', { name: '2 etkinliği taslak olarak ekle' }).click()
  await expect(dlg).toHaveCount(0)
  const cubuk = page.getByTestId('taslak-cubugu')
  await expect(cubuk).toContainText('2 taslak etkinlik')

  const svc = service()
  const ids = ((await svc.from('calendar_events').select('id, taslak, class_ids').like('title', `${AD}%`)).data ?? []) as { id: string; taslak: boolean }[]
  expect(ids).toHaveLength(2)
  expect(ids.every((x) => x.taslak)).toBe(true)

  // Veli taslakları görmez
  const veliCtx = await browser.newContext()
  const veli = await veliCtx.newPage()
  await login(veli, ...DEMO.veli)
  await expect(veli).toHaveURL(/\/panel$/)
  await veli.goto('/takvim?gorunum=liste')
  await expect(veli.getByRole('heading', { name: 'Takvim' })).toBeVisible()
  await expect(veli.getByText(`${AD} gezi`)).toHaveCount(0)

  await cubuk.getByRole('button', { name: 'Tümünü yayınla' }).click()
  const onay = page.getByRole('dialog', { name: 'Taslakları yayınla' })
  await onay.getByRole('button', { name: '2 etkinliği yayınla' }).click()
  await expect(cubuk).toHaveCount(0)
  expect(((await svc.from('calendar_events').select('taslak').like('title', `${AD}%`)).data ?? []).every((x) => !x.taslak)).toBe(true)

  await veli.reload()
  await expect(veli.getByTestId('liste-satir').filter({ hasText: `${AD} gezi` })).toBeVisible()
  await veliCtx.close()
})
