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
  /** Kademe (ortaokul / lise): liseye girmeyen öğretmen lise sınıfına atanmaz. */
  level?: string | null
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

// ---------- Paylaşılan gözetmenlik (oturumun bir bölümü) ----------
// Bir sınıfın oturumu birden çok öğretmene bölünebilir (ör. 1. ders bir öğretmen, 2. ders diğeri). Bu durumda her görevin
// kapsamı (scope) "SS:DD–SS:DD" saat aralığıdır; kapsamı boş ya da saat olmayan görev bütün oturumu kapsar.
const ARALIK = /^(\d{1,2}):(\d{2})\s*[–-]\s*(\d{1,2}):(\d{2})$/
export const aralikYaz = (a: number, b: number) => `${fromMin(a)}–${fromMin(b)}`
/** Görevin kapsadığı saat aralığı (dakika). */
export function gorevAraligi(g: Pick<Gorev, 'role' | 'scope'>, o: Pick<Oturum, 'starts' | 'ends'>): [number, number] {
  const s = toMin(o.starts)
  const e = toMin(o.ends)
  const m = g.role === 'gozetmen' ? g.scope?.trim().match(ARALIK) : null
  if (!m) return [s, e]
  const a = Math.max(s, Number(m[1]) * 60 + Number(m[2]))
  const b = Math.min(e, Number(m[3]) * 60 + Number(m[4]))
  return a < b ? [a, b] : [s, e]
}

/** Aynı öğretmenin saatleri çakışan görevleri (aynı oturumda farklı saat dilimlerinde olmak çakışma değildir). */
export function cakisanGorevler(oturumlar: Oturum[], gorevler: Gorev[]): Set<Gorev> {
  const ot = new Map(oturumlar.map((o) => [o.key, o]))
  const out = new Set<Gorev>()
  const xs = gorevler
    .filter((g) => g.teacher_id && ot.has(g.oturum_key))
    .map((g) => ({ g, r: gorevAraligi(g, ot.get(g.oturum_key)!) }))
  for (let i = 0; i < xs.length; i++)
    for (let j = i + 1; j < xs.length; j++) {
      const a = xs[i]!
      const b = xs[j]!
      if (a.g.teacher_id === b.g.teacher_id && overlaps(a.r[0], a.r[1], b.r[0], b.r[1])) out.add(a.g).add(b.g)
    }
  return out
}

export interface Parca {
  starts: number
  ends: number
  teacher_id: string
}
/**
 * Oturumu sınıfın o günkü derslerine böler: her bölüm o saatte sınıfta dersi olan öğretmene düşer. Sınırlar zil saatleridir
 * (teneffüs önceki bölüme eklenir). 15 dakikadan kısa örtüşen ders ya da öğretmeni uygun olmayan ders komşu bölüme katılır.
 * Ders bulunamazsa boş liste döner.
 */
