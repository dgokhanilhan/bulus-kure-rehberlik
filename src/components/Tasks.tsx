import { useMemo, useState, type FormEvent } from 'react'
import { supabase } from '@/lib/supabase'
import { SUBJECT, SUBJECTS, type Outcome, type Repeat, type Subject } from '@/lib/analiz'
import type { Task } from '@/lib/data'
import { useRefresh } from '@/lib/data'
import { addDays, nextDow, todayISO, trD, trDShort, trDW } from '@/lib/format'
import type { Student } from '@/lib/types'
import { Icon } from './Icon'
import { Modal } from './Modal'
import { Seg } from './Indicator'
import { useToast } from './Toast'

type Mode = 'staff' | 'student' | 'view'

/** Görev kartları (prototipteki taskList). */
export function TaskList({ tasks, mode, onEdit }: { tasks: Task[]; mode: Mode; onEdit?: (t: Task) => void }) {
  const toast = useToast()
  const refresh = useRefresh()
  const today = todayISO()
  const [busy, setBusy] = useState<string | null>(null)
  if (!tasks.length) return <div className="empty a">Görev yok.</div>

  const progress = async (t: Task, all: boolean) => {
    setBusy(t.id)
    const solved = all ? t.question_count : Math.min(t.question_count, t.solved + 5)
    const { error } = await supabase.from('tasks').update({ solved }).eq('id', t.id)
    setBusy(null)
    if (error) return toast('Kaydedilemedi. Tekrar dene.', 'warn')
    toast(solved >= t.question_count ? 'Tebrikler, görev tamam!' : 'İlerleme kaydedildi')
    refresh('tasks')
  }
  const remove = async (t: Task) => {
    if (!window.confirm(`"${t.topic}" görevi silinsin mi?`)) return
    const { error } = await supabase.from('tasks').delete().eq('id', t.id)
    if (error) return toast('Silinemedi.', 'warn')
    toast('Görev silindi')
    refresh('tasks')
  }

  return (
    <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(250px,1fr))', gap: 12 }}>
      {tasks.map((t, i) => {
        const done = !!t.completed_at
        const late = !done && t.due_date < today
        return (
          <article
            key={t.id}
            data-testid="task-card"
            className="card a lift"
            style={{
              ['--d' as string]: i + 3,
              padding: 16,
              display: 'flex',
              flexDirection: 'column',
              gap: 9,
              ...(done ? { background: 'var(--primary-soft)', borderColor: 'var(--primary-line)' } : late ? { borderColor: 'var(--signal-line)' } : {}),
            }}
          >
            <div className="kv">
              <span className={`chip ${done ? 'up' : late ? 'down' : 'n'}`}>
                {done ? (
                  <>
                    <Icon name="check" size={13} stroke={2.6} />
                    Tamamlandı
                  </>
                ) : late ? (
                  `Gecikti · ${trD(t.due_date)}`
                ) : (
                  `Son gün ${trDShort(t.due_date)}`
                )}
              </span>
              {t.weekly && (
                <span className="chip gold" title="Her hafta tekrarlanır">
                  <Icon name="repeat" size={13} stroke={2} />
                  Haftalık
                </span>
              )}
            </div>
            <b style={{ fontSize: 16 }}>{t.topic}</b>
            <span className="m" style={{ fontSize: 13 }}>
              {SUBJECT[t.subject]?.short} · {t.question_count} soru{t.parent_visible && mode !== 'view' ? ' · veli görüyor' : ''}
            </span>
            <div className="prog" role="progressbar" aria-valuemin={0} aria-valuemax={t.question_count} aria-valuenow={t.solved} aria-label={`${t.topic} ilerlemesi`}>
              <i className="bar-g" style={{ width: `${Math.min(100, (t.solved / t.question_count) * 100)}%`, ...(done ? { background: '#7cc2b5' } : {}) }} />
            </div>
            <span className="mono" style={{ fontSize: 13 }}>
              {t.solved} / {t.question_count}
            </span>
            {t.note && (
              <p className="m" style={{ fontSize: 13 }}>
                {t.note}
              </p>
            )}
            {mode === 'student' && !done && (
              <div className="btns">
                <button className="btn sm soft" disabled={busy === t.id} onClick={() => progress(t, false)}>
                  +5 soru
                </button>
                <button className="btn sm pri" disabled={busy === t.id} onClick={() => progress(t, true)}>
                  Tamamladım
                </button>
              </div>
            )}
            {mode === 'staff' && (
              <div className="btns">
                <button className="btn sm" onClick={() => onEdit?.(t)}>
                  <Icon name="pen" size={14} />
                  Düzenle
                </button>
                <button className="btn sm ghost" style={{ color: 'var(--signal)' }} onClick={() => remove(t)}>
                  <Icon name="trash" size={14} />
                  Sil
                </button>
              </div>
            )}
          </article>
        )
      })}
    </section>
  )
}

