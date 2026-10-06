import { useState, type FormEvent, type ReactNode } from 'react'
import { supabase, signupClient, SCHOOL_SLUG, SOURCE_URL } from '@/lib/supabase'
import { KVKK_VERSION } from '@/lib/kvkk'
import { useQuery } from '@tanstack/react-query'
import { BRANS, LEVEL_TR, LEVELS, YAKINLIK, type Level } from '@/lib/roles'
import { Globe, Icon, SchoolLogo } from '@/components/Icon'
import { useSchoolInfo } from '@/lib/files'
import { Dropdown, Seg } from '@/components/Indicator'
import { clearRoleChoice } from '@/auth/AuthProvider'

export function AuthLayout({ children }: { children: ReactNode }) {
  const info = useSchoolInfo()
  return (
    <div className="login">
      <section className="login-art">
        <span className="orb" style={{ width: 260, height: 260, background: '#1f5f5b', left: -60, top: '30%' }} />
        <span className="orb" style={{ width: 200, height: 200, background: '#e7c57a', left: '40%', bottom: -60, animationDelay: '-4s' }} />
        <Globe size={420} />
        <span className="label a" style={{ color: 'var(--on-nav-muted)', position: 'relative' }}>
          Buluş Küre Koleji
        </span>
        <h1 className="a" style={{ ['--d' as string]: 1 }}>
          Rehberlik &amp; Mentörlük
        </h1>
        <p className="a m" style={{ ['--d' as string]: 2, position: 'relative', maxWidth: 420 }}>
          Her deneme, öğrenciyi biraz daha iyi tanımak için.
        </p>
      </section>
      <section className="login-form">
        <div className="inner">
          <div className="a" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <SchoolLogo url={info.data?.logo} />
            <div>
              <b style={{ fontFamily: 'var(--font-display)', fontSize: 21, display: 'block', lineHeight: 1.1 }}>{info.data?.name ?? 'Buluş Küre Koleji'}</b>
              <span className="m" style={{ fontSize: 13 }}>
                Rehberlik &amp; Mentörlük
              </span>
            </div>
          </div>
          {children}
          <a className="m" href={SOURCE_URL} target="_blank" rel="noreferrer" style={{ fontSize: 12, alignSelf: 'center', marginTop: 8 }}>
            Özgür yazılım (AGPL-3.0) · Kaynak kodu
          </a>
        </div>
      </section>
    </div>
  )
}

type Step = 'login' | 'register' | 'sent'
type RegRole = 'ogrenci' | 'veli' | 'ogretmen'

export default function AuthPage() {
  const [step, setStep] = useState<Step>('login')
  return (
    <AuthLayout>
      {step === 'login' && <LoginForm onStep={setStep} />}
      {step === 'register' && <RegisterForm onStep={setStep} />}
      {step === 'sent' && (
        <div className="stack a" style={{ alignItems: 'center', textAlign: 'center', paddingTop: 30 }}>
          <svg width="84" height="84" viewBox="0 0 72 72" className="pp" aria-hidden="true">
            <circle cx="36" cy="36" r="34" fill="var(--primary-soft)" />
            <path className="draw" pathLength={1} d="M22 37l10 10 19-21" fill="none" stroke="var(--primary)" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 500 }}>Kaydın alındı</h2>
          <p className="m">E-posta adresine bir doğrulama bağlantısı gönderdik; önce ona tıkla (gelmediyse gereksiz/spam klasörüne bak). Okul yönetimi de onayladığında bu e-posta ve şifreyle giriş yapabilirsin.</p>
          <button className="btn pri" onClick={() => setStep('login')}>
            Giriş ekranına dön
          </button>
        </div>
      )}
    </AuthLayout>
  )
}

function StepSeg({ step, onStep }: { step: Step; onStep: (s: Step) => void }) {
  return (
    <Seg
      className="a"
      label="Giriş veya kayıt"
      value={step}
      onChange={onStep}
      options={[
        ['login', 'Giriş yap'],
        ['register', 'Kayıt ol'],
      ]}
    />
  )
}

