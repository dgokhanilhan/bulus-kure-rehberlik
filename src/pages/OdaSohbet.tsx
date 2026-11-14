// Öğretmenler Odası → Sohbet: öğretmenlerin kendi aralarındaki canlı sohbet (0068). Saklama süresi ve kanallar Yönetim'den (0071).
// Yanıtlama, kanalda arama, sabit mesajlar ve okundu bilgisi (0074).
import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '@/auth/AuthProvider'
import { usePeople } from '@/lib/data'
import { isTeacherP } from '@/lib/roles'
import { initials, localDate, localHM, todayISO, addDays, trD } from '@/lib/format'
import {
  anilanlar,
  anmaAramasi,
  anmaParcala,
  ARAMA_EN_AZ,
  kanalAciklama,
  kanalAdi as kanalAdiTemel,
  MESAJ_EN_COK,
  TEPKILER,
  vurguParcala,
  type KanalAyar,
} from '@/lib/oda'
import {
  useOdaArama,
  useOdaMesajlar,
  useOdaOkundu,
  useOdaOkunduBilgisi,
  useOdaOkunmamis,
  useOdaSabitle,
  useOdaSabitler,
  useOdaSil,
  useOdaTepki,
  useOdaYaz,
  type OdaMesaj,
} from '@/lib/odaData'
import { Modal } from '@/components/Modal'
import { Confirm } from '@/components/Confirm'
import { Icon } from '@/components/Icon'
import { useToast } from '@/components/Toast'

export default function OdaSohbet({ kanallar, ayar, saklama }: { kanallar: string[]; ayar?: ReadonlyMap<string, KanalAyar>; saklama: number }) {
  const kanalAdi = (k: string) => kanalAdiTemel(k, ayar?.get(k))
  const { profile, role } = useAuth()
  const [sp, setSp] = useSearchParams()
  const kanal = kanallar.includes(sp.get('kanal') ?? '') ? sp.get('kanal')! : (kanallar[0] ?? null)
  const setKanal = (k: string) => {
    setYanit(null)
    setAra(null)
    setSp({ sekme: 'sohbet', kanal: k }, { replace: true })
  }
  const [yanit, setYanit] = useState<OdaMesaj | null>(null)
  /** null = arama kapalı */
  const [ara, setAra] = useState<string | null>(null)
  const [bilgi, setBilgi] = useState<OdaMesaj | null>(null)
  const okunmamis = useOdaOkunmamis()
  const mesajlar = useOdaMesajlar(kanal)
  const okundu = useOdaOkundu()
  const people = usePeople()
  const ogretmenler = useMemo(
    () => (people.data ?? []).filter((p) => isTeacherP(p) && p.id !== profile?.id).map((p) => ({ id: p.id, ad: p.full_name, brans: p.branch })),
    [people.data, profile?.id],
  )
  const adlar = useMemo(() => [...ogretmenler.map((o) => o.ad), profile?.full_name ?? ''], [ogretmenler, profile?.full_name])
  const adOf = (id: string | null | undefined) =>
    id === profile?.id ? (profile?.full_name ?? '') : (ogretmenler.find((o) => o.id === id)?.ad ?? 'Ayrılmış öğretmen')
  const sabitler = useOdaSabitler(kanal)
  const sabitle = useOdaSabitle()
  const arama = useOdaArama(kanal, ara ?? '')
  const toast = useToast()
  const araniyor = ara != null && ara.trim().length >= ARAMA_EN_AZ
  /** Mesaja git: akışta yüklüyse kaydır ve kısa süre vurgula */
  const git = (id: string) => {
    setAra(null)
    requestAnimationFrame(() => {
      const el = document.getElementById(`m-${id}`)
      if (!el) return toast('Bu mesaj çok eskide; akışta yüklü değil.', 'warn')
      el.scrollIntoView({ block: 'center' })
      el.classList.add('vurgu')
      setTimeout(() => el.classList.remove('vurgu'), 1600)
    })
  }
  const sabitDegis = (m: OdaMesaj) =>
    sabitle.mutate(
      { id: m.id, sabit: !m.sabit_at },
      { onSuccess: () => toast(m.sabit_at ? 'Sabit kaldırıldı' : 'Mesaj sabitlendi'), onError: (e) => toast((e as Error).message, 'warn') },
    )

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
            <button
              type="button"
              className="btn ghost sm oda-ara-dugme"
              aria-label={ara == null ? 'Kanalda ara' : 'Aramayı kapat'}
              aria-expanded={ara != null}
              onClick={() => setAra((x) => (x == null ? '' : null))}
            >
              <Icon name={ara == null ? 'search' : 'x'} size={18} />
            </button>
            {ara != null && (
              <label className="field oda-ara-kutu">
                <input
                  autoFocus
                  type="search"
                  aria-label="Kanalda ara"
                  placeholder={`# ${kanalAdi(kanal)} içinde ara…`}
                  value={ara}
                  onChange={(e) => setAra(e.target.value)}
                  onKeyDown={(e) => e.key === 'Escape' && setAra(null)}
                />
              </label>
            )}
          </header>
        )}
        {!araniyor && !!sabitler.data?.length && (
          <ul className="oda-sabitler" aria-label="Sabitlenmiş mesajlar">
            {sabitler.data.map((m) => (
              <li key={m.id}>
                <span aria-hidden="true">📌</span>
                <button type="button" className="oda-sabit-metin" onClick={() => git(m.id)}>
                  <b>{m.yazan_p?.full_name ?? 'Ayrılmış öğretmen'}:</b> {m.metin}
                </button>
                {(staff || m.yazan === profile?.id) && (
                  <button type="button" className="btn ghost sm" onClick={() => setBilgi(m)}>
                    Okuyanlar
                  </button>
                )}
                {staff && (
                  <button type="button" className="btn ghost sm" aria-label="Sabiti kaldır" onClick={() => sabitDegis(m)}>
                    <Icon name="x" size={16} />
                  </button>
                )}
              </li>
            ))}
          </ul>
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
          {araniyor ? (
            <AramaSonuclari q={ara!} yukleniyor={arama.isLoading} hata={arama.isError} sonuclar={arama.data ?? []} onGit={git} />
          ) : mesajlar.isLoading ? (
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
                    yanitAd={m.yanit ? adOf(m.yanit.yazan) : null}
                    onAlinti={() => m.yanit && git(m.yanit.id)}
                    onYanit={() => setYanit(m)}
                    onSabit={staff ? () => sabitDegis(m) : undefined}
                    onBilgi={staff || m.yazan === profile?.id ? () => setBilgi(m) : undefined}
                  />
                ))}
              </div>
            ))
          )}
        </div>
        {kanal && (
          <Yazici
            key={kanal}
            kanal={kanal}
            kanalAd={kanalAdi(kanal)}
            ogretmenler={ogretmenler}
            yanit={yanit ? { id: yanit.id, ad: yanit.yazan_p?.full_name ?? 'Ayrılmış öğretmen', metin: yanit.metin } : null}
            onYanitIptal={() => setYanit(null)}
            onGonderildi={() => {
              altta.current = true
              setYanit(null)
              setAra(null)
            }}
          />
        )}
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
      {bilgi && <OkunduModal m={bilgi} onClose={() => setBilgi(null)} />}
    </div>
  )
}

