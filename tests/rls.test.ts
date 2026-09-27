// Aşama 1 "bitti şartı": yetkiler veritabanında. Her test, bir rolün başka rolün
// verisine ulaşamadığını gerçek JWT'lerle (PostgREST + RLS) kanıtlar.
import { describe, it, expect, beforeAll } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { anon, service, signIn, signInAdminAal2, register, ELIF, AYSE_CELIK, KEREM, ids } from './helpers'

const STUDENT_TABLES = ['students', 'exam_results', 'tasks', 'meetings', 'notes', 'reports'] as const

describe('Veli yalnız kendi çocuğunu görür', () => {
  let veli: SupabaseClient
  beforeAll(async () => (veli = await signIn('veliElif')))

  it('öğrenci listesinde yalnız Elif var', async () => {
    const { data, error } = await veli.from('students').select('id')
    expect(error).toBeNull()
    expect(ids(data)).toEqual([ELIF])
  })

  it('başka öğrenciyi kimliğiyle isteyince boş döner', async () => {
    const { data } = await veli.from('students').select('id').in('id', [KEREM, AYSE_CELIK])
    expect(data).toEqual([])
  })

  it('deneme sonuçlarında yalnız Elif var', async () => {
    const { data } = await veli.from('exam_results').select('student_id')
    expect(data!.length).toBeGreaterThan(0)
    expect(new Set(ids(data))).toEqual(new Set([ELIF]))
  })

  it('başka öğrencinin görevini, görüşmesini, notunu göremez', async () => {
    for (const t of ['tasks', 'meetings', 'notes'] as const) {
      const { data } = await veli.from(t).select('student_id').neq('student_id', ELIF)
      expect(data, t).toEqual([])
    }
  })

  it('Elif hakkında yalnız "veli görsün" notlarını görür', async () => {
    const { data } = await veli.from('notes').select('visibility')
    expect(data!.length).toBeGreaterThan(0)
    expect(new Set(data!.map((n) => n.visibility))).toEqual(new Set(['veli']))
  })

  it('öğrenciyle yapılacak görüşmeyi görmez', async () => {
    const { data } = await veli.from('meetings').select('with_whom')
    expect(data!.every((m) => m.with_whom !== 'ogrenci')).toBe(true)
  })

  it('"veli görmesin" işaretli görevi görmez', async () => {
    const svc = service()
    const { data: reh } = await svc.from('profiles').select('id').eq('email', 'rehber@buluskure.k12.tr').single()
    const { data: gizli } = await svc
      .from('tasks')
      .insert({ student_id: ELIF, subject: 'MAT', topic: 'Veliden gizli görev', question_count: 5, due_date: '2030-01-01', parent_visible: false, created_by: reh!.id })
      .select('id')
      .single()
    const { data } = await veli.from('tasks').select('id').eq('id', gizli!.id)
    expect(data).toEqual([])
    await svc.from('tasks').delete().eq('id', gizli!.id)
  })

  it("diğer velinin çocuğunu (Kerem) görmez, Kerem'in velisi de Elif'i görmez", async () => {
    const kv = await signIn('veliKerem')
    const { data } = await kv.from('students').select('id')
    expect(ids(data)).toEqual([KEREM])
  })
})

