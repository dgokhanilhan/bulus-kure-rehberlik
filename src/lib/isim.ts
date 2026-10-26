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

/** Okul numarası aynı mı: "57" = "57"; yayınların ön ekli yazımı "10057" / "1057" = 57 (yalnız destekleyici işaret). */
export function noUyar(okunan: string | null | undefined, kayitli: string | null | undefined): boolean {
  const r = (okunan ?? '').replace(/\D/g, '')
  const s = (kayitli ?? '').replace(/\D/g, '')
  if (!r || !s) return false
  if (Number(r) === Number(s)) return true
  return r.length >= 4 && r.length > s.length && /^10/.test(r) && Number(r.slice(-3)) === Number(s)
}

/**
 * 1) Ad-soyad ve varsa sınıf birebir ve tekse → aynı öğrenci.
 * 2) Okul numarası tekrarlanabilir; kimlik veya öncelik belirlemez.
 * 3) Tek bir adayla en çok 2 harf fark (ve ikinci en yakın aday belirgin uzakta) → yazım düzeltmesi.
 * 4) Aksi halde kontrol ister; en yakın 3 aday önerilir.
 */
export function matchStudent(read: { name: string; number?: string | null; class?: string | null }, roster: RosterStudent[]): MatchResult {
  const classKey = (value: string) => value.toLocaleUpperCase('tr').split('·')[0]!.replace(/\s/g, '')
  // Karnedeki şube okulda yoksa (ör. "7-XX": yazılımın şubesiz öğrencisi) sınıf süzgeci uygulanmaz, ada bakılır
  const read0 = classKey(read.class ?? '')
  const cls = read0 && roster.some((s) => classKey(s.class_name) === read0) ? read0 : ''
  const n = normName(read.name)
  const same = roster.filter((s) => normName(s.full_name) === n)
  const sameCls = cls ? same.filter((s) => classKey(s.class_name) === cls) : same
  if (sameCls.length === 1) return { kind: 'exact', id: sameCls[0]!.id, via: 'name' }
  if (same.length === 1 && !cls) return { kind: 'exact', id: same[0]!.id, via: 'name' }
  // Yayının listesinde boşluksuz yazılmış ad ("SELAHATTİNTUĞRAGENC" ↔ "Selahattin Tuğra Genç"): boşluklar yok sayılınca birebir
  const bitisik = (x: string) => normName(x).replace(/ /g, '')
  const bit = (cls ? roster.filter((s) => classKey(s.class_name) === cls) : roster).filter((s) => bitisik(s.full_name) === bitisik(read.name))
  if (bit.length === 1 && bitisik(read.name).length >= 6) return { kind: 'fixed', id: bit[0]!.id, via: 'name' }
  // Karnedeki şube farklı ama ad soyad okulda tek öğrenciye ait (yayının listesi eski ya da şube yanlış yazılmış):
  // kendiliğinden eşleşmez (başka şube = kontrol), ama ilk aday olarak önerilir
  const baskaSube = cls && !sameCls.length && same.length === 1 ? same[0]!.id : null

  const pool = cls ? roster.filter((s) => classKey(s.class_name) === cls) : roster
  if (baskaSube) {
    const yakin = pool.map((s) => ({ s, d: nameDistance(read.name, s.full_name) })).sort((a, b) => a.d - b.d).filter((x) => x.d <= 2).slice(0, 2)
    return { kind: 'unknown', candidates: [baskaSube, ...yakin.map((x) => x.s.id)] }
  }
  // İkinci ad yazılmamış: "ELİF TAŞ" ↔ "ELİF DURU TAŞ" (ilk ad ve soyad aynı, okunan adlar sırayla içinde). Sınıfta tek adaysa
  // ya da yayının ön ekli okul numarası ("10057" ↔ 57) adaylardan birini ayırıyorsa düzeltme sayılır.
  const rw = n.split(' ')
  const altKume = (full: string) => {
    const w = normName(full).split(' ')
    if (rw.length < 2 || w.length <= rw.length || w[0] !== rw[0] || w.at(-1) !== rw.at(-1)) return false
    let i = 0
    for (const x of w) if (x === rw[i]) i++
    return i === rw.length
  }
  const eksikAd = pool.filter((s) => altKume(s.full_name))
  if (eksikAd.length === 1) return { kind: 'fixed', id: eksikAd[0]!.id, via: 'name' }
  const noAday = eksikAd.filter((s) => noUyar(read.number, s.school_no))
  if (eksikAd.length > 1 && noAday.length === 1) return { kind: 'fixed', id: noAday[0]!.id, via: 'no' }
  // İlk ad yazılmamış, öğrenci ikinci adıyla ("ZEKİ PEKTEZEL" ↔ "Ömer Zeki Pektezel"): soyad aynı, okunan adlar sırayla içinde;
  // daha belirsiz olduğu için okul numarası da tutmalı ve sınıfta tek aday olmalı
  const ikinciAd = pool.filter((s) => {
    const w = normName(s.full_name).split(' ')
    if (rw.length < 2 || w.length <= rw.length || w[0] === rw[0] || w.at(-1) !== rw.at(-1)) return false
    let i = 0
    for (const x of w) if (x === rw[i]) i++
    return i === rw.length
  })
  if (ikinciAd.length === 1 && noUyar(read.number, ikinciAd[0]!.school_no)) return { kind: 'fixed', id: ikinciAd[0]!.id, via: 'no' }
  const ranked = pool.map((s) => ({ s, d: nameDistance(read.name, s.full_name) })).sort((a, b) => a.d - b.d)
  const best = ranked[0]
  const second = ranked[1]
  if (best && best.d <= 2 && n.length >= 6 && (!second || second.d - best.d >= 2)) return { kind: 'fixed', id: best.s.id, via: 'name' }
  return {
    kind: 'unknown',
    candidates: ranked
      .slice(0, 3)
      .filter((x) => x.d <= Math.max(4, n.length / 3))
      .map((x) => x.s.id),
  }
}
