// Hedef simülatörü (LGS): "Hangi derste kaç net daha?" Deneme puanına, derslere eklenen netlerin yaklaşık puan karşılığı eklenir.
// Resmî puan hesabı değildir ve deneme sonuçlarını / puan hesabını hiçbir şekilde değiştirmez (CLAUDE.md §2); ekranda "tahmini" yazar.
// Ağırlıklar LGS'nin ders katsayıları: Türkçe, Matematik, Fen 4; İnkılap, Din, Yabancı dil 1. Tam ağırlıklı net (270) ≈ 500 puan,
// sıfır ≈ 194,75 puan → bir ağırlıklı net ≈ 1,13 puan.

export type LgsDers = 'TUR' | 'MAT' | 'FEN' | 'INK' | 'DIN' | 'ING'
export const LGS_DERSLER: { kod: LgsDers; ad: string; soru: number; katsayi: number }[] = [
  { kod: 'TUR', ad: 'Türkçe', soru: 20, katsayi: 4 },
  { kod: 'MAT', ad: 'Matematik', soru: 20, katsayi: 4 },
  { kod: 'FEN', ad: 'Fen Bilimleri', soru: 20, katsayi: 4 },
  { kod: 'INK', ad: 'T.C. İnkılap Tarihi', soru: 10, katsayi: 1 },
  { kod: 'DIN', ad: 'Din Kültürü', soru: 10, katsayi: 1 },
  { kod: 'ING', ad: 'Yabancı Dil', soru: 10, katsayi: 1 },
]
export const NET_PUAN = (500 - 194.75) / 270

export type Netler = Partial<Record<LgsDers, number>>

/** Son denemenin ders netleri (exam_results.subjects): yalnız LGS dersleri, sayı olanlar. */
export function dersNetleri(subjects: unknown): Netler {
  const out: Netler = {}
  if (!subjects || typeof subjects !== 'object') return out
  for (const d of LGS_DERSLER) {
    const v = (subjects as Record<string, { net?: unknown } | undefined>)[d.kod]?.net
    if (typeof v === 'number' && Number.isFinite(v)) out[d.kod] = Math.max(0, Math.min(d.soru, v))
  }
  return out
}

/** Simülatör için ders netleri: son 3 LGS denemesinin (netleri okunmuş olanlar) ders ortalaması; puan da son 3 denemenin ortalaması. */
export function sonLgsNetleri(rs: { subjects: unknown; exams: { exam_type: string | null } }[]): Netler {
  const son = rs
    .filter((r) => r.exams.exam_type === 'LGS' || r.exams.exam_type === null)
    .map((r) => dersNetleri(r.subjects))
    .filter((n) => Object.keys(n).length)
    .slice(-3)
  const out: Netler = {}
  for (const k of new Set(son.flatMap((n) => Object.keys(n) as (keyof Netler)[]))) {
    const v = son.map((n) => n[k]).filter((x): x is number => x !== undefined)
    out[k] = Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 100) / 100
  }
  return out
}

/** Bir derste en çok kaç net daha eklenebilir (tam sayı). */
export const pay = (netler: Netler, kod: LgsDers) => {
  const d = LGS_DERSLER.find((x) => x.kod === kod)!
  return Math.max(0, Math.floor(d.soru - (netler[kod] ?? 0)))
}

/** Eklenen netlerin yaklaşık puan karşılığı. */
export function tahminiArtis(ek: Netler): number {
  return LGS_DERSLER.reduce((t, d) => t + (ek[d.kod] ?? 0) * d.katsayi * NET_PUAN, 0)
}

/**
 * Gereken puanı en az netle kapatan öneri: her adımda en çok puan kaybedilen derse (kalan soru × katsayı) bir net eklenir.
 * Yalnız netleri bilinen dersler kullanılır. Yetmezse ulaşılabilen en yüksek dağılım döner (yeter = false).
 */
export function oneriDagilim(netler: Netler, gereken: number): { ek: Netler; yeter: boolean } {
  const ek: Netler = {}
  if (gereken <= 0) return { ek, yeter: true }
  const dersler = LGS_DERSLER.filter((d) => netler[d.kod] !== undefined)
  let artis = 0
  for (;;) {
    const aday = dersler
      .filter((d) => (ek[d.kod] ?? 0) < pay(netler, d.kod))
      .sort((a, b) => (pay(netler, b.kod) - (ek[b.kod] ?? 0)) * b.katsayi - (pay(netler, a.kod) - (ek[a.kod] ?? 0)) * a.katsayi || b.katsayi - a.katsayi)[0]
    if (!aday) return { ek, yeter: false }
    ek[aday.kod] = (ek[aday.kod] ?? 0) + 1
    artis += aday.katsayi * NET_PUAN
    if (artis >= gereken - 1e-9) return { ek, yeter: true }
  }
}

/** Hedeflerden varsayılanı: puanın üstündeki en düşük taban; hepsi altındaysa en yüksek taban. */
export function varsayilanHedef<T extends { taban: number }>(hedefler: T[], puan: number): T | undefined {
  const ust = hedefler.filter((h) => h.taban > puan).sort((a, b) => a.taban - b.taban)
  return ust[0] ?? [...hedefler].sort((a, b) => b.taban - a.taban)[0]
}
