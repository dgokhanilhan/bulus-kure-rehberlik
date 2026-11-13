// Günün Kelimesi: 5 harf, 6 hak. Renkler sunucudan gelir; cevap yalnız oyun bitince gösterilir.
import { useEffect, useState } from 'react'
import { harfDurumlari, kelimeTemizle, KLAVYE } from '@/lib/oyunlar'
import { useKelime, useKelimeTahmin } from '@/lib/oyunData'
import { useToast } from '@/components/Toast'

const DURUM_TR = ['kelimede yok', 'kelimede var, yeri farklı', 'doğru yerde']
const ISARET = ['', '○', '●']

export default function Kelime() {
  const q = useKelime(true)
  const tahmin = useKelimeTahmin()
  const toast = useToast()
  const [yazi, setYazi] = useState('')
  const d = q.data
  const bitti = !!d?.bitti

  const gonder = () => {
    if (bitti || tahmin.isPending) return
    if (yazi.length !== 5) return toast('Beş harf yaz', 'warn')
    tahmin.mutate(yazi, {
      onSuccess: (r) => {
        setYazi('')
        if (r.bitti) toast(r.puan != null && r.puan <= 6 ? `Bildin! ${r.puan}. denemede` : `Bu sefer olmadı: ${r.cevap?.toLocaleUpperCase('tr')}`, r.puan != null && r.puan <= 6 ? 'check' : 'warn')
      },
      onError: (e) => toast((e as Error).message, 'warn'),
    })
  }
  const bas = (k: string) => {
    if (bitti) return
    if (k === 'Enter') return gonder()
    if (k === 'Backspace') return setYazi((y) => [...y].slice(0, -1).join(''))
    setYazi((y) => kelimeTemizle(y + k))
  }
  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      const hedef = e.target as HTMLElement
      if (hedef.closest('input, textarea, select')) return
      if (e.key === 'Enter' || e.key === 'Backspace') {
        e.preventDefault()
        bas(e.key)
      } else if (e.key.length === 1 && kelimeTemizle(e.key)) bas(e.key)
    }
    window.addEventListener('keydown', f)
    return () => window.removeEventListener('keydown', f)
  })

  if (q.isLoading) return <p className="m">Yükleniyor…</p>
  if (q.isError || !d) return <div className="empty">Oyun açılamadı. Sayfayı yenile.</div>
  const renk = harfDurumlari(d.tahminler)
  const satirlar = Array.from({ length: 6 }, (_, i) => d.tahminler[i] ?? (i === d.tahminler.length && !bitti ? { t: yazi, r: null } : { t: '', r: null }))

  return (
    <div className="oy-kelime">
      <div className="kl-izgara" role="grid" aria-label="Tahminler">
        {satirlar.map((s, i) => (
          <div role="row" key={i} className="kl-satir">
            {Array.from({ length: 5 }, (_, j) => {
              const h = [...s.t][j] ?? ''
              const r = s.r?.[j]
              return (
                <span
                  role="gridcell"
                  key={j}
                  className={`kl-h${r != null ? ` r${r}` : h ? ' dolu' : ''}`}
                  aria-label={h ? `${h.toLocaleUpperCase('tr')}${r != null ? `: ${DURUM_TR[r]}` : ''}` : 'boş'}
                >
                  {h.toLocaleUpperCase('tr')}
                  {r != null && r > 0 && (
                    <i className="kl-isaret" aria-hidden="true">
                      {ISARET[r]}
                    </i>
                  )}
                </span>
              )
            })}
          </div>
        ))}
      </div>
      {bitti ? (
        <p className="kl-sonuc">
          {d.puan != null && d.puan <= 6 ? `Bildin: ${d.puan}. denemede.` : 'Bu sefer olmadı.'} Kelime: <b>{d.cevap?.toLocaleUpperCase('tr')}</b>. Yarın yeni kelime!
        </p>
      ) : (
        <p className="m kl-ipucu">● doğru yerde · ○ kelimede var ama yeri farklı</p>
      )}
      {!bitti && (
        <div className="kl-klavye" role="group" aria-label="Klavye">
          {KLAVYE.map((sira, i) => (
            <div key={i} className="kl-sira">
              {i === 2 && (
                <button type="button" className="kl-tus genis" onClick={() => bas('Enter')} disabled={tahmin.isPending}>
                  Gönder
                </button>
              )}
              {[...sira].map((h) => {
                const r = renk.get(h)
                return (
                  <button
                    type="button"
                    key={h}
                    className={`kl-tus${r != null ? ` r${r}` : ''}`}
                    onClick={() => bas(h)}
                    aria-label={`${h.toLocaleUpperCase('tr')}${r != null ? `, ${DURUM_TR[r]}` : ''}`}
                  >
                    {h.toLocaleUpperCase('tr')}
                  </button>
                )
              })}
              {i === 2 && (
                <button type="button" className="kl-tus genis" onClick={() => bas('Backspace')} aria-label="Harf sil">
                  ⌫
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
