import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/auth/AuthProvider'
import { Icon } from '@/components/Icon'
import { AuthLayout } from './AuthPage'

type State =
  | { k: 'loading' }
  | { k: 'verify'; factorId: string }
  | { k: 'enroll'; factorId: string; qr: string; secret: string }
  | { k: 'error'; msg: string }

// Aynı kullanıcı için kurulum bir kez başlatılır (StrictMode efekti iki kez çalıştırır).
const pending = new Map<string, Promise<State>>()
function prepare(uid: string): Promise<State> {
  let p = pending.get(uid)
  if (!p) {
    p = loadFactor().finally(() => setTimeout(() => pending.delete(uid), 1000))
    pending.set(uid, p)
  }
  return p
}

async function loadFactor(): Promise<State> {
  const { data, error } = await supabase.auth.mfa.listFactors()
  if (error) return { k: 'error', msg: 'Doğrulama bilgisi alınamadı. Sayfayı yenile.' }
  const verified = data.totp.find((f) => f.status === 'verified')
  if (verified) return { k: 'verify', factorId: verified.id }
  // Yarım kalmış (doğrulanmamış) kurulumları temizle, yenisini başlat.
  for (const f of data.all.filter((f) => f.status !== 'verified')) await supabase.auth.mfa.unenroll({ factorId: f.id })
  const { data: en, error: enErr } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Buluş Küre', issuer: 'Buluş Küre' })
  if (enErr) return { k: 'error', msg: 'Kurulum başlatılamadı. Sayfayı yenile.' }
  return { k: 'enroll', factorId: en.id, qr: en.totp.qr_code, secret: en.totp.secret }
}

/**
 * Yönetici için zorunlu iki adımlı doğrulama (Supabase MFA, TOTP).
 * Doğrulanmış faktör yoksa QR ile kurulum yapılır; varsa kod istenir.
 * Veritabanı tarafı: is_admin() aal2 ister — bu ekran atlanırsa bile admin verisi okunamaz.
 */
export default function MfaPage() {
  const { signOut, session } = useAuth()
  const [st, setSt] = useState<State>({ k: 'loading' })
  const [code, setCode] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    prepare(session?.user.id ?? '').then((next) => !cancelled && setSt(next))
    return () => {
      cancelled = true
    }
  }, [session?.user.id])

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (st.k !== 'verify' && st.k !== 'enroll') return
    const c = code.replace(/\D/g, '')
    if (c.length !== 6) return setErr('6 haneli kodu yaz.')
    setErr(null)
    setBusy(true)
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: st.factorId, code: c })
    setBusy(false)
    if (error) {
      setCode('')
      setErr(error.status === 429 ? 'Çok fazla deneme yapıldı. Birkaç dakika sonra tekrar dene.' : 'Kod hatalı ya da süresi doldu. Uygulamadaki güncel kodu yaz.')
    }
    // Başarılıysa oturum aal2'ye yükselir; yönlendirmeyi oturum durumu yapar.
  }

  return (
    <AuthLayout>
      <form className="stack a" noValidate onSubmit={submit}>
        <div className="chip dark" style={{ alignSelf: 'flex-start' }}>
          <Icon name="shield" size={14} stroke={2} />
          İki adımlı doğrulama
        </div>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 500 }}>
          {st.k === 'enroll' ? 'Authenticator kurulumu' : 'Authenticator kodu'}
        </h2>
        {st.k === 'loading' && (
          <p className="m">
            <span className="spinner" aria-hidden="true" /> Hazırlanıyor…
          </p>
        )}
        {st.k === 'error' && (
          <div className="err" role="alert">
            {st.msg}
          </div>
        )}
        {st.k === 'enroll' && (
          <section className="card" style={{ padding: 16, display: 'flex', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <img className="qr" src={st.qr} alt="Authenticator için QR kodu" />
            <div className="stack" style={{ flex: 1, minWidth: 180, gap: 6 }}>
              <span className="m" style={{ fontSize: 13 }}>
                Yönetici hesabı iki adımlı doğrulama ister. QR kodunu Google veya Microsoft Authenticator ile tara ya da anahtarı elle gir:
              </span>
              <b className="mono" style={{ letterSpacing: 2 }} data-testid="totp-secret">
                {st.secret.replace(/(.{4})/g, '$1 ').trim()}
              </b>
            </div>
          </section>
        )}
        {(st.k === 'verify' || st.k === 'enroll') && (
          <>
            <p className="m">
              {st.k === 'enroll'
                ? 'Ekledikten sonra uygulamada görünen 6 haneli kodu yaz.'
                : `Telefonundaki Authenticator uygulamasında “Buluş Küre” hesabının 6 haneli kodunu yaz.`}
            </p>
            <label className="field" htmlFor="tCode">
              Kod
              <input
                id="tCode"
                className="codebox"
                inputMode="numeric"
                maxLength={6}
                autoComplete="one-time-code"
                autoFocus
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              />
            </label>
            {err && (
              <div className="err" role="alert">
                {err}
              </div>
            )}
            <button className="btn pri" style={{ minHeight: 50, fontSize: 16 }} type="submit" disabled={busy}>
              {busy ? <span className="spinner" aria-hidden="true" /> : null}
              Doğrula ve gir
            </button>
          </>
        )}
        <button type="button" className="btn ghost" onClick={() => signOut()}>
          Geri
        </button>
        {session && (
          <span className="m" style={{ fontSize: 12, textAlign: 'center' }}>
            {session.user.email}
          </span>
        )}
      </form>
    </AuthLayout>
  )
}
