// 0091: Yaklaşan deneme. Yalnız rehberlik/yönetim ekler; takvimdeki denemeye bağlanır ya da yeni etkinlik açılır; konu listesini
// etkinliği görebilen herkes görür, göremeyen hiçbir şey alamaz; güvenilir olmayan kazanım saklanmaz; mevcut sonuçlar değişmez.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { service, signIn } from './helpers'

const svc = service()
let rehber: SupabaseClient, mat: SupabaseClient, veliElif: SupabaseClient, veliKerem: SupabaseClient, elif: SupabaseClient
let c8A = '',
  c8B = ''
const AD = 'Test Yaklaşan'
const temizle = async () => {
  await svc.from('yaklasan_denemeler').delete().like('name', `${AD}%`)
  await svc.from('calendar_events').delete().like('title', `${AD}%`)
}
const soru = (subject: string, q_no: number, outcome_code: string | null, match = 'code_exact') => ({
  subject,
  q_no,
  q_b: q_no + 1,
  konu: `Konu ${subject}${q_no}`,
  raw_code: outcome_code,
  raw_text: 'metin',
  outcome_code,
  match,
})
const kaydet = (c: SupabaseClient, ad: string, takvim: Record<string, unknown>, items = [soru('MAT', 1, 'M.8.1.1.1'), soru('MAT', 2, 'M.8.1.1.2')]) =>
  c.rpc('yaklasan_deneme_kaydet', { p: { name: ad, exam_date: '2026-11-26', grade: 8, source_name: 'liste.xlsx', items, takvim } })

beforeAll(async () => {
  ;[rehber, mat, veliElif, veliKerem, elif] = await Promise.all([
    signIn('rehber'),
    signIn('matematik'),
    signIn('veliElif'),
    signIn('veliKerem'),
    signIn('elif'),
  ])
  c8A = (await svc.from('classes').select('id').eq('name', '8/A').single()).data!.id
  c8B = (await svc.from('classes').select('id').eq('name', '8/B').single()).data!.id
  await temizle()
})
afterAll(temizle)

