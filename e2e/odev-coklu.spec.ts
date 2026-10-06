import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { DEMO, login, service } from './helpers'

const svc = service()
const title = `E2E Çoklu sınıf ${Date.now()}`
let classA = '', classB = '', course = '', teacher = '', school = ''
let extraAssignment = false

test.beforeAll(async () => {
  const a = await svc.from('classes').select('id, school_id').eq('name', '8/A').single()
  const b = await svc.from('classes').select('id').eq('name', '8/B').single()
  const c = await svc.from('courses').select('id').eq('name', 'Matematik').single()
  const t = await svc.from('profiles').select('id').eq('email', DEMO.matematik[0]).single()
  classA = a.data!.id; school = a.data!.school_id; classB = b.data!.id; course = c.data!.id; teacher = t.data!.id
  const existing = await svc.from('teaching_assignments').select('id').eq('class_id', classB).eq('course_id', course).eq('teacher_id', teacher)
  if (!existing.data?.length) {
    const added = await svc.from('teaching_assignments').insert({ school_id: school, class_id: classB, course_id: course, teacher_id: teacher })
    expect(added.error).toBeNull()
    extraAssignment = true
  }
})

test.afterAll(async () => {
  const homework = await svc.from('homework').select('id').eq('title', title)
  for (const h of homework.data ?? []) {
    const files = await svc.from('attachments').select('path').eq('homework_id', h.id)
    if (files.data?.length) await svc.storage.from('ekler').remove(files.data.map((f) => f.path))
  }
  await svc.from('homework').delete().eq('title', title)
  if (extraAssignment) await svc.from('teaching_assignments').delete().eq('class_id', classB).eq('course_id', course).eq('teacher_id', teacher)
})

test('aynı ödevi ve dosyayı iki sınıfa verir; boş sınıf seçimi kayıt oluşturmaz', async ({ page }) => {
  await login(page, ...DEMO.matematik)
  await page.getByRole('link', { name: 'Ödevler' }).click()
  await page.getByRole('button', { name: 'Ödev ver', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Ödev ver' })
  await expect(dialog.locator('#hCls option')).toHaveText(['8/A', '8/B'])
  await dialog.getByLabel('Birden fazla sınıf seç', { exact: true }).check()
  await dialog.getByLabel('8/A', { exact: true }).uncheck()
  await dialog.getByRole('button', { name: 'Ödevi ver', exact: true }).click()
  await expect(dialog.getByRole('alert')).toHaveText('En az bir sınıf seç.')
  await dialog.getByLabel('8/A', { exact: true }).check()
  await dialog.getByLabel('8/B', { exact: true }).check()
  await expect(dialog.locator('#hCourse option')).toHaveText(['Matematik'])
  await expect(dialog.getByText('2 sınıf seçildi')).toBeVisible()
  await dialog.getByLabel('Başlık', { exact: true }).fill(title)
  await dialog.getByLabel('Son teslim', { exact: true }).fill(new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10))
  await dialog.locator('input[type="file"]').setInputFiles({ name: 'odev.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n%%EOF') })
  const accessibility = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
  expect(accessibility.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual([])
  await dialog.getByRole('button', { name: 'Ödevi ver', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  await expect(page.getByTestId('homework-card').filter({ hasText: title })).toHaveCount(2)
  const homework = await svc.from('homework').select('id, class_id, course_id').eq('title', title)
  expect(homework.error).toBeNull()
  expect(homework.data!.map((h) => h.class_id).sort()).toEqual([classA, classB].sort())
  for (const h of homework.data!) {
    expect(h.course_id).toBe(course)
    const attachments = await svc.from('attachments').select('file_name, uploaded').eq('homework_id', h.id)
    expect(attachments.data).toEqual([{ file_name: 'odev.pdf', uploaded: true }])
    const students = await svc.from('students').select('id').eq('class_id', h.class_id).is('archived_at', null)
    const assigned = await svc.from('homework_students').select('student_id').eq('homework_id', h.id)
    expect(assigned.data!.map((s) => s.student_id).sort()).toEqual(students.data!.map((s) => s.id).sort())
  }
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('button', { name: 'Ödev ver', exact: true }).click()
  await dialog.getByLabel('Birden fazla sınıf seç', { exact: true }).check()
  await expect(dialog.getByLabel('8/B', { exact: true })).toBeVisible()
  expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true)
})

test('seçilen sınıflarda ortak ders yoksa ödev kaydetmez', async ({ page }) => {
  const other = await svc.from('courses').select('id').eq('name', 'Türkçe').single()
  await page.route('**/rest/v1/teaching_assignments?**', async (route) => {
    const response = await route.fetch()
    const rows = await response.json()
    await route.fulfill({ response, json: rows.map((r: { class_id: string; course_id: string; teacher_id: string }) => r.class_id === classB && r.teacher_id === teacher ? { ...r, course_id: other.data!.id } : r) })
  })
  await login(page, ...DEMO.matematik)
  await page.getByRole('link', { name: 'Ödevler' }).click()
  await page.getByRole('button', { name: 'Ödev ver', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Ödev ver' })
  await dialog.getByLabel('Birden fazla sınıf seç', { exact: true }).check()
  await dialog.getByLabel('8/B', { exact: true }).check()
  await expect(dialog.locator('#hCourse option')).toHaveCount(0)
  await expect(dialog.getByRole('status')).toHaveText('Bu sınıflarda ortak ders yetkin yok.')
  await dialog.getByRole('button', { name: 'Ödevi ver', exact: true }).click()
  await expect(dialog.getByRole('alert')).toContainText('ortak bir ders yok')
})
