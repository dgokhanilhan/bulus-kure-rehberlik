// Açılış penceresi (0096): giriş yapınca okulun duyurusu / yeni özellik tanıtımı. En çok 3 sayfa, önce önemli.
// Önemli: "Okudum" denmeden kapanmaz (Esc de kapatmaz) ve sonraki girişte yeniden açılır. Yenilik: kapatınca bir daha açılmaz.
// Metin düz metindir (HTML işlenmez). Görsel: /duyuru/… (uygulamayla gelen) ya da yöneticinin yüklediği (acilis kovası).
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/auth/AuthProvider'
import { Icon } from './Icon'

export interface Acilis {
  id: string
  tur: 'onemli' | 'yenilik'
  baslik: string
  metin: string
  gorsel: string | null
  gorsel_alt: string | null
  dugme_metin: string | null
  dugme_rota: string | null
  yayin_at?: string | null
  kart_etiket?: string | null
  kart_baslik?: string | null
  kart_aciklama?: string | null
  kart_cizim?: 'hedef' | 'oda' | 'duyuru' | null
}
export const KART_CIZIM_TR = { hedef: 'Hedef grupları', oda: 'Öğretmenler Odası kartları', duyuru: 'Duyuru simgesi' } as const

/** Şablon kart (0098): görsel dosyası değil, sayfada çizilir; renkler kullanıcının temasından (--primary, --surface, --ink) gelir.
 *  Çizim süslemedir (aria-hidden); anlamı başlık ve açıklama taşır. */
export function AcilisKart({ a }: { a: Pick<Acilis, 'tur' | 'kart_etiket' | 'kart_baslik' | 'kart_aciklama' | 'kart_cizim'> }) {
  const etiket = a.kart_etiket?.trim() || (a.tur === 'onemli' ? 'ÖNEMLİ' : 'YENİ ÖZELLİK')
  return (
    <div className={`acl-kart${a.tur === 'onemli' ? ' onemli' : ''}${a.kart_cizim ? '' : ' tek'}`} data-testid="acilis-kart">
      <div className="acl-kart-sol">
        <span className="acl-kart-etiket">{etiket}</span>
        <b className="acl-kart-baslik">{a.kart_baslik}</b>
        {a.kart_aciklama && <span className="acl-kart-aciklama">{a.kart_aciklama}</span>}
      </div>
      {a.kart_cizim && (
        <div className="acl-kart-cizim" aria-hidden="true">
          {a.kart_cizim === 'hedef' ? (
            <>
              <span>
                Bana yakın <i className="up">↑ 4,9</i>
              </span>
              <span>
                Çalışmalıyım <i className="dn">↓ 15,9</i>
              </span>
              <span>
                Rahat ulaşırım <i className="up">↑ 23,4</i>
              </span>
              <span className="vurgu">+ Okul ekle</span>
            </>
          ) : a.kart_cizim === 'oda' ? (
            <>
              <span>Öğrenci Takip</span>
              <span>Sohbet</span>
              <span>Pano</span>
              <span className="vurgu">Bugün okulda</span>
            </>
          ) : (
            <span className="acl-kart-simge">
              <Icon name="mega" size={64} stroke={1.6} />
            </span>
          )}
        </div>
      )}
    </div>
  )
}
// 'rehber' yalnız hedef kitle seçeneğidir (Rehberlik branşındaki öğretmenler); oturumda rehber de 'ogretmen' olarak sorar, sunucu ayırır.
export type AcilisRol = 'veli' | 'ogrenci' | 'ogretmen' | 'rehber' | 'yonetim'
export const ACILIS_ROL_TR: Record<AcilisRol, string> = {
  veli: 'Veli',
  ogrenci: 'Öğrenci',
  ogretmen: 'Tüm öğretmenler',
  rehber: 'Yalnız rehber öğretmenler',
  yonetim: 'Yönetim',
}

/** Arayüzdeki etkin rol → pencere hedef kitlesi (sunucu ayrıca doğrular). */
export function acilisRol(role: string | null | undefined): AcilisRol | null {
  if (role === 'admin') return 'yonetim'
  if (role === 'rehber' || role === 'brans' || role === 'ogretmen') return 'ogretmen'
  if (role === 'veli' || role === 'ogrenci') return role
  return null
}

