// Kişisel PIN girişi: karışık tuş takımı, maskeli haneler, fiziksel klavye de çalışır.
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { karisikTuslar } from './lib/yoklama'

export function PinEkrani({
  baslik,
  aciklama,
  onPin,
  onKapat,
  yan,
}: {
  baslik: string
  aciklama?: string
  /** PIN'i dener; hata metni dönerse ekran temizlenip yeniden sorar. */
  onPin: (pin: string) => Promise<string | null>
  onKapat: () => void
  /** PIN'in yanında ikinci yol (telefonla QR onayı). */
  yan?: ReactNode
}) {
  const [pin, setPin] = useState('')
  const [tuslar, setTuslar] = useState(() => karisikTuslar())
  const [hata, setHata] = useState('')
  const [mesgul, setMesgul] = useState(false)
  const kutu = useRef<HTMLDivElement>(null)

  async function ekle(r: string) {
    if (mesgul || pin.length >= 4) return
    const yeni = pin + r
    setPin(yeni)
    if (yeni.length < 4) return
    setMesgul(true)
    const h = await onPin(yeni)
    setMesgul(false)
    if (h) {
      setHata(h)
      setPin('')
      setTuslar(karisikTuslar())
    }
  }

  useEffect(() => {
    kutu.current?.focus()
  }, [])
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (/^[0-9]$/.test(e.key)) void ekle(e.key)
      else if (e.key === 'Backspace') setPin((p) => p.slice(0, -1))
      else if (e.key === 'Escape') onKapat()
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  })

  return (
    <div className="perde" role="dialog" aria-modal="true" aria-labelledby="pin-baslik">
      <div className={`pin${yan ? ' genis' : ''}`} ref={kutu} tabIndex={-1}>
        <div className="pin-ust">
          <h2 id="pin-baslik">{baslik}</h2>
          <button className="bag" onClick={onKapat}>
            Kapat
          </button>
        </div>
        <div className="pin-yollar">
        <div className="pin-sutun">
        {yan && <h3 className="pin-alt">PIN ile</h3>}
        <p className="soluk ortala">{aciklama ?? "Kişisel tahta yoklama PIN'in · tuşların yeri her seferinde değişir"}</p>
        <div className="haneler" role="img" aria-label={`${pin.length} hane girildi`}>
          {[0, 1, 2, 3].map((i) => (
            <i key={i} className={i < pin.length ? 'dolu' : ''} />
          ))}
        </div>
        <p className="hata" role="alert">
          {mesgul ? 'Kontrol ediliyor…' : hata}
        </p>
        <div className="tuslar">
          {tuslar.slice(0, 9).map((t) => (
            <button key={t} onClick={() => ekle(t)} disabled={mesgul}>
              {t}
            </button>
          ))}
          <button className="islev" onClick={onKapat}>
            Vazgeç
          </button>
          <button onClick={() => ekle(tuslar[9]!)} disabled={mesgul}>
            {tuslar[9]}
          </button>
          <button className="islev" onClick={() => setPin((p) => p.slice(0, -1))} aria-label="Son haneyi sil">
            ⌫ Sil
          </button>
        </div>
        </div>
        {yan && (
          <>
            <div className="pin-ayrac" aria-hidden="true">
              <span>ya da</span>
            </div>
            {yan}
          </>
        )}
        </div>
      </div>
    </div>
  )
}