describe('Öğrenci yalnız kendini görür', () => {
  let elif: SupabaseClient
  beforeAll(async () => (elif = await signIn('elif')))

  it('başkasının görevini okuyamaz', async () => {
    const { data: hepsi } = await elif.from('tasks').select('student_id')
    expect(hepsi!.length).toBeGreaterThan(0)
    expect(new Set(ids(hepsi))).toEqual(new Set([ELIF]))
    const { data } = await elif.from('tasks').select('id').eq('student_id', AYSE_CELIK)
    expect(data).toEqual([])
  })

  it('başka öğrencinin sonucunu ve kaydını okuyamaz', async () => {
    const { data: s } = await elif.from('students').select('id')
    expect(ids(s)).toEqual([ELIF])
    const { data: r } = await elif.from('exam_results').select('student_id').neq('student_id', ELIF)
    expect(r).toEqual([])
  })

  it('hiçbir öğretmen notunu okuyamaz (rehber, öğretmen, veli notları)', async () => {
    const { data } = await elif.from('notes').select('id')
    expect(data).toEqual([])
  })

  it('yalnız velinin katılacağı görüşmeyi görmez', async () => {
    const { data } = await elif.from('meetings').select('with_whom')
    expect(data!.every((m) => m.with_whom !== 'veli')).toBe(true)
  })

  it('kendi görevinde ilerlemeyi güncelleyebilir ama son günü değiştiremez', async () => {
    const { data: t } = await elif.from('tasks').select('id, solved, due_date').eq('topic', 'Üslü ifadeler').single()
    const ok = await elif.from('tasks').update({ solved: t!.solved }).eq('id', t!.id).select('id')
    expect(ok.error).toBeNull()
    expect(ok.data).toHaveLength(1)
    const bad = await elif.from('tasks').update({ due_date: '2030-01-01' }).eq('id', t!.id)
    expect(bad.error?.code).toBe('42501')
  })

  it('başkasının görevini güncelleyemez', async () => {
    const { data: t } = await service().from('tasks').select('id').eq('student_id', AYSE_CELIK).limit(1).single()
    const { data } = await elif.from('tasks').update({ solved: 40 }).eq('id', t!.id).select('id')
    expect(data).toEqual([])
    const { data: after } = await service().from('tasks').select('solved').eq('id', t!.id).single()
    expect(after!.solved).toBe(22)
  })
})

describe('Branş öğretmeni', () => {
  let mat: SupabaseClient
  beforeAll(async () => (mat = await signIn('matematik')))

  it('öğrencileri görür', async () => {
    const { data } = await mat.from('students').select('id')
    expect(data).toHaveLength(22)
  })

  it('rehber-gizli notu okuyamaz', async () => {
    const { data } = await mat.from('notes').select('visibility').eq('student_id', ELIF)
    expect(data!.length).toBeGreaterThan(0)
    expect(data!.some((n) => n.visibility === 'rehber')).toBe(false)
  })

  it('rehber-gizli not yazamaz, öğretmen notu yazabilir', async () => {
    const { data: me } = await mat.auth.getUser()
    const bad = await mat.from('notes').insert({ student_id: ELIF, author_id: me.user!.id, visibility: 'rehber', body: 'x' })
    expect(bad.error?.code).toBe('42501')
    const veli = await mat.from('notes').insert({ student_id: ELIF, author_id: me.user!.id, visibility: 'veli', body: 'x' })
    expect(veli.error?.code).toBe('42501')
    const ok = await mat.from('notes').insert({ student_id: ELIF, author_id: me.user!.id, visibility: 'ogretmen', body: 'Test notu' }).select('id').single()
    expect(ok.error).toBeNull()
    await service().from('notes').delete().eq('id', ok.data!.id)
  })

  it('görev atayamaz, görüşme planlayamaz', async () => {
    const { data: me } = await mat.auth.getUser()
    const t = await mat.from('tasks').insert({ student_id: ELIF, subject: 'MAT', topic: 'x', question_count: 5, due_date: '2030-01-01', created_by: me.user!.id })
    expect(t.error?.code).toBe('42501')
    const m = await mat.from('meetings').insert({ student_id: ELIF, with_whom: 'veli', starts_at: '2030-01-01T10:00:00Z', created_by: me.user!.id })
    expect(m.error?.code).toBe('42501')
  })

  it('rehber aynı rehber notunu görebilir', async () => {
    const reh = await signIn('rehber')
    const { data } = await reh.from('notes').select('visibility').eq('student_id', ELIF)
    expect(data!.some((n) => n.visibility === 'rehber')).toBe(true)
  })
})

