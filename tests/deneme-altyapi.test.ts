// Okul geneli deneme altyapısı (0025): mevcut LGS kayıtlarının korunması, taslak görünürlüğü, katalog bağlamı,
// müfredat sürümü seçimi ve yönetim tablolarının yetkileri.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { service, signIn, signInAdminAal2, ELIF, KEREM } from './helpers'

const svc = service()
let admin: SupabaseClient
let school = ''
const made: { exams: string[]; versions: string[]; publishers: string[] } = { exams: [], versions: [], publishers: [] }

beforeAll(async () => {
  admin = await signInAdminAal2()
  school = (await svc.from('schools').select('id').single()).data!.id
})
afterAll(async () => {
  if (made.exams.length) await svc.from('exams').delete().in('id', made.exams)
  if (made.versions.length) {
    await svc.from('learning_outcomes').delete().in('curriculum_version_id', made.versions)
    await svc.from('curriculum_versions').delete().in('id', made.versions)
  }
  if (made.publishers.length) await svc.from('publishers').delete().in('id', made.publishers)
})

describe('Mevcut LGS kayıtları', () => {
  it('eski denemeler 8. sınıf LGS ve yayında; kimlikler ve sonuçlar aynen', async () => {
    const { data } = await svc.from('exams').select('id, grade, exam_type, status, academic_year, published_at')
    expect(data!.length).toBeGreaterThan(0)
    for (const e of data!) {
      expect([e.grade, e.exam_type]).toEqual([8, 'LGS'])
      expect(e.status).toBe(e.published_at ? 'yayinda' : 'taslak')
      expect(e.academic_year).toMatch(/^\d{4}-\d{4}$/)
    }
  })

  it('yeni alanları bilmeyen ekleme (publish_exam yolu) 8. sınıf LGS + yayında olur', async () => {
    const { data, error } = await svc.from('exams').insert({ school_id: school, name: 'Eski yol deneme', exam_date: '2026-03-10', published_at: new Date().toISOString() }).select('id, grade, exam_type, status, academic_year').single()
    expect(error).toBeNull()
    made.exams.push(data!.id)
    expect(data).toMatchObject({ grade: 8, exam_type: 'LGS', status: 'yayinda', academic_year: '2025-2026' })
  })

  it('mevcut 8. sınıf kataloğu yeni kataloğa sürümüyle aktarıldı (326 kazanım, eski tablo aynen)', async () => {
    const { data: v8 } = await svc.from('curriculum_versions').select('id').eq('curriculum_type', 'LEGACY').eq('grade', 8).eq('year_from', 2018)
    const { count } = await svc.from('learning_outcomes').select('id', { count: 'exact', head: true }).in('curriculum_version_id', v8!.map((v) => v.id))
    expect(count).toBe(326)
    const { data: o } = await svc.from('learning_outcomes').select('code, title, curriculum_versions(curriculum_type, year_from)').eq('code', 'M.8.1.1.1').single()
    expect(o!.title).toMatch(/pozitif tam sayıların/)
    expect(o!.curriculum_versions).toMatchObject({ curriculum_type: 'LEGACY', year_from: 2018 })
  })
})

