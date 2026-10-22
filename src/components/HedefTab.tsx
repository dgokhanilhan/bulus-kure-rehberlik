// Öğrenci dosyası → Hedef: 8. sınıf LGS liseleri, 11–12. sınıf YKS lisans programları. Öğrencinin son denemelerinin puanı
// (en çok 3 deneme ortalaması) taban puanlarla karşılaştırılır; her yerde "deneme puanına göre tahmini" yazar.
// Liste: Yönetim → Hedef listeleri (YKS yerleşik ÖSYM Tablo-4; LGS okulun yüklediği). Öneri listesi yalnız öğretmen ekranında; seçilen hedefler veli / öğrenci Özeti'nde salt okunur (AileHedefler, 0060).
import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/auth/AuthProvider'
import { useAyar } from '@/lib/ayarlar'
import { examScores } from '@/lib/examScores'
import { fmt } from '@/lib/analiz'
import { DURUM_TR, durum, oneriler, referansPuan, type Durum, type HedefProgram, type PuanTuru, type Sinav } from '@/lib/hedef'
import { useToast } from './Toast'

const TUR_TR: Record<PuanTuru, string> = { SAY: 'Sayısal', EA: 'Eşit ağırlık', SOZ: 'Sözel', DIL: 'Dil' }
const SEC = 'id, sinav, yil, kod, kurum, il, ilce, birim, program, puan_turu, taban_puan, yuzdelik, kontenjan'
type Prog = HedefProgram & { id: string }

export function useDenemePuanlari(sid: string) {
  return useQuery({
    queryKey: ['hedef-puanlar', sid],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('exam_results')
        .select('score, source, exams!inner(name, exam_date, exam_type, status)')
        .eq('student_id', sid)
        .eq('exams.status', 'yayinda')
      if (error) throw new Error(error.message)
      type R = { score: number | null; source: unknown; exams: { name: string; exam_date: string; exam_type: string | null } }
      return ((data ?? []) as unknown as R[]).sort((a, b) => a.exams.exam_date.localeCompare(b.exams.exam_date))
    },
  })
}