export function dersParcalari(p: {
  weekday: number
  oturum: Pick<Oturum, 'starts' | 'ends'>
  bells: Zil[]
  lessons: DersSatiri[]
  class_id: string
  uygun: (tid: string, a: number, b: number) => boolean
  enAz?: number
}): Parca[] {
  const s = toMin(p.oturum.starts)
  const e = toMin(p.oturum.ends)
  const enAz = p.enAz ?? 15
  const ders = new Map<number, string>()
  for (const l of p.lessons)
    if (l.class_id === p.class_id && l.weekday === p.weekday && l.teacher_id && !ders.has(l.period)) ders.set(l.period, l.teacher_id)
  const hits = p.bells
    .filter((b) => b.active !== false && overlaps(s, e, toMin(b.starts), toMin(b.ends)))
    .sort((a, b) => toMin(a.starts) - toMin(b.starts))
  if (!hits.length) return []
  const raw = hits.map((b, i) => {
    const a = i === 0 ? s : toMin(b.starts)
    const z = i === hits.length - 1 ? e : toMin(hits[i + 1]!.starts)
    const ov = Math.min(e, toMin(b.ends)) - Math.max(s, toMin(b.starts))
    const t = ders.get(b.period)
    return { a, z, ov, t: t && p.uygun(t, a, z) ? t : null }
  })
  // Hepsi kısa örtüşüyorsa en uzun örtüşen ders sayılır
  const uzun = raw.some((x) => x.t && x.ov >= enAz)
  const best = uzun ? null : raw.filter((x) => x.t).sort((a, b) => b.ov - a.ov)[0]
  const tids = raw.map((x) => (x.t && (uzun ? x.ov >= enAz : x === best) ? x.t : null))
  if (!tids.some(Boolean)) return []
  // Boş bölümler önceki (yoksa sonraki) öğretmene katılır
  for (let i = 0; i < tids.length; i++) if (!tids[i]) tids[i] = tids.slice(0, i).reverse().find(Boolean) ?? null
  for (let i = tids.length - 1; i >= 0; i--) if (!tids[i]) tids[i] = tids[i + 1] ?? null
  const out: Parca[] = []
  raw.forEach((x, i) => {
    const last = out.at(-1)
    if (last && last.teacher_id === tids[i]) last.ends = x.z
    else out.push({ starts: x.a, ends: x.z, teacher_id: tids[i]! })
  })
  return out
}

/** Öğretmenin [a, b) aralığında sınava girmeyen bir sınıfta dersi var mı (zil çizelgesine göre). */
export function araliktaDersi(p: { weekday: number; bells: Zil[]; lessons: DersSatiri[]; examClassIds: Set<string> }, tid: string, a: number, b: number) {
  const bell = new Map(p.bells.filter((x) => x.active !== false).map((x) => [x.period, x]))
  return p.lessons.some((l) => {
    const z = bell.get(l.period)
    return l.teacher_id === tid && l.weekday === p.weekday && !p.examClassIds.has(l.class_id) && !!z && overlaps(a, b, toMin(z.starts), toMin(z.ends))
  })
}

/** Paylaşılan hücreye yeni öğretmen eklerken bölme saati: son bölümün içindeki, ortasına en yakın ders başlangıcı; yoksa ortası. */
export function bolmeSaati(a: number, b: number, bells: Zil[]): number | null {
  if (b - a < 20) return null
  const mid = (a + b) / 2
  const cand = bells
    .filter((x) => x.active !== false)
    .map((x) => toMin(x.starts))
    .filter((t) => t >= a + 10 && t <= b - 10)
    .sort((x, y) => Math.abs(x - mid) - Math.abs(y - mid))[0]
  return cand ?? Math.round(mid / 5) * 5
}

/** Hazır düzenden oturumlar (anahtarlar benzersiz). */
export function presetOturumlar(t: ExamType, key = () => Math.random().toString(36).slice(2, 10), presets: typeof PRESETS = PRESETS): Oturum[] {
  return presets[t].oturumlar.map((o) => ({ key: key(), name: o.name, starts: o.starts, ends: addMin(o.starts, o.minutes) }))
}

