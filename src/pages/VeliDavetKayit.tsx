// Velinin davet kartındaki karekodla / WhatsApp bağlantısıyla açtığı sayfa (0103): /v/<kod> ya da /v (kodu elle yazar).
// Sayfa yalnız kısaltılmış adı ve sınıfı gösterir. Kayıt mevcut veli kaydıdır; okul yönetimi onaylayınca hesap açılır. Veliye "siz".
import { useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase, signupClient, SCHOOL_SLUG } from '@/lib/supabase'
import { ACIK_RIZA_VERSION, KVKK_VERSION, RIZA_ONAY } from '@/lib/kvkk'
import { YAKINLIK } from '@/lib/roles'
import { useAuth } from '@/auth/AuthProvider'
import { Icon } from '@/components/Icon'
import { AuthLayout } from '@/pages/AuthPage'
import { kodBicim, kodTemizle, sonTarih } from '@/lib/veliDavetMetin'

type Bilgi = { gecerli: true; cocuk: string; sinif: string; okul: string; son: string } | { gecerli: false; neden: 'yok' | 'suresi' | 'dolu' }

const NEDEN: Record<'yok' | 'suresi' | 'dolu', string> = {
  yok: 'Bu davet kodu bulunamadı. Kartta yazan kodu kontrol edip tekrar deneyin ya da okulla iletişime geçin.',
  suresi: 'Bu davet kodunun süresi dolmuş ya da kod yenilenmiş. Yeni kod için okulla iletişime geçin.',
  dolu: 'Bu davet kodu iki kez kullanılmış. Başka bir veli hesabı gerekiyorsa okulla iletişime geçin.',
}

export default function VeliDavetKayit() {
  const { session, profile } = useAuth()
  const params = useParams()
  const nav = useNavigate()
  const kod = kodTemizle(params.kod ?? '')
  const [elle, setElle] = useState('')

  const bilgi = useQuery({
    queryKey: ['veli_davet_bilgi', kod],
    enabled: kod.length === 10,
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('veli_davet_bilgi', { p_kod: kod })
      if (error) throw error
      return data as Bilgi
    },
  })

  let govde: JSX.Element
  if (session)
    govde = (
      <div className="stack a" role="status">
        <h2 className="vdk-baslik">Bu bağlantı yeni veli hesabı içindir</h2>
        <p className="m">
          Şu an {profile?.full_name ?? 'bir hesapla'} giriş yapılmış. Hesabınıza başka bir çocuğunuzu eklemek için bu kodu okul yönetimine iletin; yönetim
          hesabınıza bağlar.
        </p>
        <button className="btn pri" onClick={() => nav('/')}>
          Ana sayfaya dön
        </button>
      </div>
    )
  else if (kod.length !== 10)
    govde = (
      <form
        className="stack a"
        onSubmit={(e) => {
          e.preventDefault()
          if (kodTemizle(elle).length === 10) nav(`/v/${kodBicim(kodTemizle(elle))}`)
        }}
      >
        <h2 className="vdk-baslik">Veli hesabı açın</h2>
        <p className="m">Davet kartındaki 10 karakterli kodu yazın.</p>
        <label className="field" htmlFor="vdKod">
          Davet kodu
          <input id="vdKod" autoComplete="off" spellCheck={false} placeholder="XXXXX-XXXXX" value={elle} onChange={(e) => setElle(kodBicim(kodTemizle(e.target.value)))} />
        </label>
        <button className="btn pri" type="submit" disabled={kodTemizle(elle).length !== 10} style={{ minHeight: 50 }}>
          Devam
        </button>
      </form>
    )
  else if (bilgi.isLoading)
    govde = (
      <p className="m">
        <span className="spinner" aria-hidden="true" /> Kod kontrol ediliyor…
      </p>
    )
  else if (bilgi.isError || !bilgi.data)
    govde = (
      <p className="err" role="alert">
        Kod kontrol edilemedi. İnternet bağlantınızı kontrol edip sayfayı yenileyin.
      </p>
    )
  else if (!bilgi.data.gecerli)
    govde = (
      <div className="stack a">
        <h2 className="vdk-baslik">Davet kodu geçersiz</h2>
        <p className="err" role="alert">
          {NEDEN[bilgi.data.neden]}
        </p>
        <button className="btn" onClick={() => nav('/v')}>
          Kodu elle yazın
        </button>
      </div>
    )
  else govde = <Form kod={kod} b={bilgi.data} />

  return <AuthLayout>{govde}</AuthLayout>
}

