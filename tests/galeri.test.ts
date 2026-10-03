// Galeri (0022): özel albümler. Kitle (okul/kademe/sınıf/öğrenci/öğretmen), taslak/onay/yayın/arşiv, özel Storage, öğretmen yetkileri.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { anon, service, signIn, signInAdminAal2, snap, notesOf, ELIF, KEREM } from './helpers'

const svc = service()
let admin: SupabaseClient
const stamp = Date.now()
// 1×1 PNG ve küçük bir webp yer tutucu (içerik denetimi Storage türüyle yapılır)
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')
const WEBP = Buffer.from('UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA', 'base64')
const ids: Record<string, string> = {}
const OTHER = { slug: `test-okul-${stamp}`, email: `galeri-diger-${stamp}@ornek.com`, id: '', school: '' }

async function setS(p: Record<string, unknown>) {
  const { error } = await admin.rpc('set_settings', { p })
  if (error) throw error
}
async function album(c: SupabaseClient, row: Record<string, unknown>) {
  const { data, error } = await c.from('gallery_albums').insert({ title: `Galeri test ${stamp}`, ...row }).select('id').single()
  return { id: data?.id as string, error }
}
/** Hazırla → yükle (orijinal + thumb) → onayla. */
type Up = { error: { message: string; code?: string } | null; id?: string; path?: string; thumb_path?: string }
async function upload(c: SupabaseClient, albumId: string, name = 'foto.png', mime = 'image/png', body: Buffer = PNG, uploadMime?: string): Promise<Up> {
  const { data, error } = await c.rpc('gallery_prepare_upload', { p_album: albumId, p_name: name, p_mime: mime, p_size: body.length, p_view: false, p_thumb: true })
  if (error) return { error }
  const d = data as { id: string; path: string; thumb_path: string }
  const up = await c.storage.from('galeri').upload(d.path, body, { contentType: uploadMime ?? mime })
  if (up.error) return { error: up.error }
  await c.storage.from('galeri').upload(d.thumb_path, WEBP, { contentType: 'image/webp' })
  const conf = await c.rpc('gallery_confirm_upload', { p_id: d.id })
  return { error: conf.error, ...d }
}
const seen = async (c: SupabaseClient) => ((await c.from('gallery_albums').select('id').like('title', `%${stamp}%`)).data ?? []).map((r) => r.id).sort()
const canSign = async (c: SupabaseClient, path: string) => !(await c.storage.from('galeri').createSignedUrl(path, 60)).error

beforeAll(async () => {
  admin = await signInAdminAal2()
  await svc.from('school_settings').delete().or('key.eq.modul.galeri,key.like.galeri.%')
  for (const n of ['8/A', '8/B']) ids[n] = (await svc.from('classes').select('id').eq('name', n).single()).data!.id
  // Başka okul ve kullanıcısı
  OTHER.school = (await svc.from('schools').insert({ name: 'Test Diğer Okul', slug: OTHER.slug }).select('id').single()).data!.id
  const { data } = await svc.auth.admin.createUser({
    email: OTHER.email, password: 'Deneme123!', email_confirm: true,
    user_metadata: { school: OTHER.slug, consent_version: 'v1', full_name: 'Diğer Okul Öğretmen', role: 'ogretmen', branch: 'Fizik' },
  })
  OTHER.id = data.user!.id
  await svc.from('profiles').update({ status: 'approved' }).eq('id', OTHER.id)
})
afterAll(async () => {
  const { data: media } = await svc.from('gallery_media').select('path, view_path, thumb_path').like('path', '%')
  const paths = (media ?? []).flatMap((m) => [m.path, m.view_path, m.thumb_path]).filter(Boolean) as string[]
  if (paths.length) await svc.storage.from('galeri').remove(paths)
  await svc.from('gallery_albums').delete().like('title', `%${stamp}%`)
  await svc.from('school_settings').delete().or('key.eq.modul.galeri,key.like.galeri.%')
  if (OTHER.id) await svc.auth.admin.deleteUser(OTHER.id)
  // Okul açılınca oluşan varsayılan kayıtlar (eğitim yılı, dersler, galeri kategorileri) silinmeden okul silinemez
  for (const t of ['gallery_categories', 'courses', 'academic_years']) await svc.from(t).delete().eq('school_id', OTHER.school)
  const { error } = await svc.from('schools').delete().eq('id', OTHER.school)
  if (error) throw new Error(`Test okulu silinemedi: ${error.message}`)
})

