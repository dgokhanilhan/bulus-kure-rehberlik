// Faz H · Ana sayfa (rol kartları, yöneticinin düzeni) ve toplu aktarım (Excel/CSV → önizleme → aktar; öğretmen daveti).
import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import path from 'node:path'
import { DEMO, login, loginAdmin, logout, resetAdminMfa, service, shot } from './helpers'

async function axe(page: Page, label: string) {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.waitForTimeout(300)
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
  const bad = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
  expect(bad.map((v) => `${label}: ${v.id} (${v.nodes.length}) ${v.nodes[0]?.target}`)).toEqual([])
}
const svc = service()
const stamp = Date.now() % 100000
const TEACHER = `e2e-toplu-${stamp}@ornek.com`
const cards = (page: Page) => page.locator('section[data-card]')
const csv = (name: string, text: string) => ({ name, mimeType: 'text/csv', buffer: Buffer.from('﻿' + text) })

async function cleanup() {
  await svc.from('students').delete().like('full_name', 'E2E Excel %')
  await svc.from('students').delete().like('full_name', 'E2E Csv %')
  await svc.from('school_settings').delete().like('key', 'panel.%')
  const { data } = await svc.from('profiles').select('id').like('email', 'e2e-toplu-%')
  for (const p of data ?? []) await svc.auth.admin.deleteUser(p.id)
}

