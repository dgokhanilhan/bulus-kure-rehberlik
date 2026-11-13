// Öğretmenler Odası → Sohbet: öğretmenlerin kendi aralarındaki canlı sohbet (0068). Saklama süresi ve kanallar Yönetim'den (0071).
import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '@/auth/AuthProvider'
import { usePeople } from '@/lib/data'
import { isTeacherP } from '@/lib/roles'
import { initials, localDate, localHM, todayISO, addDays, trD } from '@/lib/format'
import { anilanlar, anmaAramasi, anmaParcala, kanalAciklama, kanalAdi as kanalAdiTemel, MESAJ_EN_COK, TEPKILER, type KanalAyar } from '@/lib/oda'
import { useOdaMesajlar, useOdaOkundu, useOdaOkunmamis, useOdaSil, useOdaTepki, useOdaYaz, type OdaMesaj } from '@/lib/odaData'
import { Confirm } from '@/components/Confirm'
import { Icon } from '@/components/Icon'
import { useToast } from '@/components/Toast'

export default function OdaSohbet({ kanallar, ayar, saklama }: { kanallar: string[]; ayar?: ReadonlyMap<string, KanalAyar>; saklama: number }) {
  const kanalAdi = (k: string) => kanalAdiTemel(k, ayar?.get(k))
  const { profile, role } = useAuth()
  const [sp, setSp] = useSearchParams()
  const kanal = kanallar.includes(sp.get('kanal') ?? '') ? sp.get('kanal')! : (kanallar[0] ?? null)
  const setKanal = (k: string) => setSp({ sekme: 'sohbet', kanal: k }, { replace: true })
  const okunmamis = useOdaOkunmamis()
  const mesajlar = useOdaMesajlar(kanal)
  const okundu = useOdaOkundu()
  const people = usePeople()
  const ogretmenler = useMemo(
    () => (people.data ?? []).filter((p) => isTeacherP(p) && p.id !== profile?.id).map((p) => ({ id: p.id, ad: p.full_name, brans: p.branch })),
    [people.data, profile?.id],
  )
  const adlar = useMemo(() => [...ogretmenler.map((o) => o.ad), profile?.full_name ?? ''], [ogretmenler, profile?.full_name])

  // Kanal açıkken gelen mesajlar okunmuş sayılır
  const son = mesajlar.data?.at(-1)?.id
  const okunduRef = useRef(okundu.mutate)
  okunduRef.current = okundu.mutate
  useEffect(() => {
    if (!kanal || !mesajlar.isSuccess) return
    if (document.visibilityState === 'visible') okunduRef.current(kanal)
  }, [kanal, son, mesajlar.isSuccess])

  // Yeni mesajda en alta kaydır (kullanıcı yukarıda okuyorsa kaydırma)
  const akis = useRef<HTMLDivElement>(null)
  const altta = useRef(true)
  useLayoutEffect(() => {
    const el = akis.current
    if (el && altta.current) el.scrollTop = el.scrollHeight
  }, [son, kanal])

  const staff = role === 'admin' || role === 'rehber'
  const [silinecek, setSilinecek] = useState<OdaMesaj | null>(null)
  const sil = useOdaSil()
  const gunler = gunluGrupla(mesajlar.data ?? [])

  if (!kanallar.length) return <div className="empty">Sohbet kanalın yok.</div>

  return (
    <div className="oda-sohbet card a">
      <aside className="oda-kanallar" aria-label="Kanallar">
        <h2 className="sec oda-kanal-bas">Kanallar</h2>
        <div className="oda-kanal-liste" role="tablist" aria-label="Sohbet kanalları">
          {kanallar.map((k) => {
            const n = k === kanal ? 0 : (okunmamis.data?.[k] ?? 0)
            return (
              <button key={k} type="button" role="tab" aria-selected={k === kanal} className="oda-kanal" onClick={() => setKanal(k)}>
                <span className="oda-diyez" aria-hidden="true">
                  #
                </span>
                <span className="oda-kanal-ad">{kanalAdi(k)}</span>
                {n > 0 && (
                  <span className="badge" aria-label={`${n} okunmamış`}>
                    {n}
                  </span>
                )}
              </button>
            )
          })}
        </div>
        <p className="m oda-saklama">
          <Icon name="lock" size={14} /> Mesajlar {saklama} gün saklanır, sonra kendiliğinden silinir. Veli ve öğrenciler göremez.
        </p>
      </aside>
      <section className="oda-pano" aria-label={kanal ? `${kanalAdi(kanal)} kanalı` : 'Sohbet'}>
        {kanal && (
          <header className="oda-pano-bas">
            <b># {kanalAdi(kanal)}</b>
            <span className="m" style={{ fontSize: 13 }}>
              {kanalAciklama(kanal, ayar?.get(kanal))}
            </span>
          </header>
        )}
        <div
          className="oda-akis"
          ref={akis}
          onScroll={(e) => {
            const el = e.currentTarget
            altta.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
          }}
          aria-live="polite"
          aria-relevant="additions"
        >
          {mesajlar.isLoading ? (
            <p className="m" style={{ padding: 16 }}>
              <span className="spinner" aria-hidden="true" /> Yükleniyor…
            </p>
          ) : mesajlar.isError ? (
            <div className="empty" style={{ margin: 16 }}>
              Mesajlar yüklenemedi. Sayfayı yenile.
            </div>
          ) : !gunler.length ? (
            <div className="empty" style={{ margin: 16 }}>
              Bu kanalda henüz mesaj yok. İlk mesajı sen yaz.
            </div>
          ) : (
            gunler.map(([gun, l]) => (
              <div key={gun}>
                <div className="oda-gun">
                  <span>{gunAdi(gun)}</span>
                </div>
                {l.map((m, i) => (
                  <Mesaj
                    key={m.id}
                    m={m}
                    devam={i > 0 && l[i - 1]!.yazan === m.yazan && +new Date(m.created_at) - +new Date(l[i - 1]!.created_at) < 5 * 60_000}
                    ben={m.yazan === profile?.id}
                    benimId={profile?.id ?? ''}
                    adlar={adlar}
                    silebilir={m.yazan === profile?.id || staff}
                    onSil={() => setSilinecek(m)}
                  />
                ))}
              </div>
            ))
          )}
        </div>
        {kanal && <Yazici key={kanal} kanal={kanal} kanalAd={kanalAdi(kanal)} ogretmenler={ogretmenler} onGonderildi={() => (altta.current = true)} />}
      </section>
      {silinecek && (
        <Confirm
          title="Mesaj silinsin mi?"
          action="Sil"
          warn
          onClose={() => setSilinecek(null)}
          onConfirm={async () => {
            try {
              await sil.mutateAsync(silinecek.id)
              setSilinecek(null)
            } catch (e) {
              return (e as Error).message
            }
          }}
        >
          <p>Mesaj herkes için silinir; geri alınamaz.</p>
        </Confirm>
      )}
    </div>
  )
}

