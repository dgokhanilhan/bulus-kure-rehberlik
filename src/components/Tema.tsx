import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/auth/AuthProvider'
import { supabase } from '@/lib/supabase'
import { TEMALAR, VARSAYILAN_TEMA, cihazTemasi, cihazTemasiYaz, temaGecerli, temaUygula } from '@/lib/tema'

const OLAY = 'bk-tema'

/** Seçili temayı sayfaya uygular: oturum varsa profildeki seçim, yoksa bu cihazda son kullanılan tema. */
export function TemaUygulayici() {
  const { profile } = useAuth()
  const [yerel, setYerel] = useState<string | null>(null)
  useEffect(() => {
    const dinle = (e: Event) => setYerel((e as CustomEvent<string>).detail)
    window.addEventListener(OLAY, dinle)
    return () => window.removeEventListener(OLAY, dinle)
  }, [])
  // Başka kişi oturum açınca önceki kişinin anlık seçimi taşınmaz
  useEffect(() => setYerel(null), [profile?.id])
  const tema = yerel ?? (profile ? temaGecerli(profile.tema) : cihazTemasi())
  useEffect(() => {
    temaUygula(tema)
    if (profile) cihazTemasiYaz(tema)
  }, [tema, profile])
  return null
}

/** Profil menüsündeki tema seçici: seçim anında uygulanır, profile kaydedilir (her cihazda aynı tema). */
export function TemaSecici() {
  const { profile } = useAuth()
  const qc = useQueryClient()
  const [secili, setSecili] = useState(() => temaGecerli(profile?.tema))
  const [hata, setHata] = useState(false)
  async function sec(id: string) {
    setSecili(id)
    setHata(false)
    window.dispatchEvent(new CustomEvent(OLAY, { detail: id }))
    const { error } = await supabase.rpc('tema_kaydet', { p_tema: id === VARSAYILAN_TEMA ? null : id })
    if (error) setHata(true)
    else void qc.invalidateQueries({ queryKey: ['me'] })
  }
  const ad = TEMALAR.find((t) => t.id === secili)?.ad
  return (
    <div className="tema-sec">
      <span className="label" id="tema-baslik">
        Tema <span className="m" style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 500 }}>· {ad}</span>
      </span>
      {(['sade', 'konsept'] as const).map((g) => {
        const list = TEMALAR.filter((t) => t.grup === g)
        if (!list.length) return null
        return (
          <div key={g} className="tema-grid" role="radiogroup" aria-labelledby="tema-baslik">
            {list.map((t) => (
              <button
                key={t.id}
                type="button"
                role="radio"
                aria-checked={secili === t.id}
                aria-label={t.ad}
                title={t.ad}
                className="tema-k"
                style={{ background: t.zemin }}
                onClick={() => void sec(t.id)}
              >
                <span style={{ background: t.vurgu }} />
              </button>
            ))}
          </div>
        )
      })}
      {hata && (
        <span role="alert" className="m" style={{ fontSize: 12 }}>
          Tema bu cihazda uygulandı ama hesabına kaydedilemedi. Bağlantını kontrol edip yeniden seç.
        </span>
      )}
    </div>
  )
}
