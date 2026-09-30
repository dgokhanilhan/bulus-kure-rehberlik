// Faz C (0014): ek dosyalar (mesaj, duyuru, ödev, öğrenci teslimi), Storage erişimi, dosya ve duyuru ayarları.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { anon, service, signIn, signInAdminAal2, ELIF } from './helpers'

const SCHOOL = '00000000-0000-4000-8000-000000000001'
const svc = service()
let admin: SupabaseClient
const pdf = () => new Blob(['%PDF-1.4\n% test\n'], { type: 'application/pdf' })
const png = () => new Blob([Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0])], { type: 'image/png' })
const idOf = async (email: string) => (await svc.from('profiles').select('id').eq('email', email).single()).data!.id as string

/** prepare → upload → confirm; hata olursa ilk hatayı döner. */
type Err = { code?: string; message: string } | null
async function attach(c: SupabaseClient, kind: string, parent: string, blob: Blob, name: string, extra: Record<string, unknown> = {}): Promise<{ error: Err; path: string | null; id: string | null }> {
  const prep = await c.rpc('prepare_upload', { p_kind: kind, p_parent: parent, p_file_name: name, p_mime: blob.type, p_size: blob.size, ...extra })
  if (prep.error) return { error: prep.error, path: null as string | null, id: null as string | null }
  const { path, id } = prep.data as { path: string; id: string }
  const up = await c.storage.from('ekler').upload(path, blob, { contentType: blob.type })
  if (up.error) return { error: up.error, path, id }
  const conf = await c.rpc('confirm_upload', { p_id: id })
  return { error: conf.error, path, id }
}
const canDownload = async (c: SupabaseClient, path: string) => !(await c.storage.from('ekler').download(path)).error

beforeAll(async () => {
  admin = await signInAdminAal2()
  await svc.from('conversations').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  await svc.from('announcements').delete().like('title', 'Test %')
  await svc.from('homework').delete().like('title', 'Test %')
})
afterAll(async () => {
  await svc.from('announcements').delete().like('title', 'Test %')
  await svc.from('homework').delete().like('title', 'Test %')
  await svc.from('school_settings').delete().or('key.like.dosya.%,key.like.mesaj.%,key.like.duyuru.%,key.like.odev.%')
})

