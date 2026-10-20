// Kullanıcıların karşılaştığı hatalar sunucuda toplanır (hata_kaydet, 0058); yönetici Yönetim → Hata kayıtları'nda görür.
// Kişisel veri gönderilmez: teknik mesaj (kısaltılmış), sayfa yolu (sunucuda kimlikler maskelenir), rol, tarayıcı, sürüm.
// Aynı hata kısa sürede tekrar gönderilmez; gönderim başarısızsa sessizce vazgeçilir (hata kaydı yeni hata üretmez).
import { supabase } from './supabase'

export type HataTur = 'cokme' | 'veri' | 'js' | 'promise'
let rol = ''
export const hataRol = (r: string | null | undefined) => {
  rol = r ?? ''
}
const son = new Map<string, number>()
// Tarayıcı / eklenti gürültüsü: uygulamanın hatası değil
const GURULTU = /ResizeObserver loop|Script error\.?$|Non-Error promise rejection|AbortError|The user aborted a request/i

export function hataMetni(e: unknown): { mesaj: string; ayrinti: string } {
  if (e instanceof Error) return { mesaj: `${e.name === 'Error' ? '' : e.name + ': '}${e.message}`.slice(0, 500), ayrinti: (e.stack ?? '').slice(0, 2000) }
  if (e && typeof e === 'object' && 'message' in e) return { mesaj: String((e as { message: unknown }).message).slice(0, 500), ayrinti: '' }
  return { mesaj: String(e).slice(0, 500), ayrinti: '' }
}

export function hataBildir(tur: HataTur, e: unknown, ek = '') {
  try {
    const { mesaj, ayrinti } = hataMetni(e)
    if (!mesaj || GURULTU.test(mesaj)) return
    const anahtar = `${tur}|${mesaj}|${location.pathname}`
    const simdi = Date.now()
    if ((son.get(anahtar) ?? 0) > simdi - 60_000) return
    son.set(anahtar, simdi)
    void supabase
      .rpc('hata_kaydet', {
        p: {
          tur,
          mesaj: ek ? `${mesaj} [${ek}]`.slice(0, 500) : mesaj,
          ayrinti,
          sayfa: location.pathname,
          rol,
          tarayici: navigator.userAgent.slice(0, 200),
          surum: import.meta.env.VITE_SURUM ?? '',
        },
      })
      .then(
        () => undefined,
        () => undefined,
      )
  } catch {
    /* hata kaydı asla yeni hata üretmez */
  }
}
