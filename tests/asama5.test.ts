// Aşama 5: etüt kuralları ve bildirimleri, okul ayarları yetkisi, KVKK onayı, işlem kayıtları.
import { describe, it, expect, beforeAll } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { anon, service, signIn, signInAdminAal2, snap, notesOf, ELIF, REHBER_ID } from './helpers'

const SCHOOL = '00000000-0000-4000-8000-000000000001'
/** Bugünden sonraki n. Cumartesi (Türkiye saati). */
function saturday(n = 1) {
  const d = new Date(Date.now() + 3 * 3600_000)
  d.setUTCHours(12, 0, 0, 0)
  let found = 0
  for (let i = 1; i < 60; i++) {
    d.setUTCDate(d.getUTCDate() + 1)
    if (d.getUTCDay() === 6 && ++found === n) return d.toISOString().slice(0, 10)
  }
  throw new Error('cumartesi yok')
}

let rehber: SupabaseClient
beforeAll(async () => (rehber = await signIn('rehber')))

describe('Cumartesi etüdü', () => {
  const row = (extra: Record<string, unknown> = {}) => ({ school_id: SCHOOL, class_name: '8/A', subject: 'MAT', topics: ['Üslü ifadeler', ' ', 'Üslü ifadeler'], session_date: saturday(3), slot: '10-11', created_by: REHBER_ID, ...extra })

  it('planlanınca şubedeki öğrenci ve velilere bildirim; konu listesi temizlenir', async () => {
    const before = await snap()
    const { data, error } = await rehber.from('study_sessions').insert(row()).select('topics').single()
    expect(error).toBeNull()
    expect(data!.topics).toEqual(['Üslü ifadeler'])
    const msg = /^Cumartesi etüdü: .* Cumartesi 10\.00–11\.00 · Matematik · Üslü ifadeler$/
    expect((await notesOf(await signIn('veliElif'), before))[0]).toMatch(msg)
    expect((await notesOf(await signIn('elif'), before))[0]).toMatch(msg)
    expect(await notesOf(await signIn('veliKerem'), before)).toEqual([]) // 8/B
  })

  it('aynı şube + gün + saat çakışamaz; yalnız Cumartesi; geçmiş gün olmaz; konu gerekli', async () => {
    expect((await rehber.from('study_sessions').insert(row())).error?.code).toBe('23505')
    const friday = new Date(saturday(3) + 'T12:00:00Z')
    friday.setUTCDate(friday.getUTCDate() - 1)
    expect((await rehber.from('study_sessions').insert(row({ session_date: friday.toISOString().slice(0, 10), slot: '11-12' }))).error?.code).toBe('23514')
    expect((await rehber.from('study_sessions').insert(row({ slot: '13-14' }))).error?.code).toBe('23514')
    expect((await rehber.from('study_sessions').insert(row({ topics: ['  '], slot: '12-13' }))).error?.message).toBe('En az bir konu seç.')
    expect((await rehber.from('study_sessions').insert(row({ session_date: '2020-01-04', slot: '12-13' }))).error?.message).toBe('Geçmiş bir gün seçilemez.')
  })

  it('branş öğretmeni ve veli etüt planlayamaz; veli kendi şubesinin etüdünü görür; iptal bildirilir', async () => {
    expect((await (await signIn('matematik')).from('study_sessions').insert(row({ slot: '09-10' }))).error?.code).toBe('42501')
    const veli = await signIn('veliElif')
    expect((await veli.from('study_sessions').insert(row({ slot: '09-10' }))).error?.code).toBe('42501')
    const { data } = await veli.from('study_sessions').select('id, slot').eq('session_date', saturday(3))
    expect(data).toHaveLength(1)
    const before = await snap()
    await rehber.from('study_sessions').delete().eq('id', data![0]!.id)
    expect((await notesOf(veli, before))[0]).toMatch(/^Cumartesi etüdü iptal edildi:/)
  })
})

