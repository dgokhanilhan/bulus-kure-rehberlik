// Hedef ve öneri: yönetici LGS listesini yükler (önizleme), öğrenci dosyası → Hedef: deneme puanına göre öneriler, hedef ekle/kaldır.
import { test, expect } from '@playwright/test'
import { DEMO, ELIF, login, loginAdmin, logout, openStudent, resetAdminMfa, service, shot } from './helpers'

const YIL = 2092
const CSV = [
  'Okul;İl;İlçe;Okul türü;Alan / dil;Taban puan;Yüzdelik;Kontenjan',
  'E2E Fen Lisesi;Bartın;Merkez;Fen Lisesi;İngilizce;495,1;0,5;150',
  'E2E Sosyal Bilimler Lisesi;Bartın;Merkez;Sosyal Bilimler Lisesi;;470,2;2,1;90',
  'E2E Anadolu Lisesi;Bartın;Merkez;Anadolu Lisesi;İngilizce;420,3;9,4;120',
  'E2E Kız Anadolu Lisesi;Bartın;Amasra;Anadolu Lisesi;;350,4;30,2;120',
  'E2E Mesleki Lise;Bartın;Ulus;Mesleki ve Teknik Anadolu Lisesi;;250,5;70,0;60',
  'okunamayan satır;;;;;;;',
].join('\n')

test.afterAll(async () => {
  await service().from('hedef_programlar').delete().eq('yil', YIL)
})

test('yönetici LGS listesini yükler; öğrenci dosyasında deneme puanına göre öneriler ve hedef', async ({ page }) => {
  test.setTimeout(120_000)
  page.on('dialog', (d) => d.accept())
  await resetAdminMfa()
  await loginAdmin(page)
  await page.goto('/yonetim?sekme=hedefler')
  await expect(page.getByTestId('hedef-ozet')).toContainText('ÖSYM 2025 Tablo-4')
  await expect(page.getByTestId('hedef-ozet')).toContainText('12265')
  await page.locator('#hdYil').fill(String(YIL))
  await page.locator('#hdDosya').setInputFiles({ name: 'lgs.csv', mimeType: 'text/csv', buffer: Buffer.from(CSV) })
  await expect(page.getByTestId('hedef-onizleme')).toContainText('5 satır okundu, 1 satır okunamadı')
  await shot(page, 'hedef-yukle')
  await page.getByRole('button', { name: 'Listeyi yükle' }).click()
  await expect(page.getByText('5 satır yüklendi.')).toBeVisible()
  await expect(page.getByTestId('hedef-ozet')).toContainText(String(YIL))

  await logout(page)
  await login(page, ...DEMO.rehber)
  await openStudent(page, ELIF, 'hedef')
  const sek = page.getByTestId('hedef-sekme')
  await expect(sek).toContainText('LGS deneme puanı')
  await expect(sek).toContainText('deneme puanına göre tahminidir')
  await expect(sek.getByTestId('hedef-oneri').first()).toBeVisible()
  const ilk = sek.getByTestId('hedef-oneri').first()
  const ad = (await ilk.locator('b').innerText()).trim()
  await ilk.getByRole('button', { name: /hedef olarak ekle/ }).click()
  await expect(page.getByText('Hedef eklendi.')).toBeVisible()
  await expect(sek.getByTestId('hedefler')).toContainText(ad)
  await shot(page, 'hedef-sekme')
  await sek.getByTestId('hedefler').getByRole('button', { name: /hedefini kaldır/ }).click()
  await expect(sek.getByTestId('hedefler')).toHaveCount(0)
})

test('öğrenci ve veli seçilen hedefleri Özet sayfasında görür (salt okunur)', async ({ page }) => {
  const svc = service()
  const p = (await svc.from('hedef_programlar').select('id, school_id').eq('yil', YIL).eq('kurum', 'E2E Anadolu Lisesi').single()).data!
  await svc.from('ogrenci_hedefleri').insert({ school_id: p.school_id, student_id: ELIF, program_id: p.id })
  await login(page, ...DEMO.ogrenci)
  await expect(page.getByRole('navigation', { name: 'Ana menü' })).toBeVisible()
  await page.goto('/ozet')
  const kart = page.getByTestId('aile-hedefler')
  await expect(kart.getByRole('heading', { name: 'Hedeflerin' })).toBeVisible()
  await expect(kart.getByTestId('aile-hedef')).toHaveCount(1)
  await expect(kart).toContainText('E2E Anadolu Lisesi')
  await expect(kart).toContainText(`${YIL} tabanı 420,3`)
  await expect(kart).toContainText('deneme puanına göre tahminidir')
  await expect(kart.getByRole('button')).toHaveCount(0)
  await shot(page, 'aile-hedefler-ogrenci')
  await logout(page)
  await login(page, ...DEMO.veli)
  await expect(page.getByRole('navigation', { name: 'Ana menü' })).toBeVisible()
  await page.goto('/ozet')
  await expect(page.getByTestId('aile-hedefler').getByRole('heading', { name: 'Hedefler' })).toBeVisible()
  await expect(page.getByTestId('aile-hedefler')).toContainText('E2E Anadolu Lisesi')
})

test('veli ve öğrenci Hedef sekmesini görmez', async ({ page }) => {
  await login(page, ...DEMO.veli)
  await page.goto(`/ogrenciler/${ELIF}?sekme=hedef`)
  await expect(page.getByTestId('hedef-sekme')).toHaveCount(0)
})
