// Yönetim → Bursluluk → Seanslar ve kontenjan (0021): sınav günleri, seanslar, seans × sınıf kontenjanı, doluluk.
// Kontenjan aşımı veritabanında (sch_app_capacity, kilitli) engellenir; bu ekran yalnız tanımlar ve gösterir.
import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { trDW } from '@/lib/format'
import { Modal } from '@/components/Modal'
import { Icon } from '@/components/Icon'
import { useToast } from '@/components/Toast'

export interface Session {
  id: string
  exam_id: string
  name: string | null
  session_date: string
  starts_at: string
  ends_at: string
  location: string | null
  active: boolean
  sort_order: number
}
export interface Quota {
  id: string
  session_id: string
  grade: number
  capacity: number
  enabled: boolean
}
/** Kontenjanı dolduran durumlar */
export const COUNTS = ['bekliyor', 'onaylandi'] as const
export const hm = (t: string | null | undefined) => (t ? t.slice(0, 5) : '')
export const sessionLabel = (s: Pick<Session, 'name' | 'session_date' | 'starts_at' | 'ends_at'>) =>
  `${trDW(s.session_date)} · ${hm(s.starts_at)}–${hm(s.ends_at)}${s.name ? ` · ${s.name}` : ''}`

export function useSessions(exam: string) {
  return useQuery({
    queryKey: ['sch_sessions', exam],
    enabled: !!exam,
    queryFn: async () => {
      const [s, q] = await Promise.all([
        supabase.from('scholarship_sessions').select('*').eq('exam_id', exam).order('session_date').order('starts_at').order('sort_order'),
        supabase.from('scholarship_session_quotas').select('*, scholarship_sessions!inner(exam_id)').eq('scholarship_sessions.exam_id', exam),
      ])
      if (s.error) throw s.error
      if (q.error) throw q.error
      return { sessions: s.data as Session[], quotas: (q.data as (Quota & { scholarship_sessions?: unknown })[]).map(({ scholarship_sessions: _x, ...r }) => r as Quota) }
    },
  })
}

interface AppLite {
  session_id: string | null
  grade: number
  status: string
}

