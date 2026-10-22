// Yönetim → kişi düzenleme: giriş bilgileri (0059). Yönetici öğrenci / öğretmen / veli hesabının e-postasını değiştirir ve
// yeni şifre verir. Mevcut şifre hiçbir yerde görünmez (yalnız özeti tutulur); yeni şifre yalnız verildiği anda bir kez gösterilir.
// Yetki Edge Function "admin-davet"te (yönetici + aal2, aynı okul, yönetici hesapları hariç).
import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Profile } from '@/lib/types'
import { useToast } from '@/components/Toast'

async function call(body: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> {
  const { data, error } = await supabase.functions.invoke('admin-davet', { body })
  if (error) {
    const ctx = (error as { context?: Response }).context
    const j = ctx ? await ctx.json().catch(() => null) : null
    return { ok: false, error: (j as { error?: string } | null)?.error ?? 'İşlem yapılamadı.' }
  }
  return { ok: !!(data as { ok?: boolean })?.ok, error: (data as { error?: string })?.error }
}

// Karışan karakterler (0/O, 1/l/I) yok; en az bir rakam
const HARF = 'abcdefghjkmnpqrstuvwxyz'
const RAKAM = '23456789'
export function sifreOner(n = 10): string {
  const r = crypto.getRandomValues(new Uint32Array(n))
  const s = Array.from(r, (x, i) => (i % 4 === 3 ? RAKAM[x % RAKAM.length] : HARF[x % HARF.length]))
  return s.join('')
}

export function GirisBilgileri({ p }: { p: Pick<Profile, 'id' | 'email' | 'full_name'> }) {
  const qc = useQueryClient()
  const toast = useToast()
  const [email, setEmail] = useState(p.email ?? '')
  const [saved, setSaved] = useState(p.email ?? '')
  const [pw, setPw] = useState<string | null>(null)
  const [given, setGiven] = useState<string | null>(null)
  const [busy, setBusy] = useState<'email' | 'pw' | null>(null)
  const [err, setErr] = useState<string | null>(null)

  async function saveEmail() {
    setErr(null)
    setBusy('email')
    const r = await call({ action: 'set_email', user_id: p.id, email })
    setBusy(null)
    if (!r.ok) return setErr(r.error ?? 'E-posta değiştirilemedi.')
    const e = email.trim().toLowerCase()
    setSaved(e)
    setEmail(e)
    toast(`${p.full_name}: e-posta değişti`)
    for (const k of ['yonetim', 'people']) qc.invalidateQueries({ queryKey: [k] })
  }
  async function savePw() {
    if (!pw) return
    setErr(null)
    setBusy('pw')
    const r = await call({ action: 'set_password', user_id: p.id, password: pw })
    setBusy(null)
    if (!r.ok) return setErr(r.error ?? 'Şifre değiştirilemedi.')
    setGiven(pw)
    setPw(null)
    toast(`${p.full_name}: yeni şifre verildi`)
  }

  return (
    <section className="stack" style={{ gap: 8, borderTop: '1px solid var(--line)', paddingTop: 12 }} aria-label="Giriş bilgileri">
      <span className="label">Giriş bilgileri</span>
      <div className="btns" style={{ alignItems: 'flex-end' }}>
        <label className="field" htmlFor="gEmail" style={{ flex: 1, minWidth: 220 }}>
          E-posta
          <input id="gEmail" type="email" inputMode="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <button className="btn" onClick={saveEmail} disabled={busy !== null || !email.trim() || email.trim().toLowerCase() === saved}>
          {busy === 'email' && <span className="spinner" aria-hidden="true" />} E-postayı kaydet
        </button>
      </div>

      {pw === null ? (
        <div className="btns">
          <button className="btn" onClick={() => (setGiven(null), setPw(sifreOner()))} disabled={busy !== null}>
            Yeni şifre ver
          </button>
        </div>
      ) : (
        <div className="btns" style={{ alignItems: 'flex-end' }}>
          <label className="field" htmlFor="gPw" style={{ flex: 1, minWidth: 180 }}>
            Yeni şifre
            <input id="gPw" className="mono" autoComplete="new-password" spellCheck={false} value={pw} onChange={(e) => setPw(e.target.value)} />
          </label>
          <button className="btn sm" onClick={() => setPw(sifreOner())} disabled={busy !== null}>
            Başka öner
          </button>
          <button className="btn" onClick={() => setPw(null)} disabled={busy !== null}>
            Vazgeç
          </button>
          <button className="btn pri" onClick={savePw} disabled={busy !== null || pw.length < 8}>
            {busy === 'pw' && <span className="spinner" aria-hidden="true" />} Şifreyi kaydet
          </button>
        </div>
      )}

      {given && (
        <div className="card" role="status" style={{ padding: 12, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ flex: 1, minWidth: 200, fontSize: 14 }}>
            Yeni şifre: <b className="mono" data-testid="yeni-sifre">{given}</b>
            <br />
            <span className="m" style={{ fontSize: 13 }}>
              Kişiye ilet. Bu pencere kapanınca bir daha gösterilmez; kişi giriş yaptıktan sonra Hesap ayarları’ndan değiştirebilir.
            </span>
          </span>
          <button className="btn sm" onClick={() => navigator.clipboard?.writeText(given).then(() => toast('Şifre kopyalandı'))}>
            Kopyala
          </button>
        </div>
      )}

      <p className="m" style={{ fontSize: 13 }}>
        Mevcut şifre kimseye görünmez. Yeni şifre verince eski şifre geçersiz olur ve kişinin açık oturumları kapanır.
      </p>
      {err && (
        <div className="err" role="alert">
          {err}
        </div>
      )}
    </section>
  )
}