export default function HedefTab({ sid, grade }: { sid: string; grade: number | null | undefined }) {
  const sinav: Sinav = grade === 8 ? 'LGS' : 'YKS'
  const toast = useToast()
  const qc = useQueryClient()
  const { profile } = useAuth()
  const ayar = useAyar()
  const iller = ayar.list('hedef.iller')
  const puanlar = useDenemePuanlari(sid)
  const [il, setIl] = useState<string>('hepsi')
  const [ara, setAra] = useState('')
  const [elle, setElle] = useState('')

  // Deneme puanları: LGS → LGS denemelerinin puanı; YKS → karnedeki SAY / EA / SÖZ / DİL puanları
  type Nokta = { v: number | null; ad: string; t: string }
  const seri = useMemo((): Record<string, Nokta[]> => {
    const rs = puanlar.data ?? []
    if (sinav === 'LGS')
      return { LGS: rs.filter((r) => r.exams.exam_type === 'LGS' || r.exams.exam_type === null).map((r) => ({ v: r.score, ad: r.exams.name, t: r.exams.exam_date })) }
    const out: Record<string, Nokta[]> = {}
    for (const r of rs) for (const [k, v] of Object.entries(examScores(r.source)) as [PuanTuru, number][]) (out[k] ??= []).push({ v, ad: r.exams.name, t: r.exams.exam_date })
    return out
  }, [puanlar.data, sinav])
  const turler = (['SAY', 'EA', 'SOZ', 'DIL'] as const).filter((k) => seri[k]?.length)
  const [turSec, setTur] = useState<PuanTuru | null>(null)
  const tur: PuanTuru | null = sinav === 'YKS' ? (turSec ?? turler[0] ?? 'SAY') : null
  const dizi: Nokta[] = (sinav === 'LGS' ? seri.LGS : tur ? seri[tur] : []) ?? []
  const ref = referansPuan(dizi.map((x) => x.v))
  const elleSayi = Number(elle.replace(',', '.'))
  const puan = elle.trim() && Number.isFinite(elleSayi) && elleSayi > 0 ? elleSayi : ref

  const progs = useQuery({
    queryKey: ['hedef-programlar', sinav, tur, iller.join(',')],
    queryFn: async () => {
      // En güncel yıl: önce okulun listesi, yoksa yerleşik (YKS)
      const son = await supabase.from('hedef_programlar').select('yil').eq('sinav', sinav).order('yil', { ascending: false }).limit(1)
      const yil = son.data?.[0]?.yil as number | undefined
      if (!yil) return { yil: null, list: [] as Prog[] }
      let q = supabase.from('hedef_programlar').select(SEC).eq('sinav', sinav).eq('yil', yil).not('taban_puan', 'is', null)
      if (tur) q = q.eq('puan_turu', tur)
      if (iller.length) q = q.in('il', iller)
      const all: Prog[] = []
      for (let a = 0; ; a += 1000) {
        const { data, error } = await q.range(a, a + 999)
        if (error) throw new Error(error.message)
        all.push(...((data ?? []) as Prog[]))
        if (!data || data.length < 1000) break
      }
      return { yil, list: all.map((p) => ({ ...p, taban_puan: p.taban_puan === null ? null : Number(p.taban_puan), yuzdelik: p.yuzdelik === null ? null : Number(p.yuzdelik) })) }
    },
  })
  const hedefler = useQuery({
    queryKey: ['ogrenci-hedefleri', sid],
    queryFn: async () => {
      const { data, error } = await supabase.from('ogrenci_hedefleri').select(`id, program_id, hedef_programlar(${SEC})`).eq('student_id', sid).order('created_at')
      if (error) throw new Error(error.message)
      return ((data ?? []) as unknown as { id: string; program_id: string; hedef_programlar: Prog }[]).map((h) => ({
        ...h,
        p: { ...h.hedef_programlar, taban_puan: h.hedef_programlar.taban_puan === null ? null : Number(h.hedef_programlar.taban_puan) },
      }))
    },
  })
  const secili = new Set((hedefler.data ?? []).map((h) => h.program_id))

  const liste = useMemo(() => {
    const n = ara.trim().toLocaleLowerCase('tr')
    const ps = (progs.data?.list ?? []).filter(
      (p) => (il === 'hepsi' || p.il === il) && (!n || `${p.kurum} ${p.birim ?? ''} ${p.program ?? ''} ${p.ilce ?? ''}`.toLocaleLowerCase('tr').includes(n)),
    )
    return puan === null ? null : oneriler(ps, puan)
  }, [progs.data, il, ara, puan])

  async function ekle(p: Prog) {
    const { error } = await supabase.from('ogrenci_hedefleri').insert({ school_id: profile?.school_id, student_id: sid, program_id: p.id })
    if (error) return toast(/en çok 10/.test(error.message) ? 'Bir öğrencinin en çok 10 hedefi olabilir.' : 'Hedef eklenemedi.', 'warn')
    toast('Hedef eklendi.')
    qc.invalidateQueries({ queryKey: ['ogrenci-hedefleri', sid] })
  }
  async function kaldir(id: string) {
    const { error } = await supabase.from('ogrenci_hedefleri').delete().eq('id', id)
    if (error) return toast('Kaldırılamadı.', 'warn')
    qc.invalidateQueries({ queryKey: ['ogrenci-hedefleri', sid] })
  }

  const ad = (p: HedefProgram) => (sinav === 'YKS' ? `${p.program ?? ''} · ${p.kurum}` : `${p.kurum}${p.program ? ` · ${p.program}` : ''}`)
  const alt = (p: HedefProgram) => [p.il, p.ilce, sinav === 'YKS' ? p.birim : p.birim, p.kontenjan != null ? `${p.kontenjan} kontenjan` : null].filter(Boolean).join(' · ')
  const fark = (f: number) => (
    <span style={{ color: f >= 0 ? 'var(--primary)' : 'var(--signal-ink, var(--signal))', fontWeight: 600, whiteSpace: 'nowrap' }}>
      {f >= 0 ? `↑ ${fmt(f)} puan üstünde` : `↓ ${fmt(-f)} puan gerekli`}
    </span>
  )
  const Satir = ({ p, f }: { p: Prog; f: number }) => (
    <li className="hd-satir" data-testid="hedef-oneri">
      <div style={{ minWidth: 0 }}>
        <b>{ad(p)}</b>
        <div className="m" style={{ fontSize: 12 }}>
          {alt(p)}
        </div>
      </div>
      <div className="num" style={{ textAlign: 'right', fontSize: 13 }}>
        Taban {fmt(p.taban_puan!, 2)}
        {p.yuzdelik !== null ? <div className="m">%{fmt(p.yuzdelik, 2)}</div> : null}
      </div>
      <div style={{ fontSize: 13 }}>{fark(f)}</div>
      <button type="button" className="btn sm" disabled={secili.has(p.id)} onClick={() => ekle(p)} aria-label={`${ad(p)} hedef olarak ekle`}>
        {secili.has(p.id) ? '✓ Hedefte' : '+ Hedef'}
      </button>
    </li>
  )
  const GRUP: [Durum, number][] = [
    ['yakin', 40],
    ['ulasilabilir', 15],
    ['zorlayici', 15],
  ]

  return (
    <div style={{ display: 'grid', gap: 14 }} data-testid="hedef-sekme">
      <section className="card a" style={{ padding: '16px 20px', display: 'grid', gap: 10 }}>
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <div className="m" style={{ fontSize: 13 }}>
              {sinav === 'LGS' ? 'LGS deneme puanı' : `${tur ? TUR_TR[tur] : ''} deneme puanı`} (son {Math.min(3, dizi.length)} deneme ortalaması)
            </div>
            <div className="big">{ref === null ? '—' : fmt(ref, 2)}</div>
            <div className="m" style={{ fontSize: 12 }}>
              {dizi.slice(-3).map((x) => `${x.ad} ${fmt(x.v ?? 0, 1)}`).join(' · ') || 'Bu türde deneme puanı yok.'}
            </div>
          </div>
          {sinav === 'YKS' && (
            <div className="seg" role="group" aria-label="Puan türü">
              {(['SAY', 'EA', 'SOZ', 'DIL'] as const).map((k) => (
                <button key={k} type="button" className={tur === k ? 'on' : ''} aria-pressed={tur === k} onClick={() => setTur(k)}>
                  {TUR_TR[k]}
                </button>
              ))}
            </div>
          )}
          <label className="field" htmlFor="hdElle" style={{ maxWidth: 200 }}>
            <span className="label">Başka bir puanla dene</span>
            <input id="hdElle" inputMode="decimal" placeholder={ref === null ? 'ör. 420' : fmt(ref, 2)} value={elle} onChange={(e) => setElle(e.target.value)} />
          </label>
        </div>
        <p className="m" style={{ fontSize: 13, margin: 0 }}>
          Karşılaştırma <b>deneme puanına göre tahminidir</b>; deneme puanı {sinav} puanıyla birebir aynı değildir. Taban puanlar{' '}
          {progs.data?.yil ? `${progs.data.yil} yerleştirmesinin` : 'yüklenen listenin'} en düşük puanıdır{sinav === 'LGS' ? ' (yüzdelik dilim de gösterilir)' : ' (ÖSYM, genel kontenjan)'}.
        </p>
      </section>

      <section className="card a" style={{ padding: '16px 20px' }} aria-label="Hedefler">
        <b>Hedefler</b>
        {hedefler.data?.length ? (
          <ul className="hd-liste" data-testid="hedefler">
            {hedefler.data.map((h) => {
              const f = puan !== null && h.p.taban_puan !== null ? puan - h.p.taban_puan : null
              return (
                <li key={h.id} className="hd-satir">
                  <div style={{ minWidth: 0 }}>
                    <b>{ad(h.p)}</b>
                    <div className="m" style={{ fontSize: 12 }}>
                      {alt(h.p)} · {h.p.yil} tabanı {h.p.taban_puan === null ? '—' : fmt(h.p.taban_puan, 2)}
                    </div>
                  </div>
                  <div style={{ fontSize: 13 }}>{f === null ? '—' : <>{DURUM_TR[durum(puan!, h.p.taban_puan!)]} · {fark(f)}</>}</div>
                  <button type="button" className="btn sm ghost" onClick={() => kaldir(h.id)} aria-label={`${ad(h.p)} hedefini kaldır`}>
                    Kaldır
                  </button>
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="m" style={{ margin: '6px 0 0' }}>
            Henüz hedef seçilmedi. Aşağıdaki listeden "+ Hedef" ile ekle.
          </p>
        )}
      </section>

      <section className="card a" style={{ padding: '16px 20px', display: 'grid', gap: 10 }} aria-label="Öneriler">
        <div className="btns" style={{ alignItems: 'flex-end' }}>
          <div className="seg" role="group" aria-label="İl">
            {['hepsi', ...iller].map((x) => (
              <button key={x} type="button" className={il === x ? 'on' : ''} aria-pressed={il === x} onClick={() => setIl(x)}>
                {x === 'hepsi' ? 'Tüm iller' : x}
              </button>
            ))}
          </div>
          <label className="field" htmlFor="hdAra" style={{ flex: 1, minWidth: 200 }}>
            <span className="label">{sinav === 'YKS' ? 'Bölüm / üniversite ara' : 'Okul ara'}</span>
            <input id="hdAra" type="search" value={ara} placeholder={sinav === 'YKS' ? 'ör. Bilgisayar Mühendisliği' : 'ör. Fen Lisesi'} onChange={(e) => setAra(e.target.value)} />
          </label>
        </div>
        {progs.isLoading || puanlar.isLoading ? (
          <p className="m">
            <span className="spinner" aria-hidden="true" /> Yükleniyor…
          </p>
        ) : !progs.data?.list.length ? (
          <p className="m">
            {sinav} listesi yok ya da seçili illerde kayıt yok.{' '}
            {sinav === 'LGS' ? (
              <>
                Yönetici <Link to="/yonetim?sekme=hedefler">Yönetim → Hedef listeleri</Link>'nden e-Okul'daki taban puan listesini yükler.
              </>
            ) : null}
          </p>
        ) : puan === null ? (
          <p className="m">Öğrencinin bu türde deneme puanı yok; karşılaştırma için "Başka bir puanla dene" alanına bir puan yaz.</p>
        ) : (
          GRUP.map(([k, max]) => {
            const g = liste![k]
            return (
              <div key={k}>
                <b>
                  {DURUM_TR[k]} <span className="m">({g.length})</span>
                </b>
                <div className="m" style={{ fontSize: 12 }}>
                  {k === 'yakin'
                    ? 'Taban puanı öğrencinin puanına 15 puan yakın: hedef için en anlamlı liste.'
                    : k === 'ulasilabilir'
                      ? 'Taban puanı öğrencinin puanının en az 15 puan altında (en yüksek tabanlılar).'
                      : 'Taban puanı 15 puandan fazla üstte (en yakın olanlar).'}
                </div>
                {g.length ? (
                  <ul className="hd-liste">
                    {g.slice(0, max).map((p) => (
                      <Satir key={p.id} p={p as Prog} f={p.fark} />
                    ))}
                  </ul>
                ) : (
                  <p className="m" style={{ margin: '4px 0 0' }}>
                    Yok.
                  </p>
                )}
              </div>
            )
          })
        )}
        {progs.data?.yil && (
          <p className="m" style={{ fontSize: 12, margin: 0 }}>
            Liste: {sinav} {progs.data.yil}
            {sinav === 'YKS' ? ' · ÖSYM Tablo-4 (lisans, genel kontenjan)' : ' · okulun yüklediği MEB listesi'}
          </p>
        )}
      </section>
    </div>
  )
}