describe('Albüm ve kitle', () => {
  it('modül kapalıyken kimse görmez; taslak görünmez; yayınlanınca yalnız kitle görür ve bildirim alır', async () => {
    const cat = (await admin.from('gallery_categories').select('id, name').eq('name', 'Geziler').single()).data!
    const a = await album(admin, { audience: 'sinif', class_ids: [ids['8/A']], category_id: cat.id, event_date: '2026-10-01', description: 'Çanakkale' })
    expect(a.error).toBeNull()
    ids.sinif = a.id
    const elif = await signIn('veliElif')
    const kerem = await signIn('veliKerem')
    expect(await seen(elif)).toEqual([]) // taslak + modül kapalı
    await setS({ 'modul.galeri': true })
    expect(await seen(elif)).toEqual([])
    const p = await upload(admin, a.id)
    expect(p.error).toBeNull()
    ids.path = p.path!
    ids.thumb = p.thumb_path!
    expect(p.path).toMatch(new RegExp(`^[0-9a-f-]{36}/[0-9a-f-]{36}/${a.id}/[0-9a-f-]{36}/original\\.png$`))
    const before = await snap()
    expect((await admin.rpc('gallery_publish', { p_album: a.id, p_notify: true })).data).toBe('yayinda')
    expect(await seen(elif)).toEqual([a.id])
    expect(await seen(kerem)).toEqual([])
    expect(await notesOf(elif, before)).toEqual([`Galeri: Galeri test ${stamp} albümü eklendi`])
    expect(await notesOf(kerem, before)).toEqual([])
    await setS({ 'modul.galeri': false })
    expect(await seen(elif)).toEqual([])
    await setS({ 'modul.galeri': true })
  })

  it('özel Storage: kitle imzalı bağlantı alır; başka sınıf velisi, girişsiz ve başka okul alamaz; herkese açık bağlantı yok', async () => {
    expect(await canSign(await signIn('veliElif'), ids.thumb!)).toBe(true)
    expect(await canSign(await signIn('veliElif'), ids.path!)).toBe(true)
    expect(await canSign(await signIn('veliKerem'), ids.path!)).toBe(false)
    expect(await canSign(anon(), ids.path!)).toBe(false)
    const other = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!, { auth: { persistSession: false } })
    await other.auth.signInWithPassword({ email: OTHER.email, password: 'Deneme123!' })
    expect(await canSign(other, ids.path!)).toBe(false)
    expect(await seen(other)).toEqual([])
    const pub = anon().storage.from('galeri').getPublicUrl(ids.path!).data.publicUrl
    expect((await fetch(pub)).status).toBeGreaterThanOrEqual(400)
    // Yol tahmini: kayıtsız bir yol imzalanamaz
    expect(await canSign(admin, ids.path!.replace(/original\.png$/, 'baska.png'))).toBe(false)
  })

  it('öğrenci, kademe ve yalnız öğretmen kitlesi', async () => {
    const s = await album(admin, { audience: 'ogrenci', student_ids: [ELIF] })
    const k = await album(admin, { audience: 'kademe', level: 'ortaokul' })
    const t = await album(admin, { audience: 'ogretmen' })
    for (const x of [s, k, t]) await admin.rpc('gallery_publish', { p_album: x.id })
    expect(await seen(await signIn('elif'))).toEqual([ids.sinif!, s.id, k.id].sort())
    expect(await seen(await signIn('veliKerem'))).toEqual([k.id])
    expect((await seen(await signIn('matematik'))).includes(t.id)).toBe(true)
    expect((await seen(await signIn('veliElif'))).includes(t.id)).toBe(false)
    expect((await album(admin, { audience: 'kademe' })).error).not.toBeNull() // kademe seçilmeli
  })
})

describe('Yükleme denetimleri', () => {
  it('sahte uzantı, desteklenmeyen tür, büyük dosya ve bildirilenden farklı tür reddedilir', async () => {
    const r = (name: string, mime: string, size = 100) => admin.rpc('gallery_prepare_upload', { p_album: ids.sinif, p_name: name, p_mime: mime, p_size: size })
    expect((await r('video.jpg', 'video/mp4')).error?.message).toMatch(/Yalnız JPG/)
    expect((await r('belge.pdf', 'application/pdf')).error?.message).toMatch(/Yalnız JPG/)
    expect((await r('foto.exe', 'image/jpeg')).error?.message).toMatch(/Yalnız JPG/)
    expect((await r('buyuk.jpg', 'image/jpeg', 16 * 1048576)).error?.message).toBe('Fotoğraf en çok 15 MB olabilir.')
    expect((await r('film.mp4', 'video/mp4', 51 * 1048576)).error?.message).toBe('Video en çok 50 MB olabilir.')
    expect((await upload(admin, ids.sinif!, 'sahte.jpg', 'image/jpeg', PNG, 'image/png')).error?.message).toMatch(/uyuşmuyor/)
  })
})

