// Gözetmen Bul (bağımsız modül, 0048): sınav oturumlarında öğretmen uygunluğu, dengeli dağıtım önerisi ve sorun tespiti.
// Saf fonksiyonlar: ders programı yalnız okunur, hiçbir mevcut veri değişmez. Kaldırmak için supabase/geri-alma/0048.

export type ExamType = 'ortaokul' | 'tyt' | 'ayt' | 'diger'
export type GorevRol = 'gozetmen' | 'dinlendirici'
export type Durum = 'bos' | 'serbest' | 'dersi_var'

export interface Oturum {
  key: string
  name: string
  starts: string // SS:DD
  ends: string
}
export interface SinavSinif {
  class_id: string | null
  class_name: string
  room?: string | null
}
export interface Gorev {
  oturum_key: string
  role: GorevRol
  class_id: string | null
  class_name: string | null
  scope?: string | null
  teacher_id: string | null
  teacher_name: string
}
export interface DersSatiri {
  class_id: string
  weekday: number
  period: number
  subject: string
  teacher_id: string | null
}
export interface Zil {
  period: number
  starts: string
  ends: string
  active?: boolean
}
export interface Ogretmen {
  id: string
  full_name: string
  branch?: string | null
}

export const TYPE_TR: Record<ExamType, string> = { ortaokul: 'Ortaokul denemesi', tyt: 'TYT', ayt: 'AYT', diger: 'Diğer' }
export const DURUM_TR: Record<Durum, string> = { bos: 'Boşta', serbest: 'Sınav nedeniyle boş', dersi_var: 'Dersi var' }
export const ROL_TR: Record<GorevRol, string> = { gozetmen: 'Gözetmen', dinlendirici: 'Dinlendirici' }

/** Okulun alışılmış sınav düzeni; hepsi ekranda değiştirilebilir. */
export const PRESETS: Record<ExamType, { oturumlar: { name: string; starts: string; minutes: number }[]; grades: number[]; mola: number }> = {
  ortaokul: {
    oturumlar: [
      { name: '1. Oturum · Sözel', starts: '09:30', minutes: 75 },
      { name: '2. Oturum · Sayısal', starts: '11:15', minutes: 80 },
    ],
    grades: [5, 6, 7, 8],
    mola: 30,
  },
  tyt: { oturumlar: [{ name: 'TYT', starts: '10:15', minutes: 165 }], grades: [9, 10], mola: 0 },
  ayt: { oturumlar: [{ name: 'AYT', starts: '10:00', minutes: 180 }], grades: [11, 12], mola: 0 },
  diger: { oturumlar: [{ name: 'Oturum', starts: '09:30', minutes: 60 }], grades: [], mola: 0 },
}

// ---------- Saat yardımcıları ----------
export const toMin = (t: string) => {
  const [h, m] = t.slice(0, 5).split(':').map(Number)
  return (h ?? 0) * 60 + (m ?? 0)
}
export const fromMin = (n: number) => {
  const v = ((Math.round(n) % 1440) + 1440) % 1440
  return `${String(Math.floor(v / 60)).padStart(2, '0')}:${String(v % 60).padStart(2, '0')}`
}
export const addMin = (t: string, n: number) => fromMin(toMin(t) + n)
export const duration = (o: Pick<Oturum, 'starts' | 'ends'>) => toMin(o.ends) - toMin(o.starts)
const overlaps = (a1: number, a2: number, b1: number, b2: number) => a1 < b2 && b1 < a2
export const oturumOverlap = (a: Oturum, b: Oturum) => overlaps(toMin(a.starts), toMin(a.ends), toMin(b.starts), toMin(b.ends))

/** Hazır düzenden oturumlar (anahtarlar benzersiz). */
export function presetOturumlar(t: ExamType, key = () => Math.random().toString(36).slice(2, 10)): Oturum[] {
  return PRESETS[t].oturumlar.map((o) => ({ key: key(), name: o.name, starts: o.starts, ends: addMin(o.starts, o.minutes) }))
}

// ---------- Uygunluk ----------
export interface Uygunluk {
  durum: Durum
  /** Oturumla çakışan dersleri (sınava giren sınıftaysa inExam). */
  dersler: { class_id: string; class_name: string; subject: string; period: number; inExam: boolean }[]
}

/**
 * Bir oturumda her öğretmenin durumu. Ders saati zil çizelgesinden okunur (saati bilinmeyen ders hesaba katılmaz).
 * - bos: oturum süresince dersi yok
 * - serbest: çakışan bütün dersleri sınava giren sınıflarda (ders yapılmayacağı için uygun)
 * - dersi_var: sınava girmeyen bir sınıfta dersi var
 */
