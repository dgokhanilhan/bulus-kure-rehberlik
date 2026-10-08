import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { PW_FLAG, supabase } from '@/lib/supabase'
import type { Profile, Role } from '@/lib/types'
import { roleOf, type SwitchRole } from '@/lib/roles'
import type { DbRole } from '@/lib/types'

// Seçili rol (yalnız ekran bağlamı; yetki veritabanında has_role ile). Yenilemede korunur, çıkışta ve yeni girişte silinir.
const ROLE_KEY = 'bk.rol'
function readChoice(uid: string): SwitchRole | null {
  try {
    const v = JSON.parse(localStorage.getItem(ROLE_KEY) ?? 'null') as { uid?: string; role?: string } | null
    return v?.uid === uid && (v.role === 'ogretmen' || v.role === 'veli') ? v.role : null
  } catch {
    return null
  }
}
// Aktif öğrenci (çok çocuklu veli): yalnız ekran bağlamı. Saklanan kimlik velinin gerçek çocuk listesinde (parent_links, RLS) yoksa yok sayılır.
const CHILD_KEY = 'bk.cocuk'
function readChild(uid: string): string | null {
  try {
    const v = JSON.parse(localStorage.getItem(CHILD_KEY) ?? 'null') as { uid?: string; sid?: string } | null
    return v?.uid === uid && typeof v.sid === 'string' ? v.sid : null
  } catch {
    return null
  }
}
export interface Child {
  id: string
  full_name: string
  class_name: string
  grade: number | null
}

/** Çıkışta ve yeni girişte: seçili rol ve aktif öğrenci silinir (önceki kullanıcının seçimi kullanılmaz). */
export function clearRoleChoice() {
  try {
    localStorage.removeItem(CHILD_KEY)
    localStorage.removeItem(ROLE_KEY)
  } catch {
    /* yok say */
  }
}