function LoginForm({ onStep }: { onStep: (s: Step) => void }) {
  const [email, setEmail] = useState('')
  const [pass, setPass] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [unconfirmed, setUnconfirmed] = useState(false)

  async function resend() {
    const { error } = await supabase.auth.resend({ type: 'signup', email: email.trim(), options: { emailRedirectTo: `${window.location.origin}/` } })
    setErr(error ? (error.status === 429 ? 'Kısa süre önce gönderildi. Birkaç dakika sonra tekrar dene.' : 'Bağlantı gönderilemedi.') : 'Doğrulama bağlantısı yeniden gönderildi. Gelen kutunu (ve spam klasörünü) kontrol et.')
    setUnconfirmed(false)
  }

  async function forgot() {
    const em = email.trim()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(em)) return setErr('Şifre sıfırlama bağlantısı için önce e-postanı yaz.')
    const { error } = await supabase.auth.resetPasswordForEmail(em, { redirectTo: `${window.location.origin}/` })
    setErr(error?.status === 429 ? 'Kısa süre önce gönderildi. Birkaç dakika sonra tekrar dene.' : 'Bu e-postayla bir hesap varsa şifre belirleme bağlantısı gönderildi. Gelen kutunu (ve spam klasörünü) kontrol et.')
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setErr(null)
    setUnconfirmed(false)
    setBusy(true)
    clearRoleChoice() // iki rollü hesap her girişte rolünü seçer
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: pass })
    setBusy(false)
    if (error) {
      const notConfirmed = error.code === 'email_not_confirmed' || /not confirmed/i.test(error.message)
      setUnconfirmed(notConfirmed)
      setErr(
        error.status === 429
          ? 'Çok fazla deneme yapıldı. Birkaç dakika sonra tekrar dene.'
          : notConfirmed
            ? 'E-posta adresin henüz doğrulanmadı. Kayıttan sonra gönderilen bağlantıya tıkla.'
            : error.message.includes('Invalid login')
            ? 'E-posta veya şifre hatalı.'
            : 'Giriş yapılamadı. Bağlantını kontrol edip tekrar dene.',
      )
    }
    // Başarılıysa yönlendirmeyi oturum durumu (gateOf) yapar: admin → TOTP, onaysız → bekleme ekranı.
  }

  return (
    <>
      <StepSeg step="login" onStep={onStep} />
      <form className="stack a" style={{ ['--d' as string]: 1 }} noValidate onSubmit={submit}>
        <label className="field" htmlFor="lEmail">
          E-posta
          <input id="lEmail" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="field" htmlFor="lPass">
          Şifre
          <input id="lPass" type="password" autoComplete="current-password" value={pass} onChange={(e) => setPass(e.target.value)} />
        </label>
        {err && (
          <div className="err" role="alert">
            {err}
          </div>
        )}
        {unconfirmed && (
          <button className="btn" type="button" onClick={resend}>
            Doğrulama bağlantısını yeniden gönder
          </button>
        )}
        <button className="btn pri" style={{ minHeight: 50, fontSize: 16 }} type="submit" disabled={busy}>
          {busy ? <span className="spinner" aria-hidden="true" /> : null}
          Giriş yap
        </button>
        <button type="button" className="linkbtn" style={{ alignSelf: 'center', fontSize: 13 }} onClick={forgot}>
          Şifremi unuttum
        </button>
      </form>
      {DEMO.length > 0 && (
        <Dropdown title="Demo hesapları" sub={import.meta.env.DEV ? 'Yalnız yerel geliştirme · tek tıkla doldur' : 'Deneme ortamı · uydurma örnek veriler'} icon={<Icon name="users" size={22} />} delay={2}>
          <div className="stack" style={{ gap: 6 }}>
            {DEMO.map(([l, e, p]) => (
              <button
                key={e}
                type="button"
                className="btn sm"
                style={{ justifyContent: 'space-between' }}
                onClick={() => {
                  setEmail(e)
                  setPass(p)
                }}
              >
                <span>{l}</span>
                <span className="m mono" style={{ fontSize: 12 }}>
                  {e}
                </span>
              </button>
            ))}
          </div>
        </Dropdown>
      )}
    </>
  )
}

