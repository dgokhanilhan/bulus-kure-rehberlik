// Öğretmenler Odası oyunları (0069): saf hesaplar. Günün Sudokusu ve Günün Kelimesi sunucuda doğrulanır;
// Yılan, Hesap Sprinti, Mayın Tarlası ve Hafıza Kartları tarayıcıda oynanır.

export type OyunId = 'sudoku' | 'kelime' | 'yilan' | 'sprint' | 'mayin' | 'hafiza'
export const OYUNLAR: { id: OyunId; ad: string; aciklama: string; birim: 'sn' | 'puan' | 'deneme'; gunluk: boolean }[] = [
  { id: 'sudoku', ad: 'Günün Sudokusu', aciklama: 'Bütün okul aynı bulmacayı çözer; süre sunucuda ölçülür.', birim: 'sn', gunluk: true },
  { id: 'kelime', ad: 'Günün Kelimesi', aciklama: 'Beş harfli kelimeyi altı denemede bul.', birim: 'deneme', gunluk: true },
  { id: 'yilan', ad: 'Yılan', aciklama: 'Yemleri topla, kendine ve duvara çarpma.', birim: 'puan', gunluk: false },
  { id: 'sprint', ad: 'Hesap Sprinti', aciklama: '60 saniyede olabildiğince çok işlem.', birim: 'puan', gunluk: false },
  { id: 'mayin', ad: 'Mayın Tarlası', aciklama: '9×9 alanda 10 mayın; en kısa sürede temizle.', birim: 'sn', gunluk: false },
  { id: 'hafiza', ad: 'Hafıza Kartları', aciklama: '8 çifti en kısa sürede eşleştir.', birim: 'sn', gunluk: false },
]
export const oyunAdi = (id: string) => OYUNLAR.find((o) => o.id === id)?.ad ?? id
/** Skorun ekrandaki hali */
export function skorYaz(oyun: OyunId, puan: number): string {
  const o = OYUNLAR.find((x) => x.id === oyun)!
  if (o.birim === 'sn') return sureYaz(puan)
  if (o.birim === 'deneme') return puan > 6 ? 'Bulamadı' : `${puan}/6`
  return `${puan} puan`
}
export function sureYaz(sn: number): string {
  const d = Math.floor(sn / 60)
  const s = sn % 60
  return d >= 60 ? `${Math.floor(d / 60)} sa ${d % 60} dk` : `${d}:${String(s).padStart(2, '0')}`
}

// ---------- Sudoku ----------
/** Aynı satır, sütun ya da kutuda tekrar eden hücreler (0 boş) */
export function sudokuCakisma(a: readonly number[]): Set<number> {
  const out = new Set<number>()
  const grup = (idx: number[]) => {
    const m = new Map<number, number[]>()
    for (const i of idx) if (a[i]) m.set(a[i]!, [...(m.get(a[i]!) ?? []), i])
    for (const l of m.values()) if (l.length > 1) l.forEach((i) => out.add(i))
  }
  for (let g = 0; g < 9; g++) {
    grup(Array.from({ length: 9 }, (_, x) => g * 9 + x))
    grup(Array.from({ length: 9 }, (_, x) => x * 9 + g))
    grup(Array.from({ length: 9 }, (_, x) => (Math.floor(g / 3) * 3 + Math.floor(x / 3)) * 9 + (g % 3) * 3 + (x % 3)))
  }
  return out
}
export const sudokuDolu = (a: readonly number[]) => a.length === 81 && a.every((x) => x >= 1 && x <= 9)

// ---------- Kelime ----------
export const ALFABE = 'abcçdefgğhıijklmnoöprsştuüvyz'
export const KLAVYE = ['ertyuıopğü', 'asdfghjklşi', 'zcvbnmöç']
export function kelimeTemizle(s: string): string {
  return [...s.toLocaleLowerCase('tr')].filter((c) => ALFABE.includes(c)).join('').slice(0, 5)
}
/** Klavyede harf rengi: en iyi bilinen durum (2 > 1 > 0) */
export function harfDurumlari(tahminler: readonly { t: string; r: number[] }[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const { t, r } of tahminler) [...t].forEach((c, i) => m.set(c, Math.max(m.get(c) ?? -1, r[i] ?? 0)))
  return m
}

