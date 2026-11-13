// Öğretmenler Odası (0068): saf hesaplar (birim testi tarayıcısız çalışsın diye veri erişiminden ayrı)
// data.ts'e bağlanmaz: birim testleri (tsconfig.node) '@/…' yollarını çözmez
type HwStatus = 'bekliyor' | 'yapti' | 'yapmadi' | 'getirmedi' | 'eksik' | 'gelmedi' | 'izinli'

export const KADEMELER = ['ilkokul', 'ortaokul', 'lise'] as const
export type Kademe = (typeof KADEMELER)[number]
const KADEME_TR: Record<Kademe, string> = { ilkokul: 'İlkokul', ortaokul: 'Ortaokul', lise: 'Lise' }

/** Kanal listesindeki kademelerden sayfa adı: "Ortaokul Öğretmenler Odası", "Ortaokul/Lise Öğretmenler Odası"… */
export function odaAdi(kanallar: readonly string[]): string {
  const k = KADEMELER.filter((x) => kanallar.includes(x)).map((x) => KADEME_TR[x])
  return k.length ? `${k.join('/')} Öğretmenler Odası` : 'Öğretmenler Odası'
}

/** Kanalın ekrandaki adı */
export function kanalAdi(k: string): string {
  if (k === 'genel') return 'Genel'
  if (k.startsWith('zumre:')) return `${k.slice(6)} zümresi`
  return KADEME_TR[k as Kademe] ?? k
}
/** Kanalın açıklaması */
export function kanalAciklama(k: string): string {
  if (k === 'genel') return 'okulun bütün öğretmenleri'
  if (k.startsWith('zumre:')) return `${k.slice(6)} öğretmenleri`
  return `${(KADEME_TR[k as Kademe] ?? k).toLocaleLowerCase('tr')} öğretmenleri`
}
/** Kanal sırası: Genel, kademeler, zümreler (ada göre) */
export function kanalSirala(l: readonly string[]): string[] {
  const p = (k: string) => (k === 'genel' ? 0 : (KADEMELER as readonly string[]).includes(k) ? 1 + KADEMELER.indexOf(k as Kademe) : 10)
  return [...l].sort((a, b) => p(a) - p(b) || a.localeCompare(b, 'tr'))
}

export const MESAJ_EN_COK = 2000
export const SAKLAMA_GUN = 30
export const TEPKILER = ['👍', '❤️', '😂', '😮', '🙏', '👏'] as const

/** Metinde hâlâ "@Ad Soyad" olarak geçen kişiler (seçilip sonra silinenler anılmaz) */
export function anilanlar(metin: string, secilen: readonly { id: string; ad: string }[]): string[] {
  return [...new Set(secilen.filter((k) => metin.includes(`@${k.ad}`)).map((k) => k.id))]
}

/** Yazılan sözcüğün sonundaki "@arama" (öneri listesi için); yoksa null */
export function anmaAramasi(metin: string, imlec: number): { bas: number; q: string } | null {
  const once = metin.slice(0, imlec)
  const m = /(^|\s)@([^\s@]{0,30})$/u.exec(once)
  return m ? { bas: imlec - m[2]!.length - 1, q: m[2]! } : null
}

/** Mesaj metnini düz parçalara ve anma parçalarına böler (vurgulamak için) */
export function anmaParcala(metin: string, adlar: readonly string[]): { t: string; anma: boolean }[] {
  const s = [...adlar].filter(Boolean).sort((a, b) => b.length - a.length)
  if (!s.length) return [{ t: metin, anma: false }]
  const kac = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(`@(${s.map(kac).join('|')})`, 'gu')
  const out: { t: string; anma: boolean }[] = []
  let i = 0
  for (const m of metin.matchAll(re)) {
    if (m.index! > i) out.push({ t: metin.slice(i, m.index), anma: false })
    out.push({ t: m[0], anma: true })
    i = m.index! + m[0].length
  }
  if (i < metin.length) out.push({ t: metin.slice(i), anma: false })
  return out
}

// ---------- Öğrenci Takip ----------
/** Ödev: yapılan / değerlendirilen (bekleyen, izinli ve gelmeyen sayılmaz) */
export function odevOzeti(durumlar: readonly HwStatus[]): { yapti: number; toplam: number; oran: number | null } {
  const say = durumlar.filter((d) => d === 'yapti' || d === 'yapmadi' || d === 'getirmedi' || d === 'eksik')
  const yapti = say.filter((d) => d === 'yapti').length
  return { yapti, toplam: say.length, oran: say.length ? yapti / say.length : null }
}

export type DevSeviye = 'normal' | 'sari' | 'turuncu' | 'kirmizi'
export interface TakipSatiri {
  d: number | null
  odevOran: number | null
  devSeviye: DevSeviye | null
  gkAy: number
}
export const DUSUS_ESIK = -1
export const ODEV_ESIK = 0.7
export const GK_ESIK = 3

/** Dikkat gerektirenler: belirgin düşüş, ödev oranı düşük, devamsızlık sınıra yakın ya da bu ay ≥3 günlük kontrol eksiği */
export function dikkatNedenleri(r: TakipSatiri): string[] {
  const n: string[] = []
  if (r.d != null && r.d < DUSUS_ESIK) n.push('Düşüşte')
  if (r.odevOran != null && r.odevOran < ODEV_ESIK) n.push('Ödevi eksik')
  if (r.devSeviye === 'turuncu' || r.devSeviye === 'kirmizi') n.push('Devamsızlık')
  if (r.gkAy >= GK_ESIK) n.push('Günlük kontrol')
  return n
}

export type TakipSuzgec = 'hepsi' | 'dikkat' | 'dusus' | 'odev' | 'devamsizlik'
export function suzgecUyar(r: TakipSatiri, f: TakipSuzgec): boolean {
  if (f === 'hepsi') return true
  const n = dikkatNedenleri(r)
  if (f === 'dikkat') return n.length > 0
  if (f === 'dusus') return n.includes('Düşüşte')
  if (f === 'odev') return n.includes('Ödevi eksik')
  return n.includes('Devamsızlık')
}

/** Küçük gidişat çizgisi (SVG polyline noktaları); en az 2 değer gerekir */
export function cizgiNoktalari(degerler: readonly number[], g = 84, y = 22, pay = 2): string | null {
  if (degerler.length < 2) return null
  const min = Math.min(...degerler)
  const max = Math.max(...degerler)
  const ara = max - min || 1
  return degerler
    .map((v, i) => `${Math.round((pay + (i * (g - 2 * pay)) / (degerler.length - 1)) * 10) / 10},${Math.round((y - pay - ((v - min) / ara) * (y - 2 * pay)) * 10) / 10}`)
    .join(' ')
}

/** Seçili sınıflar (cihazda hatırlanır); bilinmeyenler atılır */
export function secimOku(ham: string | null, gecerli: readonly string[]): string[] {
  try {
    const l = JSON.parse(ham ?? '[]') as unknown
    return Array.isArray(l) ? l.filter((x): x is string => typeof x === 'string' && gecerli.includes(x)) : []
  } catch {
    return []
  }
}
