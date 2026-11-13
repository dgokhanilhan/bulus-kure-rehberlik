// Yılan: ok tuşları / WASD, dokunmatikte kaydırma ya da ekrandaki oklar. Oyun bitince skor kaydedilir.
import { useEffect, useRef, useState } from 'react'
import { yilanAdim, yilanBasla, yilanHiz, YILAN_N, type YilanDurum, type Yon } from '@/lib/oyunlar'
import { useSkorKaydet } from '@/lib/oyunData'
import { useToast } from '@/components/Toast'

const TUS: Record<string, Yon> = { ArrowUp: 'u', ArrowDown: 'd', ArrowLeft: 'l', ArrowRight: 'r', w: 'u', s: 'd', a: 'l', d: 'r' }

export default function Yilan() {
  const [d, setD] = useState<YilanDurum>(() => yilanBasla())
  const [oyunda, setOyunda] = useState(false)
  const kuyruk = useRef<Yon[]>([])
  const bas = useRef(0)
  const kaydet = useSkorKaydet()
  const toast = useToast()
  const dokun = useRef<{ x: number; y: number } | null>(null)

  const basla = () => {
    kuyruk.current = []
    setD(yilanBasla())
    bas.current = Date.now()
    setOyunda(true)
  }
  const yon = (y: Yon) => {
    if (kuyruk.current.length < 3) kuyruk.current.push(y)
  }

  useEffect(() => {
    if (!oyunda) return
    const t = setTimeout(() => {
      setD((x) => yilanAdim(x, kuyruk.current.shift() ?? null))
    }, yilanHiz(d.puan))
    return () => clearTimeout(t)
  }, [oyunda, d])

  useEffect(() => {
    if (!oyunda || !d.bitti) return
    setOyunda(false)
    if (d.puan > 0)
      kaydet.mutate(
        { oyun: 'yilan', puan: d.puan, sure_ms: Date.now() - bas.current },
        { onSuccess: () => toast(`Skorun kaydedildi: ${d.puan}`), onError: (e) => toast((e as Error).message, 'warn') },
      )
  }, [d.bitti, oyunda, d.puan, kaydet, toast])

  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      const y = TUS[e.key] ?? TUS[e.key.toLowerCase()]
      if (!y || (e.target as HTMLElement).closest('input, textarea, select')) return
      e.preventDefault()
      if (!oyunda) basla()
      yon(y)
    }
    window.addEventListener('keydown', f)
    return () => window.removeEventListener('keydown', f)
  })

  const govde = new Set(d.govde)
  return (
    <div className="oy-yilan">
      <div className="oy-ust">
        <span className="chip n mono">🍎 {d.puan}</span>
        {!oyunda && (
          <button type="button" className="btn pri" onClick={basla}>
            {d.bitti ? 'Yeniden oyna' : 'Başla'}
          </button>
        )}
        {d.bitti && <span className="m">Oyun bitti.</span>}
      </div>
      <div
        className="yl-alan"
        role="img"
        aria-label={`Yılan oyunu, puan ${d.puan}`}
        style={{ gridTemplateColumns: `repeat(${YILAN_N}, 1fr)` }}
        onTouchStart={(e) => (dokun.current = { x: e.touches[0]!.clientX, y: e.touches[0]!.clientY })}
        onTouchEnd={(e) => {
          const s = dokun.current
          if (!s) return
          const dx = e.changedTouches[0]!.clientX - s.x
          const dy = e.changedTouches[0]!.clientY - s.y
          if (Math.max(Math.abs(dx), Math.abs(dy)) < 20) return
          if (!oyunda) basla()
          yon(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'r' : 'l') : dy > 0 ? 'd' : 'u')
        }}
      >
        {Array.from({ length: YILAN_N * YILAN_N }, (_, i) => (
          <span key={i} className={i === d.govde[0] ? 'bas' : govde.has(i) ? 'gv' : i === d.yem ? 'yem' : undefined} />
        ))}
      </div>
      <div className="yl-oklar" role="group" aria-label="Yön">
        <button type="button" className="btn" aria-label="Yukarı" onClick={() => (oyunda ? yon('u') : basla())}>
          ↑
        </button>
        <div>
          <button type="button" className="btn" aria-label="Sola" onClick={() => (oyunda ? yon('l') : basla())}>
            ←
          </button>
          <button type="button" className="btn" aria-label="Aşağı" onClick={() => (oyunda ? yon('d') : basla())}>
            ↓
          </button>
          <button type="button" className="btn" aria-label="Sağa" onClick={() => (oyunda ? yon('r') : basla())}>
            →
          </button>
        </div>
      </div>
      <p className="m" style={{ fontSize: 13 }}>
        Ok tuşları ya da W A S D; telefonda kaydır.
      </p>
    </div>
  )
}
