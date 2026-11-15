// Öğrenci desteği (0076): Yanlış defteri ("çalıştım" işareti) ve Çözemedim (fotoğraflı soru → öğretmen yanıtı).
import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { createClient } from '@supabase/supabase-js'
import { DEMO, ELIF, login, service, shot } from './helpers'

const svc = service()
const IZ = 'e2e-soru'
const BASKA = '00000000-0000-4000-8001-000000001201' // başka bir öğrenci
// 1×1 PNG
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')
const temizle = async () => {
  const { data } = await svc.from('soru_talep').select('foto').in('student_id', [ELIF, BASKA])
  if (data?.length) await svc.storage.from('soru').remove(data.map((x) => x.foto))
  await svc.from('soru_talep').delete().in('student_id', [ELIF, BASKA])
  await svc.from('konu_calisma').delete().eq('student_id', ELIF)
  await svc.from('school_settings').delete().in('key', ['aile.soru_sor', 'aile.yanlis_defteri'])
  await svc.from('notifications').delete().eq('type', 'soru')
}
test.beforeAll(temizle)
test.afterAll(temizle)
test.describe.configure({ mode: 'serial' })

const oturum = async (kim: readonly [string, string]) => {
  const c = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!, { auth: { persistSession: false } })
  const { error } = await c.auth.signInWithPassword({ email: kim[0], password: kim[1] })
  expect(error).toBeNull()
  return c
}
const okul = async () => (await svc.from('students').select('school_id').eq('id', ELIF).single()).data!.school_id as string