/** Okul ayarlarından (gozetmen.*) hazır düzenler; sınıf seviyeleri sabit kalır. */
export function ayarliPresetler(o: {
  ortaokul: { bas: string; sozel: number; sayisal: number; mola: number }
  tyt: { bas: string; dk: number }
  ayt: { bas: string; dk: number }
}): typeof PRESETS {
  const ok = (t: string, d: string) => (/^\d{2}:\d{2}$/.test(t) ? t : d)
  const b = ok(o.ortaokul.bas, '09:30')
  return {
    ortaokul: {
      ...PRESETS.ortaokul,
      mola: o.ortaokul.mola,
      oturumlar: [
        { name: '1. Oturum · Sözel', starts: b, minutes: o.ortaokul.sozel },
        { name: '2. Oturum · Sayısal', starts: addMin(b, o.ortaokul.sozel + o.ortaokul.mola), minutes: o.ortaokul.sayisal },
      ],
    },
    tyt: { ...PRESETS.tyt, oturumlar: [{ name: 'TYT', starts: ok(o.tyt.bas, '10:15'), minutes: o.tyt.dk }] },
    ayt: { ...PRESETS.ayt, oturumlar: [{ name: 'AYT', starts: ok(o.ayt.bas, '10:00'), minutes: o.ayt.dk }] },
    diger: PRESETS.diger,
  }
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

// ---------- Öğretmen–sınıf ilişkisi (ders programından) ----------
export interface Kadro {
  /** sınıf → o sınıfa derse giren öğretmenler */
  sinifOgr: Map<string, Set<string>>
  /** öğretmen → derse girdiği kademeler */
  kademe: Map<string, Set<string>>
}
export function kadro(lessons: DersSatiri[], classLevel: Map<string, string>): Kadro {
  const sinifOgr = new Map<string, Set<string>>()
  const kademe = new Map<string, Set<string>>()
  for (const l of lessons) {
    if (!l.teacher_id) continue
    if (!sinifOgr.has(l.class_id)) sinifOgr.set(l.class_id, new Set())
    sinifOgr.get(l.class_id)!.add(l.teacher_id)
    const lv = classLevel.get(l.class_id)
    if (lv) {
      if (!kademe.has(l.teacher_id)) kademe.set(l.teacher_id, new Set())
      kademe.get(l.teacher_id)!.add(lv)
    }
  }
  return { sinifOgr, kademe }
}
/** Lise sınıfına yalnız lisede dersi olan öğretmen atanır; diğer kademelerde kısıt yok. */
export const kademeUygun = (k: Kadro | undefined, tid: string, level?: string | null) =>
  !k || level !== 'lise' || !!k.kademe.get(tid)?.has('lise')
export const sinifaGirer = (k: Kadro | undefined, tid: string, classId?: string | null) => !!(k && classId && k.sinifOgr.get(classId)?.has(tid))

// ---------- Dengeli dağıtım ----------
export interface Gecmis {
  gozetmen: number
  dinlendirici: number
}
const yuk = (g?: Gecmis) => (g ? g.gozetmen + g.dinlendirici * 0.75 : 0)

/**
 * Boş hücreleri doldurur; dolu (elle seçilmiş) görevler korunur.
 * Öncelik: o sınıfa derse giren öğretmen, sonra aynı kademede dersi olan; aralarında geçmiş görevi ve bu sınavdaki yükü
 * en az olan. Dersi olan öğretmen seçilmez; liseye girmeyen öğretmen lise sınıfına atanmaz.
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
  kadro?: Kadro
  /** Verilirse: oturum sınıfın iki ya da daha çok farklı öğretmenin dersine denk geliyorsa gözetmenlik o öğretmenler arasında paylaştırılır. */
  dersler?: { weekday: number; bells: Zil[]; lessons: DersSatiri[] }
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
  const levels = new Set(p.siniflar.map((c) => c.level ?? ''))
  const pick = (key: string, avoid: (tid: string) => boolean, c?: SinavSinif) => {
    const busy = busyIn(key)
    const u = p.uygun.get(key)
    // Dinlendirici (sınıfsız): bütün sınıflar lise ise liseye giren öğretmen
    const lv = c ? c.level : levels.size === 1 ? [...levels][0] : null
    const bonus = (tid: string) =>
      c && sinifaGirer(p.kadro, tid, c.class_id) ? -100 : lv && p.kadro?.kademe.get(tid)?.has(lv) ? -0.5 : 0
    const cands = p.teachers
      .filter((t) => !busy.has(t.id) && !p.haric?.has(t.id) && u?.get(t.id)?.durum !== 'dersi_var' && kademeUygun(p.kadro, t.id, lv))
      .map((t) => ({ t, s: score(t.id, u?.get(t.id), avoid(t.id) ? 'x' : null) + bonus(t.id) }))
      .sort((a, b) => a.s - b.s || a.t.full_name.localeCompare(b.t.full_name, 'tr'))
    return cands[0]?.t
  }
  const examIds = new Set(p.siniflar.map((c) => c.class_id).filter((x): x is string => !!x))
  const paylasim = (o: Oturum, c: SinavSinif): Parca[] => {
    if (!p.dersler || !c.class_id) return []
    const d = p.dersler
    const busy = busyIn(o.key)
    return dersParcalari({
      weekday: d.weekday,
      oturum: o,
      bells: d.bells,
      lessons: d.lessons,
      class_id: c.class_id,
      uygun: (tid, a, b) =>
        name.has(tid) && !busy.has(tid) && !p.haric?.has(tid) && kademeUygun(p.kadro, tid, c.level) && !araliktaDersi({ ...d, examClassIds: examIds }, tid, a, b),
    })
  }
  p.oturumlar.forEach((o, oi) => {
    const prev = p.oturumlar[oi - 1]
    for (const c of p.siniflar) {
      if (res.some((g) => g.oturum_key === o.key && g.role === 'gozetmen' && g.class_name === c.class_name)) continue
      const parts = paylasim(o, c)
      if (parts.length > 1) {
        for (const x of parts) {
          res.push({ oturum_key: o.key, role: 'gozetmen', class_id: c.class_id, class_name: c.class_name, scope: aralikYaz(x.starts, x.ends), teacher_id: x.teacher_id, teacher_name: name.get(x.teacher_id)! })
          load.set(x.teacher_id, (load.get(x.teacher_id) ?? 0) + 1)
        }
        continue
      }
      const prevT = new Set(
        prev ? res.filter((g) => g.oturum_key === prev.key && g.class_name === c.class_name).map((g) => g.teacher_id) : [],
      )
      const t = pick(o.key, (tid) => prevT.has(tid), c)
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

/**
 * "Dersin öğretmeni gözetmen olsun": oturum saatinde sınıfta dersi olan öğretmen o sınıfa gözetmen yazılır. Oturum iki
 * farklı öğretmenin dersine denk geliyorsa gözetmenlik saatlerine göre paylaştırılır (ör. 1. ders bir öğretmen, 2. ders
 * diğeri). Dolu hücreler, görev verilmeyenler ve aynı saatte başka görevi olanlar atlanır; kalan boş hücreler
 * "Akıllı dağıt" ile doldurulabilir.
 */
export function dersOgretmeniAta(p: {
  weekday: number
  oturumlar: Oturum[]
  siniflar: SinavSinif[]
  bells: Zil[]
  lessons: DersSatiri[]
  teachers: Ogretmen[]
  gorevler: Gorev[]
  haric?: Set<string>
}): Gorev[] {
  const res = [...p.gorevler]
  const name = new Map(p.teachers.map((t) => [t.id, t.full_name]))
  const ot = new Map(p.oturumlar.map((o) => [o.key, o]))
  // Öğretmenin [a, b) aralığında (hangi oturumda olursa olsun) başka görevi var mı
  const mesgul = (tid: string, a: number, b: number) =>
    res.some((g) => {
      const o = ot.get(g.oturum_key)
      if (g.teacher_id !== tid || !o) return false
      const r = gorevAraligi(g, o)
      return overlaps(a, b, r[0], r[1])
    })
  for (const o of p.oturumlar) {
    for (const c of p.siniflar) {
      if (!c.class_id || res.some((g) => g.oturum_key === o.key && g.role === 'gozetmen' && g.class_name === c.class_name)) continue
      const parts = dersParcalari({
        weekday: p.weekday,
        oturum: o,
        bells: p.bells,
        lessons: p.lessons,
        class_id: c.class_id,
        uygun: (tid, a, b) => name.has(tid) && !p.haric?.has(tid) && !mesgul(tid, a, b),
      })
      // Tek öğretmen bütün oturumu alırsa kapsam yazılmaz; birden çok öğretmende her biri kendi dersinin saatini alır
      for (const x of parts)
        res.push({
          oturum_key: o.key,
          role: 'gozetmen',
          class_id: c.class_id,
          class_name: c.class_name,
          ...(parts.length > 1 ? { scope: aralikYaz(x.starts, x.ends) } : {}),
          teacher_id: x.teacher_id,
          teacher_name: name.get(x.teacher_id)!,
        })
    }
  }
  return res
}

// ---------- Sorunlar ----------
export interface Sorun {
  tip: 'eksik' | 'cakisma' | 'ders' | 'dinlendirici' | 'oturum' | 'kademe'
  ciddi: boolean
  text: string
}
export function sorunlar(p: {
  oturumlar: Oturum[]
  siniflar: SinavSinif[]
  gorevler: Gorev[]
  uygun: Map<string, Map<string, Uygunluk>>
  dinlendiriciBasina: number
  kadro?: Kadro
  /** Oturumun yalnız bir bölümünü kapsayan görevde o saatlerdeki uygunluk (verilmezse bütün oturum esas alınır). */
  uygunAralik?: (tid: string, a: number, b: number) => Uygunluk | undefined
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
    // Paylaşılan sınıfta saatlerin bir kısmı boş kalmış olabilir
    for (const c of p.siniflar) {
      const rs = gs
        .filter((g) => g.role === 'gozetmen' && g.class_name === c.class_name)
        .map((g) => gorevAraligi(g, o))
        .sort((a, b) => a[0] - b[0])
      if (!rs.length) continue
      let t = toMin(o.starts)
      const bos: string[] = []
      for (const [a, b] of rs) {
        if (a > t) bos.push(aralikYaz(t, a))
        t = Math.max(t, b)
      }
      if (t < toMin(o.ends)) bos.push(aralikYaz(t, toMin(o.ends)))
      if (bos.length) out.push({ tip: 'eksik', ciddi: true, text: `${o.name}: ${c.class_name} sınıfında ${bos.join(', ')} arası gözetmen yok.` })
    }
    if (p.dinlendiriciBasina > 0 && p.siniflar.length && !gs.some((g) => g.role === 'dinlendirici'))
      out.push({ tip: 'dinlendirici', ciddi: false, text: `${o.name}: dinlendirici öğretmen yok.` })
    for (const g of gs) {
      const c = g.role === 'gozetmen' ? p.siniflar.find((x) => x.class_name === g.class_name) : undefined
      if (c && g.teacher_id && !kademeUygun(p.kadro, g.teacher_id, c.level))
        out.push({ tip: 'kademe', ciddi: true, text: `${g.teacher_name} lisede derse girmiyor; ${o.name} · ${c.class_name} için başka öğretmen seç.` })
    }
    const u = p.uygun.get(o.key)
    for (const g of gs) {
      const r = gorevAraligi(g, o)
      const kismi = r[0] !== toMin(o.starts) || r[1] !== toMin(o.ends)
      const d = !g.teacher_id ? undefined : kismi && p.uygunAralik ? p.uygunAralik(g.teacher_id, r[0], r[1]) : u?.get(g.teacher_id)
      if (d?.durum === 'dersi_var') {
        const l = d.dersler.find((x) => !x.inExam)!
        out.push({ tip: 'ders', ciddi: true, text: `${g.teacher_name}, ${o.name}${kismi ? ` (${aralikYaz(r[0], r[1])})` : ''} sırasında ${l.class_name} sınıfında ${l.subject} dersinde.` })
      }
    }
  }
  // Aynı öğretmen aynı saatte birden çok görevde (aynı oturumun farklı saat dilimleri çakışma sayılmaz)
  const cak = cakisanGorevler(p.oturumlar, p.gorevler)
  const seen = new Set<string>()
  for (const a of cak)
    for (const b of cak) {
      if (a === b || a.teacher_id !== b.teacher_id) continue
      const oa = p.oturumlar.find((x) => x.key === a.oturum_key)
      const ob = p.oturumlar.find((x) => x.key === b.oturum_key)
      if (!oa || !ob) continue
      const ra = gorevAraligi(a, oa)
      const rb = gorevAraligi(b, ob)
      if (!overlaps(ra[0], ra[1], rb[0], rb[1])) continue
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
