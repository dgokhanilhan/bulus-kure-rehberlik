// PDF regresyonu: fixtures/pdf/*.pdf → motor → maskeli özet == fixtures/beklenen/*.json
// Kaydetmek için: REGRESYON_KAYDET=1 (npm run regresyon:kaydet)
import { describe, it, expect } from 'vitest'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { regressionSummary, QCOUNT, type DkPack } from '../src/lib/deneme'

// @ts-expect-error — motor saf JS
const eng = await import('../public/engine/parser.mjs')
const dir = new URL('../fixtures/', import.meta.url)
const cat = JSON.parse(readFileSync(new URL('../public/engine/catalog.json', import.meta.url), 'utf8')).outcomes
const pdfs = existsSync(new URL('pdf/', dir)) ? readdirSync(new URL('pdf/', dir)).filter((f) => /\.pdf$/i.test(f)) : []
const save = process.env.REGRESYON_KAYDET === '1'

describe.skipIf(!pdfs.length)('PDF regresyonu', () => {
  for (const f of pdfs) {
    it(f, async () => {
      const bytes = new Uint8Array(readFileSync(new URL(`pdf/${f}`, dir)))
      const pack: DkPack = await eng.parsePDF(bytes, f, cat)
      expect(pack.records.length, `${f}: hiç öğrenci okunamadı`).toBeGreaterThan(0)
      // Sonuç kuralları: okunan her ders tutarlı olmalı (tutarsızsa kontrol ekranına düşer; regresyon bunu hata sayar)
      for (const r of pack.records)
        for (const s of r.subjects) {
          if (s.correct == null) continue
          expect(s.correct + s.wrong! + s.blank!, `${f} s.${r.source.pages[0]} ${s.id} D+Y+B`).toBe(QCOUNT[s.id])
          expect(Math.abs(s.net! - (s.correct - s.wrong! / 3)), `${f} s.${r.source.pages[0]} ${s.id} net`).toBeLessThanOrEqual(0.011)
        }
      const got = regressionSummary(pack)
      const file = new URL(`beklenen/${f.replace(/\.pdf$/i, '.json')}`, dir)
      if (save) writeFileSync(file, JSON.stringify(got, null, 1) + '\n')
      expect(existsSync(file), `${f} için beklenen sonuç yok: npm run regresyon:kaydet`).toBe(true)
      expect(got).toEqual(JSON.parse(readFileSync(file, 'utf8')))
    })
  }
})

if (!pdfs.length) it.skip('PDF regresyonu: fixtures/pdf boş — PDF eklenince çalışır', () => {})
