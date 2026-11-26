// Görev takip formu (0094): takip tablosu, kontrol girişi, telefonda hızlı giriş, PDF / Excel, sınıf toplu PDF; veli kontrolleri görmez.
import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { DEMO, ELIF, login, logout, openStudent, service, shot } from './helpers'

const AD = 'E2E Takip'
const gun = (n = 0) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(new Date(Date.now() + n * 86400_000))
const ids: string[] = []

test.describe.configure({ mode: 'serial' })
test.beforeAll(async () => {
  const svc = service()
  const users = (await svc.auth.admin.listUsers({ perPage: 200 })).data.users
  const rehber = users.find((u) => u.email === DEMO.rehber[0])!.id
  const { data, error } = await svc
    .from('tasks')
    .insert([
      {
        student_id: ELIF,
        subject: 'MAT',
        topic: `${AD} A üslü ifadeler`,
        question_count: 20,
        due_date: gun(9),
        created_by: rehber,
        created_at: new Date().toISOString(),
      },
      {
        student_id: ELIF,
        subject: 'FEN',
        topic: `${AD} B mevsimler`,
        question_count: 30,
        due_date: gun(5),
        created_by: rehber,
        created_at: new Date().toISOString(),
      },
    ])
    .select('id')
  expect(error).toBeNull()
  ids.push(...data!.map((x) => x.id))
})
test.afterAll(async () => {
  if (ids.length) await service().from('tasks').delete().in('id', ids)
})

const satir = (page: import('@playwright/test').Page, ad: string) => page.getByTestId('takip-satir').filter({ hasText: ad })

test('rehber: takip tablosunda kontrol girer; ilerleme güncellenir; PDF ve Excel iner', async ({ page }) => {
  test.setTimeout(90_000)
  await login(page, ...DEMO.rehber)
  await openStudent(page, ELIF, 'gorevler')
  await page.getByRole('group', { name: 'Görev görünümü' }).getByRole('button', { name: 'Takip tablosu' }).click()
  await expect(page).toHaveURL(/takip=tablo/)
  const a = satir(page, `${AD} A`)
  await expect(a).toBeVisible()
  await expect(a).toContainText('öneri')
  await expect(a).toContainText('beklenen')

  const k1 = a.getByRole('textbox', { name: /1\. kontrol/ })
  await k1.fill('25')
  await k1.press('Enter')
  await expect(page.getByText('Çözülen soru 0 ile 20 arasında olmalı.')).toBeVisible()
  await k1.fill('8')
  await k1.press('Enter')
  await expect(a).toContainText(gun().slice(8, 10) + '.' + gun().slice(5, 7))
  await expect(a.locator('td.mono')).toHaveText('8/20')
  await expect.poll(async () => (await service().from('tasks').select('solved').eq('id', ids[0]!).single()).data?.solved).toBe(8)

  const axe = await new AxeBuilder({ page }).include('[data-testid="takip-tablosu"]').withTags(['wcag2a', 'wcag2aa']).analyze()
  expect(axe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id)).toEqual([])
  await shot(page, 'gorev-takip-tablosu')

  const [pdf] = await Promise.all([page.waitForEvent('download'), page.getByTestId('takip-formu-pdf').click()])
  expect(pdf.suggestedFilename()).toBe('Görev takip formu - Elif Yıldız.pdf')
  await pdf.saveAs('e2e-artifacts/gorev-takip-formu.pdf')
  const [xlsx] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Excel' }).click()])
  expect(xlsx.suggestedFilename()).toBe('Görev takip - Elif Yıldız.xlsx')
})

test('telefonda hızlı giriş (karekod adresi): birden çok kontrol tek seferde kaydedilir', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 })
  await login(page, ...DEMO.rehber)
  await expect(page.getByRole('navigation', { name: 'Ana menü' })).toBeVisible()
  await page.goto(`/ogrenciler/${ELIF}?sekme=gorevler&takip=hizli`)
  const kutu = page.getByTestId('hizli-giris')
  await expect(kutu).toBeVisible()
  const a = kutu.getByTestId('hizli-gorev').filter({ hasText: `${AD} A` })
  const b = kutu.getByTestId('hizli-gorev').filter({ hasText: `${AD} B` })
  await expect(a.getByRole('textbox', { name: /1\. kontrol/ })).toHaveValue('8')
  await a.getByRole('textbox', { name: /2\. kontrol/ }).fill('12')
  await b.getByRole('textbox', { name: /1\. kontrol/ }).fill('30')
  await kutu.getByRole('button', { name: 'Kaydet' }).click()
  await expect(page.getByText('2 kontrol kaydedildi.')).toBeVisible()
  await expect
    .poll(async () =>
      (await service().from('tasks').select('solved, completed_at').in('id', ids).order('topic')).data?.map((x) => [x.solved, !!x.completed_at]),
    )
    .toEqual([
      [12, false],
      [30, true],
    ])
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0)
  const axe = await new AxeBuilder({ page }).include('[data-testid="hizli-giris"]').withTags(['wcag2a', 'wcag2aa']).analyze()
  expect(axe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id)).toEqual([])
  await shot(page, 'gorev-hizli-giris')
})

test('sınıf toplu PDF; veli kontrolleri görmez, yalnız ilerlemeyi görür', async ({ page }) => {
  await login(page, ...DEMO.rehber)
  await expect(page.getByRole('navigation', { name: 'Ana menü' })).toBeVisible()
  await page.goto('/siniflar')
  const [d] = await Promise.all([page.waitForEvent('download'), page.getByTestId('sinif-takip-formlari').click()])
  expect(d.suggestedFilename()).toMatch(/^Görev takip formları - .+\.pdf$/)
  await logout(page)

  await login(page, ...DEMO.veli)
  await expect(page.getByRole('navigation', { name: 'Ana menü' })).toBeVisible()
  await page.goto('/gorevler')
  await expect(page.getByText(`${AD} A üslü ifadeler`)).toBeVisible()
  await expect(page.getByText(/1\. kontrol|Takip tablosu/)).toHaveCount(0)
  const { data, error } = await service().from('gorev_kontrol').select('sira').in('task_id', ids)
  expect(error).toBeNull()
  expect(data!.length).toBe(3)
})
