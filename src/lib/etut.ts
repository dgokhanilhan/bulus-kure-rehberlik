// Cumartesi etütleri (0051): saf mantık — varsayılan saatler, Cumartesi tarihleri, çakışma denetimi, yerleştirme.
// Veritabanı da aynı kuralları uygular (etut_kaydet); burası kullanıcıya kaydetmeden önce gösterir.
import { addDays, isoDow } from './format'

export type Kademe = 'ortaokul' | 'lise'
export interface Saat {
  bas: string
  bit: string
}
export type HucreTur = 'etut' | 'mesgul'
export interface Hucre {
  ders: number // 1..5
  teacher_id: string | null
  teacher_name: string
  tur: HucreTur
  konu?: string | null
  salon?: string | null
  aciklama?: string | null
  talep_id?: string | null
  ogrenciler: string[] // student_id
}

export const DERSLER = [1, 2, 3, 4, 5] as const
export const KADEME_TR: Record<Kademe, string> = { ortaokul: 'Ortaokul', lise: 'Lise' }
/** Okulun Cumartesi düzeni (5 ders × 40 dk). Program ekranında değiştirilebilir. */
export const VARSAYILAN_SAATLER: Record<Kademe, Saat[]> = {
  ortaokul: [
    { bas: '09:00', bit: '09:40' },
    { bas: '09:50', bit: '10:30' },
    { bas: '10:40', bit: '11:20' },
    { bas: '11:30', bit: '12:10' },
    { bas: '12:20', bit: '13:00' },
  ],
  lise: [
    { bas: '09:20', bit: '10:00' },
    { bas: '10:10', bit: '10:50' },
    { bas: '11:00', bit: '11:40' },
    { bas: '11:50', bit: '12:30' },
    { bas: '12:40', bit: '13:20' },
  ],
}
export const SALONLAR = ['ETÜT-1', 'ETÜT-2', 'ETÜT-3', 'ETÜT-4', 'ETÜT-5', 'ETÜT-6']
export const MESGUL_ETIKETLER = ['İzinli', 'Sınav gözetmeni', 'Voleybol', 'Toplantı', 'Raporlu']

export const isCumartesi = (iso: string) => /^\d{4}-\d{2}-\d{2}$/.test(iso) && isoDow(iso) === 6
/** Verilen günden itibaren (o gün Cumartesi ise o gün dahil) n Cumartesi. */
export function cumartesiler(from: string, n: number): string[] {
  let d = from
  while (isoDow(d) !== 6) d = addDays(d, 1)
  return Array.from({ length: n }, (_, i) => addDays(d, i * 7))
}

const toMin = (t: string) => {
  const [h, m] = t.split(':').map(Number)
  return (h ?? 0) * 60 + (m ?? 0)
}
/** Saat düzeni geçerli mi? Geçersizse kullanıcıya gösterilecek açıklama. */
export function saatHatasi(saatler: Saat[]): string | null {
  if (saatler.length !== 5) return '5 ders saati gerekli.'
  for (let i = 0; i < 5; i++) {
    const s = saatler[i]!
    if (!/^\d{2}:\d{2}$/.test(s.bas) || !/^\d{2}:\d{2}$/.test(s.bit) || toMin(s.bas) >= toMin(s.bit)) return `${i + 1}. ders saati geçersiz.`
    if (i > 0 && toMin(s.bas) < toMin(saatler[i - 1]!.bit)) return `${i + 1}. ders, bir önceki ders bitmeden başlıyor.`
  }
  return null
}

/** Yeni program saatleri: aynı kademenin son programı; yoksa varsayılan. */
export function baslangicSaatleri(gunler: { tarih: string; kademe: Kademe; saatler: Saat[] }[], kademe: Kademe, varsayilan = VARSAYILAN_SAATLER[kademe]): Saat[] {
  const son = gunler.filter((g) => g.kademe === kademe).sort((a, b) => b.tarih.localeCompare(a.tarih))[0]
  return (son?.saatler ?? varsayilan).map((s) => ({ ...s }))
}

export interface EtutSorun {
  /** Kaydı durdurur (konu yok, öğretmen iki kez) */
  ciddi: boolean
  text: string
  /** cakisma: öğrenci aynı derste iki etütte (kaydederken "yine de kaydet" sorulur); bilgi: grubun paylaşımlı dersi */
  tur?: 'cakisma' | 'bilgi'
}
/**
 * Kaydetmeden önce: aynı öğrenci aynı derste iki etütte (uyarı; bilinçli olabilir), öğretmen aynı derste iki satırda,
 * konusuz etüt, öğrencisiz etüt. Bir etüt grubunun tamamı aynı derste birden çok öğretmene yazılmışsa (ör. 8'ler 1. Grup
 * 3. derste İngilizce ve Din Kültürü; öğretmenler dersi paylaşır) öğrenci öğrenci uyarı yerine tek bilgi satırı çıkar.
 */
