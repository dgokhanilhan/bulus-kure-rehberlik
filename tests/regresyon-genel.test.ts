// Genel deneme motoru regresyonu: fixtures/pdf-genel/*.pdf (gerçek karneler, git'e girmez) → motor → maskeli özet
// == fixtures/beklenen-genel/*.json (öğrenci adı ve numarası YOK). Kaydetmek için: REGRESYON_KAYDET=1.
// Ayrıca her kayıtta soru düzeyinden sayılan D/Y/B sonuç sayfasıyla tutmalı (motor uyarısı yok).
import { describe, it, expect } from 'vitest'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'

// @ts-expect-error — motor saf JS
const eng = await import('../public/engine/genel.mjs')
const dir = new URL('../fixtures/', import.meta.url)
const pdfs = existsSync(new URL('pdf-genel/', dir)) ? readdirSync(new URL('pdf-genel/', dir)).filter((f) => /\.pdf$/i.test(f)) : []
const save = process.env.REGRESYON_KAYDET === '1'

type Rec = { page: number; student: { class: string | null; classGrade: number | null }; score: number | null; scores?: Record<string, number | null>; sections: { label: string; n: number; d: number; y: number; b: number; net: number }[]; items: { section: string | null; q: number; key: string | null; mark: string | null; rawCode: string | null }[]; warnings: string[] }
function masked(pack: { detection: Record<string, unknown> & { grade?: { value: number | null; confidence: number }; examType?: { value: string | null; yksPart: string | null }; publisher?: { value: string }; exam?: { title: string | null; code: string | null } }; records: Rec[]; failedPages: unknown[] }) {
  const d = pack.detection
  return {
    detection: { family: d.family, format: d.format ?? null, confidence: d.confidence, grade: d.grade?.value ?? null, gradeConfidence: d.grade?.confidence ?? null, examType: d.examType?.value ?? null, yksPart: d.examType?.yksPart ?? null, publisher: d.publisher?.value ?? null, examCode: d.exam?.code ?? null, title: d.exam?.title ?? null },
    failedPages: pack.failedPages.length,
    records: pack.records.map((r) => ({
      page: r.page, classGrade: r.student.classGrade, score: r.score, scores: r.scores ?? null,
      sections: Object.fromEntries(r.sections.map((s) => [s.label, [s.n, s.d, s.y, s.b, s.net]])),
      items: r.items.length, coded: r.items.filter((q) => q.rawCode).length,
      key: r.items.map((q) => `${q.section}:${q.q}:${q.key ?? ''}:${q.mark ?? ''}`).join('|').length, // soru düzeyi değişirse yakalanır (içerik maskeli)
      warnings: r.warnings,
    })),
  }
}

describe.skipIf(!pdfs.length)('Genel motor regresyonu (Hız 5–12, Frekans; Özdebir = UNKNOWN)', () => {
  for (const f of pdfs) {
    it(f, async () => {
      const pack = await eng.parseGeneral(new Uint8Array(readFileSync(new URL(`pdf-genel/${f}`, dir))), f)
      if (pack.detection.family !== 'UNKNOWN') {
        expect(pack.records.length, `${f}: hiç kayıt yok`).toBeGreaterThan(0)
        for (const r of pack.records as Rec[]) expect(r.warnings, `${f} s.${r.page}`).toEqual([])
      }
      const got = masked(pack)
      const file = new URL(`beklenen-genel/${f.replace(/\.pdf$/i, '.json')}`, dir)
      if (save) writeFileSync(file, JSON.stringify(got, null, 1) + '\n')
      expect(existsSync(file), `${f} için beklenen sonuç yok: REGRESYON_KAYDET=1`).toBe(true)
      expect(got).toEqual(JSON.parse(readFileSync(file, 'utf8')))
    })
  }
})

if (!pdfs.length) it.skip('Genel motor regresyonu: fixtures/pdf-genel boş — PDF eklenince çalışır', () => {})
