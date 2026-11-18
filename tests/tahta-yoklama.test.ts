// BK Akıllı Yoklama (0080): tahta eşleştirme, öğretmen PIN'i, tahtadan yoklama, kilit ve pilot sınıfta bekletilen veli bildirimi.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { anon, notesOf, service, signIn, signInAdminAal2, snap, sid, ELIF, KEREM } from './helpers'

const SCHOOL = '00000000-0000-4000-8000-000000000001'
const ist = (d: Date) => new Date(d.getTime() + 3 * 3600_000).toISOString().slice(0, 10)
const today = ist(new Date())
const yesterday = ist(new Date(Date.now() - 86400_000))
const tomorrow = ist(new Date(Date.now() + 86400_000))
const dd = (d: string) => d.split('-').reverse().join('.')
const AYSE = sid('1185'), DENIZ = sid('1186')

let admin: SupabaseClient
let cls8A = '', cls8C = ''
let tahtaId = '', token = ''

async function cleanup() {
  const svc = service()
  await svc.from('tahta').delete().in('class_id', [cls8A, cls8C])
  await svc.from('attendance').delete().in('student_id', [ELIF, AYSE, DENIZ, KEREM]).in('day', [yesterday, today, tomorrow])
  await svc.from('yoklama_bildirim').delete().in('student_id', [ELIF, AYSE, DENIZ, KEREM])
  await svc.from('yoklama_oturum').delete().eq('class_id', cls8A)
  await svc.from('school_settings').delete().eq('school_id', SCHOOL).eq('key', 'yoklama.bildirim_saati')
}

beforeAll(async () => {
  admin = await signInAdminAal2()
  const { data } = await service().from('classes').select('id, name').in('name', ['8/A', '8/C'])
  cls8A = data!.find((c) => c.name === '8/A')!.id
  cls8C = data!.find((c) => c.name === '8/C')!.id
  await cleanup()
})
afterAll(cleanup)

describe('Tahta ekleme ve eşleştirme', () => {
  it('yalnız yönetici tahta ekler; kod tek kullanımlık, token yalnız tahtaya döner', async () => {
    const mat = await signIn('matematik')
    expect((await mat.rpc('tahta_ekle', { p_class: cls8A })).error).not.toBeNull()
    expect((await anon().rpc('tahta_listesi')).error).not.toBeNull()

    const { data, error } = await admin.rpc('tahta_ekle', { p_class: cls8A })
    expect(error).toBeNull()
    expect(data.kod).toMatch(/^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/)
    tahtaId = data.id
    expect((await admin.rpc('tahta_ekle', { p_class: cls8A })).error?.code).toBe('23505')

    // Tablolar istemciye kapalı (token özeti dahil)
    expect((await admin.from('tahta').select('token_hash')).error).not.toBeNull()

    expect((await anon().rpc('tahta_eslestir', { p_kod: 'AAAA-AAAA' })).error).not.toBeNull()
    const pair = await anon().rpc('tahta_eslestir', { p_kod: ` ${data.kod.toLowerCase().replace('-', ' ')} ` })
    expect(pair.error).toBeNull()
    expect(pair.data).toMatchObject({ tahta: '8/A tahtası', sinif: '8/A' })
    token = pair.data.token
    expect(token).toMatch(/^[0-9a-f]{64}$/)
    expect((await anon().rpc('tahta_eslestir', { p_kod: data.kod })).error).not.toBeNull()

    const list = await admin.rpc('tahta_listesi')
    expect(list.data).toEqual([expect.objectContaining({ id: tahtaId, sinif: '8/A', eslesti: true, kod_son: null })])
  })

  it('tahta yalnız pilot sınıfları görür; geçersiz token reddedilir', async () => {
    expect((await anon().rpc('tahta_durum', { p_token: 'f'.repeat(64) })).error?.code).toBe('28000')
    const { data, error } = await anon().rpc('tahta_durum', { p_token: token })
    expect(error).toBeNull()
    expect(data.siniflar.map((c: { ad: string }) => c.ad)).toEqual(['8/A'])
    expect(data.bildirim_saati).toBe('10:00')
    expect((await anon().rpc('tahta_liste', { p_token: token, p_class: cls8C })).error?.code).toBe('42501')
    const l = await anon().rpc('tahta_liste', { p_token: token, p_class: cls8A })
    expect(l.data.ogrenciler[0]).toEqual({ id: ELIF, ad: 'Elif Yıldız', no: '1184', durum: 'geldi', kilitli: false })
  })
})

