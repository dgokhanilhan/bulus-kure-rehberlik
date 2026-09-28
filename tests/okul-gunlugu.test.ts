// Okul günlüğü (0009): yoklama, ders programı, ders saatleri, yemek listesi — yetkiler ve bildirim.
import { describe, it, expect, beforeAll } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { anon, notesOf, service, signIn, signInAdminAal2, snap, ELIF, KEREM } from './helpers'

const SCHOOL = '00000000-0000-4000-8000-000000000001'
const day = new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10)
let admin: SupabaseClient
let cls8A = ''

beforeAll(async () => {
  admin = await signInAdminAal2()
  cls8A = (await service().from('classes').select('id').eq('name', '8/A').single()).data!.id
  await service().from('attendance').delete().in('student_id', [ELIF, KEREM]).eq('day', day)
})

describe('Yoklama', () => {
  it('yalnız yönetici girer; rehber, branş öğretmeni, veli ve öğrenci giremez', async () => {
    for (const who of ['rehber', 'matematik', 'veliElif', 'elif'] as const) {
      const c = await signIn(who)
      const { error } = await c.from('attendance').insert({ school_id: SCHOOL, student_id: ELIF, day, status: 'devamsiz' })
      expect(error, who).not.toBeNull()
    }
  })

  it('gelmedi işaretlenince veli ve öğrenciye bildirim gider; aynı durum tekrar bildirim üretmez', async () => {
    const before = await snap()
    const { error } = await admin.from('attendance').upsert({ school_id: SCHOOL, student_id: ELIF, day, status: 'devamsiz' }, { onConflict: 'student_id,day' })
    expect(error).toBeNull()
    const veli = await signIn('veliElif')
    const dd = day.split('-').reverse().join('.')
    expect(await notesOf(veli, before)).toEqual([`Elif Yıldız ${dd} günü okula gelmedi.`])
    expect(await notesOf(await signIn('elif'), before)).toEqual([`Elif Yıldız ${dd} günü okula gelmedi.`])

    // Aynı durum yeniden kaydedilir: yeni bildirim yok; izinliye çevrilir: bildirim yok
    await admin.from('attendance').upsert({ school_id: SCHOOL, student_id: ELIF, day, status: 'devamsiz' }, { onConflict: 'student_id,day' })
    await admin.from('attendance').upsert({ school_id: SCHOOL, student_id: ELIF, day, status: 'izinli' }, { onConflict: 'student_id,day' })
    expect(await notesOf(veli, before)).toHaveLength(1)
  })

  it('veli ve öğrenci yalnız kendi kaydını görür; başka velinin çocuğu görünmez', async () => {
    await admin.from('attendance').upsert({ school_id: SCHOOL, student_id: KEREM, day, status: 'gec' }, { onConflict: 'student_id,day' })
    const veli = await signIn('veliElif')
    const { data } = await veli.from('attendance').select('student_id').eq('day', day)
    expect(data).toEqual([{ student_id: ELIF }])
    const elif = await signIn('elif')
    expect((await elif.from('attendance').select('student_id').eq('day', day)).data).toEqual([{ student_id: ELIF }])
    expect((await anon().from('attendance').select('id')).data ?? []).toEqual([])
    await service().from('attendance').delete().in('student_id', [ELIF, KEREM]).eq('day', day)
  })

  it('geçersiz durum reddedilir; öğrenci başına günde tek kayıt', async () => {
    expect((await admin.from('attendance').insert({ school_id: SCHOOL, student_id: ELIF, day, status: 'kacti' })).error).not.toBeNull()
    expect((await admin.from('attendance').insert({ school_id: SCHOOL, student_id: ELIF, day, status: 'izinli' })).error).toBeNull()
    expect((await admin.from('attendance').insert({ school_id: SCHOOL, student_id: ELIF, day, status: 'raporlu' })).error?.code).toBe('23505')
    await service().from('attendance').delete().eq('student_id', ELIF).eq('day', day)
  })
})

