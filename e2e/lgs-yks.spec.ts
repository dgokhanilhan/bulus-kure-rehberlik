// LGS/YKS uygunluğu: LGS yalnız 8. sınıf, YKS yalnız 12. sınıf (veri kaynağı yok → gösterilmez); seçili çocuğa göre.
// Ana sayfa düzeninde LGS kartı açık olsa da sınıf seviyesi aşılamaz; 8. sınıf olmayan çocukta deneme verisi sorgulanmaz.
import { test, expect, type Page } from '@playwright/test'
import { ELIF, login, logout, menu, service } from './helpers'

const svc = service()
const SCHOOL = '00000000-0000-4000-8000-000000000001'
const stamp = Date.now() % 100000
const V = { email: `e2e-lgs-${stamp}@ornek.com`, pass: 'Lgsyks123!', id: '' }
const W = { email: `e2e-lgs6-${stamp}@ornek.com`, pass: 'Lgsyks123!', id: '' }
const ids: { c12?: string; s6?: string; s12?: string } = {}

async function user(u: typeof V, name: string) {
  const { data, error } = await svc.auth.admin.createUser({
    email: u.email, password: u.pass, email_confirm: true,
    user_metadata: { school: 'bulus-kure', consent_version: 'v1', full_name: name, role: 'veli', declared: { childName: 'Deniz Altı', childClass: '6/A', relation: 'Anne' } },
  })
  if (error) throw error
  u.id = data.user.id
  await svc.from('profiles').update({ status: 'approved' }).eq('id', u.id)
}
const card = (page: Page, id: string) => page.locator(`section[data-card="${id}"]`)

test.describe.serial('LGS / YKS uygunluğu', () => {
  test.beforeAll(async () => {
    const c6 = (await svc.from('classes').select('id').eq('name', '6/A').single()).data!.id
    let c12 = (await svc.from('classes').select('id').eq('name', '12/A').maybeSingle()).data?.id
    if (!c12) c12 = (await svc.from('classes').insert({ school_id: SCHOOL, grade: 12, section: 'A' }).select('id').single()).data!.id
    ids.c12 = c12
    ids.s6 = (await svc.from('students').insert({ school_id: SCHOOL, full_name: 'Deniz Altı', class_id: c6, class_name: '6/A' }).select('id').single()).data!.id
    ids.s12 = (await svc.from('students').insert({ school_id: SCHOOL, full_name: 'Ece Onİki', class_id: c12, class_name: '12/A' }).select('id').single()).data!.id
    await user(V, 'Üç Çocuklu Veli')
    await user(W, 'Altıncı Veli')
    await svc.from('parent_links').insert([
      { parent_id: V.id, student_id: ids.s6, relation: 'Anne' },
      { parent_id: V.id, student_id: ELIF, relation: 'Anne' },
      { parent_id: V.id, student_id: ids.s12, relation: 'Anne' },
      { parent_id: W.id, student_id: ids.s6, relation: 'Baba' },
    ])
  })
  test.afterAll(async () => {
    for (const u of [V, W]) if (u.id) await svc.auth.admin.deleteUser(u.id)
    await svc.from('students').delete().in('id', [ids.s6!, ids.s12!])
    await svc.from('classes').delete().eq('id', ids.c12!)
  })

  test('çok çocuklu veli: kart seçili çocuğa göre (6 → yok, 8 → LGS, 12 → yok)', async ({ page }) => {
    await login(page, V.email, V.pass)
    // Çok çocuklu veli önce öğrencisini seçer
    await page.getByRole('group', { name: 'Öğrenciler' }).getByRole('button').filter({ hasText: 'Deniz Altı' }).click()
    await expect(menu(page)).toContainText(['LGS özeti']) // ailede 8. sınıf var
    const kid = page.getByRole('group', { name: 'Çocuk' })
    await kid.getByRole('button', { name: 'Deniz' }).click()
    await expect(card(page, 'odev')).toBeVisible()
    await expect(card(page, 'lgs')).toHaveCount(0)
    await kid.getByRole('button', { name: 'Elif' }).click()
    await expect(card(page, 'lgs')).toBeVisible()
    await kid.getByRole('button', { name: 'Ece' }).click() // 12 → 8'den geçiş
    await expect(card(page, 'odev')).toBeVisible()
    await expect(card(page, 'lgs')).toHaveCount(0)
    await expect(page.getByText(/YKS|TYT|AYT/)).toHaveCount(0) // sahte YKS verisi yok
  })

  test('Özet: 6. sınıfta LGS bölümü ve deneme sorgusu yok, notlar ve etütler var; 8. sınıfta LGS var', async ({ page }) => {
    const questions: string[] = []
    page.on('request', (r) => r.url().includes('/rest/v1/exam_questions') && questions.push(r.url()))
    await login(page, V.email, V.pass)
    await page.getByRole('group', { name: 'Öğrenciler' }).getByRole('button').filter({ hasText: 'Deniz Altı' }).click()
    await expect(page.getByRole('navigation', { name: 'Ana menü' })).toBeVisible()
    await page.goto('/ozet')
    await expect(page.getByRole('heading', { name: "Deniz'in durumu" })).toBeVisible()
    await expect(page.getByText('Öğretmen notları')).toBeVisible()
    await expect(page.getByText('Cumartesi etütleri')).toBeVisible()
    await expect(page.getByRole('region', { name: 'LGS gelişimi' })).toHaveCount(0)
    await expect(page.getByText('Toplam net')).toHaveCount(0)
    expect(questions).toEqual([])
    await page.getByRole('group', { name: 'Çocuk' }).getByRole('button', { name: 'Elif' }).click()
    await expect(page.getByRole('region', { name: 'LGS gelişimi' })).toBeVisible()
    expect(questions.length).toBeGreaterThan(0)
    await logout(page)
  })

  test('yalnız 6. sınıf çocuğu olan veli: menüde "LGS özeti" yerine "Özet"', async ({ page }) => {
    await login(page, W.email, W.pass)
    await expect(menu(page)).toHaveText(['Ana sayfa', 'Özet', 'Okul', 'Ödevler', 'Takvim', 'Duyurular', /^İletişim/, 'Görevler', 'Raporlar', 'Görüşmeler'])
    await expect(card(page, 'lgs')).toHaveCount(0) // ana sayfa düzeninde LGS kartı açık (varsayılan) olsa da
    await logout(page)
  })
})
