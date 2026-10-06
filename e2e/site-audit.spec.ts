import { test, expect } from '@playwright/test'
import { DEMO, login, loginAdmin, resetAdminMfa, service, shot } from './helpers'

const svc = service()
const ids: { parent?: string; c1?: string; s1?: string; s6?: string; s8?: string; exam?: string } = {}
const parentEmail = `e2e-audit-${Date.now()}@ornek.com`
const parentPassword = 'AuditLocal123!'

test.describe.serial('Canlı incelemede bulunan hataların regresyonu', () => {
  test.beforeAll(async () => {
    if (!/^http:\/\/(localhost|127\.0\.0\.1)(:|\/)/.test(process.env.VITE_SUPABASE_URL ?? ''))
      throw new Error('Bu test yalnız yerel Supabase ile çalışır.')
    const school = (await svc.from('schools').select('id').single()).data!.id
    const author = (await svc.from('profiles').select('id').eq('email', DEMO.rehber[0]).single()).data!.id
    ids.c1 = (await svc.from('classes').insert({ school_id: school, grade: 1, section: 'Q' }).select('id').single()).data!.id
    const classes = (await svc.from('classes').select('id, grade').in('name', ['6/A', '8/A'])).data!
    for (const grade of [1, 6, 8] as const) {
      const classId = grade === 1 ? ids.c1 : classes.find((c) => c.grade === grade)!.id
      const { data, error } = await svc.from('students').insert({ school_id: school, full_name: `Audit ${grade} Öğrenci`, class_id: classId }).select('id').single()
      expect(error).toBeNull()
      ids[`s${grade}`] = data!.id
    }
    const { data: user, error: authError } = await svc.auth.admin.createUser({
      email: parentEmail, password: parentPassword, email_confirm: true,
      user_metadata: { school: 'bulus-kure', consent_version: 'v1', full_name: 'Audit Veli', role: 'veli', declared: { childName: 'Audit 6 Öğrenci', childClass: '6/A', relation: 'Anne' } },
    })
    expect(authError).toBeNull()
    ids.parent = user.user!.id
    await svc.from('profiles').update({ status: 'approved' }).eq('id', ids.parent)
    const link = await svc.from('parent_links').insert({ parent_id: ids.parent, student_id: ids.s6, relation: 'Anne' })
    expect(link.error).toBeNull()
    const exam = await svc.from('exams').insert({ school_id: school, name: 'AUDIT Genel Deneme', grade: 6, exam_type: 'GENEL', exam_date: '2026-09-01', status: 'yayinda' }).select('id').single()
    expect(exam.error).toBeNull()
    ids.exam = exam.data!.id
    const report = await svc.from('reports').insert({ type: 'veli', student_id: ids.s6, exam_id: ids.exam, body: {}, created_by: author, status: 'sent', sent_to_parent: true, sent_at: new Date().toISOString() })
    expect(report.error).toBeNull()
    const task = await svc.from('tasks').insert({ student_id: ids.s6, subject: 'MAT', topic: 'AUDIT gecikmiş görev', question_count: 10, due_date: '2020-01-01', created_by: author })
    expect(task.error).toBeNull()
    await resetAdminMfa()
  })

  test.afterAll(async () => {
    if (ids.parent) await svc.auth.admin.deleteUser(ids.parent)
    if (ids.exam) await svc.from('exams').delete().eq('id', ids.exam)
    const students = [ids.s1, ids.s6, ids.s8].filter((id): id is string => !!id)
    if (students.length) await svc.from('students').delete().in('id', students)
    if (ids.c1) await svc.from('classes').delete().eq('id', ids.c1)
  })

  test('6. sınıf velisinin raporu Özet ekranını çökertmez ve sınav adı görünür', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    await login(page, parentEmail, parentPassword)
    await expect(page.getByRole('navigation', { name: 'Ana menü' })).toBeVisible()
    await page.goto('/ozet')
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Audit')
    await page.getByRole('complementary').getByText('Raporlar', { exact: true }).click()
    await expect(page.getByRole('button', { name: 'AUDIT Genel Deneme raporu' })).toBeVisible()
    await page.reload()
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Audit')
    await page.goto('/raporlar')
    await expect(page.getByTestId('report-row')).toContainText('AUDIT Genel Deneme · Gelişim raporu')
    expect(errors).toEqual([])
    await shot(page, 'audit-veli-raporlari')
  })

  test('LGS eksik uyarısı yalnız 8. sınıfta; diğer sınıfın gecikmiş görevi korunur', async ({ page }) => {
    await login(page, ...DEMO.rehber)
    await expect(page.getByRole('navigation', { name: 'Ana menü' })).toBeVisible()
    await page.goto('/bugun')
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Bugün')
    const main = page.getByRole('main')
    await expect(main.getByRole('button').filter({ hasText: 'Audit 8 Öğrenci' }).first()).toContainText('girmedi')
    await expect(main.getByRole('button').filter({ hasText: 'Audit 6 Öğrenci' }).first()).toContainText('Gecikme')
    await expect(main.getByRole('button').filter({ hasText: 'Audit 6 Öğrenci' }).first()).not.toContainText('girmedi')
    await expect(main.getByText('Audit 1 Öğrenci', { exact: true })).toHaveCount(0)
    await page.goto('/ogrenciler')
    await page.getByLabel('Ara', { exact: true }).fill('Audit 1')
    await expect(page.getByRole('row', { name: 'Audit 1 Öğrenci dosyası' })).toContainText('Henüz sonuç yok')
    await shot(page, 'audit-ogrenci-durumu')
  })

  test('kısa masaüstü ekranında yönetim alt menüsü kaydırılıp açılabilir', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 600 })
    await loginAdmin(page)
    await page.goto('/yonetim?sekme=denemeler')
    const menu = page.getByRole('group', { name: 'Yönetim bölümü' })
    await expect(menu).toBeVisible()
    const size = await menu.evaluate((el) => ({ height: el.clientHeight, scrollHeight: el.scrollHeight, overflow: getComputedStyle(el).overflowY }))
    expect(size.height).toBeLessThanOrEqual(500)
    expect(size.scrollHeight).toBeGreaterThan(size.height)
    expect(size.overflow).toBe('auto')
    await menu.getByRole('button', { name: 'Toplu aktarım', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Toplu aktarım', exact: true })).toBeVisible()
    await shot(page, 'audit-yonetim-menu', false)
    await page.setViewportSize({ width: 390, height: 844 })
    await menu.getByRole('button', { name: 'Genel ayarlar', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Genel ayarlar', exact: true })).toBeVisible()
    await shot(page, 'audit-yonetim-mobil', false)
  })
})
