import { describe, expect, it } from 'vitest'
import { chartLabel } from './chartLabel'
import { outcomeTitle } from './outcomeTitle'
import { outcomeAnalysis } from './denemeGenel'
import { aiFeatureAllowed } from '../../supabase/functions/_shared/transfer-policy'
import { fillStudent, validateReport } from '../../supabase/functions/_shared/rapor-ai'

describe('Yayın öncesi inceleme regresyonları', () => {
  it('raporun açılması başka AI özelliklerine aktarım izni vermez', () => {
    expect(aiFeatureAllowed('ai-veli-raporu', 'true', 'false', 'https://db.example', 'https://api.deepseek.com')).toBe(true)
    expect(aiFeatureAllowed('isim-eslestir', 'true', 'false', 'https://db.example', 'https://api.deepseek.com')).toBe(false)
  })
  it('eski ad yer tutucusunu gerçek isimle doldurmaz; bozuk model cevabı reddedilir', () => {
    const r = fillStudent({ genel: "{AD}'ın netleri yükseliyor.", guclu: '{AD} düzenli ilerliyor.', gelisim: 'Kısa tekrarlar yapılabilir.', oneriler: ['{AD} ile plan hazırlansın.'], mentorOneri: '{AD} ile yanlış soruları inceleyebiliriz.' })
    expect(r.genel).toBe('Öğrencimizin netleri yükseliyor.')
    expect(r.mentorOneri).toContain('Öğrencimiz ile')
    for (const text of ['null', '[]', '42']) expect(validateReport(text).ok).toBe(false)
  })
  it('aynı ön eke sahip denemelerin ayırt edici sonunu korur', () => {
    const labels = [2, 3, 4].map(n => chartLabel(`6.SINIF GELİŞİM VE DEĞERLENDİRME-${n}`, 18))
    expect(new Set(labels).size).toBe(3)
    expect(labels.every(l => l.length <= 18)).toBe(true)
    expect(labels[0]).toMatch(/-2$/)
    expect(chartLabel('Deneme 10', 18)).toBe('Deneme 10')
  })
  it('PDF sütun başlığını temizler; okulun eklediği metne dokunmaz', () => {
    const title = 'Kültürel etkileşimin rolünü VE SÜREÇ BİLEŞENLERİ yapılandırabilme'
    expect(outcomeTitle(title)).toBe('Kültürel etkileşimin rolünü yapılandırabilme')
    expect(outcomeTitle(title, 'pdf')).toBe(title)
  })
  const item = (q_no: number) => ({ section_key: 'FEN', q_no, learning_outcome_id: `k${q_no}`, learning_outcomes: { code: `k${q_no}`, title: `Hedef ${q_no}` } })
  it('eksik soru kataloğunda cevapları gerçek soru numaralarıyla sayar', () => {
    const a = outcomeAnalysis([item(3), item(1)], { FEN: 'Ab_' })
    expect(a.skipped).toEqual([])
    expect(a.unresolved).toBe(1)
    expect(a.rows.find(r => r.id === 'k3')).toMatchObject({ d: 0, y: 0, b: 1 })
    expect(a.rows.find(r => r.id === 'k1')).toMatchObject({ d: 1, y: 0, b: 0 })
  })
  it('tekrar eden veya cevap dışında kalan soru numarasıyla analiz üretmez', () => {
    for (const items of [[item(1), item(1)], [item(4)], [item(0)]]) {
      const a = outcomeAnalysis(items, { FEN: 'Ab_' })
      expect(a.rows).toEqual([])
      expect(a.skipped).toEqual(['FEN'])
    }
  })
})
