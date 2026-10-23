import { useMemo, useState } from 'react'
import { VeriDurumu } from '@/components/VeriDurumu'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { classHeat, fmt, indexResults, outcomeCode, repeats, subjectOf, type Dataset, type HeatRow, type Subject } from '@/lib/analiz'
import { useClasses, useModules, useStudents } from '@/lib/data'
import { initials, todayISO, trDW } from '@/lib/format'
import { DENEME_GRADE } from '@/lib/roles'
import { Icon } from '@/components/Icon'
import { Dropdown, Seg } from '@/components/Indicator'
import { Modal } from '@/components/Modal'
import { useExamContext } from '@/lib/sinavBaglami'
import { GrupEtut } from '@/components/GrupEtut'
import { kademeOfGrade } from '@/lib/etutGrup'
import { useSinifEtutleri } from '@/lib/etutData'
import SinifAnalizi, { heatStyle } from './SinifAnalizi'

export default function SiniflarPage() {
  const students = useStudents()
  const classes = useClasses()
  const mods = useModules()
  // Şube listesi gerçek sınıf tablosundan (denemesi olmayan şube de seçilebilir); ilk açılış 8. sınıf (mevcut davranış)
  const all = (classes.data ?? []).filter((c) => c.name)
  const [pick, setCls] = useState<string | null>(null)
  const cls = pick ?? all.find((c) => c.grade === DENEME_GRADE)?.name ?? all[0]?.name ?? ''
  const cg = all.find((c) => c.name === cls)?.grade ?? null
  // Seçilen şubenin bağlamı: 8 → LGS veri seti (değişmedi); 5–7 okul denemeleri; 9–12 seçili TYT / AYT
  const dsq = useExamContext(cg, !!classes.data)
  const [pickSub, setSub] = useState<Subject>('MAT')
  const subs = dsq.data?.subjects ?? []
  const sub = subs.some((x) => x.code === pickSub) ? pickSub : (subs.find((x) => x.code === 'MAT') ?? subs[0])?.code ?? pickSub
  const [konu, setKonu] = useState<HeatRow | null>(null)
  // Sınıf analizi görünümü adreste (?gorunum=analiz): tarayıcının geri tuşu Sınıflar'a döner
  const [sp, setSp] = useSearchParams()
  const analiz = sp.get('gorunum') === 'analiz'
  // Gruba etüt: seçili konu kodları ve başlangıç kapsamı (son kaç deneme)
  const [etut, setEtut] = useState<{ secili: string[]; son: number } | null>(null)
  const sinifEtut = useSinifEtutleri(cls || null, todayISO())

  const data = useMemo(() => {
    const ds = dsq.data
    if (!ds || !students.data) return null
    const inClass = students.data.filter((s) => s.class_name === cls)
    const ids = inClass.map((s) => s.id)
    // LGS: son 5 deneme (mevcut). Genel: bu şubenin sonucu olan son 5 deneme (başka sınıf düzeyinin denemesi sütun olmaz)
    const mine = new Set(ds.results.filter((r) => ids.includes(r.student_id)).map((r) => r.exam_id))
    const ex = (dsq.kind === 'LGS' ? ds.exams : ds.exams.filter((e) => mine.has(e.id))).slice(-5)
    const rows = classHeat(ds, ids, sub, ex)
    const lastIdx = ex.length - 1
    const worst = rows
      .filter((r) => r.cells[lastIdx]?.p != null)
      .sort((a, b) => a.cells[lastIdx]!.p! - b.cells[lastIdx]!.p!)
      .slice(0, 3)
    const idx = indexResults(ds.results)
    const L = ex.at(-1)
    const nets = L ? ids.map((id) => idx.get(`${L.id}|${id}`)?.subjects[sub]?.net).filter((n): n is number => n != null) : []
    return { ds, ex, rows, worst, L, inClass, avg: nets.length ? nets.reduce((a, b) => a + b, 0) / nets.length : null, lastIdx, idx }
  }, [dsq.data, dsq.kind, students.data, cls, sub])

  if (analiz && cls) return <SinifAnalizi key={cls} cls={cls} grade={cg} onBack={() => setSp({})} />
  const analizDugme = cls ? (
    <button type="button" className="btn pri" onClick={() => setSp({ gorunum: 'analiz' })}>
      <Icon name="grid" size={16} /> Sınıf analizi
    </button>
  ) : null

  if (!data && (dsq.isLoading || dsq.isError || !classes.data || !students.data))
    return <VeriDurumu sorgular={[dsq, classes, students]} />
  if (!data)
    return (
      <>
        <div className="head a">
          <h1 className="hd">Sınıflar</h1>
          <ClassPicker value={cls} onChange={setCls} options={all.map((c) => c.name)} />
          {analizDugme}
        </div>
        <div className="empty a">Bu şube için deneme analizi yok (yalnız 5–12. sınıflarda deneme analizi yapılır).</div>
      </>
    )
  const { ds, ex, rows, worst, L, inClass, avg, lastIdx } = data
  const sd = subjectOf(ds, sub)
  const et = sinifEtut.data ?? []
  // Etüt: 5–12. sınıflar ve modül açıkken; konular en zorlanılandan başlayarak (son denemedeki doğru oranı)
  const kademe = mods.etut ? kademeOfGrade(cg) : null
  const ogrAdi = (id: string) => students.data?.find((x) => x.id === id)?.full_name ?? ''
  const konuKaynak = [...rows]
    .sort((a, b) => (a.cells[lastIdx]?.p ?? 101) - (b.cells[lastIdx]?.p ?? 101))
    .map((r) => ({ code: r.outcome.code, title: r.outcome.title, wrongByExam: r.cells.map((c) => c.wrong) }))

  return (
    <>
      <div className="head a">
        <h1 className="hd">Sınıflar</h1>
        <ClassPicker value={cls} onChange={setCls} options={all.map((c) => c.name)} />
        {analizDugme}
      </div>
      {dsq.kind !== 'LGS' && (
        <div className="kv a" style={{ ['--d' as string]: 1, alignItems: 'center' }} data-testid="sinav-baglami">
          <h2 className="sec">{dsq.title}</h2>
          {dsq.kind === 'YKS' && <Seg label="YKS oturumu" value={dsq.fam} onChange={dsq.setFam} options={[['TYT', 'TYT'], ['AYT', 'AYT']] as const} />}
        </div>
      )}
      {ds.subjects.length > 0 && (
        <div className="a" style={{ ['--d' as string]: 1, overflowX: 'auto', alignSelf: 'flex-start', maxWidth: '100%' }}>
          <Seg label="Ders" value={sub} onChange={setSub} options={ds.subjects.map((s) => [s.code, s.short] as const)} />
        </div>
      )}
      <section className="card a" style={{ ['--d' as string]: 2, padding: '16px 20px', display: 'flex', gap: 26, alignItems: 'center', flexWrap: 'wrap' }}>
        <div>
          <div className="m" style={{ fontSize: 13 }}>
            Ortalama net{L ? ` · ${L.name}` : ''}
          </div>
          <div className="big">
            {avg != null ? fmt(avg) : '—'}
            <span className="m" style={{ fontSize: 16 }}>
              {' '}
              / {sd.q}
            </span>
          </div>
        </div>
        <div>
          <div className="m" style={{ fontSize: 13 }}>
            Öğrenci
          </div>
          <div className="big">{inClass.length}</div>
        </div>
        <div style={{ minWidth: 0 }}>
          <div className="m" style={{ fontSize: 13 }}>
            En zor konu
          </div>
          <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--signal)' }}>{worst[0] ? `↓ ${worst[0].outcome.title} · %${worst[0].cells[lastIdx]!.p}` : '—'}</div>
        </div>
      </section>

      <section className="card a" style={{ ['--d' as string]: 3, padding: 20, display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
        {rows.length ? (
          <div style={{ overflowX: 'auto', padding: '4px 2px' }} role="table" aria-label={`${cls} ${sd.ad} konu doğru oranları`}>
            <div className="heat" role="row" style={{ ['--n' as string]: ex.length, fontSize: 12, fontWeight: 600, color: 'var(--ink-muted)' }}>
              <span role="columnheader">KONU</span>
              {ex.map((e) => (
                <span key={e.id} role="columnheader" style={{ textAlign: 'center' }}>
                  {e.name}
                </span>
              ))}
            </div>
            {rows.map((r, ri) => (
              <div key={r.outcome.code} className="heat" role="row" style={{ ['--n' as string]: ex.length, marginTop: 6 }}>
                <div style={{ minWidth: 0 }} role="rowheader">
                  <button
                    type="button"
                    className="heat-konu"
                    onClick={() => setKonu(r)}
                    title={`${r.outcome.title} · yanlış yapan öğrenciler`}
                    data-testid="heat-konu"
                  >
                    <span className="mono m" style={{ fontSize: 11, display: 'block' }}>
                      {outcomeCode(r.outcome)}
                    </span>
                    <span style={{ fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block' }}>{r.outcome.title}</span>
                  </button>
                </div>
                {r.cells.map((c, ci) => (
                  <span key={ci} role="cell" className="c pp" style={{ ['--d' as string]: ri * 5 + ci, ...heatStyle(c.p) }}>
                    {c.p === null ? '—' : `%${c.p}`}
                  </span>
                ))}
              </div>
            ))}
          </div>
        ) : (
          <div className="empty">{ex.length ? 'Bu ders için güvenilir konu bilgisi olan deneme yok.' : dsq.kind === 'YKS' ? `Bu şubede yayınlanmış ${dsq.fam} denemesi yok.` : 'Bu şubede yayınlanmış deneme yok.'}</div>
        )}
        <div className="legend" style={{ marginTop: 8 }}>
          <span>Doğru oranı</span>
          <i style={{ background: 'var(--heat-1)' }} />
          0–39
          <i style={{ background: 'var(--heat-2)' }} />
          40–59
          <i style={{ background: 'var(--heat-3)' }} />
          60–79
          <i style={{ background: 'var(--heat-4)' }} />
          80+
          <i style={{ border: '1px dashed var(--line-strong)' }} />
          konu okunamadı
        </div>
      </section>

      <Dropdown
        title="En çok zorlanılan 3 konu"
        sub={worst.map((w) => w.outcome.title).join(' · ') || 'Veri yok'}
        icon={<span style={{ color: 'var(--signal)', display: 'inline-flex' }}><Icon name="flag" size={22} /></span>}
        delay={4}
        defaultOpen
      >
        {worst.map((w) => (
          <button key={w.outcome.code} className="srow" style={{ border: '1px solid var(--line)', borderRadius: 12 }} onClick={() => setKonu(w)} data-testid="hard-topic">
            <span className="mono" style={{ fontSize: 20, width: 56, color: 'var(--signal)' }}>
              %{w.cells[lastIdx]!.p}
            </span>
            <span style={{ flex: 1 }}>
              <b style={{ display: 'block' }}>{w.outcome.title}</b>
              <span className="m" style={{ fontSize: 13 }}>
                {w.cells[lastIdx]!.wrong.length} öğrenci {L?.name}'de yanlış yaptı · listeyi gör
              </span>
            </span>
            <Icon name="right" size={18} stroke={2} />
          </button>
        ))}
        {kademe && worst.length > 0 && (
          <button className="btn gold" style={{ alignSelf: 'flex-start' }} onClick={() => setEtut({ secili: worst.map((w) => w.outcome.code), son: 1 })}>
            <Icon name="cal" size={18} />
            Etüt planla
          </button>
        )}
      </Dropdown>

      {kademe && (
        <Dropdown title="Planlanan etütler" sub={et.length ? `${et.length} etüt` : 'Etüt yok'} icon={<Icon name="cal" size={22} />} delay={5}>
          {et.length ? (
            et.map((x) => (
              <div className="kv" key={x.hucre_id} data-testid="etut-row">
                <span>
                  <b>
                    {trDW(x.tarih)} · {x.ders}. ders{x.saat ? ` (${x.saat.bas}–${x.saat.bit})` : ''}
                  </b>
                  <span className="m" style={{ display: 'block', fontSize: 13 }}>
                    {[x.konu, x.teacher_name, `${x.ogrenciler.length} öğrenci`].filter(Boolean).join(' · ')}
                  </span>
                </span>
                <span className={`chip ${x.durum === 'yayinda' ? 'up' : 'n'}`}>{x.durum === 'yayinda' ? 'Yayında' : 'Taslak'}</span>
              </div>
            ))
          ) : (
            <span className="m">Bu sınıfın yaklaşan etüdü yok. Konu satırına tıklayıp yanlış yapan öğrencilere etüt planlayabilirsin.</span>
          )}
        </Dropdown>
      )}

      {konu && (
        <KonuStudents
          ds={ds}
          row={konu}
          cls={cls}
          examName={L?.name ?? ''}
          lastIdx={lastIdx}
          onClose={() => setKonu(null)}
          onEtut={kademe ? () => (setEtut({ secili: [konu.outcome.code], son: 1 }), setKonu(null)) : undefined}
        />
      )}
      {etut && kademe && (
        <GrupEtut
          baslik={`${cls} · ${sd.ad}`}
          kademe={kademe}
          dersAdi={sd.ad}
          classId={all.find((c) => c.name === cls)?.id}
          konular={konuKaynak}
          secili={etut.secili}
          son={etut.son}
          denemeler={ex.map((e) => e.name)}
          ogrenciAdi={ogrAdi}
          onClose={() => setEtut(null)}
        />
      )}
    </>
  )
}

function KonuStudents({
  ds,
  row,
  cls,
  examName,
  lastIdx,
  onClose,
  onEtut,
}: {
  ds: Dataset
  row: HeatRow
  cls: string
  examName: string
  lastIdx: number
  onClose: () => void
  onEtut?: () => void
}) {
  const nav = useNavigate()
  const students = useStudents()
  const wrong = row.cells[lastIdx]?.wrong ?? []
  return (
    <Modal
      title={row.outcome.title}
      sub={`${cls} · ${examName} · ${wrong.length} öğrenci yanlış yaptı`}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Kapat
          </button>
          {onEtut && wrong.length > 0 && (
            <button className="btn gold" onClick={onEtut}>
              <Icon name="cal" size={16} /> Bu öğrencilere etüt planla
            </button>
          )}
        </>
      }
    >
      <div style={{ margin: '-18px -22px' }}>
        {wrong.length ? (
          wrong.map((sid) => {
            const s = students.data?.find((x) => x.id === sid)
            const rp = repeats(ds, sid).find((r) => r.outcome.code === row.outcome.code)
            return (
              <button key={sid} className="srow" onClick={() => nav(`/ogrenciler/${sid}?sekme=konular`)} data-testid="konu-student">
                <span className="av s">{s ? initials(s.full_name) : ''}</span>
                <span style={{ flex: 1 }}>
                  <b style={{ display: 'block' }}>{s?.full_name}</b>
                  <span className="m" style={{ fontSize: 13 }}>
                    {rp ? `${rp.count} denemede yanlış` : 'Bu denemede yanlış'}
                  </span>
                </span>
                {rp && rp.count >= 2 && <span className="chip down">↓ Tekrar</span>}
                <Icon name="right" size={18} stroke={2} />
              </button>
            )
          })
        ) : (
          <div className="empty" style={{ margin: 16 }}>
            Kimse yanlış yapmadı.
          </div>
        )}
      </div>
    </Modal>
  )
}

/** Şube seçici: az şubede düğmeler (mevcut görünüm), çok şubede açılır liste. */
function ClassPicker({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: string[] }) {
  if (options.length <= 6) return <Seg label="Şube" value={value} onChange={onChange} options={options.map((c) => [c, c] as const)} />
  return (
    <label className="field" htmlFor="clsPick" style={{ minWidth: 140 }}>
      <span className="label">Şube</span>
      <select id="clsPick" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((c) => <option key={c} value={c}>{c}</option>)}
      </select>
    </label>
  )
}
