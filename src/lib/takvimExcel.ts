// Takvim Excel aktarımı: satırları okur, tarih / tür / sınıf alanlarını çözer. Saf fonksiyonlar (birim testli).
// Okunamayan alan uydurulmaz: satır hatalı işaretlenir ve neden yazılır.
import type { ClassRow } from './types'

type Sinif = Pick<ClassRow, 'id' | 'name' | 'grade' | 'level'> & { active?: boolean }
export type TakvimSatiri = {
  title: string
  type: string
  starts_on: string
  ends_on: string
  starts_at: string | null
  location: string | null
  description: string | null
  target: 'okul' | 'kademe' | 'sinif'
  level: ClassRow['level'] | null
  class_id: string | null
  class_ids: string[]
}
export type OkunanSatir = { no: number; ham: string[]; event?: TakvimSatiri; sinifYazi?: string; hata?: string }

export const SABLON_BASLIK = ['Başlangıç', 'Bitiş', 'Etkinlik', 'Tür', 'Sınıflar', 'Saat', 'Yer', 'Açıklama']

const kucuk = (s: string) => s.toLocaleLowerCase('tr-TR').replace(/\s+/g, ' ').trim()
const metin = (v: unknown) => (v == null ? '' : v instanceof Date ? v.toISOString() : String(v)).trim()

/** Excel hücresinden ISO tarih: Date, Excel seri sayısı, "gg.aa.yyyy", "gg/aa/yyyy", "yyyy-aa-gg". Çözülemezse null. */
export function tarihOku(v: unknown): string | null {
  const gecerli = (y: number, m: number, d: number) => {
    const t = new Date(Date.UTC(y, m - 1, d))
    return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d ? t.toISOString().slice(0, 10) : null
  }
  if (v instanceof Date && !isNaN(v.getTime())) return gecerli(v.getUTCFullYear(), v.getUTCMonth() + 1, v.getUTCDate())
  if (typeof v === 'number' && v > 20000 && v < 80000) return new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400_000).toISOString().slice(0, 10)
  const s = metin(v)
  let m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/)
  if (m) return gecerli(Number(m[3]), Number(m[2]), Number(m[1]))
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return gecerli(Number(m[1]), Number(m[2]), Number(m[3]))
  return null
}

/** "09:30", "9.30", Excel saat kesri (0.395…) ya da Date. Boşsa null; çözülemezse undefined. */
export function saatOku(v: unknown): string | null | undefined {
  if (v == null || metin(v) === '') return null
  if (v instanceof Date) return `${String(v.getUTCHours()).padStart(2, '0')}:${String(v.getUTCMinutes()).padStart(2, '0')}`
  if (typeof v === 'number' && v >= 0 && v < 1) {
    const dk = Math.round(v * 1440)
    return `${String(Math.floor(dk / 60)).padStart(2, '0')}:${String(dk % 60).padStart(2, '0')}`
  }
  const m = metin(v).match(/^(\d{1,2})[:.](\d{2})$/)
  if (m && Number(m[1]) < 24 && Number(m[2]) < 60) return `${m[1]!.padStart(2, '0')}:${m[2]}`
  return undefined
}

/** Tür: anahtar ya da Türkçe adı (büyük/küçük harf fark etmez). */
export function turOku(v: unknown, turler: Record<string, string>): string | null {
  const s = kucuk(metin(v))
  if (!s) return null
  for (const [k, ad] of Object.entries(turler)) if (k === s || kucuk(ad) === s) return k
  if (s === 'sınav' || s === 'yazılı sınav') return turler.yazili ? 'yazili' : null
  if (s === 'bursluluk') return turler.bursluluk ? 'bursluluk' : null
  if (s === 'toplantı' || s === 'veli toplantı') return turler.veli_toplantisi ? 'veli_toplantisi' : null
  return null
}

const sinifAnahtar = (s: string) => kucuk(s).replace(/[\s/.-]/g, '')
const KADEME: Record<string, ClassRow['level']> = { ilkokul: 'ilkokul', ortaokul: 'ortaokul', lise: 'lise' }

