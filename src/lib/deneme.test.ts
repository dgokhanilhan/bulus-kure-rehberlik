import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { buildPayload, buildReview, pendingCount, type DkPack } from './deneme'
import type { RosterStudent } from './isim'

// Gerçek motorla (public/engine/parser.mjs) sentetik paketi içe al.
const root = new URL('../../', import.meta.url)
// @ts-expect-error — motor saf JS (tip bildirimi yok)
const eng = await import('../../public/engine/parser.mjs')
const cat = JSON.parse(readFileSync(new URL('public/engine/catalog.json', root), 'utf8')).outcomes
const load = (): DkPack => eng.importPack(JSON.parse(readFileSync(new URL('public/ornek/ornek-deneme.json', root), 'utf8')), cat)

const roster: RosterStudent[] = [
  ['elif', 'Elif Yıldız', '8/A', '1184'],
  ['ayse', 'Ayşe Çelik', '8/A', '1185'],
  ['deniz', 'Deniz Arslan', '8/A', '1186'],
  ['zeynep', 'Zeynep Kaya', '8/A', '1187'],
  ['kerem', 'Kerem Aydın', '8/B', '1201'],
  ['mert', 'Mert Demir', '8/B', '1202'],
  ['selin', 'Selin Kurt', '8/B', '1203'],
  ['irem', 'İrem Tekin', '8/C', '1224'],
].map(([id, full_name, class_name, school_no]) => ({ id: id!, full_name: full_name!, class_name: class_name!, school_no: school_no! }))

describe('deneme kontrolü', () => {
  it('yalnız gerçek sorunlar karar ister: listede olmayan isim, D+Y+B tutarsızlığı, tanınmayan sayfa', () => {
    const rv = buildReview(load(), roster)
    const by = (n: string) => rv.rows.find((r) => r.read.name === n)!
    expect(by('ELİF YILDIZ').match).toEqual({ kind: 'exact', id: 'elif', via: 'no' })
    expect(by('ZEGNEP KAYA').match).toEqual({ kind: 'fixed', id: 'zeynep', via: 'no' })
    expect(by('KERM AYDIN').match).toEqual({ kind: 'fixed', id: 'kerem', via: 'name' })
    expect(by('BORA TAN').choice).toBeNull()
    const mert = by('MERT DEMİR')
    expect(mert.subjectIssues).toEqual([{ subject: 'TUR', d: 15, y: 3, b: 1, net: 14, canFix: true, choice: null }])
    expect(mert.badQuestionSubjects).toEqual(['TUR']) // yalnız Türkçe etkilenir
    expect(mert.notes.join(' ')).toMatch(/Türkçe için konu bilgisi sonuçla tutarlı okunamadı/)
    expect(rv.failedPages).toHaveLength(1)
    expect(pendingCount(rv)).toBe(3) // Bora + Mert Türkçe + tanınmayan sayfa
  })

  it('kararlar verilince yayın verisi kurallara uyar; sonuçlar kazanım okumasından bağımsızdır', () => {
    const rv = buildReview(load(), roster)
    rv.rows.find((r) => r.read.name === 'BORA TAN')!.choice = { kind: 'new', class_name: '8/C' }
    rv.rows.find((r) => r.read.name === 'MERT DEMİR')!.subjectIssues[0]!.choice = 'fix'
    rv.failedPages[0]!.skip = true
    expect(pendingCount(rv)).toBe(0)
    const p = buildPayload(rv, { name: 'TG-6', publisher: 'Hız Yayınları', exam_date: '2026-09-26', notify: true })
    expect(p.results).toHaveLength(9)
    expect(p.questions).toHaveLength(90)
    expect(p.questions.every((q) => q.match === 'code_exact' && q.outcome_code)).toBe(true)
    const mert = p.results.find((r) => r.student_id === 'mert')!
    expect(mert.subjects.TUR).toEqual({ d: 15, y: 3, b: 2, net: 14 })
    expect(mert.outcomes_ok).toBe(true)
    expect(mert.answers.TUR).toBe('?'.repeat(20)) // tutarsız dersin cevapları "okunamadı"
    expect(mert.answers.MAT).toMatch(/^[ABCD_]{20}$/)
    const bora = p.results.find((r) => r.new_student)!
    expect(bora.new_student).toEqual({ full_name: 'Bora Tan', class_name: '8/C', school_no: '1299' })
    for (const r of p.results)
      for (const [code, s] of Object.entries(r.subjects)) {
        if (!s) continue
        const n = ['TUR', 'MAT', 'FEN'].includes(code) ? 20 : 10
        expect(s.d + s.y + s.b).toBe(n)
        expect(Math.abs(s.net - (s.d - s.y / 3))).toBeLessThanOrEqual(0.011)
      }
    // Cevap dizisi: soru sayısı uzunluğunda; boş '_' ile, okunamayan '?' ile
    expect(p.results[0]!.answers.TUR).toMatch(/^[ABCD_?]{20}$/)
  })

  it('"Bu dersi boş bırak" seçilirse ders sonucu NULL gider (uydurulmaz)', () => {
    const rv = buildReview(load(), roster)
    rv.rows.find((r) => r.read.name === 'BORA TAN')!.choice = { kind: 'skip' }
    rv.rows.find((r) => r.read.name === 'MERT DEMİR')!.subjectIssues[0]!.choice = 'null'
    const p = buildPayload(rv, { name: 'TG-6', publisher: null, exam_date: '2026-09-26', notify: false })
    expect(p.results).toHaveLength(8)
    expect(p.results.find((r) => r.student_id === 'mert')!.subjects.TUR).toBeNull()
  })
})
