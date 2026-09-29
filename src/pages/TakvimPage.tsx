// Takvim (Faz D · 0015): sınav ve etkinlikler + ödev teslim günleri. Kim neyi görür / ekler veritabanında zorlanır.
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/auth/AuthProvider'
import { EVENT_COLOR, EVENT_TR, useAssignments, useCalendar, useClasses, useCourses, useHomework, usePeople, useSettings, useStudents, type CalEvent, type EventType } from '@/lib/data'
import { LEVEL_TR, LEVELS, type Level } from '@/lib/roles'
import { GUN, addDays, isoDow, todayISO, trD, trDW } from '@/lib/format'
import { Modal } from '@/components/Modal'
import { ConfirmDelete } from '@/components/ConfirmDelete'
import { Icon } from '@/components/Icon'
import { useToast } from '@/components/Toast'

const AYLAR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık']
const TYPES = Object.keys(EVENT_TR) as EventType[]
const AUD = { veli: 'Veliler', ogrenci: 'Öğrenciler', ogretmen: 'Öğretmenler' } as const
const errText = (e: { message?: string } | null) => (e ? (/row-level security/i.test(e.message ?? '') ? 'Bu hedefe etkinlik ekleme yetkin yok.' : (e.message ?? 'Kaydedilemedi.')) : null)

/** Takvimde gösterilen öğe: gerçek etkinlik ya da ödev teslim günü (salt okunur). */
type Item = { key: string; title: string; type: EventType; starts_on: string; ends_on: string; time: string | null; ev?: CalEvent; homework?: string }

const monthStart = (iso: string) => `${iso.slice(0, 7)}-01`
const monthEnd = (iso: string) => {
  const [y, m] = iso.split('-').map(Number) as [number, number]
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)
}