export function SessionsPanel({ exam, grades, apps }: { exam: { id: string; name: string; exam_date: string }; grades: number[]; apps: AppLite[] }) {
  const data = useSessions(exam.id)
  const qc = useQueryClient()
  const toast = useToast()
  const [edit, setEdit] = useState<Session | 'new' | null>(null)
  const [draft, setDraft] = useState<Record<string, Record<number, string>>>({})
  const sessions = data.data?.sessions ?? []
  const quotas = data.data?.quotas ?? []
  const refresh = () => qc.invalidateQueries({ queryKey: ['sch_sessions', exam.id] })
  const used = (sid: string, g: number) => apps.filter((a) => a.session_id === sid && a.grade === g && (COUNTS as readonly string[]).includes(a.status)).length
  const quota = (sid: string, g: number) => quotas.find((q) => q.session_id === sid && q.grade === g)

  async function saveQuotas(s: Session) {
    const d = draft[s.id] ?? {}
    const rows = Object.entries(d).map(([g, v]) => ({ session_id: s.id, grade: Number(g), capacity: v.trim() === '' ? 0 : Number(v), enabled: v.trim() !== '' }))
    if (rows.some((r) => !Number.isInteger(r.capacity) || r.capacity < 0 || r.capacity > 10000)) return toast('Kontenjan 0–10000 arası tam sayı olmalı.', 'warn')
    const { error } = await supabase.from('scholarship_session_quotas').upsert(rows, { onConflict: 'session_id,grade' })
    if (error) return toast(error.message, 'warn')
    setDraft((x) => {
      const y = { ...x }
      delete y[s.id]
      return y
    })
    toast('Kontenjan kaydedildi')
    refresh()
  }
  async function toggle(s: Session) {
    const { error } = await supabase.from('scholarship_sessions').update({ active: !s.active }).eq('id', s.id)
    if (error) return toast(error.message, 'warn')
    refresh()
  }
  async function remove(s: Session) {
    const { error } = await supabase.from('scholarship_sessions').delete().eq('id', s.id)
    if (error) return toast(/foreign key/i.test(error.message) ? 'Bu seansta başvuru var; silmek yerine pasif yap.' : error.message, 'warn')
    toast('Seans silindi')
    refresh()
  }

  return (
    <section className="card a" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }} aria-label="Seanslar ve kontenjan">
      <div className="kv" style={{ flexWrap: 'wrap' }}>
        <h3 style={{ fontSize: 16 }}>Seanslar ve kontenjan</h3>
        <button className="btn sm pri" onClick={() => setEdit('new')}>
          <Icon name="plus" size={15} stroke={2} /> Seans ekle
        </button>
      </div>
      <p className="m" style={{ fontSize: 13, margin: 0 }}>
        Başvuran sınıf seviyesini ve seansını kendisi seçer. Her seansta her sınıf için ayrı kontenjan girilir; boş bırakılan sınıf o seansta kapalıdır. Bekleyen ve onaylanan başvurular kontenjanı doldurur.
      </p>
      {!sessions.length ? (
        <div className="empty">Bu sınav için henüz seans tanımlanmamış; başvuru alınmaz.</div>
      ) : (
        <div className="tbl">
          <table>
            <thead>
              <tr>
                <th>Seans</th>
                {grades.map((g) => (
                  <th key={g}>{g}. sınıf</th>
                ))}
                <th aria-label="İşlemler" />
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => (
                <tr key={s.id} data-testid="session-row" style={{ opacity: s.active ? 1 : 0.6 }}>
                  <td style={{ minWidth: 180 }}>
                    <b style={{ fontSize: 14 }}>{sessionLabel(s)}</b>
                    <span className="m" style={{ display: 'block', fontSize: 12 }}>
                      {s.location ?? ''}
                      {!s.active && ' · pasif'}
                    </span>
                  </td>
                  {grades.map((g) => {
                    const q = quota(s.id, g)
                    const val = draft[s.id]?.[g] ?? (q?.enabled ? String(q.capacity) : '')
                    const u = used(s.id, g)
                    const left = q?.enabled ? q.capacity - u : null
                    return (
                      <td key={g} style={{ minWidth: 92 }}>
                        <label className="field" style={{ width: 84 }}>
                          <input
                            aria-label={`${sessionLabel(s)} ${g}. sınıf kontenjan`}
                            inputMode="numeric"
                            value={val}
                            placeholder="kapalı"
                            onChange={(ev) => setDraft((x) => ({ ...x, [s.id]: { ...(x[s.id] ?? {}), [g]: ev.target.value } }))}
                          />
                        </label>
                        {q?.enabled && (
                          <span className="m" style={{ display: 'block', fontSize: 11, color: left! <= 0 ? 'var(--signal-ink, var(--signal))' : undefined, fontWeight: left! <= 0 ? 700 : 400 }}>
                            {u} başvuru · {left! <= 0 ? 'DOLU' : `kalan ${left}`}
                          </span>
                        )}
                      </td>
                    )
                  })}
                  <td>
                    <div className="btns" style={{ justifyContent: 'flex-end', flexWrap: 'nowrap' }}>
                      {draft[s.id] && (
                        <button className="btn sm pri" onClick={() => saveQuotas(s)}>
                          Kaydet
                        </button>
                      )}
                      <button className="btn sm" onClick={() => setEdit(s)} aria-label={`${sessionLabel(s)} düzenle`}>
                        <Icon name="pen" size={14} />
                      </button>
                      <button type="button" role="switch" aria-checked={s.active} className="btn sm" onClick={() => toggle(s)} aria-label={`${sessionLabel(s)} ${s.active ? 'pasif yap' : 'etkinleştir'}`}>
                        {s.active ? 'Aktif' : 'Pasif'}
                      </button>
                      <button className="btn sm" onClick={() => remove(s)} aria-label={`${sessionLabel(s)} sil`}>
                        <Icon name="trash" size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {edit && <SessionModal exam={exam} s={edit === 'new' ? null : edit} onClose={() => setEdit(null)} onSaved={refresh} />}
    </section>
  )
}

function SessionModal({ exam, s, onClose, onSaved }: { exam: { id: string; exam_date: string }; s: Session | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast()
  const [f, setF] = useState({
    session_date: s?.session_date ?? exam.exam_date,
    starts_at: hm(s?.starts_at) || '10:00',
    ends_at: hm(s?.ends_at) || '12:30',
    name: s?.name ?? '',
    location: s?.location ?? '',
  })
  const [err, setErr] = useState<string | null>(null)
  const set = (k: keyof typeof f) => (ev: React.ChangeEvent<HTMLInputElement>) => setF((x) => ({ ...x, [k]: ev.target.value }))
  async function save() {
    if (!f.session_date || !f.starts_at || !f.ends_at) return setErr('Tarih ve saatleri gir.')
    if (f.ends_at <= f.starts_at) return setErr('Bitiş saati başlangıçtan sonra olmalı.')
    const row = { session_date: f.session_date, starts_at: f.starts_at, ends_at: f.ends_at, name: f.name.trim() || null, location: f.location.trim() || null }
    const res = s ? await supabase.from('scholarship_sessions').update(row).eq('id', s.id) : await supabase.from('scholarship_sessions').insert({ ...row, exam_id: exam.id })
    if (res.error) return setErr(res.error.message)
    toast(s ? 'Seans güncellendi' : 'Seans eklendi; şimdi sınıf kontenjanlarını gir')
    onSaved()
    onClose()
  }
  return (
    <Modal
      title={s ? 'Seansı düzenle' : 'Seans ekle'}
      width={520}
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
      <div className="grid2">
        <label className="field" htmlFor="ssDate">
          Sınav günü
          <input id="ssDate" type="date" value={f.session_date} onChange={set('session_date')} />
        </label>
        <label className="field" htmlFor="ssName">
          Seans adı (isteğe bağlı)
          <input id="ssName" value={f.name} onChange={set('name')} maxLength={60} placeholder="ör. Sabah seansı" />
        </label>
        <label className="field" htmlFor="ssStart">
          Başlangıç
          <input id="ssStart" type="time" value={f.starts_at} onChange={set('starts_at')} />
        </label>
        <label className="field" htmlFor="ssEnd">
          Bitiş
          <input id="ssEnd" type="time" value={f.ends_at} onChange={set('ends_at')} />
        </label>
      </div>
      <label className="field" htmlFor="ssLoc">
        Yer (isteğe bağlı; boşsa sınavın yeri)
        <input id="ssLoc" value={f.location} onChange={set('location')} maxLength={200} />
      </label>
      {err && (
        <div className="err" role="alert">
          {err}
        </div>
      )}
    </Modal>
  )
}
