// Veli / öğrenci Özeti → Hedefler (0060, 0095): hedef okullar (LGS) ya da bölümler (YKS). Öğretmenin seçtikleri salt okunur;
// aile en çok 5 hedef ekleyip kendi eklediklerini çıkarabilir (veritabanı fonksiyonlarıyla; tablo aileye açık değil).
// Her hedef öğrencinin son denemelerinin puanıyla (en çok 3 deneme ortalaması) karşılaştırılır; her yerde "tahmini" yazar.
// Sınıf sıralaması yok; öğrenci yalnız kendi puanıyla kıyaslanır (CLAUDE.md §3).
import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { examScores } from '@/lib/examScores'
import { fmt } from '@/lib/analiz'
import { AILE_GRUP_TR, DURUM_TR, aileGruplari, durum, referansPuan, type AileGrup, type PuanTuru } from '@/lib/hedef'
import { useDenemePuanlari } from './HedefTab'
import { sonLgsNetleri } from '@/lib/hedefSim'
import { HedefSimulator } from './HedefSimulator'

const TUR_TR: Record<PuanTuru, string> = { SAY: 'Sayısal', EA: 'Eşit ağırlık', SOZ: 'Sözel', DIL: 'Dil' }
const EKLEYEN_TR: Record<string, string> = { ogretmen: 'Öğretmen ekledi', veli: 'Veli ekledi', ogrenci: 'Öğrenci ekledi' }
const AILE_SINIR = 5
const ILK = 4

interface Hedef {
  id: string
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
  ekleyen: 'ogretmen' | 'veli' | 'ogrenci'
  silinebilir: boolean
}
type Secenek = Pick<Hedef, 'id' | 'yil' | 'kurum' | 'il' | 'ilce' | 'birim' | 'program' | 'puan_turu' | 'taban_puan' | 'yuzdelik'>

const sayi = (x: unknown) => (x === null || x === undefined ? null : Number(x))
const ad = (sinav: string, h: Pick<Hedef, 'kurum' | 'program'>) =>
  sinav === 'YKS' ? `${h.program ?? ''} · ${h.kurum}` : `${h.kurum}${h.program ? ` · ${h.program}` : ''}`
const alt = (sinav: string, h: Pick<Hedef, 'il' | 'ilce' | 'birim' | 'puan_turu'>) =>
  [h.il, h.ilce, h.birim, sinav === 'YKS' && h.puan_turu ? TUR_TR[h.puan_turu] : null].filter(Boolean).join(' · ')
const tur = (sinav: string, s: Secenek) => (sinav === 'YKS' ? (s.puan_turu ? TUR_TR[s.puan_turu] : null) : s.birim)

function Fark({ f }: { f: number }) {
  return (
    <span style={{ color: f >= 0 ? 'var(--primary)' : 'var(--signal-ink, var(--signal))', fontWeight: 600, whiteSpace: 'nowrap' }}>
      {f >= 0 ? `↑ ${fmt(f)} puan üstünde` : `↓ ${fmt(-f)} puan gerekli`}
    </span>
  )
}

