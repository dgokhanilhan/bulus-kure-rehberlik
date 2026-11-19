// 5 Soruda Bugün: her gün beş genel kültür sorusu; o güne özel soru varsa ilk sıradadır. Sorular ve doğru cevaplar
// sunucudan gelir (0073): bir sorunun doğrusu ancak cevaplandıktan sonra tarayıcıya ulaşır.
// Süreli günlerde (0087) 1 dakika vardır: süre "Başla"ya basınca başlar ve sunucuda ölçülür; dolunca cevap alınmaz,
// o ana kadarki doğrular kaydedilir.
import { useEffect, useRef, useState } from 'react'
import { useSoru, useSoruBasla, useSoruCevap } from '@/lib/oyunData'
import { sureYaz } from '@/lib/oyunlar'
import { useToast } from '@/components/Toast'

const HARF = ['A', 'B', 'C', 'D']

export default function Soru() {
  const q = useSoru(true)
  const basla = useSoruBasla()
  const cevapla = useSoruCevap()
  const toast = useToast()
  // Cevaplanan sorunun sonucu, "Sonraki soru"ya basılana kadar ekranda kalır
  const [bekleyen, setBekleyen] = useState<number | null>(null)
  const [simdi, setSimdi] = useState(Date.now())
  const bitis = useRef<number | null>(null)
  const d = q.data
  const sureli = !!d?.sure && !d.baslamadi && !d.bitti

  // Sunucunun söylediği kalan süreye göre bitiş anı; her yanıtta yeniden eşitlenir
  useEffect(() => {
    bitis.current = d?.kalan != null && !d.bitti ? Date.now() + d.kalan * 1000 : null
    setSimdi(Date.now())
  }, [d])
  useEffect(() => {
    if (!sureli) return
    const t = setInterval(() => setSimdi(Date.now()), 250)
    return () => clearInterval(t)
  }, [sureli])
  const kalan = bitis.current == null ? null : Math.max(0, Math.ceil((bitis.current - simdi) / 1000))
  const doldu = sureli && kalan === 0
  // Süre bitince sunucudan son durumu al (oyunu sunucu kapatır, o ana kadarki doğrular kaydedilir)
  const { isFetching, refetch } = q
  useEffect(() => {
    if (!doldu || isFetching) return
    setBekleyen(null)
    const t = setTimeout(() => void refetch(), 300)
    return () => clearTimeout(t)
  }, [doldu, isFetching, refetch])

  if (q.isLoading) return <p className="m">Yükleniyor…</p>
  if (q.isError || !d) return <div className="empty">Oyun açılamadı. Sayfayı yenile.</div>

  if (d.baslamadi) {
    return (
      <div className="oy-soru">
        <section className="sr-kart">
          <h3 className="sr-soru">Beş soru, {sureYaz(d.sure ?? 60)} süre</h3>
          <p className="m" style={{ margin: 0 }}>
            Süre “Başla”ya bastığında başlar. Süre bitince yeni cevap verilemez; o ana kadarki doğru ve yanlışların kaydedilir.
          </p>
          <button
            type="button"
            className="btn pri"
            disabled={basla.isPending}
            onClick={() => basla.mutate(undefined, { onError: (e) => toast((e as Error).message, 'warn') })}
          >
            Başla
          </button>
        </section>
      </div>
    )
  }

  const n = d.sorular.length
  const cevaplanan = d.sorular.filter((s) => s.cevap != null).length
  const dogruSayisi = d.sorular.filter((s) => s.cevap != null && s.cevap === s.dogru).length
  const bitti = !!d.bitti && bekleyen == null
  const i = bekleyen ?? Math.min(cevaplanan, n - 1)
  const s = d.sorular[i]!
  const kilitli = cevapla.isPending || doldu
  const sec = (k: number) => {
    if (kilitli || s.cevap != null) return
    cevapla.mutate(k, {
      onSuccess: (r) => {
        if (r.sure_doldu) {
          setBekleyen(null)
          toast('Süre doldu; bu cevap sayılmadı', 'warn')
        } else setBekleyen(i)
      },
      onError: (e) => toast((e as Error).message, 'warn'),
    })
  }
  const sureBitti = !!d.sure && cevaplanan < n

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
        {sureli && kalan != null && (
          <span className={`chip mono ${kalan <= 10 ? 'down' : 'n'}`} role="timer" aria-label={`Kalan süre ${kalan} saniye`}>
            ⏱ {sureYaz(kalan)}
          </span>
        )}
        <span className="chip up mono">✓ {dogruSayisi}</span>
      </div>

      {bitti ? (
        <>
          <p className="kl-sonuc">
            {sureBitti ? (
              <>
                Süre doldu: {cevaplanan} soru cevapladın, <b>{d.puan ?? dogruSayisi}</b> doğru. Yarın yeni sorular!
              </>
            ) : (
              <>
                Bugün {n} soruda <b>{d.puan ?? dogruSayisi}</b> doğru. Yarın yeni sorular!
              </>
            )}
          </p>
          <ol className="sr-ozet">
            {d.sorular.map((x, j) => (
              <li key={j}>
                <span>{x.soru}</span>
                <span className={x.cevap != null && x.cevap === x.dogru ? 'sr-d' : 'sr-y'}>
                  {x.cevap != null && x.cevap === x.dogru ? '✓' : '✗'} {x.dogru != null ? x.secenekler[x.dogru - 1] : ''}
                  {x.cevap == null && <span className="m"> · cevaplanmadı</span>}
                  {x.cevap !== x.dogru && x.cevap != null && <span className="m"> · senin cevabın: {x.secenekler[x.cevap - 1]}</span>}
                </span>
              </li>
            ))}
          </ol>
        </>
      ) : (
        <section className="sr-kart" aria-live="polite">
          <p className="m" style={{ margin: 0, fontSize: 13 }}>
            {doldu ? 'Süre doldu, sonuç hazırlanıyor…' : `Soru ${i + 1} / ${n}`}
          </p>
          <h3 className="sr-soru">{s.soru}</h3>
          <div className="sr-secenekler" role="group" aria-label="Seçenekler">
            {s.secenekler.map((metin, k) => {
              const no = k + 1
              const durum = s.cevap == null ? '' : no === s.dogru ? ' dogru' : no === s.cevap ? ' yanlis' : ' soluk'
              return (
                <button key={k} type="button" className={`sr-secenek${durum}`} disabled={s.cevap != null || kilitli} onClick={() => sec(no)}>
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
                {cevaplanan >= n || d.bitti ? 'Sonucu gör' : 'Sonraki soru'}
              </button>
            </div>
          )}
        </section>
      )}
    </div>
  )
}
