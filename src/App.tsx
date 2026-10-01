import { Suspense, lazy, useEffect } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { gateOf, useAuth } from '@/auth/AuthProvider'
import { navItems, type PageId } from '@/lib/roles'
import { AppShell, PendingPage, TopBar } from '@/components/Shell'
import AuthPage from '@/pages/AuthPage'
import MfaPage from '@/pages/MfaPage'
import { ConsentPage, RolePickPage, SetPasswordPage } from '@/pages/HesapPages'
import { useToast } from '@/components/Toast'
import { supabase } from '@/lib/supabase'
import { useModules } from '@/lib/data'

// Sayfalar ihtiyaç anında yüklenir (ilk açılış hızlı; Lighthouse).
const OnaylarPage = lazy(() => import('@/pages/OnaylarPage'))
const YonetimPage = lazy(() => import('@/pages/YonetimPage'))
const IletisimPage = lazy(() => import('@/pages/IletisimPage'))
const OdevlerPage = lazy(() => import('@/pages/OdevlerPage'))
const PanelPage = lazy(() => import('@/pages/PanelPage'))
const TakvimPage = lazy(() => import('@/pages/TakvimPage'))
const BildirimlerPage = lazy(() => import('@/pages/BildirimlerPage'))
const BugunPage = lazy(() => import('@/pages/BugunPage'))
const DenemelerPage = lazy(() => import('@/pages/DenemelerPage'))
const SiniflarPage = lazy(() => import('@/pages/SiniflarPage'))
const AyarlarPage = lazy(() => import('@/pages/AyarlarPage'))
const KvkkPage = lazy(() => import('@/pages/KvkkPage'))
const BurslulukBasvuru = lazy(() => import('@/pages/BurslulukBasvuru'))
const OgrencilerPage = lazy(() => import('@/pages/OgrencilerPage'))
const OgrenciPage = lazy(() => import('@/pages/OgrenciPage'))
const fam = () => import('@/pages/FamilyPages')
const OzetPage = lazy(() => fam().then((m) => ({ default: m.OzetPage })))
const OkulPage = lazy(() => fam().then((m) => ({ default: m.OkulPage })))
const GorevlerPage = lazy(() => fam().then((m) => ({ default: m.GorevlerPage })))
const GorusmelerPage = lazy(() => fam().then((m) => ({ default: m.GorusmelerPage })))
const RaporlarPage = lazy(() => fam().then((m) => ({ default: m.RaporlarPage })))
const Wait = () => (
  <p className="m" style={{ padding: 20 }}>
    <span className="spinner" aria-hidden="true" /> Yükleniyor…
  </p>
)

const PAGES: Record<PageId, JSX.Element> = {
  bugun: <BugunPage />,
  ogrenciler: <OgrencilerPage />,
  denemeler: <DenemelerPage />,
  siniflar: <SiniflarPage />,
  onaylar: <OnaylarPage />,
  yonetim: <YonetimPage />,
  iletisim: <IletisimPage />,
  odevler: <OdevlerPage />,
  panel: <PanelPage />,
  takvim: <TakvimPage />,
  bildirimler: <BildirimlerPage />,
  ozet: <OzetPage />,
  okul: <OkulPage />,
  gorevler: <GorevlerPage />,
  raporlar: <RaporlarPage />,
  gorusmeler: <GorusmelerPage />,
}

// Oturum süresi: genel 12 saat (supabase/config.toml [auth.sessions]); yönetici için 2 saat (burada).
const ADMIN_MAX_MS = 2 * 3600_000

export default function App() {
  const auth = useAuth()
  const gate = gateOf(auth)
  const loc = useLocation()
  const toast = useToast()
  useEffect(() => {
    if (auth.profile?.role !== 'admin' || !auth.session) return
    const check = () => {
      const t = Date.parse(auth.session!.user.last_sign_in_at ?? '')
      if (t && Date.now() - t > ADMIN_MAX_MS) {
        supabase.auth.signOut()
        toast('Güvenlik için yönetici oturumu 2 saatte kapanır. Yeniden giriş yap.', 'lock')
      }
    }
    check()
    const i = setInterval(check, 60_000)
    return () => clearInterval(i)
  }, [auth.profile?.role, auth.session, toast])
  if (loc.pathname === '/bursluluk')
    return (
      <>
        <TopBar />
        <Suspense fallback={<Wait />}>
          <BurslulukBasvuru />
        </Suspense>
      </>
    )
  if (loc.pathname === '/kvkk')
    return (
      <>
        <TopBar />
        <Suspense fallback={<Wait />}>
          <KvkkPage />
        </Suspense>
      </>
    )
  return (
    <>
      <TopBar />
      {gate === 'loading' && (
        <main className="view" aria-busy="true" style={{ alignItems: 'center', paddingTop: 80 }}>
          <span className="spinner" aria-label="Yükleniyor" />
        </main>
      )}
      {gate === 'login' && <AuthPage />}
      {gate === 'password' && <SetPasswordPage />}
      {gate === 'consent' && <ConsentPage />}
      {gate === 'mfa' && <MfaPage />}
      {gate === 'pending' && <PendingPage />}
      {gate === 'rol' && <RolePickPage />}
      {gate === 'app' && <RoleRoutes />}
    </>
  )
}

/** Rol bazlı yönlendirme: menüde olmayan sayfaya gidilirse rolün ilk sayfasına döner. */
function RoleRoutes() {
  const { role } = useAuth()
  const mods = useModules()
  const allowed = navItems(role!, mods).map((n) => n.id)
  const home = `/${allowed[0]}`
  return (
    <Routes>
      <Route element={<AppShell />}>
        {allowed.map((id) => (
          <Route key={id} path={id} element={<Suspense fallback={<Wait />}>{PAGES[id]}</Suspense>} />
        ))}
        {allowed.includes('ogrenciler') && (
          <Route
            path="ogrenciler/:sid"
            element={
              <Suspense fallback={<Wait />}>
                <OgrenciPage />
              </Suspense>
            }
          />
        )}
        <Route
          path="bildirimler"
          element={
            <Suspense fallback={<Wait />}>
              <BildirimlerPage />
            </Suspense>
          }
        />
        {role === 'admin' && (
          <Route
            path="ayarlar"
            element={
              <Suspense fallback={<Wait />}>
                <AyarlarPage />
              </Suspense>
            }
          />
        )}
        <Route path="*" element={<Navigate to={home} replace />} />
      </Route>
    </Routes>
  )
}
