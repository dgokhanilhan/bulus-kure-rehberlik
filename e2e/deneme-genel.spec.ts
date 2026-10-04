// Okul geneli deneme (5–12): Excel/CSV ve elle giriş → kontrol → taslak → yayın; çift içe aktarma; Deneme Tanıma Merkezi;
// gerçek karne PDF'i varsa (fixtures/pdf-genel, git'e girmez) test laboratuvarı ve genel PDF akışı (kaydetmeden).
import { existsSync, readFileSync } from 'node:fs'
import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { DEMO, login, loginAdmin, resetAdminMfa, service, shot } from './helpers'

async function axe(page: Page, label: string) {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.waitForTimeout(300)
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
  const bad = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
  expect(bad.map((v) => `${label}: ${v.id} (${v.nodes.length}) ${v.nodes[0]?.target}`)).toEqual([])
}
const svc = service()
const TODER8 = new URL('../fixtures/pdf-genel/toder-lgs-3-karne.pdf', import.meta.url)
const LGS8 = new URL('../fixtures/pdf/hiz-tg9-2.pdf', import.meta.url)
const PDF6 = new URL('../fixtures/pdf-genel/6-sinif-kurumsal-tg-6-ogrenci-karnesi.pdf', import.meta.url)
const CSV = ['Ad soyad;Okul no;Sınıf;TUR D;TUR Y;MAT D;MAT Y', 'E2E Genel Bir;G601;6/A;10;3;12;3', 'Bilinmeyen Kişi;999;6/A;5;5;5;5'].join('\r\n')

