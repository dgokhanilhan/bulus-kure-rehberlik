import { describe, it, expect } from 'vitest'
import { manualToPack, mapTableHeader, tableTemplate, tableToPack } from './genelTablo'
import { buildGenelReview, toImportPayload } from './genelImport'
import type { ExamTemplate, TemplateSection } from './denemeGenel'

const S = (key: string, label: string, n: number, sort: number, optional_group: string | null = null): TemplateSection => ({ key, subject_code: key.replace(/\d$/, ''), label, question_count: n, sort, optional_group, outcome_grades: null })
const TYT: ExamTemplate = { id: 'tyt', name: 'TYT', grade: 12, exam_types: ['YKS'], wrong_per_correct: 4, strict_counts: true,
  sections: [S('TUR', 'Türkçe', 40, 1), S('DIN', 'Din Kültürü', 5, 2, 'G'), S('FEL2', 'Felsefe-2', 5, 3, 'G'), S('MAT', 'Matematik', 40, 4)] }
const roster = [{ id: 's1', full_name: 'Ayşe Yılmaz', class_name: '12/A', school_no: '501' }, { id: 's2', full_name: 'Can Demir', class_name: '12/B', school_no: '502' }]
const meta = { name: 'TYT-1', exam_date: '2026-03-10', grade: 12, exam_type: 'YKS' as const, yks_part: 'TYT' as const, exam_code: null, publisher_id: null, template_id: 'tyt', target_class_ids: [], status: 'taslak' as const, notify: false, allow_grade_mismatch: false }

describe('Excel/CSV tablosu', () => {
  it('şablon tablosu başlığı geri okunabilir (kod ya da ad, D/Y/B, Doğru/Yanlış)', () => {
    expect(mapTableHeader(TYT, tableTemplate(TYT)[0]!).errors).toEqual([])
    const r = mapTableHeader(TYT, ['Adı Soyadı', 'Okul No', 'Şube', 'Türkçe Doğru', 'Türkçe Yanlış', 'Türkçe Boş', 'MAT_D', 'MAT.Y'])
    expect(r.errors).toEqual([])
    expect(r.cols).toMatchObject({ name: 0, number: 1, class: 2, sections: { TUR: { d: 3, y: 4, b: 5 }, MAT: { d: 6, y: 7 } } })
  })
  it('tanınmayan sütun, eksik Y ve kimliksiz tablo hata verir (tahmin yok)', () => {
    expect(mapTableHeader(TYT, ['Ad soyad', 'Fizik D', 'Fizik Y']).errors.join()).toMatch(/Fizik D/)
    expect(mapTableHeader(TYT, ['Ad soyad', 'MAT D']).errors.join()).toMatch(/MAT: doğru \(D\) ve yanlış \(Y\)/)
    expect(mapTableHeader(TYT, ['MAT D', 'MAT Y']).errors.join()).toMatch(/Ad soyad/)
  })
  it('satırlar → kontrol modeli → import isteği: boş hücre girilmedi, seçmeli grup N/A, net kuralı', () => {
    const rows = [
      ['Ad soyad', 'Okul no', 'Sınıf', 'TUR D', 'TUR Y', 'DIN D', 'DIN Y', 'FEL2 D', 'FEL2 Y', 'MAT D', 'MAT Y'],
      ['Ayşe Yılmaz', '501', '12/A', '30', '8', '', '', '4', '1', '20', '4'],
      ['Can Demir', 502, '12/B', '35', 2, '3', '0', '', '', '', ''],
    ]
    const { pack, errors } = tableToPack(TYT, rows, 'sonuc.xlsx', 'b'.repeat(64))
    expect(errors).toEqual([])
    expect(pack!.records.map((r) => r.page)).toEqual([2, 3]) // Excel satırı
    const rv = buildGenelReview(pack!, TYT, roster)
    expect(rv.mapErrors).toEqual([])
    expect(rv.rows.map((r) => r.choice)).toEqual([{ kind: 'student', id: 's1' }, { kind: 'student', id: 's2' }])
    expect(rv.rows[0]!.sections).toMatchObject({ TUR: { d: 30, y: 8, b: 2, net: 28 }, DIN: { na: true }, FEL2: { d: 4, y: 1, b: 0, net: 3.75 }, MAT: { d: 20, y: 4, b: 16, net: 19 } })
    expect(rv.rows[1]!.sections.MAT).toBeUndefined() // girilmedi ≠ boş
    expect(rv.rows[1]!.sections.FEL2).toEqual({ na: true })
    expect(rv.rows.every((r) => !r.errors.length)).toBe(true)
    const p = toImportPayload(rv, meta)
    expect([p.source_kind, p.sha256, p.items.length]).toEqual(['excel', 'b'.repeat(64), 0])
  })
  it('sayı olmayan hücre satırda uyarı ve o bölüm girilmemiş sayılır', () => {
    const { pack } = tableToPack(TYT, [['Ad soyad', 'TUR D', 'TUR Y'], ['Ayşe Yılmaz', 'otuz', '2']], 'x.csv', 'c'.repeat(64))
    expect(pack!.records[0]!.warnings.join()).toMatch(/Türkçe/)
    expect(pack!.records[0]!.sections).toEqual([])
  })
})

describe('Elle giriş', () => {
  it('dosya yok: sha256 gönderilmez, kaynak "manuel"', () => {
    const pack = manualToPack(TYT, [{ name: 'Ayşe Yılmaz', number: '501', class: '12/A', values: { TUR: { d: '40', y: '0' }, MAT: { d: '10', y: '30' } } }])
    const rv = buildGenelReview(pack, TYT, roster)
    expect(rv.rows[0]!.sections).toMatchObject({ TUR: { net: 40, b: 0 }, MAT: { net: 2.5, b: 0 } })
    const p = toImportPayload(rv, meta)
    expect([p.source_kind, p.sha256]).toEqual(['manuel', null])
  })
})
