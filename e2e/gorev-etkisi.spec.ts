// Görevin etkisi ("işe yaradı mı?"): kazanıma bağlı görevden sonraki denemelerde konunun gidişi görev kartında görünür.
// Hesap istemcide, mevcut deneme verisinden yapılır; kazanıma bağlı olmayan görevde satır çıkmaz.
import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { DEMO, ELIF, login, service, shot } from './helpers'

const svc = service()
const IZ = 'E2E etki'
const temizle = async () => {
  await svc.from('tasks').delete().like('topic', `${IZ}%`)
}
test.beforeAll(temizle)
test.afterAll(temizle)

test('rehber ve veli: kazanımlı görevde sonraki denemelerin durumu görünür; kazanımsız görevde görünmez', async ({ page, browser }) => {
  const rehberId = (await svc.from('profiles').select('id').eq('email', DEMO.rehber[0]).single()).data!.id
  const taban = { student_id: ELIF, subject: 'DIN', question_count: 10, due_date: '2030-01-01', created_by: rehberId, parent_visible: true }
  // Görev bütün denemelerden önce verilmiş: sonraki denemeler "sonra" sayılır
  const a = await svc.from('tasks').insert({ ...taban, topic: `${IZ} kazanımlı`, outcome_code: 'D.8.2', created_at: '2020-01-01T08:00:00Z' })
  expect(a.error).toBeNull()
  // Görev bugün verilmiş: sonra deneme yok
  const b = await svc.from('tasks').insert({ ...taban, topic: `${IZ} yeni`, outcome_code: 'D.8.2' })
  expect(b.error).toBeNull()
  const c = await svc.from('tasks').insert({ ...taban, topic: `${IZ} kazanımsız`, created_at: '2020-01-01T08:00:00Z' })
  expect(c.error).toBeNull()

  await login(page, ...DEMO.rehber)
  await expect(page.getByRole('navigation', { name: 'Ana menü' })).toBeVisible()
  await page.emulateMedia({ reducedMotion: 'reduce' }) // giriş animasyonu sürerken kontrast ölçülmesin
  await page.goto(`/ogrenciler/${ELIF}?sekme=gorevler`)
  const kart = (ad: string) => page.getByTestId('task-card').filter({ hasText: `${IZ} ${ad}` })
  await expect(kart('kazanımlı')).toBeVisible()
  // Sonraki denemelerin durumu: üç olgudan biri ve geçmiş dökümü
  await expect(kart('kazanımlı').getByTestId('gorev-etki')).toContainText(/doğru|yine yanlış var|boş bırakıldı/)
  await expect(kart('kazanımlı').getByTestId('gorev-etki')).toContainText(/Sonra: (doğru|yanlış|boş)/)
  await expect(kart('yeni').getByTestId('gorev-etki')).toHaveText('Görevden sonraki denemelerde bu konu henüz sorulmadı.')
  await expect(kart('kazanımsız').getByTestId('gorev-etki')).toHaveCount(0)
  await expect(page.getByTestId('gorev-etki-ozet')).toContainText(/görevin \d+'inde konu doğruya döndü/)
  await page.waitForTimeout(400)
  const axe = await new AxeBuilder({ page }).include('main').withTags(['wcag2a', 'wcag2aa']).analyze()
  expect(axe.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')).toEqual([])
  await shot(page, 'gorev-etkisi')

  // Veli: olgu görünür, teknik döküm ve "henüz sorulmadı" satırı görünmez; etiketleyici ifade yok
  const veli = await (await browser.newContext()).newPage()
  await login(veli, ...DEMO.veli)
  await expect(veli.getByRole('navigation', { name: 'Ana menü' })).toBeVisible()
  await veli.goto('/gorevler')
  const vk = (ad: string) => veli.getByTestId('task-card').filter({ hasText: `${IZ} ${ad}` })
  await expect(vk('kazanımlı').getByTestId('gorev-etki')).toBeVisible()
  await expect(vk('kazanımlı').getByTestId('gorev-etki')).not.toContainText('Sonra:')
  await expect(vk('yeni').getByTestId('gorev-etki')).toHaveCount(0)
  await expect(veli.locator('main')).not.toContainText(/başarısız|yetersiz|kötü/i)
  await shot(veli, 'gorev-etkisi-veli')
})
