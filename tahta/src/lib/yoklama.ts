// Saf yardımcılar (tarayıcı ve Tauri'den bağımsız; birim testli).

export type Durum = 'geldi' | 'devamsiz' | 'gec' | 'izinli' | 'raporlu'
export const DURUMLAR: Durum[] = ['geldi', 'devamsiz', 'gec', 'izinli', 'raporlu']
export const ETIKET: Record<Durum, string> = { geldi: 'Geldi', devamsiz: 'Gelmedi', gec: 'Geç geldi', izinli: 'İzinli', raporlu: 'Raporlu' }
export const ISARET: Record<Durum, string> = { geldi: '✓', devamsiz: '✕', gec: '◷', izinli: '•', raporlu: '•' }

export interface Ogrenci {
  id: string
  ad: string
  no: string | null
  durum: Durum
  kilitli: boolean
}

/** Türkiye saatiyle gün (YYYY-MM-DD) ve gece yarısından beri dakika. Türkiye'de yaz saati yok: UTC+3 sabit. */
export function istanbul(simdi: Date = new Date()) {
  const t = new Date(simdi.getTime() + 3 * 3600_000)
  return { gun: t.toISOString().slice(0, 10), dakika: t.getUTCHours() * 60 + t.getUTCMinutes() }
}
export const saatYaz = (dakika: number) => `${String(Math.floor(dakika / 60)).padStart(2, '0')}:${String(dakika % 60).padStart(2, '0')}`

/** Windows açılışında kendiliğinden gelme penceresi: 08:30–09:40 (Türkiye saati). */
export const OTOMATIK_BASLA = 8 * 60 + 30
export const OTOMATIK_BITIR = 9 * 60 + 40
export const otomatikPencerede = (dakika: number) => dakika >= OTOMATIK_BASLA && dakika <= OTOMATIK_BITIR

/** 0–9 karışık dizilir; tuşların yeri her PIN ekranında değişir. */
export function karisikTuslar(rastgele: () => number = guvenliRastgele): string[] {
  const a = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rastgele() * (i + 1))
    ;[a[i], a[j]] = [a[j]!, a[i]!]
  }
  return a
}
function guvenliRastgele() {
  const b = new Uint32Array(1)
  crypto.getRandomValues(b)
  return b[0]! / 2 ** 32
}

/** Eşleştirme kodu: harf/rakam dışı atılır, büyük harf, 4. karakterden sonra tire. "kre7 q4m" → "KRE7-Q4M" */
export function kodBicimle(girdi: string) {
  const c = girdi
    .toLocaleUpperCase('en-US')
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 8)
  return c.length > 4 ? `${c.slice(0, 4)}-${c.slice(4)}` : c
}
export const kodTamam = (kod: string) => /^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(kod)

export function sayac(liste: Pick<Ogrenci, 'durum'>[]) {
  const c: Record<Durum, number> = { geldi: 0, devamsiz: 0, gec: 0, izinli: 0, raporlu: 0 }
  for (const o of liste) c[o.durum]++
  return c
}

/** Sunucuya gidecek kayıt: kilitli (idarenin girdiği izinli/raporlu) öğrenciler gönderilmez. */
export function kayitHazirla(liste: Ogrenci[]): Record<string, Durum> {
  const k: Record<string, Durum> = {}
  for (const o of liste) if (!o.kilitli) k[o.id] = o.durum
  return k
}

/** Kartın tek dokunuşu: geldi ↔ gelmedi; diğer durumlardan geldi'ye döner. */
export const dokunus = (d: Durum): Durum => (d === 'geldi' ? 'devamsiz' : 'geldi')

/** Bildirim saati metni ("10:00" / "anlik"). */
export function bildirimCumlesi(saat: string, bekliyor: boolean, kisi: number) {
  if (kisi === 0) return 'Bugün velilere yoklama bildirimi gitmeyecek.'
  if (bekliyor) return `Velilere bildirim ${saat}'da gidecek (${kisi} öğrenci). O saate kadar geç gelen olursa “Düzelt”e bas.`
  return `Velilere bildirim gönderildi (${kisi} öğrenci). Düzeltme yaparsan velilere düzeltme bildirimi gider.`
}

// ---------- Gönderilemeyen yoklamalar (bağlantı yokken) ----------
// Diskte PIN tutulmaz. Program açık kaldıkça PIN bellekte durur; kapanırsa tekrar sorulur.
// Sunucu yoklamayı "bugün"e yazar; bu yüzden ertesi güne kalan bekleyen yoklama gönderilmez, öğretmene söylenir.
export interface Bekleyen {
  id: string
  gun: string
  sinifId: string
  sinifAd: string
  dakika: number
  kayit: Record<string, Durum>
}

export function bekleyenAyikla(liste: Bekleyen[], bugun: string) {
  return { gecerli: liste.filter((b) => b.gun === bugun), eskimis: liste.filter((b) => b.gun !== bugun) }
}

/** Aynı sınıfın yeni yoklaması eskisinin yerine geçer. */
export function bekleyenEkle(liste: Bekleyen[], b: Bekleyen) {
  return [...liste.filter((x) => !(x.sinifId === b.sinifId && x.gun === b.gun)), b]
}

// ---------- Otomatik güncelleme zamanlaması ----------
export const GUNCELLEME_ARALIK = 24 * 60 * 60_000
export const BOSTA_SURE = 60_000
/** Son başarılı kontrolden bu yana bir gün geçtiyse yeniden bakılır (açılışta her zaman bakılır). */
export const denetimZamani = (son: number | null, simdi: number) => son === null || simdi < son || !(simdi - son < GUNCELLEME_ARALIK)
/** Kurulum ancak program 1 dakikadır boştaysa yapılır (ana ekranda, dokunulmadan, gönderim ve bekleyen yoklama yokken). */
export const kurulabilir = (bos: boolean, sonEtkilesim: number, simdi: number) => bos && simdi - sonEtkilesim >= BOSTA_SURE