function AramaSonuclari({
  q,
  yukleniyor,
  hata,
  sonuclar,
  onGit,
}: {
  q: string
  yukleniyor: boolean
  hata: boolean
  sonuclar: OdaMesaj[]
  onGit: (id: string) => void
}) {
  if (yukleniyor)
    return (
      <p className="m" style={{ padding: 16 }}>
        <span className="spinner" aria-hidden="true" /> Aranıyor…
      </p>
    )
  if (hata)
    return (
      <div className="empty" style={{ margin: 16 }}>
        Arama yapılamadı. Yeniden dene.
      </div>
    )
  if (!sonuclar.length)
    return (
      <div className="empty" style={{ margin: 16 }}>
        “{q.trim()}” için bu kanalda mesaj bulunamadı.
      </div>
    )
  return (
    <ul className="oda-sonuclar" aria-label="Arama sonuçları">
      {sonuclar.map((m) => (
        <li key={m.id}>
          <button type="button" onClick={() => onGit(m.id)}>
            <span className="oda-ust">
              <b>{m.yazan_p?.full_name ?? 'Ayrılmış öğretmen'}</b>
              <span className="m mono">
                {trD(localDate(m.created_at))} {localHM(m.created_at)}
              </span>
            </span>
            <span className="oda-metin">
              {vurguParcala(m.metin, q).map((p, i) => (p.vurgu ? <mark key={i}>{p.t}</mark> : <Fragment key={i}>{p.t}</Fragment>))}
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}

function OkunduModal({ m, onClose }: { m: OdaMesaj; onClose: () => void }) {
  const q = useOdaOkunduBilgisi(m.id)
  return (
    <Modal title="Okundu bilgisi" sub={m.metin.length > 90 ? `${m.metin.slice(0, 90)}…` : m.metin} width={440} onClose={onClose}>
      {q.isLoading ? (
        <p className="m">Yükleniyor…</p>
      ) : q.isError || !q.data ? (
        <p className="m">{(q.error as Error | null)?.message ?? 'Okundu bilgisi alınamadı.'}</p>
      ) : (
        <>
          <p style={{ margin: 0, fontSize: 17 }}>
            Kanaldaki <b>{q.data.toplam}</b> öğretmenden <b>{q.data.okuyan}</b> kişi bu mesajdan sonra kanalı açtı.
          </p>
          {q.data.okumayanlar && q.data.okumayanlar.length > 0 && (
            <>
              <h3 className="sec" style={{ marginTop: 16 }}>
                Henüz açmayanlar ({q.data.okumayanlar.length})
              </h3>
              <ul className="oda-okumayan">
                {q.data.okumayanlar.map((ad) => (
                  <li key={ad}>{ad}</li>
                ))}
              </ul>
            </>
          )}
          {q.data.okumayanlar && q.data.okumayanlar.length === 0 && q.data.toplam > 0 && <p className="m">Kanaldaki herkes açtı.</p>}
          <p className="m" style={{ fontSize: 13 }}>
            Kanalı açan, o ana kadarki mesajları okumuş sayılır. Kimin açmadığını yalnız yönetici ve rehber öğretmen görür.
          </p>
        </>
      )}
    </Modal>
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
  yanitAd,
  onAlinti,
  onYanit,
  onSabit,
  onBilgi,
}: {
  m: OdaMesaj
  devam: boolean
  ben: boolean
  benimId: string
  adlar: string[]
  silebilir: boolean
  onSil: () => void
  yanitAd: string | null
  onAlinti: () => void
  onYanit: () => void
  /** Yalnız yönetici ve rehber öğretmende dolu */
  onSabit?: () => void
  /** Yalnız mesajı yazan ve yönetimde dolu */
  onBilgi?: () => void
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
      id={`m-${m.id}`}
      className={`oda-mesaj${devam && !m.yanit ? ' devam' : ''}${anildim ? ' anildi' : ''}${secili ? ' secili' : ''}`}
      aria-label={`${ad}, ${localHM(m.created_at)}`}
      onClick={(e) => !(e.target as HTMLElement).closest('button') && setSecili((x) => !x)}
    >
      <span className={`av${ben ? '' : ' s'} oda-av`} aria-hidden="true">
        {devam && !m.yanit ? '' : initials(ad)}
      </span>
      <div className="oda-govde">
        {(!devam || !!m.yanit) && (
          <div className="oda-ust">
            <b>{ad}</b>
            {m.yazan_p?.branch && <span className="m">{m.yazan_p.branch}</span>}
            <span className="m mono">{localHM(m.created_at)}</span>
            {m.sabit_at && <span className="chip gold">📌 Sabit</span>}
          </div>
        )}
        {m.yanit && (
          <button type="button" className="oda-alinti" onClick={onAlinti} aria-label={`${yanitAd} adlı kişinin mesajına yanıt; asıl mesaja git`}>
            <b>{yanitAd}</b>
            <span>{m.yanit.metin}</span>
          </button>
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
        <button type="button" className="btn ghost sm" aria-label="Yanıtla" onClick={onYanit}>
          <span aria-hidden="true">↩</span>
        </button>
        <button type="button" className="btn ghost sm" aria-label="Tepki ekle" aria-expanded={secici} onClick={() => setSecici((x) => !x)}>
          <span aria-hidden="true">☺</span>
        </button>
        {onSabit && (
          <button
            type="button"
            className="btn ghost sm"
            aria-label={m.sabit_at ? 'Sabiti kaldır' : 'Mesajı sabitle'}
            aria-pressed={!!m.sabit_at}
            onClick={onSabit}
          >
            <span aria-hidden="true">📌</span>
          </button>
        )}
        {onBilgi && (
          <button type="button" className="btn ghost sm" aria-label="Okundu bilgisi" onClick={onBilgi}>
            <Icon name="check" size={16} />
          </button>
        )}
        {silebilir && (
          <button type="button" className="btn ghost sm" aria-label="Mesajı sil" onClick={onSil}>
            <Icon name="trash" size={16} />
          </button>
        )}
      </div>
    </article>
  )
}

function Yazici({
  kanal,
  kanalAd,
  ogretmenler,
  yanit,
  onYanitIptal,
  onGonderildi,
}: {
  kanal: string
  kanalAd: string
  ogretmenler: { id: string; ad: string; brans: string | null }[]
  yanit: { id: string; ad: string; metin: string } | null
  onYanitIptal: () => void
  onGonderildi: () => void
}) {
  const [metin, setMetin] = useState('')
  const [secilen, setSecilen] = useState<{ id: string; ad: string }[]>([])
  const [arama, setArama] = useState<{ bas: number; q: string } | null>(null)
  const [aktif, setAktif] = useState(0)
  const ta = useRef<HTMLTextAreaElement>(null)
  const yaz = useOdaYaz()
  const toast = useToast()
  useEffect(() => {
    if (yanit) ta.current?.focus()
  }, [yanit?.id])
  const oneriler = useMemo(() => {
    if (!arama) return []
    const q = arama.q.toLocaleLowerCase('tr')
    return ogretmenler
      .filter(
        (o) =>
          o.ad
            .toLocaleLowerCase('tr')
            .split(/\s+/)
            .some((p) => p.startsWith(q)) || o.ad.toLocaleLowerCase('tr').startsWith(q),
      )
      .slice(0, 6)
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
      await yaz.mutateAsync({ kanal, metin: t, anilan: anilanlar(t, secilen), yanit_id: yanit?.id ?? null })
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
      {yanit && (
        <div className="oda-yanit-cubuk" role="status">
          <span>
            <b>{yanit.ad}</b> adlı kişiye yanıt: <span className="m">{yanit.metin}</span>
          </span>
          <button type="button" className="btn ghost sm" aria-label="Yanıtı iptal et" onClick={onYanitIptal}>
            <Icon name="x" size={16} />
          </button>
        </div>
      )}
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
