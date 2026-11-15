// Öğrenci desteği (0076): Yanlış defteri ve Çözemedim. Öğrenci/veli özet sayfasında; öğretmen tarafı Öğretmenler Odası'nda.
import { useMemo, useRef, useState } from 'react'
import { repeats, subjectOf, type Dataset } from '@/lib/analiz'
import { defterKur, SORU_DERSLER, TEKRAR_GUN } from '@/lib/destek'
import { useKonuCalisma, useKonuIsaretle, useSoruFoto, useSoruGonder, useSoruSil, useSoruTalepler, useSoruYanitla, type SoruTalep } from '@/lib/destekData'
import { ago } from '@/lib/format'
import { useAuth } from '@/auth/AuthProvider'
import { Icon } from './Icon'
import { Modal } from './Modal'
import { useToast } from './Toast'

/** Defterde ilk bakışta gösterilen konu sayısı (uzun liste yormasın) */
const DEFTER_ILK = 6
const DURUM_TR = { yeni: 'Öğretmenin bakması bekleniyor', goruldu: 'Öğretmenin gördü', cozuldu: 'Yanıtlandı' } as const

/** Yanlış defteri: denemelerde tekrar eden hatalı konular. Öğrenci "çalıştım" der; sıralama ya da kıyas yok, yalnız kendi konuları. */
export function YanlisDefteri({ ds, sid, veli }: { ds: Dataset; sid: string; veli: boolean }) {
  const isaretler = useKonuCalisma(sid)
  const isaretle = useKonuIsaretle(sid)
  const toast = useToast()
  const [hepsi, setHepsi] = useState(false)
  const satirlar = useMemo(() => defterKur(repeats(ds, sid), isaretler.data ?? new Map(), (k) => subjectOf(ds, k).ad), [ds, sid, isaretler.data])
  if (isaretler.isLoading) return null
  const calisilacak = satirlar.filter((x) => x.durum !== 'tamam').length
  return (
    <section className="card a ds-kart" aria-label="Yanlış defteri">
      <div className="kv">
        <h2 className="sec">📒 Yanlış defteri</h2>
        {satirlar.length > 0 && <span className="chip n">{calisilacak ? `${calisilacak} konu bekliyor` : 'Hepsi çalışıldı'}</span>}
      </div>
      <p className="m" style={{ fontSize: 13, margin: 0 }}>
        {veli
          ? 'Denemelerde birden çok kez yanlış çıkan konular. Öğrenci çalıştıkça işaretler.'
          : `Denemelerde birden çok kez yanlış çıkan konuların. Çalıştıkça işaretle; ${TEKRAR_GUN} gün sonra yeniden bakman için hatırlatırım.`}
      </p>
      {!satirlar.length ? (
        <p className="m">Tekrar eden hatalı konu yok.</p>
      ) : (
        <ul className="ds-liste">
          {(hepsi ? satirlar : satirlar.slice(0, DEFTER_ILK)).map((x) => (
            <li key={x.konu} className={x.durum === 'tamam' ? 'tamam' : ''}>
              <div className="ds-govde">
                <b>{x.baslik}</b>
                <span className="m" style={{ fontSize: 13 }}>
                  {x.ders} · {x.sayi} denemede yanlış
                  {x.durum === 'tekrar' ? ' · yeniden bakma zamanı' : x.calistiAt ? ` · ${ago(x.calistiAt)} çalışıldı` : ''}
                </span>
              </div>
              {veli ? (
                <span className={`chip ${x.durum === 'calis' ? 'n' : 'up'}`}>{x.durum === 'calis' ? 'Henüz işaretlenmedi' : '✓ Çalışıldı'}</span>
              ) : x.durum === 'calis' ? (
                <button
                  type="button"
                  className="btn sm pri"
                  disabled={isaretle.isPending}
                  onClick={() =>
                    isaretle.mutate(
                      { konu: x.konu, calisti: true },
                      { onSuccess: () => toast('Harika, işaretlendi'), onError: (e) => toast((e as Error).message, 'warn') },
                    )
                  }
                >
                  Çalıştım
                </button>
              ) : (
                <span className="ds-islem">
                  {x.durum === 'tekrar' ? (
                    <button
                      type="button"
                      className="btn sm"
                      disabled={isaretle.isPending}
                      onClick={() =>
                        isaretle.mutate(
                          { konu: x.konu, calisti: true },
                          { onSuccess: () => toast('Yeniden çalışıldı olarak işaretlendi'), onError: (e) => toast((e as Error).message, 'warn') },
                        )
                      }
                    >
                      Yeniden çalıştım
                    </button>
                  ) : (
                    <span className="chip up">✓ Çalışıldı</span>
                  )}
                  <button
                    type="button"
                    className="btn ghost sm"
                    aria-label={`${x.baslik}: işareti kaldır`}
                    disabled={isaretle.isPending}
                    onClick={() => isaretle.mutate({ konu: x.konu, calisti: false })}
                  >
                    <Icon name="x" size={16} />
                  </button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      {satirlar.length > DEFTER_ILK && (
        <button type="button" className="btn sm" style={{ alignSelf: 'flex-start' }} aria-expanded={hepsi} onClick={() => setHepsi((x) => !x)}>
          {hepsi ? 'Daha az göster' : `Hepsini göster (${satirlar.length})`}
        </button>
      )}
    </section>
  )
}

function Foto({ yol, alt }: { yol: string; alt: string }) {
  const q = useSoruFoto(yol)
  if (q.isLoading) return <span className="ds-foto bos">Yükleniyor…</span>
  if (q.isError || !q.data) return <span className="ds-foto bos">Fotoğraf açılamadı</span>
  return (
    <a href={q.data} target="_blank" rel="noreferrer" className="ds-foto" aria-label={`${alt}: fotoğrafı büyüt`}>
      <img src={q.data} alt={alt} loading="lazy" />
    </a>
  )
}

/** Çözemedim: öğrenci/veli fotoğrafla soru gönderir, yanıtı burada görür */
export function Cozemedim({ sid, veli }: { sid: string; veli: boolean }) {
  const { profile } = useAuth()
  const q = useSoruTalepler(sid)
  const gonder = useSoruGonder(profile?.school_id ?? undefined, sid)
  const sil = useSoruSil()
  const toast = useToast()
  const [acik, setAcik] = useState(false)
  const [ders, setDers] = useState('')
  const [aciklama, setAciklama] = useState('')
  const [dosya, setDosya] = useState<File | null>(null)
  const girdi = useRef<HTMLInputElement>(null)
  return (
    <section className="card a ds-kart" aria-label="Çözemedim">
      <div className="kv">
        <h2 className="sec">🙋 Çözemedim</h2>
        <button type="button" className="btn sm" aria-expanded={acik} onClick={() => setAcik((x) => !x)}>
          <Icon name="plus" size={16} /> Soru gönder
        </button>
      </div>
      <p className="m" style={{ fontSize: 13, margin: 0 }}>
        {veli
          ? 'Çözülemeyen sorunun fotoğrafını gönderin; dersin öğretmeni görür ve yanıtlar.'
          : 'Çözemediğin sorunun fotoğrafını çek, dersini seç; öğretmenin görür ve yanıtlar.'}
      </p>
      {acik && (
        <form
          className="pn-form"
          onSubmit={(e) => {
            e.preventDefault()
            if (!dosya || !ders) return
            gonder.mutate(
              { dosya, ders, aciklama },
              {
                onSuccess: () => {
                  setAcik(false)
                  setDosya(null)
                  setAciklama('')
                  if (girdi.current) girdi.current.value = ''
                  toast(veli ? 'Soru öğretmene iletildi' : 'Sorun öğretmenine iletildi')
                },
                onError: (err) => toast((err as Error).message, 'warn'),
              },
            )
          }}
        >
          <label className="field">
            Ders
            <select value={ders} onChange={(e) => setDers(e.target.value)} required>
              <option value="">Ders seç…</option>
              {SORU_DERSLER.map((d) => (
                <option key={d}>{d}</option>
              ))}
            </select>
          </label>
          <label className="field">
            Sorunun fotoğrafı
            <input
              ref={girdi}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              capture="environment"
              onChange={(e) => setDosya(e.target.files?.[0] ?? null)}
              required
            />
          </label>
          <label className="field">
            Not (isteğe bağlı)
            <input maxLength={300} placeholder="Ör. Test kitabı sayfa 42, soru 7" value={aciklama} onChange={(e) => setAciklama(e.target.value)} />
          </label>
          <button type="submit" className="btn pri" disabled={!dosya || !ders || gonder.isPending}>
            {gonder.isPending ? 'Gönderiliyor…' : 'Gönder'}
          </button>
        </form>
      )}
      {q.isLoading ? (
        <p className="m">Yükleniyor…</p>
      ) : !q.data?.length ? (
        <p className="m">Henüz gönderilmiş soru yok.</p>
      ) : (
        <ul className="ds-liste">
          {q.data.map((t) => (
            <li key={t.id} className="ds-soru">
              <Foto yol={t.foto} alt={`${t.ders} sorusu`} />
              <div className="ds-govde">
                <b>{t.ders}</b>
                <span className="m" style={{ fontSize: 13 }}>
                  {ago(t.created_at)}
                  {t.aciklama ? ` · ${t.aciklama}` : ''}
                </span>
                <span className={`chip ${t.durum === 'cozuldu' ? 'up' : 'n'}`} style={{ alignSelf: 'flex-start' }}>
                  {t.durum === 'cozuldu' ? '✓ ' : ''}
                  {DURUM_TR[t.durum]}
                </span>
                {t.yanit && (
                  <p className="ds-yanit">
                    <b>{t.yanitlayan_p?.full_name ?? 'Öğretmen'}:</b> {t.yanit}
                  </p>
                )}
                {t.durum === 'yeni' && t.created_by === profile?.id && (
                  <button
                    type="button"
                    className="btn ghost sm"
                    style={{ alignSelf: 'flex-start' }}
                    disabled={sil.isPending}
                    onClick={() => sil.mutate(t, { onError: (e) => toast((e as Error).message, 'warn') })}
                  >
                    Geri çek
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/** Öğretmen: görebildiği öğrencilerin gönderdiği sorular (Öğretmenler Odası girişi) */
export function SoruTalepleri({ adOf }: { adOf: (sid: string) => string }) {
  const q = useSoruTalepler()
  const [secili, setSecili] = useState<SoruTalep | null>(null)
  const acik = (q.data ?? []).filter((t) => t.durum !== 'cozuldu')
  if (q.isLoading || q.isError || !q.data?.length) return null
  return (
    <section className="card a ds-kart" aria-label="Öğrencilerin çözemediği sorular">
      <div className="kv">
        <h2 className="sec">🙋 Çözemedim soruları</h2>
        <span className={`chip ${acik.length ? 'gold' : 'n'}`}>{acik.length ? `${acik.length} yanıt bekliyor` : 'Bekleyen yok'}</span>
      </div>
      <ul className="ds-liste">
        {q.data.slice(0, 12).map((t) => (
          <li key={t.id}>
            <div className="ds-govde">
              <b>
                {adOf(t.student_id)} · {t.ders}
              </b>
              <span className="m" style={{ fontSize: 13 }}>
                {ago(t.created_at)}
                {t.aciklama ? ` · ${t.aciklama}` : ''}
              </span>
            </div>
            <span className={`chip ${t.durum === 'cozuldu' ? 'up' : t.durum === 'yeni' ? 'gold' : 'n'}`}>
              {t.durum === 'cozuldu' ? '✓ Yanıtlandı' : t.durum === 'yeni' ? 'Yeni' : 'Görüldü'}
            </span>
            <button type="button" className="btn sm" onClick={() => setSecili(t)}>
              Aç
            </button>
          </li>
        ))}
      </ul>
      {secili && <SoruModal t={secili} ad={adOf(secili.student_id)} onClose={() => setSecili(null)} />}
    </section>
  )
}

function SoruModal({ t, ad, onClose }: { t: SoruTalep; ad: string; onClose: () => void }) {
  const yanitla = useSoruYanitla()
  const toast = useToast()
  const [yanit, setYanit] = useState(t.yanit ?? '')
  const gonder = (durum: 'goruldu' | 'cozuldu') =>
    yanitla.mutate(
      { id: t.id, durum, yanit: yanit.trim() || undefined },
      {
        onSuccess: () => (toast(durum === 'cozuldu' ? 'Yanıtın öğrenciye iletildi' : 'Görüldü olarak işaretlendi'), onClose()),
        onError: (e) => toast((e as Error).message, 'warn'),
      },
    )
  return (
    <Modal title={`${ad} · ${t.ders}`} sub={t.aciklama ?? undefined} width={560} onClose={onClose}>
      <Foto yol={t.foto} alt={`${ad}, ${t.ders} sorusu`} />
      <label className="field" style={{ marginTop: 12 }}>
        Yanıtın (isteğe bağlı)
        <textarea
          maxLength={500}
          value={yanit}
          onChange={(e) => setYanit(e.target.value)}
          placeholder="Ör. Önce paydaları eşitle; yarın teneffüste birlikte bakalım."
        />
      </label>
      <div className="btns" style={{ marginTop: 12 }}>
        <button type="button" className="btn pri" disabled={yanitla.isPending} onClick={() => gonder('cozuldu')}>
          Yanıtla ve kapat
        </button>
        {t.durum === 'yeni' && (
          <button type="button" className="btn" disabled={yanitla.isPending} onClick={() => gonder('goruldu')}>
            Gördüm, sonra bakacağım
          </button>
        )}
      </div>
    </Modal>
  )
}
