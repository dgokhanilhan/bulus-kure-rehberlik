import { createClient } from '@supabase/supabase-js'
import { passwordLinkUser } from './authLink'

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

export const supabase = createClient(url, key, {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: 'bk-auth' },
})

/**
 * Kayıt için ayrı, oturum saklamayan istemci: kayıt olan kişi otomatik giriş yapmaz,
 * prototipteki gibi "Kaydın alındı" ekranını görür.
 */
export const signupClient = () =>
  createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, storageKey: 'bk-signup' } })

/** AGPL-3.0 §13: ağ üzerinden kullananlara kaynak kodu bağlantısı. */
export const SOURCE_URL = import.meta.env.VITE_SOURCE_URL || '/LICENSE.txt'
