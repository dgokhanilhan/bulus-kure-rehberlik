export const lower = (s: string) => s.toLocaleLowerCase('tr')

/** Türkçe karakterleri katlayarak karşılaştırma anahtarı üretir (isim eşleştirme). */
export const fold = (s: string) =>
  lower(s.trim().replace(/\s+/g, ' '))
    .replace(/ı/g, 'i').replace(/ğ/g, 'g').replace(/ü/g, 'u')
    .replace(/ş/g, 's').replace(/ö/g, 'o').replace(/ç/g, 'c').replace(/i̇/g, 'i')

export const initials = (n: string) =>
  n.split(/\s+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toLocaleUpperCase('tr')

export function ago(iso: string, now = Date.now()) {
  const s = (now - new Date(iso).getTime()) / 1000
  if (s < 60) return 'şimdi'
  if (s < 3600) return `${Math.floor(s / 60)} dk önce`
  if (s < 86400) return `${Math.floor(s / 3600)} sa önce`
  return `${Math.floor(s / 86400)} gün önce`
}

export const todayLong = (d = new Date()) =>
  d.toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' })

// ---------- Tarih (okul saati: Türkiye) ----------
const TZ = 'Europe/Istanbul'
const ymd = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)

/** Bugünün tarihi (YYYY-MM-DD, Türkiye saatiyle). */
export const todayISO = (now = new Date()) => ymd(now)
const noon = (iso: string) => new Date(`${iso}T12:00:00Z`)
export const addDays = (iso: string, n: number) => {
  const d = noon(iso)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
/** Haftanın günü: 1 = Pazartesi … 7 = Pazar. */
export const isoDow = (iso: string) => noon(iso).getUTCDay() || 7
/** Tarihin içinde olduğu haftanın pazartesisi. */
export const weekStart = (iso: string) => addDays(iso, 1 - isoDow(iso))
export const GUN = ['', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'] as const

/** Bir sonraki haftanın günü (1 = Pazartesi … 7 = Pazar), bugünden sonra. */
export const nextDow = (isoDow: number, from = todayISO()) => {
  for (let i = 1; i <= 7; i++) {
    const d = addDays(from, i)
    if ((noon(d).getUTCDay() || 7) === isoDow) return d
  }
  return addDays(from, 7)
}
export const trD = (iso: string) => noon(iso).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', timeZone: 'UTC' })
export const trDW = (iso: string) => noon(iso).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', weekday: 'long', timeZone: 'UTC' })
export const trDShort = (iso: string) => noon(iso).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', weekday: 'short', timeZone: 'UTC' })
export const trDayShort = (iso: string) => noon(iso).toLocaleDateString('tr-TR', { weekday: 'short', timeZone: 'UTC' })
export const trDM = (iso: string) => noon(iso).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', timeZone: 'UTC' })

/** timestamptz → Türkiye saatinde tarih ve saat. */
export const localDate = (ts: string) => ymd(new Date(ts))
export const localHM = (ts: string) => new Intl.DateTimeFormat('tr-TR', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(ts))
/** Türkiye saatinde gün + saat → timestamptz (Türkiye 2016'dan beri sabit UTC+3). */
export const toTs = (date: string, hm: string) => `${date}T${hm}:00+03:00`

/** Türkçe iyelik eki: "Elif" → "Elif'in", "Kerem" → "Kerem'in", "Ayşe" → "Ayşe'nin". */
export function gen(name: string) {
  const w = name.trim()
  const vowels = 'aeıioöuü'
  const lastV = [...w.toLocaleLowerCase('tr')].reverse().find((c) => vowels.includes(c)) ?? 'e'
  const suf = ({ a: 'ın', ı: 'ın', e: 'in', i: 'in', o: 'un', u: 'un', ö: 'ün', ü: 'ün' } as Record<string, string>)[lastV]!
  return `${w}'${vowels.includes(w.slice(-1).toLocaleLowerCase('tr')) ? 'n' : ''}${suf}`
}