test.describe.serial('Okul geneli deneme (5–12)', () => {
  let secret = ''
  const clean = async () => {
    const { data } = await svc.from('exams').select('id').like('name', 'E2E Genel%')
    if (data?.length) await svc.from('exams').delete().in('id', data.map((e) => e.id))
    await svc.from('students').delete().in('school_no', ['G601', 'G602'])
  }
  test.beforeAll(async () => {
    await resetAdminMfa()
    await clean()
    const school = (await svc.from('schools').select('id').single()).data!.id
    const { error } = await svc.from('students').insert([
      { school_id: school, full_name: 'E2E Genel Bir', class_name: '6/A', school_no: 'G601' },
      { school_id: school, full_name: 'E2E Genel İki', class_name: '6/A', school_no: 'G602' },
    ])
    expect(error).toBeNull()
  })
  test.afterAll(clean)

  test('Excel/CSV: 6. sınıf deneme kontrol edilir, taslak kaydedilir, yayınlanır; aynı dosya ikinci kez kayıt açmaz', async ({ page }) => {
    await login(page, ...DEMO.rehber)
    await page.getByRole('link', { name: 'Denemeler', exact: true }).click()
    await page.getByRole('button', { name: 'Excel / CSV ile yükle' }).click()
    await page.locator('#gGrade').selectOption('6')
    await expect(page.locator('#gType')).toHaveValue('GENEL') // sınıfın varsayılanı
    await expect(page.locator('#gTpl')).not.toHaveValue('') // tek uygun şablon kendiliğinden
    await page.locator('#gName').fill('E2E Genel CSV')
    await page.locator('#gTable').setInputFiles({ name: 'sonuc.csv', mimeType: 'text/csv', buffer: Buffer.from(CSV) })
    await expect(page.getByTestId('genel-bekleyen')).toHaveText('1 kontrol bekliyor')
    await expect(page.getByTestId('genel-satir')).toHaveCount(2)
    await page.getByTestId('genel-karar').getByRole('button', { name: 'Bu satırı atla' }).click()
    await expect(page.getByTestId('genel-bekleyen')).toHaveText('Hepsi tamam')
    await axe(page, 'genel kontrol')
    await shot(page, 'g1-genel-kontrol')
    await page.getByTestId('genel-ice-aktar').click()
    await expect(page.getByTestId('genel-sonuc')).toContainText('taslak')

    const ex = (await svc.from('exams').select('id, grade, exam_type, status, exam_results(total_net, success_pct)').eq('name', 'E2E Genel CSV').single()).data!
    expect([ex.grade, ex.exam_type, ex.status]).toEqual([6, 'GENEL', 'taslak'])
    expect(ex.exam_results).toHaveLength(1)
    expect(Number(ex.exam_results[0]!.total_net)).toBe(20) // (10 − 3/3) + (12 − 3/3)

    await page.getByRole('button', { name: 'Şimdi yayınla' }).click()
    await expect(page.getByText('Yayınlandı', { exact: true })).toBeVisible()
    expect((await svc.from('exams').select('status').eq('id', ex.id).single()).data!.status).toBe('yayinda')

    // Aynı dosya: yeni kayıt açılmaz
    await page.getByRole('button', { name: 'Denemelere dön' }).click()
    await page.getByRole('button', { name: 'Excel / CSV ile yükle' }).click()
    await page.locator('#gGrade').selectOption('6')
    await page.locator('#gName').fill('E2E Genel CSV tekrar')
    await page.locator('#gTable').setInputFiles({ name: 'sonuc.csv', mimeType: 'text/csv', buffer: Buffer.from(CSV) })
    await page.getByTestId('genel-karar').getByRole('button', { name: 'Bu satırı atla' }).click()
    await page.getByTestId('genel-ice-aktar').click()
    await expect(page.getByTestId('genel-sonuc')).toContainText('zaten içe aktarılmış')
    expect((await svc.from('exams').select('id').eq('name', 'E2E Genel CSV tekrar')).data).toEqual([])
  })

  test('öğretmen: öğrenci sayfasında "Deneme Özeti", kartlar ve son deneme; Sınıflar\'da 6/A analizi; LGS ekranlarına karışmaz', async ({ page }) => {
    const sid = (await svc.from('students').select('id').eq('school_no', 'G601').single()).data!.id
    // Soru düzeyi: Matematik 1. soru → TYMM 6. sınıf öğrenme çıktısı, öğrenci doğru yapmış (kazanım analizi bu kanıtla)
    const ex = (await svc.from('exams').select('id').eq('name', 'E2E Genel CSV').single()).data!
    const lo = (await svc.from('learning_outcomes').select('id, curriculum_versions!inner(curriculum_type, year_from)').eq('grade', 6).eq('subject_code', 'MAT').eq('code', 'MAT.6.1.1')
      .eq('curriculum_versions.curriculum_type', 'TYMM').eq('curriculum_versions.year_from', 2026).single()).data!
    expect((await svc.from('exam_items').insert({ exam_id: ex.id, section_key: 'MAT', q_no: 1, subject_code: 'MAT', correct_answer: 'B', learning_outcome_id: lo.id, match_method: 'MANUAL', match_confidence: 1 })).error).toBeNull()
    expect((await svc.from('exam_results').update({ answers: { MAT: 'B' } }).eq('exam_id', ex.id).eq('student_id', sid)).error).toBeNull()
    await login(page, ...DEMO.rehber)
    await expect(page.getByRole('navigation', { name: 'Ana menü' })).toBeVisible()
    await page.goto(`/ogrenciler/${sid}`)
    // Profil tek kaynaktan: 5–7 "Deneme Özeti"; kartlar ve son deneme bölümleri genel sonuçtan
    await expect(page.getByTestId('sinav-baglami')).toContainText('Deneme Özeti')
    await expect(page.getByText('Puan · E2E Genel CSV')).toBeVisible()
    await expect(page.locator('.stats')).toContainText('20,00')
    const box = page.getByTestId('son-deneme-analizi')
    // profil sırası (6. sınıf: Türkçe, Matematik, Fen, Sosyal, Din, Yabancı Dil); CSV'de olmayanlar "ölçülmedi"
    await expect(box.getByTestId('bolum-satiri')).toHaveCount(6)
    await expect(box.getByTestId('bolum-satiri').nth(5)).toContainText('Yabancı Dil')
    await expect(box.getByRole('row', { name: /Sosyal Bilgiler/ })).toContainText('Ölçülmedi')
    const an = box.getByTestId('kazanim-analizi')
    await expect(an.getByRole('heading', { name: 'Öğrenme Çıktısı Analizi' })).toBeVisible()
    await expect(an).toContainText('MAT.6.1.1')
    await axe(page, 'öğrenci genel deneme')
    await shot(page, 'g3-ogrenci-genel')

    await page.getByRole('link', { name: 'Sınıflar', exact: true }).click()
    // Şube seçici: az şubede düğmeler, çok şubede açılır liste
    if (await page.locator('#clsPick').count()) await page.locator('#clsPick').selectOption('6/A')
    else await page.getByRole('group', { name: 'Şube' }).getByRole('button', { name: '6/A' }).click()
    await expect(page.getByTestId('sinav-baglami')).toContainText('Deneme Özeti')
    await expect(page.getByRole('columnheader', { name: 'E2E Genel CSV' })).toBeVisible()
    await axe(page, 'sınıflar genel')
  })

  test('elle giriş: yalnız doldurulan öğrenci içe aktarılır; liste durum ve arşiv işlemi gösterir', async ({ page }) => {
    await login(page, ...DEMO.rehber)
    await page.getByRole('link', { name: 'Denemeler', exact: true }).click()
    await page.getByRole('button', { name: 'Elle gir' }).click()
    await page.locator('#gGrade').selectOption('6')
    await page.locator('#gName').fill('E2E Genel Elle')
    await page.getByLabel('E2E Genel İki Türkçe doğru').fill('15')
    await page.getByLabel('E2E Genel İki Türkçe yanlış').fill('0')
    await page.getByRole('button', { name: '1 öğrenciyi kontrol et' }).click()
    await expect(page.getByTestId('genel-bekleyen')).toHaveText('Hepsi tamam')
    await page.getByTestId('genel-ice-aktar').click()
    await expect(page.getByTestId('genel-sonuc')).toContainText('1 öğrencinin sonucu')
    const ex = (await svc.from('exams').select('id, exam_imports(source_kind), exam_results(subjects)').eq('name', 'E2E Genel Elle').single()).data!
    expect(ex.exam_imports[0]!.source_kind).toBe('manuel')
    expect(ex.exam_results[0]!.subjects).toEqual({ TUR: { d: 15, y: 0, b: 0, net: 15 } })

    await page.getByRole('button', { name: 'Denemelere dön' }).click()
    const row = page.getByTestId('exam-row').filter({ hasText: 'E2E Genel Elle' })
    await page.getByText('Yüklenen denemeler').click()
    await expect(row.getByTestId('exam-status')).toHaveText('Taslak')
    await row.getByRole('button', { name: /yayınla$/ }).click()
    await expect(row.getByTestId('exam-status')).toHaveText('Yayında')
    await row.getByRole('button', { name: /arşive al$/ }).click()
    await expect(row.getByTestId('exam-status')).toHaveText('Arşivde')
  })

  test('Deneme Tanıma Merkezi: 5–12 durumu, yayınlar, şablonlar, katalog, geçmiş, arşivden geri alma', async ({ page }) => {
    secret = await loginAdmin(page)
    await page.goto('/yonetim?sekme=denemeler')
    await expect(page.getByRole('heading', { name: 'Denemeler / Tanıma Merkezi' })).toBeVisible()
    await expect(page.getByTestId('destek-satiri')).toHaveCount(8)
    await axe(page, 'genel bakış')
    await shot(page, 'g2-tanima-merkezi')
    const tab = (n: string) => page.getByRole('group', { name: 'Deneme Tanıma Merkezi bölümü' }).getByRole('button', { name: n, exact: true }).click()
    await tab('Yayınlar')
    await expect(page.getByTestId('yayin-satiri').filter({ hasText: 'Hız Yayınları' })).toHaveCount(1)
    await axe(page, 'yayınlar')
    await tab('Biçimler')
    await expect(page.getByTestId('bicim-satiri').filter({ hasText: 'HIZ_LISE_KARNE_V1' })).toHaveCount(1)
    await axe(page, 'biçimler')
    await tab('Şablonlar')
    await expect(page.getByTestId('sablon-karti').filter({ hasText: '12. Sınıf YKS · TYT' })).toHaveCount(1)
    await axe(page, 'şablonlar')
    await tab('Profiller')
    await expect(page.getByTestId('profil-karti')).toHaveCount(8)
    await expect(page.getByTestId('profil-karti').filter({ hasText: '12. sınıf' })).toContainText('Kazanım Analizi')
    await expect(page.getByTestId('profil-karti').filter({ hasText: '11. sınıf' })).toContainText('AYT İleri Matematik')
    await axe(page, 'profiller')
    await tab('Öğrenme hedefleri')
    await page.locator('#katGrade').selectOption('7')
    await page.locator('#katQ').fill('T.7')
    await expect(page.getByTestId('kazanim-satiri').first()).toBeVisible()
    await axe(page, 'katalog')
    await tab('Eşleşmeyen hedefler')
    await axe(page, 'eşleşmeyen')
    await tab('İçe aktarım geçmişi')
    await expect(page.getByTestId('aktarim-satiri').filter({ hasText: 'E2E Genel Elle' })).toHaveCount(1)
    await axe(page, 'geçmiş')
    await tab('Arşiv')
    const arc = page.getByTestId('arsiv-satiri').filter({ hasText: 'E2E Genel Elle' })
    await arc.getByRole('button', { name: /arşivden çıkar/ }).click()
    await page.getByRole('button', { name: 'Taslağa al' }).click()
    await expect(arc).toHaveCount(0)
    expect((await svc.from('exams').select('status').eq('name', 'E2E Genel Elle').single()).data!.status).toBe('taslak')
  })

  test('gerçek karne: test laboratuvarı tanır (kaydetmez); Denemeler genel akışa yönlendirir', async ({ page }) => {
    test.skip(!existsSync(PDF6), 'fixtures/pdf-genel boş (gerçek karneler git\'e girmez)')
    const buffer = readFileSync(PDF6)
    await loginAdmin(page, secret)
    await page.goto('/yonetim?sekme=denemeler')
    await page.getByRole('group', { name: 'Deneme Tanıma Merkezi bölümü' }).getByRole('button', { name: 'Test laboratuvarı' }).click()
    await page.locator('#labFile').setInputFiles({ name: 'karne.pdf', mimeType: 'application/pdf', buffer })
    await expect(page.getByTestId('lab-sonuc')).toContainText('HIZ_ORTAOKUL_KARNE_V1', { timeout: 60_000 })
    await expect(page.getByTestId('lab-sonuc')).toContainText('6. Sınıf Hız Genel Deneme ile bölüm eşlemesi: tam')

    const before = (await svc.from('exams').select('id', { count: 'exact', head: true })).count
    await page.goto('/denemeler')
    await page.locator('#upFile').setInputFiles({ name: 'karne.pdf', mimeType: 'application/pdf', buffer })
    await expect(page.getByTestId('tanima-karti')).toBeVisible({ timeout: 60_000 })
    await expect(page.locator('#gGrade')).toHaveValue('6')
    await page.getByRole('button', { name: 'Sonuçları kontrol et' }).click()
    await expect(page.getByTestId('genel-satir')).toHaveCount(24)
    await page.getByRole('button', { name: 'Vazgeç' }).click()
    expect((await svc.from('exams').select('id', { count: 'exact', head: true })).count).toBe(before)
  })

  test('8. sınıf LGS karnesi genel akışa değil, mevcut LGS akışına gider (kaydetmeden)', async ({ page }) => {
    test.skip(!existsSync(LGS8), 'fixtures/pdf boş (LGS altın PDF\'leri git\'e girmez)')
    const before = (await svc.from('exams').select('id', { count: 'exact', head: true })).count
    await login(page, ...DEMO.rehber)
    await page.getByRole('link', { name: 'Denemeler', exact: true }).click()
    await page.locator('#upFile').setInputFiles({ name: 'lgs.pdf', mimeType: 'application/pdf', buffer: readFileSync(LGS8) })
    await expect(page.getByTestId('pending-chip')).toBeVisible({ timeout: 90_000 })
    await expect(page.getByTestId('tanima-karti')).toHaveCount(0)
    await page.getByRole('button', { name: 'Vazgeç' }).click()
    expect((await svc.from('exams').select('id', { count: 'exact', head: true })).count).toBe(before)
  })

  test('Akbim (TÖDER) 8. sınıf karnesi: genel akışta LGS olarak tanınır, şablon ve yayın önerilir (kaydetmeden)', async ({ page }) => {
    test.skip(!existsSync(TODER8), 'fixtures/pdf-genel boş (gerçek karneler git\'e girmez)')
    const before = (await svc.from('exams').select('id', { count: 'exact', head: true })).count
    await login(page, ...DEMO.rehber)
    await page.getByRole('link', { name: 'Denemeler', exact: true }).click()
    await page.locator('#upFile').setInputFiles({ name: 'toder.pdf', mimeType: 'application/pdf', buffer: readFileSync(TODER8) })
    await expect(page.getByTestId('tanima-karti')).toContainText('AKBIM_SONUC_BELGESI_V1', { timeout: 90_000 })
    await expect(page.locator('#gGrade')).toHaveValue('8')
    await expect(page.locator('#gType')).toHaveValue('LGS')
    await expect(page.locator('#gTpl')).not.toHaveValue('')
    await expect(page.locator('#gPub')).toHaveValue((await svc.from('publishers').select('id').is('school_id', null).eq('name', 'TÖDER').single()).data!.id)
    await expect(page.locator('#gDate')).toHaveValue('2025-05-09')
    await page.getByRole('button', { name: 'Sonuçları kontrol et' }).click()
    await expect(page.getByTestId('genel-satir')).toHaveCount(35)
    await page.getByRole('button', { name: 'Vazgeç' }).click()
    expect((await svc.from('exams').select('id', { count: 'exact', head: true })).count).toBe(before)
  })
})
