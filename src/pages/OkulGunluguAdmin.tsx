// Yönetim → Yoklama, Ders programı, Yemek listesi (yalnız yönetici girer; 0009).
import { useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/auth/AuthProvider'
import { ATT_TR, MEAL_TR, useAssignments, useAttendance, useBellTimes, useCourses, useMeals, useTimetable, type AttendanceStatus, type Lesson, type MealKind } from '@/lib/data'
import { isTeacherP, LEVEL_TR, LEVELS } from '@/lib/roles'
import { GUN, addDays, todayISO, trD, trDW, weekStart } from '@/lib/format'
import type { ClassRow, Profile } from '@/lib/types'
import { Seg } from '@/components/Indicator'
import { Modal } from '@/components/Modal'
import { Icon } from '@/components/Icon'
import { useToast } from '@/components/Toast'
import { ProgramImageImport } from '@/components/ProgramImageImport'

interface Stu {
  id: string
  full_name: string
  class_id: string | null
}

const errText = (e: { message?: string } | null) => (e ? (/row-level security|42501/i.test(e.message ?? '') ? 'Bu işlem için yönetici yetkisi gerekir.' : (e.message ?? 'Kaydedilemedi.')) : null)

function ClassPick({ id, classes, value, onChange }: { id: string; classes: ClassRow[]; value: string; onChange: (v: string) => void }) {
  return (
    <label className="field" htmlFor={id} style={{ minWidth: 150 }}>
      Sınıf
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
        {LEVELS.map((lv) => {
          const cs = classes.filter((c) => c.level === lv)
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
  )
}

// ---------------------------------------------------------------- Yoklama
type Mark = 'geldi' | AttendanceStatus
const MARKS: [Mark, string][] = [
  ['geldi', 'Geldi'],
  ['devamsiz', 'Gelmedi'],
  ['gec', 'Geç'],
  ['izinli', 'İzinli'],
  ['raporlu', 'Raporlu'],
]

export function YoklamaAdmin({ classes, students }: { classes: ClassRow[]; students: Stu[] }) {
  const { profile } = useAuth()
  const qc = useQueryClient()
  const toast = useToast()
  const [day, setDay] = useState(todayISO())
  const [cls, setCls] = useState(classes[0]?.id ?? '')
  const att = useAttendance({ day })
  const inClass = useMemo(() => students.filter((s) => s.class_id === cls), [students, cls])
  const saved = useMemo(() => new Map((att.data ?? []).map((a) => [a.student_id, a])), [att.data])
  const [draft, setDraft] = useState<Record<string, Mark>>({})
  const [busy, setBusy] = useState(false)
  useEffect(() => setDraft({}), [day, cls])

  const markOf = (sid: string): Mark => draft[sid] ?? saved.get(sid)?.status ?? 'geldi'
  const changed = inClass.filter((s) => markOf(s.id) !== (saved.get(s.id)?.status ?? 'geldi'))

  async function save() {
    setBusy(true)
    const up = changed.filter((s) => markOf(s.id) !== 'geldi').map((s) => ({ school_id: profile!.school_id, student_id: s.id, day, status: markOf(s.id) }))
    const del = changed.filter((s) => markOf(s.id) === 'geldi').map((s) => saved.get(s.id)!.id)
    const r1 = up.length ? await supabase.from('attendance').upsert(up, { onConflict: 'student_id,day' }) : { error: null }
    const r2 = del.length ? await supabase.from('attendance').delete().in('id', del) : { error: null }
    setBusy(false)
    const e = r1.error ?? r2.error
    if (e) return toast(errText(e)!, 'warn')
    setDraft({})
    qc.invalidateQueries({ queryKey: ['attendance'] })
    toast(`Yoklama kaydedildi · ${inClass.filter((s) => markOf(s.id) !== 'geldi').length} öğrenci okulda değil`)
  }

  const dayAll = att.data ?? []
  return (
    <>
      <div className="btns a" style={{ alignItems: 'flex-end' }}>
        <label className="field" htmlFor="aDay">
          Tarih
          <input id="aDay" type="date" value={day} max={addDays(todayISO(), 30)} onChange={(e) => e.target.value && setDay(e.target.value)} />
        </label>
        <ClassPick id="aCls" classes={classes} value={cls} onChange={setCls} />
      </div>
      <div className="btns a" style={{ ['--d' as string]: 1 }} aria-label="Okul geneli">
        <span className="m" style={{ fontSize: 13 }}>
          {trDW(day)} · okul geneli:
        </span>
        {(['devamsiz', 'gec', 'izinli', 'raporlu'] as AttendanceStatus[]).map((k) => (
          <span key={k} className={`chip ${k === 'devamsiz' ? 'down' : 'n'}`}>
            {ATT_TR[k]} {dayAll.filter((a) => a.status === k).length}
          </span>
        ))}
      </div>
      <section className="card a" style={{ ['--d' as string]: 2, overflow: 'hidden' }}>
        {inClass.length ? (
          <div className="tbl">
            <table>
              <thead>
                <tr>
                  <th>Öğrenci</th>
                  <th>Durum</th>
                </tr>
              </thead>
              <tbody>
                {inClass.map((s) => (
                  <tr key={s.id} data-testid="att-row">
                    <td>
                      <b>{s.full_name}</b>
                    </td>
                    <td>
                      <Seg label={`${s.full_name} yoklama`} value={markOf(s.id)} onChange={(m) => setDraft((d) => ({ ...d, [s.id]: m }))} options={MARKS} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty" style={{ margin: 16 }}>
            Bu sınıfta öğrenci yok.
          </div>
        )}
      </section>
      <div className="kv a" style={{ ['--d' as string]: 3 }}>
        <span className="m" style={{ fontSize: 13 }}>
          İşaretlenmeyen öğrenci “Geldi” sayılır. Gelmedi ya da Geç işaretlenince veliye bildirim gider.
        </span>
        <button className="btn pri" onClick={save} disabled={busy || !changed.length}>
          {busy && <span className="spinner" aria-hidden="true" />} Yoklamayı kaydet{changed.length ? ` (${changed.length})` : ''}
        </button>
      </div>
    </>
  )
}

// ---------------------------------------------------------------- Ders programı

export function ProgramAdmin({ classes, profiles }: { classes: ClassRow[]; profiles: Profile[] }) {
  const [importImage, setImportImage] = useState(false)
  const [cls, setCls] = useState(classes[0]?.id ?? '')
  const [sat, setSat] = useState(false)
  const tt = useTimetable(cls)
  const bells = useBellTimes()
  const [cell, setCell] = useState<{ weekday: number; period: number; l?: Lesson } | null>(null)
  const teachers = profiles.filter((p) => p.status === 'approved' && isTeacherP(p))
  const lessons = tt.data ?? []
  const days = sat || lessons.some((l) => l.weekday === 6) ? [1, 2, 3, 4, 5, 6] : [1, 2, 3, 4, 5]
  // Satırlar: aktif ders saatleri + (pasif olsa da) dersi olan saatler; hiç saat yoksa 1–8
  const periods = [...new Set([...(bells.data ?? []).filter((b) => b.active !== false).map((b) => b.period), ...lessons.map((l) => l.period)])].sort((a, b) => a - b)
  if (!periods.length) periods.push(1, 2, 3, 4, 5, 6, 7, 8)
  const bell = (p: number) => bells.data?.find((b) => b.period === p)
  const tName = (id: string | null) => teachers.find((t) => t.id === id)?.full_name
  const cur = classes.find((c) => c.id === cls)
  const cName = cur?.name ?? ''

  return (
    <>
      <div className="btns a" style={{ alignItems: 'flex-end' }}>
        <ClassPick id="tCls" classes={classes} value={cls} onChange={setCls} />
        <button className="btn" disabled={!cls} onClick={() => setImportImage(true)}>Görselden yükle</button>
        <button type="button" className="check" role="checkbox" aria-checked={sat} onClick={() => setSat((x) => !x)} style={{ minHeight: 44 }}>
          <span className={`box ${sat ? 'on' : ''}`}>{sat && <Icon name="check" size={13} stroke={3} />}</span>
          <span style={{ fontSize: 14 }}>Cumartesi</span>
        </button>
      </div>
      <section className="card a" style={{ ['--d' as string]: 1, overflow: 'hidden' }} aria-label={`${cName} ders programı`}>
        <div className="tbl">
          <table>
            <thead>
              <tr>
                <th>Ders</th>
                {days.map((d) => (
                  <th key={d}>{GUN[d]}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {periods.map((p) => (
                <tr key={p}>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <b>{p}.</b>{' '}
                    <span className="m mono" style={{ fontSize: 12 }}>
                      {bell(p) ? `${bell(p)!.starts.slice(0, 5)}–${bell(p)!.ends.slice(0, 5)}` : ''}
                    </span>
                    {bell(p)?.label && (
                      <span className="m" style={{ display: 'block', fontSize: 11 }}>
                        {bell(p)!.label}
                      </span>
                    )}
                  </td>
                  {days.map((d) => {
                    const l = lessons.find((x) => x.weekday === d && x.period === p)
                    return (
                      <td key={d} style={{ padding: 4 }}>
                        <button
                          className="btn sm"
                          style={{ width: '100%', minWidth: 96, justifyContent: 'flex-start', flexDirection: 'column', alignItems: 'flex-start', gap: 0, background: l ? 'var(--primary-soft)' : undefined, borderStyle: l ? 'solid' : 'dashed' }}
                          onClick={() => setCell({ weekday: d, period: p, l })}
                          aria-label={`${GUN[d]} ${p}. ders${l ? `: ${l.subject}` : ' boş'}`}
                        >
                          <span style={{ fontWeight: 600 }}>{l ? l.subject : '+'}</span>
                          {l?.teacher_id && (
                            <span className="m" style={{ fontSize: 11, fontWeight: 400 }}>
                              {tName(l.teacher_id)}
                            </span>
                          )}
                        </button>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <p className="m" style={{ fontSize: 13 }}>
        Satırlar Yönetim Merkezi → <b>Ders saatleri</b>'nden, dersler <b>Dersler</b> kataloğundan gelir. Öğretmenli girilen ders, Ders atamalarına da eklenir.
      </p>
      {cell && <LessonModal cls={cls} level={cur?.level} cName={cName} {...cell} teachers={teachers} onClose={() => setCell(null)} />}
      {importImage && cur && <ProgramImageImport classId={cls} className={cName} level={cur.level} lessons={lessons} onClose={() => setImportImage(false)} />}
    </>
  )
}

function LessonModal({ cls, level, cName, weekday, period, l, teachers, onClose }: { cls: string; level?: string; cName: string; weekday: number; period: number; l?: Lesson; teachers: Profile[]; onClose: () => void }) {
  const { profile } = useAuth()
  const qc = useQueryClient()
  const toast = useToast()
  const courses = useCourses()
  const asg = useAssignments()
  const opts = (courses.data ?? []).filter((c) => (c.active && (!c.levels.length || !level || c.levels.includes(level as never))) || c.id === l?.course_id)
  const [course, setCourse] = useState(l?.course_id ?? '')
  const [teacher, setTeacher] = useState<string | null>(l ? (l.teacher_id ?? '') : null)
  const [err, setErr] = useState<string | null>(null)
  const courseId = course || opts[0]?.id || ''
  // Öğretmen seçilmediyse o sınıftaki bu dersin atanmış öğretmeni önerilir
  const suggested = (asg.data ?? []).find((a) => a.class_id === cls && a.course_id === courseId)?.teacher_id ?? ''
  const teacherId = teacher ?? suggested
  const done = (m: string) => {
    qc.invalidateQueries({ queryKey: ['timetable'] })
    qc.invalidateQueries({ queryKey: ['teaching_assignments'] })
    toast(m)
    onClose()
  }
  async function save() {
    if (!courseId) return setErr('Ders seç (Dersler kataloğunda ders yoksa önce ekle).')
    const name = opts.find((c) => c.id === courseId)?.name ?? ''
    const { error } = await supabase
      .from('timetable')
      .upsert({ school_id: profile!.school_id, class_id: cls, weekday, period, subject: name, course_id: courseId, teacher_id: teacherId || null }, { onConflict: 'class_id,weekday,period' })
    if (error) return setErr(errText(error))
    done(`${GUN[weekday]} ${period}. ders kaydedildi`)
  }
  async function remove() {
    const { error } = await supabase.from('timetable').delete().eq('id', l!.id)
    if (error) return setErr(errText(error))
    done(`${GUN[weekday]} ${period}. ders kaldırıldı`)
  }
  return (
    <Modal
      title={`${cName} · ${GUN[weekday]} ${period}. ders`}
      onClose={onClose}
      footer={
        <>
          {l && (
            <button className="btn" onClick={remove} style={{ marginRight: 'auto' }}>
              <Icon name="trash" size={15} /> Dersi kaldır
            </button>
          )}
          <button className="btn" onClick={onClose}>
            Vazgeç
          </button>
          <button className="btn pri" onClick={save}>
            Kaydet
          </button>
        </>
      }
    >
      <label className="field" htmlFor="lSub">
        Ders
        <select
          id="lSub"
          value={courseId}
          onChange={(e) => {
            setCourse(e.target.value)
            setTeacher(null)
          }}
        >
          {opts.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <label className="field" htmlFor="lTeacher">
        Öğretmen (isteğe bağlı)
        <select id="lTeacher" value={teacherId} onChange={(e) => setTeacher(e.target.value)}>
          <option value="">Seç</option>
          {teachers.map((t) => (
            <option key={t.id} value={t.id}>
              {t.full_name} · {t.role === 'admin' ? 'Yönetici' : t.branch}
            </option>
          ))}
        </select>
        {suggested && teacher === null && !l && (
          <span className="m" style={{ fontWeight: 400 }}>
            Ders atamasındaki öğretmen seçildi.
          </span>
        )}
      </label>
      {err && (
        <div className="err" role="alert">
          {err}
        </div>
      )}
    </Modal>
  )
}

// ---------------------------------------------------------------- Yemek listesi
const KINDS: MealKind[] = ['kahvalti', 'ogle', 'ikindi']

export function YemekAdmin() {
  const { profile } = useAuth()
  const qc = useQueryClient()
  const toast = useToast()
  const [week, setWeek] = useState(weekStart(todayISO()))
  const days = [0, 1, 2, 3, 4].map((i) => addDays(week, i))
  const meals = useMeals(days[0]!, days[4]!)
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  useEffect(() => setDraft({}), [week])
  const saved = (d: string, k: MealKind) => meals.data?.find((m) => m.day === d && m.meal === k)
  const val = (d: string, k: MealKind) => draft[`${d}|${k}`] ?? saved(d, k)?.items ?? ''

  async function save() {
    setBusy(true)
    const keys = Object.keys(draft).filter((key) => {
      const [d, k] = key.split('|') as [string, MealKind]
      return (draft[key] ?? '').trim() !== (saved(d, k)?.items ?? '')
    })
    const up = keys.filter((key) => draft[key]!.trim()).map((key) => {
      const [d, k] = key.split('|') as [string, MealKind]
      return { school_id: profile!.school_id, day: d, meal: k, items: draft[key]!.trim() }
    })
    const del = keys
      .filter((key) => !draft[key]!.trim())
      .map((key) => {
        const [d, k] = key.split('|') as [string, MealKind]
        return saved(d, k)?.id
      })
      .filter(Boolean) as string[]
    const r1 = up.length ? await supabase.from('meals').upsert(up, { onConflict: 'school_id,day,meal' }) : { error: null }
    const r2 = del.length ? await supabase.from('meals').delete().in('id', del) : { error: null }
    setBusy(false)
    const e = r1.error ?? r2.error
    if (e) return toast(errText(e)!, 'warn')
    setDraft({})
    qc.invalidateQueries({ queryKey: ['meals'] })
    toast('Yemek listesi kaydedildi')
  }

  return (
    <>
      <div className="kv a">
        <div className="btns">
          <button className="btn sm" onClick={() => setWeek(addDays(week, -7))} aria-label="Önceki hafta">
            <Icon name="back" size={16} />
          </button>
          <b>
            {trD(days[0]!)} – {trD(days[4]!)}
          </b>
          <button className="btn sm" onClick={() => setWeek(addDays(week, 7))} aria-label="Sonraki hafta">
            <Icon name="right" size={16} />
          </button>
        </div>
        <button className="btn pri" onClick={save} disabled={busy || !Object.keys(draft).length}>
          {busy && <span className="spinner" aria-hidden="true" />} Haftayı kaydet
        </button>
      </div>
      <section className="card a" style={{ ['--d' as string]: 1, overflow: 'hidden' }}>
        <div className="tbl">
          <table>
            <thead>
              <tr>
                <th>Gün</th>
                {KINDS.map((k) => (
                  <th key={k}>{MEAL_TR[k]}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {days.map((d) => (
                <tr key={d}>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <b>{trDW(d).split(' ').slice(-1)[0]}</b>
                    <br />
                    <span className="m" style={{ fontSize: 12 }}>
                      {trD(d)}
                    </span>
                  </td>
                  {KINDS.map((k) => (
                    <td key={k} style={{ minWidth: 180 }}>
                      <label className="field">
                        <textarea
                          rows={2}
                          style={{ minHeight: 56 }}
                          aria-label={`${trD(d)} ${MEAL_TR[k]}`}
                          placeholder={k === 'ogle' ? 'Mercimek çorbası, pilav…' : ''}
                          value={val(d, k)}
                          onChange={(e) => setDraft((x) => ({ ...x, [`${d}|${k}`]: e.target.value }))}
                        />
                      </label>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <p className="m a" style={{ fontSize: 13, ['--d' as string]: 2 }}>
        Boş bırakılan öğün velilere gösterilmez. Kaydedilen liste veli ve öğrenci panelinde “Okul” sayfasında görünür.
      </p>
    </>
  )
}
