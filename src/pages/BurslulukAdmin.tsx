// Yönetim Merkezi → Bursluluk (Faz G · 0018, Bursluluk 2.0 · 0021): sınav tanımlama, seanslar ve seans × sınıf kontenjanı,
// başvurular (süz, onayla/reddet, seans/salon, Excel), okul öğrencisinden başvuru, başvuranın düzenleme ayarları.
import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/auth/AuthProvider'
import { useStudents } from '@/lib/data'
import { fold, trD } from '@/lib/format'
import { Modal } from '@/components/Modal'
import { ConfirmDelete } from '@/components/ConfirmDelete'
import { Icon } from '@/components/Icon'
import { useToast } from '@/components/Toast'
import { hm, SessionsPanel, sessionLabel, useSessions, type Session } from './BurslulukSeans'

interface Exam {
  id: string
  name: string
  exam_date: string
  starts_at: string | null
  ends_at: string | null
  grades: number[]
  quota: number | null
  apply_from: string
  apply_until: string
  location: string | null
  description: string | null
  active: boolean
  applications_open: boolean
  self_edit: boolean
  edit_until: string | null
  edit_fields: string[]
}
interface App {
  id: string
  code: string
  tracking_code: string | null
  session_id: string | null
  exam_id: string
  student_id: string | null
  student_name: string
  grade: number
  current_school: string | null
  parent_name: string
  phone: string
  email: string | null
  status: 'bekliyor' | 'onaylandi' | 'reddedildi' | 'iptal'
  hall: string | null
  session_time: string | null
  note: string | null
  source: 'form' | 'okul'
  created_at: string
}
const ST_TR = { bekliyor: 'Bekliyor', onaylandi: 'Onaylandı', reddedildi: 'Reddedildi', iptal: 'İptal' } as const
const ST_CHIP = { bekliyor: 'gold', onaylandi: 'up', reddedildi: 'down', iptal: 'n' } as const
const EDIT_FIELDS = [['student_name', 'Öğrenci adı'], ['current_school', 'Okulu'], ['grade', 'Sınıfı'], ['parent_name', 'Veli adı'], ['phone', 'Telefon'], ['email', 'E-posta'], ['session', 'Seans']] as const
const errText = (e: { message?: string } | null) => (e ? (/row-level security/i.test(e.message ?? '') ? 'Bu işlem için yönetici yetkisi gerekir.' : (e.message ?? 'Kaydedilemedi.')) : null)

function useExams() {
  return useQuery({ queryKey: ['sch_exams'], queryFn: async () => ((await supabase.from('scholarship_exams').select('*').order('exam_date', { ascending: false })).data ?? []) as Exam[] })
}
function useApps(exam: string) {
  return useQuery({
    queryKey: ['sch_apps', exam],
    enabled: !!exam,
    queryFn: async () => ((await supabase.from('scholarship_applications').select('*').eq('exam_id', exam).order('created_at')).data ?? []) as App[],
  })
}

