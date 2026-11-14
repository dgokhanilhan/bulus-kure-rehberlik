// Öğretmenler Odası günlük oyunları (0073): Günün Şehri, 5 Soruda Bugün, Mini Bulmaca.
// Hepsi sunucuda doğrulanır: cevap oyun bitmeden istemciye gitmez; kapalı oyun açılamaz; veli/öğrenci erişemez.
import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { createClient } from '@supabase/supabase-js'
import { DEMO, login, service, shot } from './helpers'

const svc = service()
const bugun = () => new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10)
const OYUNLAR = ['sehir', 'soru', 'bulmaca']
const temizle = async () => {
  const ids = (await svc.from('profiles').select('id').in('email', [DEMO.rehber[0], DEMO.matematik[0]])).data!.map((p) => p.id)
  await svc.from('oda_oyun').delete().in('user_id', ids).in('oyun', OYUNLAR)
  await svc.from('school_settings').delete().like('key', 'oda.oyun.%')
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
const hedefPlaka = async () => (await svc.rpc('oda_sehir_gunun', { g: bugun() })).data as number
const bulmacaSatirlar = async () => {
  const b = (await svc.rpc('oda_bulmaca_gunun', { g: bugun() })).data as { yatay: string[]; dusey: string[] }
  const ara = (k: number) => `${[...b.dusey[0]!][k]}.${[...b.dusey[1]!][k]}.${[...b.dusey[2]!][k]}`
  return [b.yatay[0]!, ara(1), b.yatay[1]!, ara(3), b.yatay[2]!]
}

test('içerik: 81 il, sorular ve bulmacalar tutarlı', async () => {
  const iller = (await svc.from('oda_sehir').select('plaka, ad, ipuclari')).data!
  expect(iller).toHaveLength(81)
  for (const il of iller) for (const ip of il.ipuclari as string[]) expect(ip.toLocaleLowerCase('tr')).not.toContain((il.ad as string).toLocaleLowerCase('tr'))
  const sorular = (await svc.from('oda_soru').select('id, ay')).data!
  expect(sorular.filter((s) => s.ay == null).length).toBeGreaterThanOrEqual(100)
  // Her bulmacada dokuz kesişim de tutar
  const bulmacalar = (await svc.from('oda_bulmaca').select('yatay, dusey')).data as { yatay: string[]; dusey: string[] }[]
  expect(bulmacalar.length).toBeGreaterThanOrEqual(30)
  for (const b of bulmacalar) for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) expect([...b.yatay[i]!][2 * j]).toBe([...b.dusey[j]!][2 * i])
  // Art arda 20 günde aynı genel soru tekrar etmez
  const gorulen = new Set<number>()
  for (let g = 0; g < 20; g++) {
    const t = new Date(Date.UTC(2027, 0, 10 + g)).toISOString().slice(0, 10)
    const ids = (await svc.rpc('oda_soru_gunun', { g: t })).data as number[]
    expect(ids).toHaveLength(5)
    for (const id of ids) {
      expect(gorulen.has(id)).toBe(false)
      gorulen.add(id)
    }
  }
  // Güne özel soru o gün ilk sıradadır
  const kasim24 = (await svc.rpc('oda_soru_gunun', { g: '2027-11-24' })).data as number[]
  expect((await svc.from('oda_soru').select('soru').eq('id', kasim24[0]!).single()).data!.soru).toContain('24 Kasım')
})

