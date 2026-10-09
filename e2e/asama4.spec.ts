// Aşama 4 · docs/test-senaryolari.md §6 Raporlar (yapay zekâ: yerel sahte DeepSeek).
import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { DEMO, ELIF, login, logout, openStudent, shot } from './helpers'

/** PDF metnini MuPDF (legacy motor) ile çıkarır: metin seçilebilir mi, Türkçe karakterler doğru mu. */
async function pdfText(path: string) {
  // @ts-expect-error — saf JS
  const { default: mupdf } = await import('../public/engine/mupdf/mupdf.js')
  const doc = mupdf.Document.openDocument(new Uint8Array(readFileSync(path)), 'application/pdf')
  const pages = doc.countPages()
  let text = ''
  for (let i = 0; i < pages; i++) text += doc.loadPage(i).toStructuredText().asText() + '\n'
  return { pages, text }
}

test.describe.serial('§6 Raporlar', () => {
  test('6.1–6.2 veli raporu: yapay zekâ ile yaz, mentör yorumunu düzenle, kaydet, veliye ve öğrenciye gönder', async ({ page }) => {
    await login(page, ...DEMO.rehber)
    await openStudent(page, ELIF, 'denemeler')
    const row = page.getByRole('row').filter({ hasText: 'TG-5' })
    await expect(row.getByRole('button', { name: 'Öğretmen raporu' })).toBeVisible()
    await row.getByRole('button', { name: 'Veli raporu' }).click()
    const paper = page.getByTestId('report-paper')
    await expect(paper).toContainText('Veli Gelişim Raporu')
    // kural tabanlı taslak hazır
    await expect(page.getByLabel('Genel değerlendirme')).not.toHaveValue('')

    await page.getByRole('button', { name: 'Yapay zekâ ile yaz' }).click()
    await expect(page.getByText('Metin yapay zekâ tarafından senin kurallarınla yazıldı.')).toBeVisible()
    await expect(page.getByLabel('Genel değerlendirme')).toHaveValue(/^Öğrencimiz TG-5 sonucunda/)
    await page.getByLabel('Mentör yorumu').fill('E2E mentör: Elif ile haftalık matematik planını birlikte takip edeceğiz.')
    await page.getByLabel('Rehber öğretmen yorumu').fill('E2E rehber: Planlı çalışma alışkanlığı gelişiyor.')
    await page.getByRole('button', { name: 'Kaydet' }).click()
    await expect(page.getByText('Rapor kaydedildi')).toBeVisible()
    await page.getByTestId('report-paper').evaluate((el) => el.closest('.rwrap')!.scrollTo(0, 0))
    await shot(page, '21-veli-raporu', false)

    await page.getByRole('button', { name: 'Gönder' }).first().click()
    const rec = page.getByRole('group', { name: 'Alıcılar' })
    await rec.getByRole('checkbox', { name: /Öğrenci/ }).click()
    await rec.getByRole('button', { name: 'Gönder' }).click()
    await expect(page.getByText('Gönderildi · 2 kişi')).toBeVisible()
    await page.getByRole('button', { name: 'Kapat' }).click()
    await logout(page)

    for (const who of [DEMO.veli, DEMO.ogrenci]) {
      await login(page, who[0], who[1])
      await page.getByRole('button', { name: /^Bildirimler/ }).click()
      await page.getByRole('dialog', { name: 'Bildirimler' }).getByText('TG-5 gelişim raporu geldi: Elif Yıldız').click()
      await expect(paper).toContainText('E2E mentör: Elif ile haftalık matematik planını birlikte takip edeceğiz.')
      await expect(paper).toContainText('E2E rehber: Planlı çalışma alışkanlığı gelişiyor.')
      await expect(page.getByRole('button', { name: 'Kaydet' })).toHaveCount(0) // salt okunur
      await page.getByRole('button', { name: 'Kapat' }).click()
      await page.getByRole('navigation', { name: 'Ana menü' }).getByText('Raporlar').click()
      await expect(page.getByTestId('report-row').filter({ hasText: 'TG-5 · Gelişim raporu' })).toBeVisible()
      await logout(page)
    }
  })

  test('6.3 öğretmen raporu → tüm öğretmenler → matematik öğretmeni zilden açar', async ({ page }) => {
    await login(page, ...DEMO.rehber)
    await openStudent(page, ELIF, 'denemeler')
    await page.getByRole('row').filter({ hasText: 'TG-5' }).getByRole('button', { name: 'Öğretmen raporu' }).click()
    await expect(page.getByTestId('report-paper')).toContainText('Öğretmen Bilgilendirme Raporu')
    await expect(page.getByTestId('report-paper')).not.toContainText('Rehberlik görüşmesi: aile içi durum') // rehber-gizli not girmez
    await page.getByLabel('Toplantı gündemi').fill('E2E gündem: matematikte tekrar eden hatalar.')
    await page.getByRole('button', { name: 'Gönder' }).first().click()
    await page.getByRole('group', { name: 'Alıcılar' }).getByRole('checkbox', { name: 'Tüm öğretmenler' }).click()
    await page.getByRole('group', { name: 'Alıcılar' }).getByRole('button', { name: 'Gönder' }).click()
    await expect(page.getByText(/Gönderildi · \d kişi/)).toBeVisible()
    await shot(page, '22-ogretmen-raporu', false)
    await page.getByRole('button', { name: 'Kapat' }).click()
    await logout(page)

    await login(page, ...DEMO.matematik)
    await page.getByRole('button', { name: /^Bildirimler/ }).click()
    await page.getByRole('dialog', { name: 'Bildirimler' }).getByText(/Selin Aksoy öğretmen raporu paylaştı: Elif Yıldız · TG-5/).click()
    await expect(page.getByTestId('report-paper')).toContainText('E2E gündem: matematikte tekrar eden hatalar.')
  })

  test('6.4 PDF indir: metin seçilebilir, Türkçe karakterler doğru, 1–2 sayfa', async ({ page }) => {
    await login(page, ...DEMO.veli)
    await page.getByRole('navigation', { name: 'Ana menü' }).getByText('Raporlar').click()
    await page.getByTestId('report-row').first().click()
    const dl = page.waitForEvent('download')
    await page.getByRole('button', { name: 'PDF indir' }).click()
    const file = await dl
    expect(file.suggestedFilename()).toMatch(/^Veli-Raporu_elif-yildiz_TG-5\.pdf$/)
    const path = 'e2e-artifacts/veli-raporu.pdf'
    await file.saveAs(path)
    expect(readFileSync(path).subarray(0, 5).toString()).toBe('%PDF-')
    const { pages, text } = await pdfText(path)
    expect(pages).toBeGreaterThanOrEqual(1)
    expect(pages).toBeLessThanOrEqual(2)
    for (const s of ['Elif Yıldız', 'T.C. İnkılap Tarihi', 'İngilizce', 'Fen Bilimleri'])
      expect(text, s).toContain(s)
    // Başlıklar Türkçe büyük harf kuralıyla (i → İ)
    for (const s of ['ÖĞRENCİ BİLGİLERİ', 'GENEL DEĞERLENDİRME', 'GÜÇLÜ YÖNLER', 'ÜZERİNDE ÇALIŞILMASI GEREKEN ALANLAR', 'ÇALIŞMA ÖNERİLERİ', 'MENTÖR YORUMU', 'REHBER ÖĞRETMEN YORUMU'])
      expect(text, s).toContain(s)
    expect(text).toContain('Öğrencimiz TG-5 sonucunda') // "Deneme 5" gerçek adına çevrildi
    expect(text).toContain('E2E mentör: Elif ile haftalık matematik planını birlikte takip edeceğiz.')
    expect(text).not.toMatch(/CODE_EXACT|confidence|OCR/)
  })
})
