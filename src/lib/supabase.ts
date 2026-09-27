import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY
if (!url || !key) throw new Error('VITE_SUPABASE_URL ve VITE_SUPABASE_ANON_KEY tanımlı değil (.env.local).')

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
