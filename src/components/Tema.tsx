import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/auth/AuthProvider'
import { Icon } from '@/components/Icon'
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

/** Profil menüsündeki "Temalar" bölümü: tıklanınca açılır; seçim anında uygulanır, profile kaydedilir (her cihazda aynı tema). */
export function TemaSecici() {
  const { profile } = useAuth()
  const qc = useQueryClient()
  const [secili, setSecili] = useState(() => temaGecerli(profile?.tema))
  const [acik, setAcik] = useState(false)
  const [hata, setHata] = useState(false)
  async function sec(id: string) {
    setSecili(id)
    setHata(false)
    window.dispatchEvent(new CustomEvent(OLAY, { detail: id }))
    const { error } = await supabase.rpc('tema_kaydet', { p_tema: id === VARSAYILAN_TEMA ? null : id })
    if (error) setHata(true)
    else void qc.invalidateQueries({ queryKey: ['me'] })
  }
  const tema = TEMALAR.find((t) => t.id === secili)
  return (
    <>
      <button type="button" className="pitem tema-ac" aria-expanded={acik} aria-controls="tema-panel" onClick={() => setAcik(!acik)}>
        <span className="tema-nokta" style={{ background: `linear-gradient(135deg, ${tema?.zemin} 50%, ${tema?.vurgu} 50%)` }} aria-hidden="true" />
        <span style={{ flex: 1 }}>
          Temalar <small className="m">· {tema?.ad}</small>
        </span>
        <span className="chev" style={{ transform: acik ? 'rotate(180deg)' : undefined }} aria-hidden="true">
          <Icon name="down" size={16} stroke={2} />
        </span>
      </button>
      {acik && (
        <div className="tema-sec" id="tema-panel">
          {(['sade', 'konsept'] as const).map((g) => (
            <div key={g} className="tema-grid" role="radiogroup" aria-label={g === 'sade' ? 'Sade temalar' : 'Konsept temalar'}>
              <span className="tema-grup m">{g === 'sade' ? 'Sade' : 'Konsept'}</span>
              {TEMALAR.filter((t) => t.grup === g).map((t) => (
                <button key={t.id} type="button" role="radio" aria-checked={secili === t.id} aria-label={t.ad} className="tema-k" onClick={() => void sec(t.id)}>
                  <span className="tema-ornek" style={{ background: t.zemin }} aria-hidden="true">
                    <span style={{ background: t.vurgu }} />
                  </span>
                  <span className="tema-ad" aria-hidden="true">{t.ad}</span>
                </button>
              ))}
            </div>
          ))}
          {hata && (
            <span role="alert" className="m" style={{ fontSize: 12 }}>
              Tema bu cihazda uygulandı ama hesabına kaydedilemedi. Bağlantını kontrol edip yeniden seç.
            </span>
          )}
        </div>
      )}
    </>
  )
}
