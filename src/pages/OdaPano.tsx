// Öğretmenler Odası → Pano: yapışkan notlar, ders/nöbet değişimi, hızlı anket, teşekkür kartları (0070). Yalnız öğretmenler.
// 0075: "okudum" onayı isteyen notlar, etkinlik ve katılım listesi, değişimde idare onayı, anonim öneri kutusu.
import { useMemo, useState } from 'react'
import { useAuth } from '@/auth/AuthProvider'
import { usePeople } from '@/lib/data'
import { isTeacherP } from '@/lib/roles'
import { addDays, ago, todayISO, trDM, trDW } from '@/lib/format'
import {
  useAlkis,
  useAnketEkle,
  useAnketler,
  useAnketOyla,
  useAnketSil,
  useDegisimAl,
  useDegisimEkle,
  useDegisimIptal,
  useDegisimler,
  useDegisimOnayla,
  useEtkinlikEkle,
  useEtkinlikKatil,
  useEtkinlikler,
  useEtkinlikSil,
  useLigKursu,
  useOneriGonder,
  usePanoEkle,
  usePanoNotlar,
  usePanoOnayDurum,
  usePanoOnayla,
  usePanoOnaylarim,
  usePanoSil,
  useTesekkurEkle,
  useTesekkurler,
  useTesekkurSil,
  type NotRenk,
} from '@/lib/panoData'
import { useAyar } from '@/lib/ayarlar'
import { haftaninTesekkuru } from '@/lib/pano'
import { Icon } from '@/components/Icon'
import { KisiSimge } from '@/components/Avatar'
import { useToast } from '@/components/Toast'

const RENKLER: [NotRenk, string][] = [
  ['sari', 'Sarı'],
  ['mavi', 'Mavi'],
  ['yesil', 'Yeşil'],
  ['pembe', 'Pembe'],
]

