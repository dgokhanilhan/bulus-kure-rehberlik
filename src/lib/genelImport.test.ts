import { describe, it, expect } from 'vitest'
import { buildGenelReview, examItems, genelPending, mapSections, toImportPayload, type GenelPack } from './genelImport'
import type { ExamTemplate, TemplateSection } from './denemeGenel'

// Şablonlar: 0025'teki yerleşik şablonlarla aynı bölümler
const S = (key: string, label: string, n: number, sort: number, optional_group: string | null = null): TemplateSection => ({ key, subject_code: key.replace(/\d$/, ''), label, question_count: n, sort, optional_group, outcome_grades: null })
const ORTA: ExamTemplate = { id: 't6', name: '6', grade: 6, exam_types: ['GENEL'], wrong_per_correct: 3, strict_counts: true,
  sections: [S('TUR', 'Türkçe', 15, 1), S('SOS', 'Sosyal Bilgiler', 10, 2), S('DIN', 'Din Kültürü', 10, 3), S('ING', 'İngilizce', 10, 4), S('MAT', 'Matematik', 15, 5), S('FEN', 'Fen Bilimleri', 15, 6)] }
const L9: ExamTemplate = { id: 't9', name: '9', grade: 9, exam_types: ['TYT'], wrong_per_correct: 4, strict_counts: true,
  sections: [S('TDE', 'Türk Dili', 30, 1), S('TAR', 'Tarih', 13, 2), S('COG', 'Coğrafya', 12, 3), S('DIN', 'Din Kültürü', 5, 4), S('MAT', 'Matematik', 30, 5), S('FIZ', 'Fizik', 10, 6), S('KIM', 'Kimya', 10, 7), S('BIY', 'Biyoloji', 10, 8)] }
const TYT: ExamTemplate = { id: 'tyt', name: 'TYT', grade: 12, exam_types: ['YKS'], wrong_per_correct: 4, strict_counts: true,
  sections: [S('TUR', 'Türkçe', 40, 1), S('TAR', 'Tarih', 5, 2), S('COG', 'Coğrafya', 5, 3), S('FEL', 'Felsefe', 5, 4), S('DIN', 'Din Kültürü', 5, 5, 'G'), S('FEL2', 'Felsefe-2', 5, 6, 'G'),
    S('MAT', 'Matematik', 40, 7), S('FIZ', 'Fizik', 7, 8), S('KIM', 'Kimya', 7, 9), S('BIY', 'Biyoloji', 6, 10)] }
const AYT: ExamTemplate = { id: 'ayt', name: 'AYT', grade: 12, exam_types: ['YKS'], wrong_per_correct: 4, strict_counts: true,
  sections: [S('TDE', 'Türk Dili ve Edebiyatı', 24, 1), S('TAR1', 'Tarih-1', 10, 2), S('COG1', 'Coğrafya-1', 6, 3), S('TAR2', 'Tarih-2', 11, 4), S('COG2', 'Coğrafya-2', 11, 5), S('FEL1', 'Felsefe Grubu', 12, 6),
    S('DIN', 'Din Kültürü', 6, 7, 'G'), S('FEL2', 'Felsefe-2', 6, 8, 'G'), S('MAT', 'Matematik', 40, 9), S('FIZ', 'Fizik', 14, 10), S('KIM', 'Kimya', 13, 11), S('BIY', 'Biyoloji', 13, 12)] }

describe('bölüm etiketi eşleme (PDF\'lerde görülen etiketler)', () => {
  it('ortaokul', () => {
    expect(mapSections(ORTA, ['TÜRKÇE', 'SOSYAL BİLGİLER', 'DİN KÜLTÜRÜ', 'İNGİLİZCE', 'MATEMATİK', 'FEN BİLİMLERİ'])).toEqual({ map: { TÜRKÇE: 'TUR', 'SOSYAL BİLGİLER': 'SOS', 'DİN KÜLTÜRÜ': 'DIN', İNGİLİZCE: 'ING', MATEMATİK: 'MAT', 'FEN BİLİMLERİ': 'FEN' }, unmapped: [], ambiguous: [] })
  })
  it('9. sınıf: kesik "DİN KÜLTÜR", "TÜRK DİLİ"', () => {
    const r = mapSections(L9, ['TÜRK DİLİ', 'TARİH', 'COĞRAFYA', 'DİN KÜLTÜR', 'MATEMATİK', 'FİZİK', 'KİMYA', 'BİYOLOJİ'])
    expect(r.map['DİN KÜLTÜR']).toBe('DIN')
    expect(r.map['TÜRK DİLİ']).toBe('TDE')
    expect([r.unmapped, r.ambiguous]).toEqual([[], []])
  })
  it('12 TYT: FELSEFE-1 → Felsefe, FELSEFE-2 → Felsefe-2', () => {
    const r = mapSections(TYT, ['TÜRKÇE', 'TARİH', 'COĞRAFYA', 'FELSEFE-1', 'DİN KÜLTÜR', 'FELSEFE-2', 'MATEMATİK', 'FİZİK', 'KİMYA', 'BİYOLOJİ'])
    expect([r.map['FELSEFE-1'], r.map['FELSEFE-2'], r.map['TÜRKÇE']]).toEqual(['FEL', 'FEL2', 'TUR'])
    expect([r.unmapped, r.ambiguous]).toEqual([[], []])
  })
  it('12 AYT: numaralı bölümler, Felsefe Grubu', () => {
    const r = mapSections(AYT, ['TÜRK DİLİ', 'TARİH-1', 'COĞRAFYA-1', 'TARİH-2', 'COĞRAFYA-2', 'FELSEFE-1', 'DİN KÜLTÜRÜ', 'FELSEFE-2', 'MATEMATİK', 'FİZİK', 'KİMYA', 'BİYOLOJİ'])
    expect(r.map).toMatchObject({ 'TÜRK DİLİ': 'TDE', 'TARİH-1': 'TAR1', 'COĞRAFYA-2': 'COG2', 'FELSEFE-1': 'FEL1', 'FELSEFE-2': 'FEL2' })
    expect([r.unmapped, r.ambiguous]).toEqual([[], []])
  })
  it('şablonda olmayan bölüm eşlenmez (tahmin yok)', () => {
    expect(mapSections(ORTA, ['T.C. İNKILAP TARİHİ']).unmapped).toEqual(['T.C. İNKILAP TARİHİ'])
  })
})

