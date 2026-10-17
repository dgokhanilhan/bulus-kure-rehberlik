// Okul ayarları (0052): spec ↔ ayar adları ↔ kod tutarlılığı; ayarın veritabanında da uygulandığı (RLS/tetikleyici); varsayılana dön,
// geçmiş, kalıp denetimi, kayıt ve öğretmen MFA ayarı.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { SupabaseClient } from '@supabase/supabase-js'
import { AYARLAR } from '../src/lib/ayarAdlari'
import { ELIF, REHBER_ID, inDays, register, service, signIn, signInAdminAal2 } from './helpers'

const svc = service()
const SCHOOL = '00000000-0000-4000-8000-000000000001'
const TEST_KEYS = ['aile.gorevler', 'ogretmen.not_ekleme', 'kayit.acik', 'guvenlik.ogretmen_mfa', 'rapor.imza', 'etut.saatler_lise', 'menu.ad.duyurular']
const temizle = () => svc.from('school_settings').delete().eq('school_id', SCHOOL).in('key', TEST_KEYS)
const ayarla = (key: string, value: unknown) => svc.from('school_settings').upsert({ school_id: SCHOOL, key, value }, { onConflict: 'school_id,key' })
let rehber: SupabaseClient, admin: SupabaseClient, mat: SupabaseClient, veli: SupabaseClient
beforeAll(async () => {
  await temizle()
  rehber = await signIn('rehber')
  mat = await signIn('matematik')
  veli = await signIn('veliElif')
  admin = await signInAdminAal2()
})
afterAll(temizle)

function srcFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f)
    return statSync(p).isDirectory() ? srcFiles(p) : /\.(ts|tsx)$/.test(p) && !p.endsWith('ayarAdlari.ts') && !/\.test\.tsx?$/.test(p) ? [p] : []
  })
}
const PREFIX = 'genel|gorunum|modul|bildirim|odev|duyuru|dosya|galeri|yoklama|takvim|bursluluk|mesaj|okul|panel|analiz|etut|gozetmen|rapor|kayit|guvenlik|aile|ogretmen|metin|menu'
/** 0052 öncesinden kalan, tanımlı ama hiçbir yerde okunmayan ayarlar (docs/ayarlar-envanteri.md). Yenisi eklenmez. */
const ESKI_KULLANILMAYAN = ['yoklama.ogretmen_girebilir', 'bursluluk.aciklama']
/** Kodda dinamik kurulan anahtarlar (ör. `menu.ad.${sayfa}`) */
const DINAMIK = ['menu.ad.', 'menu.gizli.', 'menu.sira.', 'modul.', 'bildirim.', 'yoklama.limit_', 'etut.saatler_']

describe('ayar tanımları', () => {
  it('veritabanı spec ile ayar adları birebir aynı (anahtar, tür, varsayılan)', async () => {
    const { data: spec, error } = await rehber.rpc('setting_spec_public')
    expect(error).toBeNull()
    const s = spec as Record<string, { type: string; default?: unknown }>
    expect(AYARLAR.map((a) => a.key).sort()).toEqual(Object.keys(s).sort())
    for (const a of AYARLAR) {
      expect(a.tur, a.key).toBe(s[a.key]!.type)
      expect(a.varsayilan ?? null, a.key).toEqual(s[a.key]!.default ?? null)
      expect(a.ad.length, a.key).toBeGreaterThan(2)
    }
  })
  it('koddaki her ayar okuması spec\'te tanımlı; her ayarın kodda karşılığı var', async () => {
    const { data: spec } = await rehber.rpc('setting_spec_public')
    const keys = new Set(Object.keys(spec as object))
    const re = new RegExp(`['"\`]((?:${PREFIX})\\.[a-z_.]+)['"\`]`, 'g')
    const used = new Set<string>()
    for (const f of srcFiles('src')) for (const m of readFileSync(f, 'utf8').matchAll(re)) used.add(m[1]!)
    expect([...used].filter((k) => !keys.has(k))).toEqual([])
    // Karşılık: ön yüzde ya da veritabanı fonksiyonlarında (spec tanımları hariç) okunması
    const sqlRe = new RegExp(`'((?:${PREFIX})\.[a-z_.]+)'`, 'g')
    for (const f of readdirSync('supabase/migrations')) for (const m of readFileSync(join('supabase/migrations', f), 'utf8').matchAll(sqlRe)) used.add(m[1]!)
    const bosta = [...keys].filter((k) => !used.has(k) && !DINAMIK.some((d) => k.startsWith(d)) && !ESKI_KULLANILMAYAN.includes(k))
    expect(bosta).toEqual([])
  })
})

