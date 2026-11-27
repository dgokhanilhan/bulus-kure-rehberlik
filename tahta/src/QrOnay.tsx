// PIN ekranının yanında telefonla onay: liste sunucuya bırakılır, tek kullanımlık kod QR olarak gösterilir.
// Öğretmen telefonunda okutup onaylayınca tahta durumu sorarak sonucu alır. Kod 2 dakikada yenilenir.
import { useEffect, useMemo, useRef, useState } from 'react'
import qrcode from 'qrcode-generator'
import * as S from './lib/sunucu'
import type { Durum } from './lib/yoklama'

type Basari = Extract<S.GonderSonuc, { ok: true }>
const SORMA_ARALIGI = 2000
/** Kimse okutmazsa bu kadar yenilemeden sonra durur (boşuna kod üretilmez). */
const EN_FAZLA_YENILEME = 5

export function QrOnay({
  token,
  sinifId,
  kayit,
  onOnay,
  onHata,
}: {
  token: string
  sinifId: string
  kayit: Record<string, Durum>
  onOnay: (sonuc: Basari) => void
  /** Liste eskidi ya da tahta bağlantısı kalktı: PIN ekranı kapanır. */
  onHata: (e: S.SunucuHatasi) => void
}) {
  const [kod, setKod] = useState<{ kod: string; son: number } | null>(null)
  const [tur, setTur] = useState(0)
  const [durdu, setDurdu] = useState(false)
  const [ag, setAg] = useState(false)
  const [mesaj, setMesaj] = useState('')
  const [simdi, setSimdi] = useState(() => Date.now())
  const yenileme = useRef(0)
  const geri = useRef({ onOnay, onHata })
  geri.current = { onOnay, onHata }

  // Kod al (ilk açılışta ve her yenilemede)
  useEffect(() => {
    if (durdu) return
    let iptal = false
    setKod(null)
    void (async () => {
      try {
        const r = await S.onayBaslat(token, sinifId, kayit)
        if (iptal) return
        setAg(false)
        setMesaj('')
        // Tahta saati yanlış olabilir: geri sayım sunucunun verdiği süreden hesaplanır
        setKod({ kod: r.kod, son: Date.now() + r.sure * 1000 })
      } catch (e) {
        if (iptal) return
        if (e instanceof S.BaglantiYok) {
          setAg(true)
          setTimeout(() => !iptal && setTur((t) => t + 1), 10_000)
        } else if (e instanceof S.SunucuHatasi && (e.kod === '22023' || e.kod === '28000' || e.kod === '42501')) geri.current.onHata(e)
        else {
          setMesaj((e as Error).message)
          setDurdu(true)
        }
      }
    })()
    return () => {
      iptal = true
    }
  }, [token, sinifId, kayit, tur, durdu])

  // Onay durumunu sor
  useEffect(() => {
    if (!kod) return
    let iptal = false
    const i = setInterval(async () => {
      setSimdi(Date.now())
      try {
        const r = await S.onayDurum(token, kod.kod)
        if (iptal) return
        setAg(false)
        if (r.durum === 'onaylandi') {
          clearInterval(i)
          geri.current.onOnay(r.sonuc)
        } else if (r.durum !== 'bekliyor') {
          clearInterval(i)
          yenileme.current += 1
          if (yenileme.current >= EN_FAZLA_YENILEME) setDurdu(true)
          else setTur((t) => t + 1)
        }
      } catch (e) {
        if (iptal) return
        if (e instanceof S.BaglantiYok) setAg(true)
        else if (e instanceof S.SunucuHatasi && e.kod === '28000') geri.current.onHata(e)
      }
    }, SORMA_ARALIGI)
    return () => {
      iptal = true
      clearInterval(i)
    }
  }, [token, kod])

  const adres = kod ? S.onayAdresi(kod.kod) : ''
  const svg = useMemo(() => {
    if (!adres) return ''
    const q = qrcode(0, 'M')
    q.addData(adres)
    q.make()
    return q.createSvgTag({ cellSize: 4, margin: 0, scalable: true })
  }, [adres])
  const kalan = kod ? Math.max(0, Math.ceil((kod.son - simdi) / 1000)) : 0

  return (
    <div className="qr-onay" aria-labelledby="qr-baslik">
      <h3 id="qr-baslik">Telefonla onayla</h3>
      <p className="soluk kucuk">PIN'e gerek yok · hesabın telefonunda açık olmalı</p>
      {durdu ? (
        <div className="qr-bos">
          <p>{mesaj || 'Kod süresi doldu.'}</p>
          <button
            className="ince"
            onClick={() => {
              yenileme.current = 0
              setMesaj('')
              setDurdu(false)
              setTur((t) => t + 1)
            }}
          >
            Yeni kod göster
          </button>
        </div>
      ) : ag && !kod ? (
        <p className="qr-bos">İnternet bağlantısı yok. PIN'inle gönderebilirsin.</p>
      ) : !kod ? (
        <p className="qr-bos soluk">Kod hazırlanıyor…</p>
      ) : (
        <>
          <div className="qr-govde">
            <div className="qr-resim" role="img" aria-label="Telefonla okutulacak onay kodu" data-adres={adres} dangerouslySetInnerHTML={{ __html: svg }} />
            <ol className="qr-adim">
              <li>Telefonunun kamerasıyla okut</li>
              <li>Açılan sayfada listeye bak</li>
              <li>“Onayla” de, tahta kendisi gönderir</li>
            </ol>
          </div>
          <p className="qr-sure soluk kucuk">
            Kod <b className="sayi">{`${Math.floor(kalan / 60)}:${String(kalan % 60).padStart(2, '0')}`}</b> sonra yenilenir
            <span className="qr-bar" aria-hidden="true">
              <i style={{ width: `${Math.min(100, (kalan / 120) * 100)}%` }} />
            </span>
          </p>
          <p className="qr-bekle" role="status">
            {ag ? 'Bağlantı koptu; yeniden deneniyor…' : 'Telefondan onay bekleniyor…'}
          </p>
        </>
      )}
    </div>
  )
}
