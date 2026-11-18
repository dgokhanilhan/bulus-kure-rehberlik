// Tauri (Windows) köprüsü. Tarayıcıda (geliştirme ve testler) aynı işler localStorage ile taklit edilir.
type Invoke = <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>
const tauri = (window as unknown as { __TAURI__?: { core: { invoke: Invoke } } }).__TAURI__
export const masaustunde = !!tauri

const YEDEK = 'bk-tahta-anahtari'

export async function anahtarOku(): Promise<string | null> {
  if (tauri) return tauri.core.invoke<string | null>('anahtar_oku')
  try {
    return localStorage.getItem(YEDEK)
  } catch {
    return null
  }
}
export async function anahtarYaz(deger: string) {
  if (tauri) return tauri.core.invoke<void>('anahtar_yaz', { deger })
  localStorage.setItem(YEDEK, deger)
}
export async function anahtarSil() {
  if (tauri) return tauri.core.invoke<void>('anahtar_sil')
  localStorage.removeItem(YEDEK)
}
export async function otomatikMi(): Promise<boolean> {
  return tauri ? tauri.core.invoke<boolean>('otomatik_mi') : false
}
export async function acilistaBaslat() {
  if (tauri) await tauri.core.invoke<void>('acilista_baslat').catch(() => undefined)
}
export async function kapat() {
  if (tauri) await tauri.core.invoke<void>('kapat')
}

// Bekleyen yoklamalar (PIN'siz) — WebView'in kendi deposunda.
const BEKLEYEN = 'bk-tahta-bekleyen'
export function bekleyenOku<T>(): T[] {
  try {
    return JSON.parse(localStorage.getItem(BEKLEYEN) ?? '[]') as T[]
  } catch {
    return []
  }
}
export function bekleyenYaz<T>(l: T[]) {
  try {
    if (l.length) localStorage.setItem(BEKLEYEN, JSON.stringify(l))
    else localStorage.removeItem(BEKLEYEN)
  } catch {
    /* depolama kapalıysa bellekte kalır */
  }
}