describe('ayar yönetimi', () => {
  it('varsayılana dön yalnız yöneticide; işlem geçmişine yazılır', async () => {
    expect((await admin.rpc('set_settings', { p: { 'rapor.imza': 'Rehber Öğretmen' } })).error).toBeNull()
    expect((await rehber.rpc('reset_settings', { p_keys: ['rapor.imza'] })).error).not.toBeNull()
    expect((await admin.rpc('reset_settings', { p_keys: ['bilinmeyen.ayar'] })).error).not.toBeNull()
    expect((await admin.rpc('reset_settings', { p_keys: ['rapor.imza'] })).error).toBeNull()
    expect((await svc.from('school_settings').select('key').eq('school_id', SCHOOL).eq('key', 'rapor.imza')).data).toEqual([])
    const log = (await admin.from('audit_log').select('meta').eq('action', 'settings').order('created_at', { ascending: false }).limit(1)).data!
    expect(log[0]!.meta['rapor.imza']).toEqual({ eski: 'Rehber Öğretmen', yeni: '' })
  })
  it('biçimi tanımlı ayar (ör. etüt saatleri) kalıba uymazsa kaydedilmez', async () => {
    expect((await admin.rpc('set_settings', { p: { 'etut.saatler_lise': '09:00-09:40' } })).error?.message).toMatch(/biçimi/)
    expect((await admin.rpc('set_settings', { p: { 'etut.saatler_lise': '09:00-09:40,09:50-10:30,10:40-11:20,11:30-12:10,12:20-13:00' } })).error).toBeNull()
  })
  it('yönetici olmayan ayar yazamaz', async () => {
    for (const c of [rehber, mat, veli]) expect((await c.rpc('set_settings', { p: { 'menu.ad.duyurular': 'Haberler' } })).error).not.toBeNull()
  })
})

describe('ayarlar veritabanında da uygulanır (yalnız kısıtlar)', () => {
  it('aile.gorevler kapalıyken veli görevleri okuyamaz; açılınca geri gelir', async () => {
    // Kendi görevini oluşturur (diğer testlerin sildiği görevlere bağlı kalmaz)
    const t = await rehber.from('tasks').insert({ student_id: ELIF, subject: 'MAT', topic: 'Ayar testi', question_count: 5, due_date: inDays(3), created_by: REHBER_ID }).select('id').single()
    expect(t.error).toBeNull()
    const once = (await veli.from('tasks').select('id').eq('student_id', ELIF)).data!.length
    expect(once).toBeGreaterThan(0)
    expect((await ayarla('aile.gorevler', false)).error).toBeNull()
    expect((await veli.from('tasks').select('id').eq('student_id', ELIF)).data).toEqual([])
    expect((await rehber.from('tasks').select('id').eq('student_id', ELIF)).data!.length).toBe(once) // öğretmen etkilenmez
    await ayarla('aile.gorevler', true)
    expect((await veli.from('tasks').select('id').eq('student_id', ELIF)).data!.length).toBe(once)
    await svc.from('tasks').delete().eq('id', t.data!.id)
  })
  it('ogretmen.not_ekleme kapalıyken branş öğretmeni not ekleyemez; rehber ekler', async () => {
    await ayarla('ogretmen.not_ekleme', false)
    const uid = (await mat.auth.getUser()).data.user!.id
    expect((await mat.from('notes').insert({ student_id: ELIF, author_id: uid, visibility: 'ogretmen', body: 'ayar testi' })).error).not.toBeNull()
    const rid = (await rehber.auth.getUser()).data.user!.id
    const r = await rehber.from('notes').insert({ student_id: ELIF, author_id: rid, visibility: 'ogretmen', body: 'ayar testi' }).select('id').single()
    expect(r.error).toBeNull()
    await svc.from('notes').delete().eq('id', r.data!.id)
    await ayarla('ogretmen.not_ekleme', true)
  })
  it('guvenlik.ogretmen_mfa açıkken öğretmen için iki adımlı doğrulama zorunlu olur', async () => {
    expect((await mat.rpc('requires_mfa')).data).toBe(false)
    await ayarla('guvenlik.ogretmen_mfa', true)
    expect((await mat.rpc('requires_mfa')).data).toBe(true)
    expect((await veli.rpc('requires_mfa')).data).toBe(false)
    await ayarla('guvenlik.ogretmen_mfa', false)
  })
  it('kayit.acik kapalıyken kendi kendine kayıt veritabanında reddedilir; giriş ekranı bilgisi kapalı der', async () => {
    await ayarla('kayit.acik', false)
    expect((await svc.rpc('public_school_info', { p_slug: 'bulus-kure' })).data.kayit).toBe(false)
    const r = await register({ full_name: 'Kayıt Kapalı Deneme', role: 'veli' })
    expect(r.error).not.toBeNull()
    await ayarla('kayit.acik', true)
    expect((await svc.rpc('public_school_info', { p_slug: 'bulus-kure' })).data.kayit).toBe(true)
  })
})