export function uygunluk(p: {
  weekday: number
  oturum: Pick<Oturum, 'starts' | 'ends'>
  bells: Zil[]
  lessons: DersSatiri[]
  examClassIds: Set<string>
  classNames: Map<string, string>
  teachers: Ogretmen[]
}): Map<string, Uygunluk> {
  const bell = new Map(p.bells.filter((b) => b.active !== false).map((b) => [b.period, b]))
  const s = toMin(p.oturum.starts)
  const e = toMin(p.oturum.ends)
  const out = new Map<string, Uygunluk>(p.teachers.map((t) => [t.id, { durum: 'bos' as Durum, dersler: [] }]))
  for (const l of p.lessons) {
    if (l.weekday !== p.weekday || !l.teacher_id) continue
    const u = out.get(l.teacher_id)
    const b = bell.get(l.period)
    if (!u || !b || !overlaps(s, e, toMin(b.starts), toMin(b.ends))) continue
    const inExam = p.examClassIds.has(l.class_id)
    u.dersler.push({ class_id: l.class_id, class_name: p.classNames.get(l.class_id) ?? '?', subject: l.subject, period: l.period, inExam })
    u.durum = !inExam ? 'dersi_var' : u.durum === 'dersi_var' ? 'dersi_var' : 'serbest'
  }
  for (const u of out.values()) u.dersler.sort((a, b) => a.period - b.period)
  return out
}

// ---------- Dengeli dağıtım ----------
export interface Gecmis {
  gozetmen: number
  dinlendirici: number
}
const yuk = (g?: Gecmis) => (g ? g.gozetmen + g.dinlendirici * 0.75 : 0)

/**
 * Boş hücreleri doldurur; dolu (elle seçilmiş) görevler korunur.
 * Öncelik: dersi olmayan öğretmenler; aralarında geçmiş görevi ve bu sınavdaki yükü en az olan.
 * Aynı öğretmen çakışan iki oturumda görev almaz; arka arkaya oturumlarda aynı sınıfa yazılmaz.
 */
export function oneri(p: {
  oturumlar: Oturum[]
  siniflar: SinavSinif[]
  teachers: Ogretmen[]
  uygun: Map<string, Map<string, Uygunluk>> // oturum_key → öğretmen → uygunluk
  gecmis: Map<string, Gecmis>
  gorevler: Gorev[]
  dinlendiriciBasina: number // kaç sınıfa bir dinlendirici (0 = yok)
  haric?: Set<string> // görev verilmeyecek öğretmenler
}): Gorev[] {
  const res = [...p.gorevler]
  const name = new Map(p.teachers.map((t) => [t.id, t.full_name]))
  const load = new Map<string, number>()
  for (const g of res) if (g.teacher_id) load.set(g.teacher_id, (load.get(g.teacher_id) ?? 0) + 1)
  const busyIn = (key: string) => {
    const o = p.oturumlar.find((x) => x.key === key)!
    const ks = new Set(p.oturumlar.filter((x) => oturumOverlap(x, o)).map((x) => x.key))
    return new Set(res.filter((g) => ks.has(g.oturum_key) && g.teacher_id).map((g) => g.teacher_id!))
  }
  const score = (tid: string, u: Uygunluk | undefined, avoidClass?: string | null) =>
    yuk(p.gecmis.get(tid)) + (load.get(tid) ?? 0) * 1.5 + (u?.durum === 'serbest' ? 0.1 : 0) + (avoidClass ? 0.6 : 0)
  const pick = (key: string, avoid: (tid: string) => boolean) => {
    const busy = busyIn(key)
    const u = p.uygun.get(key)
    const cands = p.teachers
      .filter((t) => !busy.has(t.id) && !p.haric?.has(t.id) && u?.get(t.id)?.durum !== 'dersi_var')
      .map((t) => ({ t, s: score(t.id, u?.get(t.id), avoid(t.id) ? 'x' : null) }))
      .sort((a, b) => a.s - b.s || a.t.full_name.localeCompare(b.t.full_name, 'tr'))
    return cands[0]?.t
  }
  p.oturumlar.forEach((o, oi) => {
    const prev = p.oturumlar[oi - 1]
    for (const c of p.siniflar) {
      if (res.some((g) => g.oturum_key === o.key && g.role === 'gozetmen' && g.class_name === c.class_name)) continue
      const prevT = new Set(
        prev ? res.filter((g) => g.oturum_key === prev.key && g.class_name === c.class_name).map((g) => g.teacher_id) : [],
      )
      const t = pick(o.key, (tid) => prevT.has(tid))
      if (!t) continue
      res.push({ oturum_key: o.key, role: 'gozetmen', class_id: c.class_id, class_name: c.class_name, teacher_id: t.id, teacher_name: name.get(t.id)! })
      load.set(t.id, (load.get(t.id) ?? 0) + 1)
    }
    const need = p.dinlendiriciBasina > 0 ? Math.ceil(p.siniflar.length / p.dinlendiriciBasina) : 0
    let have = res.filter((g) => g.oturum_key === o.key && g.role === 'dinlendirici').length
    while (have < need) {
      const t = pick(o.key, () => false)
      if (!t) break
      res.push({ oturum_key: o.key, role: 'dinlendirici', class_id: null, class_name: null, scope: null, teacher_id: t.id, teacher_name: name.get(t.id)! })
      load.set(t.id, (load.get(t.id) ?? 0) + 1)
      have++
    }
  })
  return res
}