test('veritabanı: işareti yalnız öğrenci yazar; soru ve fotoğraf yalnız ilgili kişilere açık', async () => {
  const ogr = await oturum(DEMO.ogrenci)
  const veli = await oturum(DEMO.veli)
  const mat = await oturum(DEMO.matematik)
  const bekleyen = await oturum(DEMO.bekleyen)
  const sid = await okul()

  // Yanlış defteri: öğrenci işaretler; veli ve öğretmen okur ama yazamaz; öğrenci başkası adına yazamaz
  expect((await ogr.from('konu_calisma').upsert({ student_id: ELIF, konu: 'M.8.1.1' })).error).toBeNull()
  expect((await ogr.from('konu_calisma').insert({ student_id: BASKA, konu: 'M.8.1.1' })).error).not.toBeNull()
  expect((await veli.from('konu_calisma').insert({ student_id: ELIF, konu: 'M.8.1.2' })).error).not.toBeNull()
  expect((await mat.from('konu_calisma').insert({ student_id: ELIF, konu: 'M.8.1.2' })).error).not.toBeNull()
  expect((await veli.from('konu_calisma').select('konu').eq('student_id', ELIF)).data).toHaveLength(1)
  expect((await mat.from('konu_calisma').select('konu').eq('student_id', ELIF)).data).toHaveLength(1)
  expect((await bekleyen.from('konu_calisma').select('konu')).data ?? []).toEqual([])

  // Depo: kendi klasörüne yükler; başka öğrencinin klasörüne yükleyemez; öğretmen yükleyemez
  const yol = `${sid}/${ELIF}/${crypto.randomUUID()}.png`
  expect((await ogr.storage.from('soru').upload(yol, PNG, { contentType: 'image/png' })).error).toBeNull()
  expect((await ogr.storage.from('soru').upload(`${sid}/${BASKA}/${crypto.randomUUID()}.png`, PNG, { contentType: 'image/png' })).error).not.toBeNull()
  expect((await mat.storage.from('soru').upload(`${sid}/${ELIF}/${crypto.randomUUID()}.png`, PNG, { contentType: 'image/png' })).error).not.toBeNull()
  // Talep kaydı olmadan fotoğrafı kimse okuyamaz (yükleyen dahil)
  expect((await mat.storage.from('soru').createSignedUrl(yol, 60)).error).not.toBeNull()

  // Talep: yol öğrenciyle uyuşmalı; başka öğrenci adına gönderilemez
  expect(
    (await ogr.from('soru_talep').insert({ student_id: ELIF, ders: 'Matematik', foto: `${sid}/${BASKA}/${crypto.randomUUID()}.png` })).error?.message,
  ).toContain('yolu geçersiz')
  expect((await ogr.from('soru_talep').insert({ student_id: BASKA, ders: 'Matematik', foto: yol })).error).not.toBeNull()
  const t = await ogr
    .from('soru_talep')
    .insert({ student_id: ELIF, ders: 'Matematik', aciklama: `${IZ} sayfa 42`, foto: yol, durum: 'cozuldu', yanit: 'sahte' })
    .select('id, durum, yanit')
    .single()
  expect(t.error).toBeNull()
  expect(t.data).toMatchObject({ durum: 'yeni', yanit: null }) // istemci durum/yanıt yazamaz
  // Artık öğrenci, velisi ve öğretmeni fotoğrafı açabilir; onaysız hesap açamaz
  for (const c of [ogr, veli, mat]) expect((await c.storage.from('soru').createSignedUrl(yol, 60)).error).toBeNull()
  expect((await bekleyen.storage.from('soru').createSignedUrl(yol, 60)).error).not.toBeNull()
  expect((await bekleyen.from('soru_talep').select('id')).data ?? []).toEqual([])
  // Matematik öğretmenine bildirim gitti
  const matId = (await mat.auth.getUser()).data.user!.id
  const b = (await svc.from('notifications').select('text').eq('user_id', matId).eq('type', 'soru')).data!
  expect(b.map((x) => x.text)).toContain('Elif Yıldız çözemediği bir Matematik sorusu gönderdi.')

  // Yanıt: öğrenci/veli yanıtlayamaz, doğrudan güncelleyemez; öğretmen yanıtlar, gönderene bildirim gider
  expect((await ogr.rpc('soru_talep_yanitla', { p_id: t.data!.id, p_durum: 'cozuldu', p_yanit: 'x' })).error).not.toBeNull()
  await ogr.from('soru_talep').update({ durum: 'cozuldu' }).eq('id', t.data!.id)
  expect((await svc.from('soru_talep').select('durum').eq('id', t.data!.id).single()).data!.durum).toBe('yeni')
  expect((await mat.rpc('soru_talep_yanitla', { p_id: t.data!.id, p_durum: 'cozuldu', p_yanit: `${IZ} paydaları eşitle` })).error).toBeNull()
  const ogrId = (await ogr.auth.getUser()).data.user!.id
  expect((await svc.from('notifications').select('text').eq('user_id', ogrId).eq('type', 'soru')).data!.map((x) => x.text)).toContain(
    'Murat Kaya, gönderdiğin Matematik sorusuna yanıt verdi.',
  )
  // Yanıtlanmış talep geri çekilemez
  await ogr.from('soru_talep').delete().eq('id', t.data!.id)
  expect((await svc.from('soru_talep').select('id').eq('id', t.data!.id)).data).toHaveLength(1)

  // Günlük sınır (5) ve kapalı ayar
  for (let i = 0; i < 4; i++) {
    const y = `${sid}/${ELIF}/${crypto.randomUUID()}.png`
    expect((await veli.from('soru_talep').insert({ student_id: ELIF, ders: 'Türkçe', foto: y })).error).toBeNull()
  }
  expect(
    (await veli.from('soru_talep').insert({ student_id: ELIF, ders: 'Türkçe', foto: `${sid}/${ELIF}/${crypto.randomUUID()}.png` })).error?.message,
  ).toContain('en çok 5')
  await svc.from('soru_talep').delete().eq('student_id', ELIF).eq('ders', 'Türkçe')
  await svc.from('school_settings').upsert({ school_id: sid, key: 'aile.soru_sor', value: false }, { onConflict: 'school_id,key' })
  expect(
    (await ogr.from('soru_talep').insert({ student_id: ELIF, ders: 'Fen Bilimleri', foto: `${sid}/${ELIF}/${crypto.randomUUID()}.png` })).error?.message,
  ).toContain('kapalı')
  await svc.from('school_settings').delete().eq('key', 'aile.soru_sor')
})

