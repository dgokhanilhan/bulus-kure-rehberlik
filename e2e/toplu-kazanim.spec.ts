import { test, expect } from '@playwright/test'
import { loginAdmin, resetAdminMfa } from './helpers'

test('toplu kazanım eşleme: müfredat, seçim, belirsizlik ve kısmi hata sonrası tekrar', async ({ page }) => {
  await resetAdminMfa()
  await loginAdmin(page)
  const exam = '11111111-1111-4111-8111-111111111111'
  const version = '22222222-2222-4222-8222-222222222222'
  const outcomes = ['9.3.1.1', '9.3.2.1', '9.3.2.2'].map((code, i) => ({ id: `33333333-3333-4333-8333-33333333333${i}`, code, title: `Hedef ${i}`, grade: 9, subject_code: 'MAT', curriculum_version_id: version }))
  const rows = ['TYT.MAT.9.3.1.1', 'TYT.MAT.9.3.1', 'TYT.MAT.9.3.2'].map((raw_code, i) => ({ exam_id: exam, exam_name: 'Toplu Test', grade: 12, exam_type: 'TYT', section_key: 'MAT', subject_code: 'MAT', q_no: i + 1, raw_code, raw_text: null, outcome_grade: null }))
  const saved = new Set<number>(), calls: number[] = []
  let failed = false
  await page.route('**/rest/v1/**', async (route) => {
    const url = new URL(route.request().url()), path = url.pathname
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
    if (path.endsWith('/unresolved_outcomes')) return json(rows.filter(r => !saved.has(r.q_no)))
    if (path.endsWith('/curriculum_versions')) return json([{ id: version, name: 'Eski program', curriculum_type: 'LEGACY', grade: 9, subject_code: 'MAT', year_from: 2000, year_to: 2023, active: true }, { id: '44444444-4444-4444-8444-444444444444', name: 'Yeni program', curriculum_type: 'TYMM', grade: 9, subject_code: 'MAT', year_from: 2024, year_to: null, active: true }])
    if (path.endsWith('/exams') && url.searchParams.get('select') === 'exam_date,exam_template_id') return json({ exam_date: '2026-10-06', exam_template_id: exam })
    if (path.endsWith('/exam_template_sections') && url.searchParams.get('select') === 'key,outcome_grades') return json([{ key: 'MAT', outcome_grades: [9] }])
    if (path.endsWith('/learning_outcomes')) {
      expect(url.searchParams.get('curriculum_version_id')).toContain(version)
      expect(url.searchParams.get('curriculum_version_id')).not.toContain('44444444')
      return json(outcomes)
    }
    if (path.endsWith('/rpc/set_item_outcome')) {
      const body = route.request().postDataJSON(); calls.push(body.p_q)
      expect(body.p_alias).toBe(false)
      if (body.p_q === 2 && !failed) { failed = true; return json({ message: 'Geçici kayıt hatası', code: 'XX000' }, 400) }
      saved.add(body.p_q); return json(null)
    }
    return route.continue()
  })
  await page.goto('/yonetim?sekme=denemeler')
  await page.getByRole('group', { name: 'Deneme Tanıma Merkezi bölümü' }).getByRole('button', { name: 'Eşleşmeyen hedefler', exact: true }).click()
  await page.getByRole('button', { name: 'Tümünü otomatik eşle', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Toplu otomatik eşleme' })
  const first = dialog.getByRole('checkbox', { name: 'Toplu Test MAT 1. soruyu seç' })
  const second = dialog.getByRole('checkbox', { name: 'Toplu Test MAT 2. soruyu seç' })
  await expect(first).toBeChecked()
  await expect(second).not.toBeChecked()
  await expect(dialog.getByRole('checkbox', { name: 'Toplu Test MAT 3. soruyu seç' })).toBeDisabled()
  await second.check()
  await dialog.getByRole('button', { name: 'Seçilen 2 soruyu eşle' }).click()
  await expect(dialog.getByText('Geçici kayıt hatası', { exact: true })).toBeVisible()
  await expect(first).toBeDisabled()
  await dialog.getByRole('button', { name: 'Seçilen 1 soruyu eşle' }).click()
  await expect(dialog.getByText('Seçilen eşlemeler kaydedildi.')).toBeVisible()
  expect(calls).toEqual([1, 2, 2])
  await page.screenshot({ path: 'e2e-artifacts/toplu-kazanim-esleme.png', fullPage: true })
})
