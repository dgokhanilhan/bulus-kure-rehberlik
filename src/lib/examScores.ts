/** PDF'de bildirilen alan puanları; hesaplama ya da en yüksek puanı seçme yok. */
export type ExamScores = Partial<Record<'SAY' | 'EA' | 'SOZ' | 'DIL', number>>
export function examScores(source: unknown): ExamScores {
  const raw = source && typeof source === 'object' ? (source as { scores?: unknown }).scores : null
  if (!raw || typeof raw !== 'object') return {}
  const aliases: Record<string, keyof ExamScores> = {
    SAY: 'SAY',
    SAYISAL: 'SAY',
    EA: 'EA',
    'EŞİT AĞIRLIK': 'EA',
    SOZ: 'SOZ',
    SÖZEL: 'SOZ',
    DIL: 'DIL',
    DİL: 'DIL',
  }
  const out: ExamScores = {}
  for (const [k, v] of Object.entries(raw)) if (aliases[k] && typeof v === 'number' && Number.isFinite(v) && v >= 0) out[aliases[k]!] = v
  return out
}
export function scoreText(r: { score: number | null; scores?: ExamScores }) {
  const values = Object.entries(r.scores ?? {})
  if (values.length)
    return values.map(([k, v]) => `${k === 'SOZ' ? 'SÖZ' : k === 'DIL' ? 'DİL' : k}: ${v.toLocaleString('tr-TR', { maximumFractionDigits: 3 })}`).join(' · ')
  return r.score !== null ? r.score.toLocaleString('tr-TR', { maximumFractionDigits: 3 }) : '—'
}
