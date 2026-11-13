// Mayın Tarlası: 9×9, 10 mayın; ilk tıklama hep güvenli. Bayrak: sağ tık, uzun basma ya da "Bayrak" modu.
import { useEffect, useRef, useState } from 'react'
import { mayinAc, mayinBitti, mayinKur, mayinSay, MAYIN_N, MAYIN_SAYI, sureYaz } from '@/lib/oyunlar'
import { useSkorKaydet } from '@/lib/oyunData'
import { useToast } from '@/components/Toast'

export default function Mayin() {
  const [m, setM] = useState<boolean[] | null>(null)
  const [acik, setAcik] = useState<Set<number>>(new Set())
  const [bayrak, setBayrak] = useState<Set<number>>(new Set())
  const [durum, setDurum] = useState<'oyun' | 'kazandi' | 'patladi'>('oyun')
  const [bayrakModu, setBayrakModu] = useState(false)
  const [simdi, setSimdi] = useState(Date.now())
  const bas = useRef(0)
  const uzun = useRef<ReturnType<typeof setTimeout> | null>(null)
  const uzunOldu = useRef(false)
  const kaydet = useSkorKaydet()
  const toast = useToast()

  useEffect(() => {
    if (!m || durum !== 'oyun') return
    const t = setInterval(() => setSimdi(Date.now()), 1000)
    return () => clearInterval(t)
  }, [m, durum])

  const yeni = () => {
    setM(null)
    setAcik(new Set())
    setBayrak(new Set())
    setDurum('oyun')
  }
  const bayrakla = (i: number) => {
    if (durum !== 'oyun' || acik.has(i)) return
    setBayrak((b) => {
      const n = new Set(b)
      if (n.has(i)) n.delete(i)
      else n.add(i)
      return n
    })
  }
  const ac = (i: number) => {
    if (durum !== 'oyun' || bayrak.has(i) || acik.has(i)) return
    let alan = m
    if (!alan) {
      alan = mayinKur(i)
      setM(alan)
      bas.current = Date.now()
    }
    if (alan[i]) {
      setDurum('patladi')
      setAcik(new Set([...acik, i]))
      return
    }
    const yeniAcik = mayinAc(alan, acik, i)
    setAcik(yeniAcik)
    if (mayinBitti(alan, yeniAcik)) {
      setDurum('kazandi')
      const ms = Date.now() - bas.current
      const sn = Math.max(1, Math.round(ms / 1000))
      kaydet.mutate(
        { oyun: 'mayin', puan: sn, sure_ms: ms },
        { onSuccess: () => toast(`Temizlendi! ${sureYaz(sn)}`), onError: (e) => toast((e as Error).message, 'warn') },
      )
    }
  }
  const gecen = m ? Math.floor(((durum === 'oyun' ? simdi : simdi) - bas.current) / 1000) : 0

  return (
    <div className="oy-mayin">
      <div className="oy-ust">
        <span className="chip n mono">💣 {MAYIN_SAYI - bayrak.size}</span>
        <span className="chip n mono">⏱ {sureYaz(Math.max(0, gecen))}</span>
        <button type="button" className={`btn sm${bayrakModu ? ' pri' : ''}`} aria-pressed={bayrakModu} onClick={() => setBayrakModu((x) => !x)}>
          🚩 Bayrak
        </button>
        {durum !== 'oyun' && (
          <button type="button" className="btn sm pri" onClick={yeni}>
            Yeniden oyna
          </button>
        )}
      </div>
      {durum === 'patladi' && <p className="m">Mayına bastın. Yeniden dene!</p>}
      {durum === 'kazandi' && <p>Tebrikler, alan temiz!</p>}
      <div className="my-alan" role="grid" aria-label="Mayın tarlası" style={{ gridTemplateColumns: `repeat(${MAYIN_N}, 1fr)` }}>
        {Array.from({ length: MAYIN_N * MAYIN_N }, (_, i) => {
          const a = acik.has(i)
          const mayin = !!m?.[i]
          const goster = a || (durum === 'patladi' && mayin)
          const n = m && a && !mayin ? mayinSay(m, i) : 0
          return (
            <button
              key={i}
              type="button"
              role="gridcell"
              className={`my-h${goster ? ' acik' : ''}${goster && mayin ? ' mayin' : ''}${n ? ` n${n}` : ''}`}
              aria-label={goster ? (mayin ? 'mayın' : n ? `${n}` : 'boş') : bayrak.has(i) ? 'bayraklı' : 'kapalı'}
              onClick={() => (uzunOldu.current ? (uzunOldu.current = false) : bayrakModu ? bayrakla(i) : ac(i))}
              onContextMenu={(e) => (e.preventDefault(), bayrakla(i))}
              onTouchStart={() => {
                uzunOldu.current = false
                uzun.current = setTimeout(() => {
                  uzunOldu.current = true
                  bayrakla(i)
                }, 450)
              }}
              onTouchEnd={() => uzun.current && clearTimeout(uzun.current)}
              onTouchMove={() => uzun.current && clearTimeout(uzun.current)}
            >
              {goster ? (mayin ? '💣' : n || '') : bayrak.has(i) ? '🚩' : ''}
            </button>
          )
        })}
      </div>
    </div>
  )
}