describe('Öğretmen', () => {
  it('ayar kapalıyken albüm açamaz; açılınca yalnız ders verdiği sınıfa; yüklemesi onay bekler', async () => {
    const mat = await signIn('matematik')
    expect((await album(mat, { audience: 'sinif', class_ids: [ids['8/A']] })).error?.message).toMatch(/row-level|yetkin/)
    await setS({ 'galeri.ogretmen_album': true, 'galeri.ogretmen_yukleme': true })
    expect((await album(mat, { audience: 'okul' })).error?.message).toMatch(/kitle için albüm yetkin yok/)
    expect((await album(mat, { audience: 'sinif', class_ids: [ids['8/B']] })).error?.message).toMatch(/kitle için albüm yetkin yok/)
    const a = await album(mat, { audience: 'sinif', class_ids: [ids['8/A']], title: `Matematik kulübü ${stamp}` })
    expect(a.error).toBeNull()
    const p = await upload(mat, a.id)
    expect(p.error).toBeNull()
    expect((await svc.from('gallery_media').select('approved').eq('id', p.id!).single()).data!.approved).toBe(false)
    expect((await mat.from('gallery_media').update({ approved: true }).eq('id', p.id!)).error?.message).toMatch(/yalnız yönetici/)
    expect((await mat.from('gallery_albums').update({ status: 'yayinda' }).eq('id', a.id)).error?.message).toMatch(/Durum yalnız/)
    const before = await snap()
    expect((await mat.rpc('gallery_publish', { p_album: a.id, p_notify: true })).data).toBe('onay_bekliyor')
    expect(await notesOf(admin, before)).toContain(`Galeri: Matematik kulübü ${stamp} albümü onay bekliyor`)
    expect(await seen(await signIn('veliElif'))).not.toContain(a.id)
    // Yönetici yayınlar: albüm ve bekleyen medya onaylanır
    expect((await admin.rpc('gallery_publish', { p_album: a.id })).data).toBe('yayinda')
    expect((await svc.from('gallery_media').select('approved').eq('id', p.id!).single()).data!.approved).toBe(true)
    expect(await canSign(await signIn('veliElif'), p.path!)).toBe(true)
    // Başka öğretmen bu albümü yönetemez
    expect((await (await signIn('fen')).from('gallery_albums').update({ title: 'Değişti' }).eq('id', a.id).select('id')).data ?? []).toEqual([])
    await setS({ 'galeri.ogretmen_album': false, 'galeri.ogretmen_yukleme': false })
  })
})

describe('Arşiv ve silme', () => {
  it('arşivlenen albüm kaybolur, yalnız yönetici geri alır; işlem kaydı', async () => {
    expect((await admin.rpc('gallery_archive', { p_album: ids.sinif, p_archive: true })).data).toBe('arsiv')
    expect(await seen(await signIn('veliElif'))).not.toContain(ids.sinif)
    expect(await canSign(await signIn('veliElif'), ids.path!)).toBe(false)
    expect((await (await signIn('rehber')).rpc('gallery_archive', { p_album: ids.sinif, p_archive: false })).error?.code).toBe('42501')
    expect((await admin.rpc('gallery_archive', { p_album: ids.sinif, p_archive: false })).data).toBe('yayinda')
    expect(await seen(await signIn('veliElif'))).toContain(ids.sinif)
    const { data: log } = await svc.from('audit_log').select('action').eq('entity_id', ids.sinif!).order('id')
    expect((log ?? []).map((l) => l.action)).toEqual(expect.arrayContaining(['album_create', 'album_publish', 'album_archive', 'album_restore']))
    expect((await svc.from('audit_log').select('action').eq('action', 'media_upload').limit(1)).data).toHaveLength(1)
  })

  it('kalıcı silme: önce dosyalar, sonra kayıt; işlem kaydında medya sayısı', async () => {
    const { data: m } = await admin.from('gallery_media').select('path, thumb_path').eq('album_id', ids.sinif!)
    const files = (m ?? []).flatMap((x) => [x.path, x.thumb_path]).filter(Boolean) as string[]
    expect((await admin.storage.from('galeri').remove(files)).error).toBeNull()
    expect((await admin.from('gallery_albums').delete().eq('id', ids.sinif!)).error).toBeNull()
    const { data: o } = await svc.storage.from('galeri').list(ids.path!.split('/').slice(0, 3).join('/'))
    expect(o ?? []).toEqual([])
    const { data: log } = await svc.from('audit_log').select('meta').eq('action', 'album_delete').eq('entity_id', ids.sinif!).single()
    expect(log!.meta).toMatchObject({ media: 1 })
  })
})

export { KEREM }
