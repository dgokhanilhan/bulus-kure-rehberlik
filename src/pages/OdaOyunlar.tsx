// Öğretmenler Odası → Oyunlar: haftalık lig, oyunlar, skor tabloları ve rozetler (0069). Yalnız öğretmenler.
// Hangi oyunların açık olduğu okul ayarıdır (oda.oyun.*, 0072); kapalı oyun listede ve rozetlerde görünmez.
import { lazy, Suspense } from 'react'
import { useSearchParams } from 'react-router-dom'
import { OYUNLAR, ROZETLER, seri, skorYaz, type OyunId } from '@/lib/oyunlar'
import { useLig, useOyunGizli, useOyunIstatistik, useSkorTablosu } from '@/lib/oyunData'
import { initials, todayISO } from '@/lib/format'
import { Icon } from '@/components/Icon'
import { useAyar } from '@/lib/ayarlar'
import { SkorTablosu } from './oyun/SkorTablosu'

const OYUN: Record<OyunId, React.LazyExoticComponent<() => JSX.Element>> = {
  sudoku: lazy(() => import('./oyun/Sudoku')),
  kelime: lazy(() => import('./oyun/Kelime')),
  yilan: lazy(() => import('./oyun/Yilan')),
  sprint: lazy(() => import('./oyun/Sprint')),
  mayin: lazy(() => import('./oyun/Mayin')),
  hafiza: lazy(() => import('./oyun/Hafiza')),
}
const SIMGE: Record<OyunId, string> = { sudoku: '🧩', kelime: '🔤', yilan: '🐍', sprint: '⚡', mayin: '💣', hafiza: '🃏' }

export default function OdaOyunlar() {
  const [sp, setSp] = useSearchParams()
  const ayar = useAyar()
  const acik = OYUNLAR.filter((o) => ayar.bool(`oda.oyun.${o.id}`))
  const secili = acik.find((o) => o.id === sp.get('oyun'))?.id ?? null
  const ac = (o: OyunId | null) => setSp(o ? { sekme: 'oyunlar', oyun: o } : { sekme: 'oyunlar' })

  if (secili) {
    const Oyun = OYUN[secili]
    const o = OYUNLAR.find((x) => x.id === secili)!
    return (
      <div className="oy-sayfa">
        <div className="oy-bas">
          <button type="button" className="btn ghost" onClick={() => ac(null)}>
            <Icon name="back" size={18} /> Oyunlar
          </button>
          <h2 className="sec">
            {SIMGE[secili]} {o.ad}
          </h2>
        </div>
        <div className="oy-duzen">
          <section className="card oy-oyun">
            <p className="m" style={{ margin: 0, fontSize: 14 }}>
              {o.aciklama}
            </p>
            <Suspense fallback={<p className="m">Yükleniyor…</p>}>
              <Oyun />
            </Suspense>
          </section>
          <SkorTablosu oyun={secili} />
        </div>
      </div>
    )
  }
  return <OyunMerkezi onAc={ac} acik={acik.map((o) => o.id)} />
}

