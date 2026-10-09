/** Uzun deneme adının başlangıcını ve ayırt edici numarasını/sonunu korur. */
export function chartLabel(label: string, limit: number): string {
  const chars = Array.from(label)
  if (chars.length <= limit) return label
  const end = Math.min(6, Math.floor((limit - 1) / 2))
  return `${chars.slice(0, limit - end - 1).join('').trimEnd()}…${chars.slice(-end).join('').trimStart()}`
}
