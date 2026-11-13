// Öğretmenler Odası → Pano: yapışkan notlar, ders/nöbet değişimi, hızlı anket, teşekkür kartları (0070). Yalnız öğretmenler.
import { useMemo, useState } from 'react'
import { useAuth } from '@/auth/AuthProvider'
import { usePeople } from '@/lib/data'
import { isTeacherP } from '@/lib/roles'
import { addDays, ago, initials, todayISO, trDM, trDW } from '@/lib/format'
import {
  useAlkis, useAnketEkle, useAnketler, useAnketOyla, useAnketSil, useDegisimAl, useDegisimEkle, useDegisimIptal, useDegisimler,
  usePanoEkle, usePanoNotlar, usePanoSil, useTesekkurEkle, useTesekkurler, useTesekkurSil, type NotRenk,
} from '@/lib/panoData'
import { haftaninTesekkuru } from '@/lib/pano'
import { Icon } from '@/components/Icon'
import { useToast } from '@/components/Toast'

const RENKLER: [NotRenk, string][] = [
  ['sari', 'Sarı'],
  ['mavi', 'Mavi'],
  ['yesil', 'Yeşil'],
  ['pembe', 'Pembe'],
]

export default function OdaPano() {
  return (
    <div className="pn-duzen">
      <div className="pn-sol">
        <PanoNotlari />
        <Tesekkurler />
      </div>
      <div className="pn-sag">
        <Degisimler />
        <Anketler />
      </div>
    </div>
  )
}

function useHata() {
  const toast = useToast()
  return (e: unknown) => toast((e as Error).message, 'warn')
}