describe('Öğretmen PIN ve tahtadan gönderim', () => {
  let pin = ''
  it("PIN'i sistem verir; veli ve öğrenci alamaz", async () => {
    const mat = await signIn('matematik')
    const { data, error } = await mat.rpc('tahta_pin_yenile')
    expect(error).toBeNull()
    expect(data).toMatch(/^\d{4}$/)
    expect(data).not.toMatch(/^(\d)\1{3}$/)
    pin = data
    expect((await mat.rpc('tahta_pin_durum')).data).toMatchObject({ var: true, pilot: true, son_kullanim: null })
    expect((await (await signIn('veliElif')).rpc('tahta_pin_yenile')).error).not.toBeNull()
    expect((await mat.from('tahta_pin').select('pin_hash')).error).not.toBeNull()
  })

  it('yanlış PIN kaydetmez; doğru PIN öğretmenin adıyla kaydeder, idarenin izinli/raporlu kaydı kilitli kalır', async () => {
    await service().from('school_settings').upsert({ school_id: SCHOOL, key: 'yoklama.bildirim_saati', value: 'anlik' })
    await admin.from('attendance').upsert({ school_id: SCHOOL, student_id: DENIZ, day: today, status: 'raporlu' }, { onConflict: 'student_id,day' })
    const kayit = { [ELIF]: 'devamsiz', [AYSE]: 'gec', [DENIZ]: 'devamsiz' }
    const wrong = pin === '2580' ? '2581' : '2580'
    const bad = await anon().rpc('tahta_yoklama_gonder', { p_token: token, p_pin: wrong, p_class: cls8A, p_kayit: kayit })
    expect(bad.data).toEqual({ ok: false, hata: 'pin', kalan: 4 })
    expect((await service().from('attendance').select('id').eq('student_id', ELIF).eq('day', today)).data).toEqual([])

    const before = await snap()
    const ok = await anon().rpc('tahta_yoklama_gonder', { p_token: token, p_pin: pin, p_class: cls8A, p_kayit: kayit })
    expect(ok.error).toBeNull()
    expect(ok.data).toMatchObject({ ok: true, ogretmen: expect.any(String), sinif: '8/A', bildirilecek: 2, bekliyor: false })
    const { data: rows } = await service().from('attendance').select('student_id, status, kaynak, created_by').eq('day', today).in('student_id', [ELIF, AYSE, DENIZ])
    const by = Object.fromEntries(rows!.map((r) => [r.student_id, r]))
    expect(by[ELIF]).toMatchObject({ status: 'devamsiz', kaynak: 'tahta' })
    expect(by[ELIF].created_by).not.toBeNull()
    expect(by[AYSE]).toMatchObject({ status: 'gec', kaynak: 'tahta' })
    expect(by[DENIZ]).toMatchObject({ status: 'raporlu', kaynak: 'site' })
    expect(await notesOf(await signIn('veliElif'), before)).toEqual([`Elif Yıldız ${dd(today)} günü okula gelmedi.`])

    const l = await anon().rpc('tahta_liste', { p_token: token, p_class: cls8A })
    expect(l.data.alindi).toMatchObject({ kim: ok.data.ogretmen })
    expect(l.data.ogrenciler.find((s: { id: string }) => s.id === DENIZ)).toMatchObject({ durum: 'raporlu', kilitli: true })

    // Düzeltme: Elif geldi → kayıt silinir, veliye düzeltme gider
    const before2 = await snap()
    await anon().rpc('tahta_yoklama_gonder', { p_token: token, p_pin: pin, p_class: cls8A, p_kayit: { [ELIF]: 'geldi' } })
    expect((await service().from('attendance').select('id').eq('student_id', ELIF).eq('day', today)).data).toEqual([])
    expect(await notesOf(await signIn('veliElif'), before2)).toEqual([`Düzeltme: Elif Yıldız ${dd(today)} günü okuldaydı.`])
    expect((await service().from('yoklama_oturum').select('duzeltme').eq('class_id', cls8A).eq('day', today).single()).data!.duzeltme).toBe(1)
  })

  it('başka sınıfın öğrencisi ya da geçersiz durum reddedilir', async () => {
    const r1 = await anon().rpc('tahta_yoklama_gonder', { p_token: token, p_pin: pin, p_class: cls8A, p_kayit: { [KEREM]: 'devamsiz' } })
    expect(r1.error?.code).toBe('22023')
    const r2 = await anon().rpc('tahta_yoklama_gonder', { p_token: token, p_pin: pin, p_class: cls8A, p_kayit: { [ELIF]: 'kacti' } })
    expect(r2.error?.code).toBe('22023')
    const r3 = await anon().rpc('tahta_yoklama_gonder', { p_token: token, p_pin: pin, p_class: cls8C, p_kayit: {} })
    expect(r3.error?.code).toBe('42501')
  })

  it('5 yanlış PIN tahtayı kilitler, idareye bildirim gider; idare kilidi açar', async () => {
    const wrong = pin === '2580' ? '2581' : '2580'
    const before = await snap()
    let last: { ok: boolean; hata: string } | null = null
    for (let i = 0; i < 5; i++) last = (await anon().rpc('tahta_yoklama_gonder', { p_token: token, p_pin: wrong, p_class: cls8A, p_kayit: {} })).data
    expect(last).toMatchObject({ ok: false, hata: 'kilit' })
    // Kilitliyken doğru PIN de kabul edilmez
    expect((await anon().rpc('tahta_yoklama_gonder', { p_token: token, p_pin: pin, p_class: cls8A, p_kayit: {} })).data).toMatchObject({ hata: 'kilit' })
    expect((await notesOf(admin, before)).some((t) => t.startsWith('8/A tahtası tahtasında art arda yanlış PIN'))).toBe(true)
    expect((await admin.rpc('tahta_kilit_ac', { p_id: tahtaId })).error).toBeNull()
    expect((await anon().rpc('tahta_yoklama_gonder', { p_token: token, p_pin: pin, p_class: cls8A, p_kayit: {} })).data).toMatchObject({ ok: true })
  })
})

