// Etütlerim: yoklama yalnız etüt günü açık; geçmiş etütler kapalı sekmede ve salt okunur. Veli toplantısında katılım ve ödev istatistiği.
import { test, expect } from '@playwright/test'
import { DEMO, login, logout, menu, service } from './helpers'

const TARIH = '2026-10-24' // Cumartesi
test('geçmiş etüt kapalı sekmede salt okunur; etüt gününde yoklama açık; veli toplantısında katılım görünür', async ({ page }) => {
  test.setTimeout(120_000)
  const svc = service()
  await svc.from('etut_gunler').delete().eq('tarih', TARIH)
  const ogretmen = (await svc.from('profiles').select('id, full_name, school_id').eq('email', DEMO.matematik[0]).single()).data!
  const ogr = (await svc.from('students').select('id, full_name, class_name').eq('school_id', ogretmen.school_id).eq('class_name', '8/B').limit(1).single()).data!
  const saat = Array.from({ length: 5 }, (_, i) => ({ bas: `0${i + 1}:00`, bit: `0${i + 1}:40` }))
  const gun = (await svc.from('etut_gunler').insert({ school_id: ogretmen.school_id, tarih: TARIH, kademe: 'ortaokul', saatler: saat, durum: 'yayinda' }).select('id').single()).data!
  const h = (await svc.from('etut_hucreler').insert({ gun_id: gun.id, school_id: ogretmen.school_id, ders: 1, teacher_id: ogretmen.id, teacher_name: ogretmen.full_name, tur: 'etut', konu: 'Üslü ifadeler' }).select('id').single()).data!
  await svc.from('etut_ogrenciler').insert({ hucre_id: h.id, gun_id: gun.id, school_id: ogretmen.school_id, ders: 1, student_id: ogr.id, student_name: ogr.full_name, class_name: ogr.class_name, yoklama: 'gelmedi' })
  try {
    await login(page, ...DEMO.matematik)
    await menu(page).filter({ hasText: 'Etüt' }).click()
    const sekme = page.getByRole('button', { name: /^Geçmiş etütler \(\d+\)/ })
    await expect(sekme).toHaveAttribute('aria-expanded', 'false')
    await expect(page.getByTestId('gecmis-etutler')).toHaveCount(0)
    await sekme.click()
    const gecmis = page.getByTestId('gecmis-etutler')
    await expect(gecmis).toContainText('Üslü ifadeler')
    await expect(gecmis).toContainText('Gelmedi')
    await expect(gecmis.getByRole('button')).toHaveCount(0)

    // Etüt günü: aynı etüt üstte, yoklama düğmeleri açık
    await page.clock.setFixedTime(new Date(`${TARIH}T10:00:00+03:00`))
    await page.reload()
    const kart = page.locator('.et-item').filter({ hasText: 'Üslü ifadeler' })
    await expect(kart.getByRole('button', { name: 'Gelmedi' })).toHaveAttribute('aria-pressed', 'true')
    await page.clock.setFixedTime(new Date())

    // Veli toplantısı (rehber)
    await logout(page)
    await login(page, ...DEMO.rehber)
    await expect(menu(page).first()).toBeVisible()
    await page.goto('/ogrenciler?sinif=8%2FB&gorunum=veli-toplantisi')
    await page.getByTestId('vt-ogrenci').filter({ hasText: ogr.full_name }).click()
    await expect(page.getByTestId('vt-metin')).toContainText('Etütler')
    await expect(page.getByTestId('vt-metin')).toContainText('1 tanesine gelmemiş')
    await expect(page.getByTestId('vt-metin')).toContainText('Üslü ifadeler')
    await expect(page.getByTestId('vt-odev-istatistik')).toContainText(/ödev/)
  } finally {
    await svc.from('etut_gunler').delete().eq('id', gun.id)
  }
})