export function AileHedefler({ sid, grade, veli }: { sid: string; grade: number | null | undefined; veli: boolean }) {
  const sinav = grade === 8 ? 'LGS' : 'YKS'
  const qc = useQueryClient()
  const hedefler = useQuery({
    queryKey: ['aile-hedefleri', sid],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('aile_hedef_listesi', { p_student: sid })
      if (error) throw new Error(error.message)
      return ((data ?? []) as Hedef[]).map((h) => ({ ...h, taban_puan: sayi(h.taban_puan), yuzdelik: sayi(h.yuzdelik) }))
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
    return (t: string) => ({ puan: referansPuan(seri[t] ?? []), adet: Math.min(3, (seri[t] ?? []).filter((x) => typeof x === 'number').length) })
  }, [puanlar.data, sinav])

  const list = (hedefler.data ?? []).filter((h) => h.sinav === sinav)
  const aileSayi = list.filter((h) => h.ekleyen !== 'ogretmen').length
  const lgsRef = ref('LGS')
  const netler = useMemo(() => sonLgsNetleri(puanlar.data ?? []), [puanlar.data])
  const [hata, setHata] = useState<string | null>(null)

  const sil = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('aile_hedef_sil', { p_student: sid, p_hedef: id })
      if (error) throw new Error(error.message)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['aile-hedefleri', sid] }),
    onError: (e: Error) => setHata(e.message),
  })

  const simHedefler = list.filter((h) => h.taban_puan !== null).map((h) => ({ ad: ad(sinav, h), taban: h.taban_puan! }))
  const kart = (
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
            ? `Henüz hedef ${sinav === 'LGS' ? 'okul' : 'bölüm'} yok. Aşağıdan ekleyebilir ya da öğretmenle birlikte belirleyebilirsiniz.`
            : `Henüz hedef ${sinav === 'LGS' ? 'okulun' : 'bölümün'} yok. Aşağıdan ekleyebilir ya da öğretmeninle birlikte belirleyebilirsin.`}
        </p>
      ) : (
        <>
          {sinav === 'LGS' && (
            <p style={{ margin: 0, fontSize: 14 }}>
              Deneme puanı (son {lgsRef.adet} deneme ortalaması): <b className="num">{lgsRef.puan === null ? '—' : fmt(lgsRef.puan, 2)}</b>
            </p>
          )}
          <ul className="hd-liste">
            {list.map((h) => {
              const r = ref(sinav === 'LGS' ? 'LGS' : (h.puan_turu ?? 'SAY'))
              const f = r.puan !== null && h.taban_puan !== null ? r.puan - h.taban_puan : null
              return (
                <li key={h.id} className="hd-satir aile ekle" data-testid="aile-hedef">
                  <div style={{ minWidth: 0 }}>
                    <b>{ad(sinav, h)}</b>
                    <div className="m" style={{ fontSize: 12 }}>
                      {alt(sinav, h)}
                    </div>
                    <span className="chip n" style={{ marginTop: 4, fontSize: 11 }}>
                      {EKLEYEN_TR[h.ekleyen]}
                    </span>
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
                        {DURUM_TR[durum(r.puan!, h.taban_puan!)]} · <Fark f={f} />
                      </>
                    )}
                  </div>
                  <div>
                    {h.silinebilir && (
                      <button
                        type="button"
                        className="btn sm ghost"
                        disabled={sil.isPending}
                        aria-label={`${ad(sinav, h)} hedefini çıkar`}
                        onClick={() => {
                          setHata(null)
                          sil.mutate(h.id)
                        }}
                      >
                        Çıkar
                      </button>
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
      {hata && (
        <p role="alert" style={{ margin: 0, fontSize: 13, color: 'var(--signal-ink, var(--signal))' }}>
          {hata}
        </p>
      )}
      {hedefler.isSuccess && (
        <OkulEkle
          sid={sid}
          sinav={sinav}
          veli={veli}
          secili={new Set(list.map((h) => `${h.kurum}|${h.program ?? ''}|${h.il ?? ''}|${h.ilce ?? ''}`))}
          kalan={AILE_SINIR - aileSayi}
          puan={(t) => ref(sinav === 'LGS' ? 'LGS' : (t ?? 'SAY')).puan}
          onHata={setHata}
        />
      )}
    </section>
  )
  if (sinav !== 'LGS' || lgsRef.puan === null || !simHedefler.length) return kart
  return (
    <>
      {kart}
      <HedefSimulator key={lgsRef.puan} kim={veli ? 'veli' : 'ogrenci'} puan={lgsRef.puan} netler={netler} hedefler={simHedefler} />
    </>
  )
}

function OkulEkle(p: {
  sid: string
  sinav: 'LGS' | 'YKS'
  veli: boolean
  secili: Set<string>
  kalan: number
  puan: (tur: PuanTuru | null) => number | null
  onHata: (m: string | null) => void
}) {
  const { sid, sinav } = p
  const qc = useQueryClient()
  const [acik, setAcik] = useState(false)
  const [il, setIl] = useState('')
  const [turSec, setTurSec] = useState('')
  const [ara, setAra] = useState('')
  const [araQ, setAraQ] = useState('')
  const [tumu, setTumu] = useState<Record<string, boolean>>({})
  useEffect(() => {
    const t = setTimeout(() => setAraQ(ara.trim()), 300)
    return () => clearTimeout(t)
  }, [ara])

  const iller = useQuery({
    queryKey: ['aile-hedef-iller', sid, sinav],
    enabled: acik,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('aile_hedef_iller', { p_student: sid, p_sinav: sinav })
      if (error) throw new Error(error.message)
      return (data ?? []) as { il: string; adet: number; yil: number }[]
    },
  })
  useEffect(() => {
    if (!il && iller.data?.length) setIl(iller.data.find((x) => x.il === 'Bartın')?.il ?? iller.data[0]!.il)
  }, [iller.data, il])

  const aramada = araQ.length >= 3
  const secenek = useQuery({
    queryKey: ['aile-hedef-secenek', sid, sinav, aramada ? '' : il, aramada ? araQ : ''],
    enabled: acik && (aramada || !!il),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('aile_hedef_secenekleri', {
        p_student: sid,
        p_sinav: sinav,
        p_il: aramada ? null : il,
        p_ara: aramada ? araQ : null,
      })
      if (error) throw new Error(error.message)
      return ((data ?? []) as Secenek[]).map((s) => ({ ...s, taban_puan: sayi(s.taban_puan), yuzdelik: sayi(s.yuzdelik) }))
    },
  })
  const ekle = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('aile_hedef_ekle', { p_student: sid, p_program: id })
      if (error) throw new Error(error.message)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['aile-hedefleri', sid] }),
    onError: (e: Error) => p.onHata(e.message),
  })

  const hepsi = secenek.data ?? []
  const turler = useMemo(
    () => [...new Set(hepsi.map((s) => tur(sinav, s)).filter((x): x is string => !!x))].sort((a, b) => a.localeCompare(b, 'tr')),
    [hepsi, sinav],
  )
  const l = hepsi.filter((s) => !turSec || tur(sinav, s) === turSec).filter((s) => !p.secili.has(`${s.kurum}|${s.program ?? ''}|${s.il ?? ''}|${s.ilce ?? ''}`))
  const ilBilgi = iller.data?.find((x) => x.il === il)
  const tekPuan = sinav === 'LGS' ? p.puan(null) : null

  if (!acik)
    return (
      <div>
        <button type="button" className="btn sm" onClick={() => setAcik(true)} aria-expanded="false" data-testid="okul-ekle-ac">
          {sinav === 'LGS' ? 'Okul ekle' : 'Bölüm ekle'}
        </button>
      </div>
    )

  const satir = (s: Secenek) => {
    const pu = sinav === 'LGS' ? tekPuan : p.puan(s.puan_turu)
    const f = pu !== null && s.taban_puan !== null ? pu - s.taban_puan : null
    return (
      <li key={s.id} className="hd-satir aile ekle" data-testid="okul-secenek">
        <div style={{ minWidth: 0 }}>
          <b>{ad(sinav, s)}</b>
          <div className="m" style={{ fontSize: 12 }}>
            {alt(sinav, s)}
          </div>
        </div>
        <div className="num" style={{ textAlign: 'right', fontSize: 13 }}>
          Taban {s.taban_puan === null ? '—' : fmt(s.taban_puan, 2)}
          {s.yuzdelik !== null ? <div className="m">%{fmt(s.yuzdelik, 2)}</div> : null}
        </div>
        <div style={{ fontSize: 13 }}>{f === null ? <span className="m">—</span> : <Fark f={f} />}</div>
        <div>
          <button
            type="button"
            className="btn sm"
            disabled={ekle.isPending || p.kalan <= 0}
            aria-label={`${ad(sinav, s)} hedeflere ekle`}
            onClick={() => {
              p.onHata(null)
              ekle.mutate(s.id)
            }}
          >
            Ekle
          </button>
        </div>
      </li>
    )
  }
  const grupListe = (key: string, baslik: string, g: Secenek[]) => {
    if (!g.length) return null
    const ac = !!tumu[key] || key === 'ara'
    return (
      <div key={key} data-testid="okul-grup" data-grup={key}>
        <h3 style={{ fontSize: 14, margin: '8px 0 0' }}>
          {baslik} <span className="m">({g.length})</span>
        </h3>
        <ul className="hd-liste">{(ac ? g : g.slice(0, ILK)).map(satir)}</ul>
        {g.length > ILK && key !== 'ara' && (
          <button type="button" className="btn sm ghost" aria-expanded={ac} onClick={() => setTumu((t) => ({ ...t, [key]: !ac }))}>
            {ac ? 'Daha az göster' : `Tümünü gör (${g.length})`}
          </button>
        )}
      </div>
    )
  }
  const puanVar = sinav === 'LGS' ? tekPuan !== null : true
  const gruplar = sinav === 'LGS' && tekPuan !== null && !aramada ? aileGruplari(l, tekPuan) : null

  return (
    <div style={{ display: 'grid', gap: 8, borderTop: '1px solid var(--line)', paddingTop: 12 }} data-testid="okul-ekle">
      <div className="kv">
        <h3 style={{ fontSize: 15, margin: 0 }}>{sinav === 'LGS' ? 'Okul ekle' : 'Bölüm ekle'}</h3>
        <button type="button" className="btn sm ghost" aria-expanded="true" onClick={() => setAcik(false)}>
          Kapat
        </button>
      </div>
      <p className="m" style={{ margin: 0, fontSize: 13 }}>
        {p.kalan > 0
          ? `${p.veli ? 'Ekleyebileceğiniz' : 'Ekleyebileceğin'} ${p.kalan} hedef daha var (aile en çok ${AILE_SINIR}). Eklenen hedef rehber öğretmene bildirilir.`
          : `${AILE_SINIR} hedef sınırına ulaşıldı. Yeni hedef için önce ${p.veli ? 'eklediğiniz' : 'eklediğin'} birini çıkar${p.veli ? 'ın' : ''}.`}
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <label style={{ display: 'grid', gap: 2, fontSize: 12 }}>
          İl
          <select value={il} onChange={(e) => setIl(e.target.value)} disabled={aramada} style={{ minHeight: 44 }}>
            {(iller.data ?? []).map((x) => (
              <option key={x.il} value={x.il}>
                {x.il}
              </option>
            ))}
          </select>
        </label>
        <label style={{ display: 'grid', gap: 2, fontSize: 12 }}>
          {sinav === 'LGS' ? 'Okul türü' : 'Puan türü'}
          <select value={turSec} onChange={(e) => setTurSec(e.target.value)} style={{ minHeight: 44 }}>
            <option value="">Tümü</option>
            {turler.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label style={{ display: 'grid', gap: 2, fontSize: 12, flex: '1 1 200px' }}>
          Ada göre ara (tüm Türkiye)
          <input type="search" value={ara} onChange={(e) => setAra(e.target.value)} placeholder="En az 3 harf" style={{ minHeight: 44 }} />
        </label>
      </div>
      {!aramada && ilBilgi && (
        <p className="m" style={{ margin: 0, fontSize: 12 }} data-testid="okul-kapsam">
          {ilBilgi.il}: listede {ilBilgi.adet} {sinav === 'LGS' ? 'okul' : 'bölüm'} · {ilBilgi.yil} yerleştirme verisi. Aradığın{p.veli ? 'ız' : ''}{' '}
          {sinav === 'LGS' ? 'okul' : 'bölüm'} yoksa rehber öğretmene bildir{p.veli ? 'in' : ''}.
        </p>
      )}
      {secenek.isLoading || iller.isLoading ? (
        <p className="m">
          <span className="spinner" aria-hidden="true" /> Yükleniyor…
        </p>
      ) : secenek.isError || iller.isError ? (
        <p className="m">Liste yüklenemedi. Sayfayı yenileyip tekrar deneyin.</p>
      ) : !l.length ? (
        <p className="m">{aramada ? 'Bu adla eşleşen kayıt yok.' : 'Bu seçimde kayıt yok.'}</p>
      ) : gruplar ? (
        (Object.keys(AILE_GRUP_TR) as AileGrup[]).map((k) => grupListe(k, AILE_GRUP_TR[k], gruplar[k]))
      ) : (
        <>
          {!puanVar && (
            <p className="m" style={{ margin: 0, fontSize: 12 }}>
              Deneme puanı olmadığı için gruplama yapılmadı.
            </p>
          )}
          {grupListe(aramada ? 'ara' : 'hepsi', aramada ? `“${araQ}” için sonuçlar` : sinav === 'LGS' ? 'Okullar' : 'Bölümler', l)}
        </>
      )}
    </div>
  )
}
