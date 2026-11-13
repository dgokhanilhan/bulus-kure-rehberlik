// Hesap Sprinti: 60 saniyede olabildiğince çok doğru işlem. Her doğruda bir seviye zorlaşır; hızlı bilindikçe
// seviye daha çok atlar (art arda hızlı: +2, +3, +4). Yanlışta seviye aynı kalır. İleri seviyede çok adımlı işlemler.
import { useEffect, useRef, useState } from 'react'
import { islemUret, sprintIlerle, type Islem } from '@/lib/oyunlar'
import { useSkorKaydet } from '@/lib/oyunData'
import { useToast } from '@/components/Toast'

const SURE = 60

export default function Sprint() {
  const [soru, setSoru] = useState<Islem>(() => islemUret(0))
  const [cevap, setCevap] = useState('')
  const [dogru, setDogru] = useState(0)
  const [yanlis, setYanlis] = useState(0)
  const [kalan, setKalan] = useState(SURE)
  const [durum, setDurum] = useState<'once' | 'oyun' | 'bitti'>('once')
  const [sars, setSars] = useState(false)
  const [seviye, setSeviye] = useState(0)
  const [artis, setArtis] = useState<number | null>(null) // son cevabın seviye artışı (0 = yanlış)
  const seri = useRef(0)
  const soruBas = useRef(0)
  const bas = useRef(0)
  const kutu = useRef<HTMLInputElement>(null)
  const kaydet = useSkorKaydet()
  const toast = useToast()

  const basla = () => {
    setDogru(0)
    setYanlis(0)
    setCevap('')
    setSoru(islemUret(0))
    setSeviye(0)
    setArtis(null)
    seri.current = 0
    setKalan(SURE)
    bas.current = Date.now()
    soruBas.current = Date.now()
    setDurum('oyun')
    requestAnimationFrame(() => kutu.current?.focus())
  }
  useEffect(() => {
    if (durum !== 'oyun') return
    const t = setInterval(() => {
      const k = SURE - Math.floor((Date.now() - bas.current) / 1000)
      setKalan(Math.max(0, k))
      if (k <= 0) setDurum('bitti')
    }, 250)
    return () => clearInterval(t)
  }, [durum])
  useEffect(() => {
    if (durum !== 'bitti' || dogru === 0) return
    kaydet.mutate(
      { oyun: 'sprint', puan: dogru, sure_ms: Date.now() - bas.current },
      { onSuccess: () => toast(`Skorun kaydedildi: ${dogru}`), onError: (e) => toast((e as Error).message, 'warn') },
    )
  }, [durum])

  const gonder = (e: React.FormEvent) => {
    e.preventDefault()
    if (durum !== 'oyun' || cevap === '') return
    const dogruMu = Number(cevap) === soru.cevap
    const s = sprintIlerle(seviye, dogruMu, Date.now() - soruBas.current, seri.current)
    seri.current = s.seri
    if (dogruMu) setDogru((x) => x + 1)
    else {
      setYanlis((x) => x + 1)
      setSars(true)
      setTimeout(() => setSars(false), 300)
    }
    setSeviye(s.seviye)
    setArtis(s.artis)
    setSoru(islemUret(s.seviye))
    soruBas.current = Date.now()
    setCevap('')
  }

  return (
    <div className="oy-sprint">
      <div className="oy-ust">
        <span className={`chip mono ${kalan <= 10 && durum === 'oyun' ? 'down' : 'n'}`}>⏱ {kalan} sn</span>
        <span className="chip up mono">✓ {dogru}</span>
        <span className="chip n mono">✗ {yanlis}</span>
        {durum !== 'once' && (
          <span className="chip gold mono" data-testid="sprint-seviye">
            Seviye {seviye + 1}
          </span>
        )}
      </div>
      {durum === 'oyun' && (
        <p className="m sp-not" aria-live="polite">
          {artis == null
            ? 'Her doğruda zorlaşır; hızlı bilirsen daha çok.'
            : artis === 0
              ? 'Olmadı; seviye aynı kaldı.'
              : artis > 1
                ? `Hızlı! +${artis} seviye`
                : '+1 seviye'}
        </p>
      )}
      {durum === 'once' ? (
        <div className="sp-son">
          <p className="m">Her doğru cevapta sorular bir seviye zorlaşır; hızlı bildikçe seviye daha çok atlar. Yanlışta seviye aynı kalır.</p>
          <button type="button" className="btn pri sp-basla" onClick={basla}>
            Başla (60 sn)
          </button>
        </div>
      ) : durum === 'bitti' ? (
        <div className="sp-son">
          <p>
            Süre doldu: <b>{dogru}</b> doğru, {yanlis} yanlış. Ulaştığın seviye: <b>{seviye + 1}</b>.
          </p>
          <button type="button" className="btn pri" onClick={basla}>
            Yeniden oyna
          </button>
        </div>
      ) : (
        <form className={`sp-soru${sars ? ' sars' : ''}`} onSubmit={gonder}>
          <span className={`sp-islem mono${soru.metin.length > 11 ? ' uzun' : ''}`} aria-live="polite">
            {soru.metin} =
          </span>
          <input
            ref={kutu}
            className="sp-cevap mono"
            inputMode="numeric"
            pattern="[0-9]*"
            aria-label="Cevap"
            autoComplete="off"
            value={cevap}
            onChange={(e) => setCevap(e.target.value.replace(/\D/g, '').slice(0, 4))}
          />
          <button type="submit" className="btn pri">
            Tamam
          </button>
        </form>
      )}
    </div>
  )
}
