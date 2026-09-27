// Veli ve öğrenci ekranları: yalnız bağlı öğrencinin verisi (RLS). Sınıf sıralaması yok (CLAUDE.md §3).
// Hitap: öğrenciye "sen", veliye "siz".
import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '@/auth/AuthProvider'
import { SUBJECT, fmt, indexResults, studentExams, totalNet } from '@/lib/analiz'
import { useDataset, useMeetings, useNotes, useReports, useStudents, useStudySessions, useTasks } from '@/lib/data'
import { ago, gen, localDate, localHM, todayISO, trD, trDW } from '@/lib/format'
import type { Student } from '@/lib/types'
import { Icon } from '@/components/Icon'
import { Dropdown, Seg } from '@/components/Indicator'
import { LineChart } from '@/components/LineChart'
import { TaskList } from '@/components/Tasks'
import { MeetingList } from '@/components/Meetings'
import { ExamModal } from '@/components/ExamModal'
import { useOpenReport } from '@/components/Report'

/** Veli birden çok çocuğa bağlı olabilir: ?cocuk= ile seçilir. */
function useMyStudent() {
  const { profile } = useAuth()
  const students = useStudents()
  const [sp, setSp] = useSearchParams()
  const list = students.data ?? []
  const s = profile?.role === 'ogrenci' ? list.find((x) => x.id === profile.student_id) : (list.find((x) => x.id === sp.get('cocuk')) ?? list[0])
  return { s, list, loading: students.isLoading, choose: (id: string) => setSp({ cocuk: id }, { replace: true }), veli: profile?.role === 'veli' }
}

function ChildPicker({ list, s, choose }: { list: Student[]; s: Student; choose: (id: string) => void }) {
  if (list.length < 2) return null
  return <Seg className="a" label="Çocuk" value={s.id} onChange={choose} options={list.map((x) => [x.id, x.full_name.split(' ')[0]!] as const)} style={{ alignSelf: 'flex-start' }} />
}

function Wait({ loading }: { loading: boolean }) {
  return loading ? (
    <p className="m">
      <span className="spinner" aria-hidden="true" /> Yükleniyor…
    </p>
  ) : (
    <div className="empty">Bağlı öğrenci bulunamadı. Okul rehberlik servisiyle görüşebilirsiniz.</div>
  )
}

