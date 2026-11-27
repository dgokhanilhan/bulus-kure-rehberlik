// buluskurementor.com (Supabase) ile konuşma: yalnız 0080'deki tahta fonksiyonları. Kimlik = tahta anahtarı (token).
import type { Durum, Ogrenci } from './yoklama'

const URL_ = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/$/, '') ?? ''
const KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? ''

/** İnternet / sunucuya ulaşılamadı: yoklama bekletilir. */
export class BaglantiYok extends Error {}
/** Sunucu isteği reddetti (kod: Postgres hata kodu). */
export class SunucuHatasi extends Error {
  constructor(
    public kod: string,
    mesaj: string,
  ) {
    super(mesaj)
  }
}
/** Tahta okula bağlı değil (anahtar geçersiz ya da idare tahtayı kaldırdı). */
export const baglantiKaldirildi = (e: unknown) => e instanceof SunucuHatasi && e.kod === '28000'

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  if (!URL_ || !KEY) throw new SunucuHatasi('ayar', 'Program sunucu adresi olmadan derlenmiş. Bilgi işleme haber ver.')
  let r: Response
  try {
    r = await fetch(`${URL_}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
      signal: AbortSignal.timeout(15_000),
    })
  } catch {
    throw new BaglantiYok('Sunucuya ulaşılamadı.')
  }
  const j = (await r.json().catch(() => null)) as { code?: string; message?: string } | null
  if (!r.ok) {
    if (r.status >= 500 && !j?.code) throw new BaglantiYok('Sunucu şu an yanıt vermiyor.')
    throw new SunucuHatasi(j?.code ?? String(r.status), j?.message ?? 'İşlem yapılamadı.')
  }
  return j as T
}

export interface SinifOzet {
  id: string
  ad: string
  alindi: { kim: string | null; saat: string } | null
}
export interface TahtaDurum {
  tahta: { id: string; ad: string; sinif_id: string }
  okul: string
  gun: string
  siniflar: SinifOzet[]
  bildirim_saati: string
  kilit: string | null
}
export interface SinifListe {
  sinif: { id: string; ad: string }
  alindi: { kim: string | null; saat: string } | null
  ogrenciler: Ogrenci[]
}
export type GonderSonuc =
  | { ok: true; ogretmen: string; sinif: string; saat: string; bildirilecek: number; bildirim_saati: string; bekliyor: boolean }
  | { ok: false; hata: 'pin'; kalan: number }
  | { ok: false; hata: 'kilit'; kilit: string }

export const eslestir = (kod: string) => rpc<{ token: string; tahta: string; sinif: string; okul: string }>('tahta_eslestir', { p_kod: kod })
export const durumAl = (token: string) => rpc<TahtaDurum>('tahta_durum', { p_token: token })
export const listeAl = (token: string, sinif: string) => rpc<SinifListe>('tahta_liste', { p_token: token, p_class: sinif })
export const gonder = (token: string, pin: string, sinif: string, kayit: Record<string, Durum>) =>
  rpc<GonderSonuc>('tahta_yoklama_gonder', { p_token: token, p_pin: pin, p_class: sinif, p_kayit: kayit })

// ---------- Telefonla QR onayı (0102) ----------
export type OnayDurum =
  | { durum: 'bekliyor'; son: string }
  | { durum: 'onaylandi'; sonuc: Extract<GonderSonuc, { ok: true }> }
  | { durum: 'suresi_doldu' }
  | { durum: 'yok' }
export const onayBaslat = (token: string, sinif: string, kayit: Record<string, Durum>) =>
  rpc<{ kod: string; son: string; sure: number }>('tahta_onay_baslat', { p_token: token, p_class: sinif, p_kayit: kayit })
export const onayDurum = (token: string, kod: string) => rpc<OnayDurum>('tahta_onay_durum', { p_token: token, p_kod: kod })

/** QR'daki adres: Windows programında site adresi; tarayıcıda yerelde denerken aynı adres. */
export function onayAdresi(kod: string) {
  const ortam = (import.meta.env.VITE_SITE_URL as string | undefined)?.replace(/\/$/, '')
  const yerel = typeof location !== 'undefined' && /^https?:$/.test(location.protocol) && /^(localhost|127\.0\.0\.1)$/.test(location.hostname)
  const kok = ortam || (yerel ? location.origin : 'https://buluskurementor.com')
  return `${kok}/t/${kod}`
}
