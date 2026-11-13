// Günün Sudokusu: bulmaca ve doğrulama sunucuda; girilen rakamlar cihazda saklanır (sayfa yenilenince kaybolmaz).
import { useEffect, useMemo, useRef, useState } from 'react'
import { sudokuCakisma, sudokuDolu, sureYaz } from '@/lib/oyunlar'
import { useSudoku, useSudokuBitir } from '@/lib/oyunData'
import { useToast } from '@/components/Toast'

function oku(k: string): number[] | null {
  try {
    const v = JSON.parse(localStorage.getItem(k) ?? 'null') as unknown
    return Array.isArray(v) && v.length === 81 ? (v as number[]) : null
  } catch {
    return null
  }
}

export default function Sudoku() {
  const q = useSudoku(true)
  const bitir = useSudokuBitir()
  const toast = useToast()
  const d = q.data
  const anahtar = d ? `oda.sudoku.${d.gun}` : ''
  const [giris, setGiris] = useState<number[] | null>(null)
  const [sec, setSec] = useState<number | null>(null)
  const [simdi, setSimdi] = useState(Date.now())
  const denendi = useRef('')

  useEffect(() => {
    if (d && !giris) setGiris(d.cozum ?? oku(anahtar) ?? d.ipucu)
  }, [d, giris, anahtar])
  useEffect(() => {
    if (!d || d.bitti) return
    const t = setInterval(() => setSimdi(Date.now()), 1000)
    return () => clearInterval(t)
  }, [d])

  const a = giris ?? d?.ipucu ?? []
  const cakisma = useMemo(() => sudokuCakisma(a), [a])
  const bitti = !!d?.bitti
  const yaz = (i: number, v: number) => {
    if (!d || bitti || d.ipucu[i]) return
    const yeni = [...a]
    yeni[i] = v
    setGiris(yeni)
    try {
      localStorage.setItem(anahtar, JSON.stringify(yeni))
    } catch {
      /* depolama kapalı */
    }
  }
  // Tahta dolu ve çakışma yoksa sunucuya gönder (aynı tahtayı iki kez gönderme)
  useEffect(() => {
    if (!d || bitti || !sudokuDolu(a) || cakisma.size) return
    const imza = a.join('')
    if (denendi.current === imza) return
    denendi.current = imza
    bitir.mutate(a, {
      onSuccess: (r) => (r.dogru ? toast(`Tebrikler! ${sureYaz(r.puan ?? 0)}`) : toast('Henüz değil: ipuçlarıyla uyuşmayan bir yer var', 'warn')),
      onError: (e) => toast((e as Error).message, 'warn'),
    })
  }, [a, cakisma, d, bitti, bitir, toast])

  if (q.isLoading) return <p className="m">Bulmaca hazırlanıyor…</p>
  if (q.isError || !d) return <div className="empty">Bulmaca açılamadı. Sayfayı yenile.</div>

  const gecen = bitti ? (d.puan ?? 0) : Math.max(0, Math.floor((simdi - new Date(d.basladi).getTime()) / 1000))
  const tus = (e: React.KeyboardEvent) => {
    if (sec == null) return
    if (/^[1-9]$/.test(e.key)) return (e.preventDefault(), yaz(sec, Number(e.key)))
    if (e.key === 'Backspace' || e.key === 'Delete' || e.key === '0') return (e.preventDefault(), yaz(sec, 0))
    const yon: Record<string, number> = { ArrowUp: -9, ArrowDown: 9, ArrowLeft: -1, ArrowRight: 1 }
    if (yon[e.key] != null) {
      e.preventDefault()
      const n = sec + yon[e.key]!
      if (n >= 0 && n < 81) {
        setSec(n)
        document.getElementById(`sd-${n}`)?.focus()
      }
    }
  }
  const secDeger = sec != null ? a[sec] : 0

  return (
    <div className="oy-sudoku">
      <div className="oy-ust">
        <span className="chip n mono" aria-live="off">
          ⏱ {sureYaz(gecen)}
        </span>
        {bitti ? <span className="chip up">✓ Çözüldü</span> : <span className="m" style={{ fontSize: 13 }}>Süre bulmacayı ilk açtığında başladı.</span>}
      </div>
      <div className="sd-tahta" role="grid" aria-label="Sudoku tahtası" onKeyDown={tus}>
        {Array.from({ length: 9 }, (_, r) => (
          <div role="row" key={r} className="sd-satir">
            {Array.from({ length: 9 }, (_, c) => {
              const i = r * 9 + c
              const sabit = d.ipucu[i]! > 0
              const v = a[i] ?? 0
              const ayni = sec != null && (Math.floor(sec / 9) === r || sec % 9 === c || (Math.floor(sec / 27) === Math.floor(r / 3) && Math.floor((sec % 9) / 3) === Math.floor(c / 3)))
              return (
                <button
                  key={c}
                  id={`sd-${i}`}
                  role="gridcell"
                  type="button"
                  className={`sd-h${sabit ? ' sabit' : ''}${sec === i ? ' sec' : ayni ? ' ilgili' : ''}${v && v === secDeger && sec !== i ? ' esit' : ''}${cakisma.has(i) && !sabit ? ' cakis' : ''}`}
                  aria-label={`Satır ${r + 1}, sütun ${c + 1}: ${v || 'boş'}${sabit ? ' (ipucu)' : ''}${cakisma.has(i) ? ', çakışıyor' : ''}`}
                  aria-selected={sec === i}
                  onClick={() => setSec(i)}
                >
                  {v || ''}
                </button>
              )
            })}
          </div>
        ))}
      </div>
      {!bitti && (
        <div className="sd-tuslar" role="group" aria-label="Rakam gir">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
            <button key={n} type="button" className="btn" disabled={sec == null || d.ipucu[sec]! > 0} onClick={() => sec != null && yaz(sec, n)}>
              {n}
            </button>
          ))}
          <button type="button" className="btn" disabled={sec == null || d.ipucu[sec]! > 0} onClick={() => sec != null && yaz(sec, 0)} aria-label="Hücreyi sil">
            Sil
          </button>
        </div>
      )}
      {bitir.isPending && <p className="m">Kontrol ediliyor…</p>}
    </div>
  )
}
