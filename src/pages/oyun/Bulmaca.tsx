// Mini Bulmaca: 5×5 (çoğu gün), 6×6 ya da 7×7 kafes; üç yatay, üç düşey kelime. İpuçları ve doğrulama sunucuda (0073, 0086),
// süre sunucuda ölçülür. Girilen harfler cihazda saklanır (sayfa yenilenince kaybolmaz).
import { useEffect, useMemo, useState } from 'react'
import {
  K5,
  kafesBos,
  kafesDolu,
  kafesKara,
  kafesKelime,
  kafesNumara,
  kafesSatirlar,
  kafesSonraki,
  kafesYonSec,
  kelimeTemizle,
  KLAVYE,
  sureYaz,
  type BulmacaYon,
  type Kafes,
} from '@/lib/oyunlar'
import { useBulmaca, useBulmacaBitir } from '@/lib/oyunData'
import { useToast } from '@/components/Toast'

function oku(k: string, adet: number): string[] | null {
  try {
    const v = JSON.parse(localStorage.getItem(k) ?? 'null') as unknown
    return Array.isArray(v) && v.length === adet ? (v as string[]) : null
  } catch {
    return null
  }
}

export default function Bulmaca() {
  const q = useBulmaca(true)
  const bitir = useBulmacaBitir()
  const toast = useToast()
  const d = q.data
  const kafes: Kafes = useMemo(
    () => (d?.boyut && d.satirlar && d.sutunlar ? { n: d.boyut, lr: d.satirlar, lc: d.sutunlar } : K5),
    [d?.boyut, d?.satirlar, d?.sutunlar],
  )
  const numara = useMemo(() => kafesNumara(kafes), [kafes])
  const anahtar = d ? `oda.bulmaca.${d.gun}` : ''
  const [giris, setGiris] = useState<string[] | null>(null)
  const [sec, setSec] = useState(0)
  const [yon, setYon] = useState<BulmacaYon>('y')
  const [simdi, setSimdi] = useState(Date.now())

  useEffect(() => {
    if (d && !giris) setGiris(d.cozum ? d.cozum.flatMap((s) => [...s].map((h) => (h === '.' ? '' : h))) : (oku(anahtar, kafes.n * kafes.n) ?? kafesBos(kafes)))
  }, [d, giris, anahtar, kafes])
  useEffect(() => {
    if (!d || d.bitti) return
    const t = setInterval(() => setSimdi(Date.now()), 1000)
    return () => clearInterval(t)
  }, [d])

  const a = giris ?? kafesBos(kafes)
  const bitti = !!d?.bitti
  const kaydet = (yeni: string[]) => {
    setGiris(yeni)
    try {
      localStorage.setItem(anahtar, JSON.stringify(yeni))
    } catch {
      /* depolama kapalı */
    }
  }
  const hucreSec = (i: number) => {
    if (kafesKara(kafes, i)) return
    setYon((y) => kafesYonSec(kafes, i, i === sec ? (y === 'y' ? 'd' : 'y') : y))
    setSec(i)
  }
  const bas = (k: string) => {
    if (!d || bitti) return
    if (k === 'Backspace') {
      const yeni = [...a]
      if (yeni[sec]) yeni[sec] = ''
      else {
        const o = kafesSonraki(kafes, sec, yon, -1)
        yeni[o] = ''
        setSec(o)
      }
      return kaydet(yeni)
    }
    const h = kelimeTemizle(k).slice(0, 1)
    if (!h) return
    const yeni = [...a]
    yeni[sec] = h
    kaydet(yeni)
    setSec(kafesSonraki(kafes, sec, yon, 1))
  }
  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || bitti) return
      if ((e.target as HTMLElement).closest('input, textarea, select')) return
      const ok: Record<string, [BulmacaYon, 1 | -1]> = { ArrowRight: ['y', 1], ArrowLeft: ['y', -1], ArrowDown: ['d', 1], ArrowUp: ['d', -1] }
      if (ok[e.key]) {
        e.preventDefault()
        const [y, adim] = ok[e.key]!
        const gecerli = kafesYonSec(kafes, sec, y)
        if (gecerli === y) setSec(kafesSonraki(kafes, sec, y, adim))
        setYon(gecerli)
      } else if (e.key === 'Backspace') {
        e.preventDefault()
        bas('Backspace')
      } else if (e.key.length === 1 && kelimeTemizle(e.key)) bas(e.key)
    }
    window.addEventListener('keydown', f)
    return () => window.removeEventListener('keydown', f)
  })

  if (q.isLoading) return <p className="m">Bulmaca hazırlanıyor…</p>
  if (q.isError || !d) return <div className="empty">Bulmaca açılamadı. Sayfayı yenile.</div>

  const n = kafes.n
  const gecen = bitti ? (d.puan ?? 0) : Math.max(0, Math.floor((simdi - new Date(d.basladi).getTime()) / 1000))
  const etkin = bitti ? [] : kafesKelime(kafes, sec, yon)
  const kontrol = () => {
    if (bitir.isPending) return
    if (!kafesDolu(kafes, a)) return toast('Önce bütün kutuları doldur', 'warn')
    bitir.mutate(kafesSatirlar(kafes, a), {
      onSuccess: (r) => (r.dogru ? toast(`Tebrikler! ${sureYaz(r.puan ?? 0)}`) : toast(`Henüz değil: ${r.yanlis} kutu yanlış`, 'warn')),
      onError: (e) => toast((e as Error).message, 'warn'),
    })
  }
  const ipucu = (y: BulmacaYon, sira: number, metin: string) => {
    const bas_ = y === 'y' ? kafes.lr[sira]! * n : kafes.lc[sira]!
    const secili = !bitti && yon === y && etkin.includes(bas_)
    return (
      <li key={sira}>
        <button
          type="button"
          className={`bm-ipucu${secili ? ' sec' : ''}`}
          onClick={() => {
            setYon(y)
            setSec(bas_)
          }}
        >
          <b className="mono">{numara[bas_]}</b> {metin}
        </button>
      </li>
    )
  }

  return (
    <div className="oy-bulmaca">
      <div className="oy-ust">
        <span className="chip n mono" aria-live="off">
          ⏱ {sureYaz(gecen)}
        </span>
        {n > 5 && <span className="chip gold">{`${n}×${n} büyük bulmaca`}</span>}
        {bitti ? (
          <span className="chip up">✓ Çözüldü</span>
        ) : (
          <span className="m" style={{ fontSize: 13 }}>
            Süre bulmacayı ilk açtığında başladı.
          </span>
        )}
      </div>
      <div className="bm-duzen">
        <div className={`bm-kafes bm-${n}`} role="grid" aria-label={`Bulmaca, ${n}×${n}`}>
          {Array.from({ length: n }, (_, r) => (
            <div role="row" key={r} className="bm-satir" style={{ gridTemplateColumns: `repeat(${n}, 1fr)` }}>
              {Array.from({ length: n }, (_, c) => {
                const i = r * n + c
                if (kafesKara(kafes, i)) return <span role="gridcell" key={c} className="bm-h kara" aria-label="kara kare" />
                return (
                  <button
                    key={c}
                    role="gridcell"
                    type="button"
                    className={`bm-h${!bitti && sec === i ? ' sec' : etkin.includes(i) ? ' ilgili' : ''}`}
                    aria-label={`Satır ${r + 1}, sütun ${c + 1}: ${a[i] ? a[i]!.toLocaleUpperCase('tr') : 'boş'}`}
                    aria-selected={!bitti && sec === i}
                    disabled={bitti}
                    onClick={() => hucreSec(i)}
                  >
                    {numara[i] && (
                      <i className="bm-no" aria-hidden="true">
                        {numara[i]}
                      </i>
                    )}
                    {(a[i] ?? '').toLocaleUpperCase('tr')}
                  </button>
                )
              })}
            </div>
          ))}
        </div>
        <div className="bm-ipuclari">
          <section aria-label="Soldan sağa">
            <h3>Soldan sağa →</h3>
            <ul>{d.yatay.map((m, k) => ipucu('y', k, m))}</ul>
          </section>
          <section aria-label="Yukarıdan aşağıya">
            <h3>Yukarıdan aşağıya ↓</h3>
            <ul>{d.dusey.map((m, k) => ipucu('d', k, m))}</ul>
          </section>
        </div>
      </div>
      {bitti ? (
        <p className="kl-sonuc">
          Çözdün: <b>{sureYaz(d.puan ?? 0)}</b>. Yarın yeni bulmaca!
        </p>
      ) : (
        <>
          <div className="kl-klavye" role="group" aria-label="Klavye">
            {KLAVYE.map((sira, i) => (
              <div key={i} className="kl-sira">
                {[...sira].map((h) => (
                  <button type="button" key={h} className="kl-tus" onClick={() => bas(h)} aria-label={h.toLocaleUpperCase('tr')}>
                    {h.toLocaleUpperCase('tr')}
                  </button>
                ))}
                {i === 2 && (
                  <button type="button" className="kl-tus genis" onClick={() => bas('Backspace')} aria-label="Harf sil">
                    ⌫
                  </button>
                )}
              </div>
            ))}
          </div>
          <button type="button" className="btn pri" onClick={kontrol} disabled={bitir.isPending}>
            Kontrol et
          </button>
          <p className="m" style={{ fontSize: 13, margin: 0, textAlign: 'center' }}>
            Aynı kutuya ikinci kez dokununca yazma yönü değişir.
          </p>
        </>
      )}
    </div>
  )
}
