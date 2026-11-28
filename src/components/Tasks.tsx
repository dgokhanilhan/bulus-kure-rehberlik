import { useMemo, useState, type FormEvent } from 'react'
import { supabase } from '@/lib/supabase'
import { SUBJECTS, type GorevEtki, type Outcome, type Repeat, type Subject, type SubjectDef } from '@/lib/analiz'
import type { Task } from '@/lib/data'
import { useRefresh } from '@/lib/data'
import { addDays, nextDow, todayISO, trD, trDShort, trDW } from '@/lib/format'
import type { Student } from '@/lib/types'
import { Icon } from './Icon'
import { Modal } from './Modal'
import { Seg } from './Indicator'
import { useToast } from './Toast'

type Mode = 'staff' | 'student' | 'view'

/** Görevden sonraki denemelerde konunun gidişi: olgu olarak, yorumsuz (0076 değil; istemcide hesaplanır) */
function EtkiSatiri({ e, mode }: { e: GorevEtki; mode: Mode }) {
  const gecmis = e.sonra.map((s) => (s === 'd' ? 'doğru' : s === 'y' ? 'yanlış' : 'boş')).join(', ')
  if (e.durum === 'bekliyor')
    return mode === 'staff' ? (
      <span className="m" style={{ fontSize: 12 }} data-testid="gorev-etki">
        Görevden sonraki denemelerde bu konu henüz sorulmadı.
      </span>
    ) : null
  return (
    <span data-testid="gorev-etki" style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' }}>
      {e.durum === 'duzeldi' ? (
        <span className="chip up" title={`Görevden sonraki denemeler: ${gecmis}`}>
          ↑ Görevden sonra {e.dogruSeri > 1 ? `${e.dogruSeri} denemedir` : 'son denemede'} doğru
        </span>
      ) : (
        <span className="chip n" title={`Görevden sonraki denemeler: ${gecmis}`}>
          {e.durum === 'suruyor' ? 'Görevden sonraki denemede bu konuda yine yanlış var' : 'Görevden sonraki denemede bu konu boş bırakıldı'}
        </span>
      )}
      {mode === 'staff' && (
        <span className="m" style={{ fontSize: 12 }}>
          {e.once > 0 ? `Önce ${e.once} denemede yanlıştı. ` : ''}Sonra: {gecmis}.
        </span>
      )}
    </span>
  )
}

