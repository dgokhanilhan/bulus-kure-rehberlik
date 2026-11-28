// Görev ata: yeni görevde birden çok konu seçilir, her konu ayrı görev olarak tek istekte eklenir.
// Düzenlemede tek konu kalır. Yazılan konu seçilenlere eklenir.
import { test, expect } from '@playwright/test'
import { DEMO, ELIF, login, openStudent, service } from './helpers'

const svc = service()
const NOT = 'E2E çoklu konu görevi'

async function temizle() {
  await svc.from('tasks').delete().eq('student_id', ELIF).eq('note', NOT)
}

test.describe.serial('Görev ata: çoklu konu', () => {
  test.beforeAll(temizle)
  test.afterAll(temizle)

  test('iki kazanım + yazılan konu → üç ayrı görev; düzenlemede tek seçim', async ({ page }) => {
    await login(page, ...DEMO.rehber)
    await openStudent(page, ELIF, 'gorevler')
    await page.getByRole('button', { name: 'Görev ata' }).first().click()
    const dlg = page.getByRole('dialog', { name: 'Görev ata' })
    const grup = dlg.getByRole('group', { name: 'Konu' })
    await expect(dlg.getByText('birden çok seçebilirsin', { exact: false })).toBeVisible()

    const secili = grup.locator('button[aria-pressed="true"]')
    while ((await secili.count()) > 0) await secili.first().click()
    await expect(dlg.getByRole('button', { name: 'Görevi ata' })).toBeVisible()

    const k1 = grup.getByRole('button').nth(0)
    const k2 = grup.getByRole('button').nth(1)
    await k1.click()
    await k2.click()
    await expect(k1).toHaveAttribute('aria-pressed', 'true')
    await expect(k2).toHaveAttribute('aria-pressed', 'true')
    await expect(dlg.getByRole('button', { name: '2 görevi ata' })).toBeVisible()
    await expect(dlg.getByRole('status')).toContainText('2 ayrı görev atanacak · her biri 20 soru, toplam 40 soru')

    // Seçimi kaldırıp yeniden seç: tıklama açar/kapatır
    await k2.click()
    await expect(k2).toHaveAttribute('aria-pressed', 'false')
    await expect(dlg.getByRole('button', { name: 'Görevi ata' })).toBeVisible()
    await k2.click()

    await dlg.getByLabel('Başka bir konu yaz').fill('E2E karışık tekrar')
    await dlg.getByLabel('Not (isteğe bağlı)').fill(NOT)
    await expect(dlg.getByRole('button', { name: '3 görevi ata' })).toBeVisible()
    await dlg.getByRole('button', { name: '3 görevi ata' }).click()
    await expect(page.getByText('3 görev atandı')).toBeVisible()
    await expect(dlg).toHaveCount(0)

    const { data } = await svc.from('tasks').select('topic, outcome_code, question_count').eq('student_id', ELIF).eq('note', NOT)
    expect(data).toHaveLength(3)
    expect(data!.every((t) => t.question_count === 20)).toBe(true)
    expect(data!.filter((t) => t.outcome_code).length).toBe(2)
    expect(new Set(data!.map((t) => t.outcome_code)).size).toBe(3) // iki farklı kazanım + yazılan (null)
    expect(data!.some((t) => t.topic === 'E2E karışık tekrar' && t.outcome_code === null)).toBe(true)

    // Düzenleme: tek konu seçilir (başka konuya tıklayınca öncekinin yerine geçer)
    const kart = page.getByTestId('task-card').filter({ hasText: 'E2E karışık tekrar' })
    await kart.getByRole('button', { name: /Düzenle/ }).click()
    const duz = page.getByRole('dialog', { name: 'Görevi düzenle' })
    await expect(duz.getByText('birden çok seçebilirsin', { exact: false })).toHaveCount(0)
    await duz.getByLabel('Başka bir konu yaz').fill('')
    const d1 = duz.getByRole('group', { name: 'Konu' }).getByRole('button').nth(0)
    const d2 = duz.getByRole('group', { name: 'Konu' }).getByRole('button').nth(1)
    await d1.click()
    await d2.click()
    await expect(duz.getByRole('group', { name: 'Konu' }).locator('button[aria-pressed="true"]')).toHaveCount(1)
    await expect(duz.getByRole('button', { name: 'Kaydet' })).toBeVisible()
  })
})
