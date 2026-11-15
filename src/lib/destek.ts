// Öğrenci desteği (0076): saf hesaplar (birim testli). Veri erişimi destekData.ts'te.
import type { Repeat, Subject } from './analiz'

// ---------- Yanlış defteri ----------
/** Çalıştıktan kaç gün sonra "yeniden bak" denir */
export const TEKRAR_GUN = 3
export type DefterDurum = 'calis' | 'tekrar' | 'tamam'
export interface DefterSatiri {
  konu: string
  baslik: string
  ders: string
  /** Kaç denemede yanlış */
  sayi: number
  sonYanlis: boolean
  calistiAt: string | null
  durum: DefterDurum
}
/**
 * Defter: tekrar eden hatalı konular + öğrencinin işaretleri. Sıra: çalışılmamışlar, sonra yeniden bakma zamanı gelenler,
 * sonra yeni çalışılanlar. Çalışıldıktan sonra konu son denemede yine yanlışsa ya da TEKRAR_GUN gün geçtiyse "yeniden bak".
 */
export function defterKur(
  tekrarlar: readonly Pick<Repeat, 'outcome' | 'count' | 'lastWrong'>[],
  isaretler: ReadonlyMap<string, string>,
  dersAdi: (kod: Subject) => string,
  simdi = Date.now(),
): DefterSatiri[] {
  const sira: Record<DefterDurum, number> = { calis: 0, tekrar: 1, tamam: 2 }
  return tekrarlar
    .map((r) => {
      const calistiAt = isaretler.get(r.outcome.code) ?? null
      const gun = calistiAt ? (simdi - new Date(calistiAt).getTime()) / 86400_000 : 0
      const durum: DefterDurum = !calistiAt ? 'calis' : gun >= TEKRAR_GUN ? 'tekrar' : 'tamam'
      return { konu: r.outcome.code, baslik: r.outcome.title, ders: dersAdi(r.outcome.subject), sayi: r.count, sonYanlis: r.lastWrong, calistiAt, durum }
    })
    .sort((a, b) => sira[a.durum] - sira[b.durum] || b.sayi - a.sayi || a.baslik.localeCompare(b.baslik, 'tr'))
}

// ---------- Çözemedim ----------
export const SORU_DERSLER = [
  'Matematik',
  'Türkçe',
  'Fen Bilimleri',
  'İnkılap Tarihi',
  'İngilizce',
  'Din Kültürü',
  'Sosyal Bilgiler',
  'Fizik',
  'Kimya',
  'Biyoloji',
  'Geometri',
  'Edebiyat',
  'Tarih',
  'Coğrafya',
  'Diğer',
]