// ---------- Mayın Tarlası ----------
export const MAYIN_N = 9
export const MAYIN_SAYI = 10
/** İlk tıklanan hücre ve komşuları mayınsız olacak şekilde rastgele yerleşim */
export function mayinKur(ilk: number, rnd: () => number = Math.random, n = MAYIN_N, sayi = MAYIN_SAYI): boolean[] {
  const yasak = new Set([ilk, ...komsular(ilk, n)])
  const adaylar = Array.from({ length: n * n }, (_, i) => i).filter((i) => !yasak.has(i))
  for (let i = adaylar.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    ;[adaylar[i], adaylar[j]] = [adaylar[j]!, adaylar[i]!]
  }
  const m = Array<boolean>(n * n).fill(false)
  adaylar.slice(0, sayi).forEach((i) => (m[i] = true))
  return m
}
export function komsular(i: number, n = MAYIN_N): number[] {
  const r = Math.floor(i / n)
  const c = i % n
  const out: number[] = []
  for (let dr = -1; dr <= 1; dr++)
    for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue
      const rr = r + dr
      const cc = c + dc
      if (rr >= 0 && rr < n && cc >= 0 && cc < n) out.push(rr * n + cc)
    }
  return out
}
export const mayinSay = (m: readonly boolean[], i: number, n = MAYIN_N) => komsular(i, n).filter((k) => m[k]).length
/** Açılan hücre 0 ise komşular da açılır (taşma) */
export function mayinAc(m: readonly boolean[], acik: ReadonlySet<number>, i: number, n = MAYIN_N): Set<number> {
  const out = new Set(acik)
  const yigin = [i]
  while (yigin.length) {
    const k = yigin.pop()!
    if (out.has(k) || m[k]) continue
    out.add(k)
    if (mayinSay(m, k, n) === 0) yigin.push(...komsular(k, n).filter((x) => !out.has(x)))
  }
  return out
}
export const mayinBitti = (m: readonly boolean[], acik: ReadonlySet<number>) => acik.size === m.filter((x) => !x).length

// ---------- Hafıza Kartları ----------
export const HAFIZA_SEMBOL = ['📐', '🧪', '🌍', '🎨', '🎵', '📚', '⚽', '🔭']
export function hafizaDeste(rnd: () => number = Math.random): string[] {
  const d = [...HAFIZA_SEMBOL, ...HAFIZA_SEMBOL]
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    ;[d[i], d[j]] = [d[j]!, d[i]!]
  }
  return d
}

// ---------- Hesap Sprinti ----------
export interface Islem {
  metin: string
  cevap: number
}
/** Seviye arttıkça sayılar büyür; bölme her zaman tam çıkar, çıkarma eksiye düşmez */
export function islemUret(seviye: number, rnd: () => number = Math.random): Islem {
  const r = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1))
  const ust = 10 + seviye * 5
  const tur = r(0, seviye < 3 ? 1 : 3)
  if (tur === 0) {
    const a = r(2, ust)
    const b = r(2, ust)
    return { metin: `${a} + ${b}`, cevap: a + b }
  }
  if (tur === 1) {
    const a = r(5, ust + 10)
    const b = r(1, a)
    return { metin: `${a} − ${b}`, cevap: a - b }
  }
  if (tur === 2) {
    const a = r(2, Math.min(12, 3 + seviye))
    const b = r(2, 12)
    return { metin: `${a} × ${b}`, cevap: a * b }
  }
  const b = r(2, 12)
  const c = r(2, Math.min(12, 3 + seviye))
  return { metin: `${b * c} ÷ ${b}`, cevap: c }
}

