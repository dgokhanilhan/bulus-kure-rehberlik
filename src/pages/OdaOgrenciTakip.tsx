// Öğretmenler Odası → Öğrenci Takip: seçilen sınıfların öğrencileri tek tabloda (son net ve gidişat, tekrar eden hata,
// ödev, devamsızlık, günlük kontrol, öğretmen notları). Veriler RLS'ten geçer: herkes yalnız görebildiği öğrencileri görür.
import { Fragment, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { fmt, indexResults, repeats, totalNet } from '@/lib/analiz'
import { HW_TR, useClassHomework, useClasses, useDataset, useModules, useStudents } from '@/lib/data'
import { useGenelDataset } from '@/lib/denemeData'
import { lastExamDelta } from '@/lib/denemeGenel'
import { useGunlukKontrol } from '@/lib/gunlukKontrolData'
import { ayBasi, MADDE_TR } from '@/lib/gunlukKontrol'
import { fold, initials, todayISO, trDM } from '@/lib/format'
import { cizgiNoktalari, dikkatNedenleri, odevOzeti, secimOku, suzgecUyar, type TakipSuzgec } from '@/lib/oda'
import { useOdaDevamsizlik, useOdaNotlar } from '@/lib/odaData'
import { useAuth } from '@/auth/AuthProvider'
import { Seg } from '@/components/Indicator'
import { Icon } from '@/components/Icon'
import { VeriDurumu } from '@/components/VeriDurumu'

const SUZGEC: readonly (readonly [TakipSuzgec, string])[] = [
  ['hepsi', 'Tümü'],
  ['dikkat', 'Dikkat'],
  ['dusus', 'Düşüşte'],
  ['odev', 'Ödevi eksik'],
  ['devamsizlik', 'Devamsızlık'],
]
type Sira = 'ad' | 'net' | 'degisim' | 'odev'
const DEV_TR = { normal: 'Sınırın altında', sari: 'Yaklaşıyor', turuncu: 'Sınıra yakın', kirmizi: 'Sınırda' } as const

/** Eğitim yılının başı (1 Eylül) */
function yilBasi(t: string) {
  const y = Number(t.slice(0, 4))
  return Number(t.slice(5, 7)) >= 9 ? `${y}-09-01` : `${y - 1}-09-01`
}

function okuSecim(key: string, gecerli: string[]) {
  try {
    return secimOku(localStorage.getItem(key), gecerli)
  } catch {
    return []
  }
}

export default function OdaOgrenciTakip() {
  const { profile } = useAuth()
  const mods = useModules()
  const students = useStudents()
  const classes = useClasses()
  const dsq = useDataset()
  const genel = useGenelDataset()
  const bugun = todayISO()

  // Sınıflar: görebildiğim öğrencilerin sınıfları, okulun sınıf sırasıyla
  const siniflar = useMemo(() => {
    const var_ = new Set((students.data ?? []).map((s) => s.class_name).filter(Boolean))
    const sirali = (classes.data ?? []).map((c) => c.name).filter((n) => var_.has(n))
    return [...sirali, ...[...var_].filter((n) => !sirali.includes(n)).sort((a, b) => a.localeCompare(b, 'tr'))]
  }, [students.data, classes.data])
  const key = `oda.siniflar.${profile?.id ?? ''}`
  const [secimHam, setSecimHam] = useState<string[] | null>(null)
  const secim = useMemo(() => {
    const s = secimHam ?? okuSecim(key, siniflar)
    return s.length ? s.filter((x) => siniflar.includes(x)) : siniflar.slice(0, 1)
  }, [secimHam, key, siniflar])
  const sec = (c: string) => {
    const yeni = secim.includes(c) ? secim.filter((x) => x !== c) : [...secim, c]
    setSecimHam(yeni)
    try {
      localStorage.setItem(key, JSON.stringify(yeni))
    } catch {
      /* depolama kapalı: seçim yalnız bu oturumda */
    }
  }

  const ogrenciler = useMemo(() => (students.data ?? []).filter((s) => secim.includes(s.class_name)), [students.data, secim])
  const ids = useMemo(() => ogrenciler.map((s) => s.id), [ogrenciler])
  const hw = useClassHomework(ids, yilBasi(bugun))
  const dev = useOdaDevamsizlik(mods.yoklama ? ids : [])
  const gk = useGunlukKontrol(ids, ayBasi(bugun), bugun)
  const notlar = useOdaNotlar(ids)

  const [suzgec, setSuzgec] = useState<TakipSuzgec>('hepsi')
  const [sira, setSira] = useState<Sira>('ad')
  const [q, setQ] = useState('')
  const [acik, setAcik] = useState<string | null>(null)

  const satirlar = useMemo(() => {
    const ds = dsq.data
    const gd = genel.data
    const idx = ds ? indexResults(ds.results) : null
    const hwBy = new Map<string, NonNullable<typeof hw.data>>()
    for (const h of hw.data ?? []) hwBy.set(h.student_id, [...(hwBy.get(h.student_id) ?? []), h])
    const gkBy = new Map<string, NonNullable<typeof gk.data>>()
    for (const k of gk.data ?? []) gkBy.set(k.student_id, [...(gkBy.get(k.student_id) ?? []), k])
    const notBy = new Map<string, NonNullable<typeof notlar.data>>()
    for (const n of notlar.data ?? []) notBy.set(n.student_id, [...(notBy.get(n.student_id) ?? []), n])

    return ogrenciler.map((s) => {
      let net: number | null = null
      let d: number | null = null
      let seri: number[] = []
      let tekrar: { ad: string; kez: number }[] = []
      if (s.grade === 8 && ds && idx) {
        // Öğrenciler sayfasıyla aynı hesap: son iki deneme
        const L = ds.exams.at(-1)
        const P = ds.exams.at(-2)
        const a = L ? idx.get(`${L.id}|${s.id}`) : undefined
        const b = P ? idx.get(`${P.id}|${s.id}`) : undefined
        net = a ? totalNet(a) : null
        d = a && b ? totalNet(a) - totalNet(b) : null
        seri = ds.exams.flatMap((e) => {
          const r = idx.get(`${e.id}|${s.id}`)
          return r ? [totalNet(r)] : []
        })
        tekrar = repeats(ds, s.id, undefined, idx)
          .filter((r) => r.count >= 3)
          .sort((x, y) => y.count - x.count)
          .map((r) => ({ ad: r.outcome.title || r.outcome.code, kez: r.count }))
      } else if (gd) {
        const res = new Map(gd.results.filter((r) => r.student_id === s.id).map((r) => [r.exam_id, { totalNet: r.total_net ?? 0, successPct: r.success_pct }]))
        const delta = lastExamDelta(gd.exams, res)
        net = delta?.totalNet ?? null
        d = delta?.deltaNet ?? null
        seri = gd.exams.filter((e) => res.has(e.id)).map((e) => res.get(e.id)!.totalNet)
      }
      const odevler = (hwBy.get(s.id) ?? []).sort((x, y) => y.homework.assigned_on.localeCompare(x.homework.assigned_on))
      const odev = odevOzeti(odevler.map((h) => h.status))
      const dv = dev.data?.get(s.id) ?? null
      const gkAy = gkBy.get(s.id) ?? []
      const n = notBy.get(s.id) ?? []
      const t = { d, odevOran: odev.oran, devSeviye: dv?.level ?? null, gkAy: gkAy.length }
      return { s, net, d, seri: seri.slice(-5), tekrar, odevler, odev, dv, gkAy, notlar: n, t, neden: dikkatNedenleri(t) }
    })
  }, [ogrenciler, dsq.data, genel.data, hw.data, dev.data, gk.data, notlar.data])

  const needle = fold(q)
  const liste = satirlar
    .filter((r) => suzgecUyar(r.t, suzgec) && (!needle || fold(r.s.full_name).includes(needle) || (r.s.school_no ?? '').includes(needle)))
    .sort((a, b) => {
      if (sira === 'net') return (b.net ?? -1e9) - (a.net ?? -1e9)
      if (sira === 'degisim') return (a.d ?? 1e9) - (b.d ?? 1e9)
      if (sira === 'odev') return (a.odev.oran ?? 2) - (b.odev.oran ?? 2)
      return a.s.class_name.localeCompare(b.s.class_name, 'tr') || a.s.full_name.localeCompare(b.s.full_name, 'tr')
    })

  const dikkat = satirlar.filter((r) => r.neden.length).length
  const oranlar = satirlar.map((r) => r.odev.oran).filter((x): x is number => x != null)
  const odevOrt = oranlar.length ? oranlar.reduce((a, b) => a + b, 0) / oranlar.length : null
  const gkToplam = satirlar.reduce((a, r) => a + r.gkAy.length, 0)
  const yukleniyor = students.isLoading || dsq.isLoading || genel.isLoading
  const hata = students.isError || dsq.isError || genel.isError

  if (yukleniyor || hata) return <VeriDurumu sorgular={[students, dsq, genel]} padding={16} />
  if (!siniflar.length)
    return <div className="empty">Henüz sana atanmış bir sınıf yok; sınıf ataması Yönetim Merkezi'nden yapılınca öğrencilerin burada görünür.</div>

  return (
    <div className="oda-takip">
      <section className="card a" style={{ padding: 16 }}>
        <div className="kv" style={{ marginBottom: 10 }}>
          <h2 className="sec">Sınıflar</h2>
          <span className="m" style={{ fontSize: 13 }}>
            Seçimin bu cihazda hatırlanır
          </span>
        </div>
        <div className="oda-cips" role="group" aria-label="Sınıf seçimi">
          {siniflar.map((c) => (
            <button key={c} type="button" className="oda-cip" aria-pressed={secim.includes(c)} onClick={() => sec(c)}>
              {secim.includes(c) && <Icon name="check" size={14} stroke={2.4} />}
              {c}
            </button>
          ))}
        </div>
      </section>

      <div className="stats a oda-ozet">
        <div className="card stat">
          <span className="m" style={{ fontSize: 13 }}>Öğrenci</span>
          <span className="big">{satirlar.length}</span>
          <span className="m" style={{ fontSize: 13 }}>{secim.length} sınıf</span>
        </div>
        <div className="card stat">
          <span className="m" style={{ fontSize: 13 }}>Dikkat</span>
          <span className="big" style={{ color: dikkat ? 'var(--signal)' : undefined }}>{dikkat}</span>
          <span className="m" style={{ fontSize: 13 }}>öğrenci</span>
        </div>
        <div className="card stat">
          <span className="m" style={{ fontSize: 13 }}>Ödev ortalaması</span>
          <span className="big">{odevOrt == null ? '—' : `%${Math.round(odevOrt * 100)}`}</span>
          <span className="m" style={{ fontSize: 13 }}>bu eğitim yılı</span>
        </div>
        <div className="card stat">
          <span className="m" style={{ fontSize: 13 }}>Günlük kontrol</span>
          <span className="big">{gkToplam}</span>
          <span className="m" style={{ fontSize: 13 }}>bu ay eksik</span>
        </div>
      </div>

      <div className="oda-arac a">
        <Seg label="Süzgeç" value={suzgec} options={SUZGEC} onChange={setSuzgec} />
        <label className="field oda-ara">
          <input aria-label="Öğrenci ara" placeholder="İsim veya okul no" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <label className="field oda-sira">
          <select aria-label="Sıralama" value={sira} onChange={(e) => setSira(e.target.value as Sira)}>
            <option value="ad">Sınıf ve ada göre</option>
            <option value="net">Son nete göre</option>
            <option value="degisim">Düşüş önce</option>
            <option value="odev">Ödevi az önce</option>
          </select>
        </label>
      </div>

      <section className="card a" style={{ overflow: 'hidden' }}>
        <div className="tbl oda-tbl">
          <table>
            <thead>
              <tr>
                <th>Öğrenci</th>
                <th>Son net · gidişat</th>
                <th>Tekrar eden hata</th>
                <th>Ödev</th>
                {mods.yoklama && <th>Devamsızlık</th>}
                <th>Günlük kontrol</th>
                <th>Notlar</th>
                <th aria-label="Ayrıntı" />
              </tr>
            </thead>
            <tbody>
              {liste.map((r) => {
                const ac = acik === r.s.id
                const nokta = cizgiNoktalari(r.seri)
                const toggle = () => setAcik(ac ? null : r.s.id)
                return (
                  <Fragment key={r.s.id}>
                    <tr className={`click${r.neden.length ? ' oda-dikkat' : ''}`} onClick={toggle}>
                      <td>
                        <span className="oda-ogr">
                          <span className="av s" style={{ width: 34, height: 34, fontSize: 12 }}>
                            {initials(r.s.full_name)}
                          </span>
                          <span style={{ minWidth: 0 }}>
                            <b>{r.s.full_name}</b>
                            <span className="m" style={{ display: 'block', fontSize: 12 }}>
                              {r.s.class_name}
                              {r.s.school_no ? ` · ${r.s.school_no}` : ''}
                            </span>
                          </span>
                        </span>
                      </td>
                      <td>
                        <span className="oda-net">
                          <b className="mono">{r.net != null ? fmt(r.net, 2) : '—'}</b>
                          {r.d != null && (
                            <span className="mono" style={{ fontSize: 12, fontWeight: 600, color: r.d < -1 ? 'var(--signal)' : r.d > 1 ? 'var(--primary)' : 'var(--ink-muted)' }}>
                              {r.d > 0 ? '↑ ' : r.d < 0 ? '↓ ' : ''}
                              {fmt(Math.abs(r.d))}
                            </span>
                          )}
                          {nokta && (
                            <svg width="64" height="22" viewBox="0 0 84 22" preserveAspectRatio="none" aria-hidden="true" className="oda-cizgi">
                              <polyline points={nokta} fill="none" stroke={r.d != null && r.d < -1 ? 'var(--signal)' : 'var(--primary)'} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
                            </svg>
                          )}
                        </span>
                      </td>
                      <td>{r.s.grade === 8 ? r.tekrar.length ? <span className="chip down">{r.tekrar.length} konu</span> : <span className="m">—</span> : <span className="m" title="Yalnız 8. sınıf (LGS)">—</span>}</td>
                      <td>
                        {r.odev.toplam ? (
                          <span className={`chip ${r.odev.oran! < 0.7 ? 'down' : 'n'}`}>
                            {r.odev.oran! < 0.7 ? '↓ ' : ''}
                            {r.odev.yapti}/{r.odev.toplam}
                          </span>
                        ) : (
                          <span className="m">—</span>
                        )}
                      </td>
                      {mods.yoklama && (
                        <td>
                          {r.dv ? (
                            <span
                              className={r.dv.level === 'normal' ? 'mono' : `chip ${r.dv.level === 'sari' ? 'n' : 'down'}`}
                              style={r.dv.level === 'normal' ? { fontSize: 13, color: 'var(--ink-2)' } : undefined}
                              title={`${r.dv.label}: ${DEV_TR[r.dv.level]}`}
                            >
                              {r.dv.level === 'turuncu' || r.dv.level === 'kirmizi' ? '↑ ' : ''}
                              {fmt(r.dv.used, r.dv.used % 1 ? 1 : 0)}/{r.dv.lim} gün
                            </span>
                          ) : (
                            <span className="m">—</span>
                          )}
                        </td>
                      )}
                      <td>{r.gkAy.length ? <span className={`chip ${r.gkAy.length >= 3 ? 'down' : 'n'}`}>{r.gkAy.length} eksik</span> : <span className="m">—</span>}</td>
                      <td>
                        {r.notlar.length ? (
                          <span style={{ fontSize: 13 }}>
                            {r.notlar.length} not <span className="m">· {trDM(r.notlar[0]!.created_at.slice(0, 10))}</span>
                          </span>
                        ) : (
                          <span className="m">—</span>
                        )}
                      </td>
                      <td style={{ width: 52, padding: '4px 8px' }}>
                        <button
                          type="button"
                          className="btn ghost sm oda-ac"
                          aria-expanded={ac}
                          aria-label={`${r.s.full_name}: ayrıntı`}
                          onClick={(e) => (e.stopPropagation(), toggle())}
                        >
                          <span className={`oda-ok${ac ? ' ac' : ''}`}>
                            <Icon name="down" size={18} />
                          </span>
                        </button>
                      </td>
                    </tr>
                    {ac && (
                      <tr className="oda-detay">
                        <td colSpan={mods.yoklama ? 8 : 7}>
                          <Detay r={r} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
        {!liste.length && (
          <div className="empty" style={{ margin: 16 }}>
            {!secim.length ? 'Yukarıdan en az bir sınıf seç.' : satirlar.length ? 'Bu süzgece uyan öğrenci yok.' : 'Seçili sınıflarda öğrenci yok.'}
          </div>
        )}
        {(hw.isLoading || notlar.isLoading || gk.isLoading || dev.isLoading) && (
          <p className="m" style={{ padding: '10px 16px', fontSize: 13 }}>
            <span className="spinner" aria-hidden="true" /> Ödev, devamsızlık ve not bilgileri yükleniyor…
          </p>
        )}
      </section>
    </div>
  )
}

type Satir = {
  s: { id: string; full_name: string; grade?: number | null }
  tekrar: { ad: string; kez: number }[]
  odevler: { status: keyof typeof HW_TR; homework: { title: string; assigned_on: string } }[]
  dv: { label: string; used: number; lim: number; level: keyof typeof DEV_TR } | null
  gkAy: { id: string; tarih: string; madde: keyof typeof MADDE_TR }[]
  notlar: { id: string; body: string | null; created_at: string; visibility: string }[]
  neden: string[]
}

function Detay({ r }: { r: Satir }) {
  return (
    <div className="oda-detay-ic">
      {r.neden.length > 0 && (
        <div className="oda-nedenler">
          {r.neden.map((n) => (
            <span key={n} className="chip down">
              {n}
            </span>
          ))}
        </div>
      )}
      <div className="oda-detay-grid">
        <div>
          <h3 className="oda-h">Son ödevler</h3>
          {r.odevler.length ? (
            <ul className="oda-liste">
              {r.odevler.slice(0, 5).map((h, i) => (
                <li key={i}>
                  <span className="oda-kirp">{h.homework.title}</span>
                  <span className={`chip ${h.status === 'yapti' ? 'up' : h.status === 'bekliyor' || h.status === 'izinli' ? 'n' : 'down'}`}>{HW_TR[h.status]}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="m">Bu yıl ödev kaydı yok.</p>
          )}
        </div>
        {r.s.grade === 8 && (
          <div>
            <h3 className="oda-h">Tekrar eden hatalar</h3>
            {r.tekrar.length ? (
              <ul className="oda-liste">
                {r.tekrar.slice(0, 5).map((t) => (
                  <li key={t.ad}>
                    <span className="oda-kirp">{t.ad}</span>
                    <span className="m mono">{t.kez} deneme</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="m">Tekrar eden hata yok.</p>
            )}
          </div>
        )}
        <div>
          <h3 className="oda-h">Devamsızlık ve günlük kontrol</h3>
          <ul className="oda-liste">
            {r.dv && (
              <li>
                <span>{r.dv.label}</span>
                <span className="mono">
                  {fmt(r.dv.used, r.dv.used % 1 ? 1 : 0)}/{r.dv.lim} gün
                </span>
              </li>
            )}
            {r.gkAy.slice(0, 4).map((k) => (
              <li key={k.id}>
                <span>{MADDE_TR[k.madde]}</span>
                <span className="m">{trDM(k.tarih)}</span>
              </li>
            ))}
            {!r.dv && !r.gkAy.length && <li className="m">Bu ay kayıt yok.</li>}
          </ul>
        </div>
        <div>
          <h3 className="oda-h">Son notlar</h3>
          {r.notlar.length ? (
            <ul className="oda-liste notlar">
              {r.notlar.slice(0, 3).map((n) => (
                <li key={n.id}>
                  <span className="oda-not">{n.body ?? <span className="m">(metin yok)</span>}</span>
                  <span className="m">{trDM(n.created_at.slice(0, 10))}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="m">Henüz not yok.</p>
          )}
        </div>
      </div>
      <div className="oda-detay-alt">
        <Link className="btn sm" to={`/ogrenciler/${r.s.id}`}>
          Öğrenci dosyası
        </Link>
        <Link className="btn sm" to={`/ogrenciler/${r.s.id}?sekme=notlar`}>
          <Icon name="plus" size={16} /> Not ekle
        </Link>
      </div>
    </div>
  )
}
