// 0081 deneme konularını gizle, 0082 haftalık lig kürsüsü (skorlar değişmez), 0083 profil avatarı.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { service, signIn, snap, notesOf, REHBER_ID } from './helpers'

let rehber: SupabaseClient, mat: SupabaseClient, fen: SupabaseClient, veli: SupabaseClient, elif: SupabaseClient
const svc = service()
const HAFTA = '2025-01-06' // geçmiş bir pazartesi: canlı lig testleriyle karışmaz
beforeAll(async () => {
  ;[rehber, mat, fen, veli, elif] = await Promise.all([signIn('rehber'), signIn('matematik'), signIn('fen'), signIn('veliElif'), signIn('elif')])
})

describe('Deneme konularını gizle', () => {
  let examId: string
  afterAll(async () => {
    if (examId) await svc.from('exams').update({ topics_hidden: false }).eq('id', examId)
  })
  it('rehber gizler ve geri açar; veli, öğrenci ve branş öğretmeni değiştiremez; puanlar aynen kalır', async () => {
    const { data: e } = await svc.from('exams').select('id, school_id').limit(1).single()
    examId = e!.id
    const once = (await svc.from('exam_results').select('student_id, score, subjects').eq('exam_id', examId).order('student_id')).data
    for (const c of [veli, elif, mat]) expect((await c.rpc('set_exam_topics_hidden', { p_exam: examId, p_hidden: true })).error).not.toBeNull()
    expect((await svc.from('exams').select('topics_hidden').eq('id', examId).single()).data!.topics_hidden).toBe(false)
    expect((await rehber.rpc('set_exam_topics_hidden', { p_exam: examId, p_hidden: true })).error).toBeNull()
    expect((await rehber.from('exams').select('topics_hidden').eq('id', examId).single()).data!.topics_hidden).toBe(true)
    const sonra = (await svc.from('exam_results').select('student_id, score, subjects').eq('exam_id', examId).order('student_id')).data
    expect(sonra).toEqual(once)
    expect((await rehber.rpc('set_exam_topics_hidden', { p_exam: examId, p_hidden: false })).error).toBeNull()
    expect((await svc.from('exams').select('topics_hidden').eq('id', examId).single()).data!.topics_hidden).toBe(false)
  })
})

describe('Haftalık lig kürsüsü', () => {
  let ids: Record<string, string>
  let okul: string
  const temizle = async () => {
    await svc.from('oda_lig_kursu').delete().eq('hafta', HAFTA)
    await svc.from('oda_oyun').delete().gte('gun', HAFTA).lte('gun', '2025-01-12')
  }
  beforeAll(async () => {
    const { data } = await svc
      .from('profiles')
      .select('id, email, school_id')
      .in('email', ['rehber@buluskure.k12.tr', 'matematik@buluskure.k12.tr', 'fen@buluskure.k12.tr'])
    ids = Object.fromEntries(data!.map((p) => [p.email, p.id]))
    okul = data![0]!.school_id
    await temizle()
  })
  afterAll(temizle)

  it('hafta bitince ilk üç kürsüye yazılır; skorlar değişmez; öğretmen görür, veli göremez; ikinci çalıştırma bir şey değiştirmez', async () => {
    const R = ids['rehber@buluskure.k12.tr']!,
      M = ids['matematik@buluskure.k12.tr']!,
      F = ids['fen@buluskure.k12.tr']!
    const satir = (user_id: string, oyun: string, gun: string, puan: number) => ({ school_id: okul, user_id, oyun, gun, puan, bitti: `${gun}T10:00:00Z` })
    // Sudoku: M 1. (10), R 2. (8), F 3. (6) · Kelime: R 1. (10), M 2. (8) → R 18, M 18, F 6
    const ek = await svc
      .from('oda_oyun')
      .insert([
        satir(M, 'sudoku', HAFTA, 300),
        satir(R, 'sudoku', HAFTA, 400),
        satir(F, 'sudoku', HAFTA, 500),
        satir(R, 'kelime', '2025-01-07', 2),
        satir(M, 'kelime', '2025-01-07', 3),
      ])
    expect(ek.error).toBeNull()
    const skorOnce = (await svc.from('oda_oyun').select('id, user_id, oyun, gun, puan, bitti').order('id')).data

    const t0 = await snap()
    const { data: n, error } = await svc.rpc('oda_lig_kursu_yaz', { p_hafta: HAFTA, p_bildir: true })
    expect(error).toBeNull()
    expect(n).toBe(3)
    const { data: k } = await mat.from('oda_lig_kursu').select('user_id, sira, puan').eq('hafta', HAFTA).order('sira').order('user_id')
    expect(k).toEqual(
      [
        { user_id: R, sira: 1, puan: 18 },
        { user_id: M, sira: 1, puan: 18 },
        { user_id: F, sira: 3, puan: 6 },
      ].sort((a, b) => a.sira - b.sira || a.user_id.localeCompare(b.user_id)),
    )
    expect(await notesOf(fen, t0)).toContain('Tebrikler! Haftalık ligi 3. bitirdin; adın panoda kürsüde 🏆')
    expect((await veli.from('oda_lig_kursu').select('user_id').eq('hafta', HAFTA)).data ?? []).toHaveLength(0)
    // Doğrudan yazılamaz
    expect((await rehber.from('oda_lig_kursu').insert({ school_id: okul, hafta: HAFTA, user_id: REHBER_ID, sira: 1, ad: 'x', puan: 99 })).error).not.toBeNull()
    expect((await rehber.rpc('oda_lig_kursu_yaz', { p_hafta: HAFTA, p_bildir: false })).error).not.toBeNull()

    expect((await svc.rpc('oda_lig_kursu_yaz', { p_hafta: HAFTA, p_bildir: true })).data).toBe(0)
    expect((await svc.from('oda_oyun').select('id, user_id, oyun, gun, puan, bitti').order('id')).data).toEqual(skorOnce)
  })
})

describe('Profil avatarı', () => {
  afterAll(async () => {
    await svc.from('profiles').update({ avatar: null }).not('avatar', 'is', null)
  })
  it('kişi yalnız kendi avatarını seçer; biçim denetlenir', async () => {
    expect((await rehber.rpc('avatar_kaydet', { p_avatar: 'tilki' })).error).toBeNull()
    expect((await svc.from('profiles').select('avatar').eq('id', REHBER_ID).single()).data!.avatar).toBe('tilki')
    expect((await rehber.rpc('avatar_kaydet', { p_avatar: '<script>' })).error).not.toBeNull()
    await mat.rpc('avatar_kaydet', { p_avatar: 'panda' })
    expect((await svc.from('profiles').select('avatar').eq('id', REHBER_ID).single()).data!.avatar).toBe('tilki')
    expect((await rehber.rpc('avatar_kaydet', { p_avatar: null })).error).toBeNull()
    expect((await svc.from('profiles').select('avatar').eq('id', REHBER_ID).single()).data!.avatar).toBeNull()
  })
})