test('Günün Şehri: uzaklık ve yön, ipuçları açılır, cevap bitince gelir; iç fonksiyonlar kapalı', async () => {
  const mat = await oturum(DEMO.matematik)
  const hedef = await hedefPlaka()
  const d0 = (await mat.rpc('oda_sehir_ac')).data as { ipuclari: string[]; cevap: string | null; iller: unknown[]; tahminler: unknown[] }
  expect(d0.ipuclari).toHaveLength(1)
  expect(d0.cevap).toBeNull()
  expect(d0.iller).toHaveLength(81)
  // Hedefi ve içeriği doğrudan okuyamaz
  expect((await mat.rpc('oda_sehir_gunun', { g: bugun() })).error).not.toBeNull()
  expect((await mat.from('oda_sehir').select('plaka')).error).not.toBeNull()
  expect((await mat.from('oda_soru').select('id')).error).not.toBeNull()
  expect((await mat.from('oda_bulmaca').select('no')).error).not.toBeNull()

  // Yanlış tahminler: Edirne (22) ve Hakkâri (30) hedef değilse; aksi halde komşu plakalar
  const yanlislar = [22, 30, 34, 6, 35].filter((p) => p !== hedef)
  const d1 = (await mat.rpc('oda_sehir_tahmin', { p: yanlislar[0] })).data as { tahminler: { km: number; yon: string }[]; ipuclari: string[] }
  expect(d1.tahminler[0]!.km).toBeGreaterThan(0)
  expect(d1.tahminler[0]!.km % 5).toBe(0)
  expect(['kuzey', 'kuzeydoğu', 'doğu', 'güneydoğu', 'güney', 'güneybatı', 'batı', 'kuzeybatı']).toContain(d1.tahminler[0]!.yon)
  expect(d1.ipuclari).toHaveLength(1)
  expect((await mat.rpc('oda_sehir_tahmin', { p: yanlislar[0] })).error?.message).toContain('zaten denedin')
  expect((await mat.rpc('oda_sehir_tahmin', { p: 99 })).error).not.toBeNull()
  const d2 = (await mat.rpc('oda_sehir_tahmin', { p: yanlislar[1] })).data as { ipuclari: string[]; cevap: string | null }
  expect(d2.ipuclari).toHaveLength(2)
  expect(d2.cevap).toBeNull()
  const son = (await mat.rpc('oda_sehir_tahmin', { p: hedef })).data as { puan: number; cevap: string; bitti: string; ipuclari: string[] }
  expect(son.puan).toBe(3)
  expect(son.cevap).toBeTruthy()
  expect(son.ipuclari).toHaveLength(3)
  // Bittikten sonra yeni tahmin durumu değiştirmez
  expect(((await mat.rpc('oda_sehir_tahmin', { p: yanlislar[2] })).data as { tahminler: unknown[] }).tahminler).toHaveLength(3)
  // Yön denetimi: İstanbul'dan (34) bakınca Hakkâri (30) güneydoğudadır
  const yon = await svc.rpc('oda_sehir_durum_of', { s: { id: '00000000-0000-0000-0000-000000000000', gun: bugun(), durum: { tahminler: [] } } })
  expect(yon.error).toBeNull()
})

test('5 Soruda Bugün: doğru cevap ancak cevaplayınca gelir; skor doğru sayısı; çok olan önde', async () => {
  const mat = await oturum(DEMO.matematik)
  const reh = await oturum(DEMO.rehber)
  const ids = (await svc.rpc('oda_soru_gunun', { g: bugun() })).data as number[]
  const dogrular = await Promise.all(ids.map(async (id) => (await svc.from('oda_soru').select('dogru').eq('id', id).single()).data!.dogru as number))
  const d0 = (await mat.rpc('oda_soru_ac')).data as { sorular: { dogru: number | null; cevap: number | null; secenekler: string[] }[] }
  expect(d0.sorular).toHaveLength(5)
  expect(d0.sorular.every((s) => s.dogru == null && s.cevap == null && s.secenekler.length === 4)).toBe(true)
  expect((await mat.rpc('oda_soru_cevap', { p: 7 })).error).not.toBeNull()
  // Matematik: hepsi doğru. İlk cevaptan sonra yalnız ilk sorunun doğrusu açılır
  const d1 = (await mat.rpc('oda_soru_cevap', { p: dogrular[0] })).data as typeof d0
  expect(d1.sorular.map((s) => s.dogru != null)).toEqual([true, false, false, false, false])
  let son = d1 as typeof d0 & { puan?: number; bitti?: string }
  for (const k of dogrular.slice(1)) son = (await mat.rpc('oda_soru_cevap', { p: k })).data as typeof son
  expect(son.puan).toBe(5)
  expect(son.bitti).toBeTruthy()
  // Rehber: ilk ikisi yanlış
  await reh.rpc('oda_soru_ac')
  let r = null as unknown as { puan: number }
  for (let i = 0; i < 5; i++) r = (await reh.rpc('oda_soru_cevap', { p: i < 2 ? (dogrular[i]! % 4) + 1 : dogrular[i] })).data as { puan: number }
  expect(r.puan).toBe(3)
  const t = (await mat.rpc('oda_skor_tablosu', { p_oyun: 'soru', p_donem: 'gun' })).data as { puan: number; ben: boolean; sira: number }[]
  expect(t.map((x) => x.puan)).toEqual([5, 3])
  expect(t[0]!.ben).toBe(true)
  // Rozet istatistiği
  const ist = (await mat.rpc('oda_oyun_istatistik')).data as { soru_tam: number; sehir_ikide: number }
  expect(ist.soru_tam).toBe(1)
  expect(ist.sehir_ikide).toBe(0)
})

