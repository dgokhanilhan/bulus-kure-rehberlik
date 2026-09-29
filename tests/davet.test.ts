// Faz F (0017 + Edge Function admin-davet): yöneticinin öğretmen/veli hesabı açması, KVKK ilk giriş onayı, daveti yeniden gönderme.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { anon, service, signIn, signInAdminAal2, ELIF, KEREM } from './helpers'

const svc = service()
let admin: SupabaseClient
const stamp = Date.now()
const tEmail = `davet-ogretmen-${stamp}@ornek.com`
const vEmail = `davet-veli-${stamp}@ornek.com`
const MAIL = `http://127.0.0.1:${process.env.MAILPIT_PORT ?? 54324}`
const invite = (c: SupabaseClient, body: Record<string, unknown>) => c.functions.invoke('admin-davet', { body })
const status = async (r: { error: unknown }) => ((r.error as { context?: Response } | null)?.context?.status ?? 200)
const msg = async (r: { error: unknown; data: unknown }) => {
  const ctx = (r.error as { context?: Response } | null)?.context
  return ctx ? ((await ctx.json()) as { error: string }).error : (r.data as { error?: string })?.error
}
const idOf = async (email: string) => (await svc.from('profiles').select('id').eq('email', email).maybeSingle()).data?.id as string | undefined

async function cleanup() {
  for (const e of [tEmail, vEmail]) {
    const id = await idOf(e)
    if (id) await svc.auth.admin.deleteUser(id)
  }
}
beforeAll(async () => {
  admin = await signInAdminAal2()
})
afterAll(cleanup)

describe('Yetki', () => {
  it('rehber ve iki adımlı doğrulaması yapılmamış yönetici hesap açamaz', async () => {
    const body = { role: 'ogretmen', full_name: 'Yetkisiz Deneme', email: `x-${stamp}@ornek.com`, branch: 'Fizik' }
    expect(await status(await invite(await signIn('rehber'), body))).toBe(403)
    expect(await status(await invite(await signIn('admin'), body))).toBe(403) // aal1
    expect(await status(await anon().functions.invoke('admin-davet', { body }))).toBe(401)
    expect(await idOf(`x-${stamp}@ornek.com`)).toBeUndefined()
  })
})

describe('Öğretmen daveti', () => {
  it('hesap onaylı açılır, ders ataması ve sınıf öğretmenliği yazılır, davet e-postası gider', async () => {
    const c8B = (await svc.from('classes').select('id').eq('name', '8/B').single()).data!.id
    const c6A = (await svc.from('classes').select('id').eq('name', '6/A').single()).data!.id
    const fiz = (await svc.from('courses').select('id').eq('name', 'Matematik').single()).data!.id
    const r = await invite(admin, { role: 'ogretmen', full_name: '  Deniz  Aktaş ', email: tEmail.toUpperCase(), branch: 'Matematik', phone: '0532 000 00 00', assignments: [{ class_id: c8B, course_id: fiz }], homeroom_class_id: c6A })
    expect(await msg(r)).toBeUndefined()
    const id = (r.data as { user_id: string }).user_id
    const { data: p } = await svc.from('profiles').select('full_name, email, role, branch, status, invited_at, consent_version, phone').eq('id', id).single()
    expect(p).toMatchObject({ full_name: 'Deniz Aktaş', email: tEmail, role: 'ogretmen', branch: 'Matematik', status: 'approved', consent_version: null, phone: '0532 000 00 00' })
    expect(p!.invited_at).not.toBeNull()
    expect((await svc.from('teaching_assignments').select('id').eq('teacher_id', id).eq('class_id', c8B)).data).toHaveLength(1)
    expect((await svc.from('classes').select('homeroom_teacher_id').eq('id', c6A).single()).data!.homeroom_teacher_id).toBe(id)
    expect((await svc.from('audit_log').select('action').eq('entity_id', id).eq('action', 'invite')).data).toHaveLength(1)
    const mail = await (await fetch(`${MAIL}/api/v1/search?query=${encodeURIComponent(`to:"${tEmail}"`)}`)).json()
    expect(mail.messages_count ?? mail.total).toBeGreaterThanOrEqual(1)
  })

  it('aynı e-posta ikinci kez açılamaz; geçersiz branş reddedilir', async () => {
    expect(await msg(await invite(admin, { role: 'ogretmen', full_name: 'Tekrar', email: tEmail, branch: 'Matematik' }))).toMatch(/zaten var/)
    expect(await msg(await invite(admin, { role: 'ogretmen', full_name: 'Uydurma', email: `u-${stamp}@ornek.com`, branch: 'Astroloji' }))).toMatch(/Branş/)
  })
})