describe('Onaysız kullanıcı hiçbir öğrenci verisi okuyamaz', () => {
  it('seed: onay bekleyen Mert hiçbir şey göremez, yalnız kendi profilini görür', async () => {
    const mert = await signIn('bekleyenMert')
    for (const t of [...STUDENT_TABLES, 'exams', 'outcomes', 'parent_links', 'study_sessions', 'schools'] as const) {
      const { data, error } = await mert.from(t).select('*').limit(5)
      expect(error, t).toBeNull()
      expect(data, t).toEqual([])
    }
    const { data: p } = await mert.from('profiles').select('status, role')
    expect(p).toEqual([{ status: 'pending', role: 'ogrenci' }])
  })

  it('yeni kayıt: pending oluşur ve hiçbir öğrenciyi okuyamaz', async () => {
    const r = await register({ full_name: 'Deneme Veli', role: 'veli', declared: { childName: 'Elif Yıldız', childClass: '8/A', relation: 'Anne' } })
    expect(r.error).toBeNull()
    const { data: p } = await r.client.from('profiles').select('status, role')
    expect(p).toEqual([{ status: 'pending', role: 'veli' }])
    for (const t of STUDENT_TABLES) {
      const { data } = await r.client.from(t).select('*').limit(1)
      expect(data, t).toEqual([])
    }
  })

  it('reddedilen kullanıcı da okuyamaz', async () => {
    const r = await register({ full_name: 'Reddedilecek Öğrenci', role: 'ogrenci', declared: { className: '8/A', schoolNo: '9999' } })
    const admin = await signInAdminAal2()
    const { data: prof } = await r.client.from('profiles').select('id').single()
    expect((await admin.rpc('reject_registration', { p_profile: prof!.id })).error).toBeNull()
    const { data } = await r.client.from('students').select('id')
    expect(data).toEqual([])
    const { data: p } = await r.client.from('profiles').select('status')
    expect(p).toEqual([{ status: 'rejected' }])
  })

  it('kayıtla admin olunamaz, durum approved gönderilemez', async () => {
    const r = await register({ full_name: 'Sahte Yönetici', role: 'admin' })
    expect(r.error).not.toBeNull()
    const r2 = await register({ full_name: 'Sahte Onaylı', role: 'ogretmen', branch: 'Rehberlik', status: 'approved' })
    expect(r2.error).toBeNull()
    const { data } = await r2.client.from('profiles').select('status')
    expect(data).toEqual([{ status: 'pending' }])
  })

  it('kullanıcı kendi profilini onaylayamaz, profil ekleyemez', async () => {
    const r = await register({ full_name: 'Kendini Onaylayan', role: 'ogrenci', declared: { className: '8/B', schoolNo: '9998' } })
    const { data: me } = await r.client.auth.getUser()
    const up = await r.client.from('profiles').update({ status: 'approved' }).eq('id', me.user!.id).select('id')
    expect(up.data).toEqual([])
    const ins = await r.client.from('profiles').insert({ id: me.user!.id, school_id: '00000000-0000-4000-8000-000000000001', full_name: 'x', role: 'admin', status: 'approved' })
    expect(ins.error).not.toBeNull()
    const { data } = await service().from('profiles').select('status').eq('id', me.user!.id).single()
    expect(data!.status).toBe('pending')
  })

  it('giriş yapmamış (anon) istek hiçbir tabloyu okuyamaz', async () => {
    const a = anon()
    for (const t of [...STUDENT_TABLES, 'profiles', 'exams', 'schools'] as const) {
      const { data, error } = await a.from(t).select('*').limit(1)
      expect(data ?? [], t).toEqual([])
      expect(error?.code, t).toBe('42501')
    }
  })
})

