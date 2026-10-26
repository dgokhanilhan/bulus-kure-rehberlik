// Veli toplantısı konuşma metni: örnek verideki bütün öğrenciler için "öğrencimiz" kalmaz, ad geçer, yasaklı / etiketleyici
// ifade ve teknik terim yok (CLAUDE.md §8, docs/veli-raporu-kurallari.md).
import { beforeAll, describe, expect, it } from 'vitest'
import { loadDataset } from './helpers'
import { findForbidden, reportData } from '../src/lib/rapor'
import { degerlendirmeMetni } from '../src/lib/veliToplantiMetni'
import { indexResults, studentExams, type Dataset } from '../src/lib/analiz'

let ds: Dataset
beforeAll(async () => {
  ds = await loadDataset()
})

describe('veli toplantısı değerlendirme metni', () => {
  it('her öğrenci: adla, konuşma dilinde, yasaklı ve teknik terim yok', () => {
    const idx = indexResults(ds.results)
    const ogr = [...new Set(ds.results.map((r) => r.student_id))]
    expect(ogr.length).toBeGreaterThan(3)
    for (const sid of ogr) {
      const ex = studentExams(ds, sid, idx)
      const R = reportData(ds, sid, ex.at(-1)!.exam.id)
      const p = degerlendirmeMetni(R, 'Deniz', sid)
      const t = p.join(' ')
      expect(p.length).toBeGreaterThanOrEqual(3)
      expect(t).not.toMatch(/[Öö]ğrencimiz/)
      expect(t).toMatch(/Deniz/)
      expect(findForbidden(t)).toEqual([])
      expect(t).not.toMatch(/OCR|confidence|CODE_EXACT|kazanım kodu/i)
    }
    expect(degerlendirmeMetni(null, 'Deniz', 'x')[0]).toMatch(/henüz değerlendirebileceğimiz bir deneme sonucu yok/)
  })
})
