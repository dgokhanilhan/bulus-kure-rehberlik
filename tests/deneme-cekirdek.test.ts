// Genel deneme çekirdeği (0027): kazanım eşleştirme motoru, şablona dayalı içe aktarma (tek işlem), taslak/yayın/arşiv,
// elle eşleştirme + takma ad, yetkiler. Sonuç kuralları sunucuda yeniden doğrulanır; hata olursa hiçbir satır yazılmaz.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { service, signIn, signInAdminAal2, ELIF } from './helpers'

const svc = service()
let admin: SupabaseClient
let rehber: SupabaseClient
let school = ''
const ids: Record<string, string> = {}
const made = { exams: [] as string[], students: [] as string[] }

const sec = (d: number, y: number, n: number, wpc: number) => ({ d, y, b: n - d - y, net: Math.round((d - y / wpc) * 100) / 100 })
const SIX = (over: Record<string, unknown> = {}) => ({
  TUR: sec(10, 3, 15, 3), SOS: sec(7, 3, 10, 3), DIN: sec(8, 2, 10, 3), ING: sec(9, 1, 10, 3), MAT: sec(12, 3, 15, 3), FEN: sec(11, 3, 15, 3), ...over,
})
const payload = (over: Record<string, unknown> = {}) => ({
  name: 'Test 6. Sınıf TG', exam_date: '2026-09-20', grade: 6, exam_type: 'GENEL', template_id: ids.t6, publisher_id: ids.hiz, format_code: 'HIZ_ORTAOKUL_KARNE_V1',
  items: [
    { section_key: 'MAT', q_no: 1, correct_answer: 'B', raw_code: 'MAT.6.1.1.', raw_text: 'Karşılaştığı problem durumlarında bir' },
    { section_key: 'TUR', q_no: 1, correct_answer: 'A', raw_code: 'T.S.6.3.5', raw_text: 'Yardımcı Düşünce' }, // yayıncının kendi kodu: MEB'de yok
  ],
  results: [{ student_id: ids.s6, score: 401.5, sections: SIX(), answers: { TUR: 'ABCD' }, source: { page: 1 } }],
  ...over,
})
const examCount = async () => (await svc.from('exams').select('id', { count: 'exact', head: true }).eq('school_id', school)).count

beforeAll(async () => {
  admin = await signInAdminAal2()
  rehber = await signIn('rehber')
  school = (await svc.from('schools').select('id').single()).data!.id
  ids.c6 = (await svc.from('classes').select('id').eq('name', '6/A').single()).data!.id
  ids.c10 = (await svc.from('classes').select('id').eq('name', '10/A').single()).data!.id
  ids.hiz = (await svc.from('publishers').select('id').is('school_id', null).eq('name', 'Hız Yayınları').single()).data!.id
  ids.t6 = (await svc.from('exam_templates').select('id').eq('builtin', true).eq('grade', 6).single()).data!.id
  ids.tyt = (await svc.from('exam_templates').select('id').eq('builtin', true).eq('grade', 12).like('name', '%TYT%').single()).data!.id
  const { data: s } = await svc.from('students').insert({ school_id: school, full_name: 'Çekirdek Altıncı', class_id: ids.c6 }).select('id').single()
  ids.s6 = s!.id
  made.students.push(s!.id)
  // Elif'in velisine bu öğrenciyi de bağla (görünürlük testi)
  const { data: veli } = await svc.from('profiles').select('id').eq('email', 'ayse.yildiz@ornek.com').single()
  await svc.from('parent_links').insert({ parent_id: veli!.id, student_id: ids.s6, relation: 'Anne' })
})
afterAll(async () => {
  if (made.exams.length) await svc.from('exams').delete().in('id', made.exams)
  await svc.from('learning_outcome_aliases').delete().eq('school_id', school).eq('raw_code', 'T.S.6.3.5')
  await svc.from('parent_links').delete().in('student_id', made.students)
  await svc.from('students').delete().in('id', made.students)
})