describe('Ders programı ve ders saatleri', () => {
  it('yönetici ekler; herkes (okuldaki) okur, yazamaz; aynı saate ikinci ders girmez', async () => {
    await service().from('timetable').delete().eq('class_id', cls8A).eq('weekday', 6)
    const { error } = await admin.from('timetable').insert({ school_id: SCHOOL, class_id: cls8A, weekday: 6, period: 9, subject: '  Satranç ' })
    expect(error).toBeNull()
    expect((await admin.from('timetable').insert({ school_id: SCHOOL, class_id: cls8A, weekday: 6, period: 9, subject: 'Resim' })).error?.code).toBe('23505')
    for (const who of ['veliElif', 'elif', 'matematik'] as const) {
      const c = await signIn(who)
      const { data } = await c.from('timetable').select('subject').eq('class_id', cls8A).eq('weekday', 6)
      expect(data, who).toEqual([{ subject: 'Satranç' }])
      expect((await c.from('timetable').insert({ school_id: SCHOOL, class_id: cls8A, weekday: 6, period: 10, subject: 'X' })).error, who).not.toBeNull()
    }
    expect((await anon().from('timetable').select('id')).data ?? []).toEqual([])
    await service().from('timetable').delete().eq('class_id', cls8A).eq('weekday', 6)
  })

  it('dersin öğretmeni okulun onaylı öğretmeni olmalı; hesabı kapanan öğretmen programdan düşer', async () => {
    const svc = service()
    const { data: fen } = await svc.from('profiles').select('id').eq('email', 'fen@buluskure.k12.tr').single()
    const { data: veli } = await svc.from('profiles').select('id').eq('role', 'veli').limit(1).single()
    expect((await admin.from('timetable').insert({ school_id: SCHOOL, class_id: cls8A, weekday: 6, period: 11, subject: 'Fen', teacher_id: veli!.id })).error?.message).toMatch(/onaylı öğretmen/)
    const { data: row } = await admin.from('timetable').insert({ school_id: SCHOOL, class_id: cls8A, weekday: 6, period: 11, subject: 'Fen', teacher_id: fen!.id }).select('id').single()
    await admin.rpc('set_user_active', { p_profile: fen!.id, p_active: false })
    expect((await svc.from('timetable').select('teacher_id').eq('id', row!.id).single()).data!.teacher_id).toBeNull()
    await admin.rpc('set_user_active', { p_profile: fen!.id, p_active: true })
    await svc.from('timetable').delete().eq('id', row!.id)
  })

  it('ders saati: bitiş başlangıçtan sonra olmalı; yalnız yönetici yazar', async () => {
    expect((await admin.from('bell_times').upsert({ school_id: SCHOOL, period: 12, starts: '17:00', ends: '16:00' })).error).not.toBeNull()
    expect((await admin.from('bell_times').upsert({ school_id: SCHOOL, period: 12, starts: '17:00', ends: '17:40' })).error).toBeNull()
    const veli = await signIn('veliElif')
    expect((await veli.from('bell_times').select('period').eq('period', 12)).data).toEqual([{ period: 12 }])
    expect((await veli.from('bell_times').upsert({ school_id: SCHOOL, period: 12, starts: '08:00', ends: '08:40' })).error).not.toBeNull()
    await service().from('bell_times').delete().eq('period', 12)
  })
})

describe('Yemek listesi', () => {
  it('yönetici girer; veli/öğrenci okur, yazamaz; gün ve öğün başına tek kayıt', async () => {
    const d = '2031-01-06'
    await service().from('meals').delete().eq('day', d)
    expect((await admin.from('meals').insert({ school_id: SCHOOL, day: d, meal: 'ogle', items: 'Mercimek çorbası, pilav' })).error).toBeNull()
    expect((await admin.from('meals').insert({ school_id: SCHOOL, day: d, meal: 'ogle', items: 'Başka' })).error?.code).toBe('23505')
    expect((await admin.from('meals').insert({ school_id: SCHOOL, day: d, meal: 'gece', items: 'X' })).error).not.toBeNull()
    for (const who of ['veliElif', 'elif'] as const) {
      const c = await signIn(who)
      expect((await c.from('meals').select('items').eq('day', d)).data, who).toEqual([{ items: 'Mercimek çorbası, pilav' }])
      expect((await c.from('meals').insert({ school_id: SCHOOL, day: d, meal: 'kahvalti', items: 'X' })).error, who).not.toBeNull()
    }
    await service().from('meals').delete().eq('day', d)
  })
})
