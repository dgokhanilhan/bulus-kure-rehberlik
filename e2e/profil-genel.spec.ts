// Öğrenci profili 5–12 genel deneme altyapısına bağlı: kartlar, Gelişim, Denemeler, Konular, Veli raporu ve Sınıflar aynı kaynaktan.
// 6. sınıf: Deneme Özeti; 12. sınıf: YKS Özeti → TYT / AYT ayrı seri (asla birleşmez). 8. sınıf LGS davranışı diğer testlerde.
// Veri yerel test veritabanında gerçek içe aktarma fonksiyonuyla (import_exam, rehber hesabı) kurulur; kazanım eşleşmesi sunucuda.
import { test, expect, type Page } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import AxeBuilder from '@axe-core/playwright'
import { DEMO, login, service, shot } from './helpers'

async function axe(page: Page, label: string) {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.waitForTimeout(300)
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
  const bad = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
  expect(bad.map((v) => `${label}: ${v.id} (${v.nodes.length}) ${v.nodes[0]?.target}`)).toEqual([])
}
const svc = service()
const sec = (d: number, y: number, n: number, w: number) => ({ d, y, b: n - d - y, net: Math.round((d - y / w) * 100) / 100 })
const ids: Record<string, string> = {}

async function rehber(): Promise<SupabaseClient> {
  const c = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } })
  const { error } = await c.auth.signInWithPassword({ email: DEMO.rehber[0], password: DEMO.rehber[1] })
  if (error) throw error
  return c
}
async function importExam(c: SupabaseClient, p: Record<string, unknown>) {
  const { data, error } = await c.rpc('import_exam', { p: { status: 'yayinda', notify: false, ...p } })
  if (error) throw new Error(error.message)
  return data.exam_id as string
}

