import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useAuth } from '@/auth/AuthProvider'
import { supabase } from '@/lib/supabase'
import { isFullAccess, ROLE_TR, roleOf } from '@/lib/roles'
import { SUBJECT, SUBJECTS, fmt, indexResults, repeats, studentExams, totalNet, type Subject } from '@/lib/analiz'
import { useDataset, useMeetings, useNotes, useParentLinks, usePeople, useRefresh, useReports, useStudents, useTasks, type Meeting, type Task, useModules } from '@/lib/data'
import { ago, initials, todayISO, trD } from '@/lib/format'
import { Icon } from '@/components/Icon'
import { useIndicator } from '@/components/Indicator'
import { LineChart } from '@/components/LineChart'
import { TaskList, TaskModal } from '@/components/Tasks'
import { MeetingList, MeetingModal } from '@/components/Meetings'
import { ExamModal } from '@/components/ExamModal'
import { useToast } from '@/components/Toast'
import { useOpenReport } from '@/components/Report'
import { ConfirmDelete } from '@/components/ConfirmDelete'
import { useNavigate } from 'react-router-dom'
import { DevamsizlikTab } from '@/components/Devamsizlik'

const TABS = [
  ['gelisim', 'Gelişim'],
  ['denemeler', 'Denemeler'],
  ['konular', 'Konular'],
  ['gorevler', 'Görevler'],
  ['gorusmeler', 'Görüşmeler'],
  ['notlar', 'Notlar'],
  ['raporlar', 'Raporlar'],
  ['devamsizlik', 'Devamsızlık'],
] as const
type Tab = (typeof TABS)[number][0]

type ModalState = { t: 'task'; edit?: Task; preset?: { subject: Subject; code?: string } } | { t: 'meeting'; edit?: Meeting } | { t: 'exam'; eid: string } | null

const HIST_TR = { y: 'Yanlış', d: 'Doğru', b: 'Boş', o: 'Okunamadı', n: 'Soru yok', x: 'Girmedi' } as const