function gunluGrupla(l: OdaMesaj[]): [string, OdaMesaj[]][] {
  const m = new Map<string, OdaMesaj[]>()
  for (const x of l) {
    const g = localDate(x.created_at)
    m.set(g, [...(m.get(g) ?? []), x])
  }
  return [...m.entries()]
}
function gunAdi(g: string) {
  const b = todayISO()
  return g === b ? 'Bugün' : g === addDays(b, -1) ? 'Dün' : trD(g)
}

function Mesaj({
  m,
  devam,
  ben,
  benimId,
  adlar,
  silebilir,
  onSil,
}: {
  m: OdaMesaj
  devam: boolean
  ben: boolean
  benimId: string
  adlar: string[]
  silebilir: boolean
  onSil: () => void
}) {
  const tepki = useOdaTepki()
  const [secici, setSecici] = useState(false)
  const [secili, setSecili] = useState(false)
  const ad = m.yazan_p?.full_name ?? 'Ayrılmış öğretmen'
  const sayac = new Map<string, { n: number; benim: boolean }>()
  for (const t of m.oda_tepki) {
    const x = sayac.get(t.emoji) ?? { n: 0, benim: false }
    sayac.set(t.emoji, { n: x.n + 1, benim: x.benim || t.user_id === benimId })
  }
  const anildim = m.anilan.includes(benimId)
  const bas = (e: string) => {
    setSecici(false)
    tepki.mutate({ mesaj_id: m.id, emoji: e, var: !!sayac.get(e)?.benim })
  }
  return (
    <article
      className={`oda-mesaj${devam ? ' devam' : ''}${anildim ? ' anildi' : ''}${secili ? ' secili' : ''}`}
      aria-label={`${ad}, ${localHM(m.created_at)}`}
      onClick={(e) => !(e.target as HTMLElement).closest('button') && setSecili((x) => !x)}
    >
      <span className={`av${ben ? '' : ' s'} oda-av`} aria-hidden="true">
        {devam ? '' : initials(ad)}
      </span>
      <div className="oda-govde">
        {!devam && (
          <div className="oda-ust">
            <b>{ad}</b>
            {m.yazan_p?.branch && <span className="m">{m.yazan_p.branch}</span>}
            <span className="m mono">{localHM(m.created_at)}</span>
          </div>
        )}
        <p className="oda-metin">
          {anmaParcala(m.metin, adlar).map((p, i) =>
            p.anma ? (
              <span key={i} className="oda-anma">
                {p.t}
              </span>
            ) : (
              <Fragment key={i}>{p.t}</Fragment>
            ),
          )}
        </p>
        {(sayac.size > 0 || secici) && (
          <div className="oda-tepkiler">
            {[...sayac.entries()].map(([e, x]) => (
              <button key={e} type="button" className="oda-tepki" aria-pressed={x.benim} aria-label={`${e} ${x.n}`} onClick={() => bas(e)}>
                {e} <span className="mono">{x.n}</span>
              </button>
            ))}
          </div>
        )}
        {secici && (
          <div className="oda-secici" role="group" aria-label="Tepki seç">
            {TEPKILER.map((e) => (
              <button key={e} type="button" onClick={() => bas(e)} aria-label={`${e} tepkisi`}>
                {e}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="oda-islem">
        <button type="button" className="btn ghost sm" aria-label="Tepki ekle" aria-expanded={secici} onClick={() => setSecici((x) => !x)}>
          <span aria-hidden="true">☺</span>
        </button>
        {silebilir && (
          <button type="button" className="btn ghost sm" aria-label="Mesajı sil" onClick={onSil}>
            <Icon name="trash" size={16} />
          </button>
        )}
      </div>
    </article>
  )
}

function Yazici({ kanal, kanalAd, ogretmenler, onGonderildi }: { kanal: string; kanalAd: string; ogretmenler: { id: string; ad: string; brans: string | null }[]; onGonderildi: () => void }) {
  const [metin, setMetin] = useState('')
  const [secilen, setSecilen] = useState<{ id: string; ad: string }[]>([])
  const [arama, setArama] = useState<{ bas: number; q: string } | null>(null)
  const [aktif, setAktif] = useState(0)
  const ta = useRef<HTMLTextAreaElement>(null)
  const yaz = useOdaYaz()
  const toast = useToast()
  const oneriler = useMemo(() => {
    if (!arama) return []
    const q = arama.q.toLocaleLowerCase('tr')
    return ogretmenler.filter((o) => o.ad.toLocaleLowerCase('tr').split(/\s+/).some((p) => p.startsWith(q)) || o.ad.toLocaleLowerCase('tr').startsWith(q)).slice(0, 6)
  }, [arama, ogretmenler])

  const guncelle = (v: string, imlec: number) => {
    setMetin(v)
    setArama(anmaAramasi(v, imlec))
    setAktif(0)
  }
  const anmaSec = (o: { id: string; ad: string }) => {
    if (!arama) return
    const el = ta.current
    const imlec = el?.selectionStart ?? metin.length
    const yeni = `${metin.slice(0, arama.bas)}@${o.ad} ${metin.slice(imlec)}`
    setMetin(yeni)
    setSecilen((s) => (s.some((x) => x.id === o.id) ? s : [...s, o]))
    setArama(null)
    const poz = arama.bas + o.ad.length + 2
    requestAnimationFrame(() => {
      el?.focus()
      el?.setSelectionRange(poz, poz)
    })
  }
  const gonder = async () => {
    const t = metin.trim()
    if (!t || yaz.isPending) return
    try {
      await yaz.mutateAsync({ kanal, metin: t, anilan: anilanlar(t, secilen) })
      setMetin('')
      setSecilen([])
      onGonderildi()
    } catch (e) {
      toast(`Gönderilemedi: ${(e as Error).message}`, 'warn')
    }
  }

  return (
    <form
      className="oda-yazici"
      onSubmit={(e) => {
        e.preventDefault()
        void gonder()
      }}
    >
      {arama && oneriler.length > 0 && (
        <ul className="oda-oneri" role="listbox" aria-label="Öğretmen an">
          {oneriler.map((o, i) => (
            <li key={o.id} role="option" aria-selected={i === aktif}>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => anmaSec(o)}>
                <b>{o.ad}</b>
                {o.brans && <span className="m"> · {o.brans}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      <label className="field" style={{ flex: 1 }}>
        <textarea
          ref={ta}
          aria-label={`#${kanalAd} kanalına mesaj`}
          placeholder="Mesaj yaz… (@ ile an)"
          rows={1}
          maxLength={MESAJ_EN_COK}
          value={metin}
          onChange={(e) => guncelle(e.target.value, e.target.selectionStart)}
          onKeyDown={(e) => {
            if (arama && oneriler.length) {
              if (e.key === 'ArrowDown') return (e.preventDefault(), setAktif((a) => (a + 1) % oneriler.length))
              if (e.key === 'ArrowUp') return (e.preventDefault(), setAktif((a) => (a - 1 + oneriler.length) % oneriler.length))
              if (e.key === 'Enter' || e.key === 'Tab') return (e.preventDefault(), anmaSec(oneriler[aktif]!))
              if (e.key === 'Escape') return setArama(null)
            }
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              void gonder()
            }
          }}
        />
      </label>
      <button type="submit" className="btn pri" disabled={!metin.trim() || yaz.isPending} aria-label="Gönder">
        <Icon name="right" size={18} /> <span className="hide-m">Gönder</span>
      </button>
    </form>
  )
}

