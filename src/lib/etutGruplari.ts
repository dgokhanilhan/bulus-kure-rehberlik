// Etüt öğrenci grupları (0062): "8'ler 1. Grup" gibi farklı sınıflardan öğrenciler. Grup adı tanıma saf mantıktır (birim testli):
// sınıf düzeyi + grup sırası yan yana geldiğinde ("Sekizler birinci grup", "8. sınıf 1. grup", "1. GRUP 8'LER") hücre o gruba bağlanır.
import { katla } from './etutIceAktar'
import type { Kademe } from './etut'

export interface EtutGrubu {
  id: string
  kademe: Kademe
  ad: string
  ogrenciler: string[]
}

const SAYI: Record<string, number> = { bir: 1, iki: 2, uc: 3, dort: 4, bes: 5, alti: 6, yedi: 7, sekiz: 8, dokuz: 9, on: 10, onbir: 11, oniki: 12 }
const SIRA: Record<string, number> = { birinci: 1, ikinci: 2, ucuncu: 3, dorduncu: 4, besinci: 5, altinci: 6, yedinci: 7, sekizinci: 8, dokuzuncu: 9, onuncu: 10 }
const ROMA: Record<string, number> = { i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6 }

const temiz = (t: string) => katla(t).replace(/['’`´]/g, '').replace(/[^\p{L}\d.]/gu, '')
const grupSozu = (k: string) => /gru(p|bu|plar)/.test(k)

/** Sınıf düzeyi: "8", "8.", "8ler", "8.sınıf", "sekizler", "sekizinci" → 8 */
function duzey(k: string): number | null {
  const d = k.match(/^(\d{1,2})(?:\.|ler|lar|inci|nci|uncu|unci|sinif|siniflar|\.sinif|\.siniflar)*$/)
  if (d) return Number(d[1]) >= 1 && Number(d[1]) <= 12 ? Number(d[1]) : null
  const w = k.match(/^(onbir|oniki|bir|iki|uc|dort|bes|alti|yedi|sekiz|dokuz|on)(ler|lar|inci|nci|uncu|unci)?$/)
  return w ? SAYI[w[1]!]! : null
}
/** Grup sırası: "1", "1.", "birinci", "I", "A" (tek harf) */
function sira(k: string): string | null {
  const d = k.match(/^(\d{1,2})\.?$/)
  if (d) return d[1]!
  if (SIRA[k.replace(/\.$/, '')]) return String(SIRA[k.replace(/\.$/, '')])
  if (ROMA[k.replace(/\.$/, '')] && k.replace(/\.$/, '').length <= 3) return String(ROMA[k.replace(/\.$/, '')])
  if (/^[a-h]\.?$/.test(k)) return k[0]!
  return null
}

export interface GrupImza {
  duzey: number | null
  sira: string | null
  /** Satırdaki eşleşen parçanın konumu (çıkarmak için) */
  bas: number
  son: number
}
/** Metindeki grup ifadesi: "8'ler 1. Grup" → { duzey: 8, sira: '1' }. "grup" sözcüğü yoksa null. */
export function grupImza(metin: string): GrupImza | null {
  const toks = [...metin.matchAll(/\S+/g)].map((m) => ({ t: m[0], i: m.index!, k: temiz(m[0]) }))
  // "1.GRUP", "GRUP1" gibi bitişik yazımlar ayrılır
  const parca: typeof toks = []
  for (const x of toks) {
    const m = x.k.match(/^(\d{1,2})\.?(gru(?:p|bu|plar))$/) ?? x.k.match(/^(gru(?:p|bu|plar))(\d{1,2})$/)
    if (m) parca.push({ ...x, k: m[1]! }, { ...x, k: m[2]! })
    else parca.push(x)
  }
  const gi = parca.findIndex((x) => grupSozu(x.k))
  if (gi < 0) return null
  let si = -1
  if (gi > 0 && sira(parca[gi - 1]!.k)) si = gi - 1
  else if (gi + 1 < parca.length && sira(parca[gi + 1]!.k)) si = gi + 1
  // Düzey: grup ifadesinin yakınında (önce solda, sonra sağda) sıra dışındaki ilk sayı
  let di = -1
  for (let j = gi - 1; j >= Math.max(0, gi - 4); j--) if (j !== si && duzey(parca[j]!.k) !== null) { di = j; break }
  if (di < 0) for (let j = gi + 1; j <= Math.min(parca.length - 1, gi + 4); j++) if (j !== si && duzey(parca[j]!.k) !== null) { di = j; break }
  const idx = [gi, si, di].filter((x) => x >= 0)
  const ilk = parca[Math.min(...idx)]!
  const sonT = parca[Math.max(...idx)]!
  return { duzey: di >= 0 ? duzey(parca[di]!.k) : null, sira: si >= 0 ? sira(parca[si]!.k) : null, bas: ilk.i, son: sonT.i + sonT.t.length }
}

const sadele = (s: string) => katla(s).replace(/['’`´]/g, '').replace(/[^\p{L}\d]+/gu, ' ').trim()

/**
 * Hücre metninde grup arar. Eşleşirse grup ve grup ifadesi çıkarılmış metin döner (kalan metin ad / konu olarak okunur).
 * Kural: grup sırası aynı ve sınıf düzeyi aynı (ya da birinde yok); ya da grubun adı metinde aynen geçiyor. Birden çok aday → eşleşme yok.
 */
export function grupBul<T extends { ad: string }>(ham: string, gruplar: T[]): { grup: T | null; kalan: string } {
  if (!gruplar.length) return { grup: null, kalan: ham }
  const satirlar = ham.split('\n')
  for (let li = 0; li < satirlar.length; li++) {
    const satir = satirlar[li]!
    const s = sadele(satir)
    // 1) Adı aynen geçen grup (ör. "LGS Hızlandırma")
    const aynen = gruplar.filter((g) => {
      const a = sadele(g.ad)
      return a.length >= 3 && (` ${s} `).includes(` ${a} `)
    })
    if (aynen.length === 1) {
      const a = sadele(aynen[0]!.ad)
      // Grup adının sözcükleri çıkarılır (Türkçe büyük/küçük harf farkı gözetilmeden: "SAYISAL" = "Sayısal")
      const adSoz = new Set(a.split(' '))
      const kalanSatir = s === a ? '' : satir.split(/\s+/).filter((w) => !adSoz.has(sadele(w))).join(' ').trim()
      return { grup: aynen[0]!, kalan: [...satirlar.slice(0, li), kalanSatir, ...satirlar.slice(li + 1)].filter((x) => x.trim()).join('\n') }
    }
    // 2) Düzey + sıra imzası
    const im = grupImza(satir)
    if (!im || !im.sira) continue
    const aday = gruplar.filter((g) => {
      const gi = grupImza(g.ad)
      return !!gi && gi.sira === im.sira && (gi.duzey === null || im.duzey === null || gi.duzey === im.duzey)
    })
    // Düzeyi tam uyan aday öncelikli ("8'ler 1. grup" ile "1. grup" adlı iki grup varsa)
    const tam = aday.filter((g) => grupImza(g.ad)!.duzey === im.duzey)
    const sec = tam.length === 1 ? tam : aday
    if (sec.length !== 1) continue
    // Grup adının sayı / sıra / "grup" dışındaki sözcükleri ("12 Sayısal 1. Grup" → "Sayısal") hücrede de yazılmışsa konuya karışmaz
    const adSozleri = new Set(sadele(sec[0]!.ad).split(' ').filter((w) => w.length >= 3 && duzey(w) === null && !sira(w) && !grupSozu(w)))
    const kalanSatir = (satir.slice(0, im.bas) + ' ' + satir.slice(im.son))
      .split(/\s+/)
      .filter((w) => !adSozleri.has(sadele(w)))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim()
    return { grup: sec[0]!, kalan: [...satirlar.slice(0, li), kalanSatir, ...satirlar.slice(li + 1)].filter((x) => x.trim()).join('\n') }
  }
  return { grup: null, kalan: ham }
}