describe('Kazanım eşleştirme motoru', () => {
  const resolve = async (subject: string, grades: number[], year: number, code: string | null, text: string | null) =>
    ((await rehber.rpc('resolve_outcome', { p_subject: subject, p_grades: grades, p_year: year, p_code: code, p_text: text, p_school: school })).data ?? [])[0] ?? null

  it('kod öncelikli; eski ve TYMM sürümü eğitim yılına göre ayrılır', async () => {
    expect((await resolve('MAT', [7], 2025, 'M.7.1.1.1', null))?.method).toBe('CODE_EXACT') // 2025–2026: 7 eski program
    expect(await resolve('MAT', [7], 2026, 'M.7.1.1.1', null)).toBeNull() // 2026–2027: 7 TYMM, eski kod geçersiz
    expect((await resolve('MAT', [7], 2026, 'MAT.7.1.1', null))?.method).toBe('CODE_EXACT')
    expect((await resolve('MAT', [7], 2025, 'm.7.1.1.1.', null))?.method).toBe('CODE_NORMALIZED') // küçük harf, sondaki nokta
  })
  it('yanlış sınıf, yanlış ders, yanlış müfredat yılı eşleşmez', async () => {
    expect(await resolve('MAT', [6], 2025, 'M.7.1.1.1', null)).toBeNull()
    expect(await resolve('FEN', [7], 2025, 'M.7.1.1.1', null)).toBeNull()
    expect(await resolve('MAT', [5], 2025, 'MAT.5.1.1', null)).toBeNull() // 2025–2026 5. sınıf Matematik: resmî kaynak yok → Eksik
  })
  it('farklı gerçek kodlar birbirine dönüşmez (noktalar korunur)', async () => {
    expect(await resolve('MAT', [7], 2025, 'M.7.11.1.1', null)).toBeNull()
  })
  it('kod yoksa metin: tam ve kesik (yayıncı) metin; belirsiz metin çözülmez', async () => {
    expect((await resolve('TUR', [7], 2025, null, 'Dinlediklerinde/izlediklerinde geçen olayların gelişimi ve sonucu hakkında tahminde bulunur.'))?.method).toBe('TEXT_EXACT')
    expect((await resolve('TUR', [7], 2025, null, 'Dinlediklerinde/izlediklerinde geçen olay'))?.method).toBe('TEXT_MATCH')
    expect(await resolve('TUR', [7], 2025, null, 'Metni')).toBeNull() // çok kısa / belirsiz
    expect(await resolve('TUR', [6], 2026, 'T.S.6.3.5', 'Yardımcı Düşünce')).toBeNull() // yayıncı kodu MEB'de yok → UNRESOLVED
  })
  it('TYT/AYT: kazanım birden çok sınıfın kataloğunda aranır; sınıftan bağımsız programın kopyaları tek çıktı sayılır', async () => {
    const r = await resolve('TDE', [9, 10, 11, 12], 2025, 'A.1.9', null) // eski TDE (11–12) + TYMM 2024 TDE (9–10)
    expect(r?.method).toBe('CODE_EXACT')
    expect(r?.outcome_grade).toBe(12)
    expect((await resolve('TDE', [9, 10], 2025, 'TDE1.2', null))?.outcome_grade).toBe(10)
  })
})

