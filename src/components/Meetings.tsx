import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { Meeting } from '@/lib/data'
import { useRefresh } from '@/lib/data'
import { addDays, localDate, localHM, todayISO, toTs, trDM, trDW } from '@/lib/format'
import type { Student } from '@/lib/types'
import { Modal } from './Modal'
import { Seg } from './Indicator'
import { useToast } from './Toast'
import { Icon } from './Icon'

export const WITH_TR = { veli: 'Veli görüşmesi', ogrenci: 'Öğrenci görüşmesi', ikisi: 'Veli ve öğrenci' } as const
export const WITH_SHORT = { veli: 'Veli', ogrenci: 'Öğrenci', ikisi: 'Veli ve öğrenci' } as const

/** Görüşme satırları (prototipteki meetList). */
export function MeetingList({
  meetings,
  studentName,
  canManage,
  canRespond,
  onChange,
}: {
  meetings: Meeting[]
  studentName: (sid: string) => string
  canManage?: boolean
  canRespond?: boolean
  onChange?: (m: Meeting) => void
}) {
  const toast = useToast()
  const refresh = useRefresh()
  const today = todayISO()
  if (!meetings.length) return <div className="empty a">Görüşme yok.</div>

  const cancel = async (g: Meeting) => {
    if (!window.confirm('Görüşme iptal edilsin mi? Veli ve öğrenciye bildirim gider.')) return
    const { error } = await supabase.from('meetings').update({ canceled_at: new Date().toISOString() }).eq('id', g.id)
    if (error) return toast('İptal edilemedi.', 'warn')
    toast('Görüşme iptal edildi')
    refresh('meetings')
  }
  const reply = async (g: Meeting, r: 'ok' | 'no') => {
    const { error } = await supabase.from('meetings').update({ reply: r }).eq('id', g.id)
    if (error) return toast('Yanıt gönderilemedi.', 'warn')
    toast('Yanıtın iletildi')
    refresh('meetings')
  }

  return (
    <section className="card a" style={{ ['--d' as string]: 3, overflow: 'hidden' }}>
      {meetings.map((g) => {
        const d = localDate(g.starts_at)
        const past = d < today
        return (
          <div className="row" key={g.id} data-testid="meeting-row" style={{ flexWrap: 'wrap' }}>
            <span
              style={{
                width: 64,
                textAlign: 'center',
                fontSize: 12,
                fontWeight: 600,
                color: past ? 'var(--ink-muted)' : 'var(--primary)',
                background: past ? 'var(--surface-sunken)' : 'var(--primary-soft)',
                borderRadius: 10,
                padding: '6px 0',
                lineHeight: 1.3,
                flexShrink: 0,
              }}
            >
              {trDM(d)}
              <br />
              {localHM(g.starts_at)}
            </span>
            <span style={{ flex: 1, minWidth: 180 }}>
              <b style={{ display: 'block' }}>
                {studentName(g.student_id)} · {WITH_TR[g.with_whom]}
              </b>
              <span className="m" style={{ fontSize: 13 }}>
                {trDW(d)}
                {g.note ? ` · ${g.note}` : ''}
                {g.reply && (
                  <>
                    {' · '}
                    <b style={{ color: g.reply === 'ok' ? 'var(--primary)' : 'var(--signal)' }}>{g.reply === 'ok' ? 'Katılım onaylandı' : 'Başka zaman istendi'}</b>
                  </>
                )}
              </span>
            </span>
            {canManage && !past && (
              <div className="btns">
                <button className="btn sm" onClick={() => onChange?.(g)}>
                  Değiştir
                </button>
                <button className="btn sm ghost" style={{ color: 'var(--signal)' }} onClick={() => cancel(g)}>
                  İptal
                </button>
              </div>
            )}
            {canRespond && !past && (
              <div className="btns">
                <button className="btn sm soft" aria-pressed={g.reply === 'ok'} onClick={() => reply(g, 'ok')}>
                  Katılacağım
                </button>
                <button className="btn sm" aria-pressed={g.reply === 'no'} onClick={() => reply(g, 'no')}>
                  Başka zaman
                </button>
              </div>
            )}
          </div>
        )
      })}
    </section>
  )
}