describe('Taslak deneme görünürlüğü', () => {
  it('taslak deneme ve sonucu veliye/öğrenciye/öğretmene görünmez; yayınlanınca görünür', async () => {
    const { data: e } = await svc
      .from('exams')
      .insert({ school_id: school, name: 'Taslak 7. sınıf', exam_date: '2026-03-12', grade: 7, exam_type: 'GENEL', status: 'taslak' })
      .select('id')
      .single()
    made.exams.push(e!.id)
    await svc.from('exam_results').insert({ exam_id: e!.id, student_id: ELIF, subjects: { MAT: { d: 10, y: 2, b: 3, net: 9.33 } } })
    const veli = await signIn('veliElif')
    const ogr = await signIn('elif')
    const mat = await signIn('matematik')
    const rehber = await signIn('rehber')
    for (const c of [veli, ogr, mat]) {
      expect((await c.from('exams').select('id').eq('id', e!.id)).data).toEqual([])
      expect((await c.from('exam_results').select('student_id').eq('exam_id', e!.id)).data).toEqual([])
    }
    expect((await rehber.from('exam_results').select('student_id').eq('exam_id', e!.id)).data).toHaveLength(1)
    await svc.from('exams').update({ status: 'yayinda', published_at: new Date().toISOString() }).eq('id', e!.id)
    expect((await veli.from('exam_results').select('student_id').eq('exam_id', e!.id)).data).toHaveLength(1)
    // Öğretmen kapsamı (0023) aynen: 8/A öğretmeni Elif'i görür
    expect((await mat.from('exam_results').select('student_id').eq('exam_id', e!.id)).data).toHaveLength(1)
    await svc.from('exams').update({ status: 'arsiv', archived_at: new Date().toISOString() }).eq('id', e!.id)
    expect((await veli.from('exam_results').select('student_id').eq('exam_id', e!.id)).data).toEqual([])
  })

  it('öğretmen başka sınıfın öğrencisinin sonucunu doğrudan sorguyla göremez; veli başka çocuğu göremez', async () => {
    const { data: e } = await svc.from('exams').insert({ school_id: school, name: 'Kapsam denemesi', exam_date: '2026-03-13', grade: 8, exam_type: 'LGS', status: 'yayinda', published_at: new Date().toISOString() }).select('id').single()
    made.exams.push(e!.id)
    await svc.from('exam_results').insert([
      { exam_id: e!.id, student_id: ELIF, subjects: {} },
      { exam_id: e!.id, student_id: KEREM, subjects: {} },
    ])
    const mat = await signIn('matematik') // yalnız 8/A
    expect((await mat.from('exam_results').select('student_id').eq('exam_id', e!.id).eq('student_id', KEREM)).data).toEqual([])
    const veli = await signIn('veliElif')
    expect((await veli.from('exam_results').select('student_id').eq('exam_id', e!.id)).data!.map((r) => r.student_id)).toEqual([ELIF])
    const ogr = await signIn('elif')
    expect((await ogr.from('exam_results').select('student_id').eq('exam_id', e!.id).eq('student_id', KEREM)).data).toEqual([])
  })
})

describe('Kazanım kataloğu ve müfredat sürümü', () => {
  it('aynı kod farklı tema bağlamında kayıt olabilir; aynı bağlamda ikinci kez olamaz', async () => {
    const { data: v } = await svc
      .from('curriculum_versions')
      .insert({ name: 'Test TYMM 7 MAT', curriculum_type: 'TYMM', grade: 7, subject_code: 'MAT', year_from: 2099, outcome_kind: 'OGRENME_CIKTISI', source_title: 'test', source_url: 'https://example.invalid', retrieved_at: '2026-10-03' })
      .select('id')
      .single()
    made.versions.push(v!.id)
    const row = { curriculum_version_id: v!.id, grade: 7, subject_code: 'MAT', code: 'MAT.7.1.1.', title: 'x', outcome_type: 'OGRENME_CIKTISI' }
    expect((await svc.from('learning_outcomes').insert({ ...row, theme: 'Sayılar' })).error).toBeNull()
    expect((await svc.from('learning_outcomes').insert({ ...row, theme: 'Geometri' })).error).toBeNull()
    expect((await svc.from('learning_outcomes').insert({ ...row, theme: 'Sayılar' })).error?.code).toBe('23505')
  })

  it('deneme tarihi doğru müfredat sürümünü seçer (2025–2026 eski / 2026–2027 TYMM ayrı)', async () => {
    // Gerçek katalogda olmayan bir sınıf-ders (7. sınıf Felsefe): senaryo gerçek veriden yalıtılır
    const base = { grade: 7, subject_code: 'FEL', source_title: 'test', source_url: 'https://example.invalid', retrieved_at: '2026-10-03' }
    const { data: old } = await svc.from('curriculum_versions').insert({ ...base, name: 'Test eski 7 FEL', curriculum_type: 'LEGACY', year_from: 2090, year_to: 2091, outcome_kind: 'KAZANIM' }).select('id').single()
    const { data: neu } = await svc.from('curriculum_versions').insert({ ...base, name: 'Test TYMM 7 FEL', curriculum_type: 'TYMM', year_from: 2092, outcome_kind: 'OGRENME_CIKTISI' }).select('id').single()
    made.versions.push(old!.id, neu!.id)
    const pick = async (y: number) => (await svc.rpc('curriculum_for', { p_grade: 7, p_subject: 'FEL', p_year: y })).data
    expect(await pick(2091)).toBe(old!.id)
    expect(await pick(2092)).toBe(neu!.id)
    expect(await pick(2089)).toBeNull()
    expect((await svc.rpc('academic_year_start', { d: '2026-08-31' })).data).toBe(2025)
    expect((await svc.rpc('academic_year_start', { d: '2026-09-01' })).data).toBe(2026)
  })

  it('istemci katalogu değiştiremez (yönetici dahil)', async () => {
    expect((await admin.from('learning_outcomes').update({ title: 'değişti' }).eq('code', 'M.8.1.1.1').select('id')).data ?? []).toEqual([])
    expect((await admin.from('curriculum_versions').insert({ name: 'x', curriculum_type: 'TYMM', grade: 5, subject_code: 'MAT', year_from: 2098, outcome_kind: 'KAZANIM', source_title: 'x', source_url: 'x', retrieved_at: '2026-10-03' })).error).not.toBeNull()
  })
})

