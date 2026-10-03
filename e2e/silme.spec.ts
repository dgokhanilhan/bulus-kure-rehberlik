// Öğrenci silme (rehber): ad yazılarak onaylanır, listeden kalkar.
import { test, expect } from '@playwright/test'
import { DEMO, login, openStudent, service, ELIF } from './helpers'

test('rehber öğrenciyi siler; branş öğretmeni silme düğmesini görmez', async ({ page }) => {
  const { data: st } = await service()
    .from('students')
    .insert({ school_id: '00000000-0000-4000-8000-000000000001', full_name: 'E2E Silinecek Öğrenci', class_name: '8/C' })
    .select('id')
    .single()
  await login(page, ...DEMO.matematik)
  await openStudent(page, ELIF) // branş öğretmeni yalnız ders verdiği sınıfı (8/A) açabilir (0023)
  await expect(page.getByRole('button', { name: 'Öğrenciyi sil' })).toHaveCount(0)
  await page.getByRole('button', { name: /^Profil:/ }).click()
  await page.getByRole('menuitem', { name: 'Çıkış yap' }).click()

  await login(page, ...DEMO.rehber)
  await openStudent(page, st!.id)
  await page.getByRole('button', { name: 'Öğrenciyi sil' }).click()
  const dlg = page.getByRole('dialog', { name: 'Öğrenciyi sil' })
  await dlg.getByLabel(/Onaylamak için/).fill('e2e silinecek öğrenci') // büyük/küçük harf fark etmez
  await dlg.getByRole('button', { name: 'Kalıcı olarak sil' }).click()
  await expect(page).toHaveURL(/\/ogrenciler$/)
  await expect(page.getByText('E2E Silinecek Öğrenci silindi')).toBeVisible()
  await expect(page.getByRole('row', { name: 'E2E Silinecek Öğrenci dosyası' })).toHaveCount(0)
})