const TIMES = (() => {
  const t: string[] = []
  for (let h = 8; h <= 17; h++) for (const mm of ['00', '30']) t.push(`${String(h).padStart(2, '0')}:${mm}`)
  return t
})()

/** Görüşme planla / değiştir. */
export function MeetingModal({ student, edit, hasParent, onClose }: { student: Student; edit?: Meeting; hasParent?: boolean; onClose: () => void }) {
  const toast = useToast()
  const refresh = useRefresh()
  const today = todayISO()
  const [w, setW] = useState<Meeting['with_whom']>(edit?.with_whom ?? 'veli')
  const [date, setDate] = useState(edit ? localDate(edit.starts_at) : addDays(today, 1))
  const [time, setTime] = useState(edit ? localHM(edit.starts_at) : '14:00')
  const [note, setNote] = useState(edit?.note ?? '')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const times = TIMES.includes(time) ? TIMES : [...TIMES, time].sort()

  async function save() {
    if (!date || date < today) return setErr('Geçmiş bir gün seçilemez.')
    setBusy(true)
    const row = { with_whom: w, starts_at: toTs(date, time), note: note.trim() || null }
    const { error } = edit
      ? await supabase.from('meetings').update(row).eq('id', edit.id)
      : await supabase.from('meetings').insert({ ...row, student_id: student.id, created_by: (await supabase.auth.getUser()).data.user!.id })
    setBusy(false)
    if (error) return setErr(error.message || 'Kaydedilemedi.')
    toast(edit ? 'Değişiklik kaydedildi · bildirim gitti' : 'Görüşme planlandı · bildirim gitti')
    refresh('meetings')
    onClose()
  }

  const who = w === 'veli' ? 'veliye' : w === 'ogrenci' ? 'öğrenciye' : 'veliye ve öğrenciye'
  return (
    <Modal
      title={edit ? 'Görüşmeyi değiştir' : 'Görüşme planla'}
      sub={`${student.full_name} · ${student.class_name}`}
      avatar={student.full_name}
      onClose={onClose}
      footer={
        <>
          <button className="btn" type="button" onClick={onClose}>
            Vazgeç
          </button>
          <button className="btn pri" type="button" disabled={busy} onClick={save}>
            {edit ? 'Değişikliği kaydet' : 'Planla ve bildir'}
          </button>
        </>
      }
    >
      <div className="stack" style={{ gap: 6 }}>
        <span className="label">Kiminle</span>
        <Seg
          label="Kiminle"
          stretch
          value={w}
          onChange={setW}
          options={[
            ['veli', 'Veli'],
            ['ogrenci', 'Öğrenci'],
            ['ikisi', 'Veli ve öğrenci'],
          ]}
        />
      </div>
      <div className="grid2">
        <label className="field" htmlFor="gDate">
          Gün
          <input id="gDate" type="date" min={today} value={date} onChange={(e) => (setDate(e.target.value), setErr(null))} />
        </label>
        <label className="field" htmlFor="gTime">
          Saat
          <select id="gTime" value={time} onChange={(e) => setTime(e.target.value)}>
            {times.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
      </div>
      <label className="field" htmlFor="gNote">
        Konu / ayrıntı
        <textarea id="gNote" placeholder="Görüşmenin konusu, yer, hazırlık…" value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      {err && (
        <div className="err" role="alert">
          {err}
        </div>
      )}
      <div className="aibox">
        <Icon name="bell" size={18} />
        <span>
          Kaydedince {who} bildirim gider
          {hasParent === false && w !== 'ogrenci' ? ' (bu öğrencinin onaylı veli hesabı henüz yok)' : ''}.
        </span>
      </div>
    </Modal>
  )
}
