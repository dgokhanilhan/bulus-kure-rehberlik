import { useState } from 'react'
import { Seg } from '@/components/Indicator'
import { skorYaz, type OyunId } from '@/lib/oyunlar'
import { useSkorTablosu } from '@/lib/oyunData'
import { initials } from '@/lib/format'

export function SkorTablosu({ oyun }: { oyun: OyunId }) {
  const [donem, setDonem] = useState<'gun' | 'hafta'>(oyun === 'sudoku' || oyun === 'kelime' ? 'gun' : 'hafta')
  const q = useSkorTablosu(oyun, donem)
  return (
    <section className="card oy-tablo" aria-label="Skor tablosu">
      <div className="kv">
        <h2 className="sec">Skor tablosu</h2>
        <Seg label="Dönem" value={donem} onChange={setDonem} options={[['gun', 'Bugün'], ['hafta', 'Bu hafta']] as const} />
      </div>
      {q.isLoading ? (
        <p className="m">Yükleniyor…</p>
      ) : q.isError ? (
        <p className="m">Skor tablosu yüklenemedi.</p>
      ) : !q.data?.length ? (
        <p className="m">{donem === 'gun' ? 'Bugün henüz kimse bitirmedi. İlk sen ol!' : 'Bu hafta henüz skor yok.'}</p>
      ) : (
        <ol className="oy-sira">
          {q.data.map((r) => (
            <li key={r.user_id} className={r.ben ? 'ben' : ''}>
              <span className={`oy-no${r.sira <= 3 ? ` s${r.sira}` : ''}`}>{r.sira <= 3 ? ['🥇', '🥈', '🥉'][r.sira - 1] : r.sira}</span>
              <span className="av s" aria-hidden="true">
                {initials(r.ad)}
              </span>
              <span className="oy-ad">
                {r.ad}
                {r.ben && <span className="m"> (sen)</span>}
              </span>
              <b className="mono">{skorYaz(oyun, r.puan)}</b>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