/** Görev kartları (prototipteki taskList). `etki`: kazanıma bağlı görevin sonraki denemelerdeki karşılığı. */
export function TaskList({ tasks, mode, onEdit, etki }: { tasks: Task[]; mode: Mode; onEdit?: (t: Task) => void; etki?: (t: Task) => GorevEtki | null }) {
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
              {SUBJECT_SHORT[t.subject] ?? t.subject} · {t.question_count} soru{t.parent_visible && mode !== 'view' ? ' · veli görüyor' : ''}
            </span>
            <div
              className="prog"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={t.question_count}
              aria-valuenow={t.solved}
              aria-label={`${t.topic} ilerlemesi`}
            >
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
            {etki?.(t) && <EtkiSatiri e={etki(t)!} mode={mode} />}
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
                <button className="btn sm ghost" style={done ? undefined : { color: 'var(--signal)' }} onClick={() => remove(t)}>
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

/** Görev/etüt ders kodu (subject_code enum) → kısa ad (LGS + 0032 ile eklenen 5–12 dersleri). */
export const SUBJECT_SHORT: Record<string, string> = {
  TUR: 'Türkçe',
  MAT: 'Matematik',
  FEN: 'Fen',
  INK: 'İnkılap',
  DIN: 'Din',
  ING: 'İngilizce',
  SOS: 'Sosyal',
  TDE: 'Edebiyat',
  TAR: 'Tarih',
  COG: 'Coğrafya',
  FEL: 'Felsefe',
  FIZ: 'Fizik',
  KIM: 'Kimya',
  BIY: 'Biyoloji',
}

interface TaskForm {
  subject: Subject
  /** Listeden seçilen kazanım kodları. Yeni görevde birden çok seçilebilir (her biri ayrı görev olur); düzenlemede tek. */
  konular: string[]
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
  subjects = SUBJECTS,
  onSaved,
  onClose,
}: {
  usedCodes?: Set<string>
  /** Profil bağlamının dersleri (LGS: 6 ders; genel: şablon bölümleri). */
  subjects?: SubjectDef[]
  student: Student
  outcomes: Outcome[]
  repeats: Repeat[]
  openTasks: Task[]
  edit?: Task
  preset?: { subject: Subject; code?: string; konuOther?: string; note?: string }
  /** Yeni görev kaydedilince (görüşme kararını göreve bağlamak için) */
  onSaved?: (id: string) => void
  onClose: () => void
}) {
  const toast = useToast()
  const refresh = useRefresh()
  const today = todayISO()
  const init = (): TaskForm => {
    if (edit) {
      const sd = subjects.find((x) => x.code === edit.subject) ?? subjects.find((x) => x.base === edit.subject)
      const subj = sd?.code ?? edit.subject
      const std = outcomes.find(
        (o) =>
          o.subject === subj &&
          ((edit.learning_outcome_id && o.outcomeId === edit.learning_outcome_id) || o.code === edit.outcome_code || o.title === edit.topic),
      )
      return {
        subject: subj,
        konular: std ? [std.code] : [],
        konuOther: std ? '' : edit.topic,
        adet: String(edit.question_count),
        due: edit.due_date,
        weekly: edit.weekly,
        veli: edit.parent_visible,
        note: edit.note ?? '',
      }
    }
    const top = repeats[0]
    const subject = preset?.subject ?? top?.outcome.subject ?? (subjects.find((x) => x.code === 'MAT') ?? subjects[0])?.code ?? 'MAT'
    const konu = preset ? (preset.code ?? null) : (top?.outcome.code ?? null)
    return { subject, konular: konu ? [konu] : [], konuOther: preset?.konuOther ?? '', adet: '20', due: nextDow(5), weekly: false, veli: true, note: preset?.note ?? '' }
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

  // Seçili kazanımlar listedeki sırayla; düzenlemede yazılan konu listedekinin yerine geçer (eski davranış)
  const secili = list.filter((o) => m.konular.includes(o.code))
  const yazilan = m.konuOther.trim()
  const hedefler: { topic: string; own: Outcome | null }[] = edit
    ? yazilan
      ? [{ topic: yazilan, own: null }]
      : secili.slice(0, 1).map((o) => ({ topic: o.title, own: o }))
    : [...secili.map((o) => ({ topic: o.title, own: o })), ...(yazilan ? [{ topic: yazilan, own: null }] : [])]
  const gorevSayisi = hedefler.length

  async function save(more: boolean) {
    const adet = parseInt(m.adet, 10)
    if (!gorevSayisi) return setErr('Bir konu seç ya da yaz.')
    if (!(adet > 0) || adet > 500) return setErr('Soru sayısı 1 ile 500 arasında olmalı.')
    if (!m.due || m.due < today) return setErr('Son gün bugünden önce olamaz.')
    const sd = subjects.find((x) => x.code === m.subject)
    // Her konu ayrı görev: öğrenci tek tek tamamlar, sonraki denemedeki gidiş konu bazında izlenir
    const rows = hedefler.map(({ topic, own }) => ({
      student_id: student.id,
      // ders: veritabanı ders kodu (bölüm anahtarı FEL2 → FEL); LGS'de aynı
      subject: sd?.base ?? m.subject,
      topic,
      // LGS kazanımı eski kataloğa (outcome_code), genel kazanım yeni kataloğa (learning_outcome_id)
      outcome_code: own && !own.outcomeId ? own.code : null,
      // yalnız genel kazanımda gönderilir: LGS görevi eskisiyle birebir aynı satırı yazar (0032 uygulanmadan da çalışır)
      ...(own?.outcomeId ? { learning_outcome_id: own.outcomeId } : edit?.learning_outcome_id ? { learning_outcome_id: null } : {}),
      question_count: adet,
      due_date: m.due,
      weekly: m.weekly,
      parent_visible: m.veli,
      note: m.note.trim() || null,
    }))
    setBusy(true)
    let yeniId: string | null = null
    let error: { message?: string } | null = null
    if (edit) error = (await supabase.from('tasks').update(rows[0]!).eq('id', edit.id)).error
    else {
      const uid = (await supabase.auth.getUser()).data.user!.id
      // Tek istekte eklenir: ya hepsi ya hiçbiri
      const r = await supabase
        .from('tasks')
        .insert(rows.map((row) => ({ ...row, created_by: uid })))
        .select('id')
      error = r.error
      // Görüşme kararı ilk göreve bağlanır
      yeniId = (r.data as { id: string }[] | null)?.[0]?.id ?? null
    }
    setBusy(false)
    if (error) return setErr(error.message || 'Kaydedilemedi.')
    if (yeniId && onSaved) onSaved(yeniId)
    refresh('tasks')
    if (edit) {
      toast('Görev güncellendi')
      return onClose()
    }
    toast(rows.length > 1 ? `${rows.length} görev atandı` : 'Görev atandı')
    if (more) setM((x) => ({ ...x, konular: [], konuOther: '', note: '' }))
    else onClose()
  }
  const konuSec = (code: string) =>
    edit
      ? set({ konular: [code], konuOther: '' })
      : set({ konular: m.konular.includes(code) ? m.konular.filter((c) => c !== code) : [...m.konular, code] })

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
            {edit ? 'Kaydet' : gorevSayisi > 1 ? `${gorevSayisi} görevi ata` : 'Görevi ata'}
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
          <Seg label="Ders" value={m.subject} onChange={(subject) => set({ subject, konular: [] })} options={subjects.map((s) => [s.code, s.short] as const)} />
        </div>
        <div className="stack" style={{ gap: 6 }}>
          <span className="label">
            Konu
            {!edit && <span className="konu-ipucu"> · birden çok seçebilirsin, her konu ayrı görev olur</span>}
          </span>
          <div className="pick" role="group" aria-label="Konu">
            {list.map((o) => {
              const r = repeats.find((x) => x.outcome.code === o.code)
              const on = m.konular.includes(o.code) && !(edit && m.konuOther)
              return (
                <button type="button" key={o.code} aria-pressed={on} onClick={() => konuSec(o.code)}>
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
          {!edit && gorevSayisi > 1 && (
            <p className="konu-ozet" role="status">
              {gorevSayisi} ayrı görev atanacak · her biri {parseInt(m.adet, 10) || 0} soru, toplam {gorevSayisi * (parseInt(m.adet, 10) || 0)} soru
            </p>
          )}
        </div>
        <div className="grid2">
          <div className="stack" style={{ gap: 6 }}>
            <span className="label">Soru sayısı</span>
            <div className="stepper">
              <button type="button" aria-label="Azalt" onClick={() => set({ adet: String(Math.max(1, (parseInt(m.adet, 10) || 0) - 5)) })}>
                −
              </button>
              <input
                type="number"
                min={1}
                max={500}
                inputMode="numeric"
                aria-label="Soru sayısı"
                value={m.adet}
                onChange={(e) => set({ adet: e.target.value })}
              />
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
        <Toggle
          on={m.weekly}
          onClick={() => set({ weekly: !m.weekly })}
          title="Her hafta tekrarla"
          sub="Süre dolunca ya da bitince aynı görev 1 hafta sonrasına yeniden açılır"
        />
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
