// Ödevler (Faz B · 0013). Öğretmen: ödev ver, kontrol et (Yaptı / Yapmadı / Eksik / Gelmedi / İzinli + not).
// Veli ve öğrenci: bekleyen / geciken / tamamlanan ödevler. Yetki veritabanında (RLS + fonksiyonlar) zorlanır.
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/auth/AuthProvider'
import {
  HW_TR,
  useAssignments,
  useClasses,
  useCourses,
  useHomework,
  useHomeworkProgress,
  useHomeworkRows,
  usePeople,
  useSettings,
  useStudents,
  useTimetable,
  type Homework,
  type HwStatus,
} from '@/lib/data'
import { LEVEL_TR, LEVELS } from '@/lib/roles'
import { todayISO, trD, trDW } from '@/lib/format'
import type { ClassRow } from '@/lib/types'
import { Seg } from '@/components/Indicator'
import { Modal } from '@/components/Modal'
import { ConfirmDelete } from '@/components/ConfirmDelete'
import { Icon } from '@/components/Icon'
import { useToast } from '@/components/Toast'

const errText = (e: { message?: string } | null) => (e ? (/row-level security/i.test(e.message ?? '') ? 'Bu sınıf ve derse ödev verme yetkin yok.' : (e.message ?? 'Kaydedilemedi.')) : null)
const CHIP: Record<HwStatus, string> = { bekliyor: 'n', yapti: 'up', yapmadi: 'down', eksik: 'down', gelmedi: 'n', izinli: 'n' }

/** Ödev ayarları (Yönetim Merkezi → Ödev ayarları); yüklenirken varsayılanlar. */
export function useHwSettings() {
  const s = useSettings()
  const g = <T,>(k: string, d: T) => ((s.data?.[`odev.${k}`] as T | undefined) ?? d)
  return { dueRequired: g('son_tarih_zorunlu', true), parentSees: g('veli_durum_gorur', true), lateRed: g('geciken_kirmizi', true) }
}

export default function OdevlerPage() {
  const { profile } = useAuth()
  return profile?.role === 'veli' || profile?.role === 'ogrenci' ? <AileOdev /> : <OgretmenOdev />
}

// ---------------------------------------------------------------- Öğretmen / yönetici
/** Öğretmenin ödev verebileceği sınıf + ders çiftleri (veritabanı kuralıyla aynı: atama, program, sınıf öğretmenliği). */
function useAssignable(classes: ClassRow[]) {
  const { profile } = useAuth()
  const courses = useCourses()
  const asg = useAssignments()
  const admin = profile?.role === 'admin'
  return useMemo(() => {
    const act = (courses.data ?? []).filter((c) => c.active)
    const fits = (cl: ClassRow, lv: string[]) => !lv.length || lv.includes(cl.level)
    const pairs = new Map<string, Set<string>>()
    const add = (cl: string, co: string) => (pairs.get(cl) ?? pairs.set(cl, new Set()).get(cl)!).add(co)
    for (const cl of classes) {
      if (admin || cl.homeroom_teacher_id === profile?.id) for (const co of act) if (fits(cl, co.levels)) add(cl.id, co.id)
    }
    for (const a of asg.data ?? []) if (a.teacher_id === profile?.id) add(a.class_id, a.course_id)
    return pairs
  }, [classes, courses.data, asg.data, admin, profile?.id])
}