/** Sınıflar sütunu: "Tümü", "Ortaokul", "8", "5-7", "8. sınıflar", "8/A, 8/B", "6, 8/A". */
export function sinifOku(
  v: unknown,
  classes: Sinif[],
):
  | { target: 'okul'; level: null; ids: [] }
  | { target: 'kademe'; level: ClassRow['level']; ids: [] }
  | { target: 'sinif'; level: null; ids: string[] }
  | { hata: string } {
  const s = kucuk(metin(v))
  if (!s || ['tümü', 'tüm okul', 'okul', 'hepsi', 'herkes'].includes(s)) return { target: 'okul', level: null, ids: [] }
  const kademe = KADEME[s.replace(/ tümü$/, '')]
  if (kademe) return { target: 'kademe', level: kademe, ids: [] }
  const aktif = classes.filter((c) => c.active !== false)
  const ids = new Set<string>()
  for (const parca of s
    .split(/[,;]+/)
    .map((x) => x.trim())
    .filter(Boolean)) {
    const aralik = parca.match(/^(\d{1,2})\s*-\s*(\d{1,2})$/)
    const seviye = parca.match(/^(\d{1,2})(\s*\.?\s*sınıf(lar)?)?$/)
    const grades = aralik
      ? Array.from({ length: Math.max(0, Number(aralik[2]) - Number(aralik[1]) + 1) }, (_, i) => Number(aralik[1]) + i)
      : seviye
        ? [Number(seviye[1])]
        : null
    if (grades) {
      for (const g of grades) {
        const bul = aktif.filter((c) => c.grade === g)
        if (!bul.length) return { hata: `${g}. sınıf bulunamadı` }
        bul.forEach((c) => ids.add(c.id))
      }
      continue
    }
    const c = aktif.find((x) => sinifAnahtar(x.name) === sinifAnahtar(parca))
    if (!c) return { hata: `"${parca}" sınıfı bulunamadı` }
    ids.add(c.id)
  }
  if (!ids.size) return { hata: 'Sınıf okunamadı' }
  const sirali = aktif.filter((c) => ids.has(c.id)).map((c) => c.id)
  return { target: 'sinif', level: null, ids: sirali }
}

const BASLIK: Record<string, keyof typeof ALAN> = {
  başlangıç: 'bas',
  tarih: 'bas',
  'başlangıç tarihi': 'bas',
  bitiş: 'bit',
  'bitiş tarihi': 'bit',
  etkinlik: 'ad',
  'etkinlik adı': 'ad',
  başlık: 'ad',
  ad: 'ad',
  tür: 'tur',
  sınıflar: 'sinif',
  sınıf: 'sinif',
  'kimin için': 'sinif',
  saat: 'saat',
  yer: 'yer',
  açıklama: 'aciklama',
}
const ALAN = { bas: 0, bit: 0, ad: 0, tur: 0, sinif: 0, saat: 0, yer: 0, aciklama: 0 }

/** Tablodaki etkinlik satırlarını okur. Başlık satırı "Etkinlik" ve "Başlangıç/Tarih" sütunlarını içermeli. */
export function takvimTablosuOku(rows: unknown[][], classes: Sinif[], turler: Record<string, string>): { satirlar: OkunanSatir[]; hata?: string } {
  const bi = rows.findIndex((r) => {
    const h = r.map((x) => BASLIK[kucuk(metin(x))])
    return h.includes('ad') && h.includes('bas')
  })
  if (bi < 0) return { satirlar: [], hata: 'Başlık satırı bulunamadı. Şablondaki sütun adlarını kullan: ' + SABLON_BASLIK.join(', ') + '.' }
  const kol: Partial<Record<keyof typeof ALAN, number>> = {}
  rows[bi]!.forEach((x, i) => {
    const k = BASLIK[kucuk(metin(x))]
    if (k && kol[k] === undefined) kol[k] = i
  })
  const al = (r: unknown[], k: keyof typeof ALAN) => (kol[k] === undefined ? null : r[kol[k]!])
  const satirlar: OkunanSatir[] = []
  rows.slice(bi + 1).forEach((r, i) => {
    const ham = r.map(metin)
    if (ham.every((x) => !x)) return
    const no = bi + i + 2
    const ad = metin(al(r, 'ad'))
    const bas = tarihOku(al(r, 'bas'))
    const bitHam = al(r, 'bit')
    const bit = metin(bitHam) ? tarihOku(bitHam) : bas
    const tur = turOku(al(r, 'tur'), turler)
    const saat = saatOku(al(r, 'saat'))
    const sinif = sinifOku(al(r, 'sinif'), classes)
    const hata =
      ad.length < 3
        ? 'Etkinlik adı en az 3 harf olmalı'
        : !bas
          ? 'Başlangıç tarihi okunamadı'
          : !bit
            ? 'Bitiş tarihi okunamadı'
            : bit < bas
              ? 'Bitiş, başlangıçtan önce'
              : !tur
                ? `Tür okunamadı ("${metin(al(r, 'tur'))}")`
                : saat === undefined
                  ? 'Saat okunamadı'
                  : 'hata' in sinif
                    ? sinif.hata
                    : null
    if (hata || 'hata' in sinif) return satirlar.push({ no, ham, hata: hata ?? 'Sınıf okunamadı' })
    satirlar.push({
      no,
      ham,
      sinifYazi: metin(al(r, 'sinif')) || 'Tüm okul',
      event: {
        title: ad.slice(0, 150),
        type: tur!,
        starts_on: bas!,
        ends_on: bit!,
        starts_at: saat ?? null,
        location: metin(al(r, 'yer')).slice(0, 120) || null,
        description: metin(al(r, 'aciklama')).slice(0, 2000) || null,
        target: sinif.target,
        level: sinif.level,
        class_id: sinif.target === 'sinif' ? sinif.ids[0]! : null,
        class_ids: sinif.target === 'sinif' ? sinif.ids : [],
      },
    })
  })
  return { satirlar }
}
