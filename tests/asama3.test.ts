// Aşama 3: deneme yayınlama ve geri alma (publish_exam / unpublish_exam) veritabanında.
import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import type { SupabaseClient } from '@supabase/supabase-js'
import { service, signIn, snap, notesOf, ELIF } from './helpers'
import { buildPayload, buildReview, type DkPack, type PublishPayload } from '../src/lib/deneme'

// @ts-expect-error — motor saf JS
const eng = await import('../public/engine/parser.mjs')
const cat = JSON.parse(readFileSync(new URL('../public/engine/catalog.json', import.meta.url), 'utf8')).outcomes

let rehber: SupabaseClient
let payload: PublishPayload
const today = new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10)

beforeAll(async () => {
  rehber = await signIn('rehber')
  const pack: DkPack = eng.importPack(JSON.parse(readFileSync(new URL('../public/ornek/ornek-deneme.json', import.meta.url), 'utf8')), cat)
  const { data: roster } = await service().from('students').select('id, full_name, class_name, school_no')
  const rv = buildReview(pack, roster!)
  rv.rows.find((r) => r.read.name === 'BORA TAN')!.choice = { kind: 'new', class_name: '8/C' }
  rv.rows.find((r) => r.read.name === 'MERT DEMİR')!.subjectIssues[0]!.choice = 'fix'
  rv.failedPages.forEach((f) => (f.skip = true))
  payload = { ...buildPayload(rv, { name: 'TG-6 (test)', publisher: 'Hız Yayınları', exam_date: today, notify: true }), sha256: `test-${Date.now()}` }
})

describe('Deneme yayınla', () => {
  it('branş öğretmeni, veli ve öğrenci yayınlayamaz', async () => {
    for (const who of ['matematik', 'veliElif', 'elif'] as const) {
      const c = await signIn(who)
      expect((await c.rpc('publish_exam', { p: payload })).error?.code, who).toBe('42501')
    }
  })

  it('sunucu sonuç kurallarını yeniden doğrular (D+Y+B, net), gelecek tarih reddedilir', async () => {
    const bad = structuredClone(payload)
    bad.sha256 = `bad-${Date.now()}`
    bad.results[0]!.subjects.MAT = { d: 10, y: 5, b: 1, net: 8.33 }
    expect((await rehber.rpc('publish_exam', { p: bad })).error?.message).toMatch(/soru sayısını tutmuyor: MAT/)
    bad.results[0]!.subjects.MAT = { d: 10, y: 6, b: 4, net: 9 }
    expect((await rehber.rpc('publish_exam', { p: bad })).error?.message).toMatch(/Net, doğru − yanlış\/3 ile tutmuyor: MAT/)
    const fut = { ...structuredClone(payload), sha256: `fut-${Date.now()}`, exam_date: '2099-01-01' }
    expect((await rehber.rpc('publish_exam', { p: fut })).error?.message).toBe('Deneme tarihi bugünden sonra olamaz.')
    // hiçbir şey yazılmadı (transaction)
    const { count } = await service().from('exams').select('id', { count: 'exact', head: true }).in('source_sha256', [bad.sha256, fut.sha256])
    expect(count).toBe(0)
  })

  it('yayınlar: sonuçlar, anahtar, yeni öğrenci; veli/öğrenci ve admin bildirimi; aynı dosya ikinci kez yeni kayıt açmaz', async () => {
    const before = await snap()
    const { data: id, error } = await rehber.rpc('publish_exam', { p: payload })
    expect(error).toBeNull()
    const { data: again } = await rehber.rpc('publish_exam', { p: payload })
    expect(again).toBe(id)

    const svc = service()
    const { data: res } = await svc.from('exam_results').select('student_id, subjects, outcomes_ok, score').eq('exam_id', id)
    expect(res).toHaveLength(9)
    expect((await svc.from('exam_questions').select('q_no', { count: 'exact', head: true }).eq('exam_id', id)).count).toBe(90)
    const { data: bora } = await svc.from('students').select('id, full_name, class_name, school_no').eq('school_no', '1299').single()
    expect(bora).toMatchObject({ full_name: 'Bora Tan', class_name: '8/C' })
    const elif = res!.find((r) => r.student_id === ELIF)!
    expect(elif.outcomes_ok).toBe(true)

    const veli = await signIn('veliElif')
    expect(await notesOf(veli, before)).toContain('TG-6 (test) sonucu yayınlandı: Elif Yıldız')
    const { data: adminN } = await svc.from('notifications').select('id, text').eq('user_id', '00000000-0000-4000-8003-000000000001')
    expect(adminN!.filter((n) => !before.has(n.id)).map((n) => n.text)).toContain('TG-6 (test) yayınlandı (9 öğrenci)')

    // veli yalnız kendi çocuğunun yeni sonucunu görür
    const { data: vr } = await veli.from('exam_results').select('student_id').eq('exam_id', id)
    expect(vr).toEqual([{ student_id: ELIF }])
  })

  it('7 gün içinde geri alınır (yeni açılan öğrenci de silinir); 7 gün sonra alınamaz', async () => {
    const svc = service()
    const { data: ex } = await svc.from('exams').select('id').eq('source_sha256', payload.sha256).single()
    const mat = await signIn('matematik')
    expect((await mat.rpc('unpublish_exam', { p_exam: ex!.id })).error?.code).toBe('42501')

    // 8 gün önce yayınlanmış gibi
    await svc.from('exams').update({ published_at: new Date(Date.now() - 8 * 86400_000).toISOString() }).eq('id', ex!.id)
    expect((await rehber.rpc('unpublish_exam', { p_exam: ex!.id })).error?.message).toBe('Yayından 7 gün geçti; deneme artık geri alınamaz.')
    await svc.from('exams').update({ published_at: new Date().toISOString() }).eq('id', ex!.id)

    expect((await rehber.rpc('unpublish_exam', { p_exam: ex!.id })).error).toBeNull()
    expect((await svc.from('exams').select('id').eq('id', ex!.id)).data).toEqual([])
    expect((await svc.from('exam_results').select('student_id').eq('exam_id', ex!.id)).data).toEqual([])
    expect((await svc.from('students').select('id').eq('school_no', '1299')).data).toEqual([])
  })
})
