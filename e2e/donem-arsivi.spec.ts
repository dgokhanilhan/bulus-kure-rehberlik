import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { service, resetAdminMfa, loginAdmin } from './helpers'
const svc = service(),
  SCHOOL = '00000000-0000-4000-8000-000000000001'
let year = '',
  archive = ''
test.afterAll(async () => {
  if (archive) await svc.from('academic_year_archives').delete().eq('id', archive)
  if (year) await svc.from('academic_years').delete().eq('id', year)
})
test('geçmiş dönem arşivi okunabilir; arşivi açmak mevcut öğrencileri değiştirmez', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const source = (await svc.from('academic_years').select('id').eq('school_id', SCHOOL).eq('is_active', true).single()).data!.id
  const admin = (await svc.from('profiles').select('id').eq('email', 'admin@buluskure.k12.tr').single()).data!.id
  const y = await svc
    .from('academic_years')
    .insert({ school_id: SCHOOL, name: '2095-2096', starts: '2095-09-01', term1_ends: '2096-01-20', term2_starts: '2096-02-01', ends: '2096-06-30' })
    .select('id')
    .single()
  if (y.error) throw y.error
  year = y.data.id
  const student = '00000000-0000-4000-8001-000000001184',
    exam = '00000000-0000-4000-8002-000000000001'
  const a = await svc
    .from('academic_year_archives')
    .insert({
      school_id: SCHOOL,
      source_year_id: source,
      target_year_id: year,
      created_by: admin,
      counts: { students: 1, notes: 1, reports: 1 },
      data: {
        students: [{ id: student, full_name: 'Elif Yıldız', class_name: '7/A', school_no: '10' }],
        exams: [{ id: exam, name: 'Arşiv Denemesi', exam_date: '2025-05-01' }],
        notes: [{ student_id: student, body: 'Arşivdeki not', visibility: 'veli' }],
        reports: [{ student_id: student, exam_id: exam, body: { genel: 'Arşivdeki genel değerlendirme' }, type: 'veli' }],
      },
    })
    .select('id')
    .single()
  if (a.error) throw a.error
  archive = a.data.id
  const before = await svc.from('students').select('id,class_name,archived_at').eq('school_id', SCHOOL).order('id')
  await resetAdminMfa()
  await loginAdmin(page)
  await page.goto('/yonetim?sekme=yillar')
  await page.getByRole('button', { name: /arşivi · 1 öğrenci/ }).click()
  const dialog = page.getByRole('dialog', { name: 'Geçmiş dönem arşivi' })
  await expect(dialog.getByText('Elif Yıldız', { exact: true })).toBeVisible()
  await expect(dialog.getByText('7/A', { exact: true })).toBeVisible()
  await dialog.getByLabel('Kayıt grubu', { exact: true }).selectOption('notes')
  await expect(dialog.getByText('Arşivdeki not', { exact: true })).toBeVisible()
  await dialog.getByLabel('Kayıt grubu', { exact: true }).selectOption('reports')
  await expect(dialog.getByText('Arşivdeki genel değerlendirme', { exact: true })).toBeVisible()
  const ax = await new AxeBuilder({ page }).include('[role="dialog"]').withTags(['wcag2a', 'wcag2aa']).analyze()
  expect(ax.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id)).toEqual([])
  await page.screenshot({ path: 'e2e-artifacts/donem-arsivi.png', fullPage: true })
  expect((await svc.from('students').select('id,class_name,archived_at').eq('school_id', SCHOOL).order('id')).data).toEqual(before.data)
})