function OgretmenOdev() {
  const { profile } = useAuth()
  const classes = useClasses()
  const courses = useCourses()
  const hw = useHomework()
  const prog = useHomeworkProgress(true)
  const people = usePeople()
  const settings = useHwSettings()
  const [sp, setSp] = useSearchParams()
  const [cls, setCls] = useState('all')
  const [view, setView] = useState<'acik' | 'gecmis' | 'hepsi'>('acik')
  const [edit, setEdit] = useState<Homework | 'new' | null>(null)
  const today = todayISO()
  const assignable = useAssignable(classes.data ?? [])
  const open = sp.get('odev')
  const cur = (hw.data ?? []).find((h) => h.id === open)
  const cName = (id: string) => classes.data?.find((c) => c.id === id)?.name ?? '—'
  const coName = (id: string) => courses.data?.find((c) => c.id === id)?.name ?? '—'
  const tName = (id: string | null) => people.data?.find((p) => p.id === id)?.full_name
  const late = (h: Homework) => !!h.due_on && h.due_on < today
  const list = (hw.data ?? []).filter((h) => (cls === 'all' || h.class_id === cls) && (view === 'hepsi' || (view === 'acik' ? !late(h) : late(h))))
  const count = (id: string) => {
    const rows = (prog.data ?? []).filter((r) => r.homework_id === id)
    return { n: rows.length, done: rows.filter((r) => r.status !== 'bekliyor').length }
  }

  if (cur) return <HomeworkDetail h={cur} className={cName(cur.class_id)} courseName={coName(cur.course_id)} onBack={() => setSp({}, { replace: true })} onEdit={() => setEdit(cur)} editing={edit} closeEdit={() => setEdit(null)} assignable={assignable} classes={classes.data ?? []} />

  return (
    <>
      <div className="head a">
        <h1 className="hd">Ödevler</h1>
        <button className="btn pri" onClick={() => setEdit('new')} disabled={!assignable.size} title={assignable.size ? undefined : 'Ders atamanız yok'}>
          <Icon name="plus" size={18} stroke={2} /> Ödev ver
        </button>
      </div>
      <div className="btns a" style={{ ['--d' as string]: 1, alignItems: 'flex-end' }}>
        <label className="field" htmlFor="oCls" style={{ minWidth: 150 }}>
          Sınıf
          <select id="oCls" value={cls} onChange={(e) => setCls(e.target.value)}>
            <option value="all">Tüm sınıflar</option>
            {(classes.data ?? [])
              .filter((c) => (hw.data ?? []).some((h) => h.class_id === c.id) || assignable.has(c.id))
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </select>
        </label>
        <Seg
          label="Ödev durumu"
          value={view}
          onChange={setView}
          options={[
            ['acik', 'Süresi devam eden'],
            ['gecmis', 'Süresi geçen'],
            ['hepsi', 'Tümü'],
          ]}
        />
      </div>
      {!assignable.size && profile?.role !== 'admin' && (
        <p className="m a" style={{ fontSize: 13 }}>
          Ödev verebilmen için yönetimin seni bir sınıf ve derse ataması (Yönetim → Ders atamaları) ya da sınıf öğretmeni yapması gerekir.
        </p>
      )}
      {hw.isLoading ? (
        <p className="m">
          <span className="spinner" aria-hidden="true" /> Yükleniyor…
        </p>
      ) : list.length ? (
        <div className="stack">
          {list.map((h, i) => {
            const c = count(h.id)
            return (
              <button key={h.id} className="card a hwcard" style={{ ['--d' as string]: Math.min(i + 2, 8) }} onClick={() => setSp({ odev: h.id })} data-testid="homework-card" aria-label={`${h.title} · ${cName(h.class_id)} ${coName(h.course_id)}`}>
                <span className="kv" style={{ alignItems: 'flex-start' }}>
                  <span style={{ minWidth: 0 }}>
                    <b style={{ display: 'block', fontSize: 16 }}>{h.title}</b>
                    <span className="m" style={{ fontSize: 13 }}>
                      {cName(h.class_id)} · {coName(h.course_id)}
                      {profile?.role === 'admin' && tName(h.teacher_id) ? ` · ${tName(h.teacher_id)}` : ''}
                    </span>
                  </span>
                  <span className={`chip ${late(h) && settings.lateRed && c.done < c.n ? 'down' : 'n'}`}>{h.due_on ? `Son gün ${trD(h.due_on)}` : 'Tarihsiz'}</span>
                </span>
                <span className="kv" style={{ marginTop: 8 }}>
                  <span className="m" style={{ fontSize: 12 }}>
                    Kontrol edildi: {c.done}/{c.n}
                  </span>
                  <span className="bar" aria-hidden="true" style={{ flex: 1, maxWidth: 220, height: 6, borderRadius: 99, background: 'var(--surface-sunken)', overflow: 'hidden' }}>
                    <i style={{ display: 'block', height: '100%', width: `${c.n ? (c.done / c.n) * 100 : 0}%`, background: 'var(--primary)' }} />
                  </span>
                </span>
              </button>
            )
          })}
        </div>
      ) : (
        <div className="empty a">{view === 'acik' ? 'Süresi devam eden ödev yok.' : 'Ödev yok.'}</div>
      )}
      {edit && <HomeworkModal h={edit === 'new' ? null : edit} classes={classes.data ?? []} assignable={assignable} dueRequired={settings.dueRequired} onClose={() => setEdit(null)} onSaved={(id) => setSp({ odev: id })} />}
    </>
  )
}

function HomeworkModal({
  h,
  classes,
  assignable,
  dueRequired,
  onClose,
  onSaved,
}: {
  h: Homework | null
  classes: ClassRow[]
  assignable: Map<string, Set<string>>
  dueRequired: boolean
  onClose: () => void
  onSaved: (id: string) => void
}) {
  const { profile } = useAuth()
  const courses = useCourses()
  const qc = useQueryClient()
  const toast = useToast()
  const clsOpts = classes.filter((c) => assignable.has(c.id) || c.id === h?.class_id)
  const [cls, setCls] = useState(h?.class_id ?? clsOpts[0]?.id ?? '')
  const coOpts = (courses.data ?? []).filter((c) => assignable.get(cls)?.has(c.id) || c.id === h?.course_id)
  const [course, setCourse] = useState(h?.course_id ?? '')
  const courseId = coOpts.some((c) => c.id === course) ? course : (coOpts[0]?.id ?? '')
  const tt = useTimetable(cls)
  const [f, setF] = useState({ title: h?.title ?? '', description: h?.description ?? '', assigned_on: h?.assigned_on ?? todayISO(), due_on: h?.due_on ?? '' })
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // Yeni ödevde bu sınıfta bu dersin haftadaki bir sonraki günü önerilir
  useEffect(() => {
    if (h || f.due_on || !tt.data || !courseId) return
    const days = [...new Set(tt.data.filter((l) => l.course_id === courseId).map((l) => l.weekday))].sort()
    if (!days.length) return
    for (let i = 1; i <= 7; i++) {
      const d = new Date(Date.parse(f.assigned_on) + i * 86400_000)
      const dow = d.getUTCDay() || 7
      if (days.includes(dow)) return setF((x) => ({ ...x, due_on: d.toISOString().slice(0, 10) }))
    }
  }, [tt.data, courseId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function save() {
    if (f.title.trim().length < 3) return setErr('Başlık en az 3 harf olmalı.')
    if (dueRequired && !f.due_on) return setErr('Son teslim tarihini seç.')
    if (f.due_on && f.due_on < f.assigned_on) return setErr('Son teslim, veriliş tarihinden önce olamaz.')
    setBusy(true)
    const row = { title: f.title.trim(), description: f.description.trim() || null, assigned_on: f.assigned_on, due_on: f.due_on || null, course_id: courseId }
    const res = h
      ? await supabase.from('homework').update(row).eq('id', h.id).select('id').single()
      : await supabase.from('homework').insert({ ...row, class_id: cls, school_id: profile!.school_id, teacher_id: profile!.id }).select('id').single()
    setBusy(false)
    if (res.error) return setErr(errText(res.error))
    qc.invalidateQueries({ queryKey: ['homework'] })
    qc.invalidateQueries({ queryKey: ['homework_students'] })
    toast(h ? 'Ödev güncellendi' : 'Ödev verildi; öğrencilere ve velilere bildirim gitti')
    onClose()
    if (!h) onSaved(res.data.id as string)
  }
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF((x) => ({ ...x, [k]: e.target.value }))
  return (
    <Modal
      title={h ? 'Ödevi düzenle' : 'Ödev ver'}
      sub={h ? undefined : 'Sınıftaki bütün öğrenciler ödevden sorumlu olur.'}
      width={620}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Vazgeç
          </button>
          <button className="btn pri" onClick={save} disabled={busy}>
            {busy && <span className="spinner" aria-hidden="true" />} {h ? 'Kaydet' : 'Ödevi ver'}
          </button>
        </>
      }
    >
      <div className="grid2">
        <label className="field" htmlFor="hCls">
          Sınıf
          <select id="hCls" value={cls} disabled={!!h} onChange={(e) => setCls(e.target.value)}>
            {LEVELS.map((lv) => {
              const cs = clsOpts.filter((c) => c.level === lv)
              return cs.length ? (
                <optgroup key={lv} label={LEVEL_TR[lv]}>
                  {cs.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </optgroup>
              ) : null
            })}
          </select>
        </label>
        <label className="field" htmlFor="hCourse">
          Ders
          <select id="hCourse" value={courseId} onChange={(e) => setCourse(e.target.value)}>
            {coOpts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="field" htmlFor="hTitle">
        Başlık
        <input id="hTitle" value={f.title} onChange={set('title')} maxLength={150} placeholder="ör. Çarpanlar ve katlar — test 3" />
      </label>
      <label className="field" htmlFor="hDesc">
        Açıklama (isteğe bağlı)
        <textarea id="hDesc" rows={4} value={f.description} onChange={set('description')} maxLength={4000} placeholder="Kitap s. 42–44, 20 soru." />
      </label>
      <div className="grid2">
        <label className="field" htmlFor="hFrom">
          Veriliş tarihi
          <input id="hFrom" type="date" value={f.assigned_on} onChange={set('assigned_on')} />
        </label>
        <label className="field" htmlFor="hDue">
          Son teslim{dueRequired ? '' : ' (isteğe bağlı)'}
          <input id="hDue" type="date" value={f.due_on} min={f.assigned_on} onChange={set('due_on')} />
        </label>
      </div>
      <p className="m" style={{ fontSize: 12, margin: 0 }}>
        Ek dosya/görsel yükleme dosya altyapısıyla (Faz C) eklenecek.
      </p>
      {err && (
        <div className="err" role="alert">
          {err}
        </div>
      )}
    </Modal>
  )
}

const MARKS: [HwStatus, string][] = [
  ['yapti', 'Yaptı'],
  ['yapmadi', 'Yapmadı'],
  ['eksik', 'Eksik'],
  ['gelmedi', 'Gelmedi'],
  ['izinli', 'İzinli'],
]

function HomeworkDetail({
  h,
  className,
  courseName,
  onBack,
  onEdit,
  editing,
  closeEdit,
  assignable,
  classes,
}: {
  h: Homework
  className: string
  courseName: string
  onBack: () => void
  onEdit: () => void
  editing: Homework | 'new' | null
  closeEdit: () => void
  assignable: Map<string, Set<string>>
  classes: ClassRow[]
}) {
  const { profile } = useAuth()
  const rows = useHomeworkRows({ homework: h.id })
  const students = useStudents()
  const qc = useQueryClient()
  const toast = useToast()
  const settings = useHwSettings()
  const [draft, setDraft] = useState<Record<string, { status: HwStatus; note: string }>>({})
  const [busy, setBusy] = useState(false)
  const [del, setDel] = useState(false)
  const canEdit = profile?.role === 'admin' || h.teacher_id === profile?.id
  const sName = (id: string) => students.data?.find((s) => s.id === id)?.full_name ?? '—'
  const list = [...(rows.data ?? [])].sort((a, b) => sName(a.student_id).localeCompare(sName(b.student_id), 'tr'))
  const val = (sid: string) => {
    const r = rows.data?.find((x) => x.student_id === sid)
    return draft[sid] ?? { status: r?.status ?? 'bekliyor', note: r?.note ?? '' }
  }
  const changed = list.filter((r) => val(r.student_id).status !== r.status || (val(r.student_id).note || null) !== (r.note || null))
  const counts = MARKS.map(([k, l]) => [l, list.filter((r) => val(r.student_id).status === k).length] as const)
  const waiting = list.filter((r) => val(r.student_id).status === 'bekliyor').length

  async function save() {
    setBusy(true)
    const { data, error } = await supabase.rpc('set_homework_statuses', {
      p_homework: h.id,
      p_items: changed.map((r) => ({ student_id: r.student_id, status: val(r.student_id).status, note: val(r.student_id).note })),
    })
    setBusy(false)
    if (error) return toast(errText(error)!, 'warn')
    setDraft({})
    qc.invalidateQueries({ queryKey: ['homework_students'] })
    toast(`${data} öğrencinin durumu kaydedildi`)
  }
  function allDone() {
    const d = { ...draft }
    for (const r of list) if (val(r.student_id).status === 'bekliyor') d[r.student_id] = { ...val(r.student_id), status: 'yapti' }
    setDraft(d)
  }

  return (
    <>
      <div className="head a">
        <div className="stack" style={{ gap: 4, minWidth: 0 }}>
          <button className="linkbtn" style={{ alignSelf: 'flex-start', textDecoration: 'none' }} onClick={onBack}>
            ← Ödevler
          </button>
          <span className="m" style={{ fontWeight: 500 }}>
            {className} · {courseName} · {trD(h.assigned_on)} → {h.due_on ? trDW(h.due_on) : 'tarihsiz'}
          </span>
          <h1 className="hd">{h.title}</h1>
        </div>
        {canEdit && (
          <div className="btns">
            <button className="btn" onClick={onEdit}>
              <Icon name="pen" size={16} /> Düzenle
            </button>
            <button className="btn" onClick={() => setDel(true)} aria-label="Ödevi sil">
              <Icon name="trash" size={16} />
            </button>
          </div>
        )}
      </div>
      {h.description && (
        <p className="card a" style={{ padding: 16, fontSize: 14, whiteSpace: 'pre-line', margin: 0 }}>
          {h.description}
        </p>
      )}
      <div className="kv a" style={{ ['--d' as string]: 1, flexWrap: 'wrap' }}>
        <div className="btns" aria-label="Özet">
          {counts.map(([l, n]) => (
            <span key={l} className="chip n">
              {l} {n}
            </span>
          ))}
          <span className="chip gold">Bekliyor {waiting}</span>
        </div>
        <button className="btn" onClick={allDone} disabled={!waiting}>
          <Icon name="check" size={16} /> Bekleyenlerin hepsi yaptı
        </button>
      </div>
      <section className="card a" style={{ ['--d' as string]: 2, overflow: 'hidden' }} aria-label="Öğrenci durumları">
        <div className="tbl">
          <table>
            <thead>
              <tr>
                <th>Öğrenci</th>
                <th>Durum</th>
                <th>Not</th>
              </tr>
            </thead>
            <tbody>
              {list.map((r) => {
                const v = val(r.student_id)
                return (
                  <tr key={r.student_id} data-testid="hw-row">
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <b>{sName(r.student_id)}</b>
                    </td>
                    <td>
                      <div className="seg" role="group" aria-label={`${sName(r.student_id)} ödev durumu`} style={{ display: 'inline-flex' }}>
                        {MARKS.map(([k, l]) => (
                          <button key={k} type="button" aria-pressed={v.status === k} onClick={() => setDraft((d) => ({ ...d, [r.student_id]: { ...v, status: v.status === k ? 'bekliyor' : k } }))} className={v.status === k ? `hwon ${CHIP[k]}` : undefined}>
                            {l}
                          </button>
                        ))}
                      </div>
                    </td>
                    <td style={{ minWidth: 200 }}>
                      <label className="field">
                        <input aria-label={`${sName(r.student_id)} notu`} value={v.note} maxLength={300} placeholder="ör. 4. sorudan sonrası eksik" onChange={(e) => setDraft((d) => ({ ...d, [r.student_id]: { ...v, note: e.target.value } }))} />
                      </label>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {!rows.isLoading && !list.length && (
          <div className="empty" style={{ margin: 16 }}>
            Bu ödevden sorumlu öğrenci yok.
          </div>
        )}
      </section>
      <div className="kv a" style={{ ['--d' as string]: 3 }}>
        <span className="m" style={{ fontSize: 12 }}>
          Seçili duruma tekrar basınca “Bekliyor”a döner. {settings.parentSees ? 'Kaydedince veliler durumu görür ve bildirim alır.' : 'Veliler durumu görmüyor (Ödev ayarları).'}
        </span>
        <button className="btn pri" onClick={save} disabled={busy || !changed.length}>
          {busy && <span className="spinner" aria-hidden="true" />} Kaydet{changed.length ? ` (${changed.length})` : ''}
        </button>
      </div>
      {editing && editing !== 'new' && <HomeworkModal h={editing} classes={classes} assignable={assignable} dueRequired={settings.dueRequired} onClose={closeEdit} onSaved={() => {}} />}
      {del && (
        <ConfirmDelete
          title="Ödevi sil"
          name={h.title}
          onClose={() => setDel(false)}
          onConfirm={async () => {
            const { error } = await supabase.from('homework').delete().eq('id', h.id)
            if (error) return errText(error)
            qc.invalidateQueries({ queryKey: ['homework'] })
            toast('Ödev silindi')
            onBack()
            return null
          }}
        >
          <b>{h.title}</b> ödevi ve öğrencilerin durum kayıtları silinecek.
        </ConfirmDelete>
      )}
    </>
  )
}

// ---------------------------------------------------------------- Veli / öğrenci
function AileOdev() {
  const { profile } = useAuth()
  const students = useStudents()
  const courses = useCourses()
  const hw = useHomework()
  const settings = useHwSettings()
  const [sp, setSp] = useSearchParams()
  const list = students.data ?? []
  const veli = profile?.role === 'veli'
  const s = veli ? (list.find((x) => x.id === sp.get('cocuk')) ?? list[0]) : list.find((x) => x.id === profile?.student_id)
  const rows = useHomeworkRows({ student: s?.id })
  const [tab, setTab] = useState<'bekleyen' | 'geciken' | 'tamam'>('bekleyen')
  const today = todayISO()
  const focus = sp.get('odev')

  const items = useMemo(() => {
    const byHw = new Map((rows.data ?? []).map((r) => [r.homework_id, r]))
    return (hw.data ?? [])
      .filter((h) => !s || h.class_id === s.class_id || byHw.has(h.id))
      .map((h) => {
        const r = byHw.get(h.id)
        const status: HwStatus = r?.status ?? 'bekliyor'
        const overdue = !!h.due_on && h.due_on < today
        const group = status === 'bekliyor' ? (overdue ? 'geciken' : 'bekleyen') : status === 'yapmadi' || status === 'eksik' ? 'geciken' : 'tamam'
        return { h, r, status, overdue, group }
      })
      .sort((a, b) => (a.h.due_on ?? '9999').localeCompare(b.h.due_on ?? '9999'))
  }, [hw.data, rows.data, s, today])

  useEffect(() => {
    const f = items.find((x) => x.h.id === focus)
    if (f) setTab(f.group as typeof tab)
  }, [focus, items])

  if (!s)
    return students.isLoading ? (
      <p className="m">
        <span className="spinner" aria-hidden="true" /> Yükleniyor…
      </p>
    ) : (
      <div className="empty">Bağlı öğrenci bulunamadı.</div>
    )
  const first = s.full_name.split(' ')[0]!
  const co = (id: string) => courses.data?.find((c) => c.id === id)
  const n = (g: string) => items.filter((x) => x.group === g).length
  const shown = items.filter((x) => x.group === tab)

  return (
    <>
      <div className="head a">
        <div className="stack" style={{ gap: 4 }}>
          <span className="m" style={{ fontWeight: 500 }}>
            {s.class_name}
          </span>
          <h1 className="hd">{veli ? `${first}'in ödevleri` : 'Ödevlerin'}</h1>
        </div>
      </div>
      {veli && list.length > 1 && (
        <Seg className="a" label="Çocuk" value={s.id} onChange={(id) => setSp({ cocuk: id }, { replace: true })} options={list.map((x) => [x.id, x.full_name.split(' ')[0]!] as const)} style={{ alignSelf: 'flex-start' }} />
      )}
      <Seg
        className="a"
        style={{ ['--d' as string]: 1, alignSelf: 'flex-start' }}
        label="Ödev listesi"
        value={tab}
        onChange={setTab}
        options={[
          ['bekleyen', `Bekleyen (${n('bekleyen')})`],
          ['geciken', `Geciken / eksik (${n('geciken')})`],
          ['tamam', `Tamamlanan (${n('tamam')})`],
        ]}
      />
      {veli && !settings.parentSees && (
        <p className="m a" style={{ fontSize: 13 }}>
          Okul, ödev durumlarını velilere göstermiyor; burada yalnız ödevler ve tarihleri var.
        </p>
      )}
      {shown.length ? (
        <div className="stack">
          {shown.map(({ h, r, status, overdue }, i) => {
            const c = co(h.course_id)
            const red = overdue && settings.lateRed && (status === 'bekliyor' || status === 'yapmadi' || status === 'eksik')
            return (
              <article key={h.id} className="card a" style={{ ['--d' as string]: Math.min(i + 2, 8), padding: 16, display: 'flex', flexDirection: 'column', gap: 6, borderLeft: `4px solid ${c?.color ?? 'var(--line-strong)'}`, outline: h.id === focus ? '2px solid var(--primary)' : undefined }} aria-label={h.title} data-testid="family-homework">
                <div className="kv" style={{ alignItems: 'flex-start' }}>
                  <span>
                    <span className="label">{c?.name}</span>
                    <b style={{ display: 'block', fontSize: 16 }}>{h.title}</b>
                  </span>
                  {(r || !veli || settings.parentSees) && status !== 'bekliyor' ? <span className={`chip ${CHIP[status]}`}>{HW_TR[status]}</span> : null}
                </div>
                {h.description && <p style={{ fontSize: 14, whiteSpace: 'pre-line', margin: 0 }}>{h.description}</p>}
                {r?.note && (
                  <p className="m" style={{ fontSize: 13, margin: 0 }}>
                    Öğretmen notu: {r.note}
                  </p>
                )}
                <span style={{ fontSize: 13, color: red ? 'var(--signal)' : 'var(--ink-muted)', fontWeight: red ? 600 : 400 }}>
                  {h.due_on ? `Son gün: ${trDW(h.due_on)}${red ? ' · gecikti' : ''}` : 'Son gün yok'}
                </span>
              </article>
            )
          })}
        </div>
      ) : (
        <div className="empty a">{tab === 'bekleyen' ? 'Bekleyen ödev yok.' : tab === 'geciken' ? 'Geciken ödev yok.' : 'Henüz tamamlanan ödev yok.'}</div>
      )}
    </>
  )
}