export function OzetPage() {
  const { profile } = useAuth()
  const { s, list, loading, choose, veli } = useMyStudent()
  const dsq = useDataset()
  const tasks = useTasks(s?.id)
  const meetings = useMeetings(s?.id)
  const reports = useReports(s?.id)
  const openReport = useOpenReport()
  const sessions = useStudySessions()
  const notes = useNotes(s?.id)
  const [exam, setExam] = useState<string | null>(null)
  const today = todayISO()
  const ex = useMemo(() => (dsq.data && s ? studentExams(dsq.data, s.id, indexResults(dsq.data.results)) : []), [dsq.data, s])

  if (!s || !dsq.data) return <Wait loading={loading || dsq.isLoading} />
  const first = s.full_name.split(' ')[0]!
  const L = ex.at(-1)
  const P = ex.at(-2)
  const nets = ex.map((x) => totalNet(x.result))
  const d = L && P ? totalNet(L.result) - totalNet(P.result) : null
  const openT = (tasks.data ?? []).filter((t) => !t.completed_at)
  const gs = (meetings.data ?? []).filter((g) => localDate(g.starts_at) >= today).sort((a, b) => a.starts_at.localeCompare(b.starts_at))
  const et = (sessions.data ?? []).filter((x) => x.class_name === s.class_name && x.session_date >= today)
  const rs = reports.data ?? []
  const ns = notes.data ?? []
  const cur = exam ? ex.findIndex((x) => x.exam.id === exam) : -1

  return (
    <>
      <div className="head a">
        <div className="stack" style={{ gap: 4 }}>
          <span className="m" style={{ fontWeight: 500 }}>
            {veli ? `${profile?.declared.relation ?? 'Veli'} · ${profile?.full_name}` : `${s.class_name} · No ${s.school_no ?? '—'}`}
          </span>
          <h1 className="hd">{veli ? `${gen(first)} durumu` : `Merhaba ${first}`}</h1>
        </div>
      </div>
      <ChildPicker list={list} s={s} choose={choose} />
      <div className="stats">
        <div className="card stat a lift" style={{ ['--d' as string]: 1 }}>
          <span className="m" style={{ fontSize: 13 }}>
            Son deneme
          </span>
          <span style={{ fontSize: 18, fontWeight: 600 }}>{L?.exam.name ?? '—'}</span>
          <span className="m" style={{ fontSize: 13 }}>
            {L ? trD(L.exam.exam_date) : ''}
          </span>
        </div>
        <div className="card stat a lift" style={{ ['--d' as string]: 2 }}>
          <span className="m" style={{ fontSize: 13 }}>
            Toplam net
          </span>
          <span className="big" style={{ fontSize: 27 }}>
            {L ? fmt(totalNet(L.result), 2) : '—'}
          </span>
          <span style={{ fontSize: 13, fontWeight: 600, color: d != null && d < 0 ? 'var(--signal)' : 'var(--primary)' }}>
            {d != null ? `${d >= 0 ? '↑' : '↓'} ${fmt(Math.abs(d))} önceki denemeye göre` : ''}
          </span>
        </div>
        <div className="card stat a lift" style={{ ['--d' as string]: 3 }}>
          <span className="m" style={{ fontSize: 13 }}>
            Puan
          </span>
          <span className="big" style={{ fontSize: 27 }}>
            {L?.result.score != null ? fmt(L.result.score) : '—'}
          </span>
          <span className="m" style={{ fontSize: 13 }}>
            {s.target_score ? `Hedef ${s.target_score}` : ''}
          </span>
        </div>
        <div className="card stat a lift" style={{ ['--d' as string]: 4 }}>
          <span className="m" style={{ fontSize: 13 }}>
            Açık görev
          </span>
          <span className="big" style={{ fontSize: 27 }}>
            {openT.length}
          </span>
          <Link className="btn ghost sm" style={{ alignSelf: 'flex-start', padding: 0 }} to={`/gorevler${veli && list.length > 1 ? `?cocuk=${s.id}` : ''}`}>
            Görevlere git →
          </Link>
        </div>
      </div>
      <div className="cols">
        <section className="card a" style={{ ['--d' as string]: 3, padding: 20, display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
          <h2 className="sec">Gelişim</h2>
          <div style={{ overflowX: 'auto' }}>
            <div style={{ minWidth: 460 }}>
              {ex.length ? <LineChart values={nets} labels={ex.map((x) => x.exam.name)} onSelect={(i) => setExam(ex[i]!.exam.id)} /> : <div className="empty">Henüz deneme yok.</div>}
            </div>
          </div>
          <span className="m" style={{ fontSize: 13 }}>
            {veli
              ? `Deneme adına tıklayarak ders sonuçlarını görebilirsiniz. ${first} yalnızca kendi önceki sonuçlarıyla karşılaştırılır.`
              : 'Deneme adına tıklayarak ders sonuçlarını görebilirsin. Yalnızca kendi önceki sonuçlarınla karşılaştırılırsın.'}
          </span>
        </section>
        <aside className="stack" style={{ gap: 12 }}>
          <Dropdown title="Raporlar" sub={rs.length ? `${rs.length} rapor` : 'Henüz rapor yok'} icon={<Icon name="doc" size={22} />} delay={4} right={rs.length ? <span className="chip gold">{rs.length}</span> : undefined}>
            {rs.length ? (
              rs.map((r) => (
                <button key={r.id} className="btn sm" style={{ justifyContent: 'space-between' }} onClick={() => openReport({ id: r.id })}>
                  <span>{dsq.data!.exams.find((e) => e.id === r.exam_id)?.name} raporu</span>
                  <span className="m">{r.sent_at ? ago(r.sent_at) : ''}</span>
                </button>
              ))
            ) : (
              <span className="m">Rapor gönderildiğinde burada görünür.</span>
            )}
          </Dropdown>
          <Dropdown title="Görüşmeler" sub={gs.length ? `${gs.length} yaklaşan görüşme` : 'Yaklaşan görüşme yok'} icon={<Icon name="cal" size={22} />} delay={5}>
            {gs.length ? (
              gs.map((g) => (
                <div className="kv" key={g.id}>
                  <b style={{ fontSize: 14 }}>
                    {trDW(localDate(g.starts_at))} · {localHM(g.starts_at)}
                  </b>
                  <Link className="btn sm" to="/gorusmeler">
                    Yanıtla
                  </Link>
                </div>
              ))
            ) : (
              <span className="m">Planlanan görüşme yok.</span>
            )}
          </Dropdown>
          <Dropdown title="Cumartesi etütleri" sub={et.length ? `${et.length} etüt` : 'Etüt yok'} icon={<Icon name="flag" size={22} />} delay={6}>
            {et.length ? (
              et.map((x) => (
                <div key={x.id}>
                  <b style={{ fontSize: 14 }}>
                    {trDW(x.session_date)} · {x.slot.replace('-', '.00–')}.00
                  </b>
                  <span className="m" style={{ display: 'block', fontSize: 13 }}>
                    {SUBJECT[x.subject].short} · {x.topics.join(', ')}
                  </span>
                </div>
              ))
            ) : (
              <span className="m">Sınıf için etüt planlandığında burada görünür.</span>
            )}
          </Dropdown>
          {veli && (
            <Dropdown title="Öğretmen notları" sub={ns.length ? `${ns.length} not` : 'Henüz not yok'} icon={<Icon name="chat" size={22} />} delay={7}>
              {ns.length ? (
                ns.map((n) => (
                  <div key={n.id} className="stack" style={{ gap: 2 }}>
                    <p style={{ whiteSpace: 'pre-wrap', fontSize: 14 }}>{n.body}</p>
                    <span className="m" style={{ fontSize: 12 }}>
                      {ago(n.created_at)}
                    </span>
                  </div>
                ))
              ) : (
                <span className="m">Öğretmenler sizinle paylaştığında burada görünür.</span>
              )}
            </Dropdown>
          )}
        </aside>
      </div>
      {cur >= 0 && <ExamModal ds={dsq.data} exam={ex[cur]!.exam} result={ex[cur]!.result} prev={ex[cur - 1]?.result} studentName={s.full_name} onClose={() => setExam(null)} />}
    </>
  )
}

export function GorevlerPage() {
  const { s, list, loading, choose, veli } = useMyStudent()
  const tasks = useTasks(s?.id)
  if (!s) return <Wait loading={loading} />
  const ts = (tasks.data ?? []).slice().sort((a, b) => Number(!!a.completed_at) - Number(!!b.completed_at) || a.due_date.localeCompare(b.due_date))
  return (
    <>
      <h1 className="hd a">{veli ? `${gen(s.full_name.split(' ')[0]!)} görevleri` : 'Görevlerim'}</h1>
      <ChildPicker list={list} s={s} choose={choose} />
      {!veli && <p className="m a">Çözdükçe işaretle; öğretmenin ilerlemeni görür.</p>}
      {tasks.isLoading ? null : <TaskList tasks={ts} mode={veli ? 'view' : 'student'} />}
    </>
  )
}

export function GorusmelerPage() {
  const { s, list, loading, choose } = useMyStudent()
  const meetings = useMeetings(s?.id)
  if (!s) return <Wait loading={loading} />
  const gs = (meetings.data ?? []).slice().sort((a, b) => b.starts_at.localeCompare(a.starts_at))
  return (
    <>
      <h1 className="hd a">Görüşmeler</h1>
      <ChildPicker list={list} s={s} choose={choose} />
      {meetings.isLoading ? null : <MeetingList meetings={gs} studentName={() => s.full_name} canRespond />}
    </>
  )
}

export function RaporlarPage() {
  const { s, loading } = useMyStudent()
  const reports = useReports(s?.id)
  const dsq = useDataset()
  const openReport = useOpenReport()
  if (!s) return <Wait loading={loading} />
  return (
    <>
      <h1 className="hd a">Raporlar</h1>
      {reports.data?.length ? (
        <section className="card a" style={{ ['--d' as string]: 1, overflow: 'hidden' }}>
          {reports.data.map((x) => (
            <button className="srow" key={x.id} onClick={() => openReport({ id: x.id })} data-testid="report-row">
              <span style={{ color: 'var(--primary)' }}>
                <Icon name="doc" size={22} />
              </span>
              <span style={{ flex: 1 }}>
                <b style={{ display: 'block' }}>{dsq.data?.exams.find((e) => e.id === x.exam_id)?.name} · Gelişim raporu</b>
                <span className="m" style={{ fontSize: 13 }}>
                  {x.sent_at ? ago(x.sent_at) : ''}
                </span>
              </span>
              <Icon name="right" size={18} stroke={2} />
            </button>
          ))}
        </section>
      ) : (
        <div className="empty a">Henüz rapor gönderilmedi.</div>
      )}
    </>
  )
}