function PanoNotlari() {
  const { profile, role } = useAuth()
  const q = usePanoNotlar()
  const ekle = usePanoEkle()
  const sil = usePanoSil()
  const hata = useHata()
  const [acik, setAcik] = useState(false)
  const [metin, setMetin] = useState('')
  const [renk, setRenk] = useState<NotRenk>('sari')
  const [gun, setGun] = useState(7)
  const staff = role === 'admin' || role === 'rehber'
  return (
    <section className="card pn-kart" aria-label="Pano">
      <div className="kv">
        <h2 className="sec">📌 Pano</h2>
        <button type="button" className="btn sm" aria-expanded={acik} onClick={() => setAcik((x) => !x)}>
          <Icon name="plus" size={16} /> Not as
        </button>
      </div>
      {acik && (
        <form
          className="pn-form"
          onSubmit={(e) => {
            e.preventDefault()
            if (!metin.trim()) return
            ekle.mutate(
              { metin: metin.trim(), renk, bitis: addDays(todayISO(), gun) },
              { onSuccess: () => (setMetin(''), setAcik(false)), onError: hata },
            )
          }}
        >
          <label className="field">
            Not
            <textarea maxLength={400} value={metin} onChange={(e) => setMetin(e.target.value)} placeholder="Ör. Fotokopi makinesi 2. katta, 3. ders sonrası bakımda." />
          </label>
          <div className="pn-form-alt">
            <div className="pn-renkler" role="radiogroup" aria-label="Renk">
              {RENKLER.map(([k, ad]) => (
                <button key={k} type="button" role="radio" aria-checked={renk === k} aria-label={ad} className={`pn-renk ${k}`} onClick={() => setRenk(k)} />
              ))}
            </div>
            <label className="field" style={{ minWidth: 140 }}>
              <select aria-label="Panoda kalma süresi" value={gun} onChange={(e) => setGun(Number(e.target.value))}>
                <option value={1}>1 gün</option>
                <option value={3}>3 gün</option>
                <option value={7}>1 hafta</option>
                <option value={14}>2 hafta</option>
                <option value={30}>30 gün</option>
              </select>
            </label>
            <button type="submit" className="btn pri" disabled={!metin.trim() || ekle.isPending}>
              Panoya as
            </button>
          </div>
        </form>
      )}
      {q.isLoading ? (
        <p className="m">Yükleniyor…</p>
      ) : !q.data?.length ? (
        <p className="m">Panoda not yok. Duyuru, hatırlatma ya da paylaşmak istediğin bir şeyi as.</p>
      ) : (
        <ul className="pn-notlar">
          {q.data.map((n) => (
            <li key={n.id} className={`pn-not ${n.renk}`}>
              <p>{n.metin}</p>
              <span className="pn-not-alt">
                <span>
                  {n.yazan_p?.full_name ?? 'Ayrılmış öğretmen'} · {trDM(n.bitis)}'e kadar
                </span>
                {(n.yazan === profile?.id || staff) && (
                  <button type="button" className="btn ghost sm" aria-label="Notu kaldır" onClick={() => sil.mutate(n.id, { onError: hata })}>
                    <Icon name="x" size={16} />
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function Degisimler() {
  const { profile, role } = useAuth()
  const bugun = todayISO()
  const q = useDegisimler(bugun)
  const ekle = useDegisimEkle()
  const al = useDegisimAl()
  const iptal = useDegisimIptal()
  const hata = useHata()
  const toast = useToast()
  const [acik, setAcik] = useState(false)
  const [f, setF] = useState({ tur: 'ders' as 'ders' | 'nobet', tarih: addDays(bugun, 1), saat: '', sinif: '', aciklama: '' })
  const staff = role === 'admin' || role === 'rehber'
  return (
    <section className="card pn-kart" aria-label="Ders ve nöbet değişimi">
      <div className="kv">
        <h2 className="sec">🔁 Ders / nöbet değişimi</h2>
        <button type="button" className="btn sm" aria-expanded={acik} onClick={() => setAcik((x) => !x)}>
          <Icon name="plus" size={16} /> Talep
        </button>
      </div>
      {acik && (
        <form
          className="pn-form"
          onSubmit={(e) => {
            e.preventDefault()
            ekle.mutate(
              { tur: f.tur, tarih: f.tarih, saat: f.saat.trim(), sinif: f.sinif.trim() || null, aciklama: f.aciklama.trim() || null },
              { onSuccess: () => (setAcik(false), setF((x) => ({ ...x, saat: '', sinif: '', aciklama: '' })), toast('Talep panoya eklendi')), onError: hata },
            )
          }}
        >
          <div className="pn-izgara">
            <label className="field">
              Tür
              <select value={f.tur} onChange={(e) => setF({ ...f, tur: e.target.value as 'ders' | 'nobet' })}>
                <option value="ders">Ders</option>
                <option value="nobet">Nöbet</option>
              </select>
            </label>
            <label className="field">
              Tarih
              <input type="date" min={bugun} max={addDays(bugun, 60)} value={f.tarih} onChange={(e) => setF({ ...f, tarih: e.target.value })} required />
            </label>
            <label className="field">
              Saat / ders
              <input maxLength={40} placeholder="Ör. 3. ders" value={f.saat} onChange={(e) => setF({ ...f, saat: e.target.value })} required />
            </label>
            <label className="field">
              Sınıf / yer
              <input maxLength={40} placeholder="Ör. 7/B" value={f.sinif} onChange={(e) => setF({ ...f, sinif: e.target.value })} />
            </label>
          </div>
          <label className="field">
            Not (isteğe bağlı)
            <input maxLength={300} placeholder="Ör. Sağlık raporu nedeniyle" value={f.aciklama} onChange={(e) => setF({ ...f, aciklama: e.target.value })} />
          </label>
          <button type="submit" className="btn pri" disabled={!f.saat.trim() || ekle.isPending}>
            Talebi as
          </button>
        </form>
      )}
      {q.isLoading ? (
        <p className="m">Yükleniyor…</p>
      ) : !q.data?.length ? (
        <p className="m">Açık değişim talebi yok.</p>
      ) : (
        <ul className="pn-liste">
          {q.data.map((d) => {
            const benim = d.isteyen === profile?.id
            return (
              <li key={d.id} className={d.durum === 'alindi' ? 'tamam' : ''}>
                <div className="pn-satir-bas">
                  <span className={`chip ${d.tur === 'ders' ? 'n' : 'gold'}`}>{d.tur === 'ders' ? 'Ders' : 'Nöbet'}</span>
                  <b>
                    {trDW(d.tarih)} · {d.saat}
                    {d.sinif ? ` · ${d.sinif}` : ''}
                  </b>
                </div>
                <span className="m" style={{ fontSize: 13 }}>
                  {d.isteyen_p?.full_name ?? 'Ayrılmış öğretmen'}
                  {d.isteyen_p?.branch ? ` (${d.isteyen_p.branch})` : ''}
                  {d.aciklama ? ` — ${d.aciklama}` : ''}
                </span>
                <div className="pn-satir-alt">
                  {d.durum === 'alindi' ? (
                    <span className="chip up">✓ {d.alan === profile?.id ? 'Sen giriyorsun' : `${d.alan_p?.full_name ?? 'Bir öğretmen'} giriyor`}</span>
                  ) : benim ? (
                    <span className="m" style={{ fontSize: 13 }}>
                      Bekliyor
                    </span>
                  ) : (
                    <button type="button" className="btn sm pri" disabled={al.isPending} onClick={() => al.mutate(d.id, { onSuccess: () => toast('Teşekkürler! Talep sahibine ve yönetime bildirildi.'), onError: hata })}>
                      Ben girerim
                    </button>
                  )}
                  {(benim || staff) && (
                    <button type="button" className="btn ghost sm" onClick={() => iptal.mutate(d.id, { onError: hata })}>
                      İptal et
                    </button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

function Anketler() {
  const { profile, role } = useAuth()
  const q = useAnketler()
  const ekle = useAnketEkle()
  const oyla = useAnketOyla()
  const sil = useAnketSil()
  const hata = useHata()
  const [acik, setAcik] = useState(false)
  const [soru, setSoru] = useState('')
  const [secenekler, setSecenekler] = useState(['', ''])
  const [gun, setGun] = useState(3)
  const staff = role === 'admin' || role === 'rehber'
  const simdi = Date.now()
  return (
    <section className="card pn-kart" aria-label="Hızlı anket">
      <div className="kv">
        <h2 className="sec">📊 Hızlı anket</h2>
        <button type="button" className="btn sm" aria-expanded={acik} onClick={() => setAcik((x) => !x)}>
          <Icon name="plus" size={16} /> Anket
        </button>
      </div>
      {acik && (
        <form
          className="pn-form"
          onSubmit={(e) => {
            e.preventDefault()
            const l = secenekler.map((s) => s.trim()).filter(Boolean)
            if (soru.trim().length < 3 || l.length < 2) return
            ekle.mutate(
              { soru: soru.trim(), secenekler: l, bitis: new Date(Date.now() + gun * 86400_000).toISOString() },
              { onSuccess: () => (setAcik(false), setSoru(''), setSecenekler(['', ''])), onError: hata },
            )
          }}
        >
          <label className="field">
            Soru
            <input maxLength={200} placeholder="Ör. Zümre toplantısı hangi gün olsun?" value={soru} onChange={(e) => setSoru(e.target.value)} />
          </label>
          {secenekler.map((s, i) => (
            <label key={i} className="field">
              <span className="sr-only">{i + 1}. seçenek</span>
              <input maxLength={80} placeholder={`${i + 1}. seçenek`} value={s} onChange={(e) => setSecenekler(secenekler.map((x, j) => (j === i ? e.target.value : x)))} />
            </label>
          ))}
          <div className="pn-form-alt">
            {secenekler.length < 6 && (
              <button type="button" className="btn sm" onClick={() => setSecenekler([...secenekler, ''])}>
                Seçenek ekle
              </button>
            )}
            <label className="field" style={{ minWidth: 130 }}>
              <select aria-label="Açık kalma süresi" value={gun} onChange={(e) => setGun(Number(e.target.value))}>
                <option value={1}>1 gün açık</option>
                <option value={3}>3 gün açık</option>
                <option value={7}>1 hafta açık</option>
              </select>
            </label>
            <button type="submit" className="btn pri" disabled={ekle.isPending}>
              Yayınla
            </button>
          </div>
          <p className="m" style={{ fontSize: 12, margin: 0 }}>
            Oylar gizlidir; herkes yalnız sayıları görür.
          </p>
        </form>
      )}
      {q.isLoading ? (
        <p className="m">Yükleniyor…</p>
      ) : !q.data?.length ? (
        <p className="m">Henüz anket yok.</p>
      ) : (
        <ul className="pn-liste">
          {q.data.map((a) => {
            const toplam = a.sayilar.reduce((x, y) => x + y, 0)
            const kapali = new Date(a.bitis).getTime() < simdi
            return (
              <li key={a.id}>
                <b>{a.soru}</b>
                <span className="m" style={{ fontSize: 12 }}>
                  {a.soran_p?.full_name ?? 'Ayrılmış öğretmen'} · {kapali ? 'kapandı' : `${trDM(a.bitis.slice(0, 10))} tarihine kadar açık`} · {toplam} oy
                </span>
                <div className="pn-secenekler" role="group" aria-label={a.soru}>
                  {a.secenekler.map((s, i) => {
                    const oran = toplam ? Math.round((a.sayilar[i]! / toplam) * 100) : 0
                    return (
                      <button
                        key={i}
                        type="button"
                        className="pn-secenek"
                        aria-pressed={a.benim === i}
                        disabled={kapali || oyla.isPending}
                        onClick={() => oyla.mutate({ anket: a.id, secim: a.benim === i ? null : i }, { onError: hata })}
                      >
                        <span className="pn-bar" style={{ width: `${oran}%` }} aria-hidden="true" />
                        <span className="pn-secenek-ad">
                          {a.benim === i ? '✓ ' : ''}
                          {s}
                        </span>
                        <span className="mono">
                          {a.sayilar[i]} · %{oran}
                        </span>
                      </button>
                    )
                  })}
                </div>
                {(a.soran === profile?.id || staff) && (
                  <button type="button" className="btn ghost sm" style={{ alignSelf: 'flex-start' }} onClick={() => sil.mutate(a.id, { onError: hata })}>
                    Anketi sil
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

function Tesekkurler() {
  const { profile, role } = useAuth()
  const q = useTesekkurler()
  const people = usePeople()
  const ekle = useTesekkurEkle()
  const sil = useTesekkurSil()
  const alkis = useAlkis()
  const hata = useHata()
  const toast = useToast()
  const [acik, setAcik] = useState(false)
  const [alan, setAlan] = useState('')
  const [metin, setMetin] = useState('')
  const staff = role === 'admin' || role === 'rehber'
  const ogretmenler = useMemo(
    () => (people.data ?? []).filter((p) => isTeacherP(p) && p.id !== profile?.id).sort((a, b) => a.full_name.localeCompare(b.full_name, 'tr')),
    [people.data, profile?.id],
  )
  const haftanin = haftaninTesekkuru(q.data ?? [], todayISO())
  return (
    <section className="card pn-kart" aria-label="Teşekkür kartları">
      <div className="kv">
        <h2 className="sec">💐 Teşekkür kartları</h2>
        <button type="button" className="btn sm" aria-expanded={acik} onClick={() => setAcik((x) => !x)}>
          <Icon name="plus" size={16} /> Teşekkür et
        </button>
      </div>
      {acik && (
        <form
          className="pn-form"
          onSubmit={(e) => {
            e.preventDefault()
            if (!alan || metin.trim().length < 3) return
            ekle.mutate({ alan, metin: metin.trim() }, { onSuccess: () => (setAcik(false), setAlan(''), setMetin(''), toast('Teşekkür kartın gönderildi')), onError: hata })
          }}
        >
          <label className="field">
            Kime
            <select value={alan} onChange={(e) => setAlan(e.target.value)} required>
              <option value="">Öğretmen seç</option>
              {ogretmenler.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.full_name}
                  {o.branch ? ` · ${o.branch}` : ''}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Mesajın
            <textarea maxLength={300} value={metin} onChange={(e) => setMetin(e.target.value)} placeholder="Ör. Dün nöbetimi aldığın için çok teşekkürler!" />
          </label>
          <button type="submit" className="btn pri" disabled={!alan || metin.trim().length < 3 || ekle.isPending}>
            Gönder
          </button>
        </form>
      )}
      {haftanin && (
        <div className="pn-haftanin">
          <span className="chip gold">⭐ Haftanın teşekkürü</span>
          <p>“{haftanin.metin}”</p>
          <span className="m" style={{ fontSize: 13 }}>
            {haftanin.gonderen_p?.full_name ?? 'Bir öğretmen'} → <b>{haftanin.alan_p?.full_name}</b> · 👏 {haftanin.oda_tesekkur_alkis.length}
          </span>
        </div>
      )}
      {q.isLoading ? (
        <p className="m">Yükleniyor…</p>
      ) : !q.data?.length ? (
        <p className="m">Henüz teşekkür kartı yok. İlk teşekkürü sen gönder!</p>
      ) : (
        <ul className="pn-tesekkurler">
          {q.data.map((t) => {
            const benim = t.oda_tesekkur_alkis.some((a) => a.user_id === profile?.id)
            return (
              <li key={t.id}>
                <span className="av" aria-hidden="true">
                  {initials(t.alan_p?.full_name ?? '?')}
                </span>
                <div style={{ minWidth: 0 }}>
                  <span style={{ fontSize: 13 }}>
                    <b>{t.gonderen_p?.full_name ?? 'Bir öğretmen'}</b> → <b>{t.alan_p?.full_name ?? 'Ayrılmış öğretmen'}</b>
                    <span className="m"> · {ago(t.created_at)}</span>
                  </span>
                  <p>{t.metin}</p>
                  <div className="pn-satir-alt">
                    <button type="button" className="oda-tepki" aria-pressed={benim} aria-label={`Alkışla, ${t.oda_tesekkur_alkis.length}`} onClick={() => alkis.mutate({ id: t.id, var: benim }, { onError: hata })}>
                      👏 <span className="mono">{t.oda_tesekkur_alkis.length}</span>
                    </button>
                    {(t.gonderen === profile?.id || staff) && (
                      <button type="button" className="btn ghost sm" onClick={() => sil.mutate(t.id, { onError: hata })}>
                        Kaldır
                      </button>
                    )}
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
