// Faz A (0011–0012): ayarlar, modül aç/kapat, eğitim yılları, ders kataloğu, dinamik ders saatleri, atamalar.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { service, signIn, signInAdminAal2, ELIF } from './helpers'

const SCHOOL = '00000000-0000-4000-8000-000000000001'
let admin: SupabaseClient
const svc = service()
const idOf = async (email: string) => (await svc.from('profiles').select('id').eq('email', email).single()).data!.id as string
const classId = async (name: string) => (await svc.from('classes').select('id').eq('name', name).single()).data!.id as string
const courseId = async (name: string) => (await svc.from('courses').select('id').eq('name', name).single()).data!.id as string

beforeAll(async () => {
  admin = await signInAdminAal2()
})
afterAll(async () => {
  // Modülleri varsayılana döndür
  await svc.from('school_settings').delete().like('key', 'modul.%')
})

describe('Ayarlar', () => {
  it('yalnız yönetici değiştirir; tür ve sınır doğrulanır; işlem kaydı tutulur', async () => {
    const rehber = await signIn('rehber')
    expect((await rehber.rpc('set_settings', { p: { 'genel.telefon': '0212' } })).error?.code).toBe('42501')
    expect((await admin.rpc('set_settings', { p: { 'bilinmeyen.ayar': 1 } })).error?.message).toMatch(/Bilinmeyen ayar/)
    expect((await admin.rpc('set_settings', { p: { 'modul.yemek': 'evet' } })).error?.message).toMatch(/açık\/kapalı/)
    // Aynı değer yeniden yazılırsa işlem kaydı oluşmaz; önceki yerel testten bağımsız bir değişiklik yap.
    expect((await admin.rpc('set_settings', { p: { 'genel.telefon': '0212 111 11 11' } })).error).toBeNull()
    expect((await admin.rpc('set_settings', { p: { 'genel.telefon': '0212 000 00 00' } })).error).toBeNull()
    const { data } = await svc.from('audit_log').select('meta').eq('action', 'settings').order('id', { ascending: false }).limit(1).single()
    expect(data!.meta).toMatchObject({ 'genel.telefon': { yeni: '0212 000 00 00' } })
    // Veli de okuyabilir (modül durumları menüyü belirler), yazamaz
    const veli = await signIn('veliElif')
    expect((await veli.from('school_settings').select('value').eq('key', 'genel.telefon').single()).data!.value).toBe('0212 000 00 00')
    expect((await veli.from('school_settings').upsert({ school_id: SCHOOL, key: 'genel.telefon', value: '"x"' })).error).not.toBeNull()
  })

  it('okul adı değişince schools tablosu da güncellenir', async () => {
    const { data: s } = await svc.from('schools').select('name').eq('id', SCHOOL).single()
    expect((await admin.rpc('set_settings', { p: { 'genel.okul_adi': 'Buluş Küre Koleji Test' } })).error).toBeNull()
    expect((await svc.from('schools').select('name').eq('id', SCHOOL).single()).data!.name).toBe('Buluş Küre Koleji Test')
    await admin.rpc('set_settings', { p: { 'genel.okul_adi': s!.name } })
  })
})

describe('Modül aç/kapat', () => {
  it('yemek kapalıyken veli okuyamaz, yönetici okur; açılınca geri gelir', async () => {
    const veli = await signIn('veliElif')
    expect(((await veli.from('meals').select('id')).data ?? []).length).toBeGreaterThan(0)
    await admin.rpc('set_settings', { p: { 'modul.yemek': false } })
    expect((await veli.from('meals').select('id')).data ?? []).toEqual([])
    expect(((await admin.from('meals').select('id')).data ?? []).length).toBeGreaterThan(0)
    expect((await veli.rpc('module_enabled', { p_module: 'yemek' })).data).toBe(false)
    await admin.rpc('set_settings', { p: { 'modul.yemek': true } })
    expect(((await veli.from('meals').select('id')).data ?? []).length).toBeGreaterThan(0)
  })

  it('mesajlaşma kapalıyken fonksiyonla da mesaj gönderilemez', async () => {
    const veli = await signIn('veliElif')
    const mat = await idOf('matematik@buluskure.k12.tr')
    const { data: conv } = await veli.rpc('start_conversation', { p_student: ELIF, p_other: mat })
    await admin.rpc('set_settings', { p: { 'modul.mesaj': false } })
    expect((await veli.rpc('send_message', { p_conversation: conv, p_body: 'kapalıyken' })).error?.message).toMatch(/modül/)
    await admin.rpc('set_settings', { p: { 'modul.mesaj': true } })
    expect((await veli.rpc('send_message', { p_conversation: conv, p_body: 'açıkken' })).error).toBeNull()
    await svc.from('conversations').delete().eq('id', conv)
  })

  it('LGS kapalıyken rehber deneme sonuçlarını göremez', async () => {
    const rehber = await signIn('rehber')
    expect(((await rehber.from('exam_results').select('student_id').limit(1)).data ?? []).length).toBe(1)
    await admin.rpc('set_settings', { p: { 'modul.lgs': false } })
    expect((await rehber.from('exam_results').select('student_id').limit(1)).data ?? []).toEqual([])
    await admin.rpc('set_settings', { p: { 'modul.lgs': true } })
  })
})

