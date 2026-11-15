// Bağlantısız kayıt kuyruğu: yoklama ve günlük kontrol kaydedilirken bağlantı yoksa işlem bu cihazda sıraya alınır,
// bağlantı gelince sırayla gönderilir. Saf mantık (birim testli); gönderen işlev dışarıdan verilir.
// Cihazda yalnız öğrenci kimlikleri (UUID), durum ve varsa detay tutulur — ad yok. Oturum kapatılınca silinir.
// Sunucu kuralları (RLS, damga) gönderimde aynen uygulanır; reddedilen iş "gönderilemedi" listesine düşer, sessizce kaybolmaz.

export type KuyrukIs =
  | { tur: 'yoklama'; id: string; at: string; etiket: string; up: Record<string, unknown>[]; del: string[] }
  | {
      tur: 'gunluk'
      id: string
      at: string
      etiket: string
      ekle: Record<string, unknown>[]
      sil: string[]
      guncelle: { id: string; detay: string | null }[]
    }
export type HataliIs = KuyrukIs & { hata: string }
/** Sıraya eklenecek iş (kimlik ve zaman otomatik) */
export type YeniIs = KuyrukIs extends infer T ? (T extends KuyrukIs ? Omit<T, 'id' | 'at'> & { id?: string; at?: string } : never) : never
export interface Kuyruk {
  bekleyen: KuyrukIs[]
  hatali: HataliIs[]
}
export interface Depo {
  getItem(k: string): string | null
  setItem(k: string, v: string): void
  removeItem(k: string): void
}

export const KUYRUK_OLAY = 'bk-kuyruk'
const anahtar = (uid: string) => `bk.kuyruk.${uid}`
const bos = (): Kuyruk => ({ bekleyen: [], hatali: [] })

/** Ağ hatası mı (çevrimdışı, bağlantı koptu)? Sunucunun reddettiği (yetki, kural) hatalar ağ hatası değildir. */
export function agHatasiMi(e: unknown, cevrimici = typeof navigator === 'undefined' ? true : navigator.onLine) {
  if (!cevrimici) return true
  const m = e instanceof Error ? e.message : typeof e === 'object' && e && 'message' in e ? String((e as { message: unknown }).message) : String(e ?? '')
  return /failed to fetch|networkerror|network request failed|load failed|fetch failed|err_internet_disconnected|err_network/i.test(m)
}

export function kuyrukOku(uid: string, depo: Depo): Kuyruk {
  try {
    const v = JSON.parse(depo.getItem(anahtar(uid)) ?? 'null') as Kuyruk | null
    return v && Array.isArray(v.bekleyen) && Array.isArray(v.hatali) ? v : bos()
  } catch {
    return bos()
  }
}
function kuyrukYaz(uid: string, k: Kuyruk, depo: Depo) {
  try {
    if (!k.bekleyen.length && !k.hatali.length) depo.removeItem(anahtar(uid))
    else depo.setItem(anahtar(uid), JSON.stringify(k))
  } catch {
    /* depolama dolu ya da kapalı: kuyruk tutulamaz, çağıran ağ hatasını kullanıcıya gösterir */
  }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(KUYRUK_OLAY))
}

/** İşi sıraya ekler; depolama yazılamazsa false (çağıran "kaydedilemedi" der) */
export function kuyrugaEkle(uid: string, is: YeniIs, depo: Depo): boolean {
  const k = kuyrukOku(uid, depo)
  const tam = { ...is, id: is.id ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, at: is.at ?? new Date().toISOString() } as KuyrukIs
  k.bekleyen.push(tam)
  kuyrukYaz(uid, k, depo)
  return kuyrukOku(uid, depo).bekleyen.some((x) => x.id === tam.id)
}

/**
 * Bekleyenleri eklenme sırasıyla gönderir. Ağ hatasında durur (kalanlar sırada kalır);
 * sunucu reddederse iş "hatali"ya taşınır ve sıradakine geçilir.
 */
export async function kuyruguGonder(uid: string, calistir: (is: KuyrukIs) => Promise<void>, depo: Depo, cevrimici?: () => boolean) {
  let gonderilen = 0
  let reddedilen = 0
  for (;;) {
    const k = kuyrukOku(uid, depo)
    const is = k.bekleyen[0]
    if (!is) break
    try {
      await calistir(is)
      gonderilen++
      const s = kuyrukOku(uid, depo)
      s.bekleyen = s.bekleyen.filter((x) => x.id !== is.id)
      kuyrukYaz(uid, s, depo)
    } catch (e) {
      if (agHatasiMi(e, cevrimici ? cevrimici() : undefined)) break
      reddedilen++
      const s = kuyrukOku(uid, depo)
      s.bekleyen = s.bekleyen.filter((x) => x.id !== is.id)
      s.hatali.push({ ...is, hata: e instanceof Error ? e.message : String((e as { message?: unknown })?.message ?? e) })
      kuyrukYaz(uid, s, depo)
    }
  }
  return { gonderilen, reddedilen, kalan: kuyrukOku(uid, depo).bekleyen.length }
}

export function hataliTemizle(uid: string, depo: Depo) {
  const k = kuyrukOku(uid, depo)
  kuyrukYaz(uid, { bekleyen: k.bekleyen, hatali: [] }, depo)
}
export function kuyruguSil(uid: string, depo: Depo) {
  kuyrukYaz(uid, bos(), depo)
}