// Yalnız DEV ya da deneme ortamı (VITE_DEMO=1) derlemesinde paketlenir (seed.sql'deki uydurma demo hesaplar).
// Deneme ortamında yönetici listede yoktur: ilk giren kendi Authenticator'ını bağlar, diğerleri giremez.
const DEMO: [string, string, string][] = import.meta.env.DEV
  ? [
      ['Yönetici (Authenticator ile)', 'admin@buluskure.k12.tr', 'Admin123!'],
      ['Rehber öğretmen', 'rehber@buluskure.k12.tr', 'Rehber123!'],
      ['Matematik öğretmeni', 'matematik@buluskure.k12.tr', 'Mat12345!'],
      ['Veli · Elif Yıldız', 'ayse.yildiz@ornek.com', 'Veli1234!'],
      ['Öğrenci · Elif Yıldız', 'elif.yildiz@ornek.com', 'Ogrenci123!'],
      ['Onay bekleyen öğrenci', 'mert.demir@ornek.com', 'Ogrenci123!'],
    ]
  : import.meta.env.VITE_DEMO === '1'
  ? [
      ['Rehber öğretmen', 'rehber@buluskure.k12.tr', 'Rehber123!'],
      ['Matematik öğretmeni', 'matematik@buluskure.k12.tr', 'Mat12345!'],
      ['Veli · Elif Yıldız', 'ayse.yildiz@ornek.com', 'Veli1234!'],
      ['Öğrenci · Elif Yıldız', 'elif.yildiz@ornek.com', 'Ogrenci123!'],
      ['Onay bekleyen öğrenci', 'mert.demir@ornek.com', 'Ogrenci123!'],
    ]
  : []

interface RegForm {
  role: RegRole
  name: string
  email: string
  pass: string
  pass2: string
  brans: string
  cls: string
  no: string
  childName: string
  childCls: string
  rel: string
  consent: boolean
}

/** Kayıt formu doğrulaması — prototipteki kurallar ve mesajlar. */
export function validateRegistration(f: RegForm): string[] {
  const err: string[] = []
  if (!f.name.trim()) err.push('Ad soyad gerekli.')
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) err.push('Geçerli bir e-posta yaz.')
  if (f.pass.length < 8) err.push('Şifre en az 8 karakter olmalı.')
  else if (f.pass !== f.pass2) err.push('Şifreler aynı değil.')
  if (f.role === 'ogretmen' && !f.brans) err.push('Branşını seç.')
  if (f.role === 'ogrenci' && !f.cls) err.push('Sınıfını seç.')
  if (f.role === 'veli' && (!f.childName.trim() || !f.childCls)) err.push('Öğrencinin adını ve sınıfını yaz.')
  if (!f.consent) err.push('Aydınlatma Metni’ni okuduğunu ve bilgi edindiğini belirt.')
  return err
}

