import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase, SOURCE_URL } from '@/lib/supabase'
import { gateOf, useAuth } from '@/auth/AuthProvider'
import { navItems, ROLE_HINT, ROLE_TR } from '@/lib/roles'
import { useConversations, useModules } from '@/lib/data'
import type { Notification } from '@/lib/types'
import { ago, initials } from '@/lib/format'
import { Icon, Logo } from './Icon'
import { useIndicator } from './Indicator'
import { useOpenReport } from './Report'
import { useToast } from './Toast'

function Brand() {
  return (
    <div className="brandline">
      <Logo />
      <div>
        <b>Buluş Küre Koleji</b>
        <small>Rehberlik &amp; Mentörlük</small>
      </div>
    </div>
  )
}

export function TopBar() {
  const auth = useAuth()
  const { profile, role } = auth
  const [open, setOpen] = useState(false)
  // Zil ve profil yalnız uygulamaya tam girişte (onaylı + admin için aal2) görünür.
  // Onay bekleme / TOTP ekranlarında çıkış, ekranın kendi düğmesiyle yapılır.
  const inApp = gateOf(auth) === 'app'

  if (!profile || !inApp || !role) {
    return (
      <header className="top">
        <Brand />
      </header>
    )
  }
  return (
    <header className="top">
      <Brand />
      <div className="right">
        <Bell open={open} setOpen={setOpen} />
        <ProfileMenu />
      </div>
    </header>
  )
}

export function useLogout() {
  const { signOut } = useAuth()
  const toast = useToast()
  return async () => {
    await signOut()
    toast('Çıkış yapıldı', 'out')
  }
}

/** Profil kartı: tıklanınca kişi bilgisi ve "Çıkış yap" açılır. */
function ProfileMenu() {
  const { profile, role, session } = useAuth()
  const logout = useLogout()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])
  if (!profile || !role) return null
  const roleText = `${ROLE_TR[role]}${role === 'brans' && profile.branch ? ` · ${profile.branch}` : ''}`
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button className="who press" onClick={() => setOpen(!open)} aria-haspopup="menu" aria-expanded={open} aria-label={`Profil: ${profile.full_name}`}>
        <span className="av" style={{ width: 34, height: 34, fontSize: 13 }}>
          {initials(profile.full_name)}
        </span>
        <div>
          <b>{profile.full_name}</b>
          <small>{roleText}</small>
        </div>
        <span className="chev" style={{ transform: open ? 'rotate(180deg)' : undefined }}>
          <Icon name="down" size={16} stroke={2} />
        </span>
      </button>
      {open && (
        <div className="pmenu" role="menu" aria-label="Profil">
          <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--line)' }}>
            <b style={{ display: 'block' }}>{profile.full_name}</b>
            <span className="m" style={{ fontSize: 13, display: 'block' }}>
              {roleText}
            </span>
            <span className="m" style={{ fontSize: 12 }}>
              {session?.user.email}
            </span>
          </div>
          {role === 'admin' && (
            <Link className="pitem" role="menuitem" to="/ayarlar" onClick={() => setOpen(false)} style={{ color: 'var(--ink)', fontWeight: 500, textDecoration: 'none' }}>
              <Icon name="shield" size={18} />
              Okul ayarları
            </Link>
          )}
          <a className="pitem" role="menuitem" href={SOURCE_URL} target="_blank" rel="noreferrer" style={{ color: 'var(--ink-muted)', fontWeight: 500, fontSize: 13, textDecoration: 'none' }}>
            <Icon name="doc" size={18} />
            Kaynak kodu (AGPL-3.0)
          </a>
          <button className="pitem" role="menuitem" onClick={logout}>
            <Icon name="out" size={18} />
            Çıkış yap
          </button>
        </div>
      )}
    </div>
  )
}