describe('Yetki: ekleme işlemleri rol ister (0001 düzeltmesi)', () => {
  it('veli ve branş öğretmeni deneme ya da öğrenci kaydı ekleyemez', async () => {
    for (const who of ['veliElif', 'matematik', 'elif'] as const) {
      const c = await signIn(who)
      expect((await c.from('exams').insert({ school_id: SCHOOL, name: 'Sahte', exam_date: '2026-09-01' })).error?.code, who).toBe('42501')
      expect((await c.from('students').insert({ school_id: SCHOOL, full_name: 'Sahte Öğrenci', class_name: '8/A' })).error?.code, who).toBe('42501')
    }
  })
})

describe('Okul ayarları', () => {
  it('yalnız aal2 yönetici değiştirir; alanlar ve aralıklar doğrulanır; işlem kaydı düşer', async () => {
    expect((await rehber.rpc('update_school_settings', { p: { bugun: { netDrop: 4 } } })).error?.code).toBe('42501')
    expect((await (await signIn('admin')).rpc('update_school_settings', { p: { bugun: { netDrop: 4 } } })).error?.code).toBe('42501')
    const admin = await signInAdminAal2()
    expect((await admin.rpc('update_school_settings', { p: { bugun: { sahte: 1 } } })).error?.message).toBe('Geçersiz ayar: sahte')
    expect((await admin.rpc('update_school_settings', { p: { bugun: { netDrop: 0 } } })).error?.message).toBe('Eşik 1 ile 50 arasında olmalı.')
    const { data, error } = await admin.rpc('update_school_settings', { p: { bugun: { netDrop: 4 }, ai: { monthlyUsd: 12 } } })
    expect(error).toBeNull()
    expect(data.bugun.netDrop).toBe(4)
    expect(data.ai.monthlyUsd).toBe(12)
    const { data: log } = await admin.from('audit_view').select('action, user_name').eq('action', 'settings').limit(1)
    expect(log).toEqual([{ action: 'settings', user_name: 'Okul Yöneticisi' }])
    await service().from('schools').update({ settings: {} }).eq('id', SCHOOL)
  })
})

describe('KVKK', () => {
  it('aydınlatma onayı olmadan kayıt olunamaz; onay sürümü ve tarihi saklanır', async () => {
    const email = `test-${Date.now()}@ornek.com`
    const no = await anon().auth.signUp({ email, password: 'Deneme123!', options: { data: { school: 'bulus-kure', full_name: 'Onaysız Kişi', role: 'ogretmen', branch: 'Matematik' } } })
    expect(no.error).not.toBeNull()
    const ok = await anon().auth.signUp({ email, password: 'Deneme123!', options: { data: { school: 'bulus-kure', consent_version: 'v1-taslak', full_name: 'Onaylı Kişi', role: 'ogretmen', branch: 'Matematik' } } })
    expect(ok.error).toBeNull()
    const { data } = await service().from('profiles').select('consent_version, consent_at').eq('email', email).single()
    expect(data!.consent_version).toBe('v1-taslak')
    expect(data!.consent_at).not.toBeNull()
    // "seed" işaretiyle taklit edilemez
    const fake = await anon().auth.signUp({ email: `test-seed-${Date.now()}@ornek.com`, password: 'Deneme123!', options: { data: { seed: '1', school: 'bulus-kure', full_name: 'Taklitçi Kişi', role: 'ogretmen', branch: 'Matematik' } } })
    expect(fake.error).not.toBeNull()
  })
})

describe('İşlem kayıtları', () => {
  it('rehber notları görüntülenince kayıt düşer; branş öğretmeni kayıt oluşturamaz; yalnız admin okur', async () => {
    const svc = service()
    const count = async () => (await svc.from('audit_log').select('id', { count: 'exact', head: true }).eq('action', 'view').eq('entity_id', ELIF)).count ?? 0
    const c0 = await count()
    await rehber.rpc('log_view', { p_entity: 'rehber_notlari', p_student: ELIF })
    expect(await count()).toBe(c0 + 1)
    await (await signIn('matematik')).rpc('log_view', { p_entity: 'rehber_notlari', p_student: ELIF })
    expect(await count()).toBe(c0 + 1)
    expect((await rehber.from('audit_view').select('id').limit(1)).data).toEqual([])
  })
})