test('arayüz: öğrenci konuyu işaretler ve soru gönderir; öğretmen yanıtlar; veli görür', async ({ page, browser }) => {
  await login(page, ...DEMO.ogrenci)
  await expect(page.getByRole('navigation', { name: 'Ana menü' })).toBeVisible()
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/ozet')
  // Yanlış defteri
  const defter = page.getByRole('region', { name: 'Yanlış defteri' })
  await expect(defter).toBeVisible()
  const ilk = defter.getByRole('listitem').first()
  await expect(ilk).toContainText(/denemede yanlış/)
  const konu = (await ilk.locator('b').first().innerText()).trim()
  await ilk.getByRole('button', { name: 'Çalıştım' }).click()
  // Çalışılan konu listenin sonuna iner: uzun listede "Hepsini göster" ile açılır
  const hepsi = defter.getByRole('button', { name: /Hepsini göster/ })
  if (await hepsi.count()) await hepsi.click()
  const isaretli = defter.getByRole('listitem').filter({ hasText: konu })
  await expect(isaretli.getByText('✓ Çalışıldı')).toBeVisible()
  await expect.poll(async () => (await svc.from('konu_calisma').select('konu').eq('student_id', ELIF)).data!.length).toBe(2)

  // Çözemedim: önceki testin yanıtı görünür; yeni soru gönder
  const kutu = page.getByRole('region', { name: 'Çözemedim' })
  await expect(kutu.getByText(`${IZ} paydaları eşitle`)).toBeVisible()
  await expect(kutu.getByText('✓ Yanıtlandı')).toBeVisible()
  await kutu.getByRole('button', { name: 'Soru gönder' }).click()
  await kutu.getByLabel('Ders').selectOption('Fen Bilimleri')
  await kutu.getByLabel('Sorunun fotoğrafı').setInputFiles({ name: 'soru.png', mimeType: 'image/png', buffer: PNG })
  await kutu.getByLabel(/Not/).fill(`${IZ} arayüz sorusu`)
  await kutu.getByRole('button', { name: 'Gönder', exact: true }).click()
  await expect(page.getByText('Sorun öğretmenine iletildi')).toBeVisible()
  const yeni = kutu.getByRole('listitem').filter({ hasText: `${IZ} arayüz sorusu` })
  await expect(yeni).toContainText('Öğretmenin bakması bekleniyor')
  await expect(yeni.locator('img')).toBeVisible()
  await page.waitForTimeout(400)
  const axe = await new AxeBuilder({ page }).include('main').withTags(['wcag2a', 'wcag2aa']).analyze()
  expect(axe.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')).toEqual([])
  await shot(page, 'ogrenci-destek')

  // Öğretmen (rehber bütün öğrencileri görür): Öğretmenler Odası'nda soru, yanıtla
  const ogretmen = await (await browser.newContext()).newPage()
  await login(ogretmen, ...DEMO.rehber)
  await expect(ogretmen.getByRole('navigation', { name: 'Ana menü' })).toBeVisible()
  await ogretmen.goto('/ogretmenler-odasi')
  const liste = ogretmen.getByRole('region', { name: 'Öğrencilerin çözemediği sorular' })
  await expect(liste).toContainText('1 yanıt bekliyor')
  const satir = liste.getByRole('listitem').filter({ hasText: `${IZ} arayüz sorusu` })
  await expect(satir).toContainText('Elif Yıldız · Fen Bilimleri')
  await satir.getByRole('button', { name: 'Aç' }).click()
  const dlg = ogretmen.getByRole('dialog', { name: 'Elif Yıldız · Fen Bilimleri' })
  await expect(dlg.locator('img')).toBeVisible()
  await dlg.getByLabel(/Yanıtın/).fill(`${IZ} yarın birlikte bakalım`)
  await shot(ogretmen, 'oda-soru-yanit')
  await dlg.getByRole('button', { name: 'Yanıtla ve kapat' }).click()
  await expect(ogretmen.getByText('Yanıtın öğrenciye iletildi')).toBeVisible()
  await expect(liste).toContainText('Bekleyen yok')

  // Veli: defteri görür ama işaretleyemez; yanıtı görür
  const veli = await (await browser.newContext()).newPage()
  await login(veli, ...DEMO.veli)
  await expect(veli.getByRole('navigation', { name: 'Ana menü' })).toBeVisible()
  await veli.goto('/ozet')
  const vd = veli.getByRole('region', { name: 'Yanlış defteri' })
  await expect(vd.getByRole('listitem').first()).toBeVisible() // liste yüklenmeden düğme aranmasın
  if (await vd.getByRole('button', { name: /Hepsini göster/ }).count()) await vd.getByRole('button', { name: /Hepsini göster/ }).click()
  await expect(vd.getByRole('listitem').filter({ hasText: konu })).toContainText('✓ Çalışıldı')
  await expect(vd.getByRole('button', { name: 'Çalıştım' })).toHaveCount(0)
  await expect(veli.getByRole('region', { name: 'Çözemedim' }).getByText(`${IZ} yarın birlikte bakalım`)).toBeVisible()
  await expect(veli.locator('main')).not.toContainText(/başarısız|yetersiz/i)
})
