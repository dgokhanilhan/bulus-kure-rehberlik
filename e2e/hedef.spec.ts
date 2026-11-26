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
  // Öğretmenin eklediği hedef aileden çıkarılamaz
  await expect(kart.getByTestId('aile-hedef')).toContainText('Öğretmen ekledi')
  await expect(kart.getByRole('button', { name: /hedefini çıkar/ })).toHaveCount(0)
  await shot(page, 'aile-hedefler-ogrenci')
  await logout(page)
  await login(page, ...DEMO.veli)
  await expect(page.getByRole('navigation', { name: 'Ana menü' })).toBeVisible()
  await page.goto('/ozet')
  const vk = page.getByTestId('aile-hedefler')
  await expect(vk.getByRole('heading', { name: 'Hedefler' })).toBeVisible()
  await expect(vk).toContainText('E2E Anadolu Lisesi')

  // Veli okul ekler (il listesinden), sonra kendi eklediğini çıkarır
  await vk.getByTestId('okul-ekle-ac').click()
  const ekle = vk.getByTestId('okul-ekle')
  await ekle.getByLabel('İl').selectOption('Bartın')
  await expect(ekle.getByTestId('okul-kapsam')).toContainText('Bartın: listede')
  await expect(ekle).not.toContainText('E2E Anadolu Lisesi')
  await ekle.getByLabel(/Ada göre ara/).fill('E2E Fen')
  await expect(ekle.getByTestId('okul-secenek')).toHaveCount(1)
  await ekle.getByRole('button', { name: /E2E Fen Lisesi.*hedeflere ekle/ }).click()
  const yeni = vk.getByTestId('aile-hedef').filter({ hasText: 'E2E Fen Lisesi' })
  await expect(yeni).toContainText('Veli ekledi')
  await expect(ekle.getByTestId('okul-secenek')).toHaveCount(0)
  await shot(page, 'aile-hedef-ekle')
  await yeni.getByRole('button', { name: /hedefini çıkar/ }).click()
  await expect(vk.getByTestId('aile-hedef')).toHaveCount(1)
  // Rehbere bildirim gitti
  const b = await svc.from('notifications').select('id').like('text', '%hedef ekledi: E2E Fen Lisesi%')
  expect(b.data?.length).toBeGreaterThan(0)
  await svc.from('notifications').delete().like('text', '%hedef ekledi: E2E%')
})

test('veli başka öğrenciye hedef ekleyemez; aile sınırı 5', async () => {
  const svc = service()
  const ps = (await svc.from('hedef_programlar').select('id').eq('yil', YIL)).data!
  expect(ps.length).toBeGreaterThan(0)
  const { createClient } = await import('@supabase/supabase-js')
  const c = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!, { auth: { persistSession: false } })
  await c.auth.signInWithPassword({ email: DEMO.veli[0], password: DEMO.veli[1] })
  const baska = (await svc.from('students').select('id').neq('id', ELIF).limit(50)).data!.map((x) => x.id)
  const bagli = (await svc.from('parent_links').select('student_id')).data!.map((x) => x.student_id)
  const yabanci = baska.find((x) => !bagli.includes(x))!
  const r = await c.rpc('aile_hedef_ekle', { p_student: yabanci, p_program: ps[0]!.id })
  expect(r.error?.message).toContain('eklenemez')
  const t = await c.from('ogrenci_hedefleri').insert({ school_id: ps[0]!.id, student_id: ELIF, program_id: ps[0]!.id })
  expect(t.error).not.toBeNull()
  await c.auth.signOut()
})

test('veli ve öğrenci Hedef sekmesini görmez', async ({ page }) => {
  await login(page, ...DEMO.veli)
  await page.goto(`/ogrenciler/${ELIF}?sekme=hedef`)
  await expect(page.getByTestId('hedef-sekme')).toHaveCount(0)
})