interface AuthState {
  ready: boolean
  session: Session | null
  /** Seçili role göre görünen profil: iki rollü hesapta role alanı seçili roldür (ekran kararları için). */
  profile: Profile | null
  role: Role | null
  /** Hesabın bütün rolleri (profile_roles). */
  roles: DbRole[]
  /** Öğretmen + veli birlikteyse geçiş yapılabilen roller; tek rolde boş. */
  switchable: SwitchRole[]
  /** İki rollü hesapta henüz rol seçilmedi (giriş sonrası seçim ekranı). */
  needRole: boolean
  switchRole: (r: SwitchRole) => void
  /** Veli modunda bağlı çocuklar (parent_links); veli değilse boş. */
  children: Child[]
  /** Veli modunda aktif öğrenci: tek çocukta o; çok çocukta seçilen (seçilmemişse null). */
  activeStudent: Child | null
  /** Çok çocuklu veli henüz öğrenci seçmedi (seçim ekranı). */
  needStudent: boolean
  switchStudent: (id: string) => void
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
  const [needPassword, setNeedPassword] = useState(false)

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
      try {
        const expected = sessionStorage.getItem(PW_FLAG)
        if (expected && data.session?.user.id === expected) setNeedPassword(true)
        else sessionStorage.removeItem(PW_FLAG)
      } catch { /* depolama kapalı */ }
      setSession(data.session)
      setLoaded(true)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s)
      if (event === 'PASSWORD_RECOVERY') setNeedPassword(true)
      if (event === 'SIGNED_OUT') {
        setNeedPassword(false)
        try { sessionStorage.removeItem(PW_FLAG) } catch { /* depolama kapalı */ }
        clearRoleChoice()
        qc.clear()
      }
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
      const [{ data: profile, error }, { data: aal }, { data: roles }] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', uid!).maybeSingle<Profile>(),
        supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
        supabase.from('profile_roles').select('role').eq('profile_id', uid!),
      ])
      if (error) throw error
      const list = (roles ?? []).map((r) => r.role as DbRole)
      return { profile: profile ? { ...profile, roles: list.length ? list : [profile.role] } : null, aal: (aal?.currentLevel ?? 'aal1') as 'aal1' | 'aal2' }
    },
  })

  const base = me.data?.profile ?? null
  const roles = base?.roles ?? []
  const switchable: SwitchRole[] = roles.includes('ogretmen') && roles.includes('veli') ? ['ogretmen', 'veli'] : []
  const [picked, setPicked] = useState<{ uid: string; role: SwitchRole } | null>(null)
  const choice = uid ? (picked?.uid === uid ? picked.role : readChoice(uid)) : null
  const active = switchable.length && choice && switchable.includes(choice) ? choice : null
  const profile = base && active ? { ...base, role: active } : base
  // Veli modunda bağlı çocuklar: yetki parent_links + RLS'te; burada yalnız seçim ekranı ve doğrulama için okunur
  const asParent = profile?.role === 'veli' && profile.status === 'approved'
  const kids = useQuery({
    queryKey: ['my-children', uid],
    enabled: !!uid && asParent,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('parent_links')
        .select('student_id, students!inner(id, full_name, class_name, archived_at, classes(grade))')
        .eq('parent_id', uid!)
      if (error) throw error
      type Row = { students: { id: string; full_name: string; class_name: string; archived_at: string | null; classes: { grade: number } | null } }
      return ((data ?? []) as unknown as Row[])
        .map((r) => r.students)
        .filter((x) => x && !x.archived_at)
        .map((x) => ({ id: x.id, full_name: x.full_name, class_name: x.class_name, grade: x.classes?.grade ?? null }))
        .sort((a, b) => a.class_name.localeCompare(b.class_name, 'tr') || a.full_name.localeCompare(b.full_name, 'tr'))
    },
  })
  const kidList = asParent ? (kids.data ?? []) : []
  const [pickedChild, setPickedChild] = useState<{ uid: string; sid: string } | null>(null)
  const childChoice = uid ? (pickedChild?.uid === uid ? pickedChild.sid : readChild(uid)) : null
  const activeStudent = kidList.length === 1 ? kidList[0]! : (kidList.find((c) => c.id === childChoice) ?? null)

  const value: AuthState = {
    ready: loaded && (!uid || me.data !== undefined || me.isError) && (!asParent || kids.data !== undefined || kids.isError),
    children: kidList,
    activeStudent,
    needStudent: asParent && kidList.length > 1 && !activeStudent,
    switchStudent: (id) => {
      if (!uid || !kidList.some((c) => c.id === id)) return // bağlı olmayan öğrenci seçilemez
      try {
        localStorage.setItem(CHILD_KEY, JSON.stringify({ uid, sid: id }))
      } catch {
        /* yalnız bu oturum için geçerli olur */
      }
      // Önceki öğrencinin verisi ekranda kalmasın
      qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'me' && q.queryKey[0] !== 'my-children' })
      setPickedChild({ uid, sid: id })
    },
    session,
    profile,
    role: profile ? roleOf(profile) : null,
    roles,
    switchable,
    needRole: switchable.length > 0 && !active,
    switchRole: (r) => {
      if (!uid || !switchable.includes(r)) return
      try {
        localStorage.setItem(ROLE_KEY, JSON.stringify({ uid, role: r }))
      } catch {
        /* yalnız bu oturum için geçerli olur */
      }
      // Önceki rolün ekran verisi karışmasın: oturum dışındaki önbelleği sıfırla
      qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'me' && q.queryKey[0] !== 'my-children' })
      setPicked({ uid, role: r })
    },
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
      clearRoleChoice()
      await supabase.auth.signOut()
    },
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

/** Oturumun nereye gitmesi gerektiği: tek yerde karar verilir. */
export type Gate = 'loading' | 'login' | 'password' | 'consent' | 'mfa' | 'pending' | 'rol' | 'cocuk' | 'app'
export function gateOf(a: AuthState): Gate {
  if (!a.ready) return 'loading'
  if (!a.session) return 'login'
  if (a.needPassword) return 'password'
  if (!a.profile) return 'pending' // profil okunamıyorsa hiçbir veri gösterilmez
  if (a.profile.status !== 'approved') return 'pending'
  // Yöneticinin davetiyle açılan hesap KVKK metnini ilk girişte onaylar (0017)
  if (a.profile.invited_at && !a.profile.consent_version) return 'consent'
  if (a.profile.role === 'admin' && a.aal !== 'aal2') return 'mfa'
  if (a.needRole) return 'rol'
  if (a.needStudent) return 'cocuk'
  return 'app'
}