function Form({ kod, b }: { kod: string; b: Extract<Bilgi, { gecerli: true }> }) {
  const nav = useNavigate()
  const [f, setF] = useState({ rel: 'Anne', name: '', email: '', pass: '', pass2: '', consent: false, riza: false })
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [bitti, setBitti] = useState<null | { onay: boolean }>(null)

  async function gonder(e: FormEvent) {
    e.preventDefault()
    const h: string[] = []
    if (f.name.trim().length < 3) h.push('Adınızı ve soyadınızı yazın.')
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) h.push('Geçerli bir e-posta yazın.')
    if (f.pass.length < 8) h.push('Şifre en az 8 karakter olmalı.')
    else if (f.pass !== f.pass2) h.push('Şifreler aynı değil.')
    if (!f.consent) h.push('Aydınlatma Metni’ni okuduğunuzu belirtin.')
    if (!f.riza) h.push('Açık Rıza Metni’ni onaylayın.')
    if (h.length) return setErr(h.join(' '))
    setErr(null)
    setBusy(true)
    const { data, error } = await signupClient().auth.signUp({
      email: f.email.trim(),
      password: f.pass,
      options: {
        data: {
          school: SCHOOL_SLUG,
          consent_version: KVKK_VERSION,
          acik_riza_version: ACIK_RIZA_VERSION,
          full_name: f.name.trim(),
          role: 'veli',
          // Öğrencinin tam adı ve sınıfı sunucuda koddan yazılır
          declared: { childName: b.cocuk, childClass: b.sinif, relation: f.rel },
          davet: kod,
        },
      },
    })
    setBusy(false)
    if (error) {
      const m = error.message.toLowerCase()
      setErr(
        m.includes('already registered') || m.includes('already been registered')
          ? 'Bu e-posta ile zaten bir hesap var. Giriş yapıp çocuğunuzu eklemek için kodu okul yönetimine iletin.'
          : m.includes('password')
            ? 'Şifre en az 8 karakter olmalı.'
            : error.status === 429
              ? 'Çok fazla deneme yapıldı. Birkaç dakika sonra tekrar deneyin.'
              : 'Kayıt alınamadı. Davet kodunun süresi dolmuş olabilir; okulla iletişime geçin.',
      )
      return
    }
    setBitti({ onay: !data.session })
  }

  if (bitti)
    return (
      <div className="stack a" style={{ alignItems: 'center', textAlign: 'center', paddingTop: 20 }} role="status">
        <svg width="84" height="84" viewBox="0 0 72 72" aria-hidden="true">
          <circle cx="36" cy="36" r="34" fill="var(--primary-soft)" />
          <path d="M22 37l10 10 19-21" fill="none" stroke="var(--primary)" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <h2 className="vdk-baslik">Kaydınız alındı</h2>
        <p className="m">
          {bitti.onay ? 'E-posta adresinize bir doğrulama bağlantısı gönderdik; önce ona tıklayın (gelmediyse gereksiz/spam klasörüne bakın). ' : ''}
          Okul yönetimi onayladığında bu e-posta ve şifreyle giriş yapabilirsiniz; {b.cocuk} sayfası hesabınıza bağlı gelir.
        </p>
        <button className="btn pri" onClick={() => nav('/')}>
          Giriş ekranına git
        </button>
      </div>
    )

  const set = (k: 'rel' | 'name' | 'email' | 'pass' | 'pass2') => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }))
  return (
    <form className="stack a" noValidate onSubmit={gonder}>
      <span className="chip up" style={{ alignSelf: 'flex-start' }}>
        Davet kodu geçerli
      </span>
      <h2 className="vdk-baslik">
        {b.cocuk} · {b.sinif} için veli hesabı
      </h2>
      <p className="m">
        Hesabınız açıldığında çocuğunuzun ödev, deneme ve duyuruları size bağlı gelir. Kod {sonTarih(b.son)} tarihine kadar geçerli.
      </p>
      <label className="field" htmlFor="vdRel">
        Yakınlığınız
        <select id="vdRel" value={f.rel} onChange={set('rel')}>
          {YAKINLIK.map((y) => (
            <option key={y}>{y}</option>
          ))}
        </select>
      </label>
      <label className="field" htmlFor="vdAd">
        Adınız soyadınız
        <input id="vdAd" value={f.name} onChange={set('name')} autoComplete="name" />
      </label>
      <label className="field" htmlFor="vdEposta">
        E-posta
        <input id="vdEposta" type="email" value={f.email} onChange={set('email')} autoComplete="email" />
      </label>
      <div className="grid2">
        <label className="field" htmlFor="vdSifre">
          Şifre
          <input id="vdSifre" type="password" value={f.pass} onChange={set('pass')} autoComplete="new-password" />
        </label>
        <label className="field" htmlFor="vdSifre2">
          Şifre tekrar
          <input id="vdSifre2" type="password" value={f.pass2} onChange={set('pass2')} autoComplete="new-password" />
        </label>
      </div>
      <div className="stack" style={{ gap: 2 }}>
        <button type="button" className="check" role="checkbox" aria-checked={f.consent} onClick={() => setF((x) => ({ ...x, consent: !x.consent }))}>
          <span className={`box ${f.consent ? 'on' : ''}`}>{f.consent && <Icon name="check" size={13} stroke={3} />}</span>
          <span style={{ flex: 1, fontSize: 14 }}>Kişisel Verilerin Korunması Hakkında Aydınlatma Metni’ni okudum ve kişisel verilerimin işlenmesi hakkında bilgi edindim.</span>
        </button>
        <a href="/kvkk" target="_blank" rel="noreferrer" style={{ fontSize: 13, marginLeft: 34 }}>
          Aydınlatma metnini okuyun
        </a>
        <button type="button" className="check" role="checkbox" aria-checked={f.riza} onClick={() => setF((x) => ({ ...x, riza: !x.riza }))} style={{ marginTop: 6 }}>
          <span className={`box ${f.riza ? 'on' : ''}`}>{f.riza && <Icon name="check" size={13} stroke={3} />}</span>
          <span style={{ flex: 1, fontSize: 14 }}>{RIZA_ONAY}</span>
        </button>
        <a href="/acik-riza" target="_blank" rel="noreferrer" style={{ fontSize: 13, marginLeft: 34 }}>
          Açık rıza metnini okuyun
        </a>
      </div>
      {err && (
        <div className="err" role="alert">
          {err}
        </div>
      )}
      <button className="btn pri" style={{ minHeight: 50, fontSize: 16 }} type="submit" disabled={busy}>
        {busy ? <span className="spinner" aria-hidden="true" /> : null}
        Hesabımı aç
      </button>
    </form>
  )
}
