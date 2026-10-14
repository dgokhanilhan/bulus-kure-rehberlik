import {createClient} from '@supabase/supabase-js'
import {changeOwnPassword} from '@/lib/accountSecurity'
import {readPreference,writePreference} from '@/lib/preferences'
import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/auth/AuthProvider'
import { supabase } from '@/lib/supabase'
import MfaPage from './MfaPage'
import { Modal } from '@/components/Modal'
export default function HesapAyarlari() {
  const { session, roles, aal } = useAuth(),
    qc = useQueryClient()
  const uid = session!.user.id
  const [theme, setTheme] = useState(() => readPreference(uid,'theme') || 'school')
  const [text, setText] = useState(() => readPreference(uid,'text') || 'school')
  const [factors, setFactors] = useState<{ id: string; status: string }[] | null>(null)
  const [setup, setSetup] = useState(false),
    [disable, setDisable] = useState(false),
    [err, setErr] = useState(''),
    [busy, setBusy] = useState(false)
  const [currentPassword, setCurrentPassword] = useState(''),
    [password, setPassword] = useState(''),
    [confirmPassword, setConfirmPassword] = useState(''),
    [email, setEmail] = useState(''),
    [nonce, setNonce] = useState(''),
    [accountMessage, setAccountMessage] = useState('')
  const admin = roles.includes('admin')
  async function changePassword() {
    setAccountMessage('')
    if (password.length < 10 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password) || !/[^a-zA-Z0-9]/.test(password))
      return setAccountMessage('Şifre en az 10 karakter; büyük/küçük harf, rakam ve özel karakter içermeli.')
    if (password !== confirmPassword) return setAccountMessage('Yeni şifreler aynı değil.')
    if (!currentPassword) return setAccountMessage('Mevcut şifreni yaz.')
    setBusy(true)
    const verifier=createClient(import.meta.env.VITE_SUPABASE_URL,import.meta.env.VITE_SUPABASE_ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}})
    const { error } = await changeOwnPassword(supabase,verifier,currentPassword,password,nonce.trim()||undefined)
    setBusy(false)
    if (error)
      return setAccountMessage(
        error.code === 'reauthentication_needed'
          ? 'E-posta doğrulama kodu gönderip kodu girerek tekrar dene.'
          : 'Şifre değiştirilemedi. Mevcut şifreni ve güvenlik kodunu kontrol et.',
      )
    setCurrentPassword('')
    setPassword('')
    setConfirmPassword('')
    setNonce('')
    setAccountMessage('Şifren güncellendi.')
  }
  async function sendCode() {
    setBusy(true)
    const { error } = await supabase.auth.reauthenticate()
    setBusy(false)
    setAccountMessage(error ? 'Kod gönderilemedi. Biraz sonra tekrar dene.' : 'Doğrulama kodu e-posta adresine gönderildi.')
  }
  async function changeEmail() {
    setAccountMessage('')
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setAccountMessage('Geçerli bir e-posta adresi yaz.')
    if (email.trim().toLowerCase() === session!.user.email?.toLowerCase()) return setAccountMessage('Yeni adres mevcut adresinle aynı.')
    setBusy(true)
    const { error } = await supabase.auth.updateUser({ email: email.trim() }, { emailRedirectTo: window.location.origin + '/hesap-ayarlari' })
    setBusy(false)
    setAccountMessage(
      error
        ? 'E-posta değişikliği başlatılamadı. Adresi kontrol edip tekrar dene.'
        : 'E-posta değişikliği için doğrulama bağlantısı gönderildi. Gelen kutularını kontrol edip bağlantıları onayla.',
    )
    if (!error) setEmail('')
  }

  async function load() {
    const { data, error } = await supabase.auth.mfa.listFactors()
    if (error) setErr('Doğrulama bilgisi alınamadı.')
    else setFactors(data.totp)
  }
  useEffect(() => {
    void load()
  }, [uid, aal])
  useEffect(() => {
    if (aal === 'aal2') setSetup(false)
  }, [aal])
  function preference(key:'theme'|'text',value:string){writePreference(uid,key,value)}
  async function remove() {
    setBusy(true)
    setErr('')
    for (const f of factors ?? []) {
      if (f.status !== 'verified') continue
      const { error } = await supabase.auth.mfa.unenroll({ factorId: f.id })
      if (error) {
        setErr('Doğrulama kapatılamadı. Güncel Authenticator koduyla tekrar giriş yap.')
        setBusy(false)
        return
      }
    }
    setBusy(false)
    setDisable(false)
    await qc.invalidateQueries({ queryKey: ['me'] })
    await load()
  }
  const enabled = factors?.some((f) => f.status === 'verified')
  return (
    <div className="stack">
      <h1>Hesap ayarları</h1>
      <section className="card stack" style={{ padding: 20 }}>
        <h2>Görünüm</h2>
        <p className="m">Bu tercihler yalnız bu tarayıcıdaki kendi hesabın için geçerlidir.</p>
        <label className="field">
          Tema
          <select aria-label="Tema"
            value={theme}
            onChange={(e) => {
              setTheme(e.target.value)
              preference('theme', e.target.value)
            }}
          >
            <option value="school">Okulun varsayılanı</option>
            <option value="auto">Cihazın ayarı</option>
            <option value="light">Gündüz modu</option>
            <option value="dark">Gece modu</option>
          </select>
        </label>
        <label className="field">
          Yazı boyutu
          <select aria-label="Yazı boyutu"
            value={text}
            onChange={(e) => {
              setText(e.target.value)
              preference('text', e.target.value)
            }}
          >
            <option value="school">Okulun varsayılanı</option>
            <option value="normal">Normal</option>
            <option value="buyuk">Büyük</option>
          </select>
        </label>
      </section>
      <section className="card stack" style={{ padding: 20 }}>
        <h2>İki faktörlü doğrulama</h2>
        <p>
          Girişte şifrene ek olarak telefonundaki Authenticator uygulamasından kod istenir. Yönetici hesaplarında zorunludur; diğer hesaplarda isteğe bağlıdır.
        </p>
        <p>Telefonunu değiştirmeden önce hesabına erişebildiğinden emin ol. Telefonuna erişemiyorsan okul yönetimiyle iletişime geç.</p>
        {factors === null ? (
          <p>Yükleniyor…</p>
        ) : (
          <>
            <b>{enabled ? 'Aktif' : 'Kapalı'}</b>
            {!enabled ? (
              <button className="btn pri" onClick={() => setSetup(true)}>
                Authenticator ile etkinleştir
              </button>
            ) : admin ? (
              <p className="m">Yönetici rolü nedeniyle kapatılamaz.</p>
            ) : (
              <button className="btn" onClick={() => setDisable(true)}>
                İki faktörlü doğrulamayı kapat
              </button>
            )}
          </>
        )}
        {err && (
          <p role="alert" className="err">
            {err}
          </p>
        )}
      </section>
      <section className="card stack" style={{ padding: 20 }}>
        <h2>Şifre değiştir</h2>
        <label className="field">
          Mevcut şifre
          <input type="password" autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
        </label>
        <label className="field">
          Yeni şifre
          <input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        <label className="field">
          Yeni şifre tekrar
          <input type="password" autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
        </label>
        <p className="m">En az 10 karakter; büyük/küçük harf, rakam ve özel karakter kullan.</p>
        <label className="field">
          E-posta güvenlik kodu (istenirse)
          <input autoComplete="one-time-code" value={nonce} onChange={(e) => setNonce(e.target.value)} />
        </label>
        <button className="btn" disabled={busy} onClick={sendCode}>
          E-posta doğrulama kodu gönder
        </button>
        <button className="btn pri" disabled={busy} onClick={changePassword}>
          Şifremi değiştir
        </button>
      </section>
      <section className="card stack" style={{ padding: 20 }}>
        <h2>E-posta değiştir</h2>
        <p>Mevcut adres: {session?.user.email}</p>
        <label className="field">
          Yeni e-posta
          <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <button className="btn pri" disabled={busy} onClick={changeEmail}>
          E-posta değişikliği için doğrulama gönder
        </button>
      </section>
      {accountMessage && <p role="status">{accountMessage}</p>}
      {setup && (
        <Modal title="Authenticator kurulumu" onClose={() => setSetup(false)}>
          <MfaPage embedded onCancel={() => setSetup(false)} />
        </Modal>
      )}
      {disable && (
        <Modal
          title="İki faktörlü doğrulamayı kapat"
          onClose={() => setDisable(false)}
          footer={
            <>
              <button className="btn" onClick={() => setDisable(false)}>
                Vazgeç
              </button>
              <button className="btn pri" disabled={busy} onClick={remove}>
                Kapat
              </button>
            </>
          }
        >
          <p>Sonraki girişlerinde yalnız e-posta ve şifre kullanacaksın.</p>
        </Modal>
      )}
    </div>
  )
}
