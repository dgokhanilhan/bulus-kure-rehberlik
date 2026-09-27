// Deneme ve öğrenci silme; kazanım grubu süzgeci (sunucu tarafı).
import { describe, it, expect } from 'vitest'
import { service, signIn, sid, ELIF } from './helpers'

const SCHOOL = '00000000-0000-4000-8000-000000000001'
const today = new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10)

async function publishSmall(extra: Record<string, unknown> = {}, newName = 'Silinecek Yeni') {
  const rehber = await signIn('rehber')
  const subjects = { TUR: { d: 18, y: 2, b: 0, net: 17.33 } }
  const p = {
    name: 'Silme testi', publisher: null, template_id: 'test', exam_date: today, sha256: `silme-${Date.now()}-${Math.random()}`, notify: false, questions: [],
    results: [
      { student_id: ELIF, score: 400, subjects, answers: {}, outcomes_ok: true, source: {}, ...extra },
      { new_student: { full_name: newName, class_name: '8/C', school_no: String(Date.now()).slice(-6) }, score: 300, subjects, answers: {}, outcomes_ok: true, source: {} },
    ],
  }
  const { data, error } = await rehber.rpc('publish_exam', { p })
  expect(error).toBeNull()
  return data as string
}

describe('Kazanım grubu', () => {
  it('yalnız tutarlı ve katalogda olan gruplar saklanır; güvenilmeyen ders analiz dışı', async () => {
    const id = await publishSmall({
      kazanim: {
        subjects: ['TUR', 'XXX'],
        g: {
          'T.8.3.5': [2, 1, 1, 0], // geçerli
          'T.8.3.6': [2, 2, 1, 0], // D+Y+B tutmuyor → atılır
          'UYDURMA.1': [1, 1, 0, 0], // katalogda yok → atılır
          'M.8.1.1.1': [1, 0, 1, 0], // ders listede değil → atılır
        },
      },
    }, 'Grup Deneği')
    const { data } = await service().from('exam_results').select('kazanim').eq('exam_id', id).eq('student_id', ELIF).single()
    expect(data!.kazanim).toEqual({ subjects: ['TUR'], g: { 'T.8.3.5': [2, 1, 1, 0] } })
    expect((await (await signIn('rehber')).rpc('delete_exam', { p_exam: id })).error).toBeNull()
  })
})

describe('Deneme sil', () => {
  it('branş öğretmeni ve veli silemez; rehber her zaman siler (sonuçlar ve bu yüklemenin yeni öğrencisi de gider)', async () => {
    const id = await publishSmall()
    for (const who of ['matematik', 'veliElif'] as const) expect((await (await signIn(who)).rpc('delete_exam', { p_exam: id })).error?.code, who).toBe('42501')
    // 8 gün önce yayınlanmış olsa bile silinebilir
    await service().from('exams').update({ published_at: new Date(Date.now() - 8 * 86400_000).toISOString() }).eq('id', id)
    expect((await (await signIn('rehber')).rpc('delete_exam', { p_exam: id })).error).toBeNull()
    expect((await service().from('exam_results').select('student_id').eq('exam_id', id)).data).toEqual([])
    expect((await service().from('students').select('id').eq('full_name', 'Silinecek Yeni')).data).toEqual([])
    const { data: log } = await service().from('audit_log').select('action, entity').eq('entity_id', id).order('id')
    expect(log).toEqual([{ action: 'publish', entity: 'exams' }, { action: 'delete', entity: 'exams' }])
  })
})

describe('Öğrenci sil', () => {
  it('yalnız rehber/admin; tüm kayıtlar gider; bağlı öğrenci hesabı onay bekleyene döner, veli bağı kalkar', async () => {
    const svc = service()
    const { data: st } = await svc.from('students').insert({ school_id: SCHOOL, full_name: 'Silme Deneği', class_name: '8/B', school_no: '9911' }).select('id').single()
    const { data: acc } = await svc.from('profiles').select('id').eq('email', 'mert.demir@ornek.com').single()
    await svc.from('profiles').update({ status: 'approved', student_id: st!.id }).eq('id', acc!.id)
    const { data: veli } = await svc.from('profiles').select('id').eq('email', 'kerem.veli@ornek.com').single()
    await svc.from('parent_links').insert({ parent_id: veli!.id, student_id: st!.id })
    await svc.from('tasks').insert({ student_id: st!.id, subject: 'MAT', topic: 'x', question_count: 5, due_date: '2030-01-01', created_by: '00000000-0000-4000-8003-000000000002' })

    expect((await (await signIn('matematik')).rpc('delete_student', { p_student: st!.id })).error?.code).toBe('42501')
    expect((await (await signIn('rehber')).rpc('delete_student', { p_student: st!.id })).error).toBeNull()

    expect((await svc.from('students').select('id').eq('id', st!.id)).data).toEqual([])
    expect((await svc.from('tasks').select('id').eq('student_id', st!.id)).data).toEqual([])
    expect((await svc.from('parent_links').select('parent_id').eq('student_id', st!.id)).data).toEqual([])
    const { data: p } = await svc.from('profiles').select('status, student_id').eq('id', acc!.id).single()
    expect(p).toEqual({ status: 'pending', student_id: null })
    // seed'deki Mert'i geri yükle (bekleyen öğrenci)
    await svc.from('profiles').update({ status: 'pending', student_id: null }).eq('id', acc!.id)
    void sid
  })
})
