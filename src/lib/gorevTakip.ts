// Görev takip formu (0094): kontrol tarihleri, beklenen ilerleme, durum ve konu etkisi. Saf işlevler;
// ekran (GorevTakip.tsx), PDF (gorevTakipPdf.tsx) ve Excel aynı satırları kullanır.
import type { GorevEtki } from './analiz'

export interface Kontrol {
  task_id: string
  sira: 1 | 2 | 3
  tarih: string
  cozulen: number
}
export interface TakipGorev {
  id: string
  subject: string
  topic: string
  question_count: number
  solved: number
  due_date: string
  created_at: string
  completed_at: string | null
}

const GUN = 86400_000
const t = (iso: string) => Date.parse(`${iso}T12:00:00Z`)
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10)
/** Görevin verildiği gün (Türkiye saati). */
export const verilisGunu = (createdAt: string) => new Date(Date.parse(createdAt) + 3 * 3600_000).toISOString().slice(0, 10)

/** Önerilen kontrol günleri: verilişten son güne süre üçe bölünür; 3. kontrol son gün. */
export function oneriTarihleri(g: Pick<TakipGorev, 'created_at' | 'due_date'>): [string, string, string] {
  const bas = t(verilisGunu(g.created_at))
  const son = Math.max(t(g.due_date), bas)
  const n = Math.round((son - bas) / GUN)
  return [1, 2, 3].map((i) => iso(bas + Math.round((n * i) / 3) * GUN)) as [string, string, string]
}

/** O güne kadar beklenen çözülen soru: sorular verilişten son güne eşit dağıtılır (verildiği gün dahil). */
export function beklenen(g: Pick<TakipGorev, 'created_at' | 'due_date' | 'question_count'>, tarih: string): number {
  const bas = t(verilisGunu(g.created_at))
  const son = Math.max(t(g.due_date), bas)
  const gun = Math.round((son - bas) / GUN) + 1
  const gecen = Math.round((t(tarih) - bas) / GUN) + 1
  return Math.round(g.question_count * Math.max(0, Math.min(1, gecen / gun)))
}

/** Bir kontrolün beklenene göre durumu: kaç soru geride ya da yolunda. */
export function kontrolFarki(g: TakipGorev, k: Pick<Kontrol, 'tarih' | 'cozulen'>): { beklenen: number; geride: number } {
  const b = beklenen(g, k.tarih)
  return { beklenen: b, geride: Math.max(0, b - k.cozulen) }
}

export type TakipDurum = 'bitti' | 'devam' | 'baslamadi'
export const DURUM_TR: Record<TakipDurum, string> = { bitti: 'Tamamlandı', devam: 'Devam ediyor', baslamadi: 'Başlamadı' }
export const takipDurumu = (g: TakipGorev): TakipDurum => (g.completed_at || g.solved >= g.question_count ? 'bitti' : g.solved > 0 ? 'devam' : 'baslamadi')

/** Konunun görevden sonraki denemelerdeki durumu (kısa, formda ve Excel'de). Konuya bağlı değilse "—". */
export function etkiKisa(e: GorevEtki | null | undefined): string {
  if (!e) return '—'
  return e.durum === 'duzeldi' ? 'Düzeldi' : e.durum === 'suruyor' ? 'Yine yanlış' : e.durum === 'bos' ? 'Boş bırakıldı' : 'Henüz sorulmadı'
}

/** Forma girecek görevler: açık olanlar (son güne göre), sonra son 14 günde tamamlananlar. */
export function formGorevleri<T extends TakipGorev>(l: T[], bugun: string): T[] {
  const sinir = iso(t(bugun) - 14 * GUN)
  const acik = l.filter((g) => !g.completed_at).sort((a, b) => a.due_date.localeCompare(b.due_date))
  const biten = l.filter((g) => g.completed_at && verilisGunu(g.completed_at) >= sinir).sort((a, b) => a.due_date.localeCompare(b.due_date))
  return [...acik, ...biten]
}

/** Kısa tarih: 28.11 */
export const gg = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}`