describe('Eğitim yılları', () => {
  it('başlangıçta aktif bir yıl var; yenisi aktif yapılınca eskisi pasif olur; tarih sırası doğrulanır', async () => {
    const { data: years } = await admin.from('academic_years').select('id, name, is_active')
    const active = years!.find((y) => y.is_active)!
    expect(active).toBeTruthy()
    expect((await admin.from('academic_years').insert({ school_id: SCHOOL, name: '2030-2031', starts: '2030-09-08', term1_ends: '2030-06-01', term2_starts: '2031-02-01', ends: '2031-06-20' })).error).not.toBeNull()
    const { data: y } = await admin.from('academic_years').insert({ school_id: SCHOOL, name: '2030-2031', starts: '2030-09-08', term1_ends: '2031-01-20', term2_starts: '2031-02-03', ends: '2031-06-20', is_active: true }).select('id').single()
    expect((await svc.from('academic_years').select('is_active').eq('id', active.id).single()).data!.is_active).toBe(false)
    await admin.from('academic_years').update({ is_active: true }).eq('id', active.id)
    await svc.from('academic_years').delete().eq('id', y!.id)
    expect((await (await signIn('matematik')).from('academic_years').insert({ school_id: SCHOOL, name: '2031-2032', starts: '2031-09-08', term1_ends: '2032-01-20', term2_starts: '2032-02-03', ends: '2032-06-20' })).error).not.toBeNull()
  })
})

describe('Ders kataloğu ve ders programı', () => {
  it('mevcut programdaki dersler kataloğa bağlandı; ders yalnız yöneticiyle eklenir; aynı ad iki kez olmaz', async () => {
    const { count } = await svc.from('timetable').select('id', { count: 'exact', head: true }).is('course_id', null)
    expect(count).toBe(0)
    expect((await (await signIn('rehber')).from('courses').insert({ school_id: SCHOOL, name: 'Robotik', short_name: 'rob' })).error).not.toBeNull()
    const { data: c, error } = await admin.from('courses').insert({ school_id: SCHOOL, name: ' Robotik ', short_name: 'rob', levels: ['ortaokul'] }).select('id, name, short_name').single()
    expect(error).toBeNull()
    expect(c).toMatchObject({ name: 'Robotik', short_name: 'ROB' })
    expect((await admin.from('courses').insert({ school_id: SCHOOL, name: 'robotik', short_name: 'R' })).error?.code).toBe('23505')
    expect((await admin.from('courses').insert({ school_id: SCHOOL, name: 'Uzay', short_name: 'UZ', levels: ['universite'] })).error).not.toBeNull()
    await svc.from('courses').delete().eq('id', c!.id)
  })

  it('programda ders seçilince ad katalogdan yazılır ve öğretmen ataması oluşur', async () => {
    const cls = await classId('6/A')
    const fizik = await courseId('Beden Eğitimi')
    const fen = await idOf('fen@buluskure.k12.tr')
    await svc.from('timetable').delete().eq('class_id', cls)
    const { data: row, error } = await admin.from('timetable').insert({ school_id: SCHOOL, class_id: cls, weekday: 1, period: 1, subject: 'x', course_id: fizik, teacher_id: fen }).select('id, subject').single()
    expect(error).toBeNull()
    expect(row!.subject).toBe('Beden Eğitimi')
    expect((await svc.from('teaching_assignments').select('id').eq('class_id', cls).eq('course_id', fizik).eq('teacher_id', fen)).data).toHaveLength(1)
    await svc.from('timetable').delete().eq('class_id', cls)
    await svc.from('teaching_assignments').delete().eq('class_id', cls)
  })
})

