// Günlük kontrol (0067): öğretmenin gerektiğinde işaretlediği kılık kıyafet / materyal eksikleri. Yoklamadan bağımsızdır.
// Yalnız eksik kaydedilir; aynı maddenin ay içindeki her 3. eksikliğinde veliye uyarı bildirimi gider (sunucuda, 0067).

export const MADDELER = [
  ['kiyafet', 'Kıyafet'],
  ['kitap_defter', 'Kitap / defter'],
  ['ajanda', 'Ajanda imzası'],
  ['beden_kiyafeti', 'Beden kıyafeti'],
  ['telefon', 'Telefon teslim'],
] as const
export type Madde = (typeof MADDELER)[number][0]
export const MADDE_TR = Object.fromEntries(MADDELER) as Record<Madde, string>
/** Veli ve öğrenci ekranındaki cümle: "11 Kasım: Ders kitabı / defteri yanında değildi." */
export const MADDE_CUMLE: Record<Madde, string> = {
  kiyafet: 'Okul kıyafetinde eksik görüldü',
  kitap_defter: 'Ders kitabı / defteri yanında değildi',
  ajanda: 'Ajanda imzası eksikti',
  beden_kiyafeti: 'Beden eğitimi kıyafeti yanında değildi',
  telefon: 'Telefon teslim edilmedi',
}
export const UYARI_ARALIGI = 3
export const DETAY_EN_COK = 300

export interface Kayit {
  id: string
  student_id: string
  teacher_id: string | null
  tarih: string
  madde: Madde
  detay: string | null
  sira: number
  veli_uyarildi: boolean
  created_at: string
}

export const ayBasi = (t: string) => `${t.slice(0, 7)}-01`
export function aySonu(t: string) {
  const [y, m] = [Number(t.slice(0, 4)), Number(t.slice(5, 7))]
  const d = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return `${t.slice(0, 7)}-${String(d).padStart(2, '0')}`
}
/** Eğitim yılının başı (Eylül) — "Bu dönem" süzgeci için */
export const donemBasi = (t: string) => (Number(t.slice(5, 7)) >= 9 ? `${t.slice(0, 4)}-09-01` : `${Number(t.slice(0, 4)) - 1}-09-01`)

/**
 * Bu madde o tarihte işaretlenirse ay içinde kaçıncı olur (sunucudaki sıra hesabının ön izlemesi). Aynı gün aynı madde
 * zaten kayıtlıysa yeni kayıt oluşmaz; o kaydın sırası döner.
 */
export function kacinci(kayitlar: Kayit[], sid: string, madde: Madde, tarih: string): number {
  const ay = tarih.slice(0, 7)
  const ayni = kayitlar.filter((k) => k.student_id === sid && k.madde === madde && k.tarih.slice(0, 7) === ay)
  const var_ = ayni.find((k) => k.tarih === tarih)
  return var_ ? var_.sira : ayni.length + 1
}
export const uyariGider = (n: number) => n > 0 && n % UYARI_ARALIGI === 0

export interface Taslak {
  /** öğrenci → madde → detay */
  [sid: string]: Partial<Record<Madde, string>>
}

/** O günün kayıtlarından ekrandaki işaret taslağı */
export function taslakKur(gunKayitlari: Kayit[]): Taslak {
  const t: Taslak = {}
  for (const k of gunKayitlari) (t[k.student_id] ??= {})[k.madde] = k.detay ?? ''
  return t
}

export interface Fark {
  ekle: { student_id: string; tarih: string; madde: Madde; detay: string | null }[]
  sil: string[]
  guncelle: { id: string; detay: string | null }[]
}

/**
 * Kayıtlı durum ile ekrandaki taslak arasındaki fark. Öğretmen yalnız kendi kaydını kaldırır / düzeltir; başka öğretmenin
 * işaretlediği eksik (sunucuda da yasak) dokunulmadan kalır. Rehberlik/yönetici (yonetim) başkasının kaydını kaldırabilir.
 */
export function farkBul(gunKayitlari: Kayit[], taslak: Taslak, tarih: string, uid: string, yonetim = false): Fark {
  const f: Fark = { ekle: [], sil: [], guncelle: [] }
  const temiz = (d: string | undefined) => (d ?? '').trim().slice(0, DETAY_EN_COK) || null
  for (const k of gunKayitlari) {
    const yeni = taslak[k.student_id]?.[k.madde]
    const benim = k.teacher_id === uid
    if (yeni === undefined) {
      if (benim || yonetim) f.sil.push(k.id)
    } else if (benim && temiz(yeni) !== (k.detay ?? null)) f.guncelle.push({ id: k.id, detay: temiz(yeni) })
  }
  for (const [sid, m] of Object.entries(taslak))
    for (const [madde, d] of Object.entries(m) as [Madde, string][])
      if (!gunKayitlari.some((k) => k.student_id === sid && k.madde === madde)) f.ekle.push({ student_id: sid, tarih, madde, detay: temiz(d) })
  return f
}

export interface AyOzeti {
  /** madde → bu ay kaç kez */
  sayac: Partial<Record<Madde, number>>
  toplam: number
  bugun: Kayit[]
  /** yeniden eskiye */
  liste: Kayit[]
}
/** Veli/öğrenci kartı ve öğrenci sekmesi: seçilen ayın özeti, o günün eksikleri ayrı */
export function ayOzeti(kayitlar: Kayit[], bugun: string, ay = bugun): AyOzeti {
  const a = ay.slice(0, 7)
  const liste = kayitlar.filter((k) => k.tarih.slice(0, 7) === a).sort((x, y) => y.tarih.localeCompare(x.tarih) || x.madde.localeCompare(y.madde))
  const sayac: AyOzeti['sayac'] = {}
  for (const k of liste) sayac[k.madde] = (sayac[k.madde] ?? 0) + 1
  return { sayac, toplam: liste.length, bugun: liste.filter((k) => k.tarih === bugun), liste }
}
