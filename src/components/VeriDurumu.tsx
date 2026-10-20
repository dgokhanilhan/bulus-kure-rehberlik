// Veri yükleme durumu: yükleniyor (uzun sürerse uyarı) ya da hata (gerçek mesaj + Tekrar dene / Sayfayı yenile).
// Bir istek düşünce ya da yanıtsız kalınca ekran sonsuza kadar "Yükleniyor…"da kalmasın; kişi ne olduğunu görsün.
import { useEffect, useState } from 'react'

interface Sorgu {
  isError: boolean
  error: unknown
  refetch: () => unknown
}

export function veriHatasi(qs: Sorgu[]) {
  return qs.find((q) => q.isError) ?? null
}

export function VeriDurumu({ sorgular, padding = 0 }: { sorgular: Sorgu[]; padding?: number }) {
  const hata = veriHatasi(sorgular)
  const [uzun, setUzun] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setUzun(true), 15_000)
    return () => clearTimeout(t)
  }, [])
  if (hata)
    return (
      <div className="card issue" role="alert" data-testid="veri-hatasi" style={{ padding: 16, margin: padding }}>
        <b>Veriler yüklenemedi.</b>
        <p className="m" style={{ fontSize: 14, margin: '4px 0 8px' }}>
          {(hata.error as Error)?.message || 'Bilinmeyen hata.'}
        </p>
        <div className="btns">
          <button type="button" className="btn pri" onClick={() => sorgular.filter((q) => q.isError).forEach((q) => q.refetch())}>
            Tekrar dene
          </button>
          <button type="button" className="btn" onClick={() => location.reload()}>
            Sayfayı yenile
          </button>
        </div>
      </div>
    )
  return (
    <p className="m" role="status" style={{ padding }}>
      <span className="spinner" aria-hidden="true" /> Yükleniyor…
      {uzun && (
        <>
          {' '}
          Uzun sürüyor; bağlantını kontrol et ya da{' '}
          <button type="button" className="btn sm ghost" onClick={() => location.reload()}>
            sayfayı yenile
          </button>
          .
        </>
      )}
    </p>
  )
}
