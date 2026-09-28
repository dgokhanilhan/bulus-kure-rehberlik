// Okul yapısı (0008): sınıflar, kademe, öğrenci ↔ sınıf, kayıt formu sınıf listesi, yönetim işlemleri.
import { describe, it, expect, beforeAll } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { anon, register, service, signIn, signInAdminAal2, ELIF } from './helpers'

const SCHOOL = '00000000-0000-4000-8000-000000000001'
let admin: SupabaseClient
const tag = () => String.fromCharCode(0x4b + Math.floor(Math.random() * 10)) // K…T arası şube harfi

async function freshClass(grade: number) {
  // Çakışmasın diye boş bir şube harfi bul
  for (let i = 0; i < 20; i++) {
    const { data, error } = await admin.from('classes').insert({ school_id: SCHOOL, grade, section: tag() }).select('id, name, level').single()
    if (!error) return data as { id: string; name: string; level: string }
  }
  throw new Error('boş şube bulunamadı')
}

beforeAll(async () => {
  admin = await signInAdminAal2()
})

describe('Sınıflar', () => {
  it('kademe sınıf düzeyinden çıkar; ad "düzey/şube"', async () => {
    const a = await freshClass(2)
    const b = await freshClass(7)
    const c = await freshClass(11)
    expect([a.level, b.level, c.level]).toEqual(['ilkokul', 'ortaokul', 'lise'])
    expect(a.name).toMatch(/^2\/[K-T]$/)
    for (const x of [a, b, c]) expect((await admin.rpc('delete_class', { p_class: x.id })).error).toBeNull()
  })

  it('yalnız yönetici ekler/düzenler; öğretmen, veli, öğrenci okur ama yazamaz', async () => {
    for (const who of ['rehber', 'matematik', 'veliElif', 'elif'] as const) {
      const c = await signIn(who)
      const { data } = await c.from('classes').select('name')
      expect((data ?? []).length, who).toBeGreaterThan(0)
      const { error } = await c.from('classes').insert({ school_id: SCHOOL, grade: 5, section: 'Z' })
      expect(error, who).not.toBeNull()
      expect((await c.rpc('delete_class', { p_class: '00000000-0000-0000-0000-000000000000' })).error?.code, who).toBe('42501')
    }
    expect((await anon().from('classes').select('id')).data ?? []).toEqual([])
  })

  it('geçersiz düzey/şube reddedilir; aynı sınıf iki kez açılamaz', async () => {
    expect((await admin.from('classes').insert({ school_id: SCHOOL, grade: 13, section: 'A' })).error).not.toBeNull()
    expect((await admin.from('classes').insert({ school_id: SCHOOL, grade: 5, section: 'a' })).error).not.toBeNull()
    expect((await admin.from('classes').insert({ school_id: SCHOOL, grade: 8, section: 'A' })).error?.code).toBe('23505')
  })

  it('sınıf öğretmeni yalnız okulun onaylı öğretmeni olabilir', async () => {
    const k = await freshClass(4)
    const { data: t } = await service().from('profiles').select('id').eq('role', 'ogretmen').eq('status', 'approved').limit(1).single()
    expect((await admin.from('classes').update({ homeroom_teacher_id: t!.id }).eq('id', k.id)).error).toBeNull()
    const { data: veli } = await service().from('profiles').select('id').eq('role', 'veli').limit(1).single()
    expect((await admin.from('classes').update({ homeroom_teacher_id: veli!.id }).eq('id', k.id)).error?.message).toMatch(/onaylı öğretmen/)
    await admin.rpc('delete_class', { p_class: k.id })
  })
})

describe('Öğrenci ↔ sınıf', () => {
  it('öğrenci sınıfla eklenir, şube adı otomatik yazılır; sınıf adı değişince öğrenciye yansır', async () => {
    const k = await freshClass(3)
    const { data: s, error } = await admin.from('students').insert({ school_id: SCHOOL, full_name: 'Test Öğrenci', class_id: k.id }).select('id, class_name').single()
    expect(error).toBeNull()
    expect(s!.class_name).toBe(k.name)

    // Şube harfi değişir → öğrencinin şube metni de değişir
    let moved = false
    for (let i = 0; i < 10 && !moved; i++) moved = !(await admin.from('classes').update({ section: tag() }).eq('id', k.id)).error
    const { data: c2 } = await admin.from('classes').select('name').eq('id', k.id).single()
    const { data: s2 } = await admin.from('students').select('class_name').eq('id', s!.id).single()
    expect(s2!.class_name).toBe(c2!.name)

    // İçinde öğrenci varken sınıf silinmez
    expect((await admin.rpc('delete_class', { p_class: k.id })).error?.message).toMatch(/1 öğrenci var/)
    expect((await admin.rpc('delete_student', { p_student: s!.id })).error).toBeNull()
    expect((await admin.rpc('delete_class', { p_class: k.id })).error).toBeNull()
  })

  it('açılmamış sınıfa öğrenci yazılamaz (eski yol: yalnız şube adı)', async () => {
    const { error } = await admin.from('students').insert({ school_id: SCHOOL, full_name: 'Yok Sınıf', class_name: '9/Z' })
    expect(error?.message).toMatch(/Sınıf bulunamadı: 9\/Z/)
  })

  it('var olan 8. sınıf öğrencileri sınıflarına bağlı', async () => {
    const { data } = await service().from('students').select('class_id, class_name').eq('id', ELIF).single()
    const { data: c } = await service().from('classes').select('name').eq('id', data!.class_id).single()
    expect(c!.name).toBe(data!.class_name)
  })
})

