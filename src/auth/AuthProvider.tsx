import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { PW_FLAG, supabase } from '@/lib/supabase'
import type { Profile, Role } from '@/lib/types'
import { roleOf } from '@/lib/roles'

interface AuthState {
  ready: boolean
  session: Session | null
  profile: Profile | null
  role: Role | null
  /** Oturumun mevcut güvence seviyesi: aal2 = TOTP doğrulandı. */
  aal: 'aal1' | 'aal2' | null
  /** Davet/sıfırlama bağlantısıyla gelindi: önce şifre belirlenir. */
  needPassword: boolean
  passwordSet: () => void
  signOut: () => Promise<void>
}

const Ctx = createContext<AuthState | null>(null)

export function useAuth() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useAuth, AuthProvider içinde kullanılmalı')
  return v
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient()
  const [session, setSession] = useState<Session | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [needPassword, setNeedPassword] = useState(() => {
    try {
      return sessionStorage.getItem(PW_FLAG) === '1'
    } catch {
      return false
    }
  })

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      // Saklı oturum sunucuda iptal edilmiş olabilir (hesap silindi, oturum kapatıldı): doğrula.
      if (data.session) {
        const { error } = await supabase.auth.getUser()
        if (error && (error.status === 401 || error.status === 403 || /session/i.test(error.message))) {
          await supabase.auth.signOut({ scope: 'local' })
          setSession(null)
          setLoaded(true)
          return
        }
      }
      setSession(data.session)
      setLoaded(true)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s)
      if (event === 'PASSWORD_RECOVERY') setNeedPassword(true)
      if (event === 'SIGNED_OUT') qc.clear()
      if (event === 'MFA_CHALLENGE_VERIFIED' || event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        qc.invalidateQueries({ queryKey: ['me'] })
      }
    })
    return () => sub.subscription.unsubscribe()
  }, [qc])

  const uid = session?.user.id
  const me = useQuery({
    queryKey: ['me', uid],
    enabled: !!uid,
    staleTime: 30_000,
    queryFn: async () => {
      const [{ data: profile, error }, { data: aal }] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', uid!).maybeSingle<Profile>(),
        supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
      ])
      if (error) throw error
      return { profile, aal: (aal?.currentLevel ?? 'aal1') as 'aal1' | 'aal2' }
    },
  })

  const profile = me.data?.profile ?? null
  const value: AuthState = {
    ready: loaded && (!uid || me.data !== undefined || me.isError),
    session,
    profile,
    role: profile ? roleOf(profile) : null,
    aal: me.data?.aal ?? null,
    needPassword,
    passwordSet: () => {
      try {
        sessionStorage.removeItem(PW_FLAG)
      } catch {
        /* yok say */
      }
      setNeedPassword(false)
      qc.invalidateQueries({ queryKey: ['me'] })
    },
    signOut: async () => {
      await supabase.auth.signOut()
    },
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

/** Oturumun nereye gitmesi gerektiği: tek yerde karar verilir. */
export type Gate = 'loading' | 'login' | 'password' | 'consent' | 'mfa' | 'pending' | 'app'
export function gateOf(a: AuthState): Gate {
  if (!a.ready) return 'loading'
  if (!a.session) return 'login'
  if (a.needPassword) return 'password'
  if (!a.profile) return 'pending' // profil okunamıyorsa hiçbir veri gösterilmez
  if (a.profile.status !== 'approved') return 'pending'
  // Yöneticinin davetiyle açılan hesap KVKK metnini ilk girişte onaylar (0017)
  if (a.profile.invited_at && !a.profile.consent_version) return 'consent'
  if (a.profile.role === 'admin' && a.aal !== 'aal2') return 'mfa'
  return 'app'
}
