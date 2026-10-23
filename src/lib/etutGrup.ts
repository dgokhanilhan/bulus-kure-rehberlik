// Gruba etüt (0061): denemelerde seçilen kazanımları yanlış yapan öğrenciler → Cumartesi etüt programı. Saf mantık (birim testli).
// Kaynak: sınıf ısı haritası satırları (HeatRow.cells[i].wrong = o denemede o kazanımda en az bir yanlışı olan öğrenciler).
import type { Kademe } from './etut'

export interface KonuKaynak {
  code: string
  title: string
  /** Denemelere göre (eskiden yeniye) yanlış yapan öğrenciler; konu analizi yoksa boş */
  wrongByExam: string[][]
}
export interface GrupOgrenci {
  sid: string
  /** Kapsamdaki kaç denemede seçilen konulardan en az birinde yanlış yaptı */
  kez: number
}

/**
 * Seçilen konuları, son `son` denemede yanlış yapan öğrenciler (her öğrenci bir kez; kaç denemede yanlış yaptığıyla).
 * `enAz` = en az bu kadar denemede yanlış (tekrarlayanlar için 2). Sıra: en çok tekrarlayan önce, sonra ada göre.
 */
export function grupOgrencileri(konular: KonuKaynak[], secili: Set<string>, son: number, enAz = 1, ad: (sid: string) => string = (s) => s): GrupOgrenci[] {
  const say = new Map<string, Set<number>>()
  for (const k of konular) {
    if (!secili.has(k.code)) continue
    const n = k.wrongByExam.length
    for (let i = Math.max(0, n - son); i < n; i++) for (const sid of k.wrongByExam[i] ?? []) (say.get(sid) ?? say.set(sid, new Set()).get(sid)!).add(i)
  }
  return [...say]
    .map(([sid, s]) => ({ sid, kez: s.size }))
    .filter((x) => x.kez >= enAz)
    .sort((a, b) => b.kez - a.kez || ad(a.sid).localeCompare(ad(b.sid), 'tr'))
}

/** Etüt konusu metni: seçilen konu başlıkları + elle yazılan; 120 karakteri aşarsa kısaltılır (hepsi açıklamada kalır). */
export function grupKonu(basliklar: string[], ek: string): { konu: string; aciklama: string | null } {
  const tum = [...basliklar, ek.trim()].filter(Boolean)
  const metin = tum.join(' · ')
  if (metin.length <= 120) return { konu: metin, aciklama: null }
  return { konu: `${metin.slice(0, 117).trimEnd()}…`, aciklama: metin.slice(0, 200) }
}

/** Sınıf düzeyinden etüt kademesi (5–8 ortaokul, 9–12 lise). */
export const kademeOfGrade = (grade?: number | null): Kademe | null => (!grade ? null : grade >= 9 ? 'lise' : grade >= 5 ? 'ortaokul' : null)

/** Ders adından öğretmen branşı eşleşmesi: "Matematik" ~ "Matematik", "Fen Bilimleri" ~ "Fen", "T.C. İnkılap…" ~ "İnkılap" */
export function bransUyar(dersAdi: string, brans: string | null | undefined): boolean {
  if (!brans) return false
  const k = (s: string) =>
    s
      .toLocaleLowerCase('tr')
      .replace(/[^\p{L}\s]/gu, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 3 && !['bilimleri', 'bilgisi', 'ahlak', 've', 'atatürkçülük', 'tarihi'].includes(w))
  const a = new Set(k(dersAdi))
  return k(brans).some((w) => a.has(w))
}
