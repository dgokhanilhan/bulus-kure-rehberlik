// Veri sağlığı (Yönetim → Kişiler): tekrar olabilecek öğrenciler, ad yazımı, eksik bilgiler. Saf işlevler; ekran YonetimVeriSagligi.tsx.
import { fold } from './format'

/** Türkçe kurallarıyla "İlk Harf Büyük" ad yazımı: DENİZ KARA → Deniz Kara, ışıl ince → Işıl İnce, ayşe-nur → Ayşe-Nur. */
export function adYaz(ad: string): string {
  return ad
    .trim()
    .split(/\s+/)
    .map((w) => (/\d/.test(w) ? w : w.toLocaleLowerCase('tr').replace(/(^|[-'’])(\p{L})/gu, (_, on: string, h: string) => on + h.toLocaleUpperCase('tr'))))
    .join(' ')
}

/** Ad, kurala göre yazılmış hâlinden farklı mı (yalnız harf büyüklüğü ya da fazla boşluk). */
export const adBicimsiz = (ad: string) => ad !== adYaz(ad)

export interface VsOgrenci {
  id: string
  full_name: string
  class_id: string | null
  class_name: string
  school_no: string | null
}

export interface TekrarGrubu {
  anahtar: string
  ogrenciler: VsOgrenci[]
  /** En az iki kayıt aynı sınıfta: büyük olasılıkla aynı kişi. */
  ayniSinif: boolean
}

const cift = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`)

/**
 * Adı (Türkçe harf ve büyüklük farkı yok sayılarak) aynı olan öğrenciler. "Farklı kişiler" diye işaretlenmiş
 * çiftler gruptan düşer; tüm çiftleri işaretlenmiş grup listelenmez. Aynı sınıftakiler önce gelir.
 */
export function tekrarAdaylari(ogrenciler: VsOgrenci[], farkli: Iterable<[string, string]> = []): TekrarGrubu[] {
  const isaret = new Set([...farkli].map(([a, b]) => cift(a, b)))
  const gruplar = new Map<string, VsOgrenci[]>()
  for (const o of ogrenciler) {
    const k = fold(o.full_name)
    if (!k) continue
    gruplar.set(k, [...(gruplar.get(k) ?? []), o])
  }
  const sonuc: TekrarGrubu[] = []
  for (const [anahtar, l] of gruplar) {
    if (l.length < 2) continue
    const kalan = l.filter((o) => l.some((x) => x.id !== o.id && !isaret.has(cift(o.id, x.id))))
    if (kalan.length < 2) continue
    const ayniSinif = kalan.some((o) => kalan.some((x) => x.id !== o.id && x.class_name === o.class_name && !isaret.has(cift(o.id, x.id))))
    sonuc.push({ anahtar, ogrenciler: kalan.sort((a, b) => a.class_name.localeCompare(b.class_name, 'tr', { numeric: true })), ayniSinif })
  }
  return sonuc.sort((a, b) => Number(b.ayniSinif) - Number(a.ayniSinif) || a.anahtar.localeCompare(b.anahtar, 'tr'))
}

/** Aynı sınıfta aynı adlı öğrenci (kayıt ve düzenleme formundaki uyarı için). */
export function ayniAdliOgrenci(ogrenciler: VsOgrenci[], ad: string, sinifId: string, haric?: string) {
  const k = fold(ad)
  return k ? ogrenciler.find((o) => o.id !== haric && o.class_id === sinifId && fold(o.full_name) === k) : undefined
}

/** Birleştirme kararında hangi kaydın tutulacağı: daha çok verisi olan; eşitse okul numarası olan, sonra eski olan (listede önce gelen). */
export function tutulacak<T extends { id: string; school_no: string | null }>(a: T, b: T, veri: Record<string, number>): [T, T] {
  const va = veri[a.id] ?? 0
  const vb = veri[b.id] ?? 0
  if (va !== vb) return va > vb ? [a, b] : [b, a]
  if (!!a.school_no !== !!b.school_no) return a.school_no ? [a, b] : [b, a]
  return [a, b]
}

/** ogrenci_veri_sayilari tablo adlarının ekrandaki karşılığı. */
export const TABLO_TR: Record<string, string> = {
  exam_results: 'deneme sonucu',
  attendance: 'yoklama',
  attendance_alerts: 'devamsızlık uyarısı',
  tasks: 'görev',
  homework_students: 'ödev',
  meetings: 'görüşme',
  notes: 'not',
  reports: 'rapor',
  conversations: 'mesajlaşma',
  attachments: 'dosya',
  calendar_events: 'takvim kaydı',
  etut_ogrenciler: 'etüt',
  gunluk_kontrol: 'günlük kontrol',
  konu_calisma: 'konu çalışması',
  ogrenci_hedefleri: 'hedef',
  soru_talep: 'soru',
  veli_ozet: 'haftalık özet',
  veli_toplanti_formlari: 'veli toplantısı formu',
  brans_toplanti_formlari: 'branş toplantısı formu',
  gorusme_karar: 'görüşme kararı',
  yoklama_bildirim: 'yoklama bildirimi',
  kvkk_talep: 'KVKK başvurusu',
  scholarship_applications: 'bursluluk başvurusu',
}
