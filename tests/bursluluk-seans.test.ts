// Bursluluk 2.0 (0021): seans × sınıf kontenjanı, aynı anda başvuruda taşma yok, takip kodu, başvuranın düzenlemesi/iptali.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { anon, service, signIn, signInAdminAal2 } from './helpers'

const SCHOOL = '00000000-0000-4000-8000-000000000001'
const SLUG = 'bulus-kure'
const svc = service()
let admin: SupabaseClient
const today = new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10)
const plus = (n: number) => new Date(Date.parse(today) + n * 86400_000).toISOString().slice(0, 10)
let exam = ''
let sabah = ''
let ogle = ''
let phoneNo = 100
const phone = () => `0533 100 ${String(phoneNo++).padStart(4, '0').replace(/(\d{2})(\d{2})/, '$1 $2')}`
type Done = { tracking_code: string; session: { date: string; starts_at: string } }
const apply = (p: Record<string, unknown>) =>
  anon().rpc('apply_scholarship', { p_slug: SLUG, p: { exam_id: exam, grade: 5, parent_name: 'Veli Seans', phone: phone(), consent_version: 'v1', ...p } })
/** "Bulunamadı" hata olarak değil, sonuç olarak döner (deneme kaydı kalıcı olsun diye); burada tek biçime çevrilir. */
const asErr = async (r: PromiseLike<{ data: unknown; error: { message: string } | null }>) => {
  const { data, error } = await r
  const e = (data as { error?: string } | null)?.error
  return { data: e ? null : data, error: error ?? (e ? { message: e } : null) }
}
const track = (code: string) => asErr(anon().rpc('track_scholarship', { p_slug: SLUG, p_code: code }))
const edit = (code: string, p: Record<string, unknown>) => asErr(anon().rpc('edit_scholarship', { p_slug: SLUG, p_code: code, p }))
type Ses = { id: string; grades: { grade: number; capacity: number; remaining: number }[] }
const sessionsOf = async () => ((await anon().rpc('public_scholarship_exams', { p_slug: SLUG })).data as { id: string; sessions: Ses[] }[]).find((e) => e.id === exam)!.sessions
const remaining = async (sid: string, g: number) => (await sessionsOf()).find((s) => s.id === sid)!.grades.find((x) => x.grade === g)!.remaining

beforeAll(async () => {
  admin = await signInAdminAal2()
  await svc.from('scholarship_exams').delete().like('name', 'Seans %')
  await admin.rpc('set_settings', { p: { 'modul.bursluluk': true } })
  const { data } = await admin.from('scholarship_exams').insert({
    school_id: SCHOOL, name: 'Seans 2027 Bursluluk', exam_date: plus(30), grades: [5, 6, 8], apply_from: today, apply_until: plus(20),
    self_edit: true, edit_until: plus(25),
  }).select('id').single()
  exam = data!.id
})
beforeEach(async () => {
  await svc.from('scholarship_rate').delete().neq('k', '')
})
afterAll(async () => {
  await svc.from('scholarship_exams').delete().like('name', 'Seans %')
  await svc.from('school_settings').delete().or('key.eq.modul.bursluluk,key.like.bursluluk.%')
  await svc.from('scholarship_rate').delete().neq('k', '')
})

describe('Seans ve kontenjan tanımlama', () => {
  it('seans yokken başvuru alınmaz; yalnız yönetici seans ve kontenjan tanımlar', async () => {
    expect((await apply({ student_name: 'Seanssız Öğrenci' })).error?.message).toBe('Bu sınav için henüz seans tanımlanmamış.')
    const rehber = await signIn('rehber')
    expect((await rehber.from('scholarship_sessions').insert({ exam_id: exam, school_id: SCHOOL, session_date: plus(30), starts_at: '10:00', ends_at: '12:30' })).error).not.toBeNull()
    const s1 = await admin.from('scholarship_sessions').insert({ exam_id: exam, school_id: SCHOOL, name: 'Sabah', session_date: plus(30), starts_at: '10:00', ends_at: '12:30', location: 'Ana bina' }).select('id').single()
    const s2 = await admin.from('scholarship_sessions').insert({ exam_id: exam, school_id: SCHOOL, name: 'Öğleden sonra', session_date: plus(30), starts_at: '14:00', ends_at: '16:30' }).select('id').single()
    sabah = s1.data!.id
    ogle = s2.data!.id
    expect((await admin.from('scholarship_session_quotas').insert([
      { session_id: sabah, grade: 5, capacity: 2, enabled: true }, { session_id: sabah, grade: 6, capacity: 30, enabled: true },
      { session_id: sabah, grade: 8, capacity: 1, enabled: true }, { session_id: ogle, grade: 5, capacity: 30, enabled: true },
      { session_id: ogle, grade: 6, capacity: 0, enabled: false },
    ])).error).toBeNull()
    // Sınavda olmayan sınıf seviyesine kontenjan verilemez; aynı seans-sınıf iki kez tanımlanamaz
    expect((await admin.from('scholarship_session_quotas').insert({ session_id: sabah, grade: 7, capacity: 5 })).error?.message).toMatch(/sınıf seviyesi sınavda yok/)
    expect((await admin.from('scholarship_session_quotas').insert({ session_id: sabah, grade: 5, capacity: 5 })).error?.code).toBe('23505')
    expect((await rehber.from('scholarship_session_quotas').select('id')).data ?? []).toEqual([])
  })

  it('herkese açık liste: etkin seanslar, açık sınıflar ve kalan yer', async () => {
    const list = await sessionsOf()
    expect(list.map((s) => s.id)).toEqual([sabah, ogle])
    expect(list[0]!.grades.map((g) => [g.grade, g.capacity, g.remaining])).toEqual([[5, 2, 2], [6, 30, 30], [8, 1, 1]])
    expect(list[1]!.grades.map((g) => g.grade)).toEqual([5]) // 6. sınıf öğleden sonra kapalı
  })
})

