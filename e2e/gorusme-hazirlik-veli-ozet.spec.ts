// Görüşme hazırlık kartı + kararlar (karar → görev, "yapıldı mı?"). Veli haftalık özeti 0081 ile kaldırıldı.
import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { DEMO, ELIF, login, service, shot } from './helpers'

const svc = service()
const KARAR = 'E2E karar: her akşam 20 paragraf'
const temizle = async () => {
  await svc.from('gorusme_karar').delete().eq('student_id', ELIF)
  await svc.from('veli_ozet').delete().eq('student_id', ELIF)
  await svc.from('tasks').delete().like('topic', 'E2E karar%')
}
test.beforeAll(temizle)
test.afterAll(temizle)

test('rehber: karar yazar, göreve çevirir, yapıldı işaretler; haftalık özet kartı yok', async ({ page }) => {
  await login(page, ...DEMO.rehber)
  await expect(page.getByRole('navigation', { name: 'Ana menü' })).toBeVisible()
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(`/ogrenciler/${ELIF}?sekme=gorusmeler`)
  const hazirlik = page.getByTestId('gorusme-hazirlik')
  await expect(hazirlik).toBeVisible()
  await expect(hazirlik).toContainText('Son denemeler')
  await expect(hazirlik).toContainText('Bekleyen karar yok.')

  // Karar ekle → göreve çevir (konu kararın metniyle dolu gelir)
  const kararlar = page.getByTestId('gorusme-kararlari')
  await kararlar.getByLabel('Karar', { exact: true }).fill(KARAR)
  await kararlar.getByRole('button', { name: 'Kararı ekle' }).click()
  const satir = kararlar.getByTestId('karar-satir').filter({ hasText: KARAR })
  await expect(satir).toBeVisible()
  await expect(hazirlik.getByTestId('hazirlik-karar').filter({ hasText: KARAR })).toBeVisible()
  await satir.getByRole('button', { name: 'Göreve çevir' }).click()
  const modal = page.getByRole('dialog')
  await expect(modal.locator('#tKonuOther')).toHaveValue(KARAR)
  await modal.getByRole('button', { name: 'Görevi ata' }).click()
  await expect(modal).toHaveCount(0)
  await expect(satir).toContainText(`Görev: ${KARAR}`)
  await expect(satir.getByRole('button', { name: 'Göreve çevir' })).toHaveCount(0)
  await expect(hazirlik.getByTestId('hazirlik-karar').filter({ hasText: KARAR })).toContainText('görev açık')
  await page.waitForTimeout(400)
  const axe = await new AxeBuilder({ page }).include('main').withTags(['wcag2a', 'wcag2aa']).analyze()
  expect(axe.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')).toEqual([])
  await shot(page, 'gorusme-hazirlik')

  // Bir sonraki görüşmede "yapıldı mı?": yapıldı → hazırlıktan düşer, listede "Yapıldı"
  await hazirlik.getByTestId('hazirlik-karar').filter({ hasText: KARAR }).getByRole('button', { name: 'Yapıldı' }).click()
  await expect(hazirlik.getByTestId('hazirlik-karar')).toHaveCount(0)
  await expect(satir).toContainText('Yapıldı')

  // Veli haftalık özeti kaldırıldı (0081): Raporlar sekmesinde kart yok
  await page.goto(`/ogrenciler/${ELIF}?sekme=raporlar`)
  await expect(page.getByRole('tab', { name: 'Raporlar' })).toBeVisible()
  await expect(page.getByTestId('haftalik-ozet')).toHaveCount(0)
})

test('branş öğretmeni görüşme kararlarını ve haftalık özet kartını görmez', async ({ page }) => {
  await login(page, ...DEMO.matematik)
  await expect(page.getByRole('navigation', { name: 'Ana menü' })).toBeVisible()
  await page.goto(`/ogrenciler/${ELIF}?sekme=gorusmeler`)
  await expect(page.getByText('Görüşmeleri rehberlik servisi planlar ve yönetir.')).toBeVisible()
  await expect(page.getByTestId('gorusme-kararlari')).toHaveCount(0)
  await page.goto(`/ogrenciler/${ELIF}?sekme=raporlar`)
  await expect(page.getByTestId('haftalik-ozet')).toHaveCount(0)
})
