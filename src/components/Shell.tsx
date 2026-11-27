import { useEffect, useRef, useState } from 'react'
import { hataRol } from '@/lib/hataKaydi'
import { HataSiniri } from './HataSiniri'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase, SOURCE_URL } from '@/lib/supabase'
import { gateOf, useAuth } from '@/auth/AuthProvider'
import { navItems, ROLE_HINT, ROLE_TR, SWITCH_TR } from '@/lib/roles'
import { menuAyarla, useAyar } from '@/lib/ayarlar'
import { useEtkinlikKaydi, useEtkinlikYetki } from '@/lib/etkinlik'
import { useOdaOkunmamis } from '@/lib/odaData'
import { useConversations, useFamilyTracks, useModules, useSettings } from '@/lib/data'
import type { Notification } from '@/lib/types'
import { ago } from '@/lib/format'
import { Icon, SchoolLogo } from './Icon'
import { useSchoolInfo } from '@/lib/files'
import { hepsiniOkunduYap, ntype, useOkunmamisSayisi, useOpenNotification } from '@/lib/notifications'
import { useIndicator } from './Indicator'
import { useToast } from './Toast'
import { TemaSecici } from './Tema'
import { AvatarSecici, KisiSimge } from './Avatar'
import { CevrimdisiKuyruk } from './CevrimdisiKuyruk'
import { AcilisPenceresi } from './AcilisPenceresi'

