// Takvim yardımcıları: sınıf etiketi, sınıf filtresi, çakışma uyarısı, çok günlü bantlar. Saf fonksiyonlar (birim testli).
import type { ClassRow, Student } from './types'

/** Takvim etkinliğinin buradaki hesaplar için gereken alanları (data.ts'teki CalEvent ile uyumlu). */
export type TakvimEv = {
  id: string
  type: string
  starts_on: string
  ends_on: string
  target: 'okul' | 'kademe' | 'sinif' | 'ogrenci' | 'ogretmen'
  level: ClassRow['level'] | null
  class_id: string | null
  class_ids?: string[]
  student_id: string | null
}
type CalEvent = TakvimEv

type Sinif = Pick<ClassRow, 'id' | 'name' | 'grade' | 'level'> & { active?: boolean }
type Ogr = Pick<Student, 'id' | 'class_id'>
type Hedef = Pick<CalEvent, 'target' | 'level' | 'class_id' | 'class_ids' | 'student_id'>

export const KADEME_ARALIK: Record<ClassRow['level'], [number, number]> = { ilkokul: [1, 4], ortaokul: [5, 8], lise: [9, 12] }

/** [5,6,7] → "5-7"; [6,8] → "6, 8"; [5,6,8] → "5-6, 8" */
export function aralikYaz(grades: number[]): string {
  const g = [...new Set(grades)].sort((a, b) => a - b)
  const out: string[] = []
  for (let i = 0; i < g.length;) {
    let j = i
    while (j + 1 < g.length && g[j + 1] === g[j]! + 1) j++
    out.push(j > i ? `${g[i]}-${g[j]}` : `${g[i]}`)
    i = j + 1
  }
  return out.join(', ')
}

const hedefSiniflar = (e: Hedef) => (e.class_ids?.length ? e.class_ids : e.class_id ? [e.class_id] : [])

/** Etkinliğin ilgilendirdiği sınıflar. 'hepsi' = tüm okul; boş = sınıfa bağlı değil (öğretmen etkinliği). */
export function etkinlikSiniflari(e: Hedef, classes: Sinif[], students: Ogr[]): 'hepsi' | string[] {
  if (e.target === 'okul') return 'hepsi'
  if (e.target === 'kademe') return classes.filter((c) => c.level === e.level).map((c) => c.id)
  if (e.target === 'sinif') return hedefSiniflar(e)
  if (e.target === 'ogrenci') {
    const c = students.find((s) => s.id === e.student_id)?.class_id
    return c ? [c] : []
  }
  return []
}

/** Etkinliğin ilgilendirdiği sınıf seviyeleri (filtre için). */
export function etkinlikSeviyeleri(e: Hedef, classes: Sinif[], students: Ogr[]): 'hepsi' | number[] {
  if (e.target === 'kademe' && e.level) {
    const [a, b] = KADEME_ARALIK[e.level]
    return Array.from({ length: b - a + 1 }, (_, i) => a + i)
  }
  const s = etkinlikSiniflari(e, classes, students)
  if (s === 'hepsi') return 'hepsi'
  return [...new Set(s.map((id) => classes.find((c) => c.id === id)?.grade).filter((g): g is number => g != null))]
}

/** Takvim kutucuğundaki kısa sınıf etiketi: "Tümü", "5-8", "8", "8/A", "5-7". Kişiye özel etkinlikte etiket yok. */
export function sinifEtiketi(e: Hedef, classes: Sinif[]): string | null {
  if (e.target === 'okul') return 'Tümü'
  if (e.target === 'kademe' && e.level) return KADEME_ARALIK[e.level].join('-')
  if (e.target !== 'sinif') return null
  const ids = hedefSiniflar(e)
  const cs = ids.map((id) => classes.find((c) => c.id === id)).filter((c): c is Sinif => !!c)
  if (!cs.length) return null
  if (cs.length === 1) return cs[0]!.name
  return aralikYaz(cs.map((c) => c.grade))
}

/** Sınıf filtresi: tatiller her zaman görünür; öğretmen etkinlikleri yalnız "Bütün sınıflar"da. */
export function seviyeyeUyar(e: Hedef & Pick<CalEvent, 'type'>, grade: number | 'all', classes: Sinif[], students: Ogr[]): boolean {
  if (grade === 'all' || e.type === 'tatil') return true
  const s = etkinlikSeviyeleri(e, classes, students)
  return s === 'hepsi' || s.includes(grade)
}

export type Cakisma<E extends CalEvent = CalEvent> = { tatil: E[]; ayniSinif: E[] }