let codeA = ''
describe('Başvuru ve kontenjan', () => {
  it('seans seçilmeli; kapalı seans/sınıf reddedilir; takip kodu ve seans bilgisi döner', async () => {
    expect((await apply({ student_name: 'Seçimsiz Öğrenci' })).error?.message).toBe('Seans seç.')
    expect((await apply({ student_name: 'Kapalı Sınıf', grade: 6, session_id: ogle })).error?.message).toMatch(/açık değil/)
    const { data, error } = await apply({ student_name: 'Ayşe Seans', session_id: sabah, email: 'ayse.seans@ornek.com' })
    expect(error).toBeNull()
    const d = data as Done
    expect(d.tracking_code).toMatch(/^BK-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/)
    expect(d.session).toMatchObject({ date: plus(30), starts_at: '10:00:00' })
    codeA = d.tracking_code
    expect(await remaining(sabah, 5)).toBe(1)
  })

  it('aynı öğrenci başka seans seçerek ikinci kez başvuramaz', async () => {
    const { data: row } = await svc.from('scholarship_applications').select('phone').eq('tracking_code', codeA).single()
    expect((await apply({ student_name: 'ayşe seans', phone: row!.phone, session_id: ogle })).error?.message).toMatch(/zaten başvuru/)
  })

  it('son 1 yere aynı anda 5 başvuru: yalnız 1 kabul edilir, taşma olmaz', async () => {
    const res = await Promise.all(['Bir', 'İki', 'Üç', 'Dört', 'Beş'].map((n) => apply({ student_name: `Yarış ${n}`, grade: 8, session_id: sabah })))
    expect(res.filter((r) => !r.error)).toHaveLength(1)
    expect(res.filter((r) => r.error).map((r) => r.error!.message)).toEqual(Array(4).fill('Bu seans için kontenjan doldu.'))
    const { count } = await svc.from('scholarship_applications').select('id', { count: 'exact', head: true }).eq('session_id', sabah).eq('grade', 8)
    expect(count).toBe(1)
    expect(await remaining(sabah, 8)).toBe(0)
  })

  it('yönetici de dolu seansa taşıyamaz; reddedilen ve iptal edilen yer açar', async () => {
    const { data: other } = await apply({ student_name: 'Öğle Öğrenci', session_id: ogle })
    const id = (await svc.from('scholarship_applications').select('id').eq('tracking_code', (other as Done).tracking_code).single()).data!.id
    expect((await apply({ student_name: 'Doldur Sabah', session_id: sabah })).error).toBeNull() // sabah 5. sınıf 2/2
    expect((await admin.from('scholarship_applications').update({ session_id: sabah }).eq('id', id)).error?.message).toBe('Bu seans için kontenjan doldu.')
    const filler = (await svc.from('scholarship_applications').select('id').eq('student_name', 'Doldur Sabah').single()).data!.id
    await admin.from('scholarship_applications').update({ status: 'reddedildi' }).eq('id', filler)
    expect(await remaining(sabah, 5)).toBe(1)
    expect((await admin.from('scholarship_applications').update({ session_id: sabah }).eq('id', id)).error).toBeNull()
    // Reddedileni yeniden onaylamak da kontenjana bakar (sabah yine dolu)
    expect((await admin.from('scholarship_applications').update({ status: 'onaylandi' }).eq('id', filler)).error?.message).toBe('Bu seans için kontenjan doldu.')
  })
})

