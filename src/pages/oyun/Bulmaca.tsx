// Mini Bulmaca: 5×5 kafes; üç yatay, üç düşey kelime. İpuçları ve doğrulama sunucuda (0073), süre sunucuda ölçülür.
// Girilen harfler cihazda saklanır (sayfa yenilenince kaybolmaz).
import { useEffect, useState } from 'react'
import {
  BULMACA_NO,
  bulmacaBos,
  bulmacaDolu,
  bulmacaKara,
  bulmacaKelime,
  bulmacaSatirlar,
  bulmacaSonraki,
  bulmacaYonSec,
  kelimeTemizle,
  KLAVYE,
  sureYaz,
  type BulmacaYon,
} from '@/lib/oyunlar'
import { useBulmaca, useBulmacaBitir } from '@/lib/oyunData'
import { useToast } from '@/components/Toast'

function oku(k: string): string[] | null {
  try {
    const v = JSON.parse(localStorage.getItem(k) ?? 'null') as unknown
    return Array.isArray(v) && v.length === 25 ? (v as string[]) : null
  } catch {
    return null
  }
}

export default function Bulmaca() {
  const q = useBulmaca(true)
  const bitir = useBulmacaBitir()
  const toast = useToast()
  const d = q.data
  const anahtar = d ? `oda.bulmaca.${d.gun}` : ''
  const [giris, setGiris] = useState<string[] | null>(null)
  const [sec, setSec] = useState(0)
  const [yon, setYon] = useState<BulmacaYon>('y')
  const [simdi, setSimdi] = useState(Date.now())

  useEffect(() => {
    if (d && !giris) setGiris(d.cozum ? d.cozum.flatMap((s) => [...s].map((h) => (h === '.' ? '' : h))) : (oku(anahtar) ?? bulmacaBos()))
  }, [d, giris, anahtar])
  useEffect(() => {
    if (!d || d.bitti) return
    const t = setInterval(() => setSimdi(Date.now()), 1000)
    return () => clearInterval(t)
  }, [d])

  const a = giris ?? bulmacaBos()
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
    if (bulmacaKara(i)) return
    setYon((y) => bulmacaYonSec(i, i === sec ? (y === 'y' ? 'd' : 'y') : y))
    setSec(i)
  }
  const bas = (k: string) => {
    if (!d || bitti) return
    if (k === 'Backspace') {
      const yeni = [...a]
      if (yeni[sec]) yeni[sec] = ''
      else {
        const o = bulmacaSonraki(sec, yon, -1)
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
    setSec(bulmacaSonraki(sec, yon, 1))
  }
  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || bitti) return
      if ((e.target as HTMLElement).closest('input, textarea, select')) return
      const ok: Record<string, [BulmacaYon, 1 | -1]> = { ArrowRight: ['y', 1], ArrowLeft: ['y', -1], ArrowDown: ['d', 1], ArrowUp: ['d', -1] }
      if (ok[e.key]) {
        e.preventDefault()
        const [y, adim] = ok[e.key]!
        const gecerli = bulmacaYonSec(sec, y)
        if (gecerli === y) setSec(bulmacaSonraki(sec, y, adim))
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

  const gecen = bitti ? (d.puan ?? 0) : Math.max(0, Math.floor((simdi - new Date(d.basladi).getTime()) / 1000))
  const etkin = bitti ? [] : bulmacaKelime(sec, yon)
  const kontrol = () => {
    if (bitir.isPending) return
    if (!bulmacaDolu(a)) return toast('Önce bütün kutuları doldur', 'warn')
    bitir.mutate(bulmacaSatirlar(a), {
      onSuccess: (r) => (r.dogru ? toast(`Tebrikler! ${sureYaz(r.puan ?? 0)}`) : toast(`Henüz değil: ${r.yanlis} kutu yanlış`, 'warn')),
      onError: (e) => toast((e as Error).message, 'warn'),
    })
  }
  const ipucu = (y: BulmacaYon, sira: number, metin: string) => {
    const bas_ = y === 'y' ? sira * 10 : sira * 2
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
          <b className="mono">{BULMACA_NO[bas_]}</b> {metin}
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
        {bitti ? (
          <span className="chip up">✓ Çözüldü</span>
        ) : (
          <span className="m" style={{ fontSize: 13 }}>
            Süre bulmacayı ilk açtığında başladı.
          </span>
        )}
      </div>
      <div className="bm-duzen">
        <div className="bm-kafes" role="grid" aria-label="Bulmaca">
          {Array.from({ length: 5 }, (_, r) => (
            <div role="row" key={r} className="bm-satir">
              {Array.from({ length: 5 }, (_, c) => {
                const i = r * 5 + c
                if (bulmacaKara(i)) return <span role="gridcell" key={c} className="bm-h kara" aria-label="kara kare" />
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
                    {BULMACA_NO[i] && (
                      <i className="bm-no" aria-hidden="true">
                        {BULMACA_NO[i]}
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