describe('yaklaşan deneme', () => {
  it('rehberlik ekler; takvime 8/A için deneme açılır; güvenilir olmayan ya da başka derse ait kazanım saklanmaz', async () => {
    const once = (await svc.from('exam_results').select('exam_id, student_id, subjects, kazanim').order('exam_id').order('student_id')).data
    const { data: id, error } = await kaydet(rehber, `${AD} 1`, { mode: 'yeni', target: 'sinif', level: 'ortaokul', class_ids: [c8A] }, [
      soru('MAT', 1, 'M.8.1.1.1'),
      soru('MAT', 2, 'M.8.1.1.2', 'semantic'), // güvenilir değil
      soru('FEN', 1, 'M.8.1.1.1'), // başka dersin kodu
      soru('ING', 1, null, 'none'),
    ])
    expect(error).toBeNull()
    const y = (await svc.from('yaklasan_denemeler').select('calendar_event_id, school_id').eq('id', id).single()).data!
    const ev = (await svc.from('calendar_events').select('title, type, target, class_id, class_ids, starts_on').eq('id', y.calendar_event_id).single()).data!
    expect(ev).toMatchObject({ title: `${AD} 1`, type: 'deneme', target: 'sinif', class_id: c8A, class_ids: [c8A], starts_on: '2026-11-26' })
    const s = (await svc.from('yaklasan_deneme_sorulari').select('subject, q_no, outcome_code, match').eq('deneme_id', id).order('subject').order('q_no')).data
    expect(s).toHaveLength(4)
    expect(s).toEqual(
      expect.arrayContaining([
        { subject: 'MAT', q_no: 1, outcome_code: 'M.8.1.1.1', match: 'code_exact' },
        { subject: 'MAT', q_no: 2, outcome_code: null, match: 'none' },
        { subject: 'FEN', q_no: 1, outcome_code: null, match: 'none' },
        { subject: 'ING', q_no: 1, outcome_code: null, match: 'none' },
      ]),
    )
    expect((await svc.from('exam_results').select('exam_id, student_id, subjects, kazanim').order('exam_id').order('student_id')).data).toEqual(once)
  })

  it('etkinliği gören veli ve öğrenci konuları görür; göremeyen veli hiçbir şey alamaz; ham metin dönmez', async () => {
    const ev = (await svc.from('calendar_events').select('id').eq('title', `${AD} 1`).single()).data!.id
    for (const c of [veliElif, elif, rehber]) {
      const k = (await c.rpc('yaklasan_deneme_konulari', { p_event: ev })).data as { ad: string; sorular: Record<string, unknown>[] }
      expect(k.ad).toBe(`${AD} 1`)
      expect(k.sorular).toHaveLength(4)
      expect(Object.keys(k.sorular[0]!).sort()).toEqual(['ders', 'kod', 'konu', 'no'])
    }
    expect((await veliKerem.rpc('yaklasan_deneme_konulari', { p_event: ev })).data).toBeNull() // Kerem 8/B
  })

  it('öğretmen, veli ve öğrenci ekleyemez ve tabloları doğrudan okuyamaz', async () => {
    for (const c of [mat, veliElif, elif]) {
      expect((await kaydet(c, `${AD} yetkisiz`, { mode: 'yeni', target: 'okul' })).error?.code).toBe('42501')
      expect((await c.from('yaklasan_denemeler').select('id')).data).toEqual([])
      expect((await c.from('yaklasan_deneme_sorulari').select('deneme_id')).data).toEqual([])
    }
    expect((await mat.rpc('yaklasan_deneme_bagla', { p_id: '00000000-0000-0000-0000-000000000000', p_exam: null })).error?.code).toBe('42501')
  })

  it('takvimdeki var olan denemeye bağlanır; aynı etkinliğe ikinci liste bağlanamaz', async () => {
    const { data: ev } = await svc
      .from('calendar_events')
      .insert({
        school_id: (await svc.from('classes').select('school_id').eq('id', c8B).single()).data!.school_id,
        title: `${AD} takvim`,
        type: 'deneme',
        starts_on: '2026-11-27',
        ends_on: '2026-11-27',
        target: 'sinif',
        class_id: c8B,
      })
      .select('id')
      .single()
    const { data: id, error } = await kaydet(rehber, `${AD} 2`, { mode: 'bagla', event_id: ev!.id })
    expect(error).toBeNull()
    expect((await svc.from('yaklasan_denemeler').select('calendar_event_id').eq('id', id).single()).data!.calendar_event_id).toBe(ev!.id)
    expect((await kaydet(rehber, `${AD} 3`, { mode: 'bagla', event_id: ev!.id })).error?.code).toBe('23505')
    expect(((await veliKerem.rpc('yaklasan_deneme_konulari', { p_event: ev!.id })).data as { ad: string }).ad).toBe(`${AD} 2`)
    expect((await veliElif.rpc('yaklasan_deneme_konulari', { p_event: ev!.id })).data).toBeNull()
  })

  it('sonuç yüklenince denemeye bağlanır; liste silinince takvim etkinliği kalır', async () => {
    const id = (await svc.from('yaklasan_denemeler').select('id, calendar_event_id').eq('name', `${AD} 2`).single()).data!
    const exam = (await svc.from('exams').select('id').limit(1).single()).data!.id
    expect((await rehber.rpc('yaklasan_deneme_bagla', { p_id: id.id, p_exam: exam })).error).toBeNull()
    expect((await svc.from('yaklasan_denemeler').select('exam_id').eq('id', id.id).single()).data!.exam_id).toBe(exam)
    expect((await rehber.rpc('yaklasan_deneme_bagla', { p_id: id.id, p_exam: null })).error).toBeNull()
    expect((await rehber.from('yaklasan_denemeler').delete().eq('id', id.id)).error).toBeNull()
    expect((await svc.from('yaklasan_deneme_sorulari').select('deneme_id').eq('deneme_id', id.id)).data).toEqual([])
    expect((await svc.from('calendar_events').select('id').eq('id', id.calendar_event_id)).data).toHaveLength(1)
  })
})
