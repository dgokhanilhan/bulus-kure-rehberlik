import { fmt } from '@/lib/analiz'

/**
 * Gelişim grafiği (prototipteki lineChart): primary 3px çizgi, son noktalar vurgulu,
 * isteğe bağlı kendi ortalaması (kesikli). Deneme adları tıklanır → detay.
 */
export function LineChart({
  values,
  labels,
  onSelect,
  avg,
  width = 640,
  height = 240,
}: {
  values: number[]
  labels: string[]
  onSelect?: (i: number) => void
  avg?: boolean
  width?: number
  height?: number
}) {
  if (!values.length) return null
  const W = Math.max(width, values.length * 110),
    H = height,
    top = 28,
    bot = H - 34
  const mn = Math.min(...values),
    mx = Math.max(...values)
  const lo = Math.floor((mn - 4) / 10) * 10,
    hi = Math.ceil((mx + 4) / 10) * 10
  const Y = (v: number) => bot - ((v - lo) / (hi - lo || 1)) * (bot - top)
  const X = (i: number) => 52 + i * ((W - 80) / Math.max(1, values.length - 1))
  const grid: number[] = []
  for (let v = lo; v <= hi; v += 10) grid.push(v)
  const pts = values.map((v, i) => `${X(i)},${Y(v)}`).join(' ')
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  return (
    // Tıklanabilir deneme adları varsa "group" (img rolü içindeki düğmeleri ekran okuyucu görmez).
    <div style={{ overflowX: 'auto' }}><svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', minWidth: W, height: 'auto' }} role={onSelect ? 'group' : 'img'} aria-label={`Toplam net: ${values.map((v) => fmt(v)).join(', ')}`}>
      {grid.map((v) => (
        <g key={v}>
          <line x1="42" x2={W - 10} y1={Y(v)} y2={Y(v)} stroke="var(--line)" />
          <text x="34" y={Y(v) + 4} textAnchor="end" fill="var(--ink-muted)" fontSize="12">
            {v}
          </text>
        </g>
      ))}
      {avg && <line x1="42" x2={W - 10} y1={Y(mean)} y2={Y(mean)} stroke="var(--ink-muted)" strokeDasharray="5 5" />}
      <polygon points={`${X(0)},${bot} ${pts} ${X(values.length - 1)},${bot}`} fill="var(--primary)" opacity=".08" />
      <polyline className="draw" pathLength={1} points={pts} fill="none" stroke="var(--primary)" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
      {values.map((v, i) => (
        <g
          key={i}
          className={onSelect ? 'xl' : undefined}
          role={onSelect ? 'button' : undefined}
          tabIndex={onSelect ? 0 : undefined}
          aria-label={onSelect ? `${labels[i]} detayı` : undefined}
          onClick={onSelect ? () => onSelect(i) : undefined}
          onKeyDown={onSelect ? (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onSelect(i)) : undefined}
        >
          <rect x={X(i) - 30} y={top - 20} width="60" height={H - top + 14} fill="transparent" />
          <circle cx={X(i)} cy={Y(v)} r="6" fill="var(--surface)" stroke="var(--primary)" strokeWidth="2.5" />
          <text x={X(i)} y={Y(v) - 13} textAnchor="middle" fill="var(--ink)" fontSize="12" fontWeight="600">
            {fmt(v)}
          </text>
          <text className="lbl" x={X(i)} y={H - 10} textAnchor="middle" fill="var(--ink-muted)" fontSize="12.5" textDecoration={onSelect ? 'underline' : undefined}>
            <title>{labels[i]}</title>
            {labels[i]!.length > Math.max(3, Math.min(18, Math.floor((W-80)/Math.max(1,values.length)/8))) ? labels[i]!.slice(0, Math.max(3, Math.min(18, Math.floor((W-80)/Math.max(1,values.length)/8)))-1)+'…' : labels[i]}
          </text>
        </g>
      ))}
    </svg></div>
  )
}
