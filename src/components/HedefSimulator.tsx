// Hedef simülatörü (LGS): kaydırıcıyla derslere net eklenir, tahmini puan ve hedefe kalan anında güncellenir.
// Öğretmen (Hedef sekmesi), veli ve öğrenci (Özet → Hedefler) aynı bileşeni kullanır; dil "sen"/"siz" olarak değişir.
// Sınıf kıyası yok (CLAUDE.md §3); sonuç ve puan hesabına dokunmaz, yalnız ekranda tahmin gösterir (§2).
import { useMemo, useState } from 'react'
import { fmt } from '@/lib/analiz'
import { LGS_DERSLER, oneriDagilim, pay, tahminiArtis, varsayilanHedef, type Netler } from '@/lib/hedefSim'

export interface SimHedef {
  ad: string
  taban: number
}

export function HedefSimulator({ puan, netler, hedefler, kim }: { puan: number; netler: Netler; hedefler: SimHedef[]; kim: 'ogretmen' | 'veli' | 'ogrenci' }) {
  const dersler = LGS_DERSLER.filter((d) => netler[d.kod] !== undefined)
  const [secim, setSecim] = useState<string>(() => {
    const h = varsayilanHedef(hedefler, puan)
    return h ? String(hedefler.indexOf(h)) : 'elle'
  })
  const [elle, setElle] = useState(() => String(Math.ceil((puan + 25) / 5) * 5))
  const elleSayi = Number(elle.replace(',', '.'))
  const hedef: SimHedef | null =
    secim !== 'elle' && hedefler[+secim]
      ? hedefler[+secim]!
      : Number.isFinite(elleSayi) && elleSayi > 0 && elleSayi <= 500
        ? { ad: 'Hedef puan', taban: elleSayi }
        : null
  const oneri = useMemo(() => (hedef ? oneriDagilim(netler, hedef.taban - puan) : { ek: {}, yeter: true }), [hedef?.taban, puan, netler]) // eslint-disable-line react-hooks/exhaustive-deps
  const [ek, setEk] = useState<Netler | null>(null)
  const aktif = ek ?? oneri.ek
  const tahmin = puan + tahminiArtis(aktif)
  const kalan = hedef ? hedef.taban - tahmin : null
  const sen = kim === 'ogrenci'
  const siz = kim === 'veli'
  const olcek = (v: number) => `${Math.max(0, Math.min(100, ((v - 200) / 300) * 100))}%`

  if (!dersler.length) return null
  return (
    <section className="card a" style={{ padding: '16px 20px', display: 'grid', gap: 10 }} aria-labelledby="hsim-baslik" data-testid="hedef-simulator">
      <div className="kv" style={{ flexWrap: 'wrap', gap: 8 }}>
        <h2 className="sec" id="hsim-baslik" style={{ margin: 0 }}>
          {sen ? 'Hedefine nasıl ulaşırsın?' : siz ? 'Hedefe nasıl ulaşılır?' : 'Hedef simülatörü'}
        </h2>
        <span className="chip n">Tahmini</span>
      </div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <label className="field" htmlFor="hsimHedef" style={{ minWidth: 0, flex: '1 1 240px', margin: 0 }}>
          <span className="label">Hedef</span>
          <select
            id="hsimHedef"
            value={secim}
            onChange={(e) => {
              setSecim(e.target.value)
              setEk(null)
            }}
          >
            {hedefler.map((h, i) => (
              <option key={i} value={i}>
                {h.ad} · taban {fmt(h.taban, 2)}
              </option>
            ))}
            <option value="elle">Kendi hedef puanım</option>
          </select>
        </label>
        {secim === 'elle' && (
          <label className="field" htmlFor="hsimPuan" style={{ maxWidth: 160, margin: 0 }}>
            <span className="label">Hedef puan</span>
            <input
              id="hsimPuan"
              inputMode="decimal"
              value={elle}
              onChange={(e) => {
                setElle(e.target.value)
                setEk(null)
              }}
            />
          </label>
        )}
      </div>

      <div style={{ position: 'relative', height: 12, borderRadius: 99, background: 'var(--surface-sunken)', margin: '22px 0 4px' }} aria-hidden="true">
        <i
          style={{ position: 'absolute', inset: '0 auto 0 0', width: olcek(tahmin), borderRadius: 99, background: 'var(--primary)', transition: 'width .25s' }}
        />
        {hedef && (
          <span style={{ position: 'absolute', top: -6, bottom: -6, width: 3, borderRadius: 2, background: 'var(--ink)', left: olcek(hedef.taban) }}>
            <span
              style={{
                position: 'absolute',
                bottom: 20,
                left: '50%',
                transform:
                  (hedef.taban - 200) / 300 < 0.12
                    ? 'translateX(-2px)'
                    : (hedef.taban - 200) / 300 > 0.88
                      ? 'translateX(calc(-100% + 2px))'
                      : 'translateX(-50%)',
                fontSize: 12,
                fontWeight: 700,
                whiteSpace: 'nowrap',
              }}
            >
              Hedef {fmt(hedef.taban, 2)}
            </span>
          </span>
        )}
      </div>
      <div className="kv" style={{ flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div className="m" style={{ fontSize: 13 }}>
            Tahmini puan · şu an {fmt(puan, 2)}
          </div>
          <div className="big" data-testid="hsim-tahmin">
            {fmt(tahmin, 2)}
          </div>
        </div>
        {kalan !== null &&
          (kalan > 0 ? (
            <div style={{ textAlign: 'right' }}>
              <div className="m" style={{ fontSize: 13 }}>
                Hedefe kalan
              </div>
              <div className="num" style={{ fontSize: 20, fontWeight: 700, color: 'var(--signal-ink, var(--signal))' }} data-testid="hsim-kalan">
                ↓ {fmt(kalan, 2)} puan
              </div>
            </div>
          ) : (
            <span className="chip up" data-testid="hsim-kalan">
              ✓ Hedef tabanına ulaşıyor
            </span>
          ))}
      </div>

      <div style={{ display: 'grid', gap: 4 }}>
        {dersler.map((d) => {
          const v = aktif[d.kod] ?? 0
          const id = `hsim-${d.kod}`
          return (
            <div key={d.kod} className="hsim-satir">
              <label htmlFor={id} style={{ fontSize: 14, fontWeight: 600 }}>
                {d.ad}
              </label>
              <input
                id={id}
                type="range"
                min={0}
                max={pay(netler, d.kod)}
                step={1}
                value={v}
                aria-valuetext={`${fmt((netler[d.kod] ?? 0) + v, 1)} net, ${v} net daha`}
                onChange={(e) => setEk({ ...aktif, [d.kod]: Number(e.target.value) })}
                style={{ width: '100%', minHeight: 32, accentColor: 'var(--primary)' }}
              />
              <span className="num" style={{ fontSize: 13, textAlign: 'right' }}>
                {fmt((netler[d.kod] ?? 0) + v, 1)}
                {v > 0 && <span style={{ color: 'var(--primary)', fontWeight: 700 }}> ↑{v}</span>}
              </span>
            </div>
          )
        })}
      </div>
      <div className="btns">
        <button type="button" className="btn sm" onClick={() => setEk(null)} disabled={ek === null}>
          Önerilen dağılım
        </button>
        <button type="button" className="btn sm ghost" onClick={() => setEk({})}>
          Sıfırla
        </button>
      </div>
      <p className="m" style={{ fontSize: 13, margin: 0 }}>
        {hedef && !oneri.yeter && ek === null
          ? 'Bu hedef için derslere eklenebilecek en yüksek dağılım gösteriliyor. '
          : `Önerilen dağılım ${sen ? 'en çok puan kaybettiğin' : 'en çok puan kaybedilen'} derslerden başlar (Türkçe, Matematik ve Fen'de bir net yaklaşık 4,5 puan). `}
        Başlangıç, son {sen ? 'denemelerinin' : 'denemelerin'} (en çok 3) ortalama puanı ve ders netleridir. <b>Tahminidir, resmî LGS puanı değildir.</b>
      </p>
    </section>
  )
}