test.describe.serial('Ana sayfa ve toplu aktarım', () => {
  let secret = ''
  test.setTimeout(120_000)
  test.beforeAll(async () => {
    await cleanup()
    await resetAdminMfa()
  })
  test.afterAll(cleanup)

  test('veli ve öğretmen girişte kendi ana sayfa kartlarını görür', async ({ page }) => {
    await login(page, ...DEMO.veli)
    await expect(page).toHaveURL(/\/panel$/)
    await expect(page.getByRole('heading', { name: /^Merhaba/ })).toBeVisible()
    await expect(cards(page).first()).toHaveAttribute('data-card', 'duyuru')
    for (const n of ['Ödevler', 'Bugünün dersleri', 'Devamsızlık', 'Yaklaşan etkinlikler', 'LGS / Deneme']) await expect(page.getByRole('region', { name: n })).toBeVisible()
    await expect(page.locator('section[data-card="bursluluk"]')).toHaveCount(0) // varsayılan kapalı
    await axe(page, 'veli ana sayfa')
    await shot(page, 'h1-veli-ana-sayfa')
    await logout(page)

    await login(page, ...DEMO.matematik)
    await expect(page).toHaveURL(/\/panel$/)
    await expect(cards(page).first()).toHaveAttribute('data-card', 'derslerim')
    await expect(page.getByRole('region', { name: 'Kontrol bekleyen ödevler' })).toBeVisible()
    await axe(page, 'öğretmen ana sayfa')
    await logout(page)
  })

  test('yönetici veli ana sayfasını düzenler; veli yeni düzeni görür', async ({ page }) => {
    secret = await loginAdmin(page, secret || undefined)
    await page.goto('/yonetim?sekme=anasayfa')
    const box = page.getByRole('region', { name: 'Veli ana sayfa kartları' })
    await box.getByRole('checkbox', { name: 'Duyurular' }).uncheck()
    for (let i = 0; i < 4; i++) await box.getByRole('button', { name: 'Devamsızlık yukarı' }).click()
    await box.getByRole('checkbox', { name: 'Bursluluk sınavı' }).check()
    await page.getByRole('button', { name: 'Kaydet' }).click()
    await expect(page.getByText('Ana sayfa düzeni kaydedildi')).toBeVisible()
    await axe(page, 'ana sayfa düzeni')
    await shot(page, 'h2-ana-sayfa-duzeni')
    const { data } = await svc.from('school_settings').select('value').eq('key', 'panel.veli').single()
    expect((data!.value as { id: string }[]).map((x) => x.id).slice(0, 2)).toEqual(['yoklama', 'duyuru'])
    await logout(page)

    await login(page, ...DEMO.veli)
    await expect(cards(page).first()).toHaveAttribute('data-card', 'yoklama')
    await expect(page.locator('section[data-card="duyuru"]')).toHaveCount(0)
    await expect(page.locator('section[data-card="bursluluk"]')).toHaveCount(0) // modül kapalı → işaretli olsa da görünmez
    await logout(page)
  })

  test('öğrenci aktarımı: hatalı dosya önizlemede kalır; Excel dosyası aktarılır', async ({ page }) => {
    secret = await loginAdmin(page, secret || undefined)
    await page.goto('/yonetim?sekme=aktarim')
    const file = page.getByLabel('Aktarılacak dosya')

    // Eksik sütun
    await file.setInputFiles(csv('liste.csv', 'İsim;Numara\nE2E Csv Bir;1\n'))
    await expect(page.getByRole('alert')).toContainText('şu sütun bulunamadı: Sınıf')

    // Hatalı satırlar: önizleme gösterir, aktar düğmesi yok, hiçbir şey yazılmaz
    await file.setInputFiles(csv('liste.csv', 'Ad soyad;Sınıf;Okul no\nE2E Csv Bir;8/A;\nE2E Csv İki;12/Z;\n'))
    const pv = page.getByRole('region', { name: 'Önizleme' })
    await expect(pv.getByText('1 hazır')).toBeVisible()
    await expect(pv.getByRole('row', { name: /E2E Csv İki/ })).toContainText('Sınıf açılmamış: 12/Z')
    await expect(pv.getByRole('button', { name: /öğrenciyi aktar/ })).toHaveCount(0)
    await axe(page, 'aktarım önizleme')
    await shot(page, 'h3-aktarim-hatali')
    expect((await svc.from('students').select('id').like('full_name', 'E2E Csv %')).data).toEqual([])

    // Excel (.xlsx): başlıklar farklı yazılmış ("Adı Soyadı", "Şube"), sınıf küçük harf
    await file.setInputFiles(path.join(import.meta.dirname, 'fixtures/ogrenci-listesi.xlsx'))
    await expect(pv.getByText('2 hazır')).toBeVisible()
    await pv.getByRole('button', { name: '2 öğrenciyi aktar' }).click()
    await expect(page.getByRole('status').filter({ hasText: '2 öğrenci aktarıldı.' })).toBeVisible()
    const { data } = await svc.from('students').select('full_name, class_name, school_no').like('full_name', 'E2E Excel %').order('full_name')
    expect(data).toEqual([
      { full_name: 'E2E Excel Bir', class_name: '6/A', school_no: '7701' },
      { full_name: 'E2E Excel İki', class_name: '8/B', school_no: '7702' },
    ])
    await logout(page)
  })

  test('öğretmen aktarımı: hatalı satır atlanır, geçerlilere davet gider', async ({ page }) => {
    secret = await loginAdmin(page, secret || undefined)
    await page.goto('/yonetim?sekme=aktarim')
    await page.getByRole('group', { name: 'Ne aktarılacak' }).getByRole('button', { name: 'Öğretmen listesi' }).click()
    await page.getByLabel('Aktarılacak dosya').setInputFiles(csv('ogretmenler.csv', `Ad soyad,E-posta,Branş\nToplu Öğretmen,${TEACHER.toUpperCase()},fizik\nYanlış Branş,x-${TEACHER},Astroloji\n`))
    const pv = page.getByRole('region', { name: 'Önizleme' })
    await expect(pv.getByRole('row', { name: /Yanlış Branş/ })).toContainText('Branş geçersiz: Astroloji')
    await expect(pv.getByRole('row', { name: /Toplu Öğretmen/ })).toContainText('Fizik')
    await pv.getByRole('button', { name: '1 öğretmene davet gönder' }).click()
    await expect(page.getByRole('status').filter({ hasText: '1 öğretmene davet gönderildi.' })).toBeVisible()
    const { data } = await svc.from('profiles').select('role, branch, status').eq('email', TEACHER).single()
    expect(data).toEqual({ role: 'ogretmen', branch: 'Fizik', status: 'approved' })
    expect((await svc.from('profiles').select('id').eq('email', `x-${TEACHER}`)).data).toEqual([])
    await logout(page)
  })
})