// ---------- Sorunlar ----------
export interface Sorun {
  tip: 'eksik' | 'cakisma' | 'ders' | 'dinlendirici' | 'oturum'
  ciddi: boolean
  text: string
}
export function sorunlar(p: {
  oturumlar: Oturum[]
  siniflar: SinavSinif[]
  gorevler: Gorev[]
  uygun: Map<string, Map<string, Uygunluk>>
  dinlendiriciBasina: number
}): Sorun[] {
  const out: Sorun[] = []
  p.oturumlar.forEach((o, i) => {
    if (duration(o) <= 0) out.push({ tip: 'oturum', ciddi: true, text: `${o.name}: bitiş saati başlangıçtan sonra olmalı.` })
    for (const b of p.oturumlar.slice(i + 1))
      if (oturumOverlap(o, b)) out.push({ tip: 'oturum', ciddi: false, text: `${o.name} ile ${b.name} saatleri çakışıyor.` })
  })
  for (const o of p.oturumlar) {
    const gs = p.gorevler.filter((g) => g.oturum_key === o.key)
    const missing = p.siniflar.filter((c) => !gs.some((g) => g.role === 'gozetmen' && g.class_name === c.class_name))
    if (missing.length)
      out.push({ tip: 'eksik', ciddi: true, text: `${o.name}: ${missing.map((c) => c.class_name).join(', ')} için gözetmen atanmadı.` })
    if (p.dinlendiriciBasina > 0 && p.siniflar.length && !gs.some((g) => g.role === 'dinlendirici'))
      out.push({ tip: 'dinlendirici', ciddi: false, text: `${o.name}: dinlendirici öğretmen yok.` })
    const u = p.uygun.get(o.key)
    for (const g of gs) {
      const d = g.teacher_id ? u?.get(g.teacher_id) : undefined
      if (d?.durum === 'dersi_var') {
        const l = d.dersler.find((x) => !x.inExam)!
        out.push({ tip: 'ders', ciddi: true, text: `${g.teacher_name}, ${o.name} sırasında ${l.class_name} sınıfında ${l.subject} dersinde.` })
      }
    }
  }
  // Aynı öğretmen aynı ya da çakışan oturumlarda birden çok görevde
  const seen = new Set<string>()
  for (const a of p.gorevler)
    for (const b of p.gorevler) {
      if (a === b || !a.teacher_id || a.teacher_id !== b.teacher_id) continue
      const oa = p.oturumlar.find((x) => x.key === a.oturum_key)
      const ob = p.oturumlar.find((x) => x.key === b.oturum_key)
      if (!oa || !ob || !(oa.key === ob.key || oturumOverlap(oa, ob))) continue
      const k = [a.teacher_id, oa.key, ob.key].sort().join('|')
      if (seen.has(k)) continue
      seen.add(k)
      out.push({ tip: 'cakisma', ciddi: true, text: `${a.teacher_name} aynı anda iki görevde (${oa.name}${oa.key === ob.key ? '' : ` / ${ob.name}`}).` })
    }
  return out.sort((a, b) => Number(b.ciddi) - Number(a.ciddi))
}

/** Sınıf seçimi kısayolları. */
export const gradesOf = (sel: 'ortaokul' | 'lise' | 'okul', grades: number[]) =>
  grades.filter((g) => (sel === 'ortaokul' ? g >= 5 && g <= 8 : sel === 'lise' ? g >= 9 : true))
