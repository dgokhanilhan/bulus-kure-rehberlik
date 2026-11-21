// Yaklaşan deneme (0091): rehberlik kazanım listesini görür; veli takvimdeki denemeden "Konuları gör" ile konu listesini açar.
import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { DEMO, login, service, shot } from './helpers'

const AD = 'E2E Yaklaşan'
const tarih = new Date(Date.now() + 3 * 3600_000 + 4 * 86400_000).toISOString().slice(0, 10)
let ev = ''
const temizle = async () => {
  const svc = service()
  await svc.from('yaklasan_denemeler').delete().like('name', `${AD}%`)
  await svc.from('calendar_events').delete().like('title', `${AD}%`)
}
test.beforeAll(async () => {
  await temizle()
  const svc = service()
  const okul = (await svc.from('profiles').select('school_id').eq('email', DEMO.rehber[0]).single()).data!.school_id
  const e = await svc
    .from('calendar_events')
    .insert({ school_id: okul, title: AD, type: 'deneme', starts_on: tarih, ends_on: tarih, target: 'kademe', level: 'ortaokul' })
    .select('id')
    .single()
  ev = e.data!.id
  const y = await svc.from('yaklasan_denemeler').insert({ school_id: okul, name: AD, exam_date: tarih, grade: 8, calendar_event_id: ev }).select('id').single()
  const s = (subject: string, q_no: number, konu: string, outcome_code: string | null) => ({
    deneme_id: y.data!.id,
    subject,
    q_no,
    konu,
    outcome_code,
    match: outcome_code ? 'code_exact' : 'none',
  })
  const { error } = await svc
    .from('yaklasan_deneme_sorulari')
    .insert([
      s('MAT', 1, 'Üslü İfadeler', 'M.8.1.2.1'),
      s('MAT', 2, 'Üslü İfadeler', 'M.8.1.2.2'),
      s('MAT', 3, 'Kareköklü İfadeler', 'M.8.1.3.1'),
      s('TUR', 1, 'Sözcükte Anlam', null),
    ])
  expect(error).toBeNull()
})
test.afterAll(temizle)
test.describe.configure({ mode: 'serial' })

test('rehberlik yaklaşan denemeyi ve konularını görür', async ({ page }) => {
  await login(page, ...DEMO.rehber)
  await expect(page).toHaveURL(/\/bugun$/)
  await page.goto('/denemeler')
  const satir = page.getByTestId('yaklasan-satir').filter({ hasText: AD })
  await expect(satir).toContainText('4 soru · 3 kazanım eşleşti')
  await expect(satir).toContainText('Takvimde')
  await satir.getByRole('button', { name: `${AD} konularını gör` }).click()
  await expect(page.locator('.modal')).toContainText('Konuların tamamı')
  const axe = await new AxeBuilder({ page }).include('.modal').withTags(['wcag2a', 'wcag2aa']).analyze()
  expect(axe.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')).toEqual([])
})

test('veli takvimdeki denemeden konuları açar; teknik terim görünmez', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 })
  await login(page, ...DEMO.veli)
  await expect(page).toHaveURL(/\/panel$/)
  await page.goto(`/takvim?etkinlik=${ev}`)
  const kutu = page.getByTestId('takvim-konu-kutusu')
  await expect(kutu).toContainText('Çıkacak konular hazır')
  await expect(kutu).toContainText('4 soru · 2 ders')
  await kutu.getByRole('button', { name: 'Konuları gör' }).click()
  const m = page.locator('.modal')
  await expect(m).toContainText('Çıkacak konular')
  await expect(m).toContainText('Konuların tamamı')
  await m.getByRole('button', { name: /Matematik · 3 soru/ }).click()
  await expect(m).toContainText('Üslü İfadeler')
  await expect(m).not.toContainText(/M\.8\.|code_exact|kazanım kodu/i)
  await shot(page, 'yaklasan-veli-konular')
  const axe = await new AxeBuilder({ page }).include('.modal').withTags(['wcag2a', 'wcag2aa']).analyze()
  expect(axe.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')).toEqual([])
  await m.getByRole('button', { name: 'Etkinliğe dön' }).click()
  await expect(page.getByTestId('takvim-konu-kutusu')).toBeVisible()
})
