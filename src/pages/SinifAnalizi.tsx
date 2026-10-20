// Sınıflar → Sınıf analizi: bir şubenin bütün denemeleri boyunca her öğrencinin süreci, sırası ve sınıfın ortak eksikleri.
// Yalnız öğretmen/yönetici ekranı (Sınıflar menüsü); sıralama veli ve öğrenci ekranına girmez (CLAUDE.md kural 3).
// Hesaplar saf modülde (lib/sinifAnalizi.ts); bu dosya yalnız gösterim.
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { fmt, outcomeCode, signed, type Subject } from '@/lib/analiz'
import { useClassAttendance, useMeetings, useSchoolSettings, useStudents, useTasks } from '@/lib/data'
import { useExamContext } from '@/lib/sinavBaglami'
import { ISARET_TR, sinifAnalizi, type Isaret, type OgrenciSatiri } from '@/lib/sinifAnalizi'
import { todayISO, trD } from '@/lib/format'
import { useSchoolInfo } from '@/lib/files'
import { useAyar } from '@/lib/ayarlar'
import { Icon } from '@/components/Icon'
import { Dropdown, Seg } from '@/components/Indicator'
import { useToast } from '@/components/Toast'

export const heatStyle = (p: number | null): React.CSSProperties =>
  p === null
    ? { background: 'var(--paper)', border: '1px dashed var(--line-strong)', color: 'var(--ink-muted)' }
    : p < 40
      ? { background: 'var(--heat-1)', color: '#fff' }
      : p < 60
        ? { background: 'var(--heat-2)', color: 'var(--ink-fixed)' }
        : p < 80
          ? { background: 'var(--heat-3)', color: 'var(--ink-fixed)' }
          : { background: 'var(--heat-4)', color: '#fff' }

type Sira = 'sira' | 'ad' | 'net' | 'degisim' | 'ort' | 'tekrar' | 'hedef' | 'gorev' | 'gorusme' | 'devamsiz'
const KOLON: [Sira, string][] = [
  ['sira', 'Sıra'],
  ['ad', 'Öğrenci'],
  ['net', 'Son puan / net'],
  ['degisim', 'Değişim'],
  ['ort', 'Ort. net'],
  ['tekrar', 'Tekrar eden hata'],
  ['hedef', 'Hedefe göre'],
  ['gorev', 'Açık görev'],
  ['gorusme', 'Son görüşme'],
  ['devamsiz', 'Devamsızlık'],
]
const SUZGEC: (Isaret | 'hepsi')[] = ['hepsi', 'dusus', 'iki_dusus', 'hedef_alti', 'gorusme_yok', 'yukselis']

/** Eğitim yılının başı (1 Eylül): devamsızlık bu tarihten sayılır. */
const yilBasi = (t: string) => (Number(t.slice(5, 7)) >= 9 ? `${t.slice(0, 4)}-09-01` : `${Number(t.slice(0, 4)) - 1}-09-01`)

