// Faz G (0018): bursluluk sınavı tanımlama, herkese açık başvuru denetimleri, yönetici işlemleri, bildirim.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { anon, notesOf, service, signIn, signInAdminAal2, snap, ELIF } from './helpers'

const SCHOOL = '00000000-0000-4000-8000-000000000001'
const svc = service()
let admin: SupabaseClient
const today = new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10)
const plus = (n: number) => new Date(Date.parse(today) + n * 86400_000).toISOString().slice(0, 10)
let examId = ''
let sessionId = ''
const apply = (p: Record<string, unknown>) =>
  anon().rpc('apply_scholarship', { p_slug: 'bulus-kure', p: { exam_id: examId, session_id: sessionId, grade: 5, parent_name: 'Veli Deneme', phone: '0532 000 00 01', consent_version: 'v1', ...p } })
/** Bursluluk 2.0 (0021): başvuru için seans ve seans × sınıf kontenjanı gerekir. */
async function addSession(exam: string, grades: number[], capacity = 100) {
  const { data } = await admin.from('scholarship_sessions').insert({ exam_id: exam, school_id: SCHOOL, session_date: plus(20), starts_at: '10:00', ends_at: '11:30' }).select('id').single()
  await admin.from('scholarship_session_quotas').insert(grades.map((grade) => ({ session_id: data!.id, grade, capacity })))
  return data!.id as string
}
const listed = async () => ((await anon().rpc('public_scholarship_exams', { p_slug: 'bulus-kure' })).data as { id: string; full: boolean }[]) ?? []

beforeAll(async () => {
  admin = await signInAdminAal2()
  await svc.from('scholarship_exams').delete().like('name', 'Test %')
  await svc.from('school_settings').delete().or('key.eq.modul.bursluluk,key.like.bursluluk.%')
  await svc.from('scholarship_rate').delete().neq('k', '')
})
afterAll(async () => {
  await svc.from('scholarship_exams').delete().like('name', 'Test %')
  await svc.from('school_settings').delete().or('key.eq.modul.bursluluk,key.like.bursluluk.%')
})

describe('Sınav tanımlama', () => {
  it('yalnız yönetici tanımlar; modül kapalıyken başvuru sayfasında görünmez', async () => {
    const rehber = await signIn('rehber')
    expect((await rehber.from('scholarship_exams').insert({ school_id: SCHOOL, name: 'Test rehber', exam_date: plus(20), grades: [5], apply_from: today, apply_until: plus(10) })).error).not.toBeNull()
    const { data, error } = await admin.from('scholarship_exams').insert({ school_id: SCHOOL, name: 'Test 2026 Bursluluk', exam_date: plus(20), starts_at: '10:00', ends_at: '11:30', grades: [4, 5, 8], quota: 3, apply_from: today, apply_until: plus(10), location: 'Ana bina' }).select('id').single()
    expect(error).toBeNull()
    examId = data!.id
    sessionId = await addSession(examId, [4, 5, 8])
    expect((await listed()).map((x) => x.id)).not.toContain(examId) // bursluluk modülü varsayılan kapalı
    expect((await apply({ student_name: 'Kapalı Modül' })).error?.message).toMatch(/başvuru alınmıyor/)
    await admin.rpc('set_settings', { p: { 'modul.bursluluk': true } })
    expect((await listed()).map((x) => x.id)).toContain(examId)
  })

  it('başvuru tarihi sınavdan sonra olamaz', async () => {
    expect((await admin.from('scholarship_exams').insert({ school_id: SCHOOL, name: 'Test ters', exam_date: plus(5), grades: [5], apply_from: today, apply_until: plus(10) })).error).not.toBeNull()
  })
})