describe('Pilot sınıfta veli bildirimi', () => {
  it('saati gelmeden bekler, saatinde son duruma göre tek bildirim gider', async () => {
    await service().from('school_settings').delete().eq('school_id', SCHOOL).eq('key', 'yoklama.bildirim_saati')
    const veli = await signIn('veliElif')
    const before = await snap()
    await admin.from('attendance').upsert({ school_id: SCHOOL, student_id: ELIF, day: tomorrow, status: 'devamsiz' }, { onConflict: 'student_id,day' })
    await admin.from('attendance').upsert({ school_id: SCHOOL, student_id: ELIF, day: tomorrow, status: 'gec' }, { onConflict: 'student_id,day' })
    expect(await notesOf(veli, before)).toEqual([])

    const svc = service()
    expect((await svc.rpc('yoklama_bildirim_gonder', { p_simdi: `${tomorrow}T09:59:00+03:00` })).data).toBe(0)
    expect(await notesOf(veli, before)).toEqual([])
    expect((await svc.rpc('yoklama_bildirim_gonder', { p_simdi: `${tomorrow}T10:00:00+03:00` })).data).toBeGreaterThanOrEqual(1)
    expect(await notesOf(veli, before)).toEqual([`Elif Yıldız ${dd(tomorrow)} günü okula geç geldi.`])
    expect((await (anon()).rpc('yoklama_bildirim_gonder')).error).not.toBeNull()
  })

  it('geç gelen düzeltilince veliye hiç "gelmedi" gitmez', async () => {
    const veli = await signIn('veliElif')
    await service().from('attendance').delete().eq('student_id', ELIF).eq('day', tomorrow)
    await service().from('yoklama_bildirim').delete().eq('student_id', ELIF).eq('day', tomorrow)
    const before = await snap()
    await admin.from('attendance').upsert({ school_id: SCHOOL, student_id: ELIF, day: tomorrow, status: 'devamsiz' }, { onConflict: 'student_id,day' })
    await admin.from('attendance').delete().eq('student_id', ELIF).eq('day', tomorrow)
    await service().rpc('yoklama_bildirim_gonder', { p_simdi: `${tomorrow}T10:00:00+03:00` })
    expect(await notesOf(veli, before)).toEqual([])
  })

  it('saat geçtiyse hemen gider; sonraki değişiklik "Düzeltme" olarak gider', async () => {
    const veli = await signIn('veliElif')
    const before = await snap()
    await admin.from('attendance').upsert({ school_id: SCHOOL, student_id: ELIF, day: yesterday, status: 'devamsiz' }, { onConflict: 'student_id,day' })
    await admin.from('attendance').upsert({ school_id: SCHOOL, student_id: ELIF, day: yesterday, status: 'izinli' }, { onConflict: 'student_id,day' })
    expect(await notesOf(veli, before)).toEqual([
      `Elif Yıldız ${dd(yesterday)} günü okula gelmedi.`,
      `Düzeltme: Elif Yıldız ${dd(yesterday)} günü izinli sayıldı.`,
    ])
  })

  it('pilot dışı sınıfta davranış değişmez: anında bildirim, izinliye çevirmek düzeltme göndermez', async () => {
    const veli = await signIn('veliKerem')
    const before = await snap()
    await admin.from('attendance').upsert({ school_id: SCHOOL, student_id: KEREM, day: tomorrow, status: 'devamsiz' }, { onConflict: 'student_id,day' })
    await admin.from('attendance').upsert({ school_id: SCHOOL, student_id: KEREM, day: tomorrow, status: 'izinli' }, { onConflict: 'student_id,day' })
    expect(await notesOf(veli, before)).toEqual([`Kerem Aydın ${dd(tomorrow)} günü okula gelmedi.`])
  })

  it('tahta kaldırılınca sınıf pilottan çıkar', async () => {
    expect((await admin.rpc('tahta_kaldir', { p_id: tahtaId })).error).toBeNull()
    expect((await anon().rpc('tahta_durum', { p_token: token })).error?.code).toBe('28000')
    const veli = await signIn('veliElif')
    const before = await snap()
    await admin.from('attendance').upsert({ school_id: SCHOOL, student_id: ELIF, day: tomorrow, status: 'devamsiz' }, { onConflict: 'student_id,day' })
    expect(await notesOf(veli, before)).toEqual([`Elif Yıldız ${dd(tomorrow)} günü okula gelmedi.`])
  })
})