export function sorunlar(hucreler: Hucre[], ogrenciAdi: (id: string) => string, gruplar: { ad: string; ogrenciler: string[] }[] = []): EtutSorun[] {
  const out: EtutSorun[] = []
  for (const d of DERSLER) {
    const ders = hucreler.filter((h) => h.ders === d)
    const etutler = ders.filter((x) => x.tur === 'etut')
    // Paylaşımlı grup dersi: grubun bütün öğrencileri bu dersteki iki ya da daha çok etütte
    const paylasim = new Map<string, Set<Hucre>>() // öğrenci → paylaşımlı hücreleri
    for (const g of gruplar) {
      if (!g.ogrenciler.length) continue
      const hs = etutler.filter((h) => g.ogrenciler.every((s) => h.ogrenciler.includes(s)))
      if (hs.length < 2) continue
      out.push({ ciddi: false, tur: 'bilgi', text: `${g.ad} ${d}. derste ${hs.length} öğretmende: ${hs.map((h) => h.teacher_name).join(', ')} (paylaşımlı ders).` })
      for (const s of g.ogrenciler) paylasim.set(s, new Set([...(paylasim.get(s) ?? []), ...hs]))
    }
    const seen = new Map<string, Hucre>()
    for (const h of etutler)
      for (const s of h.ogrenciler) {
        const prev = seen.get(s)
        if (!prev) {
          seen.set(s, h)
          continue
        }
        const p = paylasim.get(s)
        if (p?.has(prev) && p.has(h)) continue
        out.push({ ciddi: false, tur: 'cakisma', text: `${ogrenciAdi(s)} ${d}. derste iki etüde yazılmış (${prev.teacher_name} ve ${h.teacher_name}).` })
      }
    const names = ders.map((h) => h.teacher_name.trim().toLocaleLowerCase('tr'))
    names.forEach((n, i) => {
      if (names.indexOf(n) !== i) out.push({ ciddi: true, text: `${ders[i]!.teacher_name} ${d}. derste iki kez yazılmış.` })
    })
  }
  for (const h of hucreler) {
    if (h.tur === 'etut' && !h.konu?.trim()) out.push({ ciddi: true, text: `${h.teacher_name} · ${h.ders}. ders: etüt konusu yok.` })
    if (h.tur === 'etut' && !h.ogrenciler.length) out.push({ ciddi: false, text: `${h.teacher_name} · ${h.ders}. ders: etütte öğrenci yok.` })
  }
  return out
}

/** Talebi programa koyarken öneri: istenen ders boşsa o, değilse öğretmenin ilk boş dersi (öğrencileri o derste boş olan). */
export function yerlesimOner(hucreler: Hucre[], teacherName: string, ogrenciler: string[], istenenDers?: number | null): number | null {
  const n = teacherName.trim().toLocaleLowerCase('tr')
  const bos = (d: number) =>
    !hucreler.some((h) => h.ders === d && h.teacher_name.trim().toLocaleLowerCase('tr') === n) &&
    !hucreler.some((h) => h.ders === d && h.tur === 'etut' && h.ogrenciler.some((s) => ogrenciler.includes(s)))
  if (istenenDers && bos(istenenDers)) return istenenDers
  return DERSLER.find(bos) ?? null
}

/** Veli/öğrenci için: geçmiş/yaklaşan ayrımı (Türkiye günü). */
export const yaklasanMi = (tarih: string, bugun: string) => tarih >= bugun

/**
 * PDF / liste için etüt öğrencilerinin kısa yazımı: bir etüt grubunun bütün öğrencileri → grup adı ("8'ler 1. Grup"),
 * bir sınıfın bütün öğrencileri → "5/A (tüm sınıf)", kalanlar adlarıyla. Sınıf / grup en az 2 öğrencili olmalı.
 */
export function ogrenciOzeti(
  ids: string[],
  siniflar: Map<string, string[]>,
  gruplar: { ad: string; ogrenciler: string[] }[],
  ad: (id: string) => string,
): string[] {
  const kalan = new Set(ids)
  const out: string[] = []
  for (const g of [...gruplar].sort((a, b) => b.ogrenciler.length - a.ogrenciler.length)) {
    if (g.ogrenciler.length < 2 || !g.ogrenciler.every((s) => kalan.has(s))) continue
    out.push(g.ad)
    for (const s of g.ogrenciler) kalan.delete(s)
  }
  for (const [c, sids] of [...siniflar].sort((a, b) => a[0].localeCompare(b[0], 'tr', { numeric: true }))) {
    if (sids.length < 2 || !sids.every((s) => kalan.has(s))) continue
    out.push(`${c} (tüm sınıf)`)
    for (const s of sids) kalan.delete(s)
  }
  return [...out, ...ids.filter((s) => kalan.has(s)).map(ad)]
}