function Gidisat({ r }: { r: OgrenciSatiri }) {
  const pts = r.hucreler.map((h, i) => ({ i, v: h.net })).filter((x): x is { i: number; v: number } => x.v !== null)
  if (pts.length < 2) return <span className="m">—</span>
  const n = r.hucreler.length,
    lo = Math.min(...pts.map((p) => p.v)),
    hi = Math.max(...pts.map((p) => p.v)),
    W = 64,
    H = 20
  const xy = pts.map((p) => `${((p.i / Math.max(1, n - 1)) * (W - 4) + 2).toFixed(1)},${(H - 2 - ((p.v - lo) / Math.max(1, hi - lo)) * (H - 4)).toFixed(1)}`)
  const up = pts.at(-1)!.v >= pts[0]!.v
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Net gidişatı: ${pts.map((p) => fmt(p.v)).join(', ')}`}>
      <polyline points={xy.join(' ')} fill="none" stroke={up ? 'var(--primary)' : 'var(--signal)'} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

function Degisim({ v, birim = 'net', ters = false }: { v: number | null; birim?: string; ters?: boolean }) {
  if (v === null || v === 0) return <span className="m">{v === 0 ? '±0' : '—'}</span>
  const up = ters ? v < 0 : v > 0
  return (
    <span style={{ color: up ? 'var(--primary)' : 'var(--signal-ink, var(--signal))', fontWeight: 600, whiteSpace: 'nowrap' }}>
      {up ? '↑' : '↓'} {birim === 'sıra' ? Math.abs(v) : signed(v)} {birim}
    </span>
  )
}

export default function SinifAnalizi({ cls, grade, onBack }: { cls: string; grade: number | null; onBack: () => void }) {
  const nav = useNavigate()
  const toast = useToast()
  const ayar = useAyar()
  const info = useSchoolInfo()
  const students = useStudents()
  const tasks = useTasks()
  const meetings = useMeetings()
  const settings = useSchoolSettings()
  const dsq = useExamContext(grade)
  const bugun = todayISO()
  const sinif = useMemo(() => (students.data ?? []).filter((s) => s.class_name === cls).sort((a, b) => a.full_name.localeCompare(b.full_name, 'tr')), [students.data, cls])
  const att = useClassAttendance(
    sinif.map((s) => s.id),
    yilBasi(bugun),
  )
  const [sira, setSira] = useState<{ k: Sira; artan: boolean }>({ k: 'sira', artan: true })
  const [suz, setSuz] = useState<Isaret | 'hepsi'>('hepsi')
  const [busy, setBusy] = useState(false)

  const A = useMemo(() => {
    if (!dsq.data || !students.data) return null
    const netDusus = Number((settings.data?.bugun as { netDrop?: number } | undefined)?.netDrop) || 3
    return sinifAnalizi(dsq.data, sinif, {
      bugun,
      gorevler: tasks.data ?? [],
      gorusmeler: meetings.data ?? [],
      devamsizlik: att.data ?? [],
      ayar: { netDusus },
    })
  }, [dsq.data, students.data, sinif, tasks.data, meetings.data, att.data, settings.data, bugun])

  if (!A)
    return (
      <p className="m">
        <span className="spinner" aria-hidden="true" /> Yükleniyor…
      </p>
    )
  const ds = dsq.data!
  const dersAd = (c: Subject) => ds.subjects.find((x) => x.code === c)?.short ?? c
  const ad = new Map(sinif.map((s) => [s.id, s.full_name]))
  const val = (r: OgrenciSatiri): number | string => {
    switch (sira.k) {
      case 'sira':
        return r.son?.rank ?? 9999
      case 'ad':
        return r.student.full_name
      case 'net':
        return -(r.son?.score ?? r.son?.net ?? -9999)
      case 'degisim':
        return r.netDegisim ?? 9999
      case 'ort':
        return -(r.ortalamaNet ?? -9999)
      case 'tekrar':
        return -r.tekrarEden
      case 'hedef':
        return r.hedefFark ?? 9999
      case 'gorev':
        return -r.acikGorev
      case 'gorusme':
        return r.sonGorusme ?? '0000'
      case 'devamsiz':
        return -r.devamsiz
    }
  }
  const satirlar = A.satirlar
    .filter((r) => suz === 'hepsi' || r.isaretler.includes(suz))
    .sort((a, b) => {
      const x = val(a),
        y = val(b)
      const c = typeof x === 'string' ? x.localeCompare(String(y), 'tr') : x - (y as number)
      return sira.artan ? c : -c
    })
  const say = (i: Isaret) => A.satirlar.filter((r) => r.isaretler.includes(i)).length
  const sonD = A.denemeler.at(-1)
  const o = A.ozet
  const netFark = o.sonOrtNet !== null && o.oncekiOrtNet !== null ? o.sonOrtNet - o.oncekiOrtNet : null

  async function pdfIndir() {
    if (!A) return
    setBusy(true)
    try {
      const { sinifPdfBlob } = await import('@/lib/pdf')
      const blob = await sinifPdfBlob({
        school: info.data?.name ?? 'Buluş Küre Koleji',
        logo: ayar.bool('rapor.logo'),
        title: `${cls} · Sınıf analizi`,
        sub: `${dsq.title}${sonD ? ` · son deneme: ${sonD.name}` : ''}`,
        printed: trD(bugun),
        ozet: [
          ['Öğrenci', String(o.ogrenci)],
          ['Deneme', String(o.deneme)],
          ['Katılım', o.katilim === null ? '—' : `%${Math.round(o.katilim * 100)}`],
          ['Son ort. puan', o.sonOrtPuan === null ? '—' : fmt(o.sonOrtPuan)],
          ['Son ort. net', o.sonOrtNet === null ? '—' : `${fmt(o.sonOrtNet)}${netFark !== null ? ` (${signed(netFark)})` : ''}`],
        ],
        bulgular: A.bulgular.map((b) => b.metin),
        table: {
          head: ['Sıra', 'Öğrenci', 'Son puan', 'Son net', 'Net değişim', 'Sıra değişim', 'Ort. net', 'Zayıf ders', 'Tekrar', 'Hedefe göre', 'Görev', 'Son görüşme', 'Devamsız'],
          widths: [5, 17, 7, 7, 8, 8, 7, 9, 6, 8, 5, 8, 5],
          rows: [...A.satirlar]
            .sort((a, b) => (a.son?.rank ?? 9999) - (b.son?.rank ?? 9999))
            .map((r) => [
              r.son?.rank ? `${r.son.rank}.` : '—',
              r.student.full_name,
              r.son?.score != null ? fmt(r.son.score) : '—',
              r.son?.net != null ? fmt(r.son.net) : '—',
              r.netDegisim === null ? '—' : signed(r.netDegisim),
              r.siraDegisim === null ? '—' : r.siraDegisim > 0 ? `↑${r.siraDegisim}` : r.siraDegisim < 0 ? `↓${-r.siraDegisim}` : '±0',
              r.ortalamaNet === null ? '—' : fmt(r.ortalamaNet),
              r.zayifDers ? `${dersAd(r.zayifDers.code)} %${Math.round(r.zayifDers.pct)}` : '—',
              String(r.tekrarEden),
              r.hedefFark === null ? '—' : signed(r.hedefFark),
              r.acikGorev ? `${r.acikGorev}${r.gecikenGorev ? ` (${r.gecikenGorev} gecikmiş)` : ''}` : '0',
              r.sonGorusme ? trD(r.sonGorusme) : 'yok',
              String(r.devamsiz),
            ]),
        },
        konular: A.konular.slice(0, 10).map((k) => ({
          konu: `${outcomeCode(k.outcome)} ${k.outcome.title}`,
          oran: `${k.yanlis.length}/${k.soruldu}`,
          ogrenciler: k.yanlis.map((id) => ad.get(id) ?? '').join(', '),
        })),
      })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `sinif-analizi-${cls.replace(/[^\p{L}\p{N}]+/gu, '-')}.pdf`
      a.click()
      setTimeout(() => URL.revokeObjectURL(a.href), 60_000)
    } catch {
      toast('PDF oluşturulamadı.', 'warn')
    }
    setBusy(false)
  }

  return (
    <>
      <div className="head a">
        <div>
          <button type="button" className="btn ghost sm" onClick={onBack} style={{ marginBottom: 6 }}>
            <Icon name="back" size={16} stroke={2} /> Sınıflar
          </button>
          <h1 className="hd">{cls} · Sınıf analizi</h1>
          <p className="m" style={{ fontSize: 14, margin: '4px 0 0' }}>
            {dsq.title} · {A.denemeler.length} deneme{sonD ? ` · son: ${sonD.name} (${trD(sonD.exam_date)})` : ''}
          </p>
        </div>
        <div className="btns">
          {dsq.kind === 'YKS' && <Seg label="YKS oturumu" value={dsq.fam} onChange={dsq.setFam} options={[['TYT', 'TYT'], ['AYT', 'AYT']] as const} />}
          <button type="button" className="btn" onClick={pdfIndir} disabled={busy || !A.denemeler.length}>
            <Icon name="doc" size={16} /> {busy ? 'Hazırlanıyor…' : 'PDF indir'}
          </button>
        </div>
      </div>

      {!A.denemeler.length ? (
        <div className="empty a">Bu şubenin henüz yayında denemesi yok.</div>
      ) : (
        <>
          <section className="card a" data-testid="sinif-ozet" style={{ ['--d' as string]: 1, padding: '16px 20px', display: 'flex', gap: 26, flexWrap: 'wrap' }}>
            {[
              ['Öğrenci', String(o.ogrenci)],
              ['Deneme', String(o.deneme)],
              ['Katılım', o.katilim === null ? '—' : `%${Math.round(o.katilim * 100)}`],
              ['Son ort. puan', o.sonOrtPuan === null ? '—' : fmt(o.sonOrtPuan)],
            ].map(([k, v]) => (
              <div key={k}>
                <div className="m" style={{ fontSize: 13 }}>
                  {k}
                </div>
                <div className="big">{v}</div>
              </div>
            ))}
            <div>
              <div className="m" style={{ fontSize: 13 }}>
                Son ort. net
              </div>
              <div className="big">{o.sonOrtNet === null ? '—' : fmt(o.sonOrtNet)}</div>
              <Degisim v={netFark} />
            </div>
          </section>

          {A.bulgular.length > 0 && (
            <section className="card a" aria-label="Bulgular" data-testid="sinif-bulgular" style={{ ['--d' as string]: 2, padding: '14px 20px' }}>
              <b>Bulgular</b>
              <ul style={{ margin: '8px 0 0', paddingLeft: 0, listStyle: 'none', display: 'grid', gap: 6 }}>
                {A.bulgular.map((b, i) => (
                  <li key={i} style={{ display: 'flex', gap: 8, fontSize: 14 }}>
                    <span aria-hidden="true" style={{ color: b.tur === 'up' ? 'var(--primary)' : b.tur === 'down' ? 'var(--signal)' : 'var(--ink-muted)', fontWeight: 700 }}>
                      {b.tur === 'up' ? '↑' : b.tur === 'down' ? '↓' : '•'}
                    </span>
                    <span>{b.metin}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="card a" style={{ ['--d' as string]: 3, padding: 0, overflow: 'hidden' }} aria-label="Öğrenciler">
            <div style={{ padding: '14px 16px 6px', display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }} role="group" aria-label="Süzgeç">
              {SUZGEC.map((k) => (
                <button key={k} type="button" className={`chip ${suz === k ? 'up' : 'n'}`} aria-pressed={suz === k} onClick={() => setSuz(k)} style={{ cursor: 'pointer', border: 0, minHeight: 32 }}>
                  {k === 'hepsi' ? `Hepsi (${A.satirlar.length})` : `${ISARET_TR[k]} (${say(k)})`}
                </button>
              ))}
            </div>
            <div className="tbl" tabIndex={0} role="region" aria-label="Öğrenci tablosu (yana kaydırılabilir)">
              <table data-testid="sinif-tablo">
                <thead>
                  <tr>
                    {KOLON.map(([k, t]) => (
                      <th key={k} aria-sort={sira.k === k ? (sira.artan ? 'ascending' : 'descending') : undefined}>
                        <button type="button" className="thbtn" onClick={() => setSira((s) => ({ k, artan: s.k === k ? !s.artan : true }))}>
                          {t}
                          {sira.k === k ? (sira.artan ? ' ▲' : ' ▼') : ''}
                        </button>
                      </th>
                    ))}
                    <th>Gidişat</th>
                    <th>Zayıf ders</th>
                  </tr>
                </thead>
                <tbody>
                  {satirlar.map((r) => (
                    <tr key={r.student.id} className="click" tabIndex={0} onClick={() => nav(`/ogrenciler/${r.student.id}`)} onKeyDown={(e) => e.key === 'Enter' && nav(`/ogrenciler/${r.student.id}`)} data-testid="sinif-satir">
                      <td className="num" style={{ whiteSpace: 'nowrap' }}>
                        <b>{r.son?.rank ? `${r.son.rank}.` : '—'}</b>
                        {r.siraDegisim ? (
                          <div style={{ fontSize: 12 }}>
                            <Degisim v={r.siraDegisim} birim="sıra" />
                          </div>
                        ) : null}
                      </td>
                      <td style={{ minWidth: 230 }}>
                        <b style={{ whiteSpace: 'nowrap' }}>{r.student.full_name}</b>
                        {r.isaretler.filter((i) => i !== 'yukselis').length > 0 && (
                          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
                            {r.isaretler
                              .filter((i) => i !== 'yukselis')
                              .map((i) => (
                                <span key={i} className={`chip ${i === 'gorusme_yok' ? 'n' : 'down'}`} style={{ fontSize: 11, padding: '1px 7px' }}>
                                  {ISARET_TR[i]}
                                </span>
                              ))}
                          </div>
                        )}
                      </td>
                      <td className="num">
                        {r.son?.score != null ? fmt(r.son.score) : '—'}
                        <div className="m" style={{ fontSize: 12 }}>
                          {r.son?.net != null ? `${fmt(r.son.net)} net` : ''}
                        </div>
                      </td>
                      <td>
                        <Degisim v={r.netDegisim} />
                      </td>
                      <td className="num">{r.ortalamaNet === null ? '—' : fmt(r.ortalamaNet)}</td>
                      <td className="num">{r.tekrarEden}</td>
                      <td className="num">{r.hedefFark === null ? '—' : <Degisim v={r.hedefFark} birim="puan" />}</td>
                      <td className="num">
                        {r.acikGorev}
                        {r.gecikenGorev ? <div style={{ fontSize: 12, color: 'var(--signal-ink, var(--signal))' }}>{r.gecikenGorev} gecikmiş</div> : null}
                      </td>
                      <td>{r.sonGorusme ? trD(r.sonGorusme) : <span className="m">yok</span>}</td>
                      <td className="num">{r.devamsiz}</td>
                      <td>
                        <Gidisat r={r} />
                      </td>
                      <td>{r.zayifDers ? `${dersAd(r.zayifDers.code)} %${Math.round(r.zayifDers.pct)}` : '—'}</td>
                    </tr>
                  ))}
                  {!satirlar.length && (
                    <tr>
                      <td colSpan={KOLON.length + 2} className="m">
                        Bu süzgeçte öğrenci yok.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <Dropdown title="Deneme deneme sıralama" sub={`${A.denemeler.length} deneme`} icon={<Icon name="grid" size={22} />} delay={4}>
            <div className="tbl" tabIndex={0} role="region" aria-label="Sıralama tablosu (yana kaydırılabilir)">
              <table data-testid="sira-tablo">
                <thead>
                  <tr>
                    <th>Öğrenci</th>
                    {A.denemeler.map((e) => (
                      <th key={e.id} className="num" title={trD(e.exam_date)}>
                        {e.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[...A.satirlar]
                    .sort((a, b) => (a.son?.rank ?? 9999) - (b.son?.rank ?? 9999))
                    .map((r) => (
                      <tr key={r.student.id}>
                        <td>
                          <b>{r.student.full_name}</b>
                        </td>
                        {r.hucreler.map((h, i) => (
                          <td key={i} className="num">
                            {h.rank ? (
                              <>
                                {h.rank}.<div className="m" style={{ fontSize: 12 }}>{h.score != null ? fmt(h.score) : `${fmt(h.net!)} net`}</div>
                              </>
                            ) : (
                              <span className="m">girmedi</span>
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </Dropdown>

          <Dropdown title="Ders × öğrenci (son deneme)" sub="net / soru yüzdesi" icon={<Icon name="grid" size={22} />} delay={5}>
            <div className="tbl" tabIndex={0} role="region" aria-label="Ders öğrenci tablosu (yana kaydırılabilir)">
              <table>
                <thead>
                  <tr>
                    <th>Öğrenci</th>
                    {ds.subjects.map((d) => (
                      <th key={d.code} className="num">
                        {d.short}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {A.satirlar.map((r) => (
                    <tr key={r.student.id}>
                      <td>
                        <b>{r.student.full_name}</b>
                      </td>
                      {ds.subjects.map((d) => {
                        const p = r.dersYuzde[d.code] ?? null
                        return (
                          <td key={d.code} className="num">
                            <span style={{ ...heatStyle(p), display: 'inline-block', minWidth: 46, padding: '3px 6px', borderRadius: 6, textAlign: 'center' }}>{p === null ? '—' : `%${Math.round(p)}`}</span>
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                  <tr>
                    <td className="m">Sınıf ortalaması (net)</td>
                    {o.dersOrt.map((d) => (
                      <td key={d.code} className="num">
                        {d.son === null ? '—' : fmt(d.son)}
                        <div style={{ fontSize: 12 }}>{d.son !== null && d.onceki !== null ? <Degisim v={d.son - d.onceki} /> : null}</div>
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </Dropdown>

          <Dropdown title="Sınıfın ortak yanlış konuları" sub={sonD ? `son deneme: ${sonD.name}` : ''} icon={<Icon name="doc" size={22} />} delay={6}>
            {A.konular.length ? (
              <ul data-testid="sinif-konular" style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 10 }}>
                {A.konular.map((k) => (
                  <li key={k.outcome.code} style={{ fontSize: 14 }}>
                    <b>
                      {outcomeCode(k.outcome)} {k.outcome.title}
                    </b>{' '}
                    <span className="chip down">
                      {k.yanlis.length}/{k.soruldu} öğrenci yanlış
                    </span>
                    <div className="m" style={{ fontSize: 13 }}>
                      {dersAd(k.outcome.subject)} · {k.yanlis.map((id) => ad.get(id)).join(', ')}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="m">Son denemede güvenilir konu verisinde ortak yanlış yok.</p>
            )}
          </Dropdown>
        </>
      )}
    </>
  )
}
