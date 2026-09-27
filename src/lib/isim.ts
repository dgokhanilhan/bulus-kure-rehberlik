// PDF'ten okunan öğrenci adını okul listesiyle eşleştirme (yerel; yapay zekâ yalnız belirsizlerde).
// Kural: emin olunmayan eşleşme otomatik yapılmaz, kontrol ekranına düşer (CLAUDE.md §1).
import { fold } from './format'

export interface RosterStudent {
  id: string
  full_name: string
  class_name: string
  school_no: string | null
}

export type MatchResult =
  | { kind: 'exact'; id: string; via: 'no' | 'name' }
  | { kind: 'fixed'; id: string; via: 'no' | 'name' } // yazım hatası düzeltildi
  | { kind: 'unknown'; candidates: string[] } // kontrol ister

export const normName = (s: string) =>
  fold(s)
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

export function lev(a: string, b: string) {
  const m = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    let prev = m[0]!
    m[0] = i
    for (let j = 1; j <= b.length; j++) {
      const t = m[j]!
      m[j] = Math.min(m[j]! + 1, m[j - 1]! + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1))
      prev = t
    }
  }
  return m[b.length]!
}

/** Ad benzerliği: kelime sırası farklı olsa da ("KAYA ZEYNEP") yakalanır. */
export function nameDistance(a: string, b: string) {
  const x = normName(a)
  const y = normName(b)
  const sorted = (s: string) => s.split(' ').sort().join(' ')
  return Math.min(lev(x, y), lev(sorted(x), sorted(y)))
}

/**
 * 1) Şube + okul no aynıysa ve ad makul ölçüde benziyorsa → aynı öğrenci.
 * 2) Ad (Türkçe katlanmış) birebir ve tekse → aynı öğrenci.
 * 3) Tek bir adayla en çok 2 harf fark (ve ikinci en yakın aday belirgin uzakta) → yazım düzeltmesi.
 * 4) Aksi halde kontrol ister; en yakın 3 aday önerilir.
 */
export function matchStudent(read: { name: string; number?: string | null; class?: string | null }, roster: RosterStudent[]): MatchResult {
  const no = (read.number ?? '').replace(/\D/g, '')
  const cls = (read.class ?? '').toLocaleUpperCase('tr').replace(/\s/g, '')
  const byNo = no ? roster.filter((s) => s.school_no === no && (!cls || s.class_name === cls)) : []
  if (byNo.length === 1) {
    const d = nameDistance(read.name, byNo[0]!.full_name)
    if (d === 0) return { kind: 'exact', id: byNo[0]!.id, via: 'no' }
    if (d <= Math.max(3, Math.floor(normName(byNo[0]!.full_name).length / 4))) return { kind: 'fixed', id: byNo[0]!.id, via: 'no' }
  }
  const n = normName(read.name)
  const same = roster.filter((s) => normName(s.full_name) === n)
  const sameCls = cls ? same.filter((s) => s.class_name === cls) : same
  if (sameCls.length === 1) return { kind: 'exact', id: sameCls[0]!.id, via: 'name' }
  if (same.length === 1 && !cls) return { kind: 'exact', id: same[0]!.id, via: 'name' }

  const pool = cls && roster.some((s) => s.class_name === cls) ? roster.filter((s) => s.class_name === cls) : roster
  const ranked = pool.map((s) => ({ s, d: nameDistance(read.name, s.full_name) })).sort((a, b) => a.d - b.d)
  const best = ranked[0]
  const second = ranked[1]
  if (best && best.d <= 2 && n.length >= 6 && (!second || second.d - best.d >= 2)) return { kind: 'fixed', id: best.s.id, via: 'name' }
  return { kind: 'unknown', candidates: ranked.slice(0, 3).filter((x) => x.d <= Math.max(4, n.length / 3)).map((x) => x.s.id) }
}