export default function TakvimPage() {
  const { profile, role } = useAuth()
  const [sp, setSp] = useSearchParams()
  const nav = useNavigate()
  const today = todayISO()
  const [month, setMonth] = useState(monthStart(today))
  const [filter, setFilter] = useState<'all' | EventType>('all')
  const [edit, setEdit] = useState<CalEvent | 'new' | null>(null)
  const settings = useSettings()
  const from = addDays(month, 1 - isoDow(month))
  const to = addDays(monthEnd(month), 7 - isoDow(monthEnd(month)))
  const upTo = addDays(today, 45)
  const cal = useCalendar(from < today ? from : today, to > upTo ? to : upTo)
  const hw = useHomework()
  const students = useStudents()
  const family = role === 'veli' || role === 'ogrenci'
  const open = sp.get('etkinlik')
  const single = useQuery({
    queryKey: ['calendar-one', open],
    enabled: !!open,
    queryFn: async () => (await supabase.from('calendar_events').select('*').eq('id', open!).maybeSingle()).data as CalEvent | null,
  })
  const teacherCan = (settings.data?.['takvim.ogretmen_ekler'] as boolean | undefined) ?? true
  const canAdd = role === 'admin' || role === 'rehber' || (role === 'brans' && teacherCan)

  const items = useMemo<Item[]>(() => {
    const evs: Item[] = (cal.data ?? []).map((e) => ({ key: e.id, title: e.title, type: e.type, starts_on: e.starts_on, ends_on: e.ends_on, time: e.starts_at?.slice(0, 5) ?? null, ev: e }))
    // Ödev teslim günleri: aile kendi çocuğunun sınıfınınkini, öğretmen verdiklerini görür
    const mineCls = new Set((students.data ?? []).map((s) => s.class_id))
    const hws: Item[] = (hw.data ?? [])
      .filter((h) => h.due_on && (family ? mineCls.has(h.class_id) : h.teacher_id === profile?.id))
      .map((h) => ({ key: `hw-${h.id}`, title: h.title, type: 'odev_teslim', starts_on: h.due_on!, ends_on: h.due_on!, time: null, homework: h.id }))
    return [...evs, ...hws].filter((x) => filter === 'all' || x.type === filter)
  }, [cal.data, hw.data, students.data, family, profile?.id, filter])

  const on = (d: string) => items.filter((x) => x.starts_on <= d && x.ends_on >= d)
  const days = Array.from({ length: Math.round((Date.parse(to) - Date.parse(from)) / 86400_000) + 1 }, (_, i) => addDays(from, i))
  const upcoming = items.filter((x) => x.ends_on >= today && x.starts_on <= upTo).sort((a, b) => a.starts_on.localeCompare(b.starts_on) || (a.time ?? '').localeCompare(b.time ?? ''))
  const [y, m] = month.split('-').map(Number) as [number, number]
  const shift = (n: number) => setMonth(monthStart(new Date(Date.UTC(y, m - 1 + n, 1)).toISOString()))
  const detail = open ? (cal.data?.find((e) => e.id === open) ?? single.data ?? null) : null
  const openItem = (x: Item) => (x.homework ? nav(`/odevler?odev=${x.homework}`) : setSp({ etkinlik: x.key }, { replace: true }))

  return (
    <>
      <div className="head a">
        <h1 className="hd">Takvim</h1>
        {canAdd && (
          <button className="btn pri" onClick={() => setEdit('new')}>
            <Icon name="plus" size={18} stroke={2} /> Etkinlik ekle
          </button>
        )}
      </div>
      <div className="kv a" style={{ ['--d' as string]: 1, flexWrap: 'wrap' }}>
        <div className="btns">
          <button className="btn sm" onClick={() => shift(-1)} aria-label="Önceki ay">
            <Icon name="back" size={16} />
          </button>
          <b style={{ minWidth: 130, textAlign: 'center' }} aria-live="polite">
            {AYLAR[m - 1]} {y}
          </b>
          <button className="btn sm" onClick={() => shift(1)} aria-label="Sonraki ay">
            <Icon name="right" size={16} />
          </button>
          <button className="btn sm" onClick={() => setMonth(monthStart(today))}>
            Bugün
          </button>
        </div>
        <label className="field" style={{ minWidth: 180 }}>
          <select aria-label="Tür" value={filter} onChange={(e) => setFilter(e.target.value as 'all' | EventType)}>
            <option value="all">Bütün türler</option>
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {EVENT_TR[t]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="calcols">
        <section className="card a calgrid" style={{ ['--d' as string]: 2 }} aria-label={`${AYLAR[m - 1]} ${y} takvimi`}>
          {['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'].map((d, i) => (
            <div key={d} className="calhd" title={GUN[i + 1]}>
              {d}
            </div>
          ))}
          {days.map((d) => {
            const list = on(d)
            return (
              <div key={d} className={`calday${d.slice(0, 7) !== month.slice(0, 7) ? ' out' : ''}${d === today ? ' today' : ''}`} data-testid="cal-day" data-date={d}>
                <span className="calnum">{Number(d.slice(8))}</span>
                {list.slice(0, 3).map((x) => (
                  <button key={x.key} className="calchip" style={{ ['--c' as string]: EVENT_COLOR[x.type] }} onClick={() => openItem(x)} title={`${EVENT_TR[x.type]}: ${x.title}`} aria-label={`${trD(d)} · ${EVENT_TR[x.type]}: ${x.title}`}>
                    {x.time ? `${x.time} ` : ''}
                    {x.title}
                  </button>
                ))}
                {list.length > 3 && <span className="m" style={{ fontSize: 11 }}>+{list.length - 3}</span>}
              </div>
            )
          })}
        </section>
        <aside className="card a" style={{ ['--d' as string]: 3, padding: 16, display: 'flex', flexDirection: 'column', gap: 10, alignSelf: 'flex-start' }} aria-label="Yaklaşanlar">
          <h2 style={{ fontSize: 17 }}>Yaklaşanlar</h2>
          {upcoming.length ? (
            upcoming.slice(0, 15).map((x) => (
              <button key={x.key} className="srow" style={{ padding: '8px 4px', borderTop: 0 }} onClick={() => openItem(x)} data-testid="upcoming">
                <span style={{ width: 4, alignSelf: 'stretch', borderRadius: 4, background: EVENT_COLOR[x.type] }} aria-hidden="true" />
                <span style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                  <b style={{ display: 'block', fontSize: 14 }}>{x.title}</b>
                  <span className="m" style={{ fontSize: 12 }}>
                    {EVENT_TR[x.type]} · {trDW(x.starts_on)}
                    {x.time ? ` · ${x.time}` : ''}
                    {x.ends_on !== x.starts_on ? ` → ${trD(x.ends_on)}` : ''}
                  </span>
                </span>
              </button>
            ))
          ) : (
            <span className="m">Önümüzdeki 45 günde etkinlik yok.</span>
          )}
        </aside>
      </div>
      {detail && <EventDetail e={detail} onClose={() => setSp({}, { replace: true })} onEdit={() => setEdit(detail)} />}
      {edit && <EventModal e={edit === 'new' ? null : edit} onClose={() => setEdit(null)} />}
    </>
  )
}

function targetText(e: CalEvent, cls: (id: string | null) => string, stu: (id: string | null) => string, per: (id: string | null) => string) {
  return e.target === 'okul' ? 'Tüm okul' : e.target === 'kademe' ? LEVEL_TR[e.level!] : e.target === 'sinif' ? cls(e.class_id) : e.target === 'ogrenci' ? stu(e.student_id) : per(e.teacher_id)
}

function EventDetail({ e, onClose, onEdit }: { e: CalEvent; onClose: () => void; onEdit: () => void }) {
  const { profile, role } = useAuth()
  const classes = useClasses()
  const students = useStudents()
  const people = usePeople()
  const courses = useCourses()
  const qc = useQueryClient()
  const toast = useToast()
  const [del, setDel] = useState(false)
  const mine = role === 'admin' || e.created_by === profile?.id
  const cls = (id: string | null) => classes.data?.find((c) => c.id === id)?.name ?? 'Sınıf'
  const stu = (id: string | null) => students.data?.find((s) => s.id === id)?.full_name ?? 'Öğrenci'
  const per = (id: string | null) => people.data?.find((p) => p.id === id)?.full_name ?? 'Öğretmen'
  const time = e.starts_at ? `${e.starts_at.slice(0, 5)}${e.ends_at ? `–${e.ends_at.slice(0, 5)}` : ''}` : 'Tüm gün'
  return (
    <Modal
      title={e.title}
      sub={EVENT_TR[e.type]}
      onClose={onClose}
      footer={
        mine ? (
          <>
            <button className="btn" onClick={() => setDel(true)} style={{ marginRight: 'auto' }}>
              <Icon name="trash" size={15} /> Sil
            </button>
            <button className="btn pri" onClick={onEdit}>
              <Icon name="pen" size={15} /> Düzenle
            </button>
          </>
        ) : undefined
      }
    >
      <div className="stack" style={{ gap: 8, fontSize: 14 }}>
        <div className="kv">
          <span className="m">Tarih</span>
          <b>
            {trDW(e.starts_on)}
            {e.ends_on !== e.starts_on ? ` → ${trDW(e.ends_on)}` : ''}
          </b>
        </div>
        <div className="kv">
          <span className="m">Saat</span>
          <b>{time}</b>
        </div>
        {e.location && (
          <div className="kv">
            <span className="m">Yer</span>
            <b>{e.location}</b>
          </div>
        )}
        <div className="kv">
          <span className="m">Kimin için</span>
          <b>{targetText(e, cls, stu, per)}</b>
        </div>
        {e.course_id && (
          <div className="kv">
            <span className="m">Ders</span>
            <b>{courses.data?.find((c) => c.id === e.course_id)?.name}</b>
          </div>
        )}
        {e.description && <p style={{ whiteSpace: 'pre-line', margin: 0 }}>{e.description}</p>}
      </div>
      {del && (
        <ConfirmDelete
          title="Etkinliği sil"
          name={e.title}
          onClose={() => setDel(false)}
          onConfirm={async () => {
            const { error } = await supabase.from('calendar_events').delete().eq('id', e.id)
            if (error) return errText(error)
            qc.invalidateQueries({ queryKey: ['calendar'] })
            toast('Etkinlik silindi')
            onClose()
            return null
          }}
        >
          <b>{e.title}</b> takvimden silinecek.
        </ConfirmDelete>
      )}
    </Modal>
  )
}

function EventModal({ e, onClose }: { e: CalEvent | null; onClose: () => void }) {
  const { profile, role } = useAuth()
  const classes = useClasses()
  const students = useStudents()
  const people = usePeople()
  const courses = useCourses()
  const asg = useAssignments()
  const qc = useQueryClient()
  const toast = useToast()
  const staff = role === 'admin' || role === 'rehber'
  const myClassIds = useMemo(() => {
    const s = new Set<string>()
    for (const a of asg.data ?? []) if (a.teacher_id === profile?.id) s.add(a.class_id)
    for (const c of classes.data ?? []) if (c.homeroom_teacher_id === profile?.id) s.add(c.id)
    return s
  }, [asg.data, classes.data, profile?.id])
  const clsOpts = (classes.data ?? []).filter((c) => staff || myClassIds.has(c.id))
  const stuOpts = (students.data ?? []).filter((s) => staff || (s.class_id && myClassIds.has(s.class_id)))
  const teachers = (people.data ?? []).filter((p) => p.role === 'ogretmen' || p.role === 'admin')
  const targets: [CalEvent['target'], string][] = staff
    ? [['okul', 'Tüm okul'], ['kademe', 'Kademe'], ['sinif', 'Sınıf'], ['ogrenci', 'Öğrenci'], ['ogretmen', 'Öğretmen']]
    : [['sinif', 'Sınıfım'], ['ogrenci', 'Öğrencim'], ['ogretmen', 'Kendim']]
  const [f, setF] = useState({
    title: e?.title ?? '',
    type: (e?.type ?? (staff ? 'diger' : 'yazili')) as EventType,
    starts_on: e?.starts_on ?? todayISO(),
    ends_on: e?.ends_on ?? todayISO(),
    allDay: !e?.starts_at,
    starts_at: e?.starts_at?.slice(0, 5) ?? '09:00',
    ends_at: e?.ends_at?.slice(0, 5) ?? '',
    location: e?.location ?? '',
    description: e?.description ?? '',
    target: (e?.target ?? targets[0]![0]) as CalEvent['target'],
    level: (e?.level ?? 'ortaokul') as Level,
    class_id: e?.class_id ?? '',
    student_id: e?.student_id ?? '',
    teacher_id: e?.teacher_id ?? (staff ? '' : (profile?.id ?? '')),
    course_id: e?.course_id ?? '',
    audience: e?.audience ?? (['veli', 'ogrenci', 'ogretmen'] as CalEvent['audience']),
  })
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (f.ends_on < f.starts_on) setF((x) => ({ ...x, ends_on: x.starts_on }))
  }, [f.starts_on]) // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k: keyof typeof f) => (ev: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF((x) => ({ ...x, [k]: ev.target.value }))

  async function save() {
    if (f.title.trim().length < 3) return setErr('Başlık en az 3 harf olmalı.')
    if (f.ends_on < f.starts_on) return setErr('Bitiş, başlangıçtan önce olamaz.')
    const cls = f.class_id || clsOpts[0]?.id || ''
    const stu = f.student_id || stuOpts[0]?.id || ''
    const tch = staff ? f.teacher_id || teachers[0]?.id || '' : profile!.id
    if (f.target === 'sinif' && !cls) return setErr('Sınıf seç.')
    if (f.target === 'ogrenci' && !stu) return setErr('Öğrenci seç.')
    if (!f.audience.length) return setErr('En az bir alıcı grubu seç.')
    const row = {
      title: f.title.trim(),
      type: f.type,
      starts_on: f.starts_on,
      ends_on: f.ends_on,
      starts_at: f.allDay ? null : f.starts_at || null,
      ends_at: f.allDay ? null : f.ends_at || null,
      location: f.location.trim() || null,
      description: f.description.trim() || null,
      target: f.target,
      level: f.target === 'kademe' ? f.level : null,
      class_id: f.target === 'sinif' ? cls : null,
      student_id: f.target === 'ogrenci' ? stu : null,
      teacher_id: f.target === 'ogretmen' ? tch : null,
      course_id: f.course_id || null,
      audience: f.audience,
    }
    setBusy(true)
    const { error } = e ? await supabase.from('calendar_events').update(row).eq('id', e.id) : await supabase.from('calendar_events').insert({ ...row, school_id: profile!.school_id, created_by: profile!.id })
    setBusy(false)
    if (error) return setErr(errText(error))
    qc.invalidateQueries({ queryKey: ['calendar'] })
    qc.invalidateQueries({ queryKey: ['calendar-one'] })
    toast(e ? 'Etkinlik güncellendi' : 'Etkinlik eklendi; ilgililere bildirim gitti')
    onClose()
  }

  return (
    <Modal
      title={e ? 'Etkinliği düzenle' : 'Etkinlik ekle'}
      width={640}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Vazgeç
          </button>
          <button className="btn pri" onClick={save} disabled={busy}>
            {busy && <span className="spinner" aria-hidden="true" />} Kaydet
          </button>
        </>
      }
    >
      <div className="grid2">
        <label className="field" htmlFor="eTitle">
          Başlık
          <input id="eTitle" value={f.title} onChange={set('title')} maxLength={150} />
        </label>
        <label className="field" htmlFor="eType">
          Tür
          <select id="eType" value={f.type} onChange={set('type')}>
            {TYPES.filter((t) => t !== 'odev_teslim').map((t) => (
              <option key={t} value={t}>
                {EVENT_TR[t]}
              </option>
            ))}
          </select>
        </label>
        <label className="field" htmlFor="eFrom">
          Başlangıç
          <input id="eFrom" type="date" value={f.starts_on} onChange={set('starts_on')} />
        </label>
        <label className="field" htmlFor="eTo">
          Bitiş
          <input id="eTo" type="date" value={f.ends_on} min={f.starts_on} onChange={set('ends_on')} />
        </label>
      </div>
      <button type="button" className="check" role="checkbox" aria-checked={f.allDay} onClick={() => setF((x) => ({ ...x, allDay: !x.allDay }))}>
        <span className={`box ${f.allDay ? 'on' : ''}`}>{f.allDay && <Icon name="check" size={13} stroke={3} />}</span>
        <span style={{ fontSize: 14 }}>Tüm gün</span>
      </button>
      {!f.allDay && (
        <div className="grid2">
          <label className="field" htmlFor="eSAt">
            Saat
            <input id="eSAt" type="time" value={f.starts_at} onChange={set('starts_at')} />
          </label>
          <label className="field" htmlFor="eEAt">
            Bitiş saati (isteğe bağlı)
            <input id="eEAt" type="time" value={f.ends_at} onChange={set('ends_at')} />
          </label>
        </div>
      )}
      <div className="grid2">
        <label className="field" htmlFor="eTarget">
          Kimin için
          <select id="eTarget" value={f.target} onChange={set('target')}>
            {targets.map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </label>
        {f.target === 'kademe' && (
          <label className="field" htmlFor="eLevel">
            Kademe
            <select id="eLevel" value={f.level} onChange={set('level')}>
              {LEVELS.map((l) => (
                <option key={l} value={l}>
                  {LEVEL_TR[l]}
                </option>
              ))}
            </select>
          </label>
        )}
        {f.target === 'sinif' && (
          <label className="field" htmlFor="eClass">
            Sınıf
            <select id="eClass" value={f.class_id || clsOpts[0]?.id || ''} onChange={set('class_id')}>
              {clsOpts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {f.target === 'ogrenci' && (
          <label className="field" htmlFor="eStu">
            Öğrenci
            <select id="eStu" value={f.student_id || stuOpts[0]?.id || ''} onChange={set('student_id')}>
              {stuOpts.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.full_name} · {s.class_name}
                </option>
              ))}
            </select>
          </label>
        )}
        {f.target === 'ogretmen' && staff && (
          <label className="field" htmlFor="eTch">
            Öğretmen
            <select id="eTch" value={f.teacher_id || teachers[0]?.id || ''} onChange={set('teacher_id')}>
              {teachers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.full_name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {['yazili', 'proje'].includes(f.type) && (
        <label className="field" htmlFor="eCourse">
          Ders (isteğe bağlı)
          <select id="eCourse" value={f.course_id} onChange={set('course_id')}>
            <option value="">—</option>
            {(courses.data ?? [])
              .filter((c) => c.active)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </select>
        </label>
      )}
      {f.target !== 'ogretmen' && (
        <div className="stack" style={{ gap: 6 }}>
          <span className="label">Kime görünsün</span>
          <div className="btns">
            {(Object.keys(AUD) as (keyof typeof AUD)[]).map((k) => {
              const on = f.audience.includes(k)
              return (
                <button key={k} type="button" className="check" role="checkbox" aria-checked={on} onClick={() => setF((x) => ({ ...x, audience: on ? x.audience.filter((a) => a !== k) : [...x.audience, k] }))}>
                  <span className={`box ${on ? 'on' : ''}`}>{on && <Icon name="check" size={13} stroke={3} />}</span>
                  <span style={{ fontSize: 14 }}>{AUD[k]}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}
      <label className="field" htmlFor="eLoc">
        Yer (isteğe bağlı)
        <input id="eLoc" value={f.location} onChange={set('location')} maxLength={120} placeholder="ör. Konferans salonu" />
      </label>
      <label className="field" htmlFor="eDesc">
        Açıklama (isteğe bağlı)
        <textarea id="eDesc" rows={3} value={f.description} onChange={set('description')} maxLength={2000} />
      </label>
      {err && (
        <div className="err" role="alert">
          {err}
        </div>
      )}
    </Modal>
  )
}