// ---------- Yılan ----------
export const YILAN_N = 16
export type Yon = 'u' | 'd' | 'l' | 'r'
export interface YilanDurum {
  govde: number[] // baş ilk
  yon: Yon
  yem: number
  puan: number
  bitti: boolean
}
const TERS: Record<Yon, Yon> = { u: 'd', d: 'u', l: 'r', r: 'l' }
export function yilanBasla(rnd: () => number = Math.random): YilanDurum {
  const bas = 8 * YILAN_N + 5
  const govde = [bas, bas - 1, bas - 2]
  return { govde, yon: 'r', yem: yemKoy(govde, rnd), puan: 0, bitti: false }
}
export function yemKoy(govde: readonly number[], rnd: () => number = Math.random): number {
  const bos = Array.from({ length: YILAN_N * YILAN_N }, (_, i) => i).filter((i) => !govde.includes(i))
  return bos[Math.floor(rnd() * bos.length)] ?? 0
}
/** Bir adım: yön ters değilse uygulanır; duvara ya da kendine çarpınca biter */
export function yilanAdim(d: YilanDurum, yeniYon: Yon | null, rnd: () => number = Math.random): YilanDurum {
  if (d.bitti) return d
  const yon = yeniYon && yeniYon !== TERS[d.yon] ? yeniYon : d.yon
  const bas = d.govde[0]!
  const r = Math.floor(bas / YILAN_N)
  const c = bas % YILAN_N
  const [nr, nc] = yon === 'u' ? [r - 1, c] : yon === 'd' ? [r + 1, c] : yon === 'l' ? [r, c - 1] : [r, c + 1]
  if (nr < 0 || nr >= YILAN_N || nc < 0 || nc >= YILAN_N) return { ...d, yon, bitti: true }
  const yeni = nr * YILAN_N + nc
  const yedi = yeni === d.yem
  const govde = [yeni, ...(yedi ? d.govde : d.govde.slice(0, -1))]
  if (govde.slice(1).includes(yeni)) return { ...d, yon, bitti: true }
  return { govde, yon, yem: yedi ? yemKoy(govde, rnd) : d.yem, puan: d.puan + (yedi ? 1 : 0), bitti: false }
}
/** Hız: puan arttıkça kısalan adım süresi (ms) */
export const yilanHiz = (puan: number) => Math.max(70, 150 - puan * 4)

// ---------- Rozetler ----------
export interface Istatistik {
  toplam: number
  sudoku: number
  sudoku_en_iyi: number | null
  kelime_bulunan: number
  kelime_ikide: number
  yilan_en_iyi: number | null
  sprint_en_iyi: number | null
  oyun_turu: number
  gunler: string[]
}
/** Üst üste oyun oynanan gün sayısı (bugün ya da dün biten seri) */
export function seri(gunler: readonly string[], bugun: string): number {
  const s = new Set(gunler)
  const gun = (t: string, n: number) => {
    const d = new Date(`${t}T12:00:00Z`)
    d.setUTCDate(d.getUTCDate() + n)
    return d.toISOString().slice(0, 10)
  }
  let t = s.has(bugun) ? bugun : gun(bugun, -1)
  let n = 0
  while (s.has(t)) {
    n++
    t = gun(t, -1)
  }
  return n
}
export const ROZETLER: { id: string; ad: string; simge: string; aciklama: string; kosul: (i: Istatistik, seri: number) => boolean }[] = [
  { id: 'ilk', ad: 'İlk adım', simge: '🎈', aciklama: 'İlk oyununu bitir', kosul: (i) => i.toplam >= 1 },
  { id: 'kasif', ad: 'Kâşif', simge: '🧭', aciklama: 'Altı oyunun hepsini dene', kosul: (i) => i.oyun_turu >= 6 },
  { id: 'seri3', ad: 'Üç gün üst üste', simge: '🔥', aciklama: '3 gün üst üste oyna', kosul: (_i, s) => s >= 3 },
  { id: 'seri7', ad: 'Haftanın müdavimi', simge: '📅', aciklama: '7 gün üst üste oyna', kosul: (_i, s) => s >= 7 },
  { id: 'sudoku5', ad: 'Sudoku ustası', simge: '🧩', aciklama: 'Günün Sudokusunu 5 dakikadan kısa sürede çöz', kosul: (i) => i.sudoku_en_iyi != null && i.sudoku_en_iyi < 300 },
  { id: 'sudoku10', ad: 'Sabırlı', simge: '🐢', aciklama: '10 Günün Sudokusu çöz', kosul: (i) => i.sudoku >= 10 },
  { id: 'kelime2', ad: 'Keskin göz', simge: '🎯', aciklama: 'Günün Kelimesini 2 denemede bul', kosul: (i) => i.kelime_ikide >= 1 },
  { id: 'kelime10', ad: 'Söz ustası', simge: '📖', aciklama: '10 kez Günün Kelimesini bul', kosul: (i) => i.kelime_bulunan >= 10 },
  { id: 'yilan30', ad: 'Uzun yılan', simge: '🐍', aciklama: 'Yılanda 30 puan', kosul: (i) => (i.yilan_en_iyi ?? 0) >= 30 },
  { id: 'sprint40', ad: 'Hesap makinesi', simge: '⚡', aciklama: 'Hesap Sprintinde 40 doğru', kosul: (i) => (i.sprint_en_iyi ?? 0) >= 40 },
]