describe('Genel içe aktarma', () => {
  it('6. sınıf genel deneme: taslak olarak yazılır, toplam net ve başarı yüzdesi hesaplanır, kazanımlar eşleşir', async () => {
    const { data, error } = await rehber.rpc('import_exam', { p: payload({ sha256: 'cekirdek-test-1', filename: 'test.pdf' }) })
    expect(error).toBeNull()
    made.exams.push(data.exam_id)
    expect(data).toMatchObject({ results: 1, items: 2, resolved: 1, unresolved: 1, duplicate: false })
    const { data: e } = await svc.from('exams').select('status, grade, exam_type, academic_year, exam_template_id').eq('id', data.exam_id).single()
    expect(e).toMatchObject({ status: 'taslak', grade: 6, exam_type: 'GENEL', academic_year: '2026-2027', exam_template_id: ids.t6 })
    const { data: r } = await svc.from('exam_results').select('score, total_net, success_pct, subjects').eq('exam_id', data.exam_id).single()
    const total = Object.values(SIX()).reduce((a, s) => a + s.net, 0)
    expect(Number(r!.total_net)).toBeCloseTo(total, 2)
    expect(Number(r!.success_pct)).toBeCloseTo((total / 75) * 100, 2)
    expect(Number(r!.score)).toBe(401.5) // yayıncı puanı korunur
    const { data: items } = await svc.from('exam_items').select('section_key, match_method, outcome_grade, learning_outcome_id').eq('exam_id', data.exam_id).order('section_key')
    expect(items!.map((i) => [i.section_key, i.match_method])).toEqual([['MAT', 'CODE_EXACT'], ['TUR', 'UNRESOLVED']])
    const { data: q } = await rehber.from('unresolved_outcomes').select('raw_code').eq('exam_id', data.exam_id)
    expect(q).toEqual([{ raw_code: 'T.S.6.3.5' }])
    const { data: imp } = await svc.from('exam_imports').select('status, result_count, unresolved_count, filename').eq('exam_id', data.exam_id).single()
    expect(imp).toMatchObject({ status: 'basarili', result_count: 1, unresolved_count: 1, filename: 'test.pdf' })
  })

  it('aynı dosya ikinci kez: yeni deneme açılmaz', async () => {
    const before = await examCount()
    const { data } = await rehber.rpc('import_exam', { p: payload({ sha256: 'cekirdek-test-1' }) })
    expect(data.duplicate).toBe(true)
    expect(await examCount()).toBe(before)
  })

  it('kural ihlali: hiçbir satır yazılmaz (tek işlem)', async () => {
    const before = await examCount()
    const bad = [
      { sections: SIX({ TUR: { d: 10, y: 3, b: 3, net: 9 } }) }, // D+Y+B ≠ 15
      { sections: SIX({ MAT: { d: 12, y: 3, b: 0, net: 12 } }) }, // net kuralı (D − Y/3) tutmuyor
      { sections: SIX({ FEN: { na: true } }) }, // seçmeli olmayan bölüm N/A olamaz
      { sections: SIX({ XYZ: sec(1, 0, 1, 3) }) }, // şablonda olmayan bölüm
      { sections: SIX({ ING: { d: -1, y: 0, b: 11, net: -1 } }) }, // negatif
    ]
    for (const b of bad) {
      const { error } = await rehber.rpc('import_exam', { p: payload({ results: [{ student_id: ids.s6, score: null, ...b }] }) })
      expect(error, JSON.stringify(b)).not.toBeNull()
    }
    // İki sonuçtan biri hatalı → ikisi de yazılmaz
    const { data: s2 } = await svc.from('students').insert({ school_id: school, full_name: 'Çekirdek İkinci', class_id: ids.c6 }).select('id').single()
    made.students.push(s2!.id)
    const { error } = await rehber.rpc('import_exam', { p: payload({ results: [{ student_id: s2!.id, sections: SIX() }, { student_id: ids.s6, sections: SIX({ TUR: { d: 20, y: 0, b: 0, net: 20 } }) }] }) })
    expect(error).not.toBeNull()
    expect(await examCount()).toBe(before)
    expect((await svc.from('exam_results').select('exam_id').eq('student_id', s2!.id)).data).toEqual([])
  })

  it('öğrencinin sınıfı denemenin sınıfı değilse yönetici onayı olmadan yazılmaz', async () => {
    const { error } = await rehber.rpc('import_exam', { p: payload({ results: [{ student_id: ELIF, sections: SIX() }] }) }) // Elif 8/A
    expect(error?.message).toMatch(/uyuşmuyor/)
  })

  it('şablonla uyumsuz sınıf / sınav türü reddedilir; YKS alt türü zorunlu', async () => {
    expect((await rehber.rpc('import_exam', { p: payload({ grade: 7 }) })).error?.message).toMatch(/şablonun sınıfıyla/)
    expect((await rehber.rpc('import_exam', { p: payload({ exam_type: 'TYT' }) })).error?.message).toMatch(/uyumlu değil/)
    expect((await rehber.rpc('import_exam', { p: payload({ grade: 12, template_id: ids.tyt, exam_type: 'YKS', results: [] }) })).error).not.toBeNull()
  })

  it('12 TYT: Din ve Felsefe-2 seçmeli; ikisi birden uygulanamaz, yanıtlanmayan N/A olabilir', async () => {
    const { data: s12c } = await svc.from('classes').insert({ school_id: school, grade: 12, section: 'Z' }).select('id').single()
    const { data: s12 } = await svc.from('students').insert({ school_id: school, full_name: 'Çekirdek Onikinci', class_id: s12c!.id }).select('id').single()
    made.students.push(s12!.id)
    const base = { TUR: sec(30, 8, 40, 4), TAR: sec(3, 1, 5, 4), COG: sec(3, 1, 5, 4), FEL: sec(2, 1, 5, 4), MAT: sec(20, 8, 40, 4), FIZ: sec(4, 2, 7, 4), KIM: sec(4, 2, 7, 4), BIY: sec(3, 2, 6, 4) }
    const p12 = (sections: Record<string, unknown>) => ({ name: 'Test 12 TYT', exam_date: '2026-03-10', grade: 12, exam_type: 'YKS', yks_part: 'TYT', template_id: ids.tyt, results: [{ student_id: s12!.id, sections }] })
    expect((await rehber.rpc('import_exam', { p: p12({ ...base, DIN: sec(3, 1, 5, 4), FEL2: sec(2, 1, 5, 4) }) })).error?.message).toMatch(/yalnız biri/)
    const { data, error } = await rehber.rpc('import_exam', { p: p12({ ...base, DIN: sec(3, 1, 5, 4), FEL2: { na: true } }) })
    expect(error).toBeNull()
    made.exams.push(data.exam_id)
    const { data: r } = await svc.from('exam_results').select('success_pct, subjects').eq('exam_id', data.exam_id).single()
    expect((r!.subjects as Record<string, unknown>).FEL2).toEqual({ na: true })
    const max = 40 + 5 + 5 + 5 + 5 + 40 + 7 + 7 + 6 // N/A bölüm en yüksek nete katılmaz
    const total = [...Object.values(base), sec(3, 1, 5, 4)].reduce((a, s) => a + s.net, 0)
    expect(Number(r!.success_pct)).toBeCloseTo((total / max) * 100, 2)
    await svc.from('exams').delete().eq('id', data.exam_id)
    await svc.from('students').delete().eq('id', s12!.id)
    await svc.from('classes').delete().eq('id', s12c!.id)
    made.exams.pop()
  })
})

