// Günün Şehri: bir il tahmin edilir. Her yanlış tahminde hedefin uzaklığı ve yönü gelir; tahminler ilerledikçe yöresel
// ipuçları açılır. Hedef il, uzaklıklar ve ipuçları sunucudan gelir (0073); cevap oyun bitmeden tarayıcıya gitmez.
import { useMemo, useState } from 'react'
import { ilBul, SEHIR_HAK, yonOku, yonYaz } from '@/lib/oyunlar'
import { useSehir, useSehirTahmin } from '@/lib/oyunData'
import { useToast } from '@/components/Toast'

export default function Sehir() {
  const q = useSehir(true)
  const tahmin = useSehirTahmin()
  const toast = useToast()
  const [secim, setSecim] = useState('')
  const d = q.data
  const iller = useMemo(() => [...(d?.iller ?? [])].sort((a, b) => a.ad.localeCompare(b.ad, 'tr')), [d?.iller])

  if (q.isLoading) return <p className="m">Yükleniyor…</p>
  if (q.isError || !d) return <div className="empty">Oyun açılamadı. Sayfayı yenile.</div>

  const bitti = !!d.bitti
  const bildi = bitti && d.puan != null && d.puan <= SEHIR_HAK
  const denenen = new Set(d.tahminler.map((t) => t.plaka))
  const kalan = SEHIR_HAK - d.tahminler.length
  const gonder = (e: React.FormEvent) => {
    e.preventDefault()
    if (bitti || tahmin.isPending) return
    if (!secim.trim()) return toast('Bir il adı yaz', 'warn')
    const il = ilBul(secim, iller)
    if (!il) return toast(`"${secim.trim()}" adında bir il bulamadım. Yazımı kontrol et.`, 'warn')
    if (denenen.has(il.plaka)) return toast(`${il.ad} ilini zaten denedin`, 'warn')
    tahmin.mutate(il.plaka, {
      onSuccess: (r) => {
        setSecim('')
        if (r.bitti)
          toast(
            r.puan != null && r.puan <= SEHIR_HAK ? `Bildin! ${r.puan}. tahminde` : `Bu sefer olmadı: ${r.cevap}`,
            r.puan != null && r.puan <= SEHIR_HAK ? 'check' : 'warn',
          )
      },
      onError: (err) => toast((err as Error).message, 'warn'),
    })
  }

  return (
    <div className="oy-sehir">
      <section className="sh-ipuclari" aria-label="İpuçları">
        <ol>
          {d.ipuclari.map((ip, i) => (
            <li key={i}>
              <span className="chip gold mono">İpucu {i + 1}</span>
              <span>{ip}</span>
            </li>
          ))}
        </ol>
        {!bitti && d.ipuclari.length < 3 && (
          <p className="m" style={{ fontSize: 13, margin: 0 }}>
            Her iki tahminde yeni bir ipucu açılır.
          </p>
        )}
      </section>

      {d.tahminler.length > 0 && (
        <ol className="sh-tahminler" aria-label="Tahminler">
          {d.tahminler.map((t, i) => (
            <li key={t.plaka} className={t.km === 0 ? 'dogru' : ''}>
              <span className="mono sh-no">{i + 1}</span>
              <b>{t.ad}</b>
              {t.km === 0 ? (
                <span className="sh-sonuc">✓ Doğru</span>
              ) : (
                <span className="sh-sonuc">
                  <span className="mono">{t.km} km</span> {yonYaz(t.yon)}{' '}
                  <span className="sh-ok" aria-hidden="true">
                    {yonOku(t.yon)}
                  </span>
                </span>
              )}
            </li>
          ))}
        </ol>
      )}

      {bitti ? (
        <p className="kl-sonuc">
          {bildi ? `Bildin: ${d.puan}. tahminde.` : 'Bu sefer olmadı.'} Günün şehri: <b>{d.cevap}</b>. Yarın yeni şehir!
        </p>
      ) : (
        <form className="sh-form" onSubmit={gonder}>
          <label className="field" htmlFor="shIl">
            Tahminin ({kalan} hak kaldı)
            <input
              id="shIl"
              list="shIller"
              value={secim}
              onChange={(e) => setSecim(e.target.value)}
              placeholder="İl adını yaz (ör. Bartın)"
              autoComplete="off"
              autoCapitalize="words"
              spellCheck={false}
            />
            <datalist id="shIller">
              {iller
                .filter((il) => !denenen.has(il.plaka))
                .map((il) => (
                  <option key={il.plaka} value={il.ad} />
                ))}
            </datalist>
          </label>
          <button type="submit" className="btn pri" disabled={tahmin.isPending}>
            Tahmin et
          </button>
        </form>
      )}
      {!bitti && d.tahminler.length > 0 && (
        <p className="m" style={{ fontSize: 13, margin: 0, textAlign: 'center' }}>
          Uzaklık ve yön, günün şehrinin senin tahminine göre nerede olduğunu gösterir.
        </p>
      )}
    </div>
  )
}
