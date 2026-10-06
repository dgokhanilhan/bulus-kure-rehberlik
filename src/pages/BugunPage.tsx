import { Fragment, useMemo, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { DEFAULT_TODAY, attention, fmt, indexResults, isOverdue, totalNet, type AttentionKind } from '@/lib/analiz'
import { useDataset, useMeetings, useSchoolSettings, useStudents, useTasks, type Meeting } from '@/lib/data'
import { initials, localDate, localHM, todayISO, todayLong, trD, trDayShort } from '@/lib/format'
import { Icon } from '@/components/Icon'
import { Dropdown, Seg } from '@/components/Indicator'
import { MeetingModal, WITH_SHORT } from '@/components/Meetings'
import { LEVEL_COLOR, LEVEL_INK, gun, useAttendanceWatchlist } from '@/components/Devamsizlik'
import { useModules } from '@/lib/data'
import { useAuth } from '@/auth/AuthProvider'
import { usePanelLayout } from './PanelPage'

type Filter = 'all' | AttentionKind

export default function BugunPage() {
  const students = useStudents()
  const dsq = useDataset()
  const tasks = useTasks()
  const meetings = useMeetings()
  const settings = useSchoolSettings()
  const nav = useNavigate()
  const [filter, setFilter] = useState<Filter>('all')
  const [change, setChange] = useState<Meeting | null>(null)
  const mods = useModules()
  const { profile } = useAuth()
  const admin = profile?.role === 'admin'
  const layout = usePanelLayout('yonetim')
  const watch = useAttendanceWatchlist(mods.yoklama)
  const today = todayISO()

  const data = useMemo(() => {
    const ds = dsq.data
    if (!ds || !students.data || !tasks.data) return null
    const st = { ...DEFAULT_TODAY, ...((settings.data?.bugun as object) ?? {}) }
    // Bu veri kümesi yalnız LGS sınavlarını içerir. Görev gecikmeleri tüm sınıflarda izlenir.
    const lgsStudents = students.data.filter((s) => s.grade === 8)
    const all = attention(ds, lgsStudents, tasks.data, today, st)
    const idx = indexResults(ds.results)
    const L = ds.exams.at(-1)
    const P = ds.exams.at(-2)
    let up = 0,
      dn = 0,
      eq = 0,
      sum = 0,
      c = 0
    if (L && P)
      for (const s of lgsStudents) {
        const a = idx.get(`${L.id}|${s.id}`)
        const b = idx.get(`${P.id}|${s.id}`)
        if (a && b) {
          const d = totalNet(a) - totalNet(b)
          sum += d
          c++
          if (d > 1) up++
          else if (d < -1) dn++
          else eq++
        }
      }
    return { all, L, up, dn, eq, sum, c }
  }, [dsq.data, students.data, tasks.data, settings.data, today])

  if (!data)
    return (
      <p className="m">
        <span className="spinner" aria-hidden="true" /> Yükleniyor…
      </p>
    )

  const name = (sid: string) => students.data?.find((s) => s.id === sid)
  const list = data.all.filter((o) => filter === 'all' || o.kind === filter)
  const meet = (meetings.data ?? []).filter((g) => localDate(g.starts_at) >= today).sort((a, b) => a.starts_at.localeCompare(b.starts_at))
  const ts = tasks.data ?? []
  const over = ts.filter((t) => isOverdue(t, today))
  const open = ts.filter((t) => !t.completed_at && !isOverdue(t, today))
  const done = ts.filter((t) => t.completed_at)
  const { L, up, dn, eq, sum, c } = data
  const changing = change && name(change.student_id)

  // Yan kartlar: yöneticide sıra ve görünürlük Yönetim Merkezi → Ana sayfa düzeni → Yönetim (Bugün)'den (0024); rehberlikte sabit.
  const side: Record<'deneme' | 'devamsizlik' | 'gorusmeler' | 'gorevler', ReactNode> = {
    deneme: (
      <>
        {L && (
          <section className="dark a" style={{ ['--d' as string]: 2, padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="kv">
              <span className="label" style={{ color: 'var(--on-nav-muted)' }}>
                Son deneme · {L.name}
              </span>
              <span className="chip" style={{ background: 'var(--nav-active)', color: 'var(--on-nav)' }}>
                {trD(L.exam_date)}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 26, flexWrap: 'wrap' }}>
              <div>
                <div className="big">{c ? (sum / c >= 0 ? '+' : '') + fmt(sum / c) : '—'}</div>
                <div className="m" style={{ fontSize: 13 }}>
                  ortalama net değişimi
                </div>
              </div>
              <div>
                <div className="big">
                  {up}
                  <span className="m" style={{ fontSize: 18 }}>
                    {' '}
                    / {c}
                  </span>
                </div>
                <div className="m" style={{ fontSize: 13 }}>
                  yükseldi
                </div>
              </div>
            </div>
            {c > 0 && (
              <div style={{ display: 'flex', height: 10, borderRadius: 99, overflow: 'hidden', gap: 2 }} aria-hidden="true">
                <i className="bar-g" style={{ width: `${(up / c) * 100}%`, background: '#7cc2b5' }} />
                <i className="bar-g" style={{ width: `${(eq / c) * 100}%`, background: '#c9d2d4' }} />
                <i className="bar-g" style={{ width: `${(dn / c) * 100}%`, background: '#f0a36b' }} />
              </div>
            )}
            <div className="kv m" style={{ fontSize: 12 }}>
              <span>↑ {up} yükseldi</span>
              <span>{eq} sabit</span>
              <span>↓ {dn} düştü</span>
            </div>
          </section>
        )}
      </>
    ),
    devamsizlik: (
      <>
        {mods.yoklama && (watch.data ?? []).length > 0 && (
          <section className="card a" style={{ ['--d' as string]: 3, padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }} aria-label="Devamsızlık sınırına yaklaşanlar">
            <h2 style={{ fontSize: 16 }}>Devamsızlık sınırına yaklaşanlar</h2>
            {watch.data!.slice(0, 8).map((w) => (
              <button key={w.student_id} className="srow" style={{ padding: '6px 2px', borderTop: 0 }} onClick={() => nav(`/ogrenciler/${w.student_id}?sekme=devamsizlik`)} data-testid="watch-row">
                <span style={{ width: 8, height: 8, borderRadius: 99, background: LEVEL_COLOR[w.level], flexShrink: 0 }} aria-hidden="true" />
                <span style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                  <b style={{ fontSize: 14 }}>{w.full_name}</b>{' '}
                  <span className="m" style={{ fontSize: 12 }}>
                    {w.class_name}
                  </span>
                  <span style={{ display: 'block', fontSize: 12, color: LEVEL_INK[w.level], fontWeight: 600 }}>
                    {gun(w.used)}/{w.lim} · {w.used >= w.lim ? 'sınıra ulaştı' : `⚠ sınıra ${gun(w.lim - w.used)} gün kaldı`}
                  </span>
                </span>
              </button>
            ))}
            {watch.data!.length > 8 && <span className="m" style={{ fontSize: 12 }}>+{watch.data!.length - 8} öğrenci daha</span>}
          </section>
        )}
      </>
    ),
    gorusmeler: (
      <>
        <Dropdown title="Görüşmeler" sub={meet.length ? `${meet.length} yaklaşan görüşme` : 'Yaklaşan görüşme yok'} icon={<Icon name="cal" size={22} />} delay={3}>
          {meet.length ? (
            meet.map((g) => (
              <div className="kv" style={{ alignItems: 'center' }} key={g.id} data-testid="today-meeting">
                <span
                  style={{ width: 62, textAlign: 'center', fontSize: 12, fontWeight: 600, color: 'var(--primary)', background: 'var(--primary-soft)', borderRadius: 10, padding: '6px 0', lineHeight: 1.3, flexShrink: 0 }}
                >
                  {trDayShort(localDate(g.starts_at))}
                  <br />
                  {localHM(g.starts_at)}
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <b style={{ display: 'block', fontSize: 14 }}>{name(g.student_id)?.full_name}</b>
                  <span className="m" style={{ fontSize: 12 }}>
                    {trD(localDate(g.starts_at))} · {WITH_SHORT[g.with_whom]}
                  </span>
                </span>
                <button className="btn sm" onClick={() => setChange(g)}>
                  Değiştir
                </button>
              </div>
            ))
          ) : (
            <span className="m">Öğrenci dosyasından görüşme planlayabilirsin.</span>
          )}
        </Dropdown>
      </>
    ),
    gorevler: (
      <>
        <Dropdown
          title="Görevler"
          sub={`${over.length} gecikmiş · ${open.length} devam ediyor`}
          icon={<Icon name="task" size={22} />}
          delay={4}
          right={over.length ? <span className="chip down">↓ {over.length}</span> : undefined}
        >
          <div className="kv">
            <span>Tamamlanan</span>
            <b className="mono">{done.length}</b>
          </div>
          <div className="kv">
            <span>Devam eden</span>
            <b className="mono">{open.length}</b>
          </div>
          <div className="kv" style={{ color: 'var(--signal)' }}>
            <span>Gecikmiş</span>
            <b className="mono">{over.length}</b>
          </div>
          {over.map((t) => (
            <button key={t.id} className="btn sm warn" style={{ justifyContent: 'space-between' }} onClick={() => nav(`/ogrenciler/${t.student_id}?sekme=gorevler`)}>
              <span>
                {name(t.student_id)?.full_name} · {t.topic}
              </span>
              <span>
                {t.solved}/{t.question_count}
              </span>
            </button>
          ))}
        </Dropdown>
      </>
    ),
  }
  const order = admin ? layout.filter((c) => c.on && c.id in side).map((c) => c.id as keyof typeof side) : (Object.keys(side) as (keyof typeof side)[])

  return (
    <>
      <div className="head a">
        <div className="stack" style={{ gap: 4 }}>
          <span className="m" style={{ fontWeight: 500 }}>
            {todayLong()}
          </span>
          <h1 className="hd">Bugün {data.all.length} öğrenciye bakmalısın.</h1>
        </div>
        <Link className="btn pri" to="/denemeler">
          <Icon name="up" size={18} stroke={2} />
          Deneme yükle
        </Link>
      </div>
      <div className="cols">
        <section className="stack">
          <Seg
            className="a"
            style={{ ['--d' as string]: 1, alignSelf: 'flex-start' }}
            label="Filtre"
            value={filter}
            onChange={setFilter}
            options={[
              ['all', 'Tümü'],
              ['down', 'Risk'],
              ['n', 'Takip'],
              ['up', 'Gelişim'],
            ]}
          />
          <div className="card a" style={{ ['--d' as string]: 2, overflow: 'hidden' }}>
            {list.length ? (
              list.map((o, i) => {
                const s = name(o.sid)
                if (!s) return null
                return (
                  <button key={`${o.sid}-${o.tag}-${i}`} className="srow" onClick={() => nav(`/ogrenciler/${s.id}`)} data-testid="attention-row">
                    <span className="av s">{initials(s.full_name)}</span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        <b>{s.full_name}</b>
                        <span className="m" style={{ fontSize: 13 }}>
                          {s.class_name}
                        </span>
                        <span className={`chip ${o.kind}`}>
                          {o.kind === 'down' ? '↓ ' : o.kind === 'up' ? '↑ ' : ''}
                          {o.tag}
                        </span>
                      </span>
                      <span style={{ display: 'block', fontSize: 14, color: 'var(--ink-2)' }}>{o.short}</span>
                    </span>
                    <span className="m">
                      <Icon name="right" size={18} stroke={2} />
                    </span>
                  </button>
                )
              })
            ) : (
              <div className="empty">Bu filtrede öğrenci yok.</div>
            )}
          </div>
        </section>
        <aside className="stack" style={{ gap: 14 }}>
          {order.map((k) => (
            <Fragment key={k}>{side[k]}</Fragment>
          ))}
        </aside>
      </div>
      {change && changing && <MeetingModal student={changing} edit={change} onClose={() => setChange(null)} />}
    </>
  )
}