/** Excel'in Türkçe sürümünün doğrudan açtığı CSV (UTF-8 BOM, ; ayraç). */
function exportCsv(exam: Exam, rows: App[], sessions: Session[]) {
  const head = ['Takip kodu', 'Öğrenci', 'Sınıf', 'Okulu', 'Veli', 'Telefon', 'E-posta', 'Sınav günü', 'Seans', 'Saat', 'Salon', 'Durum', 'Başvuru tarihi', 'Kaynak', 'Not', 'Başvuru no']
  const esc = (v: unknown) => {
    const s = v == null ? '' : String(v)
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const lines = rows.map((r) => {
      const ses = sessions.find((x) => x.id === r.session_id)
      return [r.tracking_code, r.student_name, `${r.grade}. sınıf`, r.current_school, r.parent_name, r.phone, r.email,
        ses ? new Date(ses.session_date).toLocaleDateString('tr-TR') : new Date(exam.exam_date).toLocaleDateString('tr-TR'),
        ses ? (ses.name ?? 'Seans') : 'Eski başvuru / seans atanmamış', ses ? `${hm(ses.starts_at)}–${hm(ses.ends_at)}` : hm(r.session_time),
        r.hall, ST_TR[r.status], new Date(r.created_at).toLocaleString('tr-TR'), r.source === 'okul' ? 'Okul öğrencisi' : 'Başvuru formu', r.note, r.code]
        .map(esc)
        .join(';')
    })
  const blob = new Blob(['﻿' + [head.join(';'), ...lines].join('\r\n')], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `bursluluk-${exam.name.toLocaleLowerCase('tr').replace(/[^a-z0-9çğıöşü]+/gi, '-')}.csv`
  a.click()
}

export function BurslulukAdmin() {
  const exams = useExams()
  const [sel, setSel] = useState('')
  const [edit, setEdit] = useState<Exam | 'new' | null>(null)
  const [del, setDel] = useState<Exam | null>(null)
  const qc = useQueryClient()
  const toast = useToast()
  const list = exams.data ?? []
  const cur = list.find((e) => e.id === sel) ?? list[0]
  const link = `${window.location.origin}/bursluluk`

  return (
    <>
      <div className="card a" style={{ padding: 14, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <Icon name="users" size={20} />
        <span style={{ flex: 1, fontSize: 14, minWidth: 220 }}>
          Başvuru sayfası (giriş gerekmez): <b className="mono">{link}</b>
        </span>
        <button className="btn sm" onClick={() => navigator.clipboard?.writeText(link).then(() => toast('Bağlantı kopyalandı'))}>
          Bağlantıyı kopyala
        </button>
        <button className="btn pri" onClick={() => setEdit('new')}>
          <Icon name="plus" size={18} stroke={2} /> Bursluluk sınavı oluştur
        </button>
      </div>
      {list.length ? (
        <>
          <div className="btns a" role="group" aria-label="Sınavlar">
            {list.map((e) => (
              <button key={e.id} className={`btn sm ${cur?.id === e.id ? 'pri' : ''}`} aria-pressed={cur?.id === e.id} onClick={() => setSel(e.id)}>
                {e.name}
              </button>
            ))}
          </div>
          {cur && <ExamPanel e={cur} onEdit={() => setEdit(cur)} onDelete={() => setDel(cur)} />}
        </>
      ) : (
        <div className="empty a">Henüz bursluluk sınavı yok.</div>
      )}
      {edit && <ExamModal e={edit === 'new' ? null : edit} onClose={() => setEdit(null)} onSaved={(id) => setSel(id)} />}
      {del && (
        <ConfirmDelete
          title="Sınavı sil"
          name={del.name}
          onClose={() => setDel(null)}
          onConfirm={async () => {
            const { error } = await supabase.from('scholarship_exams').delete().eq('id', del.id)
            if (error) return errText(error)
            qc.invalidateQueries({ queryKey: ['sch_exams'] })
            toast('Sınav silindi')
            setDel(null)
            setSel('')
            return null
          }}
        >
          <b>{del.name}</b> ve bütün başvuruları kalıcı olarak silinecek. Başvuruları saklamak için önce Excel'e aktar.
        </ConfirmDelete>
      )}
    </>
  )
}

function ExamPanel({ e, onEdit, onDelete }: { e: Exam; onEdit: () => void; onDelete: () => void }) {
  const apps = useApps(e.id)
  const ses = useSessions(e.id)
  const sessions = ses.data?.sessions ?? []
  const students = useStudents()
  const qc = useQueryClient()
  const toast = useToast()
  const [st, setSt] = useState<'all' | App['status']>('all')
  const [grade, setGrade] = useState('all')
  const [day, setDay] = useState('all')
  const [sesF, setSesF] = useState('all')
  const [q, setQ] = useState('')
  const [draft, setDraft] = useState<Record<string, { hall: string; session_time: string }>>({})
  const [addStu, setAddStu] = useState('')
  const [addSes, setAddSes] = useState('')
  const days = [...new Set(sessions.map((x) => x.session_date))]
  const sesOf = (r: App) => sessions.find((x) => x.id === r.session_id)
  const all = apps.data ?? []
  const needle = fold(q)
  const rows = all.filter(
    (r) =>
      (st === 'all' || r.status === st) &&
      (grade === 'all' || String(r.grade) === grade) &&
      (day === 'all' || sesOf(r)?.session_date === day) &&
      (sesF === 'all' || (sesF === 'yok' ? !r.session_id : r.session_id === sesF)) &&
      (!needle || fold(`${r.student_name} ${r.parent_name} ${r.code} ${r.tracking_code ?? ''} ${r.phone}`).includes(needle)),
  )
  const active = all.filter((r) => r.status === 'bekliyor' || r.status === 'onaylandi').length
  const refresh = () => qc.invalidateQueries({ queryKey: ['sch_apps', e.id] })
  const eligible = useMemo(() => (students.data ?? []).filter((s) => e.grades.includes(Number(s.class_name.split('/')[0])) && !all.some((a) => a.student_id === s.id && a.status !== 'iptal')), [students.data, e.grades, all])

  async function setStatus(r: App, status: App['status']) {
    const { error } = await supabase.from('scholarship_applications').update({ status }).eq('id', r.id)
    if (error) return toast(errText(error)!, 'warn')
    refresh()
  }
  async function setSession(r: App, session_id: string) {
    const { error } = await supabase.from('scholarship_applications').update({ session_id }).eq('id', r.id)
    if (error) return toast(errText(error)!, 'warn')
    toast(`${r.student_name}: seans değiştirildi`)
    refresh()
    qc.invalidateQueries({ queryKey: ['sch_sessions', e.id] })
  }
  async function saveHall(r: App) {
    const d = draft[r.id]
    if (!d) return
    const { error } = await supabase
      .from('scholarship_applications')
      .update(r.session_id ? { hall: d.hall.trim() || null } : { hall: d.hall.trim() || null, session_time: d.session_time || null })
      .eq('id', r.id)
    if (error) return toast(errText(error)!, 'warn')
    setDraft((x) => {
      const y = { ...x }
      delete y[r.id]
      return y
    })
    toast(`${r.student_name}: salon kaydedildi`)
    refresh()
  }
  async function toggle(k: 'active' | 'applications_open') {
    const { error } = await supabase.from('scholarship_exams').update({ [k]: !e[k] }).eq('id', e.id)
    if (error) return toast(errText(error)!, 'warn')
    qc.invalidateQueries({ queryKey: ['sch_exams'] })
  }
  async function addFromStudent() {
    if (!addStu) return
    const { error } = await supabase.rpc('admin_add_application', { p_exam: e.id, p_student: addStu, p_session: addSes || null })
    if (error) return toast(errText(error)!, 'warn')
    setAddStu('')
    setAddSes('')
    toast('Okul öğrencisi başvurusu eklendi')
    refresh()
  }

  return (
    <>
      <section className="card a" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }} aria-label={`${e.name} bilgileri`}>
        <div className="kv" style={{ flexWrap: 'wrap' }}>
          <span style={{ fontSize: 14 }}>
            <b>{trD(e.exam_date)}</b>
            {e.starts_at ? ` · ${e.starts_at.slice(0, 5)}${e.ends_at ? `–${e.ends_at.slice(0, 5)}` : ''}` : ''}
            {e.location ? ` · ${e.location}` : ''} · {e.grades.join(', ')}. sınıflar · Başvuru {trD(e.apply_from)} – {trD(e.apply_until)}
            {e.self_edit && e.edit_until ? ` · Başvuran ${trD(e.edit_until)} tarihine kadar düzenleyebilir` : ''}
          </span>
          <div className="btns">
            <button className="btn sm" onClick={onEdit}>
              <Icon name="pen" size={15} /> Düzenle
            </button>
            <button className="btn sm" onClick={onDelete} aria-label="Sınavı sil">
              <Icon name="trash" size={15} />
            </button>
          </div>
        </div>
        <div className="btns">
          <span className="chip n">
            Başvuru {active}
            {e.quota ? ` / ${e.quota} (genel üst sınır)` : ''}
          </span>
          <button type="button" role="switch" aria-checked={e.active} className={`btn sm ${e.active ? 'pri' : ''}`} onClick={() => toggle('active')}>
            {e.active ? 'Aktif' : 'Pasif'}
          </button>
          <button type="button" role="switch" aria-checked={e.applications_open} className={`btn sm ${e.applications_open ? 'pri' : ''}`} onClick={() => toggle('applications_open')}>
            {e.applications_open ? 'Başvuru açık' : 'Başvuru kapalı'}
          </button>
        </div>
      </section>
      <SessionsPanel exam={e} grades={e.grades} apps={all} />
      <div className="kv a" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div className="btns" style={{ alignItems: 'flex-end' }}>
          <label className="field" style={{ minWidth: 140 }}>
            <select aria-label="Durum" value={st} onChange={(ev) => setSt(ev.target.value as typeof st)}>
              <option value="all">Bütün durumlar</option>
              {(Object.keys(ST_TR) as App['status'][]).map((k) => (
                <option key={k} value={k}>
                  {ST_TR[k]}
                </option>
              ))}
            </select>
          </label>
          <label className="field" style={{ minWidth: 120 }}>
            <select aria-label="Sınıf seviyesi" value={grade} onChange={(ev) => setGrade(ev.target.value)}>
              <option value="all">Bütün sınıflar</option>
              {e.grades.map((g) => (
                <option key={g} value={g}>
                  {g}. sınıf
                </option>
              ))}
            </select>
          </label>
          {days.length > 1 && (
            <label className="field" style={{ minWidth: 140 }}>
              <select aria-label="Gün" value={day} onChange={(ev) => setDay(ev.target.value)}>
                <option value="all">Bütün günler</option>
                {days.map((d) => (
                  <option key={d} value={d}>
                    {trD(d)}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="field" style={{ minWidth: 160 }}>
            <select aria-label="Seans" value={sesF} onChange={(ev) => setSesF(ev.target.value)}>
              <option value="all">Bütün seanslar</option>
              {sessions.map((x) => (
                <option key={x.id} value={x.id}>
                  {sessionLabel(x)}
                </option>
              ))}
              <option value="yok">Seans atanmamış (eski)</option>
            </select>
          </label>
          <label className="field" style={{ minWidth: 200 }}>
            <input aria-label="Ara" placeholder="Ad, takip kodu, telefon" value={q} onChange={(ev) => setQ(ev.target.value)} />
          </label>
        </div>
        <button className="btn" onClick={() => exportCsv(e, rows, sessions)} disabled={!rows.length}>
          <Icon name="doc" size={16} /> Excel'e aktar ({rows.length})
        </button>
      </div>
      <section className="card a" style={{ overflow: 'hidden' }} aria-label="Başvurular">
        {rows.length ? (
          <div className="tbl">
            <table>
              <thead>
                <tr>
                  <th>Öğrenci</th>
                  <th>Veli</th>
                  <th>Durum</th>
                  <th>Seans · salon</th>
                  <th aria-label="İşlemler" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const d = draft[r.id] ?? { hall: r.hall ?? '', session_time: r.session_time?.slice(0, 5) ?? '' }
                  return (
                    <tr key={r.id} data-testid="application-row">
                      <td>
                        <b>{r.student_name}</b>
                        <span className="m" style={{ display: 'block', fontSize: 12 }}>
                          {r.grade}. sınıf{r.current_school ? ` · ${r.current_school}` : ''} · <span className="mono">{r.tracking_code ?? r.code}</span>
                          {r.source === 'okul' ? ' · okul öğrencisi' : ''}
                        </span>
                      </td>
                      <td style={{ fontSize: 13 }}>
                        {r.parent_name}
                        <span className="m" style={{ display: 'block', fontSize: 12 }}>
                          {r.phone}
                          {r.email ? ` · ${r.email}` : ''}
                        </span>
                      </td>
                      <td>
                        <span className={`chip ${ST_CHIP[r.status]}`}>{ST_TR[r.status]}</span>
                      </td>
                      <td>
                        <label className="field" style={{ minWidth: 190, marginBottom: 4 }}>
                          <select aria-label={`${r.student_name} seans`} value={r.session_id ?? ''} onChange={(ev) => ev.target.value && setSession(r, ev.target.value)}>
                            {!r.session_id && <option value="">Eski başvuru / seans atanmamış</option>}
                            {sessions.map((x) => (
                              <option key={x.id} value={x.id} disabled={!x.active && x.id !== r.session_id}>
                                {sessionLabel(x)}
                              </option>
                            ))}
                          </select>
                        </label>
                        <div className="btns" style={{ flexWrap: 'nowrap' }}>
                          <label className="field" style={{ width: 90 }}>
                            <input aria-label={`${r.student_name} salon`} placeholder="Salon" value={d.hall} maxLength={60} onChange={(ev) => setDraft((x) => ({ ...x, [r.id]: { ...d, hall: ev.target.value } }))} />
                          </label>
                          {!r.session_id && (
                            <label className="field" style={{ width: 124 }}>
                              <input aria-label={`${r.student_name} saat`} type="time" value={d.session_time} onChange={(ev) => setDraft((x) => ({ ...x, [r.id]: { ...d, session_time: ev.target.value } }))} />
                            </label>
                          )}
                          {draft[r.id] && (
                            <button className="btn sm pri" onClick={() => saveHall(r)}>
                              Kaydet
                            </button>
                          )}
                        </div>
                      </td>
                      <td>
                        <div className="btns" style={{ justifyContent: 'flex-end', flexWrap: 'nowrap' }}>
                          {r.status !== 'onaylandi' && (
                            <button className="btn sm" onClick={() => setStatus(r, 'onaylandi')} aria-label={`${r.student_name} onayla`}>
                              <Icon name="check" size={15} /> Onayla
                            </button>
                          )}
                          {r.status !== 'reddedildi' && (
                            <button className="btn sm" onClick={() => setStatus(r, 'reddedildi')} aria-label={`${r.student_name} reddet`}>
                              <Icon name="x" size={15} /> Reddet
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty" style={{ margin: 16 }}>
            {all.length ? 'Bu süzgeçte başvuru yok.' : 'Henüz başvuru yok.'}
          </div>
        )}
      </section>
      <section className="card a" style={{ padding: 14, display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }} aria-label="Okul öğrencisinden başvuru">
        <label className="field" htmlFor="bsStu" style={{ minWidth: 260 }}>
          Okul öğrencisinden başvuru oluştur
          <select id="bsStu" value={addStu} onChange={(ev) => setAddStu(ev.target.value)}>
            <option value="">Öğrenci seç ({e.grades.join(', ')}. sınıflar)</option>
            {eligible.map((s) => (
              <option key={s.id} value={s.id}>
                {s.full_name} · {s.class_name}
              </option>
            ))}
          </select>
        </label>
        {sessions.length > 0 && (
          <label className="field" htmlFor="bsSes" style={{ minWidth: 220 }}>
            Başvurunun seansı
            <select id="bsSes" value={addSes} onChange={(ev) => setAddSes(ev.target.value)}>
              <option value="">Seans seç</option>
              {sessions
                .filter((x) => x.active)
                .map((x) => (
                  <option key={x.id} value={x.id}>
                    {sessionLabel(x)}
                  </option>
                ))}
            </select>
          </label>
        )}
        <button className="btn" disabled={!addStu || (sessions.length > 0 && !addSes)} onClick={addFromStudent}>
          <Icon name="plus" size={15} /> Ekle
        </button>
        <span className="m" style={{ fontSize: 12 }}>
          Veli bilgileri bağlı veliden alınır; başvuru onaylı açılır. Seans ya da salon atanınca veliye bildirim gider.
        </span>
      </section>
    </>
  )
}

function ExamModal({ e, onClose, onSaved }: { e: Exam | null; onClose: () => void; onSaved: (id: string) => void }) {
  const { profile } = useAuth()
  const qc = useQueryClient()
  const toast = useToast()
  const [f, setF] = useState({
    name: e?.name ?? '',
    exam_date: e?.exam_date ?? '',
    starts_at: e?.starts_at?.slice(0, 5) ?? '10:00',
    ends_at: e?.ends_at?.slice(0, 5) ?? '',
    grades: e?.grades ?? [],
    quota: e?.quota ? String(e.quota) : '',
    apply_from: e?.apply_from ?? new Date().toISOString().slice(0, 10),
    apply_until: e?.apply_until ?? '',
    location: e?.location ?? '',
    description: e?.description ?? '',
    active: e?.active ?? true,
    applications_open: e?.applications_open ?? true,
    self_edit: e?.self_edit ?? false,
    edit_until: e?.edit_until ?? '',
    edit_fields: e?.edit_fields ?? EDIT_FIELDS.map(([k]) => k as string),
  })
  const [err, setErr] = useState<string | null>(null)
  const set = (k: keyof typeof f) => (ev: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF((x) => ({ ...x, [k]: ev.target.value }))
  async function save() {
    if (f.name.trim().length < 3) return setErr('Sınav adını yaz.')
    if (!f.exam_date || !f.apply_until) return setErr('Sınav tarihi ve son başvuru tarihini seç.')
    if (!(f.apply_from <= f.apply_until && f.apply_until <= f.exam_date)) return setErr('Tarihler sırayla olmalı: başvuru başlangıcı ≤ son başvuru ≤ sınav tarihi.')
    if (!f.grades.length) return setErr('En az bir sınıf seviyesi seç.')
    if (f.self_edit && !f.edit_until) return setErr('Düzenleme son tarihini seç.')
    if (f.edit_until && f.edit_until > f.exam_date) return setErr('Düzenleme son tarihi sınav tarihinden sonra olamaz.')
    const row = {
      name: f.name.trim(),
      exam_date: f.exam_date,
      grades: [...f.grades].sort((a, b) => a - b),
      quota: f.quota ? Number(f.quota) : null,
      apply_from: f.apply_from,
      apply_until: f.apply_until,
      location: f.location.trim() || null,
      description: f.description.trim() || null,
      active: f.active,
      applications_open: f.applications_open,
      self_edit: f.self_edit,
      edit_until: f.edit_until || null,
      edit_fields: f.edit_fields,
    }
    const res = e ? await supabase.from('scholarship_exams').update(row).eq('id', e.id).select('id').single() : await supabase.from('scholarship_exams').insert({ ...row, school_id: profile!.school_id }).select('id').single()
    if (res.error) return setErr(errText(res.error))
    qc.invalidateQueries({ queryKey: ['sch_exams'] })
    toast(e ? 'Sınav güncellendi' : 'Bursluluk sınavı oluşturuldu')
    onSaved(res.data.id as string)
    onClose()
  }
  return (
    <Modal
      title={e ? 'Bursluluk sınavını düzenle' : 'Bursluluk sınavı oluştur'}
      width={640}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Vazgeç
          </button>
          <button className="btn pri" onClick={save}>
            Kaydet
          </button>
        </>
      }
    >
      <label className="field" htmlFor="sName">
        Sınav adı
        <input id="sName" value={f.name} onChange={set('name')} maxLength={150} placeholder="ör. 2027 Bursluluk Sınavı" />
      </label>
      <div className="grid2">
        <label className="field" htmlFor="sDate">
          Sınav tarihi (ilk gün)
          <input id="sDate" type="date" value={f.exam_date} onChange={set('exam_date')} />
        </label>
        <label className="field" htmlFor="sQuota">
          Genel üst sınır (isteğe bağlı)
          <input id="sQuota" type="number" min={1} value={f.quota} onChange={set('quota')} />
        </label>
        <label className="field" htmlFor="sFrom">
          Başvuru başlangıcı
          <input id="sFrom" type="date" value={f.apply_from} onChange={set('apply_from')} />
        </label>
        <label className="field" htmlFor="sUntil">
          Son başvuru
          <input id="sUntil" type="date" value={f.apply_until} onChange={set('apply_until')} />
        </label>
      </div>
      <div className="stack" style={{ gap: 6 }}>
        <span className="label">Sınıf seviyeleri</span>
        <div className="btns" role="group" aria-label="Sınıf seviyeleri">
          {Array.from({ length: 12 }, (_, i) => i + 1).map((g) => {
            const on = f.grades.includes(g)
            return (
              <button key={g} type="button" className={`btn sm ${on ? 'pri' : ''}`} aria-pressed={on} onClick={() => setF((x) => ({ ...x, grades: on ? x.grades.filter((y) => y !== g) : [...x.grades, g] }))}>
                {g}
              </button>
            )
          })}
        </div>
      </div>
      <label className="field" htmlFor="sLoc">
        Sınav yeri (isteğe bağlı)
        <input id="sLoc" value={f.location} onChange={set('location')} maxLength={200} />
      </label>
      <label className="field" htmlFor="sDesc">
        Açıklama (başvuru sayfasında görünür)
        <textarea id="sDesc" rows={3} value={f.description} onChange={set('description')} maxLength={2000} />
      </label>
      <div className="stack" style={{ gap: 8, borderTop: '1px solid var(--line)', paddingTop: 12 }}>
        <button type="button" className="check" role="switch" aria-checked={f.self_edit} onClick={() => setF((x) => ({ ...x, self_edit: !x.self_edit }))}>
          <span className={`box ${f.self_edit ? 'on' : ''}`}>{f.self_edit && <Icon name="check" size={13} stroke={3} />}</span>
          <span style={{ flex: 1, fontSize: 14 }}>
            <b>Başvuran başvurusunu düzenleyebilir</b>
            <span className="m" style={{ display: 'block', fontSize: 12 }}>
              Takip koduyla, son tarihe kadar; seans değişirse kontenjan yeniden denetlenir. Başvurusunu iptal de edebilir.
            </span>
          </span>
        </button>
        {f.self_edit && (
          <>
            <div className="btns" style={{ alignItems: 'flex-end' }}>
              <label className="field" htmlFor="sEditUntil" style={{ maxWidth: 220 }}>
                Düzenleme son tarihi
                <input id="sEditUntil" type="date" value={f.edit_until} max={f.exam_date || undefined} onChange={set('edit_until')} />
              </label>
              {f.exam_date && (
                <button type="button" className="btn sm" onClick={() => setF((x) => ({ ...x, edit_until: new Date(Date.parse(x.exam_date) - 10 * 86400_000).toISOString().slice(0, 10) }))}>
                  Sınavdan 10 gün önce
                </button>
              )}
            </div>
            <div className="btns" role="group" aria-label="Düzenlenebilecek alanlar">
              {EDIT_FIELDS.map(([k, l]) => {
                const on = f.edit_fields.includes(k)
                return (
                  <button key={k} type="button" className={`btn sm ${on ? 'pri' : ''}`} aria-pressed={on} onClick={() => setF((x) => ({ ...x, edit_fields: on ? x.edit_fields.filter((y) => y !== k) : [...x.edit_fields, k] }))}>
                    {l}
                  </button>
                )
              })}
            </div>
          </>
        )}
      </div>
      {err && (
        <div className="err" role="alert">
          {err}
        </div>
      )}
    </Modal>
  )
}
