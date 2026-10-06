// Davet / şifre sıfırlama bağlantısıyla gelen kişi: şifre belirleme. Davetle açılan hesap: ilk girişte KVKK onayı (Faz F · 0017).
// Öğretmen + veli rolü olan hesap: girişten sonra rol seçimi (0020).
import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { KVKK_VERSION } from '@/lib/kvkk'
import { useAuth } from '@/auth/AuthProvider'
import { SWITCH_TR } from '@/lib/roles'
import { Icon } from '@/components/Icon'
import { AuthLayout } from './AuthPage'

export function SetPasswordPage() {
  const { profile, passwordSet, signOut } = useAuth()
  const [p1, setP1] = useState('')
  const [p2, setP2] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  async function submit(e: FormEvent) {
    e.preventDefault()
    if (p1.length < 8) return setErr('Şifre en az 8 karakter olmalı.')
    if (p1 !== p2) return setErr('Şifreler aynı değil.')
    setBusy(true)
    const { error } = await supabase.auth.updateUser({ password: p1 })
    setBusy(false)
    if (error) return setErr(/same|different/i.test(error.message) ? 'Yeni şifre eskisiyle aynı olamaz.' : /weak|password/i.test(error.message) ? 'Şifre çok zayıf; harf ve rakam kullan.' : 'Şifre kaydedilemedi. Bağlantının süresi dolmuş olabilir; yeniden iste.')
    passwordSet()
  }
  return (
    <AuthLayout>
      <form className="stack a" noValidate onSubmit={submit}>
        <div className="chip dark" style={{ alignSelf: 'flex-start' }}>
          <Icon name="lock" size={14} stroke={2} />
          Hesabın
        </div>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 500 }}>Şifreni belirle</h2>
        <p className="m">{profile ? `${profile.full_name}, ` : ''}bu hesaba bundan sonra e-postan ve buradaki şifreyle gireceksin.</p>
        <label className="field" htmlFor="pw1">
          Yeni şifre (en az 8 karakter)
          <input id="pw1" type="password" autoComplete="new-password" value={p1} onChange={(e) => setP1(e.target.value)} />
        </label>
        <label className="field" htmlFor="pw2">
          Yeni şifre tekrar
          <input id="pw2" type="password" autoComplete="new-password" value={p2} onChange={(e) => setP2(e.target.value)} />
        </label>
        {err && (
          <div className="err" role="alert">
            {err}
          </div>
        )}
        <button className="btn pri" style={{ minHeight: 50, fontSize: 16 }} type="submit" disabled={busy}>
          {busy && <span className="spinner" aria-hidden="true" />} Şifreyi kaydet
        </button>
        <button type="button" className="btn ghost sm" onClick={() => signOut().then(passwordSet)}>
          Vazgeç ve çıkış yap
        </button>
      </form>
    </AuthLayout>
  )
}

export function ConsentPage() {
  const { profile, passwordSet, signOut } = useAuth()
  const [ok, setOk] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  async function accept() {
    setBusy(true)
    const { error } = await supabase.rpc('accept_consent', { p_version: KVKK_VERSION })
    setBusy(false)
    if (error) return setErr('Kaydedilemedi. Sayfayı yenileyip tekrar dene.')
    passwordSet() // profil yeniden okunur
  }
  return (
    <AuthLayout>
      <div className="stack a">
        <div className="chip dark" style={{ alignSelf: 'flex-start' }}>
          <Icon name="shield" size={14} stroke={2} />
          Kişisel veriler
        </div>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 500 }}>Hoş geldin{profile ? `, ${profile.full_name.split(' ')[0]}` : ''}</h2>
        <p className="m">Hesabın okul yönetimi tarafından açıldı. Devam etmeden önce kişisel verilerin nasıl işlendiğini anlatan aydınlatma metnini okuman ve bilgi edindiğini belirtmen gerekiyor.</p>
        <Link to="/kvkk" target="_blank" rel="noreferrer">
          Aydınlatma metnini oku
        </Link>
        <button type="button" className="check" role="checkbox" aria-checked={ok} onClick={() => setOk((x) => !x)}>
          <span className={`box ${ok ? 'on' : ''}`}>{ok && <Icon name="check" size={13} stroke={3} />}</span>
          <span style={{ flex: 1, fontSize: 14 }}>Kişisel Verilerin Korunması Hakkında Aydınlatma Metni’ni okudum ve kişisel verilerimin işlenmesi hakkında bilgi edindim.</span>
        </button>
        {err && (
          <div className="err" role="alert">
            {err}
          </div>
        )}
        <button className="btn pri" style={{ minHeight: 50, fontSize: 16 }} disabled={!ok || busy} onClick={accept}>
          {busy && <span className="spinner" aria-hidden="true" />} Devam et
        </button>
        <button type="button" className="btn ghost sm" onClick={() => signOut()}>
          Çıkış yap
        </button>
      </div>
    </AuthLayout>
  )
}

/** İki rollü hesap: "Nasıl devam etmek istersiniz?" Seçim yalnız ekranı belirler; yetki veritabanında. */
export function RolePickPage() {
  const { profile, switchable, switchRole, signOut } = useAuth()
  return (
    <AuthLayout>
      <div className="stack a">
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 500 }}>Nasıl devam etmek istersiniz?</h2>
        <p className="m">
          {profile ? `${profile.full_name}, ` : ''}hesabınızda öğretmen ve veli rolleri var. İstediğiniz zaman profil menüsündeki <b>Rol değiştir</b> ile geçebilirsiniz.
        </p>
        {switchable.map((r) => (
          <button key={r} className={`btn ${r === 'ogretmen' ? 'pri' : ''}`} style={{ minHeight: 54, fontSize: 16 }} onClick={() => switchRole(r)}>
            <Icon name={r === 'ogretmen' ? 'book' : 'users'} size={18} /> {SWITCH_TR[r]} olarak devam et
          </button>
        ))}
        <button type="button" className="btn ghost sm" onClick={() => signOut()}>
          Çıkış yap
        </button>
      </div>
    </AuthLayout>
  )
}

/** Çok çocuklu veli: "Hangi öğrenci için devam etmek istersiniz?" Seçim yalnız ekranı belirler; yetki veritabanında (parent_links). */
export function StudentPickPage() {
  const { children, switchStudent, switchable, switchRole, signOut } = useAuth()
  return (
    <AuthLayout>
      <div className="stack a">
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 500 }}>Hangi öğrenci için devam etmek istersiniz?</h2>
        <p className="m">İstediğiniz zaman profil menüsündeki <b>Öğrenci değiştir</b> ile geçebilirsiniz.</p>
        <div className="stack" role="group" aria-label="Öğrenciler" style={{ gap: 8 }}>
          {children.map((c) => (
            <button key={c.id} className="scard" style={{ minHeight: 60 }} onClick={() => switchStudent(c.id)}>
              <b style={{ fontSize: 16 }}>{c.full_name}</b>
              <span className="m">{c.class_name}</span>
            </button>
          ))}
        </div>
        {switchable.includes('ogretmen') && (
          <button type="button" className="btn sm" onClick={() => switchRole('ogretmen')}>
            Öğretmen olarak devam et
          </button>
        )}
        <button type="button" className="btn ghost sm" onClick={() => signOut()}>
          Çıkış yap
        </button>
      </div>
    </AuthLayout>
  )
}
