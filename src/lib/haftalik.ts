// Görüşme hazırlığı ve veli haftalık özeti (0077): saf hesaplar (birim testli). Veri erişimi gorusmeData.ts'te.
// Kural: veri uydurma yok — olmayan bilgi boş kalır; sınıf sıralaması yok; yalnız veliye açık görevler özete girer.
import { addDays } from './format'

/** Haftanın pazartesisi (YYYY-AA-GG) */
export function haftaBasi(iso: string) {
  const d = new Date(`${iso}T12:00:00Z`)
  const gun = (d.getUTCDay() + 6) % 7 // pazartesi 0
  return addDays(iso, -gun)
}

export interface DenemeOzet {
  ad: string
  tarih: string
  net: number
  /** Bir önceki denemesine göre net farkı; ilk denemesiyse null */
  fark: number | null
}
export interface OzetIcerik {
  bas: string
  bit: string
  denemeler: DenemeOzet[]
  gorev: { tamamlanan: string[]; tamamSayi: number; yeni: number; geciken: number; acik: number }
  devamsizlik: { gelmedi: number; gec: number; izinli: number; raporlu: number } | null
}

interface GorevGiris {
  topic: string
  due_date: string
  parent_visible: boolean
  created_at: string
  completed_at: string | null
}
interface DenemeGiris {
  ad: string
  tarih: string
  net: number
}
interface YoklamaGiris {
  day: string
  status: 'devamsiz' | 'gec' | 'izinli' | 'raporlu'
}

const yuvarla = (n: number) => Math.round(n * 100) / 100
/** timestamptz → Türkiye günü (UTC+3 sabit) */
const trGun = (ts: string) => new Date(new Date(ts).getTime() + 3 * 3600_000).toISOString().slice(0, 10)

/**
 * Bu haftanın (pazartesi–pazar) özeti. Denemeler tarihe göre sıralı verilmeli (eskiden yeniye);
 * fark, öğrencinin bir önceki denemesine göredir (hafta dışındaki olabilir). Yoklama verisi yoksa (modül kapalı) null.
 */
export function haftalikOzet(p: { bugun: string; denemeler: DenemeGiris[]; gorevler: GorevGiris[]; yoklama: YoklamaGiris[] | null }): OzetIcerik {
  const bas = haftaBasi(p.bugun)
  const bit = addDays(bas, 6)
  const icinde = (g: string) => g >= bas && g <= bit
  const denemeler: DenemeOzet[] = []
  p.denemeler.forEach((d, i) => {
    if (!icinde(d.tarih)) return
    const once = p.denemeler[i - 1]
    denemeler.push({ ad: d.ad, tarih: d.tarih, net: yuvarla(d.net), fark: once ? yuvarla(d.net - once.net) : null })
  })
  const gv = p.gorevler.filter((t) => t.parent_visible)
  const biten = gv.filter((t) => t.completed_at && icinde(trGun(t.completed_at)))
  const acikG = gv.filter((t) => !t.completed_at)
  const gorev = {
    tamamlanan: biten.slice(0, 6).map((t) => t.topic),
    tamamSayi: biten.length,
    yeni: gv.filter((t) => icinde(trGun(t.created_at))).length,
    geciken: acikG.filter((t) => t.due_date < p.bugun).length,
    acik: acikG.length,
  }
  let devamsizlik: OzetIcerik['devamsizlik'] = null
  if (p.yoklama) {
    devamsizlik = { gelmedi: 0, gec: 0, izinli: 0, raporlu: 0 }
    for (const y of p.yoklama) {
      if (!icinde(y.day)) continue
      if (y.status === 'devamsiz') devamsizlik.gelmedi++
      else devamsizlik[y.status]++
    }
  }
  return { bas, bit, denemeler, gorev, devamsizlik }
}

/** Özette gösterilecek bir şey var mı (boş hafta için uyarı) */
export const ozetBosMu = (o: OzetIcerik) =>
  !o.denemeler.length && !o.gorev.tamamSayi && !o.gorev.yeni && !o.gorev.acik && !(o.devamsizlik && Object.values(o.devamsizlik).some((n) => n > 0))

// ---------- Görüşme hazırlığı ----------
export type KararDurum = 'acik' | 'yapildi' | 'yapilmadi'
export interface Karar {
  id: string
  student_id: string
  meeting_id: string | null
  metin: string
  durum: KararDurum
  task_id: string | null
  kontrol_at: string | null
  created_at: string
}

/** Son n denemenin net gidişi: her deneme için bir öncekine göre fark */
export function sonDenemeler(denemeler: DenemeGiris[], n = 3): DenemeOzet[] {
  return denemeler.map((d, i) => ({ ad: d.ad, tarih: d.tarih, net: yuvarla(d.net), fark: i > 0 ? yuvarla(d.net - denemeler[i - 1]!.net) : null })).slice(-n)
}

/** Hazırlıkta gösterilecek kararlar: önce açık olanlar (eskiden yeniye), sonra son kontrol edilenler */
export function hazirlikKararlari(k: Karar[], son = 3) {
  const acik = k.filter((x) => x.durum === 'acik').sort((a, b) => a.created_at.localeCompare(b.created_at))
  const kontrol = k
    .filter((x) => x.durum !== 'acik')
    .sort((a, b) => (b.kontrol_at ?? '').localeCompare(a.kontrol_at ?? ''))
    .slice(0, son)
  return { acik, kontrol }
}