describe('Takip kodu', () => {
  it('kodla görüntüleme: yalnız gerekli alanlar, telefon ve e-posta maskeli; kod biçimi esnek', async () => {
    const { data, error } = await track(codeA.toLowerCase().replace(/-/g, ' '))
    expect(error).toBeNull()
    const v = data as Record<string, unknown>
    expect(v).toMatchObject({ tracking_code: codeA, student_name: 'Ayşe Seans', grade: 5, status: 'bekliyor', exam: 'Seans 2027 Bursluluk', location: 'Ana bina', email_masked: 'a***@ornek.com', can_edit: true })
    expect(v.phone_masked).toMatch(/^05\*\* \*\*\* \*\* \d{2}$/)
    expect(v).not.toHaveProperty('phone')
    expect(v).not.toHaveProperty('email')
    expect(v).not.toHaveProperty('id')
    expect(v).not.toHaveProperty('note')
  })

  it('yanlış kod genel hata verir; sorgu sayısı sınırlı', async () => {
    for (const c of ['BK-AAAA-AAAA', 'yok', '', "'; select 1; --"]) expect((await track(c)).error?.message, c).toBe('Başvuru bulunamadı.')
    for (let i = 0; i < 16; i++) await track('BK-ZZZZ-ZZZZ')
    expect((await track(codeA)).error?.message).toBe('Çok fazla deneme yapıldı; biraz sonra tekrar dene.')
  })
})

describe('Başvuranın düzenlemesi', () => {
  it('son tarihe kadar: seans ve sınıf değişir, kontenjan yeniden denetlenir', async () => {
    expect((await edit(codeA, { grade: 8, session_id: sabah })).error?.message).toBe('Bu seans için kontenjan doldu.') // sabah 8: 1/1
    const { data, error } = await edit(codeA, { session_id: ogle, parent_name: 'Yeni Veli', phone: '0544 111 22 33' })
    expect(error).toBeNull()
    expect((data as { session: { id: string } }).session.id).toBe(ogle)
    const { data: row } = await svc.from('scholarship_applications').select('parent_name, phone, session_id, self_edited_at').eq('tracking_code', codeA).single()
    expect(row).toMatchObject({ parent_name: 'Yeni Veli', phone: '0544 111 22 33', session_id: ogle })
    expect(row!.self_edited_at).not.toBeNull()
    expect(await remaining(sabah, 5)).toBe(1) // eski yer boşaldı
  })

  it('yöneticinin kapattığı alan değişmez; süre geçince düzenleme reddedilir ama görüntülenir', async () => {
    await admin.from('scholarship_exams').update({ edit_fields: ['phone', 'email'] }).eq('id', exam)
    await edit(codeA, { student_name: 'Başka İsim', email: 'yeni@ornek.com' })
    const { data: row } = await svc.from('scholarship_applications').select('student_name, email').eq('tracking_code', codeA).single()
    expect(row).toEqual({ student_name: 'Ayşe Seans', email: 'yeni@ornek.com' })
    await admin.from('scholarship_exams').update({ edit_until: plus(-1) }).eq('id', exam)
    expect((await edit(codeA, { email: 'son@ornek.com' })).error?.message).toBe('Düzenleme süresi sona ermiştir.')
    expect(((await track(codeA)).data as { can_edit: boolean }).can_edit).toBe(false)
    await admin.from('scholarship_exams').update({ edit_until: plus(25), edit_fields: ['student_name', 'current_school', 'grade', 'parent_name', 'phone', 'email', 'session'] }).eq('id', exam)
  })

  it('başvuran iptal edebilir; iptal kontenjan doldurmaz ve iptalden sonra düzenleme yok', async () => {
    const before = await remaining(ogle, 5)
    const { data, error } = await edit(codeA, { cancel: true })
    expect(error).toBeNull()
    expect((data as { status: string; can_edit: boolean })).toMatchObject({ status: 'iptal', can_edit: false })
    expect(await remaining(ogle, 5)).toBe(before + 1)
    expect((await edit(codeA, { email: 'x@ornek.com' })).error?.message).toBe('Bu başvuru düzenlenemez.')
  })
})

describe('Eski kayıtlar', () => {
  it('seanssız eski başvuru korunur; takip kodu olmadığı için kodla bulunamaz', async () => {
    const { data } = await svc.from('scholarship_applications').insert({
      exam_id: exam, school_id: SCHOOL, student_name: 'Eski Başvuru', grade: 5, parent_name: 'Eski Veli', phone: '0532 777 77 77', tracking_code: null,
    }).select('session_id, tracking_code, code').single()
    expect(data!.session_id).toBeNull()
    expect(data!.code).toMatch(/^[0-9A-F]{8}$/)
    expect((await track(data!.code)).error?.message).toBe('Başvuru bulunamadı.')
  })
})
