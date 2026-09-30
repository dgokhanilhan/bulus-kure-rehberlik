// Faz H (0019): ana sayfa kart düzeni ayarı, toplu öğrenci aktarımı (önizleme + hepsi-ya-da-hiçbiri), toplu öğretmen daveti.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { service, signIn, signInAdminAal2 } from './helpers'

const svc = service()
let admin: SupabaseClient
const stamp = Date.now()
const no = (n: number) => String(90000 + (stamp % 5000) * 3 + n)
type Res = { ok: number; errors: { row: number; error: string }[] }

beforeAll(async () => {
  admin = await signInAdminAal2()
})
afterAll(async () => {
  await svc.from('students').delete().like('full_name', 'Aktarım %')
  await svc.from('school_settings').delete().like('key', 'panel.%')
  for (const e of [`toplu1-${stamp}@ornek.com`, `toplu2-${stamp}@ornek.com`]) {
    const { data } = await svc.from('profiles').select('id').eq('email', e).maybeSingle()
    if (data) await svc.auth.admin.deleteUser(data.id)
  }
})

describe('Ana sayfa kart düzeni', () => {
  it('bilinen kartlar, tekrar yok; yalnız yönetici yazar, herkes okur', async () => {
    const good = [{ id: 'odev', on: true }, { id: 'duyuru', on: false }, { id: 'program', on: true }]
    expect((await admin.rpc('set_settings', { p: { 'panel.veli': good } })).error).toBeNull()
    expect((await admin.rpc('set_settings', { p: { 'panel.veli': [{ id: 'uydurma', on: true }] } })).error?.message).toMatch(/kart düzeni geçersiz/)
    expect((await admin.rpc('set_settings', { p: { 'panel.veli': [{ id: 'odev', on: true }, { id: 'odev', on: false }] } })).error?.message).toMatch(/kart düzeni geçersiz/)
    expect((await admin.rpc('set_settings', { p: { 'panel.ogretmen': [{ id: 'derslerim', on: 'evet' }] } })).error?.message).toMatch(/kart düzeni geçersiz/)
    expect((await admin.rpc('set_settings', { p: { 'panel.ogretmen': [{ id: 'lgs', on: true }] } })).error?.message).toMatch(/kart düzeni geçersiz/) // öğretmen kartı değil
    expect((await (await signIn('rehber')).rpc('set_settings', { p: { 'panel.veli': good } })).error?.code).toBe('42501')
    const { data } = await (await signIn('veliElif')).from('school_settings').select('value').eq('key', 'panel.veli').single()
    expect(data!.value).toEqual(good)
  })
})

describe('Toplu öğrenci aktarımı', () => {
  it('önizleme hatalı satırları nedeniyle gösterir, hiçbir şey yazmaz', async () => {
    const rows = [
      { full_name: 'Aktarım Bir', class_name: '8/A', school_no: no(1) },
      { full_name: 'Aktarım İki', class_name: ' 3 /a ', school_no: no(2) },
      { full_name: 'X', class_name: '8/A', school_no: '' },
      { full_name: 'Aktarım Dört', class_name: '12/Z', school_no: '' },
      { full_name: 'Aktarım Beş', class_name: '8/B', school_no: no(1) },
      { full_name: 'Aktarım Bir', class_name: '8/A', school_no: '' },
      { full_name: 'Elif Yıldız', class_name: '8/A', school_no: '' },
    ]
    const { data, error } = await admin.rpc('import_students', { p: rows, p_dry_run: true })
    expect(error).toBeNull()
    const r = data as Res
    expect(r.ok).toBe(2)
    expect(r.errors).toEqual([
      { row: 3, error: 'Ad soyad geçersiz' },
      { row: 4, error: 'Sınıf açılmamış: 12/Z' },
      { row: 5, error: `Okul no zaten kayıtlı: ${no(1)}` },
      { row: 6, error: 'Bu öğrenci bu sınıfta zaten var' },
      { row: 7, error: 'Bu öğrenci bu sınıfta zaten var' },
    ])
    // Hatalıyken gerçek aktarım yapılmaz, hiçbir satır yazılmaz
    expect((await admin.rpc('import_students', { p: rows })).error?.message).toMatch(/5 satır hatalı/)
    expect((await svc.from('students').select('id').like('full_name', 'Aktarım %')).data).toEqual([])
  })

  it('geçerli satırlar tek işlemde yazılır; ikinci aktarım aynıları reddeder; yalnız yönetici', async () => {
    const rows = [
      { full_name: 'Aktarım Bir', class_name: '8/A', school_no: no(1) },
      { full_name: 'Aktarım  İki', class_name: '3/a', school_no: '' },
    ]
    const { data, error } = await admin.rpc('import_students', { p: rows })
    expect(error).toBeNull()
    expect((data as Res).ok).toBe(2)
    const { data: st } = await svc.from('students').select('full_name, class_name, school_no').like('full_name', 'Aktarım %').order('full_name')
    expect(st).toEqual([
      { full_name: 'Aktarım Bir', class_name: '8/A', school_no: no(1) },
      { full_name: 'Aktarım İki', class_name: '3/A', school_no: null },
    ])
    expect(((await admin.rpc('import_students', { p: rows, p_dry_run: true })).data as Res).errors).toHaveLength(2)
    expect((await (await signIn('rehber')).rpc('import_students', { p: rows, p_dry_run: true })).error?.code).toBe('42501')
    const { data: log } = await svc.from('audit_log').select('meta').eq('action', 'import').eq('entity', 'students').order('id', { ascending: false }).limit(1).single()
    expect(log!.meta).toEqual({ count: 2 })
  })
})

describe('Toplu öğretmen daveti', () => {
  it('her satır ayrı sonuç: geçerliler açılır, hatalılar nedeniyle döner', async () => {
    const { data, error } = await admin.functions.invoke('admin-davet', {
      body: {
        action: 'bulk',
        rows: [
          { full_name: 'Toplu Bir', email: `toplu1-${stamp}@ornek.com`, branch: 'Kimya' },
          { full_name: 'Toplu İki', email: `toplu2-${stamp}@ornek.com`, branch: 'Astroloji' },
          { full_name: 'Toplu Üç', email: 'rehber@buluskure.k12.tr', branch: 'Fizik' },
        ],
      },
    })
    expect(error).toBeNull()
    expect((data as { results: unknown[] }).results).toEqual([
      { row: 1, email: `toplu1-${stamp}@ornek.com`, ok: true },
      { row: 2, email: `toplu2-${stamp}@ornek.com`, ok: false, error: 'Branş geçersiz.' },
      { row: 3, email: 'rehber@buluskure.k12.tr', ok: false, error: 'Bu e-postayla bir hesap zaten var.' },
    ])
    const { data: p } = await svc.from('profiles').select('role, branch, status').eq('email', `toplu1-${stamp}@ornek.com`).single()
    expect(p).toEqual({ role: 'ogretmen', branch: 'Kimya', status: 'approved' })
  })
})
