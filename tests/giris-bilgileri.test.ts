// 0059 + admin-davet set_email / set_password: yönetici öğrenci / öğretmen / veli hesabına yeni e-posta ve yeni şifre verir.
// Mevcut şifre hiçbir yerden okunamaz; yeni şifre sonrası eski şifre ve açık oturumlar geçersizdir; yönetici hesapları korunur.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { anon, register, service, signIn, signInAdminAal2 } from './helpers'

const svc = service()
let admin: SupabaseClient
let hedef: { id: string; email: string; password: string; client: SupabaseClient }
const yeniEmail = `giris-yeni-${Date.now()}@ornek.com`
const call = (c: SupabaseClient, body: Record<string, unknown>) => c.functions.invoke('admin-davet', { body })
const status = (r: { error: unknown }) => (r.error as { context?: Response } | null)?.context?.status ?? 200
const msg = async (r: { error: unknown; data: unknown }) => {
  const ctx = (r.error as { context?: Response } | null)?.context
  return ctx ? ((await ctx.json()) as { error: string }).error : (r.data as { error?: string })?.error
}
const girer = async (email: string, password: string) => !(await anon().auth.signInWithPassword({ email, password })).error

beforeAll(async () => {
  admin = await signInAdminAal2()
  const r = await register({ full_name: 'Giriş Bilgisi Deneme', role: 'ogretmen', branch: 'Fizik' })
  const id = r.data.user!.id
  await svc.from('profiles').update({ status: 'approved' }).eq('id', id)
  const client = anon()
  await client.auth.signInWithPassword({ email: r.email, password: r.password })
  hedef = { id, email: r.email, password: r.password, client }
})
afterAll(async () => {
  if (hedef?.id) await svc.auth.admin.deleteUser(hedef.id)
})

describe('Yetki', () => {
  it('yönetici olmayan, aal1 yönetici ve oturumsuz istek reddedilir', async () => {
    const body = { action: 'set_password', user_id: hedef.id, password: 'Yetkisiz123' }
    expect(status(await call(await signIn('rehber'), body))).toBe(403)
    expect(status(await call(await signIn('admin'), body))).toBe(403)
    expect(status(await anon().functions.invoke('admin-davet', { body }))).toBe(401)
    expect(await girer(hedef.email, hedef.password)).toBe(true)
  })

  it('yönetici hesabının (kendisi dahil) şifresi ve e-postası değiştirilemez', async () => {
    const { data: me } = await admin.auth.getUser()
    const r = await call(admin, { action: 'set_password', user_id: me.user!.id, password: 'Baskasi123' })
    expect(status(r)).toBe(403)
    expect(await msg(r)).toMatch(/Yönetici hesaplarının/)
    expect(await girer('admin@buluskure.k12.tr', 'Admin123!')).toBe(true)
  })

  it('kullanıcılar mevcut şifreyi okuyamaz; oturum kapatma fonksiyonunu çağıramaz', async () => {
    const { error } = await hedef.client.rpc('hesap_oturumlarini_kapat', { p_user: hedef.id })
    expect(error).not.toBeNull()
    const { error: e2 } = await admin.rpc('hesap_oturumlarini_kapat', { p_user: hedef.id })
    expect(e2).not.toBeNull()
  })
})

describe('Yeni şifre', () => {
  it('kısa şifre reddedilir', async () => {
    expect(await msg(await call(admin, { action: 'set_password', user_id: hedef.id, password: 'kisa1' }))).toMatch(/8–72/)
  })

  it('yeni şifreyle girilir, eski şifre geçmez, açık oturum kapanır, işlem kaydı düşer', async () => {
    const r = await call(admin, { action: 'set_password', user_id: hedef.id, password: 'YeniSifre2026' })
    expect(await msg(r)).toBeUndefined()
    expect(await girer(hedef.email, 'YeniSifre2026')).toBe(true)
    expect(await girer(hedef.email, hedef.password)).toBe(false)
    // Eski oturumun yenileme anahtarı artık geçersiz
    expect((await hedef.client.auth.refreshSession()).error).not.toBeNull()
    const { data: log } = await svc.from('audit_log').select('meta').eq('entity_id', hedef.id).eq('action', 'password_reset')
    expect(log).toHaveLength(1)
    expect(JSON.stringify(log)).not.toContain('YeniSifre2026')
  })
})

describe('E-posta', () => {
  it('geçersiz ya da başkasına ait e-posta reddedilir', async () => {
    expect(await msg(await call(admin, { action: 'set_email', user_id: hedef.id, email: 'gecersiz' }))).toMatch(/geçersiz/)
    expect(await msg(await call(admin, { action: 'set_email', user_id: hedef.id, email: 'rehber@buluskure.k12.tr' }))).toMatch(/başka bir hesap/)
  })

  it('yeni e-posta doğrulama beklemeden geçerli olur; profil ve işlem kaydı güncellenir', async () => {
    const r = await call(admin, { action: 'set_email', user_id: hedef.id, email: `  ${yeniEmail.toUpperCase()} ` })
    expect(await msg(r)).toBeUndefined()
    expect(await girer(yeniEmail, 'YeniSifre2026')).toBe(true)
    expect(await girer(hedef.email, 'YeniSifre2026')).toBe(false)
    expect((await svc.from('profiles').select('email').eq('id', hedef.id).single()).data!.email).toBe(yeniEmail)
    expect((await svc.from('audit_log').select('id').eq('entity_id', hedef.id).eq('action', 'email_change')).data).toHaveLength(1)
  })
})