function Bell({ open, setOpen }: { open: boolean; setOpen: (v: boolean) => void }) {
  const { profile } = useAuth()
  const qc = useQueryClient()
  const nav = useNavigate()
  const openReport = useOpenReport()
  const ref = useRef<HTMLDivElement>(null)
  const q = useQuery({
    queryKey: ['notifications', profile?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('notifications')
        .select('id, text, link, read_at, created_at')
        .order('created_at', { ascending: false })
        .limit(40)
      if (error) throw error
      return data as Notification[]
    },
    refetchInterval: 60_000,
  })
  const markRead = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase.from('notifications').update({ read_at: new Date().toISOString() }).in('id', ids)
      if (error) throw error
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  })
  const list = q.data ?? []
  const unread = list.filter((x) => !x.read_at)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, setOpen])

  const openItem = (n: Notification) => {
    if (!n.read_at) markRead.mutate([n.id])
    setOpen(false)
    const L = n.link
    if (L.report) openReport({ id: L.report })
    else if (L.homework) nav(`/odevler?odev=${L.homework}`)
    else if (L.conversation) nav(`/iletisim?sekme=mesajlar&c=${L.conversation}`)
    else if (L.page === 'ogrenci' && L.sid) nav(`/ogrenciler/${L.sid}${L.tab ? `?sekme=${L.tab}` : ''}`)
    else if (L.page) nav(`/${L.page}`)
  }

  return (
    <div ref={ref}>
      <button
        className={`bell ${unread.length ? 'has' : ''}`}
        onClick={() => setOpen(!open)}
        aria-label={`Bildirimler${unread.length ? `, ${unread.length} okunmamış` : ''}`}
        aria-expanded={open}
      >
        <Icon name="bell" />
        {unread.length > 0 && <span className="dot">{unread.length}</span>}
      </button>
      {open && (
        <div className="npanel" role="dialog" aria-label="Bildirimler">
          <div className="kv" style={{ padding: '14px 16px', borderBottom: '1px solid var(--line)' }}>
            <b>Bildirimler</b>
            {unread.length > 0 && (
              <button className="btn ghost sm" onClick={() => markRead.mutate(unread.map((x) => x.id))}>
                Hepsini okundu yap
              </button>
            )}
          </div>
          {list.length ? (
            list.map((x) => (
              <button key={x.id} className={`nitem ${x.read_at ? '' : 'unread'}`} onClick={() => openItem(x)}>
                <span style={{ color: 'var(--primary)', marginTop: 2 }}>
                  <Icon name={x.link.report ? 'doc' : x.link.meeting ? 'cal' : x.link.page === 'onaylar' ? 'shield' : 'bell'} size={18} />
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 14 }}>{x.text}</span>
                  <span className="m" style={{ fontSize: 12 }}>
                    {ago(x.created_at)}
                  </span>
                </span>
              </button>
            ))
          ) : (
            <div className="empty" style={{ margin: 16 }}>
              Henüz bildirim yok.
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function AppShell() {
  const { role } = useAuth()
  const logout = useLogout()
  const loc = useLocation()
  const mods = useModules()
  const items = navItems(role!, mods)
  const pending = usePendingCount(role === 'admin')
  const convs = useConversations(role !== 'ogrenci')
  const unread = (convs.data ?? []).reduce((n, c) => n + c.unread, 0)
  const active = items.find((i) => loc.pathname === `/${i.id}` || loc.pathname.startsWith(`/${i.id}/`))?.id
  const { ref, ind } = useIndicator<HTMLDivElement>(active)
  const [enterKey, setEnterKey] = useState(loc.pathname)
  useEffect(() => setEnterKey(loc.pathname), [loc.pathname])

  return (
    <div className="app">
      <nav className="side" aria-label="Ana menü">
        <div className="nav" ref={ref}>
          {ind}
          {items.map((it) => (
            <NavLink key={it.id} to={`/${it.id}`} className="navbtn">
              <Icon name={it.icon} />
              <span className="lbl">{it.label}</span>
              {it.id === 'iletisim' && unread > 0 && (
                <span className="badge" aria-label={`${unread} okunmamış mesaj`}>
                  {unread}
                </span>
              )}
              {it.id === 'onaylar' && pending > 0 && (
                <span className="badge" aria-label={`${pending} bekleyen`}>
                  {pending}
                </span>
              )}
            </NavLink>
          ))}
        </div>
        <div className="rolebox">
          <b style={{ color: 'var(--on-nav)', display: 'block' }}>{ROLE_TR[role!]}</b>
          {ROLE_HINT[role!]}
        </div>
        <button className="side-out" onClick={logout}>
          <Icon name="out" />
          Çıkış yap
        </button>
      </nav>
      <main className="view enter" key={enterKey}>
        <Outlet />
      </main>
    </div>
  )
}

export function usePendingCount(enabled: boolean) {
  const q = useQuery({
    queryKey: ['pending-count'],
    enabled,
    queryFn: async () => {
      const { count, error } = await supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('status', 'pending')
      if (error) throw error
      return count ?? 0
    },
  })
  return q.data ?? 0
}

export function PendingPage() {
  const { profile, role, session, signOut } = useAuth()
  const toast = useToast()
  const rejected = profile?.status === 'rejected'
  return (
    <main className="view enter" style={{ maxWidth: 640, margin: '0 auto', width: '100%' }}>
      <section className="card a" style={{ padding: 36, display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'flex-start' }}>
        <span
          className="floaty"
          style={{ width: 64, height: 64, borderRadius: 18, background: 'var(--highlight)', color: 'var(--ink-fixed)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <Icon name="lock" size={30} />
        </span>
        <h1 className="hd">{rejected ? 'Hesabına erişim yok' : 'Kaydın onay bekliyor'}</h1>
        <p className="m">
          {rejected
            ? 'Kaydın onaylanmadı ya da hesabın okul yönetimince kapatıldı. Okul yönetimiyle görüşebilirsin.'
            : 'Okul yönetimi kaydını onayladığında öğrenci bilgilerini burada görebileceksin. Onaylanmamış hesaplar hiçbir öğrenci bilgisine erişemez.'}
        </p>
        <div className="card" style={{ padding: '14px 16px', width: '100%' }}>
          {role && (
            <div className="kv">
              <span className="m">Rol</span>
              <b>
                {ROLE_TR[role]}
                {profile?.branch ? ` · ${profile.branch}` : ''}
              </b>
            </div>
          )}
          <div className="kv">
            <span className="m">E-posta</span>
            <b>{session?.user.email}</b>
          </div>
        </div>
        <button
          className="btn"
          onClick={async () => {
            await signOut()
            toast('Çıkış yapıldı', 'out')
          }}
        >
          <Icon name="out" size={18} />
          Çıkış yap
        </button>
      </section>
    </main>
  )
}
