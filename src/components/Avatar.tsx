// Kişi simgesi: seçilmiş avatar varsa o, yoksa baş harfler. Avatar seçici profil menüsünde (temaların yanında).
import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/auth/AuthProvider'
import { supabase } from '@/lib/supabase'
import { initials } from '@/lib/format'
import { AVATARLAR, avatarBul } from '@/lib/avatar'
import { Icon } from './Icon'

export function KisiSimge({ ad, avatar, boyut }: { ad: string; avatar?: string | null; boyut?: number }) {
  const a = avatarBul(avatar)
  const stil = boyut ? { width: boyut, height: boyut, fontSize: a ? Math.round(boyut * 0.58) : Math.round(boyut * 0.38) } : undefined
  return a ? (
    <span className="av av-simge" style={{ ...stil, background: a.renk }} aria-hidden="true">
      {a.simge}
    </span>
  ) : (
    <span className="av" style={stil} aria-hidden="true">
      {initials(ad)}
    </span>
  )
}

export function AvatarSecici() {
  const { profile } = useAuth()
  const qc = useQueryClient()
  const [acik, setAcik] = useState(false)
  const [secili, setSecili] = useState<string | null>(profile?.avatar ?? null)
  const [hata, setHata] = useState(false)
  if (!profile) return null
  async function sec(id: string | null) {
    const once = secili
    setSecili(id)
    setHata(false)
    const { error } = await supabase.rpc('avatar_kaydet', { p_avatar: id })
    if (error) {
      setSecili(once)
      setHata(true)
    } else void qc.invalidateQueries({ queryKey: ['me'] })
  }
  const a = avatarBul(secili)
  return (
    <>
      <button type="button" className="pitem tema-ac" aria-expanded={acik} aria-controls="avatar-panel" onClick={() => setAcik(!acik)}>
        <KisiSimge ad={profile.full_name} avatar={secili} boyut={22} />
        <span style={{ flex: 1 }}>
          Avatar <small className="m">· {a?.ad ?? 'Baş harfler'}</small>
        </span>
        <span className="chev" style={{ transform: acik ? 'rotate(180deg)' : undefined }} aria-hidden="true">
          <Icon name="down" size={16} stroke={2} />
        </span>
      </button>
      {acik && (
        <div className="tema-sec" id="avatar-panel">
          <div className="avatar-grid" role="radiogroup" aria-label="Avatarlar">
            <button type="button" role="radio" aria-checked={!a} aria-label="Baş harfler" className="avatar-k" onClick={() => void sec(null)}>
              <KisiSimge ad={profile.full_name} boyut={40} />
            </button>
            {AVATARLAR.map((x) => (
              <button
                key={x.id}
                type="button"
                role="radio"
                aria-checked={secili === x.id}
                aria-label={x.ad}
                className="avatar-k"
                onClick={() => void sec(x.id)}
              >
                <KisiSimge ad={profile.full_name} avatar={x.id} boyut={40} />
              </button>
            ))}
          </div>
          {hata && (
            <span role="alert" className="m" style={{ fontSize: 12 }}>
              Avatar kaydedilemedi. Bağlantını kontrol edip yeniden seç.
            </span>
          )}
        </div>
      )}
    </>
  )
}