export default function OdaPano() {
  const ayar = useAyar()
  return (
    <div className="pn-duzen">
      <div className="pn-sol">
        <PanoNotlari />
        <Etkinlikler />
        <Tesekkurler />
      </div>
      <div className="pn-sag">
        <Degisimler />
        <Anketler />
        {ayar.bool('oda.oneri') && <OneriKutusu />}
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
  const [onayIste, setOnayIste] = useState(false)
  const [acikDurum, setAcikDurum] = useState<string | null>(null)
  const staff = role === 'admin' || role === 'rehber'
  const onaylarim = usePanoOnaylarim()
  const onayla = usePanoOnayla()
  const onayli = (q.data ?? []).filter((n) => n.onay_iste && (staff || n.yazan === profile?.id)).map((n) => n.id)
  const durum = usePanoOnayDurum(onayli)
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
              { metin: metin.trim(), renk, bitis: addDays(todayISO(), gun), onay_iste: staff && onayIste },
              { onSuccess: () => (setMetin(''), setAcik(false), setOnayIste(false)), onError: hata },
            )
          }}
        >
          <label className="field">
            Not
            <textarea
              maxLength={400}
              value={metin}
              onChange={(e) => setMetin(e.target.value)}
              placeholder="Ör. Fotokopi makinesi 2. katta, 3. ders sonrası bakımda."
            />
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
          {staff && (
            <label className="pn-onay-sec">
              <input type="checkbox" checked={onayIste} onChange={(e) => setOnayIste(e.target.checked)} />
              <span>Herkes okusun: öğretmenlerden “Okudum” onayı iste</span>
            </label>
          )}
        </form>
      )}
      {q.isLoading ? (
        <p className="m">Yükleniyor…</p>
      ) : !q.data?.length ? (
        <p className="m">Panoda not yok. Duyuru, hatırlatma ya da paylaşmak istediğin bir şeyi as.</p>
      ) : (
        <ul className="pn-notlar">
          {q.data.map((n) => (
            <li key={n.id} className={`pn-not ${n.renk}${n.onay_iste ? ' onayli' : ''}`}>
              {n.onay_iste && <span className="pn-onay-etiket">📣 Herkes okusun</span>}
              <p>{n.metin}</p>
              {n.onay_iste && n.yazan !== profile?.id && (
                <button
                  type="button"
                  className="btn sm pn-okudum"
                  aria-pressed={!!onaylarim.data?.has(n.id)}
                  disabled={!!onaylarim.data?.has(n.id) || onayla.isPending}
                  onClick={() => onayla.mutate(n.id, { onError: hata })}
                >
                  {onaylarim.data?.has(n.id) ? '✓ Okudun' : 'Okudum'}
                </button>
              )}
              {n.onay_iste && durum.data?.get(n.id) && (
                <>
                  <button
                    type="button"
                    className="btn ghost sm pn-durum"
                    aria-expanded={acikDurum === n.id}
                    onClick={() => setAcikDurum((x) => (x === n.id ? null : n.id))}
                  >
                    {durum.data.get(n.id)!.okuyan}/{durum.data.get(n.id)!.toplam} öğretmen okudu
                  </button>
                  {acikDurum === n.id &&
                    (durum.data.get(n.id)!.okumayanlar.length ? (
                      <p className="pn-okumayan">
                        <b>Henüz onaylamayanlar:</b> {durum.data.get(n.id)!.okumayanlar.join(', ')}
                      </p>
                    ) : (
                      <p className="pn-okumayan">Herkes onayladı.</p>
                    ))}
                </>
              )}
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
  const onayla = useDegisimOnayla()
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
                  ) : d.durum === 'onay' ? (
                    <>
                      <span className="chip gold">⏳ İdare onayı bekliyor: {d.alan === profile?.id ? 'sen' : (d.alan_p?.full_name ?? 'bir öğretmen')}</span>
                      {role === 'admin' && (
                        <>
                          <button
                            type="button"
                            className="btn sm pri"
                            disabled={onayla.isPending}
                            onClick={() =>
                              onayla.mutate({ id: d.id, onay: true }, { onSuccess: () => toast('Değişim onaylandı; iki öğretmene bildirildi.'), onError: hata })
                            }
                          >
                            Onayla
                          </button>
                          <button
                            type="button"
                            className="btn sm"
                            disabled={onayla.isPending}
                            onClick={() =>
                              onayla.mutate({ id: d.id, onay: false }, { onSuccess: () => toast('Onaylanmadı; talep yeniden açıldı.'), onError: hata })
                            }
                          >
                            Reddet
                          </button>
                        </>
                      )}
                    </>
                  ) : benim ? (
                    <span className="m" style={{ fontSize: 13 }}>
                      Bekliyor
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="btn sm pri"
                      disabled={al.isPending}
                      onClick={() => al.mutate(d.id, { onSuccess: () => toast('Teşekkürler! Talep sahibine ve yönetime bildirildi.'), onError: hata })}
                    >
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

function Etkinlikler() {
  const { profile, role } = useAuth()
  const bugun = todayISO()
  const q = useEtkinlikler(bugun)
  const ekle = useEtkinlikEkle()
  const sil = useEtkinlikSil()
  const katil = useEtkinlikKatil()
  const hata = useHata()
  const toast = useToast()
  const [acik, setAcik] = useState(false)
  const [f, setF] = useState({ baslik: '', tarih: addDays(bugun, 1), saat: '', kontenjan: '', aciklama: '' })
  const staff = role === 'admin' || role === 'rehber'
  return (
    <section className="card pn-kart" aria-label="Etkinlikler">
      <div className="kv">
        <h2 className="sec">🗓️ Etkinlikler</h2>
        <button type="button" className="btn sm" aria-expanded={acik} onClick={() => setAcik((x) => !x)}>
          <Icon name="plus" size={16} /> Etkinlik
        </button>
      </div>
      {acik && (
        <form
          className="pn-form"
          onSubmit={(e) => {
            e.preventDefault()
            if (f.baslik.trim().length < 3) return
            ekle.mutate(
              {
                baslik: f.baslik.trim(),
                tarih: f.tarih,
                saat: f.saat.trim() || null,
                kontenjan: f.kontenjan ? Number(f.kontenjan) : null,
                aciklama: f.aciklama.trim() || null,
              },
              {
                onSuccess: () => (setAcik(false), setF((x) => ({ ...x, baslik: '', saat: '', kontenjan: '', aciklama: '' })), toast('Etkinlik panoya eklendi')),
                onError: hata,
              },
            )
          }}
        >
          <label className="field">
            Etkinlik
            <input maxLength={120} placeholder="Ör. Cuma kahvaltısı" value={f.baslik} onChange={(e) => setF({ ...f, baslik: e.target.value })} required />
          </label>
          <div className="pn-izgara">
            <label className="field">
              Tarih
              <input type="date" min={bugun} max={addDays(bugun, 365)} value={f.tarih} onChange={(e) => setF({ ...f, tarih: e.target.value })} required />
            </label>
            <label className="field">
              Saat (isteğe bağlı)
              <input maxLength={20} placeholder="Ör. 08.00" value={f.saat} onChange={(e) => setF({ ...f, saat: e.target.value })} />
            </label>
            <label className="field">
              Kontenjan (isteğe bağlı)
              <input type="number" min={1} max={500} placeholder="Sınırsız" value={f.kontenjan} onChange={(e) => setF({ ...f, kontenjan: e.target.value })} />
            </label>
          </div>
          <label className="field">
            Not (isteğe bağlı)
            <input maxLength={300} placeholder="Ör. Herkes bir şey getirsin" value={f.aciklama} onChange={(e) => setF({ ...f, aciklama: e.target.value })} />
          </label>
          <button type="submit" className="btn pri" disabled={f.baslik.trim().length < 3 || ekle.isPending}>
            Etkinliği as
          </button>
        </form>
      )}
      {q.isLoading ? (
        <p className="m">Yükleniyor…</p>
      ) : !q.data?.length ? (
        <p className="m">Yaklaşan etkinlik yok. Kahvaltı, gezi ya da gönüllü aradığın bir iş için etkinlik aç.</p>
      ) : (
        <ul className="pn-liste">
          {q.data.map((e) => {
            const n = e.oda_etkinlik_katilim.length
            const katiliyorum = e.oda_etkinlik_katilim.some((k) => k.user_id === profile?.id)
            const dolu = e.kontenjan != null && n >= e.kontenjan
            return (
              <li key={e.id}>
                <div className="pn-satir-bas">
                  <b>{e.baslik}</b>
                  <span className="chip n">
                    {trDW(e.tarih)}
                    {e.saat ? ` · ${e.saat}` : ''}
                  </span>
                </div>
                <span className="m" style={{ fontSize: 13 }}>
                  {e.acan_p?.full_name ?? 'Ayrılmış öğretmen'}
                  {e.aciklama ? ` — ${e.aciklama}` : ''}
                </span>
                <span style={{ fontSize: 14 }}>
                  <b className="mono">{e.kontenjan != null ? `${n}/${e.kontenjan}` : n}</b> katılıyor
                  {n > 0 && <span className="m">: {e.oda_etkinlik_katilim.map((k) => k.p?.full_name ?? 'Bir öğretmen').join(', ')}</span>}
                </span>
                <div className="pn-satir-alt">
                  {katiliyorum ? (
                    <>
                      <span className="chip up">✓ Katılıyorsun</span>
                      <button
                        type="button"
                        className="btn ghost sm"
                        disabled={katil.isPending}
                        onClick={() => katil.mutate({ id: e.id, katil: false }, { onError: hata })}
                      >
                        Vazgeç
                      </button>
                    </>
                  ) : dolu ? (
                    <span className="chip n">Kontenjan doldu</span>
                  ) : (
                    <button
                      type="button"
                      className="btn sm pri"
                      disabled={katil.isPending}
                      onClick={() => katil.mutate({ id: e.id, katil: true }, { onError: hata })}
                    >
                      Katılıyorum
                    </button>
                  )}
                  {(e.acan === profile?.id || staff) && (
                    <button type="button" className="btn ghost sm" onClick={() => sil.mutate(e.id, { onError: hata })}>
                      Etkinliği kaldır
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

function OneriKutusu() {
  const gonder = useOneriGonder()
  const hata = useHata()
  const toast = useToast()
  const [metin, setMetin] = useState('')
  return (
    <section className="card pn-kart" aria-label="Öneri kutusu">
      <h2 className="sec">📮 Öneri kutusu</h2>
      <p className="m" style={{ fontSize: 13, margin: 0 }}>
        Yönetime adsız öneri bırak. Adın kaydedilmez; yönetim yalnız metni ve günü görür.
      </p>
      <form
        className="pn-form"
        onSubmit={(e) => {
          e.preventDefault()
          if (metin.trim().length < 5) return
          gonder.mutate(metin.trim(), { onSuccess: () => (setMetin(''), toast('Önerin adsız olarak yönetime iletildi')), onError: hata })
        }}
      >
        <label className="field">
          Önerin
          <textarea
            maxLength={1000}
            value={metin}
            onChange={(e) => setMetin(e.target.value)}
            placeholder="Ör. Öğretmenler odasına ikinci bir yazıcı çok işe yarar."
          />
        </label>
        <button type="submit" className="btn pri" disabled={metin.trim().length < 5 || gonder.isPending}>
          Adsız gönder
        </button>
      </form>
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
              <input
                maxLength={80}
                placeholder={`${i + 1}. seçenek`}
                value={s}
                onChange={(e) => setSecenekler(secenekler.map((x, j) => (j === i ? e.target.value : x)))}
              />
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

/** Haftalık lig kürsüsü: 1. ortada ve en yüksek, 2. solda, 3. sağda (olimpiyat kürsüsü). Hafta bitince otomatik. */
function LigKursusu() {
  const q = useLigKursu()
  const satirlar = q.data ?? []
  if (!satirlar.length) return null
  const hafta = satirlar[0]!.hafta
  // İki haftadan eski kürsü gösterilmez (o hafta kimse oynamadıysa eski kazananlar kalmasın)
  if (addDays(hafta, 14) < todayISO()) return null
  const basamak = (s: number) => satirlar.filter((x) => x.sira === s)
  const BASAMAK = [
    { s: 2, madalya: '🥈', ad: 'Haftanın ikincisi' },
    { s: 1, madalya: '🥇', ad: 'Haftanın birincisi' },
    { s: 3, madalya: '🥉', ad: 'Haftanın üçüncüsü' },
  ]
  return (
    <div className="pn-kursu" data-testid="lig-kursu">
      <span className="chip gold">
        🏆 Haftalık lig · {trDM(hafta)} – {trDM(addDays(hafta, 6))}
      </span>
      <ol className="pn-kursu-basamaklar" aria-label="Haftalık lig kürsüsü">
        {BASAMAK.map((b) => {
          const kisiler = basamak(b.s)
          return (
            <li key={b.s} className={`pn-basamak b${b.s}`} aria-label={`${b.ad}: ${kisiler.map((k) => k.ad).join(', ') || 'yok'}`}>
              <div className="pn-kursu-kisi">
                <span className="pn-madalya" aria-hidden="true">
                  {b.madalya}
                </span>
                {kisiler.length ? (
                  kisiler.map((k) => (
                    <b key={k.user_id} className="pn-kursu-ad">
                      {k.ad}
                    </b>
                  ))
                ) : (
                  <span className="m">—</span>
                )}
                {kisiler[0] && (
                  <span className="m mono" style={{ fontSize: 12 }}>
                    {kisiler[0].puan} puan
                  </span>
                )}
              </div>
              <div className="pn-kursu-blok" aria-hidden="true">
                {b.s}
              </div>
            </li>
          )
        })}
      </ol>
    </div>
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
            ekle.mutate(
              { alan, metin: metin.trim() },
              { onSuccess: () => (setAcik(false), setAlan(''), setMetin(''), toast('Teşekkür kartın gönderildi')), onError: hata },
            )
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
      <LigKursusu />
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
                <KisiSimge ad={t.alan_p?.full_name ?? '?'} avatar={t.alan_p?.avatar} />
                <div style={{ minWidth: 0 }}>
                  <span style={{ fontSize: 13 }}>
                    <b>{t.gonderen_p?.full_name ?? 'Bir öğretmen'}</b> → <b>{t.alan_p?.full_name ?? 'Ayrılmış öğretmen'}</b>
                    <span className="m"> · {ago(t.created_at)}</span>
                  </span>
                  <p>{t.metin}</p>
                  <div className="pn-satir-alt">
                    <button
                      type="button"
                      className="oda-tepki"
                      aria-pressed={benim}
                      aria-label={`Alkışla, ${t.oda_tesekkur_alkis.length}`}
                      onClick={() => alkis.mutate({ id: t.id, var: benim }, { onError: hata })}
                    >
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
