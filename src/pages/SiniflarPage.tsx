import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { classHeat, fmt, indexResults, outcomeCode, repeats, subjectOf, type Dataset, type HeatRow, type Subject } from '@/lib/analiz'
import { useClasses, useRefresh, useStudents, useStudySessions } from '@/lib/data'
import { addDays, initials, nextDow, todayISO, trDW } from '@/lib/format'
import { DENEME_GRADE } from '@/lib/roles'
import { Icon } from '@/components/Icon'
import { Dropdown, Seg } from '@/components/Indicator'
import { Modal } from '@/components/Modal'
import { useToast } from '@/components/Toast'
import { SUBJECT_SHORT } from '@/components/Tasks'
import { useExamContext } from '@/lib/sinavBaglami'

const SLOTS = [
  ['09-10', '09.00–10.00'],
  ['10-11', '10.00–11.00'],
  ['11-12', '11.00–12.00'],
  ['12-13', '12.00–13.00'],
] as const
const slotTr = (s: string) => SLOTS.find((x) => x[0] === s)?.[1] ?? s

const heatStyle = (p: number | null): React.CSSProperties =>
  p === null
    ? { background: 'var(--paper)', border: '1px dashed var(--line-strong)', color: 'var(--ink-muted)' }
    : p < 40
      ? { background: 'var(--heat-1)', color: '#fff' }
      : p < 60
        ? { background: 'var(--heat-2)', color: 'var(--ink-fixed)' }
        : p < 80
          ? { background: 'var(--heat-3)', color: 'var(--ink-fixed)' }
          : { background: 'var(--heat-4)', color: '#fff' }