describe('Yaşam döngüsü ve yetkiler', () => {
  it('taslak veliye görünmez; yayınlanınca görünür; arşivde gizlenir; geri alınır (silinmez)', async () => {
    const examId = made.exams[0]!
    const veli = await signIn('veliElif')
    const sees = async () => ((await veli.from('exam_results').select('student_id').eq('exam_id', examId)).data ?? []).length
    expect(await sees()).toBe(0)
    expect((await rehber.rpc('set_exam_status', { p_exam: examId, p_status: 'yayinda' })).error).toBeNull()
    expect(await sees()).toBe(1)
    await rehber.rpc('set_exam_status', { p_exam: examId, p_status: 'arsiv' })
    expect(await sees()).toBe(0)
    expect((await svc.from('exams').select('id').eq('id', examId)).data).toHaveLength(1) // fiziksel silme yok
    await rehber.rpc('set_exam_status', { p_exam: examId, p_status: 'yayinda' })
    expect(await sees()).toBe(1)
    const { data: log } = await svc.from('audit_log').select('action').eq('entity_id', examId).order('id')
    expect(log!.map((l) => l.action)).toEqual(['import', 'publish', 'archive', 'publish'])
  })

  it('veli, öğrenci ve öğretmen içe aktaramaz, durum değiştiremez', async () => {
    for (const who of ['veliElif', 'elif', 'matematik'] as const) {
      const c = await signIn(who)
      expect((await c.rpc('import_exam', { p: payload() })).error?.code, who).toBe('42501')
      expect((await c.rpc('set_exam_status', { p_exam: made.exams[0], p_status: 'arsiv' })).error?.code, who).toBe('42501')
    }
  })

  it('elle eşleştirme: uyumsuz kazanım reddedilir; takma ad sonraki içe aktarımda otomatik eşleşir (ALIAS)', async () => {
    const examId = made.exams[0]!
    const lo = async (code: string, grade: number) => (await svc.from('learning_outcomes').select('id, curriculum_versions!inner(active, year_from, curriculum_type)').eq('code', code).eq('grade', grade).eq('curriculum_versions.active', true).eq('curriculum_versions.curriculum_type', 'TYMM').order('id').limit(1).single()).data!.id
    const wrong = await lo('T.O.7.1', 7)
    expect((await admin.rpc('set_item_outcome', { p_exam: examId, p_section: 'TUR', p_q: 1, p_outcome: wrong })).error?.message).toMatch(/uyumlu değil/)
    const right = await lo('T.O.6.1', 6)
    expect((await rehber.rpc('set_item_outcome', { p_exam: examId, p_section: 'TUR', p_q: 1, p_outcome: right, p_alias: true })).error?.code).toBe('42501') // takma adı yalnız yönetici
    expect((await admin.rpc('set_item_outcome', { p_exam: examId, p_section: 'TUR', p_q: 1, p_outcome: right, p_alias: true })).error).toBeNull()
    expect((await svc.from('exam_items').select('match_method').eq('exam_id', examId).eq('section_key', 'TUR').single()).data!.match_method).toBe('MANUAL')
    const { data } = await rehber.rpc('import_exam', { p: payload({ name: 'Test 6. Sınıf TG-2', sha256: 'cekirdek-test-2' }) })
    made.exams.push(data.exam_id)
    expect(data.unresolved).toBe(0)
    expect((await svc.from('exam_items').select('match_method').eq('exam_id', data.exam_id).eq('section_key', 'TUR').single()).data!.match_method).toBe('ALIAS')
  })

  it('önizleme: aynı dosya ve aynı öğrencinin mevcut sonucu bildirilir', async () => {
    await svc.from('exams').update({ exam_code: 'TG-T' }).eq('id', made.exams[0])
    const { data } = await rehber.rpc('import_preview', { p_sha256: 'cekirdek-test-1', p_exam_code: 'TG-T', p_exam_date: '2026-09-20', p_students: [ids.s6] })
    expect(data.same_file).toBe(made.exams[0])
    expect(data.existing).toHaveLength(1)
    expect((await (await signIn('veliElif')).rpc('import_preview', { p_sha256: 'x', p_exam_code: null, p_exam_date: '2026-09-20', p_students: [] })).data).toBeNull()
  })
})
