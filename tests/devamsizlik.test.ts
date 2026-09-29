// Faz E (0016): devamsızlık sınırları (ayardan), uyarı seviyeleri, geç kalma sayımı, tek seferlik veli uyarısı, izleme listesi.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { notesOf, service, signIn, signInAdminAal2, snap, ELIF, KEREM } from './helpers'

const SCHOOL = '00000000-0000-4000-8000-000000000001'
const svc = service()
let admin: SupabaseClient
let days: string[] = []
type Lim = { level: string; ratio: number; items: { key: string; used: number; limit: number; current: boolean }[] }

async function mark(n: number, status: string, offset = 0) {
  for (let i = offset; i < offset + n; i++) await svc.from('attendance').upsert({ school_id: SCHOOL, student_id: KEREM, day: days[i], status }, { onConflict: 'student_id,day' })
}
const limits = async (c: SupabaseClient, sid = KEREM) => (await c.rpc('attendance_limits', { p_student: sid })).data as Lim | null
const item = (l: Lim, k: string) => l.items.find((x) => x.key === k)!
const warn = (xs: string[]) => xs.filter((x) => x.includes('devamsızlık'))

beforeAll(async () => {
  admin = await signInAdminAal2()
  const { data: y } = await svc.from('academic_years').select('starts, term1_ends').eq('is_active', true).single()
  // 1. dönemin ilk iş günleri (bugünden bağımsız; dönem içinde)
  for (let d = Date.parse(y!.starts); days.length < 30; d += 86400_000) {
    const dow = new Date(d).getUTCDay()
    if (dow !== 0 && dow !== 6) days.push(new Date(d).toISOString().slice(0, 10))
  }
  expect(days.at(-1)! <= y!.term1_ends).toBe(true)
  await svc.from('attendance').delete().eq('student_id', KEREM)
  await svc.from('attendance_alerts').delete().eq('student_id', KEREM)
  await svc.from('school_settings').delete().like('key', 'yoklama.%')
})
afterAll(async () => {
  await svc.from('attendance').delete().eq('student_id', KEREM)
  await svc.from('attendance_alerts').delete().eq('student_id', KEREM)
  await svc.from('school_settings').delete().like('key', 'yoklama.%')
})

describe('Devamsızlık sınırları', () => {
  it('7 gün raporsuz → sarı (%70), 1. dönem 7/10, yıllık 7/20', async () => {
    await mark(7, 'devamsiz')
    const l = (await limits(await signIn('rehber')))!
    expect(l.level).toBe('sari')
    expect(item(l, 'donem1')).toMatchObject({ used: 7, limit: 10, current: true })
    expect(item(l, 'yillik')).toMatchObject({ used: 7, limit: 20 })
  })

  it('9. günde turuncu uyarı veliye bir kez; 10. günde kırmızı', async () => {
    const before = await snap()
    await mark(2, 'devamsiz', 7)
    const veli = await signIn('veliKerem')
    expect(warn(await notesOf(veli, before))).toEqual(['Kerem Aydın: 1. dönem raporsuz devamsızlık 9/10 gün (sınıra 1 gün kaldı).'])
    expect((await limits(veli))!.level).toBe('turuncu')
    // Aynı seviyede yeni kayıt: tekrar bildirim yok
    const b2 = await snap()
    await svc.from('attendance').update({ note: 'değişti' }).eq('student_id', KEREM).eq('day', days[0])
    expect(warn(await notesOf(veli, b2))).toEqual([])
    const b3 = await snap()
    await mark(1, 'devamsiz', 9)
    expect(warn(await notesOf(veli, b3))).toEqual(['Kerem Aydın: 1. dönem raporsuz devamsızlık 10/10 gün (sınıra ulaştı).'])
    expect((await limits(veli))!.level).toBe('kirmizi')
  })

  it('raporlu ve izinli raporsuza sayılmaz; toplam sınırı açılırsa sayılır', async () => {
    await svc.from('attendance').delete().eq('student_id', KEREM)
    await svc.from('attendance_alerts').delete().eq('student_id', KEREM)
    await mark(3, 'devamsiz')
    await mark(4, 'raporlu', 3)
    await mark(2, 'izinli', 7)
    let l = (await limits(admin))!
    expect(item(l, 'donem1').used).toBe(3)
    expect(item(l, 'toplam')).toMatchObject({ used: 9, limit: 0 })
    expect(l.level).toBe('normal')
    await admin.rpc('set_settings', { p: { 'yoklama.limit_toplam': 10 } })
    l = (await limits(admin))!
    expect(l.level).toBe('turuncu') // 9/10 toplam
  })

  it('geç kalma ayara göre yarım/tam gün sayılır; sınırlar ve eşikler ayardan', async () => {
    await mark(4, 'gec', 9)
    expect(item((await limits(admin))!, 'donem1').used).toBe(3)
    await admin.rpc('set_settings', { p: { 'yoklama.gec_sayim': 'yarim' } })
    expect(item((await limits(admin))!, 'donem1').used).toBe(5)
    await admin.rpc('set_settings', { p: { 'yoklama.gec_sayim': 'tam', 'yoklama.limit_donem1': 20, 'yoklama.limit_toplam': 0, 'yoklama.uyari_sari': 30 } })
    const l = (await limits(admin))!
    expect(item(l, 'donem1')).toMatchObject({ used: 7, limit: 20 })
    expect(l.level).toBe('sari') // 7/20 = %35 ≥ %30
    expect((await (await signIn('rehber')).rpc('set_settings', { p: { 'yoklama.limit_donem1': 99 } })).error?.code).toBe('42501')
  })
})

describe('Görünürlük', () => {
  it('izleme listesini öğretmen görür, veli görmez; veli başkasının çocuğunu sorgulayamaz', async () => {
    const { data } = await (await signIn('rehber')).rpc('attendance_watchlist')
    expect((data as { student_id: string; level: string }[]).find((x) => x.student_id === KEREM)).toMatchObject({ level: 'sari' })
    expect(((await (await signIn('veliKerem')).rpc('attendance_watchlist')).data ?? []) as unknown[]).toEqual([])
    expect(await limits(await signIn('veliElif'), KEREM)).toBeNull()
    expect(await limits(await signIn('veliElif'), ELIF)).not.toBeNull()
  })

  it('yoklama modülü kapalıyken sınır bilgisi verilmez (yönetici hariç)', async () => {
    await admin.rpc('set_settings', { p: { 'modul.yoklama': false } })
    expect(await limits(await signIn('veliKerem'))).toBeNull()
    expect(await limits(admin)).not.toBeNull()
    await admin.rpc('set_settings', { p: { 'modul.yoklama': true } })
    await svc.from('school_settings').delete().eq('key', 'modul.yoklama')
  })
})