describe('Herkese açık başvuru', () => {
  it('başvuru numarası döner; yöneticiye bildirim gider; başvuruyu girişsiz kimse okuyamaz', async () => {
    const before = await snap()
    const { data, error } = await apply({ student_name: '  Ali   Yılmaz ', current_school: 'Atatürk Ortaokulu', email: 'veli@ornek.com' })
    expect(error).toBeNull()
    expect((data as { code: string }).code).toMatch(/^[0-9A-F]{8}$/)
    const { data: row } = await svc.from('scholarship_applications').select('student_name, grade, status, source').eq('exam_id', examId).single()
    expect(row).toEqual({ student_name: 'Ali Yılmaz', grade: 5, status: 'bekliyor', source: 'form' })
    expect(await notesOf(admin, before)).toEqual(['Bursluluk başvurusu: Ali Yılmaz (5. sınıf) · Test 2026 Bursluluk'])
    const { data: n } = await admin.from('notifications').select('type').eq('text', 'Bursluluk başvurusu: Ali Yılmaz (5. sınıf) · Test 2026 Bursluluk').limit(1).single()
    expect(n!.type).toBe('bursluluk')
    expect((await anon().from('scholarship_applications').select('id')).data ?? []).toEqual([])
    expect((await (await signIn('rehber')).from('scholarship_applications').select('id')).data ?? []).toEqual([])
  })

  it('sınıf seviyesi, KVKK, tekrar başvuru ve telefon denetimleri', async () => {
    expect((await apply({ student_name: 'Yanlış Sınıf', grade: 7 })).error?.message).toMatch(/sınıf seviyesi/)
    expect((await apply({ student_name: 'Onaysız', consent_version: '' })).error?.message).toMatch(/Aydınlatma/)
    expect((await apply({ student_name: 'ali yılmaz' })).error?.message).toMatch(/zaten başvuru/)
    expect((await apply({ student_name: 'Kısa Telefon', phone: '123' })).error?.message).toMatch(/Telefon/)
  })

  it('kontenjan dolunca yeni başvuru alınmaz ve sayfada "dolu" görünür', async () => {
    expect((await apply({ student_name: 'İkinci Öğrenci', phone: '0532 000 00 02' })).error).toBeNull()
    expect((await apply({ student_name: 'Üçüncü Öğrenci', phone: '0532 000 00 03' })).error).toBeNull()
    expect((await apply({ student_name: 'Dördüncü Öğrenci', phone: '0532 000 00 04' })).error?.message).toMatch(/Kontenjan doldu/)
    expect((await listed()).find((x) => x.id === examId)!.full).toBe(true)
  })

  it('aynı telefondan kısa sürede çok başvuru engellenir', async () => {
    const { data: e2 } = await admin.from('scholarship_exams').insert({ school_id: SCHOOL, name: 'Test sınırsız', exam_date: plus(20), grades: [5], apply_from: today, apply_until: plus(10) }).select('id').single()
    const s2 = await addSession(e2!.id, [5])
    const r = (name: string) => anon().rpc('apply_scholarship', { p_slug: 'bulus-kure', p: { exam_id: e2!.id, session_id: s2, grade: 5, student_name: name, parent_name: 'Aynı Veli', phone: '0532 999 99 99', consent_version: 'v1' } })
    for (const n of ['Bir Öğrenci', 'İki Öğrenci', 'Üç Öğrenci', 'Dört Öğrenci', 'Beş Öğrenci']) expect((await r(n)).error, n).toBeNull()
    expect((await r('Altı Öğrenci')).error?.message).toMatch(/Çok fazla başvuru/)
  })

  it('başvuru kapatılınca ya da genel anahtar kapanınca başvuru alınmaz', async () => {
    await admin.from('scholarship_exams').update({ applications_open: false }).eq('id', examId)
    expect((await listed()).map((x) => x.id)).not.toContain(examId)
    await admin.from('scholarship_exams').update({ applications_open: true, quota: null }).eq('id', examId)
    await admin.rpc('set_settings', { p: { 'bursluluk.basvuru_acik': false } })
    expect((await apply({ student_name: 'Kapalıyken', phone: '0532 000 00 09' })).error?.message).toMatch(/başvuru alınmıyor/)
    await admin.rpc('set_settings', { p: { 'bursluluk.basvuru_acik': true } })
  })
})

describe('Yönetici işlemleri', () => {
  it('okul öğrencisinden başvuru; salon/saat atanınca veliye bildirim', async () => {
    const { data: id, error } = await admin.rpc('admin_add_application', { p_exam: examId, p_student: ELIF, p_session: sessionId })
    expect(error).toBeNull()
    expect((await admin.rpc('admin_add_application', { p_exam: examId, p_student: ELIF, p_session: sessionId })).error?.message).toMatch(/zaten başvuru/)
    const { data: row } = await svc.from('scholarship_applications').select('student_name, grade, parent_name, source, status').eq('id', id).single()
    expect(row).toEqual({ student_name: 'Elif Yıldız', grade: 8, parent_name: 'Ayşe Yıldız', source: 'okul', status: 'onaylandi' })
    const before = await snap()
    expect((await admin.from('scholarship_applications').update({ hall: 'B-12', session_time: '10:00' }).eq('id', id)).error).toBeNull()
    expect(await notesOf(await signIn('veliElif'), before)).toEqual([expect.stringMatching(/^Bursluluk sınavı: Test 2026 Bursluluk · .* · 10:00 · Salon B-12$/)])
    expect((await (await signIn('rehber')).rpc('admin_add_application', { p_exam: examId, p_student: ELIF, p_session: sessionId })).error?.code).toBe('42501')
  })
})