export default function OgrenciPage() {
  const { sid = '' } = useParams()
  const [sp, setSp] = useSearchParams()
  const mods = useModules()
  const tab = (TABS.find(([k]) => k === sp.get('sekme'))?.[0] ?? 'gelisim') as Tab
  const setTab = (t: Tab) => setSp(t === 'gelisim' ? {} : { sekme: t }, { replace: true })
  const { role } = useAuth()
  const F = isFullAccess(role!)

  const students = useStudents()
  const dsq = useDataset()
  const tasks = useTasks(sid)
  const links = useParentLinks(F)
  const [modal, setModal] = useState<ModalState>(null)
  const tabs = useIndicator<HTMLDivElement>(tab)
  const openReport = useOpenReport()
  const [delOpen, setDelOpen] = useState(false)
  const navigate = useNavigate()
  const refreshAll = useRefresh()
  const toastTop = useToast()

  const s = students.data?.find((x) => x.id === sid)
  const ds = dsq.data
  const calc = useMemo(() => {
    if (!ds || !s) return null
    const idx = indexResults(ds.results)
    const ex = studentExams(ds, s.id, idx)
    const used = new Set<string>()
    for (const qs of ds.questionsByExam.values()) for (const q of qs) if (q.outcome_code) used.add(q.outcome_code)
    for (const r of ds.results) for (const c of Object.keys(r.kazanim?.g ?? {})) used.add(c)
    return { ex, rep: repeats(ds, s.id, undefined, idx), used }
  }, [ds, s])

  if (students.isLoading || dsq.isLoading)
    return (
      <p className="m">
        <span className="spinner" aria-hidden="true" /> Yükleniyor…
      </p>
    )
  if (!s || !ds || !calc)
    return (
      <>
        <BackLink />
        <div className="empty">Öğrenci bulunamadı.</div>
      </>
    )

  const { ex, rep, used } = calc
  const L = ex.at(-1)
  const P = ex.at(-2)
  const nets = ex.map((x) => totalNet(x.result))
  const today = todayISO()
  const myTasks = (tasks.data ?? []).slice().sort((a, b) => Number(!!a.completed_at) - Number(!!b.completed_at) || a.due_date.localeCompare(b.due_date))
  const openT = myTasks.filter((t) => !t.completed_at)
  const lateAny = openT.some((t) => t.due_date < today)
  const hasParent = links.data ? links.data.some((l) => l.student_id === s.id) : undefined
  const scoreDelta = L?.result.score != null && P?.result.score != null ? L.result.score - P.result.score : null

  return (
    <>
      <BackLink />
      <div className="head a" style={{ ['--d' as string]: 1, alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, minWidth: 0 }}>
          <span className="av" style={{ width: 58, height: 58, fontFamily: 'var(--font-display)', fontSize: 21 }}>
            {initials(s.full_name)}
          </span>
          <div style={{ minWidth: 0 }}>
            <h1 className="hd" style={{ fontSize: 30 }}>
              {s.full_name}
            </h1>
            <span className="m">
              {s.class_name} · No {s.school_no ?? '—'}
              {hasParent === undefined ? '' : hasParent ? ' · Veli bağlı' : ' · Veli bağlı değil'}
            </span>
          </div>
        </div>
        {F && (
          <div className="btns">
            <button className="btn" onClick={() => setModal({ t: 'meeting' })}>
              <Icon name="cal" size={18} />
              Görüşme planla
            </button>
            <button className="btn" disabled={!L} onClick={() => L && openReport({ type: 'veli', sid: s.id, eid: L.exam.id })}>
              <Icon name="doc" size={18} />
              Veli raporu
            </button>
            <button className="btn pri" onClick={() => setModal({ t: 'task' })}>
              <Icon name="task" size={18} />
              Görev ata
            </button>
            <button className="btn ghost" style={{ color: 'var(--signal-ink)' }} onClick={() => setDelOpen(true)} aria-label="Öğrenciyi sil">
              <Icon name="trash" size={18} />
            </button>
          </div>
        )}
      </div>
      {delOpen && (
        <ConfirmDelete
          title="Öğrenciyi sil"
          name={s.full_name}
          onClose={() => setDelOpen(false)}
          onConfirm={async () => {
            const { error } = await supabase.rpc('delete_student', { p_student: s.id })
            if (error) return error.message || 'Silinemedi.'
            toastTop(`${s.full_name} silindi`)
            refreshAll('students', 'dataset', 'tasks', 'meetings', 'notes', 'reports', 'parent_links', 'people')
            navigate('/ogrenciler')
            return null
          }}
        >
          <b>{s.full_name}</b> ({s.class_name}) ve bütün kayıtları kalıcı olarak silinecek: deneme sonuçları, görevler, görüşmeler, notlar, raporlar ve veli bağlantıları.
          Öğrencinin kendi hesabı silinmez; yeniden eşleştirilmek üzere onay bekleyen duruma döner.
        </ConfirmDelete>
      )}

      <div className="stats">
        <div className="card stat a lift" style={{ ['--d' as string]: 2 }}>
          <span className="m" style={{ fontSize: 13 }}>
            Puan{L ? ` · ${L.exam.name}` : ''}
          </span>
          <span className="big" style={{ fontSize: 27 }}>
            {L?.result.score != null ? fmt(L.result.score) : '—'}
          </span>
          <span style={{ fontSize: 13, fontWeight: 600, color: scoreDelta != null && scoreDelta < 0 ? 'var(--signal)' : scoreDelta != null ? 'var(--primary)' : 'var(--ink-muted)' }}>
            {scoreDelta != null ? `${scoreDelta >= 0 ? '↑' : '↓'} ${fmt(Math.abs(scoreDelta))}` : '—'}
          </span>
        </div>
        <div className="card stat a lift" style={{ ['--d' as string]: 3 }}>
          <span className="m" style={{ fontSize: 13 }}>
            Toplam net
          </span>
          <span className="big" style={{ fontSize: 27 }}>
            {L ? fmt(totalNet(L.result), 2) : '—'}
          </span>
          <span className="m" style={{ fontSize: 13 }}>
            Ortalaması {nets.length ? fmt(nets.reduce((a, b) => a + b, 0) / nets.length) : '—'}
          </span>
        </div>
        <div className="card stat a lift" style={{ ['--d' as string]: 4 }}>
          <span className="m" style={{ fontSize: 13 }}>
            Tekrar eden hata
          </span>
          <span className="big" style={{ fontSize: 27 }}>
            {rep.length}
          </span>
          <span className="m" style={{ fontSize: 13 }}>
            konu
          </span>
        </div>
        <div className="card stat a lift" style={{ ['--d' as string]: 5 }}>
          <span className="m" style={{ fontSize: 13 }}>
            Açık görev
          </span>
          <span className="big" style={{ fontSize: 27 }}>
            {openT.length}
          </span>
          <span style={{ fontSize: 13, fontWeight: 600, color: lateAny ? 'var(--signal)' : 'var(--ink-muted)' }}>{lateAny ? '↓ Gecikmiş var' : 'Zamanında'}</span>
        </div>
      </div>

      <div className="tabs a" style={{ ['--d' as string]: 3 }} role="tablist" aria-label="Öğrenci dosyası" ref={tabs.ref}>
        {tabs.ind}
        {TABS.filter(([id]) => id !== 'devamsizlik' || mods.yoklama).map(([id, l]) => (
          <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>
            {l}
          </button>
        ))}
      </div>

      {tab === 'gelisim' && (
        <div className="cols" style={{ ['--side' as string]: '380px' }}>
          <section className="card a" style={{ ['--d' as string]: 3, padding: 20, display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
            <div className="kv">
              <h2 className="sec">Toplam net</h2>
              <span className="m" style={{ fontSize: 13 }}>
                Deneme adına tıkla → detay
              </span>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <div style={{ minWidth: 460 }}>
                {ex.length ? (
                  <LineChart values={nets} labels={ex.map((x) => x.exam.name)} avg onSelect={(i) => setModal({ t: 'exam', eid: ex[i]!.exam.id })} />
                ) : (
                  <div className="empty">Henüz deneme yok.</div>
                )}
              </div>
            </div>
          </section>
          <section className="card a" style={{ ['--d' as string]: 4, padding: 20 }}>
            <h2 className="sec" style={{ marginBottom: 8 }}>
              Dersler · son deneme
            </h2>
            {L ? (
              SUBJECTS.map((d) => {
                const n = L.result.subjects[d.code]?.net ?? 0
                const pv = P?.result.subjects[d.code]?.net
                const df = pv == null ? 0 : n - pv
                return (
                  <div key={d.code} style={{ display: 'grid', gridTemplateColumns: '96px minmax(0,1fr) 54px 56px', gap: 10, alignItems: 'center', padding: '7px 0', borderBottom: '1px solid var(--line)' }}>
                    <span style={{ fontSize: 14 }}>{d.short}</span>
                    <div className="prog" style={{ height: 8 }}>
                      <i className="bar-g" style={{ width: `${(Math.max(0, n) / d.q) * 100}%`, ...(df < -1 ? { background: 'var(--signal)' } : {}) }} />
                    </div>
                    <span className="mono" style={{ textAlign: 'right', fontSize: 14 }}>
                      {fmt(n, 2)}
                    </span>
                    <span className="mono" style={{ textAlign: 'right', fontSize: 13, fontWeight: 600, color: df < -1 ? 'var(--signal)' : df > 1 ? 'var(--primary)' : 'var(--ink-muted)' }}>
                      {pv == null ? '' : `${df > 0 ? '↑' : df < 0 ? '↓' : ''}${fmt(Math.abs(df))}`}
                    </span>
                  </div>
                )
              })
            ) : (
              <div className="empty">Deneme yok</div>
            )}
          </section>
        </div>
      )}

      {tab === 'denemeler' && (
        <section className="card a" style={{ ['--d' as string]: 3, overflow: 'hidden' }}>
          <div className="tbl">
            <table>
              <thead>
                <tr>
                  <th>Deneme</th>
                  <th>Tarih</th>
                  <th className="num">Net</th>
                  <th className="num">Puan</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {ex
                  .slice()
                  .reverse()
                  .map(({ exam, result }) => (
                    <tr key={exam.id}>
                      <td>
                        <button className="btn ghost" style={{ fontWeight: 600, padding: 0 }} onClick={() => setModal({ t: 'exam', eid: exam.id })}>
                          {exam.name}
                        </button>{' '}
                        <span className="m" style={{ fontSize: 12 }}>
                          {exam.publisher}
                        </span>
                      </td>
                      <td>{trD(exam.exam_date)}</td>
                      <td className="num">{fmt(totalNet(result), 2)}</td>
                      <td className="num">{result.score != null ? fmt(result.score) : '—'}</td>
                      <td>
                        <div className="btns" style={{ justifyContent: 'flex-end' }}>
                          {F ? (
                            <>
                              <button className="btn sm soft" onClick={() => openReport({ type: 'veli', sid: s.id, eid: exam.id })}>
                                Veli raporu
                              </button>
                              <button className="btn sm" onClick={() => openReport({ type: 'ogretmen', sid: s.id, eid: exam.id })}>
                                Öğretmen raporu
                              </button>
                            </>
                          ) : (
                            <button className="btn sm" onClick={() => setModal({ t: 'exam', eid: exam.id })}>
                              Detay
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          {!ex.length && (
            <div className="empty" style={{ margin: 16 }}>
              Henüz deneme yok.
            </div>
          )}
        </section>
      )}

      {tab === 'konular' && (
        <section className="card a" style={{ ['--d' as string]: 3, overflow: 'hidden' }}>
          {rep.length ? (
            <div className="tbl">
              <table>
                <thead>
                  <tr>
                    <th>Konu</th>
                    <th>Ders</th>
                    <th>Denemeler (eski → yeni)</th>
                    <th>Tekrar</th>
                    {F && <th />}
                  </tr>
                </thead>
                <tbody>
                  {rep.map((k) => (
                    <tr key={k.outcome.code}>
                      <td>
                        <b>{k.outcome.title}</b>{' '}
                        <span className="m mono" style={{ fontSize: 12 }}>
                          {k.outcome.code}
                        </span>
                      </td>
                      <td>{SUBJECT[k.outcome.subject].short}</td>
                      <td>
                        <div className="hist">
                          {k.hist.map((h, i) => (
                            <i key={i} className={`h-${h === 'x' ? 'n' : h} pp`} style={{ ['--d' as string]: i }} title={`${ex[i]?.exam.name}: ${HIST_TR[h]}`} aria-label={`${ex[i]?.exam.name}: ${HIST_TR[h]}`} />
                          ))}
                        </div>
                      </td>
                      <td>
                        <span className="chip down">{k.count} denemede yanlış</span>
                      </td>
                      {F && (
                        <td>
                          <button className="btn sm soft" onClick={() => setModal({ t: 'task', preset: { subject: k.outcome.subject, code: k.outcome.code } })}>
                            Görev ata
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty" style={{ margin: 16 }}>
              Tekrar eden hata yok{ex.length && ex.every((x) => !x.result.outcomes_ok) ? ' · bu öğrencinin konu bilgisi okunamadı' : ''}.
            </div>
          )}
          <div className="legend" style={{ padding: '12px 16px', borderTop: '1px solid var(--line)' }}>
            <i className="h-y" />
            Yanlış
            <i className="h-d" />
            Doğru
            <i className="h-b" />
            Boş
            <i className="h-o" />
            Okunamadı
            <i className="h-n" />
            Soru yok
          </div>
        </section>
      )}

      {tab === 'gorevler' && (
        <>
          {F && (
            <button className="btn pri a" style={{ alignSelf: 'flex-start' }} onClick={() => setModal({ t: 'task' })}>
              <Icon name="plus" size={18} stroke={2} />
              Görev ata
            </button>
          )}
          <TaskList tasks={myTasks} mode={F ? 'staff' : 'view'} onEdit={(t) => setModal({ t: 'task', edit: t })} />
        </>
      )}

      {tab === 'gorusmeler' && <MeetingsTab sid={s.id} F={F} name={s.full_name} onPlan={() => setModal({ t: 'meeting' })} onChange={(g) => setModal({ t: 'meeting', edit: g })} />}
      {tab === 'notlar' && <NotesTab sid={s.id} F={F} />}
      {tab === 'devamsizlik' && <DevamsizlikTab s={s} />}
      {tab === 'raporlar' && <ReportsTab sid={s.id} examName={(eid) => ds.exams.find((e) => e.id === eid)?.name ?? ''} />}

      {modal?.t === 'task' && (
        <TaskModal student={s} outcomes={ds.outcomes} usedCodes={used} repeats={rep} openTasks={openT} edit={modal.edit} preset={modal.preset} onClose={() => setModal(null)} />
      )}
      {modal?.t === 'meeting' && <MeetingModal student={s} edit={modal.edit} hasParent={hasParent} onClose={() => setModal(null)} />}
      {modal?.t === 'exam' &&
        (() => {
          const i = ex.findIndex((x) => x.exam.id === modal.eid)
          const cur = ex[i]
          if (!cur) return null
          return <ExamModal ds={ds} exam={cur.exam} result={cur.result} prev={ex[i - 1]?.result} studentName={s.full_name} onClose={() => setModal(null)} onReport={F ? (t) => (setModal(null), openReport({ type: t, sid: s.id, eid: cur.exam.id })) : undefined} />
        })()}
    </>
  )
}

function BackLink() {
  return (
    <Link className="btn ghost a" to="/ogrenciler" style={{ alignSelf: 'flex-start' }}>
      <Icon name="back" size={16} stroke={2} />
      Öğrenciler
    </Link>
  )
}

function MeetingsTab({ sid, F, name, onPlan, onChange }: { sid: string; F: boolean; name: string; onPlan: () => void; onChange: (g: Meeting) => void }) {
  const q = useMeetings(sid)
  if (!F)
    return (
      <div className="empty a" style={{ ['--d' as string]: 3 }}>
        Görüşmeleri rehberlik servisi planlar ve yönetir.
      </div>
    )
  return (
    <>
      <button className="btn pri a" style={{ alignSelf: 'flex-start' }} onClick={onPlan}>
        <Icon name="plus" size={18} stroke={2} />
        Görüşme planla
      </button>
      {q.data && <MeetingList meetings={q.data} studentName={() => name} canManage onChange={onChange} />}
    </>
  )
}

const VIS_TR = { ogretmen: 'Öğretmenler', rehber: 'Gizli', veli: 'Veli görüyor' } as const

function NotesTab({ sid, F }: { sid: string; F: boolean }) {
  const notes = useNotes(sid)
  const people = usePeople()
  const toast = useToast()
  const refresh = useRefresh()
  const [text, setText] = useState('')
  const [vis, setVis] = useState<'ogretmen' | 'rehber' | 'veli'>('ogretmen')
  const [busy, setBusy] = useState(false)
  // Rehberlik notlarının görüntülenmesi işlem kayıtlarına yazılır (KVKK: kim, ne zaman).
  const hasRehber = notes.data?.some((n) => n.visibility === 'rehber')
  useEffect(() => {
    if (F && hasRehber) supabase.rpc('log_view', { p_entity: 'rehber_notlari', p_student: sid }).then(() => {})
  }, [F, hasRehber, sid])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!text.trim()) return toast('Önce notu yaz', 'warn')
    setBusy(true)
    const { data: u } = await supabase.auth.getUser()
    const { error } = await supabase.from('notes').insert({ student_id: sid, author_id: u.user!.id, visibility: vis, body: text.trim() })
    setBusy(false)
    if (error) return toast(error.message || 'Not kaydedilemedi.', 'warn')
    setText('')
    toast('Not kaydedildi')
    refresh('notes')
  }

  const author = (id: string) => {
    const p = people.data?.find((x) => x.id === id)
    if (!p) return { name: 'Öğretmen', sub: '' }
    const r = roleOf({ role: p.role as 'admin', branch: p.branch })
    return { name: p.full_name, sub: r === 'brans' ? (p.branch ?? '') : ROLE_TR[r] }
  }

  return (
    <>
      <form className="card a" style={{ ['--d' as string]: 3, padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }} onSubmit={submit}>
        <label className="field" htmlFor="noteText">
          Not ekle
          <textarea id="noteText" placeholder="Gözlemin, ders içi durum…" value={text} onChange={(e) => setText(e.target.value)} maxLength={4000} />
        </label>
        <div className="kv" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <label className="field" htmlFor="noteVis" style={{ flex: 1, minWidth: 200 }}>
            Kim görsün
            <select id="noteVis" value={vis} onChange={(e) => setVis(e.target.value as typeof vis)}>
              <option value="ogretmen">Öğretmenler</option>
              {F && <option value="rehber">Yalnız rehberlik ve yönetim</option>}
              {F && <option value="veli">Veli de görsün</option>}
            </select>
          </label>
          <button className="btn pri" type="submit" disabled={busy}>
            Kaydet
          </button>
        </div>
      </form>
      {notes.data?.length ? (
        notes.data.map((n, i) => {
          const a = author(n.author_id)
          return (
            <article key={n.id} className="card a" data-testid="note" style={{ ['--d' as string]: i + 4, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div className="kv">
                <b style={{ fontSize: 14 }}>
                  {a.name}{' '}
                  <span className="m" style={{ fontWeight: 400 }}>
                    {a.sub ? `· ${a.sub}` : ''}
                  </span>
                </b>
                <span className={`chip ${n.visibility === 'veli' ? 'down' : n.visibility === 'rehber' ? 'dark' : 'n'}`}>
                  {n.visibility === 'rehber' && <Icon name="lock" size={12} stroke={2} />}
                  {VIS_TR[n.visibility]}
                </span>
              </div>
              <p style={{ whiteSpace: 'pre-wrap' }}>{n.body}</p>
              <span className="m" style={{ fontSize: 12 }}>
                {ago(n.created_at)}
              </span>
            </article>
          )
        })
      ) : (
        <div className="empty">Henüz not yok.</div>
      )}
    </>
  )
}

function ReportsTab({ sid, examName }: { sid: string; examName: (eid: string) => string }) {
  const q = useReports(sid)
  const people = usePeople()
  const openReport = useOpenReport()
  if (!q.data?.length) return <div className="empty a">Bu öğrenci için rapor yok.</div>
  return (
    <section className="card a" style={{ ['--d' as string]: 3, overflow: 'hidden' }}>
      {q.data.map((x) => {
        const who = people.data?.find((p) => p.id === x.created_by)?.full_name
        const to = [x.sent_to_parent && 'veli', x.sent_to_student && 'öğrenci'].filter(Boolean).join(', ')
        return (
          <button key={x.id} className="srow" onClick={() => openReport({ id: x.id })} data-testid="report-row">
            <span style={{ color: 'var(--primary)' }}>
              <Icon name="doc" size={22} />
            </span>
            <span style={{ flex: 1 }}>
              <b style={{ display: 'block' }}>
                {x.type === 'veli' ? 'Veli raporu' : 'Öğretmen raporu'} · {examName(x.exam_id)}
              </b>
              <span className="m" style={{ fontSize: 13 }}>
                {who ? `${who} · ` : ''}
                {ago(x.updated_at)} · {x.status === 'sent' ? `Gönderildi${to ? `: ${to}` : ''}` : 'Taslak'}
              </span>
            </span>
            <Icon name="right" size={18} stroke={2} />
          </button>
        )
      })}
    </section>
  )
}
