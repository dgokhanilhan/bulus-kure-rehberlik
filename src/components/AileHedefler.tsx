// Veli / öğrenci Özeti → Hedefler (0060): öğretmenin seçtiği hedef okullar (LGS) ya da bölümler (YKS), salt okunur.
// Her hedef öğrencinin son denemelerinin puanıyla (en çok 3 deneme ortalaması) karşılaştırılır; her yerde "tahmini" yazar.
// Sınıf sıralaması yok; öğrenci yalnız kendi puanıyla kıyaslanır (CLAUDE.md §3). Öneri listesi yalnız öğretmen ekranında.
import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { examScores } from '@/lib/examScores'
import { fmt } from '@/lib/analiz'
import { DURUM_TR, durum, referansPuan, type PuanTuru } from '@/lib/hedef'
import { useDenemePuanlari } from './HedefTab'

const TUR_TR: Record<PuanTuru, string> = { SAY: 'Sayısal', EA: 'Eşit ağırlık', SOZ: 'Sözel', DIL: 'Dil' }
interface Hedef {
  sinav: 'LGS' | 'YKS'
  yil: number
  kurum: string
  il: string | null
  ilce: string | null
  birim: string | null
  program: string | null
  puan_turu: PuanTuru | null
  taban_puan: number | null
  yuzdelik: number | null
  kontenjan: number | null
}

export function AileHedefler({ sid, grade, veli }: { sid: string; grade: number | null | undefined; veli: boolean }) {
  const sinav = grade === 8 ? 'LGS' : 'YKS'
  const hedefler = useQuery({
    queryKey: ['aile-hedefleri', sid],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('aile_hedefleri', { p_student: sid })
      if (error) throw new Error(error.message)
      return ((data ?? []) as Hedef[]).map((h) => ({
        ...h,
        taban_puan: h.taban_puan === null ? null : Number(h.taban_puan),
        yuzdelik: h.yuzdelik === null ? null : Number(h.yuzdelik),
      }))
    },
  })
  const puanlar = useDenemePuanlari(sid)

  // LGS → LGS denemelerinin puanı; YKS → karnedeki SAY / EA / SÖZ / DİL puanları (hedefin puan türüne göre)
  const ref = useMemo(() => {
    const rs = puanlar.data ?? []
    const seri: Record<string, (number | null)[]> = {}
    for (const r of rs) {
      if (sinav === 'LGS') {
        if (r.exams.exam_type === 'LGS' || r.exams.exam_type === null) (seri.LGS ??= []).push(r.score)
      } else for (const [k, v] of Object.entries(examScores(r.source))) (seri[k] ??= []).push(v as number)
    }
    return (tur: string) => ({ puan: referansPuan(seri[tur] ?? []), adet: Math.min(3, (seri[tur] ?? []).filter((x) => typeof x === 'number').length) })
  }, [puanlar.data, sinav])

  const list = (hedefler.data ?? []).filter((h) => h.sinav === sinav)
  const lgsRef = ref('LGS')
  const ad = (h: Hedef) => (h.sinav === 'YKS' ? `${h.program ?? ''} · ${h.kurum}` : `${h.kurum}${h.program ? ` · ${h.program}` : ''}`)
  const alt = (h: Hedef) => [h.il, h.ilce, h.birim, h.sinav === 'YKS' && h.puan_turu ? TUR_TR[h.puan_turu] : null].filter(Boolean).join(' · ')

  return (
    <section className="card a" style={{ ['--d' as string]: 4, padding: 20, display: 'grid', gap: 8 }} aria-label="Hedefler" data-testid="aile-hedefler">
      <h2 className="sec">{veli ? 'Hedefler' : 'Hedeflerin'}</h2>
      {hedefler.isLoading || puanlar.isLoading ? (
        <p className="m">
          <span className="spinner" aria-hidden="true" /> Yükleniyor…
        </p>
      ) : hedefler.isError ? (
        <p className="m">Hedefler yüklenemedi. Sayfayı yenileyip tekrar deneyin.</p>
      ) : !list.length ? (
        <p className="m" style={{ margin: 0 }}>
          {veli
            ? `Hedef ${sinav === 'LGS' ? 'okullar' : 'bölümler'} öğretmenle birlikte belirlendiğinde burada görünür.`
            : `Hedef ${sinav === 'LGS' ? 'okulların' : 'bölümlerin'} öğretmeninle birlikte belirlendiğinde burada görünür.`}
        </p>
      ) : (
        <>
          {sinav === 'LGS' && (
            <p style={{ margin: 0, fontSize: 14 }}>
              Deneme puanı (son {lgsRef.adet} deneme ortalaması): <b className="num">{lgsRef.puan === null ? '—' : fmt(lgsRef.puan, 2)}</b>
            </p>
          )}
          <ul className="hd-liste">
            {list.map((h, i) => {
              const r = ref(sinav === 'LGS' ? 'LGS' : (h.puan_turu ?? 'SAY'))
              const f = r.puan !== null && h.taban_puan !== null ? r.puan - h.taban_puan : null
              return (
                <li key={i} className="hd-satir aile" data-testid="aile-hedef">
                  <div style={{ minWidth: 0 }}>
                    <b>{ad(h)}</b>
                    <div className="m" style={{ fontSize: 12 }}>
                      {alt(h)}
                    </div>
                  </div>
                  <div className="num" style={{ textAlign: 'right', fontSize: 13 }}>
                    {h.yil} tabanı {h.taban_puan === null ? '—' : fmt(h.taban_puan, 2)}
                    {h.yuzdelik !== null ? <div className="m">%{fmt(h.yuzdelik, 2)}</div> : null}
                    {sinav === 'YKS' && r.puan !== null ? <div className="m">Deneme {fmt(r.puan, 2)}</div> : null}
                  </div>
                  <div style={{ fontSize: 13 }}>
                    {f === null ? (
                      <span className="m">Deneme puanı yok</span>
                    ) : (
                      <>
                        {DURUM_TR[durum(r.puan!, h.taban_puan!)]} ·{' '}
                        <span style={{ color: f >= 0 ? 'var(--primary)' : 'var(--signal-ink, var(--signal))', fontWeight: 600, whiteSpace: 'nowrap' }}>
                          {f >= 0 ? `↑ ${fmt(f)} puan üstünde` : `↓ ${fmt(-f)} puan gerekli`}
                        </span>
                      </>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
          <p className="m" style={{ fontSize: 13, margin: 0 }}>
            Karşılaştırma <b>deneme puanına göre tahminidir</b>; deneme puanı {sinav} puanıyla birebir aynı değildir. Taban puan, o yılki yerleştirmenin en
            düşük puanıdır.
          </p>
        </>
      )}
    </section>
  )
}
