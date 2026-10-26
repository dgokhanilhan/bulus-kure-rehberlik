// Kapalı hesaplar → Tamamen sil (admin-davet delete_account): yalnız kapalı/reddedilmiş, yönetici olmayan hesap; e-posta yeniden
// kayıt için boşalır; okulda kaydı olan hesap silinmez (kapalı kalır); yönetici + aal2 dışında kimse silemez.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { anon, register, service, signIn, signInAdminAal2 } from './helpers'

const svc = service()
let admin: SupabaseClient
const silinecek: string[] = []
const call = (c: SupabaseClient, user_id: string) => c.functions.invoke('admin-davet', { body: { action: 'delete_account', user_id } })
const status = (r: { error: unknown }) => (r.error as { context?: Response } | null)?.context?.status ?? 200
const msg = async (r: { error: unknown; data: unknown }) => {
  const ctx = (r.error as { context?: Response } | null)?.context
  return ctx ? ((await ctx.json()) as { error: string }).error : (r.data as { error?: string })?.error
}

beforeAll(async () => {
  admin = await signInAdminAal2()
})
afterAll(async () => {
  for (const id of silinecek) await svc.auth.admin.deleteUser(id).catch(() => null)
})

describe('hesabı tamamen sil', () => {
  it('reddedilen başvuru silinir; aynı e-postayla yeniden kayıt olunabilir; işlem kaydı düşer', async () => {
    const r = await register({ full_name: 'Yanlış Kayıt', role: 'ogretmen', branch: 'Fizik' })
    const id = r.data.user!.id
    expect((await admin.rpc('reject_registration', { p_profile: id })).error).toBeNull()
    for (const c of [await signIn('rehber'), await signIn('admin'), anon()]) expect([401, 403]).toContain(status(await call(c, id)))
    const s = await call(admin, id)
    expect(await msg(s)).toBeUndefined()
    expect((await svc.from('profiles').select('id').eq('id', id).maybeSingle()).data).toBeNull()
    expect((await svc.from('audit_log').select('id').eq('action', 'account_delete').eq('entity_id', id)).data).toHaveLength(1)
    const yeni = await anon().auth.signUp({ email: r.email, password: 'Deneme123!', options: { data: { school: 'bulus-kure', consent_version: 'v1', acik_riza_version: 'ACIK-RIZA-1.0', full_name: 'Doğru Kayıt', role: 'ogretmen', branch: 'Fizik' } } })
    expect(yeni.error).toBeNull()
    silinecek.push(yeni.data.user!.id)
  })

  it('açık (onaylı) hesap silinmez: önce kapatılmalı', async () => {
    const r = await register({ full_name: 'Açık Hesap Öğretmen', role: 'ogretmen', branch: 'Fizik' })
    silinecek.push(r.data.user!.id)
    await svc.from('profiles').update({ status: 'approved' }).eq('id', r.data.user!.id)
    const s = await call(admin, r.data.user!.id)
    expect(status(s)).toBe(409)
    expect(await msg(s)).toMatch(/önce hesabı kapat/)
  })

  it('okulda kaydı olan kapalı hesap silinmez, kapalı kalır', async () => {
    const r = await register({ full_name: 'Kayıtlı Öğretmen', role: 'ogretmen', branch: 'Kimya' })
    const id = r.data.user!.id
    silinecek.push(id)
    await svc.from('profiles').update({ status: 'rejected' }).eq('id', id)
    await svc.from('ai_usage').insert({ user_id: id, fn: 'test', ok: true })
    const s = await call(admin, id)
    expect(status(s)).toBe(409)
    expect(await msg(s)).toMatch(/kayıtları var/)
    expect((await svc.from('profiles').select('status').eq('id', id).single()).data!.status).toBe('rejected')
    await svc.from('ai_usage').delete().eq('user_id', id)
  })
})
