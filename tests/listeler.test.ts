import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { anon, service, signIn, signInAdminAal2 } from './helpers'
import { newList, type ListSources } from '../src/lib/schoolLists'
describe('Liste merkezi yönetici/MFA/okul sınırı', () => {
  let admin: SupabaseClient
  let sources: ListSources
  const documents: string[] = []
  let parentId: string
  beforeAll(async () => {
    admin = await signInAdminAal2()
    const r = await admin.rpc('school_list_sources')
    expect(r.error).toBeNull()
    sources = r.data
    parentId = sources.parents[0]!.id
  })
  afterAll(async () => {
    if (documents.length) await service().from('school_list_documents').delete().in('id', documents)
    if (parentId) await service().from('parent_contact_details').delete().eq('profile_id', parentId)
  })
  it('anonim, öğretmen, veli, öğrenci ve aal1 yönetici kaynak/çıktı/yazma erişimini reddeder', async () => {
    for (const c of [
      anon(),
      await signIn('matematik'),
      await signIn('veliElif'),
      await signIn('elif'),
      await signIn('admin'),
    ]) {
      expect((await c.rpc('school_list_sources')).error).not.toBeNull()
      expect(
        (await c.rpc('authorize_school_list_export', { p_format: 'xlsx', p_columns: ['phone'], p_count: 1 })).error,
      ).not.toBeNull()
      expect(
        (
          await c.rpc('save_school_list', {
            p_id: null,
            p_name: 'Yetkisiz',
            p_kind: 'students',
            p_mode: 'dynamic',
            p_config: newList('students'),
          })
        ).error,
      ).not.toBeNull()
      expect(
        (await c.rpc('update_parent_contact', { p_parent: parentId, p_phone: '05551112233', p_email: null })).error,
      ).not.toBeNull()
    }
  })
  it('dinamik şablon/sabit satırlar kaydedilir; eski revizyonla güncellenmez', async () => {
    const c = newList('students')
    const args = { p_id: null, p_name: 'Test listesi', p_kind: 'students', p_mode: 'dynamic', p_config: c }
    const first = await admin.rpc('save_school_list', args)
    expect(first.error).toBeNull()
    documents.push(first.data)
    const changed = await admin.rpc('save_school_list', { ...args, p_id: first.data, p_name: 'Yeni ad', p_revision: 1 })
    expect(changed.error).toBeNull()
    expect((await admin.rpc('save_school_list', { ...args, p_id: first.data, p_revision: 1 })).error?.code).toBe(
      'PT409',
    )
    const fixed = await admin.rpc('save_school_list', {
      ...args,
      p_mode: 'snapshot',
      p_snapshot: [['1', 'Çağrı Şen', '8/A', '001']],
    })
    expect(fixed.error).toBeNull()
    documents.push(fixed.data)
    expect(
      (await admin.from('school_list_documents').select('snapshot').eq('id', fixed.data).single()).data?.snapshot[0][1],
    ).toBe('Çağrı Şen')
    const teacher = await signIn('matematik')
    expect((await teacher.from('school_list_documents').select('*').in('id', documents)).data).toEqual([])
    expect(
      (await admin.from('school_list_documents').update({ name: 'RPC dışı' }).eq('id', first.data)).error,
    ).not.toBeNull()
  })
  it('telefonu normalize eder, iletişim güncellemesinde giriş hesabını ve bağlantıları korur', async () => {
    const svc = service()
    const before = await svc.from('profiles').select('email,phone').eq('id', parentId).single()
    const authBefore = await svc.auth.admin.getUserById(parentId)
    const links = await svc.from('parent_links').select('*').eq('parent_id', parentId)
    const r = await admin.rpc('update_parent_contact', {
      p_parent: parentId,
      p_phone: '0555 111 22 33',
      p_email: 'contact@example.com',
      p_expected: null,
    })
    expect(r.error).toBeNull()
    const source = (await admin.rpc('school_list_sources')).data as ListSources
    const p = source.parents.find((p) => p.id === parentId)!
    expect(p.phone).toBe('+905551112233')
    expect(p.email).toBe('contact@example.com')
    expect((await svc.from('profiles').select('email,phone').eq('id', parentId).single()).data).toEqual(before.data)
    expect((await svc.auth.admin.getUserById(parentId)).data.user?.email).toBe(authBefore.data.user?.email)
    expect((await svc.from('parent_links').select('*').eq('parent_id', parentId)).data).toEqual(links.data)
    expect(
      (
        await admin.rpc('update_parent_contact', {
          p_parent: parentId,
          p_phone: 'abc',
          p_email: null,
          p_expected: p.updatedAt,
        })
      ).error,
    ).not.toBeNull()
    expect(
      (await admin.rpc('update_parent_contact', { p_parent: parentId, p_phone: '', p_email: '', p_expected: null }))
        .error?.code,
    ).toBe('PT409')
  })
  it('bozuk snapshot ve düzen reddedilir; dışa aktarma audit kaydı kişisel veri içermez', async () => {
    const c = newList('students')
    const args = {
      p_id: null,
      p_name: 'Bozuk',
      p_kind: 'students',
      p_mode: 'snapshot',
      p_config: c,
      p_snapshot: [['eksik']],
    }
    expect((await admin.rpc('save_school_list', args)).error?.code).toBe('22023')
    expect(
      (await admin.rpc('save_school_list', { ...args, p_mode: 'dynamic', p_config: { ...c, rowHeight: -2 } })).error
        ?.code,
    ).toBe('22023')
    expect(
      (await admin.rpc('authorize_school_list_export', { p_format: 'xlsx', p_columns: ['phone'], p_count: 2 })).error,
    ).toBeNull()
    const audit = await service()
      .from('audit_log')
      .select('meta')
      .eq('action', 'list_export')
      .order('created_at', { ascending: false })
      .limit(1)
    expect(audit.data?.[0]?.meta).toEqual({ format: 'xlsx', columns: ['phone'], rows: 2 })
  })
  it('başka okulun listesi ve veli iletişimi yöneticiye de kapalıdır', async () => {
    const svc = service()
    const school = await svc
      .from('schools')
      .insert({ name: 'Test başka okul', slug: `list-${Date.now()}` })
      .select('id')
      .single()
    expect(school.error).toBeNull()
    const u = await svc.auth.admin.createUser({
      email: `test-list-${Date.now()}@ornek.com`,
      password: 'TestList123!',
      email_confirm: true,
      user_metadata: {
        school: 'bulus-kure',
        full_name: 'Başka Veli',
        role: 'veli',
        consent_version: 'v1', acik_riza_version: 'ACIK-RIZA-1.0',
        declared: { childName: 'Örnek', childClass: '8/A', relation: 'Anne' },
      },
    })
    expect(u.error).toBeNull()
    let doc: string | undefined
    try {
      expect(
        (
          await svc
            .from('profiles')
            .update({ school_id: school.data!.id, status: 'approved' })
            .eq('id', u.data.user!.id)
        ).error,
      ).toBeNull()
      const ownSchool = (await svc.from('profiles').select('school_id').eq('id', parentId).single()).data!.school_id
      // Okul taşımasından kalan eski iletişim satırı da görünmemeli.
      expect(
        (
          await svc
            .from('parent_contact_details')
            .insert({ profile_id: u.data.user!.id, school_id: ownSchool, phone: '+905551234567' })
        ).error,
      ).toBeNull()
      expect(
        (await admin.from('parent_contact_details').select('phone').eq('profile_id', u.data.user!.id)).data,
      ).toEqual([])
      const d = await svc
        .from('school_list_documents')
        .insert({
          school_id: school.data!.id,
          name: 'Başka okul listesi',
          kind: 'parents',
          mode: 'dynamic',
          config: newList('parents'),
          created_by: u.data.user!.id,
        })
        .select('id')
        .single()
      expect(d.error).toBeNull()
      doc = d.data!.id
      expect((await admin.from('school_list_documents').select('id').eq('id', doc)).data).toEqual([])
      expect((await admin.rpc('archive_school_list', { p_id: doc })).error?.code).toBe('42501')
      expect(
        (await admin.rpc('update_parent_contact', { p_parent: u.data.user!.id, p_phone: '05551112233', p_email: null }))
          .error?.code,
      ).toBe('42501')
      const s = (await admin.rpc('school_list_sources')).data as ListSources
      expect(s.parents.some((p) => p.id === u.data.user!.id)).toBe(false)
    } finally {
      if (doc) await svc.from('school_list_documents').delete().eq('id', doc)
      expect((await svc.auth.admin.deleteUser(u.data.user!.id)).error).toBeNull()
      for (const table of ['gallery_categories', 'courses', 'academic_years'])
        expect((await svc.from(table).delete().eq('school_id', school.data!.id)).error).toBeNull()
      expect((await svc.from('schools').delete().eq('id', school.data!.id)).error).toBeNull()
    }
  })
})