export default function SiniflarPage() {
  const students = useStudents()
  const sessions = useStudySessions()
  const toast = useToast()
  const refresh = useRefresh()
  const classes = useClasses()
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
  const [etut, setEtut] = useState<string[] | null>(null)

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

  if (!data && (dsq.isLoading || !classes.data || !students.data))
    return (
      <p className="m">
        <span className="spinner" aria-hidden="true" /> Yükleniyor…
      </p>
    )
  if (!data)
    return (
      <>
        <div className="head a">
          <h1 className="hd">Sınıflar</h1>
          <ClassPicker value={cls} onChange={setCls} options={all.map((c) => c.name)} />
        </div>
        <div className="empty a">Bu şube için deneme analizi yok (yalnız 5–12. sınıflarda deneme analizi yapılır).</div>
      </>
    )
  const { ds, ex, rows, worst, L, inClass, avg, lastIdx } = data
  const sd = subjectOf(ds, sub)
  const today = todayISO()
  const et = (sessions.data ?? []).filter((x) => x.class_name === cls && x.session_date >= today)

  const cancel = async (id: string) => {
    if (!window.confirm('Etüt iptal edilsin mi? Şubedeki öğrencilere ve velilerine bildirim gider.')) return
    const { error } = await supabase.from('study_sessions').delete().eq('id', id)
    if (error) return toast('İptal edilemedi.', 'warn')
    toast('Etüt iptal edildi')
    refresh('study_sessions')
  }

  return (
    <>
      <div className="head a">
        <h1 className="hd">Sınıflar</h1>
        <ClassPicker value={cls} onChange={setCls} options={all.map((c) => c.name)} />
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
                  <div className="mono m" style={{ fontSize: 11 }}>
                    {outcomeCode(r.outcome)}
                  </div>
                  <div style={{ fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={r.outcome.title}>
                    {r.outcome.title}
                  </div>
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
        <button className="btn gold" style={{ alignSelf: 'flex-start' }} onClick={() => setEtut(worst.map((w) => w.outcome.title))}>
          <Icon name="cal" size={18} />
          Etüt planla
        </button>
      </Dropdown>

      <Dropdown title="Planlanan etütler" sub={et.length ? `${et.length} etüt` : 'Etüt yok'} icon={<Icon name="cal" size={22} />} delay={5}>
        {et.length ? (
          et.map((x) => (
            <div className="kv" key={x.id} data-testid="etut-row">
              <span>
                <b>
                  {trDW(x.session_date)} · {slotTr(x.slot)}
                </b>
                <span className="m" style={{ display: 'block', fontSize: 13 }}>
                  {SUBJECT_SHORT[x.subject] ?? x.subject} · {x.topics.join(', ')}
                </span>
              </span>
              <button className="btn sm ghost" style={{ color: 'var(--signal)' }} onClick={() => cancel(x.id)}>
                İptal
              </button>
            </div>
          ))
        ) : (
          <span className="m">Henüz etüt planlanmadı.</span>
        )}
      </Dropdown>

      {konu && <KonuStudents ds={ds} row={konu} cls={cls} examName={L?.name ?? ''} lastIdx={lastIdx} onClose={() => setKonu(null)} />}
      {etut && <EtutModal cls={cls} subject={sd.base ?? sub} topics={etut} taken={(sessions.data ?? []).filter((x) => x.class_name === cls)} onClose={() => setEtut(null)} />}
    </>
  )
}

function KonuStudents({ ds, row, cls, examName, lastIdx, onClose }: { ds: Dataset; row: HeatRow; cls: string; examName: string; lastIdx: number; onClose: () => void }) {
  const nav = useNavigate()
  const students = useStudents()
  const wrong = row.cells[lastIdx]?.wrong ?? []
  return (
    <Modal
      title={row.outcome.title}
      sub={`${cls} · ${examName} · ${wrong.length} öğrenci yanlış yaptı`}
      onClose={onClose}
      footer={
        <button className="btn" onClick={onClose}>
          Kapat
        </button>
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

function EtutModal({
  cls,
  subject,
  topics,
  taken,
  onClose,
}: {
  cls: string
  subject: Subject
  topics: string[]
  taken: { session_date: string; slot: string }[]
  onClose: () => void
}) {
  const toast = useToast()
  const refresh = useRefresh()
  const sats = [0, 1, 2, 3].map((i) => addDays(nextDow(6), 7 * i))
  const [konular, setKonular] = useState(topics.map((ad, i) => ({ ad, on: i === 0, custom: false })))
  const [date, setDate] = useState(sats[0]!)
  const [slot, setSlot] = useState<string | null>(null)
  const [yeni, setYeni] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const busySlots = taken.filter((x) => x.session_date === date).map((x) => x.slot)

  const add = () => {
    const v = yeni.trim()
    if (!v) return setErr('Eklemek için önce konu adını yaz.')
    if (konular.some((k) => k.ad.toLocaleLowerCase('tr') === v.toLocaleLowerCase('tr'))) return setErr('Bu konu zaten listede.')
    setErr(null)
    setKonular([...konular, { ad: v, on: true, custom: true }])
    setYeni('')
  }
  const save = async () => {
    const ks = konular.filter((k) => k.on).map((k) => k.ad)
    if (!ks.length) return setErr('En az bir konu seç.')
    if (!slot) return setErr('Bir saat seç.')
    setBusy(true)
    const { data: u } = await supabase.auth.getUser()
    const { data: me } = await supabase.from('profiles').select('school_id').eq('id', u.user!.id).single()
    const { error } = await supabase.from('study_sessions').insert({ school_id: me!.school_id, class_name: cls, subject, topics: ks, session_date: date, slot, created_by: u.user!.id })
    setBusy(false)
    if (error) return setErr(error.code === '23505' ? 'Bu saat dolu.' : error.message)
    toast('Etüt planlandı · şubeye bildirim gitti')
    refresh('study_sessions')
    onClose()
  }

  return (
    <Modal
      title="Etüt planla"
      sub={`${cls} · ${SUBJECT_SHORT[subject] ?? subject}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Vazgeç
          </button>
          <button className="btn gold" disabled={busy} onClick={save}>
            Planla ve bildir
          </button>
        </>
      }
    >
      <div className="stack" style={{ gap: 6 }}>
        <span className="label">Konular</span>
        <div className="pick" role="group" aria-label="Konular">
          {konular.map((k, i) => (
            <button type="button" key={k.ad} aria-pressed={k.on} onClick={() => setKonular(konular.map((x, j) => (j === i ? { ...x, on: !x.on } : x)))}>
              <span className={`box ${k.on ? 'on' : ''}`}>{k.on && <Icon name="check" size={13} stroke={3} />}</span>
              <span style={{ flex: 1 }}>{k.ad}</span>
              {k.custom && <span className="chip n">Eklendi</span>}
            </button>
          ))}
        </div>
        <div className="kv" style={{ alignItems: 'flex-end' }}>
          <label className="field" htmlFor="etNew" style={{ flex: 1 }}>
            Başka konu ekle
            <input id="etNew" value={yeni} onChange={(e) => setYeni(e.target.value)} placeholder="Örn. Karışık deneme çözümü" onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), add())} />
          </label>
          <button type="button" className="btn soft" onClick={add}>
            <Icon name="plus" size={16} stroke={2.4} />
            Konu ekle
          </button>
        </div>
      </div>
      <label className="field" htmlFor="etDate">
        Cumartesi
        <select id="etDate" value={date} onChange={(e) => (setDate(e.target.value), setSlot(null))}>
          {sats.map((d) => (
            <option key={d} value={d}>
              {trDW(d)}
            </option>
          ))}
        </select>
      </label>
      <div className="stack" style={{ gap: 6 }}>
        <span className="label">Saat (1 saatlik)</span>
        <div className="btns" role="group" aria-label="Saat">
          {SLOTS.map(([k, l]) => {
            const full = busySlots.includes(k)
            return (
              <button key={k} type="button" className={`btn ${slot === k ? 'soft' : ''}`} aria-pressed={slot === k} disabled={full} title={full ? 'Bu saat dolu' : undefined} onClick={() => setSlot(k)}>
                {l}
                {full ? ' · dolu' : ''}
              </button>
            )
          })}
        </div>
      </div>
      {err && (
        <div className="err" role="alert">
          {err}
        </div>
      )}
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