describe('Kayıt formu', () => {
  it('giriş yapmamış kullanıcı sınıf adlarını görür (başka bilgi yok)', async () => {
    const { data, error } = await anon().rpc('signup_classes', { p_school: 'bulus-kure' })
    expect(error).toBeNull()
    expect(data!.map((x: { name: string }) => x.name)).toEqual(expect.arrayContaining(['3/A', '8/A', '10/A']))
    expect(Object.keys(data![0]).sort()).toEqual(['grade', 'level', 'name'])
  })

  it('açık sınıfla (lise dahil) kayıt olunur; açılmamış sınıf ve bilinmeyen branş reddedilir', async () => {
    expect((await register({ full_name: 'Lise Öğrencisi', role: 'ogrenci', declared: { className: '10/A', schoolNo: '9001' } })).error).toBeNull()
    expect((await register({ full_name: 'Yanlış Sınıf', role: 'ogrenci', declared: { className: '11/Z', schoolNo: '9002' } })).error).not.toBeNull()
    expect((await register({ full_name: 'Sınıf Öğretmeni', role: 'ogretmen', branch: 'Sınıf Öğretmeni' })).error).toBeNull()
    expect((await register({ full_name: 'Uydurma Branş', role: 'ogretmen', branch: 'Astroloji' })).error).not.toBeNull()
  })
})

describe('Yönetim işlemleri', () => {
  it('yönetici öğretmenin adını/branşını düzenler; geçersiz branş reddedilir; yönetici olmayan yapamaz', async () => {
    const svc = service()
    const { data: t } = await svc.from('profiles').select('id, full_name, branch').eq('email', 'fen@buluskure.k12.tr').single()
    expect((await admin.rpc('admin_update_profile', { p_profile: t!.id, p_full_name: 'Fen Öğretmeni Test', p_branch: 'Fizik' })).error).toBeNull()
    const { data: t2 } = await svc.from('profiles').select('full_name, branch').eq('id', t!.id).single()
    expect(t2).toEqual({ full_name: 'Fen Öğretmeni Test', branch: 'Fizik' })
    expect((await admin.rpc('admin_update_profile', { p_profile: t!.id, p_full_name: 'X Y Z', p_branch: 'Astroloji' })).error?.message).toMatch(/Branş/)
    const rehber = await signIn('rehber')
    expect((await rehber.rpc('admin_update_profile', { p_profile: t!.id, p_full_name: 'Deneme', p_branch: 'Fizik' })).error?.code).toBe('42501')
    await admin.rpc('admin_update_profile', { p_profile: t!.id, p_full_name: t!.full_name, p_branch: t!.branch })
  })

  it('hesap kapatılır (sınıf öğretmenliği boşalır), yeniden açılır; kendi hesabı kapatılamaz', async () => {
    const svc = service()
    const { data: t } = await svc.from('profiles').select('id').eq('email', 'fen@buluskure.k12.tr').single()
    const k = await freshClass(1)
    await admin.from('classes').update({ homeroom_teacher_id: t!.id }).eq('id', k.id)

    expect((await admin.rpc('set_user_active', { p_profile: t!.id, p_active: false })).error).toBeNull()
    expect((await svc.from('profiles').select('status').eq('id', t!.id).single()).data!.status).toBe('rejected')
    expect((await svc.from('classes').select('homeroom_teacher_id').eq('id', k.id).single()).data!.homeroom_teacher_id).toBeNull()
    // Kapalı hesap hiçbir öğrenciyi göremez
    const fen = await signIn('fen')
    expect((await fen.from('students').select('id')).data ?? []).toEqual([])

    expect((await admin.rpc('set_user_active', { p_profile: t!.id, p_active: true })).error).toBeNull()
    expect((await svc.from('profiles').select('status').eq('id', t!.id).single()).data!.status).toBe('approved')

    const { data: me } = await admin.auth.getUser()
    expect((await admin.rpc('set_user_active', { p_profile: me.user!.id, p_active: false })).error?.message).toMatch(/Kendi hesabını/)
    await admin.rpc('delete_class', { p_class: k.id })
  })
})
