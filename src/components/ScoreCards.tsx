import type { ExamScores } from '@/lib/examScores'

const FIELDS = [
  ['SAY', 'SAY', 'Sayısal'], ['EA', 'EA', 'Eşit ağırlık'],
  ['SOZ', 'SÖZ', 'Sözel'], ['DIL', 'DİL', 'Yabancı dil'],
] as const

/** Yalnız bildirilen puanları gösterir; alan seçmez, puan hesaplamaz. */
export function ScoreCards({ score, scores = {}, compact = false }: { score: number | null; scores?: ExamScores; compact?: boolean }) {
  const fields = FIELDS.filter(([key]) => scores[key] !== undefined)
  const number = (value: number) => value.toLocaleString('tr-TR', { maximumFractionDigits: 3 })
  return (
    <dl className={`score-cards${compact ? ' compact' : ''}`} aria-label="Puanlar">
      {fields.length ? fields.map(([key, label, title]) => (
        <div className="score-card" key={key}>
          <dt><span>{label}</span><small>{title}</small></dt>
          <dd>{number(scores[key]!)}</dd>
        </div>
      )) : <div className="score-card"><dt>Puan</dt><dd>{score == null ? '—' : number(score)}</dd></div>}
    </dl>
  )
}
