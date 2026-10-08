import { beforeAll, afterAll, expect, it } from 'vitest'
import { anon, service, signIn, ELIF, REHBER_ID, AYSE_CELIK } from './helpers'
import type { SupabaseClient } from '@supabase/supabase-js'

const svc = service()
let staff: SupabaseClient, school: string, student: string, exam: string
beforeAll(async () => {
  staff = await signIn('rehber')
  const { data: s, error: se } = await svc.from('schools').insert({ name: 'Güvenlik testi: başka okul', slug: `audit-${Date.now()}` }).select('id').single()
  if (se) throw se
  school = s!.id
  const { error: ce } = await svc.from('classes').insert({ school_id: school, grade: 8, section: 'A' })
  if (ce) throw ce
  const { data: st, error: ste } = await svc.from('students').insert({ school_id: school, full_name: 'Uydurma Test Öğrencisi', class_name: '8/A' }).select('id').single()
  if (ste) throw ste
  student = st!.id
  const { data: e, error: ee } = await svc.from('exams').insert({ school_id: school, name: 'Uydurma Test Sınavı', exam_date: '2030-01-01', status: 'yayinda' }).select('id').single()
  if (ee) throw ee
  exam = e!.id
  const { error } = await svc.from('exam_results').insert({ exam_id: exam, student_id: student, subjects: {} })
  if (error) throw error
})
afterAll(async () => {
  if (!school) return
  if (exam) await svc.from('exams').delete().eq('id', exam)
  if (student) await svc.from('students').delete().eq('id', student)
  for (const table of ['classes', 'school_settings', 'bell_times', 'courses', 'academic_years', 'gallery_categories']) {
    const { error } = await svc.from(table).delete().eq('school_id', school)
    if (error) throw error
  }
  const { error } = await svc.from('schools').delete().eq('id', school)
  if (error) throw error
})

it('bildirim yardımcılarını anonim veya rehber RPC olarak çağıramaz', async () => {
  const { data: me } = await staff.from('profiles').select('school_id').eq('id', REHBER_ID).single()
  for (const client of [anon(), staff]) for (const [fn, args] of [
    ['student_accounts', { sid: ELIF }], ['parent_accounts', { sid: ELIF }],
    ['staff_accounts', { school: me!.school_id }], ['admin_accounts', { school: me!.school_id }],
    ['class_accounts', { school: me!.school_id, cls: '8/A' }],
    ['meeting_recipients', { sid: ELIF, w: 'ikisi' }],
  ] as const) {
    const { error } = await client.rpc(fn, args)
    expect(error, fn).not.toBeNull()
  }
})
it('rehber diğer okulun sonuçlarını okuyamaz ve yabancı sınava sonuç yazamaz', async () => {
  const { data, error } = await staff.from('exam_results').select('*').eq('exam_id', exam)
  expect(error).toBeNull()
  expect(data).toEqual([])
  const write = await staff.from('exam_results').insert({ exam_id: exam, student_id: ELIF, subjects: {} })
  expect(write.error).not.toBeNull()
})
it('başka okul öğrencisine görüşme, görev veya rapor oluşturamaz', async () => {
  const m = await staff.from('meetings').insert({ student_id: student, with_whom: 'veli', starts_at: '2030-01-01T10:00:00Z', created_by: REHBER_ID })
  expect(m.error).not.toBeNull()
  const t = await staff.from('tasks').insert({ student_id: student, subject: 'MAT', topic: 'Sınır testi', question_count: 5, due_date: '2030-01-01', created_by: REHBER_ID })
  expect(t.error).not.toBeNull()
  const r = await staff.from('reports').insert({ student_id: student, exam_id: exam, type: 'veli', body: {}, created_by: REHBER_ID })
  expect(r.error).not.toBeNull()
})
it('doğrudan note_body RPC görünürlük ve öğrenci yetkisini aşamaz', async () => {
  const { data: note, error } = await staff.from('notes').insert({ student_id: AYSE_CELIK, visibility: 'ogretmen', body: 'Uydurma özel öğretmen notu', author_id: REHBER_ID }).select('id').single()
  expect(error).toBeNull()
  try {
    expect((await anon().rpc('note_body', { p_note: note!.id })).error).not.toBeNull()
    const parent = await signIn('veliElif')
    expect((await parent.rpc('note_body', { p_note: note!.id })).data).toBeNull()
    expect((await staff.rpc('note_body', { p_note: note!.id })).data).toBe('Uydurma özel öğretmen notu')
  } finally { await svc.from('notes').delete().eq('id', note!.id) }
})
it('arayüz atlanarak 7 karakterli şifreyle kayıt açılamaz', async () => {
  const { data, error } = await anon().auth.signUp({ email: `test-security-${Date.now()}@ornek.com`, password: '1234567', options: { data: { school: 'bulus-kure', full_name: 'Uydurma Kayıt', role: 'ogrenci', consent_version: 'KVKK-1.1' } } })
  if (data.user) await svc.auth.admin.deleteUser(data.user.id)
  expect(error).not.toBeNull()
  expect(error?.code).toBe('weak_password')
})
