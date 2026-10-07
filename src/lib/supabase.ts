import { createClient, type SupportedStorage } from '@supabase/supabase-js'
import { passwordLinkUser } from './authLink'
import { MOBIL } from './platform'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY
if (!url || !key) throw new Error('VITE_SUPABASE_URL ve VITE_SUPABASE_ANON_KEY tanımlı değil (.env.local).')

/** Davet ya da şifre sıfırlama bağlantısıyla gelindiyse (adres #…type=invite|recovery): şifre belirleme ekranı açılır.
 *  supabase-js bağlantıdaki oturumu alıp adresi temizlemeden önce okunur. */
export const PW_FLAG = 'bk.setpw'
const authHash = new URLSearchParams(window.location.hash.slice(1))
export const AUTH_LINK_ERROR = authHash.has('error') || authHash.has('error_code')
  ? 'Bağlantı geçersiz veya süresi dolmuş. Şifremi unuttum ile yeni bağlantı iste.' : null
try {
  const linkUser = passwordLinkUser(window.location.hash)
  if (linkUser) sessionStorage.setItem(PW_FLAG, linkUser)
  else if (authHash.has('type') || AUTH_LINK_ERROR) sessionStorage.removeItem(PW_FLAG)
  if (AUTH_LINK_ERROR) history.replaceState(null, '', window.location.pathname + window.location.search)
} catch {
  /* depolama kapalı: şifre ekranı gösterilmez, kişi "Şifremi unuttum" ile belirleyebilir */
}

export const SCHOOL_SLUG = import.meta.env.VITE_SCHOOL_SLUG ?? 'bulus-kure'

/**
 * Mobil uygulamada oturum (yenileme anahtarı dahil) WebView'in localStorage'ında değil, iOS Keychain / Android Keystore
 * ile şifrelenen güvenli depoda tutulur. Web'de bu kod derlemeye girmez.
 */
const secureStorage: SupportedStorage | undefined = MOBIL
  ? (() => {
      // Modül döndürülür, eklenti nesnesi değil: Capacitor eklenti vekili her özelliğe ("then" dahil) yanıt verdiği için
      // bir Promise'in sonucu olursa "thenable" sanılır ve bekleme hiç bitmez.
      const mod = () => import('@aparajita/capacitor-secure-storage')
      return {
        getItem: async (k) => (await mod()).SecureStorage.getItem(k),
        setItem: async (k, v) => (await mod()).SecureStorage.setItem(k, v),
        removeItem: async (k) => (await mod()).SecureStorage.removeItem(k),
      }
    })()
  : undefined

export const supabase = createClient(url, key, {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: 'bk-auth', ...(secureStorage ? { storage: secureStorage } : {}) },
})

/**
 * Kayıt için ayrı, oturum saklamayan istemci: kayıt olan kişi otomatik giriş yapmaz,
 * prototipteki gibi "Kaydın alındı" ekranını görür.
 */
export const signupClient = () =>
  createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, storageKey: 'bk-signup' } })

/** AGPL-3.0 §13: ağ üzerinden kullananlara kaynak kodu bağlantısı. */
export const SOURCE_URL = import.meta.env.VITE_SOURCE_URL || '/LICENSE.txt'
