// Hafıza Kartları: 8 çift; süre ilk kartla başlar.
import { useEffect, useRef, useState } from 'react'
import { hafizaDeste, sureYaz } from '@/lib/oyunlar'
import { useSkorKaydet } from '@/lib/oyunData'
import { useToast } from '@/components/Toast'

export default function Hafiza() {
  const [deste, setDeste] = useState(() => hafizaDeste())
  const [acik, setAcik] = useState<number[]>([])
  const [bulunan, setBulunan] = useState<Set<number>>(new Set())
  const [hamle, setHamle] = useState(0)
  const [simdi, setSimdi] = useState(Date.now())
  const bas = useRef<number | null>(null)
  const kaydet = useSkorKaydet()
  const toast = useToast()
  const bitti = bulunan.size === deste.length

  useEffect(() => {
    if (bas.current == null || bitti) return
    const t = setInterval(() => setSimdi(Date.now()), 1000)
    return () => clearInterval(t)
  }, [hamle, bitti])

  const cevir = (i: number) => {
    if (bitti || acik.length === 2 || acik.includes(i) || bulunan.has(i)) return
    if (bas.current == null) bas.current = Date.now()
    const yeni = [...acik, i]
    setAcik(yeni)
    if (yeni.length < 2) return
    setHamle((h) => h + 1)
    const [a, b] = yeni as [number, number]
    if (deste[a] === deste[b]) {
      const n = new Set([...bulunan, a, b])
      setBulunan(n)
      setAcik([])
      if (n.size === deste.length) {
        const ms = Date.now() - bas.current
        const sn = Math.max(1, Math.round(ms / 1000))
        kaydet.mutate(
          { oyun: 'hafiza', puan: sn, sure_ms: ms },
          { onSuccess: () => toast(`Hepsi eşleşti! ${sureYaz(sn)}`), onError: (e) => toast((e as Error).message, 'warn') },
        )
      }
    } else setTimeout(() => setAcik([]), 800)
  }
  const yeni = () => {
    setDeste(hafizaDeste())
    setAcik([])
    setBulunan(new Set())
    setHamle(0)
    bas.current = null
  }
  const gecen = bas.current == null ? 0 : Math.floor(((bitti ? simdi : simdi) - bas.current) / 1000)

  return (
    <div className="oy-hafiza">
      <div className="oy-ust">
        <span className="chip n mono">⏱ {sureYaz(Math.max(0, gecen))}</span>
        <span className="chip n mono">{hamle} hamle</span>
        {(bitti || hamle > 0) && (
          <button type="button" className="btn sm" onClick={yeni}>
            Yeniden başla
          </button>
        )}
      </div>
      <div className="hf-alan" role="grid" aria-label="Hafıza kartları">
        {deste.map((s, i) => {
          const gor = acik.includes(i) || bulunan.has(i)
          return (
            <button
              key={i}
              type="button"
              role="gridcell"
              className={`hf-kart${gor ? ' acik' : ''}${bulunan.has(i) ? ' bulundu' : ''}`}
              aria-label={gor ? s : `Kart ${i + 1}, kapalı`}
              onClick={() => cevir(i)}
            >
              <span aria-hidden="true">{gor ? s : ''}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
