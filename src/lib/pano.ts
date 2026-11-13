// Öğretmenler Odası Pano (0070): saf hesaplar.

/** Bu haftanın (Pazartesi–bugün) en çok alkış alan teşekkürü; eşitlikte en yenisi. Alkışsızsa yok. */
export function haftaninTesekkuru<T extends { created_at: string; oda_tesekkur_alkis: unknown[] }>(l: readonly T[], bugun: string): T | null {
  const d = new Date(`${bugun}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() || 7) - 1))
  const pzt = d.toISOString().slice(0, 10)
  const aday = l
    .filter((t) => trGun(t.created_at) >= pzt && t.oda_tesekkur_alkis.length > 0)
    .sort((a, b) => b.oda_tesekkur_alkis.length - a.oda_tesekkur_alkis.length || b.created_at.localeCompare(a.created_at))
  return aday[0] ?? null
}
/** Türkiye saatinde gün (UTC+3) */
export const trGun = (ts: string) => new Date(new Date(ts).getTime() + 3 * 3600_000).toISOString().slice(0, 10)

/** Doğum günleri: bugünden itibaren n gün içinde olanlar, yakın olan önce */
export function yaklasanDogumGunleri<T extends { ay: number; gun: number }>(l: readonly T[], bugun: string, n = 7): (T & { kalan: number })[] {
  const b = new Date(`${bugun}T12:00:00Z`)
  return l
    .map((x) => {
      let t = Date.UTC(b.getUTCFullYear(), x.ay - 1, x.gun, 12)
      if (t < b.getTime()) t = Date.UTC(b.getUTCFullYear() + 1, x.ay - 1, x.gun, 12)
      return { ...x, kalan: Math.round((t - b.getTime()) / 86400_000) }
    })
    .filter((x) => x.kalan <= n)
    .sort((a, c) => a.kalan - c.kalan)
}
