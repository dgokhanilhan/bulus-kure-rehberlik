// 5 Soruda Bugün: her gün beş genel kültür sorusu; o güne özel soru varsa ilk sıradadır. Sorular ve doğru cevaplar
// sunucudan gelir (0073): bir sorunun doğrusu ancak cevaplandıktan sonra tarayıcıya ulaşır.
import { useState } from 'react'
import { useSoru, useSoruCevap } from '@/lib/oyunData'
import { useToast } from '@/components/Toast'

const HARF = ['A', 'B', 'C', 'D']

export default function Soru() {
  const q = useSoru(true)
  const cevapla = useSoruCevap()
  const toast = useToast()
  // Cevaplanan sorunun sonucu, "Sonraki soru"ya basılana kadar ekranda kalır
  const [bekleyen, setBekleyen] = useState<number | null>(null)
  const d = q.data

  if (q.isLoading) return <p className="m">Yükleniyor…</p>
  if (q.isError || !d) return <div className="empty">Oyun açılamadı. Sayfayı yenile.</div>

  const n = d.sorular.length
  const cevaplanan = d.sorular.filter((s) => s.cevap != null).length
  const dogruSayisi = d.sorular.filter((s) => s.cevap != null && s.cevap === s.dogru).length
  const bitti = !!d.bitti && bekleyen == null
  const i = bekleyen ?? Math.min(cevaplanan, n - 1)
  const s = d.sorular[i]!
  const sec = (k: number) => {
    if (cevapla.isPending || s.cevap != null) return
    cevapla.mutate(k, { onSuccess: () => setBekleyen(i), onError: (e) => toast((e as Error).message, 'warn') })
  }

  return (
    <div className="oy-soru">
      <div className="oy-ust">
        <ol className="sr-adim" aria-label="Sorular">
          {d.sorular.map((x, j) => (
            <li key={j} className={x.cevap == null ? (j === i && !bitti ? 'simdi' : '') : x.cevap === x.dogru ? 'dogru' : 'yanlis'}>
              <span aria-hidden="true">{x.cevap == null ? j + 1 : x.cevap === x.dogru ? '✓' : '✗'}</span>
              <span className="sr-only">
                {j + 1}. soru: {x.cevap == null ? 'cevaplanmadı' : x.cevap === x.dogru ? 'doğru' : 'yanlış'}
              </span>
            </li>
          ))}
        </ol>
        <span className="chip up mono">✓ {dogruSayisi}</span>
      </div>

      {bitti ? (
        <>
          <p className="kl-sonuc">
            Bugün {n} soruda <b>{d.puan ?? dogruSayisi}</b> doğru. Yarın yeni sorular!
          </p>
          <ol className="sr-ozet">
            {d.sorular.map((x, j) => (
              <li key={j}>
                <span>{x.soru}</span>
                <span className={x.cevap === x.dogru ? 'sr-d' : 'sr-y'}>
                  {x.cevap === x.dogru ? '✓' : '✗'} {x.dogru != null ? x.secenekler[x.dogru - 1] : ''}
                  {x.cevap !== x.dogru && x.cevap != null && <span className="m"> · senin cevabın: {x.secenekler[x.cevap - 1]}</span>}
                </span>
              </li>
            ))}
          </ol>
        </>
      ) : (
        <section className="sr-kart" aria-live="polite">
          <p className="m" style={{ margin: 0, fontSize: 13 }}>
            Soru {i + 1} / {n}
          </p>
          <h3 className="sr-soru">{s.soru}</h3>
          <div className="sr-secenekler" role="group" aria-label="Seçenekler">
            {s.secenekler.map((metin, k) => {
              const no = k + 1
              const durum = s.cevap == null ? '' : no === s.dogru ? ' dogru' : no === s.cevap ? ' yanlis' : ' soluk'
              return (
                <button key={k} type="button" className={`sr-secenek${durum}`} disabled={s.cevap != null || cevapla.isPending} onClick={() => sec(no)}>
                  <span className="sr-harf mono" aria-hidden="true">
                    {s.cevap != null && no === s.dogru ? '✓' : s.cevap != null && no === s.cevap ? '✗' : HARF[k]}
                  </span>
                  <span>{metin}</span>
                  {s.cevap != null && no === s.dogru && <span className="sr-only"> (doğru cevap)</span>}
                  {s.cevap != null && no === s.cevap && no !== s.dogru && <span className="sr-only"> (senin cevabın, yanlış)</span>}
                </button>
              )
            })}
          </div>
          {s.cevap != null && (
            <div className="sr-alt">
              <b>{s.cevap === s.dogru ? 'Doğru!' : `Doğru cevap: ${s.secenekler[(s.dogru ?? 1) - 1]}`}</b>
              <button type="button" className="btn pri" onClick={() => setBekleyen(null)}>
                {cevaplanan >= n ? 'Sonucu gör' : 'Sonraki soru'}
              </button>
            </div>
          )}
        </section>
      )}
    </div>
  )
}
