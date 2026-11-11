import { test, expect } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { createClient } from '@supabase/supabase-js'
import { DEMO, login, loginAdmin, menu, resetAdminMfa, service, shot } from './helpers'

// Gözetmen Bul (bağımsız modül, 0048): yönetici akışı ve yetki sınırı.
test('yönetici sınav oluşturur, akıllı dağıtır, atar, geçmişte görür ve PDF indirir', async ({ page }) => {
  test.setTimeout(150_000)
  await service().from('gozetmen_sinavlar').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  await service().from('gozetmen_haric').delete().neq('teacher_id', '00000000-0000-0000-0000-000000000000')
  await resetAdminMfa()
  await loginAdmin(page)
  await menu(page).filter({ hasText: 'Gözetmen Bul' }).click()
  await expect(page.getByRole('heading', { name: 'Gözetmen Bul' })).toBeVisible()

  await page.getByLabel('Sınav adı').fill('E2E Ortaokul Denemesi')
  await page.getByLabel('Tarih').fill('2026-10-20') // Salı: ders programı analiz edilir
  await expect(page.getByText('Salı ders programına göre analiz ediliyor.')).toBeVisible()
  await page.getByRole('button', { name: 'Temizle', exact: true }).click()
  await page.getByRole('button', { name: '8/A', exact: true }).click()
  await page.getByRole('button', { name: '8/B', exact: true }).click()
  await expect(page.getByText('2 sınıf', { exact: true })).toBeVisible()
  await expect(page.getByText('8/A, 8/B için gözetmen atanmadı', { exact: false }).first()).toBeVisible()

  page.on('dialog', (d) => d.accept())
  // Kalıcı "görev verilmez" listesi: listeye alınan öğretmen seçim listelerinde ve otomatik atamada yer almaz
  const first = page.locator('.gz-avail .gz-t').first()
  const excluded = (await first.locator('.gz-tn').innerText()).trim()
  await first.click()
  await expect(page.getByText(`${excluded} görev verilmeyenler listesine alındı`)).toBeVisible()
  const cell = page.getByLabel('1. Oturum · Sözel · 8/A gözetmeni')
  await expect(cell.locator('option', { hasText: excluded })).toHaveCount(0)

  // Dersin öğretmeni, sonra kalan boş hücreler için akıllı dağıtım
  await page.getByRole('button', { name: 'Dersin öğretmenine ata' }).click()
  await expect(page.getByText(/dersin öğretmeni yazıldı|ders bulunamadı/)).toBeVisible()
  await page.getByRole('button', { name: 'Akıllı dağıt' }).click()
  await expect(cell).not.toHaveValue('')
  await shot(page, 'gozetmen-plan')
  const { data: ex } = await service().from('gozetmen_haric').select('teacher_id')
  expect(ex).toHaveLength(1)

  await page.getByRole('button', { name: 'ATAMAYI YAP' }).click()
  await expect(page.getByText('Atama yapıldı ve kaydedildi')).toBeVisible()

  const dl = page.waitForEvent('download')
  await page.getByRole('button', { name: 'PDF indir' }).click()
  await mkdir('e2e-artifacts', { recursive: true })
  await (await dl).saveAs('e2e-artifacts/gozetmen.pdf')

  await page.getByRole('button', { name: /^Geçmiş/ }).click()
  await expect(page.getByText('E2E Ortaokul Denemesi')).toBeVisible()
  await expect(page.getByText('Atandı', { exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Öğretmen görev dağılımı' })).toBeVisible()
  await shot(page, 'gozetmen-gecmis')

  // Veritabanında kayıt: 2 oturum, 2 sınıf, her oturumda iki gözetmen
  const { data } = await service().from('gozetmen_sinavlar').select('status, gozetmen_oturumlar(id), gozetmen_siniflar(id), gozetmen_gorevler(role)').eq('title', 'E2E Ortaokul Denemesi').single()
  expect(data!.status).toBe('atandi')
  expect(data!.gozetmen_oturumlar).toHaveLength(2)
  expect(data!.gozetmen_siniflar).toHaveLength(2)
  expect(data!.gozetmen_gorevler.filter((g: { role: string }) => g.role === 'gozetmen').length).toBe(4)

  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('button', { name: /^Sınavı düzenle|^Yeni görevlendirme/ }).first().click()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
})

test('bir sınıfın oturumu iki öğretmene paylaştırılır; saatler çizelgeye ve kayda geçer', async ({ page }) => {
  test.setTimeout(120_000)
  await service().from('gozetmen_sinavlar').delete().eq('title', 'E2E Paylaşım')
  await resetAdminMfa()
  await loginAdmin(page)
  await menu(page).filter({ hasText: 'Gözetmen Bul' }).click()
  await page.getByLabel('Sınav adı').fill('E2E Paylaşım')
  await page.getByLabel('Tarih').fill('2026-10-20')
  await page.getByRole('button', { name: 'Temizle', exact: true }).click()
  await page.getByRole('button', { name: '8/A', exact: true }).click()
  page.on('dialog', (d) => d.accept())

  const cell = page.getByLabel('1. Oturum · Sözel · 8/A gözetmeni', { exact: true })
  await cell.selectOption({ index: 1 })
  const ilk = (await cell.locator('option:checked').innerText()).split(' (')[0]!
  await page.getByRole('button', { name: '1. Oturum · Sözel · 8/A gözetmenliğini başka öğretmenle paylaştır' }).click()
  const ekle = page.getByLabel('1. Oturum · Sözel · 8/A gözetmenliğini paylaşacak öğretmen ekle')
  await ekle.selectOption({ index: 1 })
  // İki bölüm: her biri kendi saatiyle; saatler arka arkaya ve oturumu tam kaplar
  const parts = page.locator('.gz-part')
  await expect(parts).toHaveCount(2)
  await expect(parts.first().locator('select')).toHaveAccessibleName(/^1\. Oturum · Sözel · 8\/A gözetmeni \d{2}:\d{2}–\d{2}:\d{2}$/)
  await expect(page.getByText(/8\/A sınıfında .* arası gözetmen yok/)).toHaveCount(0)
  await shot(page, 'gozetmen-paylasim')

  // Bölümü kaldırınca saatleri kalan öğretmene geçer
  await parts.nth(1).getByRole('button', { name: /bölümünü kaldır$/ }).click()
  await expect(parts).toHaveCount(0)
  await expect(cell).toHaveValue(/.+/)
  await page.getByRole('button', { name: '1. Oturum · Sözel · 8/A gözetmenliğini başka öğretmenle paylaştır' }).click()
  await ekle.selectOption({ index: 1 })
  await expect(parts).toHaveCount(2)

  await page.getByRole('button', { name: 'ATAMAYI YAP' }).click()
  await expect(page.getByText('Atama yapıldı ve kaydedildi')).toBeVisible()
  const { data } = await service()
    .from('gozetmen_sinavlar')
    .select('gozetmen_oturumlar(id, name, starts, ends), gozetmen_gorevler(oturum_id, role, class_name, scope, teacher_name)')
    .eq('title', 'E2E Paylaşım')
    .single()
  const sozel = data!.gozetmen_oturumlar.find((o: { name: string }) => o.name.includes('Sözel'))!
  const g = data!.gozetmen_gorevler
    .filter((x: { oturum_id: string; role: string }) => x.oturum_id === sozel.id && x.role === 'gozetmen')
    .sort((a: { scope: string }, b: { scope: string }) => a.scope.localeCompare(b.scope))
  expect(g).toHaveLength(2)
  const [a, b] = [g[0]!, g[1]!]
  expect(a.teacher_name).toBe(ilk)
  expect(a.scope.slice(0, 5)).toBe(sozel.starts.slice(0, 5))
  expect(b.scope.slice(-5)).toBe(sozel.ends.slice(0, 5))
  expect(a.scope.slice(-5)).toBe(b.scope.slice(0, 5))
  await service().from('gozetmen_sinavlar').delete().eq('title', 'E2E Paylaşım')
})

test('rehber öğretmen Gözetmen Bul sayfasını ve verisini göremez', async ({ page }) => {
  await login(page, ...DEMO.rehber)
  await expect(page.getByRole('navigation', { name: 'Ana menü' })).toBeVisible()
  await expect(menu(page).filter({ hasText: 'Gözetmen Bul' })).toHaveCount(0)
  await page.goto('/gozetmen')
  await expect(page.getByRole('heading', { name: 'Gözetmen Bul' })).toHaveCount(0)
  // Veritabanı (RLS): rehber öğretmen gözetmen verisini okuyamaz
  const c = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!, { auth: { persistSession: false } })
  await c.auth.signInWithPassword({ email: DEMO.rehber[0], password: DEMO.rehber[1] })
  const { data } = await c.from('gozetmen_sinavlar').select('id')
  const rows = data?.length ?? -1
  expect(rows).toBe(0)
})

test('duyurularda ana rolü yönetici olan yazar "Yönetici" olarak görünür', async () => {
  const svc = service()
  const { data: admin } = await svc.from('profiles').select('id, school_id, full_name').eq('email', DEMO.admin[0]).single()
  const { data: a, error } = await svc
    .from('announcements')
    .insert({ school_id: admin!.school_id, created_by: admin!.id, title: 'E2E yazar etiketi', body: 'Deneme', scope: 'okul' })
    .select('id, author_name')
    .single()
  expect(error).toBeNull()
  expect(a!.author_name).toBe(`${admin!.full_name} · Yönetici`)
  await svc.from('announcements').delete().eq('id', a!.id)
})