describe('Mesaj ekleri', () => {
  let path = ''
  it('veli dosyalı mesaj gönderir; yalnız karşı taraf ve yönetici indirir', async () => {
    const veli = await signIn('veliElif')
    const mat = await idOf('matematik@buluskure.k12.tr')
    const { data: conv } = await veli.rpc('start_conversation', { p_student: ELIF, p_other: mat })
    const { data: msg, error } = await veli.rpc('send_message', { p_conversation: conv, p_body: '', p_with_files: true })
    expect(error).toBeNull()
    const r = await attach(veli, 'message', msg as string, pdf(), 'Ödev Fotoğrafı.pdf')
    expect(r.error).toBeNull()
    path = r.path!
    expect(path).toMatch(/\/message\/.+-odev-fotografi\.pdf$/)
    expect(await canDownload(await signIn('matematik'), path)).toBe(true)
    expect(await canDownload(admin, path)).toBe(true)
    expect(await canDownload(await signIn('veliKerem'), path)).toBe(false)
    expect(await canDownload(await signIn('fen'), path)).toBe(false)
    expect((await anon().storage.from('ekler').download(path)).error).not.toBeNull()
    // Kayıt da yalnız taraflara görünür
    expect((await (await signIn('veliKerem')).from('attachments').select('id').eq('path', path)).data ?? []).toEqual([])
    expect((await (await signIn('matematik')).from('attachments').select('file_name').eq('path', path)).data).toEqual([{ file_name: 'Ödev Fotoğrafı.pdf' }])
  })

  it('boyut, tür ve ayar sınırları; hazırlanmamış yola yükleme yok', async () => {
    const veli = await signIn('veliElif')
    const { data: conv } = await svc.from('conversations').select('id').limit(1).single()
    const { data: msg } = await veli.rpc('send_message', { p_conversation: conv!.id, p_body: 'ek', p_with_files: true })
    const big = await veli.rpc('prepare_upload', { p_kind: 'message', p_parent: msg, p_file_name: 'x.pdf', p_mime: 'application/pdf', p_size: 11 * 1048576 })
    expect(big.error?.message).toMatch(/en fazla 10 MB/)
    const exe = await veli.rpc('prepare_upload', { p_kind: 'message', p_parent: msg, p_file_name: 'x.exe', p_mime: 'application/x-msdownload', p_size: 10 })
    expect(exe.error?.message).toMatch(/Yalnız JPG, PNG, WEBP ve PDF/)
    expect((await veli.storage.from('ekler').upload(`${SCHOOL}/message/${msg}/uydurma.pdf`, pdf(), { contentType: 'application/pdf' })).error).not.toBeNull()
    // Bildirilen tür ile yüklenen tür farklı → onaylanmaz
    const prep = await veli.rpc('prepare_upload', { p_kind: 'message', p_parent: msg, p_file_name: 'a.pdf', p_mime: 'application/pdf', p_size: png().size })
    await veli.storage.from('ekler').upload((prep.data as { path: string }).path, png(), { contentType: 'image/png' })
    expect((await veli.rpc('confirm_upload', { p_id: (prep.data as { id: string }).id })).error?.message).toMatch(/uyuşmuyor/)
    // Ayar: mesajda dosya kapalı
    await admin.rpc('set_settings', { p: { 'mesaj.dosya': false } })
    expect((await veli.rpc('send_message', { p_conversation: conv!.id, p_body: '', p_with_files: true })).error?.message).toMatch(/dosya gönderimi kapalı/)
    expect((await attach(veli, 'message', msg as string, pdf(), 'b.pdf')).error?.code).toBe('42501')
    await admin.rpc('set_settings', { p: { 'mesaj.dosya': true } })
    // Başkasının mesajına dosya eklenemez
    expect((await attach(await signIn('matematik'), 'message', msg as string, pdf(), 'c.pdf')).error?.code).toBe('42501')
  })
})

describe('Duyuru ekleri ve öğretmen duyuru yetkisi', () => {
  it('kapak görseli ve PDF; yalnız duyuruyu görenler indirir', async () => {
    const rehber = await signIn('rehber')
    const me = await idOf('rehber@buluskure.k12.tr')
    const c8A = (await svc.from('classes').select('id').eq('name', '8/A').single()).data!.id
    const { data: a } = await rehber.from('announcements').insert({ school_id: SCHOOL, created_by: me, title: 'Test gezi', body: 'Çanakkale', scope: 'sinif', class_id: c8A, audience: ['veli'] }).select('id').single()
    const cover = await attach(rehber, 'announcement', a!.id, png(), 'afis.png', { p_cover: true })
    const doc = await attach(rehber, 'announcement', a!.id, pdf(), 'izin-belgesi.pdf')
    expect([cover.error, doc.error]).toEqual([null, null])
    expect((await attach(rehber, 'announcement', a!.id, pdf(), 'k.pdf', { p_cover: true })).error?.message).toMatch(/Kapak/)
    expect(await canDownload(await signIn('veliElif'), cover.path!)).toBe(true)
    expect(await canDownload(await signIn('veliKerem'), doc.path!)).toBe(false)
    expect(await canDownload(await signIn('elif'), doc.path!)).toBe(false) // hedef kitle yalnız veli
  })

  it('öğretmen kapsamı ayardan: sınıf → okul; yazma kapatılabilir', async () => {
    const mat = await signIn('matematik')
    const me = await idOf('matematik@buluskure.k12.tr')
    const c8A = (await svc.from('classes').select('id').eq('name', '8/A').single()).data!.id
    const ins = (scope: string, extra: Record<string, unknown> = {}) =>
      mat.from('announcements').insert({ school_id: SCHOOL, created_by: me, title: `Test ${scope}`, body: 'x', scope, audience: ['veli'], ...extra })
    expect((await ins('okul')).error).not.toBeNull()
    expect((await ins('kademe', { level: 'ortaokul' })).error).not.toBeNull()
    await admin.rpc('set_settings', { p: { 'duyuru.ogretmen_kapsam': 'kademe' } })
    expect((await ins('kademe', { level: 'ortaokul' })).error).toBeNull()
    expect((await ins('kademe', { level: 'lise' })).error).not.toBeNull() // lisede sınıfı yok
    await admin.rpc('set_settings', { p: { 'duyuru.ogretmen_kapsam': 'okul' } })
    expect((await ins('okul')).error).toBeNull()
    expect((await admin.rpc('set_settings', { p: { 'duyuru.ogretmen_kapsam': 'evren' } })).error?.message).toMatch(/geçersiz seçim/)
    await admin.rpc('set_settings', { p: { 'duyuru.ogretmen_yazabilir': false } })
    expect((await ins('sinif', { class_id: c8A })).error).not.toBeNull()
    await admin.rpc('set_settings', { p: { 'duyuru.ogretmen_yazabilir': true, 'duyuru.ogretmen_kapsam': 'sinif' } })
  })
})