/** Yeni/düzenlenen etkinlikle aynı günlere düşen tatiller ve aynı sınıfları ilgilendiren başka etkinlikler. */
export function cakisanlar<E extends CalEvent>(
  taslak: Hedef & { id?: string | null; starts_on: string; ends_on: string },
  events: E[],
  classes: Sinif[],
  students: Ogr[],
): Cakisma<E> {
  const ortak = events.filter((x) => x.id !== taslak.id && x.starts_on <= taslak.ends_on && x.ends_on >= taslak.starts_on)
  const tatil = ortak.filter((x) => x.type === 'tatil')
  const benim = etkinlikSiniflari(taslak, classes, students)
  const kesisir = (x: E) => {
    const o = etkinlikSiniflari(x, classes, students)
    if (benim === 'hepsi') return o === 'hepsi' || o.length > 0
    if (o === 'hepsi') return benim.length > 0
    return o.some((id) => benim.includes(id))
  }
  return { tatil, ayniSinif: ortak.filter((x) => x.type !== 'tatil' && kesisir(x)) }
}

export type Bant<T> = { item: T; bas: number; son: number; serit: number; oncedenGelir: boolean; sonraSurer: boolean }

/** Bir haftada (7 gün, ISO) çok günlü öğeleri şeritlere yerleştirir; çakışanlar alt alta. */
export function haftaBantlari<T extends { starts_on: string; ends_on: string }>(hafta: string[], items: T[]): { bantlar: Bant<T>[]; serit: number } {
  const ilk = hafta[0]!
  const son = hafta[hafta.length - 1]!
  const ilgili = items
    .filter((x) => x.ends_on > x.starts_on && x.starts_on <= son && x.ends_on >= ilk)
    .sort((a, b) => a.starts_on.localeCompare(b.starts_on) || b.ends_on.localeCompare(a.ends_on))
  const doluluk: number[] = [] // şerit → son kullanılan gün indeksi
  const bantlar: Bant<T>[] = []
  for (const item of ilgili) {
    const bas = item.starts_on < ilk ? 0 : hafta.indexOf(item.starts_on)
    const bit = item.ends_on > son ? hafta.length - 1 : hafta.indexOf(item.ends_on)
    let serit = doluluk.findIndex((s) => s < bas)
    if (serit < 0) serit = doluluk.length
    doluluk[serit] = bit
    bantlar.push({ item, bas, son: bit, serit, oncedenGelir: item.starts_on < ilk, sonraSurer: item.ends_on > son })
  }
  return { bantlar, serit: doluluk.length }
}

/** Eğitim yılı aralığı: Eylül başı – Ağustos sonu. */
export function egitimYili(iso: string): { from: string; to: string; ad: string } {
  const [y, m] = iso.split('-').map(Number) as [number, number]
  const bas = m >= 9 ? y : y - 1
  return { from: `${bas}-09-01`, to: `${bas + 1}-08-31`, ad: `${bas}-${bas + 1} eğitim yılı` }
}

/** Sınıf seçicide bir seviyenin düğmesi: hepsi seçiliyse çıkarır, değilse ekler. */
export function seviyeDegistir(secili: string[], seviyeSiniflari: string[]): string[] {
  const hepsi = seviyeSiniflari.length > 0 && seviyeSiniflari.every((id) => secili.includes(id))
  return hepsi ? secili.filter((id) => !seviyeSiniflari.includes(id)) : [...new Set([...secili, ...seviyeSiniflari])]
}

/** #rrggbb rengini beyazla karıştırır (0 = renk, 1 = beyaz). */
export function acik(hex: string, oran: number): string {
  const n = parseInt(hex.slice(1), 16)
  const k = (v: number) => Math.round(v + (255 - v) * oran)
  return `#${[k((n >> 16) & 255), k((n >> 8) & 255), k(n & 255)].map((v) => v.toString(16).padStart(2, '0')).join('')}`
}

const iso = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d)).toISOString().slice(0, 10)
const gunEkle = (s: string, n: number) => new Date(Date.parse(s) + n * 86400_000).toISOString().slice(0, 10)

/** Ayın haftaları (Pazartesi başlangıçlı, 7'şer ISO gün). */
export function ayHaftalari(y: number, m: number): string[][] {
  const ilk = iso(y, m, 1)
  const dow = (new Date(Date.parse(ilk)).getUTCDay() + 6) % 7
  const son = iso(y, m + 1, 0)
  const haftalar: string[][] = []
  for (let bas = gunEkle(ilk, -dow); bas <= son; bas = gunEkle(bas, 7)) haftalar.push(Array.from({ length: 7 }, (_, i) => gunEkle(bas, i)))
  return haftalar
}