function RegisterForm({ onStep }: { onStep: (s: Step) => void }) {
  const [f, setF] = useState<RegForm>({ role: 'ogrenci', name: '', email: '', pass: '', pass2: '', brans: '', cls: '', no: '', childName: '', childCls: '', rel: 'Anne', consent: false })
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const set = (k: keyof RegForm) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }))

  async function submit(e: FormEvent) {
    e.preventDefault()
    const errs = validateRegistration(f)
    if (errs.length) return setErr(errs.join(' '))
    setErr(null)
    setBusy(true)
    const declared =
      f.role === 'ogrenci'
        ? { className: f.cls, schoolNo: f.no.trim() }
        : f.role === 'veli'
          ? { childName: f.childName.trim(), childClass: f.childCls, relation: f.rel }
          : undefined
    const { error } = await signupClient().auth.signUp({
      email: f.email.trim(),
      password: f.pass,
      options: {
        data: {
          school: SCHOOL_SLUG,
          consent_version: KVKK_VERSION,
          full_name: f.name.trim(),
          role: f.role,
          ...(f.role === 'ogretmen' ? { branch: f.brans } : {}),
          ...(declared ? { declared } : {}),
        },
      },
    })
    setBusy(false)
    if (error) {
      const m = error.message.toLowerCase()
      setErr(
        m.includes('already registered') || m.includes('already been registered')
          ? 'Bu e-posta zaten kayıtlı.'
          : m.includes('password')
            ? 'Şifre en az 8 karakter olmalı.'
            : error.status === 429
              ? 'Çok fazla deneme yapıldı. Birkaç dakika sonra tekrar dene.'
              : 'Kayıt alınamadı. Bilgilerini kontrol edip tekrar dene.',
      )
      return
    }
    onStep('sent')
  }

  const r = f.role
  return (
    <>
      <StepSeg step="register" onStep={onStep} />
      <form className="stack a" style={{ ['--d' as string]: 1 }} noValidate onSubmit={submit}>
        <div className="stack" style={{ gap: 6 }}>
          <span className="label">Rolün</span>
          <Seg
            label="Rol"
            stretch
            value={r}
            onChange={(role) => {
              setF((x) => ({ ...x, role }))
              setErr(null)
            }}
            options={[
              ['ogrenci', 'Öğrenci'],
              ['veli', 'Veli'],
              ['ogretmen', 'Öğretmen'],
            ]}
          />
        </div>
        <label className="field" htmlFor="rName">
          Ad soyad
          <input id="rName" value={f.name} onChange={set('name')} autoComplete="name" />
        </label>
        <label className="field" htmlFor="rEmail">
          E-posta
          <input id="rEmail" type="email" value={f.email} onChange={set('email')} autoComplete="email" />
        </label>
        <div className="grid2">
          <label className="field" htmlFor="rPass">
            Şifre
            <input id="rPass" type="password" value={f.pass} onChange={set('pass')} autoComplete="new-password" />
          </label>
          <label className="field" htmlFor="rPass2">
            Şifre tekrar
            <input id="rPass2" type="password" value={f.pass2} onChange={set('pass2')} autoComplete="new-password" />
          </label>
        </div>
        {r === 'ogretmen' && (
          <label className="field" htmlFor="rBrans">
            Branşın
            <select id="rBrans" value={f.brans} onChange={set('brans')}>
              <option value="">Seç</option>
              {BRANS.map((b) => (
                <option key={b}>{b}</option>
              ))}
            </select>
          </label>
        )}
        {r === 'ogrenci' && (
          <div className="grid2">
            <label className="field" htmlFor="rCls">
              Sınıfın
              <select id="rCls" value={f.cls} onChange={set('cls')}>
                <option value="">Seç</option>
                <ClassOptions />
              </select>
            </label>
            <label className="field" htmlFor="rNo">
              Okul numaran
              <input id="rNo" inputMode="numeric" value={f.no} onChange={set('no')} />
            </label>
          </div>
        )}
        {r === 'veli' && (
          <>
            <label className="field" htmlFor="rChild">
              Öğrencinin adı soyadı
              <input id="rChild" value={f.childName} onChange={set('childName')} />
            </label>
            <div className="grid2">
              <label className="field" htmlFor="rCCls">
                Öğrencinin sınıfı
                <select id="rCCls" value={f.childCls} onChange={set('childCls')}>
                  <option value="">Seç</option>
                  <ClassOptions />
                </select>
              </label>
              <label className="field" htmlFor="rRel">
                Yakınlığın
                <select id="rRel" value={f.rel} onChange={set('rel')}>
                  {YAKINLIK.map((b) => (
                    <option key={b}>{b}</option>
                  ))}
                </select>
              </label>
            </div>
          </>
        )}
        <div className="stack" style={{ gap: 2 }}>
          <button type="button" className="check" role="checkbox" aria-checked={f.consent} onClick={() => setF((x) => ({ ...x, consent: !x.consent }))}>
            <span className={`box ${f.consent ? 'on' : ''}`}>{f.consent && <Icon name="check" size={13} stroke={3} />}</span>
            <span style={{ flex: 1, fontSize: 14 }}>Kişisel Verilerin Korunması Hakkında Aydınlatma Metni’ni okudum ve kişisel verilerimin işlenmesi hakkında bilgi edindim.</span>
          </button>
          <a href="/kvkk" target="_blank" rel="noreferrer" style={{ fontSize: 13, marginLeft: 34 }}>
            Aydınlatma metnini oku
          </a>
        </div>
        {err && (
          <div className="err" role="alert">
            {err}
          </div>
        )}
        <button className="btn pri" style={{ minHeight: 50, fontSize: 16 }} type="submit" disabled={busy}>
          {busy ? <span className="spinner" aria-hidden="true" /> : null}
          Kayıt ol
        </button>
        <p className="m" style={{ fontSize: 13, textAlign: 'center' }}>
          Kaydın okul yönetimi onayladıktan sonra açılır.
        </p>
      </form>
    </>
  )
}

/** Kayıt formundaki sınıf seçenekleri: okulda açılmış sınıflar, kademeye göre gruplu (giriş gerekmez). */
function ClassOptions() {
  const q = useQuery({
    queryKey: ['signup-classes'],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('signup_classes', { p_school: SCHOOL_SLUG })
      if (error) throw error
      return data as { name: string; grade: number; level: Level }[]
    },
  })
  if (!q.data) return <option disabled>{q.isError ? 'Sınıflar yüklenemedi' : 'Yükleniyor…'}</option>
  return (
    <>
      {LEVELS.map((lv) => {
        const cs = q.data.filter((c) => c.level === lv)
        return cs.length ? (
          <optgroup key={lv} label={LEVEL_TR[lv]}>
            {cs.map((c) => (
              <option key={c.name}>{c.name}</option>
            ))}
          </optgroup>
        ) : null
      })}
    </>
  )
}