describe('kontrol modeli ve içe aktarma isteği', () => {
  const pack: GenelPack = {
    engine: 'genel-1.0.0', sha256: 'a'.repeat(64), filename: 'x.pdf',
    detection: { family: 'HIZ_ORTAOKUL', format: 'HIZ_ORTAOKUL_KARNE_V1', confidence: 1, evidence: [] },
    failedPages: [],
    records: [
      { page: 1, pages: [1, 2], student: { name: 'DENEME ÖĞRENCİ', number: '38', class: '6/A', classGrade: 6 }, exam: { title: 't' }, score: 400, warnings: [],
        sections: [{ label: 'TÜRKÇE', n: 15, d: 11, y: 3, b: 1, net: 10 }, { label: 'MATEMATİK', n: 15, d: 12, y: 3, b: 0, net: 11 }],
        items: [{ label: 'TÜRKÇE', section: 'TÜRKÇE', booklet: 'B', q: 1, testQ: 1, key: 'B', answer: 'B', mark: '+', rawCode: 'T.S.6.3.5', rawText: 'Yardımcı Düşünce' }] },
      { page: 3, pages: [3, 4], student: { name: 'BİLİNMEYEN KİŞİ', number: '99', class: '6/A', classGrade: 6 }, exam: { title: 't' }, score: null, warnings: ['ITEM_COUNTS:MATEMATİK'],
        sections: [{ label: 'TÜRKÇE', n: 15, d: 10, y: 3, b: 3, net: 9 }], items: [] },
    ],
  }
  const roster = [{ id: 's1', full_name: 'Deneme Öğrenci', class_name: '6/A', school_no: '38' }]
  it('eşleşen öğrenci seçilir, tanınmayan karar ister, kural ihlali satırda hata', () => {
    const rv = buildGenelReview(pack, ORTA, roster as never)
    expect(rv.rows[0]!.choice).toEqual({ kind: 'student', id: 's1' })
    expect(rv.rows[1]!.choice).toBeNull()
    expect(rv.rows[1]!.errors.join()).toMatch(/D\+Y\+B = 16/)
    expect(rv.rows[1]!.badItemSections).toEqual(['MAT'])
    expect(rv.rows[0]!.notes.join()).toMatch(/sonuç yok/) // SOS, DIN, ING, FEN yok
    expect(genelPending(rv)).toBe(1)
    rv.rows[1]!.choice = { kind: 'skip' }
    expect(genelPending(rv)).toBe(0)
    const p = toImportPayload(rv, { name: 'TG-6', exam_date: '2026-03-10', grade: 6, exam_type: 'GENEL', yks_part: null, exam_code: 'GD-6', publisher_id: null, template_id: 't6', target_class_ids: [], status: 'taslak', notify: false, allow_grade_mismatch: false })
    expect(p.results).toHaveLength(1)
    expect(p.results[0]).toMatchObject({ student_id: 's1', score: 400, sections: { TUR: { d: 11, y: 3, b: 1, net: 10 }, MAT: { d: 12, y: 3, b: 0, net: 11 } } })
    expect(p.items).toEqual([{ section_key: 'TUR', q_no: 1, correct_answer: 'B', raw_code: 'T.S.6.3.5', raw_text: 'Yardımcı Düşünce' }])
    expect(examItems(rv)).toHaveLength(1)
    expect(p.format_code).toBe('HIZ_ORTAOKUL_KARNE_V1')
  })
})