/** Görsel adresi: uygulamayla gelen dosya doğrudan, yüklenen dosya süreli bağlantıyla. */
export function useAcilisGorsel(gorsel: string | null | undefined) {
  return useQuery({
    queryKey: ['acilis-gorsel', gorsel],
    enabled: !!gorsel,
    staleTime: 50 * 60_000,
    queryFn: async () => {
      if (gorsel!.startsWith('/')) return gorsel!
      const { data, error } = await supabase.storage.from('acilis').createSignedUrl(gorsel!.replace(/^acilis\//, ''), 3600)
      if (error) throw new Error(error.message)
      return data.signedUrl
    },
  })
}

/** Pencerenin içeriği: önizleme, Yenilikler listesi ve açılış penceresi aynı görünümü kullanır. */
export function AcilisIcerik({ a }: { a: Acilis }) {
  const g = useAcilisGorsel(a.gorsel)
  return (
    <div className="acl-icerik">
      <span className={`chip ${a.tur === 'onemli' ? 'w' : 'n'}`}>{a.tur === 'onemli' ? 'Önemli duyuru' : 'Yeni özellik'}</span>
      <h2 className="acl-baslik">{a.baslik}</h2>
      {a.kart_baslik && <AcilisKart a={a} />}
      {a.gorsel &&
        (g.data ? <img className="acl-gorsel" src={g.data} alt={a.gorsel_alt ?? ''} loading="lazy" /> : <div className="acl-gorsel bos" aria-hidden="true" />)}
      <p className="acl-metin">{a.metin}</p>
    </div>
  )
}

export function AcilisPenceresi() {
  const { profile, role } = useAuth()
  const rol = acilisRol(role)
  const qc = useQueryClient()
  const nav = useNavigate()
  const [kapali, setKapali] = useState<string[]>([])
  const q = useQuery({
    queryKey: ['acilis-bekleyen', profile?.id, rol],
    enabled: !!profile && profile.status === 'approved' && !!rol,
    staleTime: Infinity,
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('acilis_bekleyenler', { p_rol: rol })
      if (error) throw new Error(error.message)
      return (data ?? []) as Acilis[]
    },
  })
  const l = (q.data ?? []).filter((a) => !kapali.includes(a.id))
  const a = l[0]
  const toplam = q.data?.length ?? 0
  const sira = toplam - l.length + 1
  const ref = useRef<HTMLDivElement>(null)

  async function isaretle(x: Acilis, okudum: boolean) {
    setKapali((k) => [...k, x.id])
    await supabase.rpc('acilis_isaretle', { p_id: x.id, p_okudum: okudum })
    qc.invalidateQueries({ queryKey: ['acilis-yenilikler'] })
  }
  const kapat = (x: Acilis) => isaretle(x, x.tur === 'onemli')

  useEffect(() => {
    if (!a) return
    const prev = document.activeElement as HTMLElement | null
    ref.current?.querySelector<HTMLElement>('.acl-alt button')?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && a.tur !== 'onemli') kapat(a)
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
      prev?.focus?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [a?.id])

  if (!a) return null
  return createPortal(
    <div className="mwrap acl-wrap">
      <div
        className="modal acl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="acl-b"
        style={{ ['--mw' as string]: '520px' }}
        ref={ref}
        data-testid="acilis-penceresi"
      >
        <div className="modal-b" id="acl-b">
          <AcilisIcerik a={a} />
        </div>
        <div className="modal-f acl-alt">
          {toplam > 1 && (
            <span className="m" style={{ fontSize: 12, marginRight: 'auto' }}>
              {sira} / {toplam}
            </span>
          )}
          {a.tur === 'onemli' ? (
            <button type="button" className="btn pri" onClick={() => kapat(a)}>
              Okudum
            </button>
          ) : (
            <button type="button" className="btn" onClick={() => kapat(a)}>
              {l.length > 1 ? 'Sonraki' : 'Kapat'}
            </button>
          )}
          {a.dugme_metin && a.dugme_rota && (
            <button
              type="button"
              className="btn pri"
              onClick={() => {
                isaretle(a, true)
                nav(a.dugme_rota!)
              }}
            >
              {a.dugme_metin}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}

/** Duyurular → Yenilikler: kişinin hedefindeki geçmiş pencereler (yeniden okunabilir). */
export function Yenilikler() {
  const { profile, role } = useAuth()
  const rol = acilisRol(role)
  const nav = useNavigate()
  const q = useQuery({
    queryKey: ['acilis-yenilikler', profile?.id, rol],
    enabled: !!profile && !!rol,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('acilis_yenilikler', { p_rol: rol })
      if (error) throw new Error(error.message)
      return (data ?? []) as Acilis[]
    },
  })
  if (!q.data?.length) return null
  return (
    <section className="card a" style={{ ['--d' as string]: 1, padding: 16, display: 'grid', gap: 10 }} aria-labelledby="acl-yen-b" data-testid="yenilikler">
      <h2 id="acl-yen-b" style={{ fontSize: 16, margin: 0 }}>
        Yenilikler
      </h2>
      <ul className="acl-liste">
        {q.data.map((a) => (
          <YenilikSatir key={a.id} a={a} onGit={(r) => nav(r)} />
        ))}
      </ul>
    </section>
  )
}

/** Yenilikler satırı: içerik yalnız açıkken çizilir. iPhone Safari kapalı <details> içindeki kartın
 *  genişliğini 0 sanıp (cqw) yazıları bozuyordu; açılınca yeniden çizmek bunu önler. */
function YenilikSatir({ a, onGit }: { a: Acilis; onGit: (rota: string) => void }) {
  const [acik, setAcik] = useState(false)
  return (
    <li>
      <details onToggle={(e) => setAcik(e.currentTarget.open)}>
        <summary>
          <b>{a.baslik}</b>
          <span className="m" style={{ fontSize: 12 }}>
            {a.tur === 'onemli' ? 'Önemli duyuru' : 'Yeni özellik'}
            {a.yayin_at ? ` · ${new Date(a.yayin_at).toLocaleDateString('tr-TR', { timeZone: 'Europe/Istanbul' })}` : ''}
          </span>
        </summary>
        {acik && (
          <>
            <AcilisIcerik a={a} />
            {a.dugme_metin && a.dugme_rota && (
              <button type="button" className="btn sm" onClick={() => onGit(a.dugme_rota!)}>
                {a.dugme_metin}
              </button>
            )}
          </>
        )}
      </details>
    </li>
  )
}
