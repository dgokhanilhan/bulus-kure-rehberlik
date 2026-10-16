// 0047: 8. sınıf (LGS) eşleşmeyen sorular Eşleşmeyen hedefler kuyruğuna (exam_items, kitapçık başına) yazılır; sonuçlar değişmez.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { readFileSync } from 'node:fs'
import type { SupabaseClient } from '@supabase/supabase-js'
import { service, signIn, signInAdminAal2 } from './helpers'
import { buildPayload, buildReview, type DkPack, type PublishPayload } from '../src/lib/deneme'

// @ts-expect-error — motor saf JS
const eng = await import('../public/engine/parser.mjs')
const cat = JSON.parse(readFileSync(new URL('../public/engine/catalog.json', import.meta.url), 'utf8')).outcomes
const svc = service()
const stamp = Date.now()
const today = new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10)

let rehber: SupabaseClient
let payload: PublishPayload
let exam = ''
let pdfVersionsBefore: string[] = []

beforeAll(async () => {
  rehber = await signIn('rehber')
  pdfVersionsBefore = ((await svc.from('curriculum_versions').select('id').eq('curriculum_type', 'PDF')).data ?? []).map((v) => v.id)
  const pack: DkPack = eng.importPack(JSON.parse(readFileSync(new URL('../public/ornek/ornek-deneme.json', import.meta.url), 'utf8')), cat)
  // İngilizce 1. soru: PDF'teki kod resmî listede yok → güvenilir eşleşme yok (uydurulmaz), kuyruğa gider
  for (const r of pack.records)
    for (const q of r.questions)
      if (q.subject === 'ING' && q.number === 1)
        Object.assign(q, { officialOutcomeCode: null, outcomeMatchMethod: 'UNVERIFIED', sourceOutcomeCode: `E.8.9.${stamp % 1000}`, sourceOutcomeText: `Yayının kendi hedefi ${stamp}` })
  const { data: roster } = await svc.from('students').select('id, full_name, class_name, school_no')
  const rv = buildReview(pack, roster!)
  rv.rows.find((r) => r.read.name === 'BORA TAN')!.choice = { kind: 'skip' }
  rv.rows.find((r) => r.read.name === 'MERT DEMİR')!.subjectIssues[0]!.choice = 'fix'
  rv.failedPages.forEach((f) => (f.skip = true))
  payload = { ...buildPayload(rv, { name: `LGS eşleşmeyen ${stamp}`, publisher: 'Hız Yayınları', exam_date: today, notify: false }), sha256: `lgs-un-${stamp}` }
})

afterAll(async () => {
  if (exam) await svc.from('exams').delete().eq('id', exam)
  const lo = (await svc.from('learning_outcomes').select('id').eq('title', `Yayının kendi hedefi ${stamp}`)).data ?? []
  if (lo.length) await svc.from('learning_outcomes').delete().in('id', lo.map((x) => x.id))
  // Bu testin açtığı PDF sürümü (yayıncısız, 8. sınıf İngilizce) — sonraki testleri etkilemesin
  const created = ((await svc.from('curriculum_versions').select('id').eq('curriculum_type', 'PDF')).data ?? []).map((v) => v.id).filter((id) => !pdfVersionsBefore.includes(id))
  if (created.length) await svc.from('curriculum_versions').delete().in('id', created)
})

describe('8. sınıf eşleşmeyen hedefler (add_lgs_unresolved_items)', () => {
  it('yayın verisi eşleşmeyen soruyu ayırır; publish_exam yalnız sonucu yazar', async () => {
    expect(payload.unresolved).toEqual([
      { subject: 'ING', booklet: 'A', q_no: 1, correct_answer: payload.questions.find((q) => q.subject === 'ING' && q.q_no === 1)!.correct_answer, raw_code: `E.8.9.${stamp % 1000}`, raw_text: `Yayının kendi hedefi ${stamp}` },
    ])
    const { unresolved: _u, ...p } = payload
    const { data, error } = await rehber.rpc('publish_exam', { p })
    expect(error).toBeNull()
    exam = data as string
    expect((await svc.from('exam_items').select('q_no', { count: 'exact', head: true }).eq('exam_id', exam)).count).toBe(0)
  })

  it('branş öğretmeni ve veli kuyruğa yazamaz; geçersiz soru reddedilir', async () => {
    for (const who of ['matematik', 'veliElif'] as const)
      expect((await (await signIn(who)).rpc('add_lgs_unresolved_items', { p_exam: exam, p_items: payload.unresolved })).error?.code, who).toBe('42501')
    expect((await rehber.rpc('add_lgs_unresolved_items', { p_exam: exam, p_items: [{ subject: 'ING', booklet: 'A', q_no: 11, raw_code: 'X' }] })).error?.code).toBe('22023')
    expect((await rehber.rpc('add_lgs_unresolved_items', { p_exam: exam, p_items: [{ subject: 'XYZ', booklet: 'A', q_no: 1, raw_code: 'X' }] })).error?.code).toBe('22023')
  })

  it('kitapçık başına yazar, tekrar çağrı yeni satır açmaz; ekranda görünür; sonuçlar değişmez', async () => {
    const before = (await svc.from('exam_results').select('student_id, subjects, score, answers, kazanim, outcomes_ok').eq('exam_id', exam).order('student_id')).data
    const items = [...payload.unresolved, { ...payload.unresolved[0]!, booklet: 'B', q_no: 7, correct_answer: 'C' }]
    const first = await rehber.rpc('add_lgs_unresolved_items', { p_exam: exam, p_items: items })
    expect(first.error).toBeNull()
    expect(first.data).toBe(2)
    expect((await rehber.rpc('add_lgs_unresolved_items', { p_exam: exam, p_items: items })).data).toBe(0)
    const rows = (await rehber.from('unresolved_outcomes').select('section_key, q_no, booklet, raw_code, raw_text, grade, exam_type').eq('exam_id', exam).order('booklet')).data!
    expect(rows.map((r) => [r.section_key, r.q_no, r.booklet, r.grade, r.exam_type])).toEqual([
      ['ING', 1, 'A', 8, 'LGS'],
      ['ING', 7, 'B', 8, 'LGS'],
    ])
    expect((await svc.from('exam_results').select('student_id, subjects, score, answers, kazanim, outcomes_ok').eq('exam_id', exam).order('student_id')).data).toEqual(before)
  })

  it('yönetici B kitapçığındaki soruyu PDF hedefi olarak ekler; yalnız o kitapçığın sorusu bağlanır', async () => {
    const admin = await signInAdminAal2()
    const r = await admin.rpc('add_pdf_outcomes', { p_items: [{ exam_id: exam, section_key: 'ING', q_no: 7, booklet: 'B', grade: 8, outcome_type: 'KAZANIM' }] })
    expect(r.error).toBeNull()
    expect(r.data[0].status).toBe('created')
    const items = (await svc.from('exam_items').select('q_no, booklet, learning_outcome_id').eq('exam_id', exam).order('booklet')).data!
    expect(items.find((i) => i.booklet === 'B')!.learning_outcome_id).not.toBeNull()
    expect(items.find((i) => i.booklet === 'A')!.learning_outcome_id).toBeNull() // A kitapçığının 1. sorusu hâlâ kuyrukta
  })
})