describe('Admin: iki adımlı doğrulama (aal2) olmadan admin işlemi yok', () => {
  it('aal1 admin öğrenci ve bekleyen kayıt göremez, onay veremez', async () => {
    const a1 = await signIn('admin')
    const { data: aal } = await a1.auth.mfa.getAuthenticatorAssuranceLevel()
    expect(aal!.currentLevel).toBe('aal1')
    expect((await a1.from('students').select('id')).data).toEqual([])
    expect((await a1.from('profiles').select('id').eq('status', 'pending')).data).toEqual([])
    const { data: mert } = await service().from('profiles').select('id').eq('email', 'mert.demir@ornek.com').single()
    const res = await a1.rpc('approve_registration', { p_profile: mert!.id })
    expect(res.error?.code).toBe('42501')
    const upd = await a1.from('profiles').update({ status: 'approved' }).eq('id', mert!.id).select('id')
    expect(upd.data).toEqual([])
  })

  it('rehber öğretmen onay veremez ve bekleyen kayıtları göremez', async () => {
    const reh = await signIn('rehber')
    expect((await reh.from('profiles').select('id').eq('status', 'pending')).data).toEqual([])
    const r = await register({ full_name: 'Rehber Onaylamasın', role: 'ogrenci', declared: { className: '8/C', schoolNo: '9997' } })
    const { data: p } = await r.client.from('profiles').select('id').single()
    expect((await reh.rpc('approve_registration', { p_profile: p!.id })).error?.code).toBe('42501')
  })

  it('aal2 admin onaylar: öğrenci yeni kayda, veli seçilen öğrenciye bağlanır; bildirim gider', async () => {
    const admin = await signInAdminAal2()
    const { data: aal } = await admin.auth.mfa.getAuthenticatorAssuranceLevel()
    expect(aal!.currentLevel).toBe('aal2')
    expect((await admin.from('students').select('id')).data!.length).toBeGreaterThanOrEqual(22)

    // öğrenci → yeni öğrenci kaydı
    const o = await register({ full_name: 'Yeni Öğrenci', role: 'ogrenci', declared: { className: '8/C', schoolNo: '' } })
    const { data: op } = await o.client.from('profiles').select('id').single()
    expect((await admin.rpc('approve_registration', { p_profile: op!.id })).error).toBeNull()
    await o.client.auth.refreshSession()
    const { data: os } = await o.client.from('students').select('full_name, class_name')
    expect(os).toEqual([{ full_name: 'Yeni Öğrenci', class_name: '8/C' }])
    const { data: on } = await o.client.from('notifications').select('text')
    expect(on!.map((n) => n.text)).toContain('Kaydın onaylandı. Hoş geldin!')

    // veli → öğrenci seçmeden onaylanamaz; seçince yalnız o öğrenciyi görür
    const v = await register({ full_name: 'Yeni Veli', role: 'veli', declared: { childName: 'Kerem Aydın', childClass: '8/B', relation: 'Anne' } })
    const { data: vp } = await v.client.from('profiles').select('id').single()
    expect((await admin.rpc('approve_registration', { p_profile: vp!.id })).error).not.toBeNull()
    expect((await admin.rpc('approve_registration', { p_profile: vp!.id, p_student: KEREM })).error).toBeNull()
    const { data: vs } = await v.client.from('students').select('id')
    expect(ids(vs)).toEqual([KEREM])

    // işlenmiş kayıt ikinci kez onaylanamaz; audit log yazıldı
    expect((await admin.rpc('approve_registration', { p_profile: vp!.id, p_student: KEREM })).error).not.toBeNull()
    const { data: log } = await admin.from('audit_log').select('action').eq('entity_id', vp!.id)
    expect(log).toEqual([{ action: 'approve' }])
  })

  it('bir öğrenci kaydına ikinci öğrenci hesabı bağlanamaz', async () => {
    const admin = await signInAdminAal2()
    const o = await register({ full_name: 'Elif Yıldız', role: 'ogrenci', declared: { className: '8/A', schoolNo: '1184' } })
    const { data: p } = await o.client.from('profiles').select('id').single()
    const res = await admin.rpc('approve_registration', { p_profile: p!.id, p_student: ELIF })
    expect(res.error?.code).toBe('23505')
  })
})