describe('Veli daveti', () => {
  it('birden çok öğrenciye bağlanır; öğrencisiz veli açılmaz', async () => {
    expect(await msg(await invite(admin, { role: 'veli', full_name: 'Öğrencisiz Veli', email: `o-${stamp}@ornek.com`, students: [] }))).toMatch(/en az bir öğrencisini/)
    const r = await invite(admin, { role: 'veli', full_name: 'Zeynep Aydın', email: vEmail, students: [{ student_id: KEREM, relation: 'Anne' }, { student_id: ELIF, relation: 'Vasi' }] })
    expect(await msg(r)).toBeUndefined()
    const id = (r.data as { user_id: string }).user_id
    const { data: links } = await svc.from('parent_links').select('student_id, relation').eq('parent_id', id).order('relation')
    expect(links).toEqual([
      { student_id: KEREM, relation: 'Anne' },
      { student_id: ELIF, relation: 'Vasi' },
    ])
  })
})

describe('İlk giriş: KVKK onayı ve davet durumu', () => {
  it('davetli kişi şifresini belirleyip girince KVKK onayı ister; onaylayınca kaydedilir', async () => {
    const id = (await idOf(vEmail))!
    // Davet bağlantısının yerine: şifreyi test için yönetici API'siyle belirle (yalnız yerel)
    await svc.auth.admin.updateUserById(id, { password: 'Davet12345!', email_confirm: true })
    const c = anon()
    expect((await c.auth.signInWithPassword({ email: vEmail, password: 'Davet12345!' })).error).toBeNull()
    expect((await c.from('profiles').select('consent_version').eq('id', id).single()).data!.consent_version).toBeNull()
    expect((await c.rpc('accept_consent', { p_version: 'v1-taslak' })).error).toBeNull()
    expect((await c.from('profiles').select('consent_version').eq('id', id).single()).data!.consent_version).toBe('v1-taslak')
    // Veli iki çocuğunu da görür
    expect(((await c.from('students').select('id')).data ?? []).map((s) => s.id).sort()).toEqual([ELIF, KEREM].sort())
  })

  it('kendi kendine kayıtta KVKK onayı yine zorunlu (davet ayrıcalığı taklit edilemez)', async () => {
    const r = await anon().auth.signUp({ email: `kvkk-${stamp}@ornek.com`, password: 'Deneme123!', options: { data: { school: 'bulus-kure', role: 'veli', full_name: 'Onaysız Veli', invited_at: new Date().toISOString(), declared: { childName: 'Elif Yıldız', childClass: '8/A' } } } })
    expect(r.error).not.toBeNull()
  })

  it('davet durumu yalnız yöneticiye görünür; giriş yapmış kişiye davet yeniden gönderilmez', async () => {
    const { data } = await admin.rpc('admin_user_states')
    const rows = data as { id: string; invited_at: string | null; last_sign_in_at: string | null }[]
    const tid = await idOf(tEmail)
    const t = rows.find((x) => x.id === tid)!
    expect(t.invited_at).not.toBeNull()
    expect(t.last_sign_in_at).toBeNull()
    expect(((await (await signIn('rehber')).rpc('admin_user_states')).data ?? []) as unknown[]).toEqual([])
    expect(await msg(await invite(admin, { action: 'resend', user_id: await idOf(tEmail) }))).toBeUndefined()
    expect(await msg(await invite(admin, { action: 'resend', user_id: await idOf(vEmail) }))).toMatch(/zaten giriş yapmış/)
  })
})
