// Bugün 2.0: günün akışı, yapılacaklar, nedenine göre gruplanmış öğrenciler, bu hafta okulda, deneme zorluk notu.
import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { DEMO, ELIF, login, service, shot } from './helpers'

const AD = 'E2E Bugün2'
const gun = (n = 0) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(new Date(Date.now() + n * 86400_000))
const haftaIci = () => ![0, 6].includes(new Date(`${gun()}T12:00:00Z`).getUTCDay())
const ids: { meeting?: string; event?: string; yaklasan?: string } = {}

test.describe.configure({ mode: 'serial' })
test.beforeAll(async () => {
  const svc = service()
  const okul = (await svc.from('students').select('school_id').eq('id', ELIF).single()).data!.school_id
  const users = (await svc.auth.admin.listUsers({ perPage: 200 })).data.users
  const rehber = users.find((u) => u.email === DEMO.rehber[0])!.id
  const m = await svc
    .from('meetings')
    .insert({ student_id: ELIF, with_whom: 'veli', starts_at: `${gun()}T23:30:00+03:00`, created_by: rehber })
    .select('id')
    .single()
  expect(m.error).toBeNull()
  ids.meeting = m.data!.id
  const e = await svc
    .from('calendar_events')
    .insert({
      school_id: okul,
      title: `${AD} etkinliği`,
      type: 'diger',
      starts_on: gun(),
      ends_on: gun(),
      target: 'okul',
      audience: ['ogretmen'],
      created_by: rehber,
    })
    .select('id')
    .single()
  expect(e.error).toBeNull()
  ids.event = e.data!.id
  const y = await svc
    .from('yaklasan_denemeler')
    .insert({ school_id: okul, name: `${AD} TG`, exam_date: gun(-1), grade: 8, created_by: rehber })
    .select('id')
    .single()
  expect(y.error).toBeNull()
  ids.yaklasan = y.data!.id
})
test.afterAll(async () => {
  const svc = service()
  if (ids.meeting) await svc.from('meetings').delete().eq('id', ids.meeting)
  if (ids.event) await svc.from('calendar_events').delete().eq('id', ids.event)
  if (ids.yaklasan) await svc.from('yaklasan_denemeler').delete().eq('id', ids.yaklasan)
})

test('rehber: akış, yapılacaklar, gruplar ve bu hafta; satırlar ilgili ekrana gider', async ({ page }) => {
  test.setTimeout(90_000)
  await login(page, ...DEMO.rehber)
  await expect(page).toHaveURL(/\/bugun$/)
  await expect(page.getByRole('heading', { name: /^Bugün \d+ öğrenciye bakmalısın\.$/ })).toBeVisible()

  const akis = page.getByTestId('gunun-akisi')
  await expect(akis).toContainText(`${AD} etkinliği`)
  await expect(akis).toContainText('Veli görüşmesi')
  await expect(akis).toContainText('23:30')

  const yap = page.getByTestId('yapilacaklar')
  const satir = yap.getByTestId('yapilacak').filter({ hasText: `${AD} TG sonuçları yüklenmedi` })
  await expect(satir).toBeVisible()

  const hafta = page.getByTestId('bu-hafta')
  await expect(hafta).toBeVisible()
  if (haftaIci()) await expect(hafta).toContainText(`${AD} etkinliği`)

  const gruplar = page.getByTestId('bugun-grup')
  await expect(gruplar.first()).toBeVisible()
  const ilk = gruplar.filter({ has: page.getByRole('button', { name: /^Tümünü gör \(\d+\)$/ }) }).first()
  if (await ilk.count()) {
    const g = page.locator(`[data-grup="${await ilk.getAttribute('data-grup')}"]`)
    const tumu = g.getByRole('button', { name: /^Tümünü gör/ })
    const n = Number((await tumu.innerText()).match(/\d+/)![0])
    await expect(g.getByTestId('attention-row')).toHaveCount(3)
    await tumu.click()
    await expect(g.getByTestId('attention-row')).toHaveCount(n)
    await expect(g.getByRole('button', { name: 'Daha az göster' })).toHaveAttribute('aria-expanded', 'true')
  }

  await page.emulateMedia({ reducedMotion: 'reduce' })
  const axe = await new AxeBuilder({ page }).include('main').withTags(['wcag2a', 'wcag2aa']).analyze()
  expect(axe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id} ${v.nodes[0]?.target}`)).toEqual([])
  await shot(page, 'bugun-2')

  await page.setViewportSize({ width: 375, height: 800 })
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0)
  await shot(page, 'bugun-2-telefon')
  await page.setViewportSize({ width: 1280, height: 800 })

  await satir.getByRole('button', { name: 'Yükle' }).click()
  await expect(page).toHaveURL(/\/denemeler$/)
  await page.goBack()
  await akis.getByRole('button', { name: /Veli görüşmesi/ }).click()
  await expect(page).toHaveURL(new RegExp(`/ogrenciler/${ELIF}`))
})

test('veli ve öğrenci ana sayfası değişmez', async ({ page }) => {
  await login(page, ...DEMO.veli)
  await expect(page.getByRole('navigation', { name: 'Ana menü' })).toBeVisible()
  await expect(page.getByTestId('gunun-akisi')).toHaveCount(0)
  await expect(page.getByTestId('yapilacaklar')).toHaveCount(0)
})
