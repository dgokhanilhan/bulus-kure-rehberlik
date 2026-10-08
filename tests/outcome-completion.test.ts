import { it, expect } from 'vitest'
import { completionFor } from '../src/lib/outcomeCompletion'
const row = { id: 'pdf', grade: 6, subject_code: 'FEN', outcome_type: 'OGRENME_CIKTISI', title: 'Sinir sisteminin g', code: 'FB.6.3.2.1' }
const official = { ...row, id: 'official', title: 'Sinir sisteminin görevlerini açıklayabilme' }
it('tekil, aynı ders/sınıf/türdeki metin başlangıcını tamamlar', () => {
  expect(completionFor(row, [official])).toBe(official)
  expect(completionFor(row, [{ ...official, grade: 7 }])).toBeNull()
  expect(completionFor(row, [{ ...official, subject_code: 'TUR' }])).toBeNull()
  expect(completionFor(row, [{ ...official, outcome_type: 'KAZANIM' }])).toBeNull()
})
it('aynı kod farklı metni, çok kısa, zaten tam ve belirsiz başlangıçları tamamlamaz', () => {
  expect(completionFor(row, [{ ...official, title: 'Başka bir konu hakkında bilgi toplar.' }])).toBeNull()
  expect(completionFor({ ...row, title: 'Sinir' }, [official])).toBeNull()
  expect(completionFor(official, [official])).toBeNull()
  expect(completionFor(row, [official, { ...official, id: 'other', title: 'Sinir sisteminin görevlerini analiz edebilme' }])).toBeNull()
})