describe('Ders atamaları', () => {
  it('atama öğretmene o sınıfın velileriyle yazışma ve sınıf duyurusu yetkisi verir; kaldırılınca gider', async () => {
    const cls8B = await classId('8/B')
    const mat = await idOf('matematik@buluskure.k12.tr')
    const matC = await courseId('Matematik')
    const veliKerem = await idOf('kerem.veli@ornek.com')
    const KEREM = '00000000-0000-4000-8001-000000001201'
    const t = await signIn('matematik')
    expect(((await t.rpc('student_parents', { p_student: KEREM })).data ?? []) as unknown[]).toEqual([])
    expect((await (await signIn('rehber')).from('teaching_assignments').insert({ school_id: SCHOOL, class_id: cls8B, course_id: matC, teacher_id: mat })).error).not.toBeNull()
    const { data: a, error } = await admin.from('teaching_assignments').insert({ school_id: SCHOOL, class_id: cls8B, course_id: matC, teacher_id: mat }).select('id').single()
    expect(error).toBeNull()
    expect(((await t.rpc('student_parents', { p_student: KEREM })).data as { id: string }[]).map((x) => x.id)).toContain(veliKerem)
    const { data: log } = await svc.from('audit_log').select('action').eq('entity', 'teaching_assignments').eq('entity_id', a!.id)
    expect(log!.map((l) => l.action)).toEqual(['insert'])
    await admin.from('teaching_assignments').delete().eq('id', a!.id)
    expect(((await t.rpc('student_parents', { p_student: KEREM })).data ?? []) as unknown[]).toEqual([])
    const veli = await idOf('ayse.yildiz@ornek.com')
    expect((await admin.from('teaching_assignments').insert({ school_id: SCHOOL, class_id: cls8B, course_id: matC, teacher_id: veli })).error?.message).toMatch(/onaylı öğretmen/)
  })
})

describe('Dinamik ders saatleri', () => {
  it('9. ve sonraki ders saati eklenir; silinince sonrakiler kayar; yer değiştirince programdaki dersler de taşınır', async () => {
    const cls = await classId('8/A')
    const { data: n9 } = await admin.rpc('add_bell', { p_starts: '15:50', p_ends: '16:30' })
    const { data: n10 } = await admin.rpc('add_bell', { p_starts: '16:40', p_ends: '17:20' })
    expect([n9, n10]).toEqual([9, 10])
    expect((await (await signIn('rehber')).rpc('add_bell', { p_starts: '17:30', p_ends: '18:00' })).error?.code).toBe('42501')

    // 10. saate bir ders koy; 9'u sil → ders 9'a kayar
    await admin.from('timetable').insert({ school_id: SCHOOL, class_id: cls, weekday: 1, period: 10, subject: 'Satranç' })
    expect((await admin.rpc('delete_bell', { p_period: 9 })).error).toBeNull()
    const { data: moved } = await svc.from('timetable').select('period').eq('class_id', cls).eq('subject', 'Satranç').single()
    expect(moved!.period).toBe(9)
    // Dolu saat silinmez
    expect((await admin.rpc('delete_bell', { p_period: 9 })).error?.message).toMatch(/1 ders var/)

    // 8 ile 9'u yer değiştir: 1. gündeki 8. ders ile Satranç yer değiştirir
    const { data: before8 } = await svc.from('timetable').select('subject').eq('class_id', cls).eq('weekday', 1).eq('period', 8).single()
    expect((await admin.rpc('move_bell', { p_period: 9, p_up: true })).error).toBeNull()
    expect((await svc.from('timetable').select('subject').eq('class_id', cls).eq('weekday', 1).eq('period', 8).single()).data!.subject).toBe('Satranç')
    expect((await svc.from('timetable').select('subject').eq('class_id', cls).eq('weekday', 1).eq('period', 9).single()).data!.subject).toBe(before8!.subject)
    // Geri al ve temizle
    await admin.rpc('move_bell', { p_period: 8, p_up: false })
    await svc.from('timetable').delete().eq('class_id', cls).eq('subject', 'Satranç')
    await admin.rpc('delete_bell', { p_period: 9 })
    expect(((await svc.from('bell_times').select('period')).data ?? []).map((b) => b.period).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
  })
})