function OyunMerkezi({ onAc, acik }: { onAc: (o: OyunId) => void; acik: OyunId[] }) {
  const lig = useLig()
  const ist = useOyunIstatistik()
  const gizli = useOyunGizli()
  const s = ist.data ? seri(ist.data.gunler, todayISO()) : 0
  const ben = lig.data?.find((r) => r.ben)

  return (
    <div className="oy-merkez">
      <div className="oy-duzen">
        <div className="oy-kartlar">
          {acik.map((id) => (
            <OyunKarti key={id} id={id} onAc={() => onAc(id)} />
          ))}
          {!acik.length && <div className="empty">Okulda şu an açık oyun yok.</div>}
        </div>
        <section className="card oy-lig" aria-label="Haftalık lig">
          <div className="kv">
            <h2 className="sec">🏆 Haftalık lig</h2>
            <span className="m" style={{ fontSize: 12 }}>
              Pazartesi sıfırlanır
            </span>
          </div>
          <p className="m" style={{ fontSize: 13, margin: 0 }}>
            Her oyunun haftalık sıralamasında 1. 10, 2. 8, 3. 6, 4. 5, 5. 4 puan; oynayan herkes 2 puan alır.
          </p>
          {lig.isLoading ? (
            <p className="m">Yükleniyor…</p>
          ) : !lig.data?.length ? (
            <p className="m">Bu hafta henüz kimse oynamadı.</p>
          ) : (
            <ol className="oy-sira">
              {lig.data.slice(0, 10).map((r) => (
                <li key={r.user_id} className={r.ben ? 'ben' : ''}>
                  <span className={`oy-no${r.sira <= 3 ? ` s${r.sira}` : ''}`}>{r.sira <= 3 ? ['🥇', '🥈', '🥉'][r.sira - 1] : r.sira}</span>
                  <span className="av s" aria-hidden="true">
                    {initials(r.ad)}
                  </span>
                  <span className="oy-ad">
                    {r.ad}
                    {r.ben && <span className="m"> (sen)</span>}
                  </span>
                  <b className="mono">{r.puan}</b>
                </li>
              ))}
            </ol>
          )}
          {ben && ben.sira > 10 && (
            <p style={{ margin: 0, fontSize: 14 }}>
              Sen: <b>{ben.sira}.</b> sıradasın ({ben.puan} puan)
            </p>
          )}
          <label className="oy-gizli">
            <input type="checkbox" checked={gizli.gizli} disabled={gizli.yukleniyor || gizli.kaydediliyor} onChange={(e) => gizli.ayarla(e.target.checked)} />
            <span>Adımı skor tablolarında gösterme</span>
          </label>
        </section>
      </div>
      <section className="card oy-rozet" aria-label="Rozetlerim">
        <div className="kv">
          <h2 className="sec">Rozetlerim</h2>
          {s > 0 && <span className="chip gold">🔥 {s} gün üst üste</span>}
        </div>
        <ul className="oy-rozetler">
          {ROZETLER.filter((r) => !r.oyun || acik.includes(r.oyun)).map((r) => {
            const var_ = !!ist.data && r.kosul(ist.data, s, acik.length)
            return (
              <li key={r.id} className={var_ ? 'var' : ''} title={r.aciklama}>
                <span className="oy-rozet-simge" aria-hidden="true">
                  {var_ ? r.simge : '🔒'}
                </span>
                <b>{r.ad}</b>
                <span className="m">{r.aciklama}</span>
                <span className="sr-only">{var_ ? 'kazanıldı' : 'henüz kazanılmadı'}</span>
              </li>
            )
          })}
        </ul>
      </section>
    </div>
  )
}

function OyunKarti({ id, onAc }: { id: OyunId; onAc: () => void }) {
  const o = OYUNLAR.find((x) => x.id === id)!
  const t = useSkorTablosu(id, o.gunluk ? 'gun' : 'hafta')
  const ben = t.data?.find((r) => r.ben)
  const lider = t.data?.[0]
  return (
    <button type="button" className="card oy-kart" onClick={onAc}>
      <span className="oy-simge" aria-hidden="true">
        {SIMGE[id]}
      </span>
      <b>{o.ad}</b>
      <span className="m oy-aciklama">{o.aciklama}</span>
      <span className="oy-durum">
        {o.gunluk ? (
          ben ? (
            <span className="chip up">✓ Bugün: {skorYaz(id, ben.puan)}</span>
          ) : (
            <span className="chip gold">Bugün oynanmadı</span>
          )
        ) : ben ? (
          <span className="chip n">En iyin: {skorYaz(id, ben.puan)}</span>
        ) : null}
        {lider && !lider.ben && (
          <span className="m" style={{ fontSize: 12 }}>
            🥇 {lider.ad.split(' ')[0]} · {skorYaz(id, lider.puan)}
          </span>
        )}
      </span>
    </button>
  )
}