function Brand() {
  const info = useSchoolInfo()
  const settings = useSettings()
  return (
    <div className="brandline">
      <SchoolLogo url={info.data?.logo} />
      <div>
        <b>{info.data?.name ?? 'Buluş Küre Koleji'}</b>
        <small>{String(settings.data?.['genel.alt_baslik'] ?? 'Rehberlik & Mentörlük')}</small>
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
  const { profile, role, session, switchable, switchRole, children, activeStudent, switchStudent } = useAuth()
  const etkYetki = useEtkinlikYetki(role === 'admin')
  const logout = useLogout()
  const navigate = useNavigate()
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
        <KisiSimge ad={profile.full_name} avatar={profile.avatar} boyut={34} />
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
            {activeStudent && (
              <span style={{ fontSize: 13, display: 'block' }} data-testid="aktif-ogrenci">
                Aktif öğrenci: <b>{activeStudent.full_name}</b> · {activeStudent.class_name}
              </span>
            )}
            <span className="m" style={{ fontSize: 12 }}>
              {session?.user.email}
            </span>
          </div>
          <Link className="pitem" role="menuitem" to="/hesap-ayarlari" onClick={() => setOpen(false)}>
            <Icon name="shield" size={18} />
            Hesap ayarları
          </Link>
          <TemaSecici />
          <AvatarSecici />
          {role === 'admin' && (
            <Link
              className="pitem"
              role="menuitem"
              to="/ayarlar"
              onClick={() => setOpen(false)}
              style={{ color: 'var(--ink)', fontWeight: 500, textDecoration: 'none' }}
            >
              <Icon name="shield" size={18} />
              Okul ayarları
            </Link>
          )}
          {etkYetki.data && (
            <Link className="pitem" role="menuitem" to="/etkinlik" onClick={() => setOpen(false)} style={{ color: 'var(--ink)', fontWeight: 500, textDecoration: 'none' }}>
              <Icon name="lock" size={18} />
              Etkinlik günlüğü
            </Link>
          )}
          {children.length > 1 && (
            <>
              <span className="label" style={{ padding: '10px 16px 0', display: 'block' }}>
                Öğrenci değiştir
              </span>
              {children.map((c) => (
                <button
                  key={c.id}
                  className="pitem"
                  role="menuitemradio"
                  aria-checked={activeStudent?.id === c.id}
                  style={{ color: 'var(--ink)' }}
                  onClick={() => {
                    setOpen(false)
                    if (activeStudent?.id !== c.id) {
                      switchStudent(c.id)
                      navigate('/')
                    }
                  }}
                >
                  <Icon name="user" size={18} />
                  <span style={{ flex: 1 }}>
                    {c.full_name}{' '}
                    <span className="m" style={{ fontWeight: 400 }}>
                      · {c.class_name}
                    </span>
                  </span>
                  {activeStudent?.id === c.id && <Icon name="check" size={16} stroke={2.4} />}
                </button>
              ))}
            </>
          )}
          {switchable.length > 0 && (
            <span className="label" style={{ padding: '10px 16px 0', display: 'block' }}>
              Rol değiştir
            </span>
          )}
          {switchable
            .filter((r) => r !== profile.role)
            .map((r) => (
              <button
                key={r}
                className="pitem"
                role="menuitem"
                aria-label={`Rol değiştir: ${SWITCH_TR[r]} olarak devam et`}
                style={{ color: 'var(--ink)' }}
                onClick={() => {
                  setOpen(false)
                  switchRole(r)
                  navigate('/')
                }}
              >
                <Icon name={r === 'ogretmen' ? 'book' : 'users'} size={18} />
                {SWITCH_TR[r]} olarak devam et
              </button>
            ))}
          <a
            className="pitem"
            role="menuitem"
            href={SOURCE_URL}
            target="_blank"
            rel="noreferrer"
            style={{ color: 'var(--ink-muted)', fontWeight: 500, fontSize: 13, textDecoration: 'none' }}
          >
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
  const { profile, role } = useAuth()
  const qc = useQueryClient()
  const nav = useNavigate()
  const ref = useRef<HTMLDivElement>(null)
  const q = useQuery({
    queryKey: ['notifications', profile?.id, role],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('notifications')
        .select('id, text, link, read_at, created_at, type')
        .order('created_at', { ascending: false })
        .limit(40)
      if (error) throw error
      return (data as Notification[]).filter((n) => n.type !== 'nobet' || role === 'brans' || role === 'rehber')
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
  const sayac = useOkunmamisSayisi(profile?.id, role)
  const okunmamis = Math.max(sayac.data ?? 0, unread.length)
  const hepsi = useMutation({ mutationFn: hepsiniOkunduYap, onSettled: () => qc.invalidateQueries({ queryKey: ['notifications'] }) })

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

  const openN = useOpenNotification()
  const openItem = (n: Notification) => {
    if (!n.read_at) markRead.mutate([n.id])
    setOpen(false)
    openN(n)
  }

  return (
    <div ref={ref}>
      <button
        className={`bell ${okunmamis ? 'has' : ''}`}
        onClick={() => setOpen(!open)}
        aria-label={`Bildirimler${okunmamis ? `, ${okunmamis} okunmamış` : ''}`}
        aria-expanded={open}
      >
        <Icon name="bell" />
        {okunmamis > 0 && <span className="dot">{okunmamis > 99 ? '99+' : okunmamis}</span>}
      </button>
      {open && (
        <div className="npanel" role="dialog" aria-label="Bildirimler">
          <div className="kv" style={{ padding: '14px 16px', borderBottom: '1px solid var(--line)' }}>
            <b>Bildirimler</b>
            {okunmamis > 0 && (
              <button className="btn ghost sm" disabled={hepsi.isPending} onClick={() => hepsi.mutate()}>
                Hepsini okundu yap
              </button>
            )}
          </div>
          {list.length ? (
            list.map((x) => (
              <button key={x.id} className={`nitem ${x.read_at ? '' : 'unread'}`} onClick={() => openItem(x)}>
                <span style={{ color: 'var(--primary)', marginTop: 2 }}>
                  <Icon name={ntype(x.type).icon} size={18} />
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
          <button
            className="btn ghost sm"
            style={{ width: '100%', borderTop: '1px solid var(--line)', borderRadius: 0, minHeight: 44 }}
            onClick={() => {
              setOpen(false)
              nav('/bildirimler')
            }}
          >
            Tüm bildirimler
          </button>
        </div>
      )}
    </div>
  )
}

export function AppShell() {
  const { role, session } = useAuth()
  hataRol(role)
  const logout = useLogout()
  const loc = useLocation()
  useEtkinlikKaydi(session?.user.id, role, loc.pathname) // etkinlik günlüğü (0100): açılış ve sayfa kaydı
  const mods = useModules()
  const fam = useFamilyTracks(role === 'veli' || role === 'ogrenci')
  const ayar = useAyar()
  const items = menuAyarla(navItems(role!, mods, fam), role!, ayar)
  const pending = usePendingCount(role === 'admin')
  const convs = useConversations(role !== 'ogrenci')
  const unread = (convs.data ?? []).reduce((n, c) => n + c.unread, 0)
  // Öğretmenler Odası sohbetinde okunmamış mesaj (menüde sayfa varsa)
  const odaVar = items.some((x) => x.id === 'ogretmenler-odasi')
  const odaQ = useOdaOkunmamis(odaVar)
  const oda = odaVar ? Object.values(odaQ.data ?? {}).reduce((a, b) => a + b, 0) : 0
  const active = items.find((i) => loc.pathname === `/${i.id}` || loc.pathname.startsWith(`/${i.id}/`))?.id
  const { ref, ind } = useIndicator<HTMLDivElement>(active)
  const [enterKey, setEnterKey] = useState(loc.pathname)
  const [more, setMore] = useState(false)
  useEffect(() => {
    setEnterKey(loc.pathname)
    setMore(false)
  }, [loc.pathname])
  // "Daha" menüsü: Escape, dışarıya dokunma veya zil / profil açılınca kapanır
  const moreRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!more) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMore(false)
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node
      if (moreRef.current?.contains(t) || (t as Element).closest?.('.morebtn')) return
      setMore(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onDown)
    }
  }, [more])
  // Telefonda alt çubukta ilk 4 sayfa + "Daha" (menü 5'ten uzunsa); geniş ekranda hepsi yan menüde.
  const overflow = items.length > 5
  const extra = overflow ? items.slice(4) : []
  const extraBadge =
    (extra.some((x) => x.id === 'iletisim') ? unread : 0) + (extra.some((x) => x.id === 'onaylar') ? pending : 0) + (extra.some((x) => x.id === 'ogretmenler-odasi') ? oda : 0)

  return (
    <div className="app">
      <nav className="side" aria-label="Ana menü">
        <div className="nav" ref={ref}>
          {ind}
          {items.map((it, i) => (
            <NavLink key={it.id} to={`/${it.id}`} className={`navbtn${overflow && i >= 4 ? ' over' : ''}`}>
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
              {it.id === 'ogretmenler-odasi' && oda > 0 && (
                <span className="badge" aria-label={`${oda} okunmamış sohbet mesajı`}>
                  {oda > 99 ? '99+' : oda}
                </span>
              )}
            </NavLink>
          ))}
          {overflow && (
            <button
              type="button"
              className={`navbtn morebtn${extra.some((x) => x.id === active) ? ' on' : ''}`}
              aria-expanded={more}
              aria-haspopup="menu"
              onClick={() => setMore((x) => !x)}
            >
              <Icon name="more" />
              <span className="lbl">Daha</span>
              {extraBadge > 0 && (
                <span className="badge" aria-label={`${extraBadge} bekleyen`}>
                  {extraBadge}
                </span>
              )}
            </button>
          )}
        </div>
        {more && (
          <div className="moresheet" role="menu" aria-label="Diğer sayfalar" ref={moreRef}>
            {extra.map((it) => (
              <NavLink key={it.id} to={`/${it.id}`} role="menuitem" className="navbtn" onClick={() => setMore(false)}>
                <Icon name={it.icon} />
                <span className="lbl">{it.label}</span>
                {it.id === 'onaylar' && pending > 0 && <span className="badge">{pending}</span>}
                {it.id === 'iletisim' && unread > 0 && <span className="badge">{unread}</span>}
                {it.id === 'ogretmenler-odasi' && oda > 0 && <span className="badge">{oda > 99 ? '99+' : oda}</span>}
              </NavLink>
            ))}
          </div>
        )}
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
        <CevrimdisiKuyruk />
        <HataSiniri key={loc.pathname}>
          <Outlet />
        </HataSiniri>
      </main>
      <AcilisPenceresi />
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
          style={{
            width: 64,
            height: 64,
            borderRadius: 18,
            background: 'var(--highlight)',
            color: 'var(--ink-fixed)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
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