test('Mini Bulmaca: yanlış kutu sayısı döner, doğru çözümde süre yazılır; kapalı oyun ve veli', async () => {
  const mat = await oturum(DEMO.matematik)
  const veli = await oturum(DEMO.veli)
  const cozum = await bulmacaSatirlar()
  const d0 = (await mat.rpc('oda_bulmaca_ac')).data as { yatay: string[]; dusey: string[]; cozum: string[] | null }
  expect(d0.yatay).toHaveLength(3)
  expect(d0.dusey).toHaveLength(3)
  expect(d0.cozum).toBeNull()
  const bozuk = [...cozum]
  bozuk[0] = `${[...bozuk[0]!][0] === 'z' ? 'a' : 'z'}${[...bozuk[0]!].slice(1).join('')}`
  expect((await mat.rpc('oda_bulmaca_bitir', { p: bozuk })).data).toEqual({ dogru: false, yanlis: 1 })
  expect((await mat.rpc('oda_bulmaca_bitir', { p: ['abc'] })).error).not.toBeNull()
  const r = (await mat.rpc('oda_bulmaca_bitir', { p: cozum })).data as { dogru: boolean; puan: number }
  expect(r.dogru).toBe(true)
  expect(r.puan).toBeGreaterThanOrEqual(1)
  expect(((await mat.rpc('oda_bulmaca_ac')).data as { cozum: string[] }).cozum).toEqual(cozum)
  // Lig: üç oyun da sayılır (Şehir 3 tahmin, Soru 5/5, Bulmaca)
  const lig = (await mat.rpc('oda_lig')).data as { puan: number; ben: boolean; oyun_sayisi: number }[]
  expect(lig.find((x) => x.ben)!.oyun_sayisi).toBe(3)

  // Veli hiçbirini açamaz
  for (const f of ['oda_sehir_ac', 'oda_soru_ac', 'oda_bulmaca_ac']) expect((await veli.rpc(f)).error).not.toBeNull()
  // Kapalı oyun açılamaz
  const { data: okul } = await svc.from('profiles').select('school_id').eq('email', DEMO.rehber[0]).single()
  await svc.from('school_settings').upsert({ school_id: okul!.school_id, key: 'oda.oyun.bulmaca', value: false }, { onConflict: 'school_id,key' })
  const reh = await oturum(DEMO.rehber)
  expect((await reh.rpc('oda_bulmaca_ac')).error?.message).toContain('Bu oyun okulda kapalı.')
  await svc.from('school_settings').delete().eq('key', 'oda.oyun.bulmaca')
})