describe('Ödev ekleri ve öğrenci teslimi', () => {
  it('öğretmen dosyası sınıfa; öğrenci teslimi ayarla açılır, yalnız öğrenci/veli/öğretmen görür', async () => {
    const t = await signIn('matematik')
    const me = await idOf('matematik@buluskure.k12.tr')
    const c8A = (await svc.from('classes').select('id').eq('name', '8/A').single()).data!.id
    const mat = (await svc.from('courses').select('id').eq('name', 'Matematik').single()).data!.id
    const due = new Date(Date.now() + 5 * 86400_000).toISOString().slice(0, 10)
    const { data: hw } = await t.from('homework').insert({ school_id: SCHOOL, class_id: c8A, course_id: mat, teacher_id: me, title: 'Test ekli ödev', due_on: due }).select('id').single()
    const f = await attach(t, 'homework', hw!.id, pdf(), 'calisma-kagidi.pdf')
    expect(f.error).toBeNull()
    expect(await canDownload(await signIn('elif'), f.path!)).toBe(true)
    expect(await canDownload(await signIn('veliKerem'), f.path!)).toBe(false)

    const elif = await signIn('elif')
    expect((await attach(elif, 'submission', hw!.id, png(), 'cevap.png', { p_student: ELIF })).error?.code).toBe('42501') // ayar kapalı
    await admin.rpc('set_settings', { p: { 'odev.ogrenci_dosya': true } })
    const sub = await attach(elif, 'submission', hw!.id, png(), 'cevap.png', { p_student: ELIF })
    expect(sub.error).toBeNull()
    expect(await canDownload(await signIn('veliElif'), sub.path!)).toBe(true)
    expect(await canDownload(t, sub.path!)).toBe(true)
    expect(await canDownload(await signIn('fen'), sub.path!)).toBe(false)
    // Başka öğrenci adına teslim yok
    const KEREM = '00000000-0000-4000-8001-000000001201'
    expect((await attach(elif, 'submission', hw!.id, png(), 'x.png', { p_student: KEREM })).error?.code).toBe('42501')
  })
})

describe('Okul logosu', () => {
  it('giriş ekranı okul adını ve logoyu görür; logoyu yalnız yönetici yükler', async () => {
    const { data } = await anon().rpc('public_school_info', { p_slug: 'bulus-kure' })
    expect(data).toMatchObject({ name: expect.any(String) })
    expect((await (await signIn('rehber')).storage.from('okul').upload(`${SCHOOL}/logo-x.png`, png(), { contentType: 'image/png' })).error).not.toBeNull()
    const path = `${SCHOOL}/logo-${Date.now()}.png`
    expect((await admin.storage.from('okul').upload(path, png(), { contentType: 'image/png' })).error).toBeNull()
    await admin.rpc('set_settings', { p: { 'genel.logo': path } })
    expect(((await anon().rpc('public_school_info', { p_slug: 'bulus-kure' })).data as { logo: string }).logo).toBe(path)
    expect((await anon().storage.from('okul').download(path)).error).toBeNull()
    await admin.rpc('set_settings', { p: { 'genel.logo': '' } })
    await admin.storage.from('okul').remove([path])
  })
})
