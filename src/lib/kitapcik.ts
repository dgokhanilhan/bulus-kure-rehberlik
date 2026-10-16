// Kitapçık ayırma (A/B): kitapçığı yazmayan karnelerde öğrencinin kitapçığı, karnedeki cevap anahtarından bulunur.
// A ve B kitapçıkları aynı soru numarasında farklı anahtar (ve kazanım) taşır; anahtarı aynı olan öğrenciler aynı
// kitapçıktadır. Karar verilemeyen öğrenci null kalır (çağıran eski davranışa ve anahtar uyuşmazlığı korumasına döner).
// LGS (deneme.ts) ve genel denemeler (genelImport.ts) aynı kuralı kullanır.

export interface KitapcikGirdi {
  /** PDF'te okunan kitapçık (yoksa null) */
  known: string | null
  /** Soru sırasıyla anahtar harfleri; okunamayan/iptal soru '?' */
  key: string
}

/** İki anahtar farklı kitapçık mı: karşılaştırılabilen soruların %25'inden fazlası farklıysa. Az soru varsa karar yok. */
const MIN_SORU = 5
function fark(a: string, b: string): number | null {
  let n = 0,
    d = 0
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    if (a[i] === '?' || b[i] === '?') continue
    n++
    if (a[i] !== b[i]) d++
  }
  return n < MIN_SORU ? null : d / n
}
const AYNI = 0.25

export function kitapcikAyir(entries: KitapcikGirdi[]): (string | null)[] {
  const out: (string | null)[] = entries.map((e) => e.known)
  if (entries.every((e) => e.known)) return out
  // Bilinen kitapçıkların temsilci anahtarı (en çok okunmuş soru içeren)
  const clusters: { booklet: string; key: string }[] = []
  const known = (e: KitapcikGirdi) => e.key.replace(/\?/g, '').length
  for (const e of entries) {
    if (!e.known) continue
    const c = clusters.find((x) => x.booklet === e.known)
    if (!c) clusters.push({ booklet: e.known, key: e.key })
    else if (known(e) > c.key.replace(/\?/g, '').length) c.key = e.key
  }
  // Kitapçığı bilinmeyenler: en sık görülen anahtar önce (ilk yeni kitapçık A, sonraki B)
  const freq = new Map<string, number>()
  for (const e of entries) if (!e.known) freq.set(e.key, (freq.get(e.key) ?? 0) + 1)
  const order = entries
    .map((e, i) => ({ e, i }))
    .filter((x) => !x.e.known)
    .sort((a, b) => (freq.get(b.e.key) ?? 0) - (freq.get(a.e.key) ?? 0))
  for (const { e, i } of order) {
    let best: { c: (typeof clusters)[number]; d: number } | null = null
    let undecided = false
    for (const c of clusters) {
      const d = fark(e.key, c.key)
      if (d === null) undecided = true
      else if (d <= AYNI && (!best || d < best.d)) best = { c, d }
    }
    if (best) {
      out[i] = best.c.booklet
      continue
    }
    if (undecided || fark(e.key, e.key) === null) continue // az okunmuş anahtar: karar yok
    const free = ['A', 'B'].find((b) => !clusters.some((c) => c.booklet === b))
    if (!free) continue // üçüncü bir anahtar: karar yok (koruma devrede)
    clusters.push({ booklet: free, key: e.key })
    out[i] = free
  }
  return out
}