test('arayüz: üç oyun oynanır', async ({ page }) => {
  // Rehberin Şehir ve Bulmaca kaydı yok; Soru'yu bitirdi (önceki test)
  const hedef = await hedefPlaka()
  const hedefAd = (await svc.from('oda_sehir').select('ad').eq('plaka', hedef).single()).data!.ad as string
  const yanlis = hedef === 6 ? 'İzmir' : 'Ankara'
  await login(page, ...DEMO.rehber)
  await expect(page.getByRole('navigation', { name: 'Ana menü' })).toBeVisible()
  await page.goto('/ogretmenler-odasi?sekme=oyunlar')
  await expect(page.getByRole('button', { name: /Günün Şehri/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /Yılan/ })).toHaveCount(0)
  await shot(page, 'oda-oyunlar-yeni')

  // Günün Şehri
  await page.getByRole('button', { name: /Günün Şehri/ }).click()
  await expect(page.getByText('İpucu 1')).toBeVisible()
  await page.getByLabel(/Tahminin/).selectOption({ label: yanlis })
  await page.getByRole('button', { name: 'Tahmin et' }).click()
  const tahminler = page.getByRole('list', { name: 'Tahminler' })
  await expect(tahminler.getByRole('listitem').first()).toContainText(/\d+ km (kuzey|güney|doğu|batı)/)
  await expect(page.getByLabel(/Tahminin \(5 hak kaldı\)/)).toBeVisible()
  const axe1 = await new AxeBuilder({ page }).include('main').withTags(['wcag2a', 'wcag2aa']).analyze()
  expect(axe1.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')).toEqual([])
  await shot(page, 'oda-sehir')
  await page.getByLabel(/Tahminin/).selectOption({ label: hedefAd })
  await page.getByRole('button', { name: 'Tahmin et' }).click()
  await expect(page.getByText(`Günün şehri: ${hedefAd}`)).toBeVisible()
  await expect(page.getByText('Bildin: 2. tahminde.')).toBeVisible()
  await page.getByRole('button', { name: 'Oyunlar' }).click()

  // 5 Soruda Bugün: rehber bitirmişti, özet görünür
  await page.getByRole('button', { name: /5 Soruda Bugün/ }).click()
  await expect(page.getByText(/Bugün 5 soruda 3 doğru/)).toBeVisible()
  await shot(page, 'oda-soru-ozet')
  await page.getByRole('button', { name: 'Oyunlar' }).click()

  // Mini Bulmaca: klavyeyle doldur, kontrol et
  const cozum = await bulmacaSatirlar()
  await page.getByRole('button', { name: /Mini Bulmaca/ }).click()
  const kafes = page.getByRole('grid', { name: 'Bulmaca' })
  await expect(kafes).toBeVisible()
  await page.getByRole('button', { name: 'Kontrol et' }).click()
  await expect(page.getByText('Önce bütün kutuları doldur')).toBeVisible()
  // Ekran klavyesiyle yaz (telefondaki gibi)
  const klavye = page.getByRole('group', { name: 'Klavye' })
  const yaz = async (metin: string) => {
    for (const h of metin) await klavye.getByRole('button', { name: h.toLocaleUpperCase('tr'), exact: true }).click()
  }
  // Yatay kelimeler: ipucuna dokun (yön ve başlangıç karesi seçilir), yaz
  for (const k of [0, 1, 2]) {
    await page.getByRole('region', { name: 'Soldan sağa' }).getByRole('button').nth(k).click()
    await yaz(cozum[k * 2]!)
  }
  // Ara satırlardaki kareler (düşey kelimelerin 2. ve 4. harfleri)
  for (const r of [1, 3])
    for (const c of [0, 2, 4]) {
      await kafes.getByRole('row').nth(r).getByRole('gridcell').nth(c).click()
      await yaz([...cozum[r]!][c]!)
    }
  const axe2 = await new AxeBuilder({ page }).include('main').withTags(['wcag2a', 'wcag2aa']).analyze()
  expect(axe2.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')).toEqual([])
  await shot(page, 'oda-bulmaca')
  await page.getByRole('button', { name: 'Kontrol et' }).click()
  await expect(page.getByText(/Çözdün:/)).toBeVisible()
})

test('arayüz: 5 Soruda Bugün baştan sona oynanır', async ({ page }) => {
  const ids = (await svc.rpc('oda_soru_gunun', { g: bugun() })).data as number[]
  const sorular = await Promise.all(
    ids.map(
      async (id) =>
        (await svc.from('oda_soru').select('soru, secenekler, dogru').eq('id', id).single()).data as { soru: string; secenekler: string[]; dogru: number },
    ),
  )
  const adminId = (await svc.from('profiles').select('id').eq('email', DEMO.matematik[0]).single()).data!.id
  await svc.from('oda_oyun').delete().eq('user_id', adminId).eq('oyun', 'soru')
  await login(page, ...DEMO.matematik)
  await expect(page.getByRole('navigation', { name: 'Ana menü' })).toBeVisible()
  await page.goto('/ogretmenler-odasi?sekme=oyunlar&oyun=soru')
  for (let i = 0; i < 5; i++) {
    const s = sorular[i]!
    await expect(page.getByRole('heading', { name: s.soru })).toBeVisible()
    // Dördüncü soruda bilerek yanlış
    const sec = i === 3 ? (s.dogru % 4) + 1 : s.dogru
    await page
      .getByRole('group', { name: 'Seçenekler' })
      .getByRole('button')
      .nth(sec - 1)
      .click()
    await expect(page.getByText(i === 3 ? `Doğru cevap: ${s.secenekler[s.dogru - 1]}` : 'Doğru!')).toBeVisible()
    if (i === 3) {
      const axe = await new AxeBuilder({ page }).include('main').withTags(['wcag2a', 'wcag2aa']).analyze()
      expect(axe.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')).toEqual([])
      await shot(page, 'oda-soru')
    }
    await page.getByRole('button', { name: i === 4 ? 'Sonucu gör' : 'Sonraki soru' }).click()
  }
  await expect(page.getByText(/Bugün 5 soruda 4 doğru/)).toBeVisible()
})