describe('Yönetim tabloları', () => {
  it('yayın: yönetici (aal2) kendi okuluna ekler; rehber ve aal1 yönetici ekleyemez; yerleşik biçim değiştirilemez', async () => {
    const { data, error } = await admin.from('publishers').insert({ school_id: school, name: 'Test Yayınları Deneme' }).select('id').single()
    expect(error).toBeNull()
    made.publishers.push(data!.id)
    expect((await (await signIn('rehber')).from('publishers').insert({ school_id: school, name: 'Rehber Yayını' })).error).not.toBeNull()
    expect((await (await signIn('admin')).from('publishers').insert({ school_id: school, name: 'Aal1 Yayını' })).error).not.toBeNull()
    expect((await admin.from('exam_format_profiles').update({ name: 'bozuldu' }).eq('code', 'hiz_cards_v1').select('id')).data ?? []).toEqual([])
    expect((await admin.from('exam_templates').update({ wrong_per_correct: 5 }).eq('builtin', true).select('id')).data ?? []).toEqual([])
  })

  it('şablonlar doğrulanmış soru sayılarıyla; sınıf varsayılan sınav türleri', async () => {
    const veli = await signIn('veliElif')
    const { data: t } = await veli.from('exam_templates').select('name, wrong_per_correct, exam_template_sections(key, question_count, optional_group)').eq('grade', 12)
    const tyt = t!.find((x) => x.name.includes('TYT'))!
    expect(tyt.wrong_per_correct).toBe(4)
    const n = tyt.exam_template_sections.filter((s) => s.key !== 'FEL2').reduce((a, s) => a + s.question_count, 0)
    expect(n).toBe(120) // Din ↔ Felsefe-2 seçmeli: biri uygulanır
    const { data: d } = await veli.from('exam_type_defaults').select('grade, exam_type, yks_part').order('grade')
    expect(d!.map((x) => `${x.grade}:${x.exam_type}${x.yks_part ? '/' + x.yks_part : ''}`)).toEqual(['5:GENEL', '6:GENEL', '7:GENEL', '8:LGS', '9:TYT', '10:TYT', '11:AYT', '12:YKS/TYT'])
  })

  it('soru düzeyinde eşleşmesiz kayıt "kesin" yöntemle yazılamaz; eşleşmeyenler kuyruğa düşer, veli kuyruğu görmez', async () => {
    const { data: e } = await svc.from('exams').insert({ school_id: school, name: 'Kuyruk denemesi', exam_date: '2026-03-14', grade: 9, exam_type: 'TYT', status: 'taslak' }).select('id').single()
    made.exams.push(e!.id)
    expect((await svc.from('exam_items').insert({ exam_id: e!.id, section_key: 'TAR', q_no: 1, subject_code: 'TAR', match_method: 'CODE_EXACT' })).error).not.toBeNull()
    expect((await svc.from('exam_items').insert({ exam_id: e!.id, section_key: 'TAR', q_no: 1, subject_code: 'TAR', raw_code: 'TAR.9.1.1.', raw_text: 'Tarih öğrenmenin…' })).error).toBeNull()
    const rehber = await signIn('rehber')
    expect((await rehber.from('unresolved_outcomes').select('q_no').eq('exam_id', e!.id)).data).toHaveLength(1)
    expect((await (await signIn('veliElif')).from('unresolved_outcomes').select('q_no').eq('exam_id', e!.id)).data).toEqual([])
  })
})
