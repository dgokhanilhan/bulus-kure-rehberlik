// Yönetim → Veri sağlığı: boş tekrar kaydı birleştirilir, ad yazımı düzeltilip geri alınır, aynı sınıfta aynı adla kayıtta uyarı çıkar.
import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { loginAdmin, resetAdminMfa, service, shot } from './helpers'

const OKUL = '00000000-0000-4000-8000-000000000001'

test.describe.serial('Veri sağlığı', () => {
  const ids: string[] = []
  test.afterAll(async () => {
    if (ids.length) await service().from('students').delete().in('id', ids)
  })

  test('boş tekrar kaydı birleşir; ad düzeltme geri alınabilir; kayıt formunda aynı ad uyarısı', async ({ page }) => {
    const svc = service()
    const { data } = await svc
      .from('students')
      .insert([
        { school_id: OKUL, full_name: 'E2E Tekrar Öğrenci', class_name: '8/C', school_no: '99901' },
        { school_id: OKUL, full_name: 'E2E TEKRAR ÖĞRENCİ', class_name: '8/C' },
        { school_id: OKUL, full_name: 'ışıl ADDÜZELT', class_name: '8/C' },
      ])
      .select('id, full_name')
    ids.push(...data!.map((r) => r.id))
    const bos = data!.find((r) => r.full_name === 'E2E TEKRAR ÖĞRENCİ')!.id
    const adli = data!.find((r) => r.full_name === 'ışıl ADDÜZELT')!.id

    await resetAdminMfa()
    await loginAdmin(page)
    await page.goto('/yonetim?sekme=veri_sagligi')
    await expect(page.getByRole('heading', { name: 'Veri sağlığı', level: 2 })).toBeVisible()

    // Tekrar: verisi olmayan kayıt, okul numarası olana birleştirilir
    const grup = page.getByTestId('vs-grup').filter({ hasText: 'E2E Tekrar Öğrenci · 8/C · no 99901' })
    await expect(grup.getByText('aynı sınıfta')).toBeVisible()
    await expect(grup.getByText('veri yok').first()).toBeVisible()
    await grup.getByRole('button', { name: 'Birleştir' }).click()
    const dlg = page.getByRole('dialog', { name: 'Kayıtları birleştir' })
    await expect(dlg).toContainText('E2E TEKRAR ÖĞRENCİ · 8/C')
    await dlg.getByRole('button', { name: 'Birleştir' }).click()
    await expect(page.getByText('E2E Tekrar Öğrenci kayıtları birleştirildi')).toBeVisible()
    await expect(grup).toHaveCount(0)
    expect((await svc.from('students').select('id').eq('id', bos)).data).toEqual([])

    // Ad yazımı: yalnız kendi satırımızı düzelt (demo verisindeki diğer adlara dokunma), sonra geri al
    const kart = page.locator('section', { has: page.getByRole('heading', { name: 'Ad yazımı tutarsız' }) })
    const tumu = kart.getByRole('button', { name: /^Tümünü gör/ })
    if (await tumu.isVisible()) await tumu.click()
    await expect(kart.getByRole('cell', { name: 'Işıl Addüzelt', exact: true })).toBeVisible()
    for (const cb of await kart.getByRole('checkbox').all()) {
      if ((await cb.getAttribute('aria-label')) !== 'ışıl ADDÜZELT düzeltilsin') await cb.uncheck()
    }
    await kart.getByRole('button', { name: '1 adı düzelt' }).click()
    await expect(page.getByText('1 ad düzeltildi')).toBeVisible()
    await expect.poll(async () => (await svc.from('students').select('full_name').eq('id', adli).single()).data?.full_name).toBe('Işıl Addüzelt')
    await kart.getByRole('button', { name: 'Geri al' }).click()
    await expect(page.getByText('1 ad eski hâline döndü')).toBeVisible()
    await expect.poll(async () => (await svc.from('students').select('full_name').eq('id', adli).single()).data?.full_name).toBe('ışıl ADDÜZELT')

    // Erişilebilirlik (animasyonlar bitince)
    await page.evaluate(() =>
      Promise.all(
        document
          .getAnimations()
          .filter((a) => a.effect?.getComputedTiming().endTime !== Infinity)
          .map((a) => a.finished.catch(() => null)),
      ),
    )
    const axe = await new AxeBuilder({ page }).include('.ymc').withTags(['wcag2a', 'wcag2aa']).analyze()
    expect(axe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id)).toEqual([])
    await shot(page, 'veri-sagligi')
    await page.setViewportSize({ width: 375, height: 800 })
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0)
    await shot(page, 'veri-sagligi-telefon')
    await page.setViewportSize({ width: 1280, height: 800 })

    // Kayıt formu: aynı sınıfta aynı adla öğrenci eklerken uyarı, ikinci Kaydet'te eklenir
    await page.goto('/yonetim?sekme=ogrenciler')
    await page.getByRole('button', { name: /Öğrenci ekle/ }).first().click()
    const form = page.getByRole('dialog', { name: 'Öğrenci ekle' })
    await form.getByLabel('Ad soyad').fill('e2e tekrar ogrenci')
    await form.getByLabel('Sınıf').selectOption({ label: '8/C' })
    await form.getByRole('button', { name: 'Kaydet' }).click()
    await expect(form.getByRole('alert')).toContainText('Bu sınıfta aynı adla bir öğrenci var: E2E Tekrar Öğrenci (no 99901)')
    await form.getByRole('button', { name: 'Vazgeç' }).click()
  })
})
