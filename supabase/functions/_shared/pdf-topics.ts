/** PDF'nin konu başına verdiği sayılar; resmî kazanım veya soru eşlemesi değildir. */
export interface PdfTopic { section: string; title: string; n: number; d: number; y: number; b: number }
export const pdfTopicKey = (t: PdfTopic) => `pdf-topic:${t.section}:${t.title.trim().toLocaleUpperCase('tr')}`

/** Kaynaktan gelen sayıları her okumada ders toplamlarıyla doğrula. */
export function validPdfTopics(raw: unknown, subjects: Record<string, unknown>): PdfTopic[] {
  if (!Array.isArray(raw) || raw.length > 500) return []
  const groups = new Map<string, unknown[]>()
  for (const t of raw) {
    if (t && typeof t.section === 'string') groups.set(t.section, [...(groups.get(t.section) ?? []), t])
  }
  const valid: PdfTopic[] = []
  for (const [section, entries] of groups) {
    const rows = entries as PdfTopic[]
    const result = subjects[section] as Record<string, number> | undefined
    if (!result || !['d','y','b'].every(k=>Number.isInteger(result[k]) && result[k]!>=0)) continue
    if (!rows.every(t=>typeof t.title==='string' && t.title.trim().length>=2 && t.title.length<=500 &&
      ['n','d','y','b'].every(k=>Number.isInteger(t[k as keyof PdfTopic]) && Number(t[k as keyof PdfTopic])>=0) &&
      t.n>0 && t.n===t.d+t.y+t.b)) continue
    if (new Set(rows.map(pdfTopicKey)).size!==rows.length) continue
    if (!['d','y','b'].every(k=>rows.reduce((sum,t)=>sum+Number(t[k as keyof PdfTopic]),0)===result[k])) continue
    valid.push(...rows)
  }
  return valid
}