interface TaskForm {
  subject: Subject
  konu: string | null // listeden seçilen kazanım kodu
  konuOther: string
  adet: string
  due: string
  weekly: boolean
  veli: boolean
  note: string
}

/** Görev ata / düzenle (prototipteki görev modalı). */
export function TaskModal({
  student,
  outcomes,
  repeats,
  openTasks,
  edit,
  preset,
  usedCodes,
  onClose,
}: {
  usedCodes?: Set<string>
  student: Student
  outcomes: Outcome[]
  repeats: Repeat[]
  openTasks: Task[]
  edit?: Task
  preset?: { subject: Subject; code?: string }
  onClose: () => void
}) {
  const toast = useToast()
  const refresh = useRefresh()
  const today = todayISO()
  const init = (): TaskForm => {
    if (edit) {
      const std = outcomes.find((o) => o.subject === edit.subject && (o.code === edit.outcome_code || o.title === edit.topic))
      return { subject: edit.subject, konu: std?.code ?? null, konuOther: std ? '' : edit.topic, adet: String(edit.question_count), due: edit.due_date, weekly: edit.weekly, veli: edit.parent_visible, note: edit.note ?? '' }
    }
    const top = repeats[0]
    const subject = preset?.subject ?? top?.outcome.subject ?? 'MAT'
    const konu = preset ? (preset.code ?? null) : (top?.outcome.code ?? null)
    return { subject, konu, konuOther: '', adet: '20', due: nextDow(5), weekly: false, veli: true, note: '' }
  }
  const [m, setM] = useState<TaskForm>(init)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const set = (p: Partial<TaskForm>) => {
    setM((x) => ({ ...x, ...p }))
    setErr(null)
  }
  // Konu listesi: okulun denemelerinde geçen kazanımlar (tekrar eden hatalar üstte); yoksa dersin tüm kazanımları.
  const list = useMemo(() => {
    const all = outcomes.filter((o) => o.subject === m.subject)
    const used = usedCodes ? all.filter((o) => usedCodes.has(o.code)) : []
    const base = used.length ? used : all
    const rank = (o: Outcome) => (repeats.find((r) => r.outcome.code === o.code) ? 0 : 1)
    return [...base].sort((a, b) => rank(a) - rank(b))
  }, [outcomes, usedCodes, repeats, m.subject])

  async function save(more: boolean) {
    const chosen = list.find((o) => o.code === m.konu)
    const topic = m.konuOther.trim() || chosen?.title
    const adet = parseInt(m.adet, 10)
    if (!topic) return setErr('Bir konu seç ya da yaz.')
    if (!(adet > 0) || adet > 500) return setErr('Soru sayısı 1 ile 500 arasında olmalı.')
    if (!m.due || m.due < today) return setErr('Son gün bugünden önce olamaz.')
    const row = {
      student_id: student.id,
      subject: m.subject,
      topic,
      outcome_code: m.konuOther.trim() ? null : (chosen?.code ?? null),
      question_count: adet,
      due_date: m.due,
      weekly: m.weekly,
      parent_visible: m.veli,
      note: m.note.trim() || null,
    }
    setBusy(true)
    const { error } = edit
      ? await supabase.from('tasks').update(row).eq('id', edit.id)
      : await supabase.from('tasks').insert({ ...row, created_by: (await supabase.auth.getUser()).data.user!.id })
    setBusy(false)
    if (error) return setErr(error.message || 'Kaydedilemedi.')
    refresh('tasks')
    if (edit) {
      toast('Görev güncellendi')
      return onClose()
    }
    toast('Görev atandı')
    if (more) setM((x) => ({ ...x, konu: null, konuOther: '', note: '' }))
    else onClose()
  }

  const shortcuts: [string, string][] = [
    [addDays(today, 1), 'Yarın'],
    [nextDow(5), 'Cuma'],
    [nextDow(1), 'Pazartesi'],
    [addDays(today, 7), '1 hafta'],
  ]

  return (
    <Modal
      title={edit ? 'Görevi düzenle' : 'Görev ata'}
      sub={`${student.full_name} · ${student.class_name}`}
      avatar={student.full_name}
      onClose={onClose}
      footer={
        <>
          <button className="btn" type="button" onClick={onClose}>
            Kapat
          </button>
          {!edit && (
            <button className="btn soft" type="button" disabled={busy} onClick={() => save(true)}>
              Kaydet ve yeni ekle
            </button>
          )}
          <button className="btn pri" type="button" disabled={busy} onClick={() => save(false)}>
            {edit ? 'Kaydet' : 'Görevi ata'}
          </button>
        </>
      }
    >
      <form
        className="stack"
        style={{ gap: 16 }}
        noValidate
        onSubmit={(e: FormEvent) => {
          e.preventDefault()
          save(false)
        }}
      >
        <div className="stack" style={{ gap: 6 }}>
          <span className="label">Ders</span>
          <Seg label="Ders" value={m.subject} onChange={(subject) => set({ subject, konu: null })} options={SUBJECTS.map((s) => [s.code, s.short] as const)} />
        </div>
        <div className="stack" style={{ gap: 6 }}>
          <span className="label">Konu</span>
          <div className="pick" role="group" aria-label="Konu">
            {list.map((o) => {
              const r = repeats.find((x) => x.outcome.code === o.code)
              const on = m.konu === o.code && !m.konuOther
              return (
                <button type="button" key={o.code} aria-pressed={on} onClick={() => set({ konu: o.code, konuOther: '' })}>
                  <span style={{ flex: 1 }}>{o.title}</span>
                  {r && <span className="chip down">Tekrar eden hata · {r.count} deneme</span>}
                  {on && <Icon name="check" size={18} stroke={2.6} />}
                </button>
              )
            })}
          </div>
          <label className="field" htmlFor="tKonuOther">
            Başka bir konu yaz
            <input id="tKonuOther" placeholder="Örn. Karışık tekrar testi" value={m.konuOther} onChange={(e) => set({ konuOther: e.target.value })} />
          </label>
        </div>
        <div className="grid2">
          <div className="stack" style={{ gap: 6 }}>
            <span className="label">Soru sayısı</span>
            <div className="stepper">
              <button type="button" aria-label="Azalt" onClick={() => set({ adet: String(Math.max(1, (parseInt(m.adet, 10) || 0) - 5)) })}>
                −
              </button>
              <input type="number" min={1} max={500} inputMode="numeric" aria-label="Soru sayısı" value={m.adet} onChange={(e) => set({ adet: e.target.value })} />
              <button type="button" aria-label="Artır" onClick={() => set({ adet: String(Math.min(500, (parseInt(m.adet, 10) || 0) + 5)) })}>
                +
              </button>
            </div>
          </div>
          <div className="stack" style={{ gap: 6 }}>
            <label className="field" htmlFor="tDue">
              Son gün
              <input id="tDue" type="date" min={today} value={m.due} onChange={(e) => set({ due: e.target.value })} />
            </label>
            <div className="btns" style={{ gap: 6 }}>
              {shortcuts.map(([d, l]) => (
                <button key={l} type="button" className={`btn sm ${m.due === d ? 'soft' : ''}`} aria-pressed={m.due === d} onClick={() => set({ due: d })}>
                  {l}
                </button>
              ))}
            </div>
            <span className="m" style={{ fontSize: 12 }}>
              {m.due ? trDW(m.due) : ''}
            </span>
          </div>
        </div>
        <Toggle on={m.weekly} onClick={() => set({ weekly: !m.weekly })} title="Her hafta tekrarla" sub="Süre dolunca ya da bitince aynı görev 1 hafta sonrasına yeniden açılır" />
        <Toggle on={m.veli} onClick={() => set({ veli: !m.veli })} title="Veli de görsün" sub="Veli panelinde görünür, bildirim gider" />
        <label className="field" htmlFor="tNote">
          Not (isteğe bağlı)
          <textarea id="tNote" style={{ minHeight: 64 }} value={m.note} onChange={(e) => set({ note: e.target.value })} />
        </label>
        {err && (
          <div className="err" role="alert">
            {err}
          </div>
        )}
        {!edit && openTasks.length > 0 && (
          <div className="stack" style={{ gap: 6 }}>
            <span className="label">Açık görevleri ({openTasks.length})</span>
            {openTasks.map((t) => (
              <div className="kv" style={{ fontSize: 14 }} key={t.id}>
                <span>
                  {t.topic} · {t.question_count} soru {t.weekly ? '· haftalık' : ''}
                </span>
                <span className="m">{trD(t.due_date)}</span>
              </div>
            ))}
          </div>
        )}
      </form>
    </Modal>
  )
}

export function Toggle({ on, onClick, title, sub }: { on: boolean; onClick: () => void; title: string; sub: string }) {
  return (
    <button type="button" className="check" role="switch" aria-checked={on} onClick={onClick}>
      <span style={{ flex: 1 }}>
        <b style={{ display: 'block' }}>{title}</b>
        <span className="m" style={{ fontSize: 13 }}>
          {sub}
        </span>
      </span>
      <span className={`sw ${on ? 'on' : ''}`} />
    </button>
  )
}