test.describe.serial('Profil · genel deneme entegrasyonu', () => {
  const clean = async () => {
    const { data } = await svc.from('exams').select('id').like('name', 'PRF %')
    if (data?.length) await svc.from('exams').delete().in('id', data.map((e) => e.id))
    await svc.from('students').delete().in('school_no', ['P601', 'P1201'])
    await svc.from('classes').delete().eq('name', '12/Q')
  }
  test.beforeAll(async () => {
    await clean()
    const school = (await svc.from('schools').select('id').single()).data!.id
    const c6 = (await svc.from('classes').select('id').eq('name', '6/A').single()).data!.id
    const c12 = (await svc.from('classes').insert({ school_id: school, grade: 12, section: 'Q' }).select('id').single()).data!.id
    ids.s6 = (await svc.from('students').insert({ school_id: school, full_name: 'Profil Altıncı', class_id: c6, school_no: 'P601' }).select('id').single()).data!.id
    ids.s12 = (await svc.from('students').insert({ school_id: school, full_name: 'Profil Onikinci', class_id: c12, school_no: 'P1201' }).select('id').single()).data!.id
    const tpl = async (like: string) => (await svc.from('exam_templates').select('id').eq('builtin', true).like('name', like).single()).data!.id
    const t6 = await tpl('6. Sınıf%'), tyt = await tpl('%TYT%'), ayt = await tpl('%AYT%')
    const c = await rehber()
    // 6. sınıf: iki deneme, aynı öğrenme çıktısında (MAT.6.1.1) iki kez yanlış → tekrar eden hata
    for (const [i, net] of [[1, 9], [2, 11]] as const)
      await importExam(c, {
        name: `PRF 6 Deneme ${i}`, exam_date: `2026-09-1${i}`, grade: 6, exam_type: 'GENEL', template_id: t6,
        items: [{ section_key: 'MAT', q_no: 1, correct_answer: 'B', raw_code: 'MAT.6.1.1', raw_text: null }],
        results: [{ student_id: ids.s6, score: 300 + i * 10, sections: { TUR: sec(10, 3, 15, 3), MAT: sec(net, 0, 15, 3) }, answers: { MAT: 'c' + 'A'.repeat(14) }, source: {} }],
      })
    // 12. sınıf: iki TYT (eski program 9. sınıf kazanımı iki kez yanlış) + bir AYT
    for (const [i, d] of [[1, 20], [2, 24]] as const)
      await importExam(c, {
        name: `PRF TYT ${i}`, exam_date: `2026-09-2${i}`, grade: 12, exam_type: 'YKS', yks_part: 'TYT', template_id: tyt,
        items: [{ section_key: 'MAT', q_no: 1, correct_answer: 'A', raw_code: '9.1.1.1', raw_text: null }],
        results: [{ student_id: ids.s12, score: 250 + i, sections: { TUR: sec(30, 8, 40, 4), MAT: sec(d, 4, 40, 4) }, answers: { MAT: 'b' + 'A'.repeat(39) }, source: {} }],
      })
    await importExam(c, {
      name: 'PRF AYT 1', exam_date: '2026-09-25', grade: 12, exam_type: 'YKS', yks_part: 'AYT', template_id: ayt, items: [],
      results: [{ student_id: ids.s12, score: 210, sections: { MAT: sec(12, 8, 40, 4) }, answers: {}, source: {} }],
    })
  })
  test.afterAll(clean)

  test('6. sınıf: Deneme Özeti; kartlar, Gelişim, Denemeler, Konular ve Veli raporu aynı kaynaktan', async ({ page }) => {
    await login(page, ...DEMO.rehber)
    await expect(page.getByRole('navigation', { name: 'Ana menü' })).toBeVisible()
    await page.goto(`/ogrenciler/${ids.s6}`)
    await expect(page.getByTestId('sinav-baglami')).toContainText('Deneme Özeti')
    await expect(page.getByText('Puan · PRF 6 Deneme 2')).toBeVisible()
    await expect(page.locator('.stats')).toContainText('320') // son denemenin puanı
    await expect(page.locator('.stats')).toContainText('20,00') // toplam net: Türkçe 9 + Matematik 11 (yalnız okunan dersler)
    await expect(page.getByRole('button', { name: 'Veli raporu' })).toBeEnabled()
    await expect(page.getByText('Dersler · son deneme')).toBeVisible()
    await expect(page.getByTestId('son-deneme-analizi')).toContainText('Öğrenme Çıktısı Analizi')
    await axe(page, '6 gelişim')
    await shot(page, 'p1-6-gelisim')

    await page.getByRole('tab', { name: 'Denemeler' }).click()
    await expect(page.getByRole('row').filter({ hasText: 'PRF 6 Deneme 1' })).toBeVisible()
    await expect(page.getByRole('row').filter({ hasText: 'PRF 6 Deneme 2' })).toContainText('Öğretmen raporu')

    await page.getByRole('tab', { name: 'Konular' }).click()
    const row = page.getByRole('row').filter({ hasText: 'MAT.6.1.1' })
    await expect(row).toContainText('2 denemede yanlış')
    await expect(row).toContainText('Matematik')
    await expect(page.locator('.stats')).toContainText('1') // tekrar eden hata kartı
    await axe(page, '6 konular')
    await row.getByRole('button', { name: 'Görev ata' }).click()
    await expect(page.getByRole('dialog')).toContainText('Görev ata')
    await page.getByRole('button', { name: 'Görevi ata' }).click()
    await expect(page.getByText('Görev atandı')).toBeVisible()
    const t = (await svc.from('tasks').select('subject, learning_outcome_id, outcome_code').eq('student_id', ids.s6).single()).data!
    expect([t.subject, !!t.learning_outcome_id, t.outcome_code]).toEqual(['MAT', true, null])

    await page.getByRole('tab', { name: 'Denemeler' }).click()
    await page.getByRole('row').filter({ hasText: 'PRF 6 Deneme 2' }).getByRole('button', { name: 'Veli raporu' }).click()
    await expect(page.getByRole('dialog', { name: 'Rapor' })).toContainText('PRF 6 Deneme 2')
    await expect(page.getByRole('dialog', { name: 'Rapor' })).toContainText('Matematik')
  })

  test('12. sınıf: YKS Özeti → TYT ve AYT ayrı; kartlar, Denemeler ve Konular seçili oturuma göre', async ({ page }) => {
    await login(page, ...DEMO.rehber)
    await expect(page.getByRole('navigation', { name: 'Ana menü' })).toBeVisible()
    await page.goto(`/ogrenciler/${ids.s12}`)
    const ctx = page.getByTestId('sinav-baglami')
    await expect(ctx).toContainText('YKS Özeti')
    // TYT: son TYT denemesi; net yalnız TYT (28 + 23 = 51), AYT ile toplanmaz
    await expect(page.getByText('Puan · PRF TYT 2')).toBeVisible()
    await expect(page.locator('.stats')).toContainText('51,00')
    await page.getByRole('tab', { name: 'Denemeler' }).click()
    await expect(page.getByRole('row').filter({ hasText: 'PRF TYT' })).toHaveCount(2)
    await expect(page.getByRole('row').filter({ hasText: 'PRF AYT' })).toHaveCount(0)
    await page.getByRole('tab', { name: 'Konular' }).click()
    await expect(page.getByRole('row').filter({ hasText: '9.1.1.1' })).toContainText('2 denemede yanlış') // eski program 9. sınıf (öğrenci grubu kuralı)
    await shot(page, 'p2-12-tyt-konular')

    await ctx.getByRole('button', { name: 'AYT' }).click()
    await expect(page.getByText('Puan · PRF AYT 1')).toBeVisible()
    await expect(page.locator('.stats')).toContainText('10,00') // yalnız AYT: 12 − 8/4
    await expect(page.getByText('Tekrar eden hata yok')).toBeVisible()
    await page.getByRole('tab', { name: 'Denemeler' }).click()
    await expect(page.getByRole('row').filter({ hasText: 'PRF AYT 1' })).toBeVisible()
    await expect(page.getByRole('row').filter({ hasText: 'PRF TYT' })).toHaveCount(0)
    await axe(page, '12 ayt')
  })

  test('12. sınıf yalnız AYT yoksa: açıklayıcı boş durum (TYT verisi AYT gibi gösterilmez)', async ({ page }) => {
    await svc.from('exams').delete().eq('name', 'PRF AYT 1')
    await login(page, ...DEMO.rehber)
    await expect(page.getByRole('navigation', { name: 'Ana menü' })).toBeVisible()
    await page.goto(`/ogrenciler/${ids.s12}`)
    await page.getByTestId('sinav-baglami').getByRole('button', { name: 'AYT' }).click()
    await expect(page.getByText('Henüz yayınlanmış AYT denemesi yok.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Veli raporu' })).toBeDisabled()
  })

  test('Sınıflar: bütün şubeler; 6/A genel analiz; denemesi olmayan şube boş durumla seçilebilir; 8/A LGS aynı', async ({ page }) => {
    await login(page, ...DEMO.rehber)
    await page.getByRole('link', { name: 'Sınıflar', exact: true }).click()
    const pick = page.locator('#clsPick')
    await expect(pick).toHaveValue('8/A') // ilk açılış mevcut davranış
    for (const c of ['6/A', '8/B', '10/A', '12/Q']) await expect(pick.locator('option', { hasText: c })).toHaveCount(1)
    await expect(page.getByRole('group', { name: 'Ders' }).getByRole('button', { name: 'İnkılap' })).toBeVisible() // 8: LGS dersleri
    await pick.selectOption('6/A')
    await expect(page.getByTestId('sinav-baglami')).toContainText('Deneme Özeti')
    await page.getByRole('group', { name: 'Ders' }).getByRole('button', { name: 'Matematik' }).click()
    await expect(page.getByRole('rowheader').filter({ hasText: 'MAT.6.1.1' })).toBeVisible()
    await expect(page.getByRole('columnheader', { name: 'PRF 6 Deneme 2' })).toBeVisible()
    await axe(page, 'sınıflar 6/A')
    await shot(page, 'p3-siniflar-6a')
    await pick.selectOption('10/A')
    await expect(page.getByText('Bu şubede yayınlanmış TYT denemesi yok.')).toBeVisible()
  })
})
