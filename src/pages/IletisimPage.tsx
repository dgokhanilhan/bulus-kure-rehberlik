// İletişim (veli–öğretmen mesajlaşması) ve Duyurular (okul / kademe / sınıf) ayrı sayfalar (0010).
// Eski /iletisim?sekme=duyurular bağlantıları /duyurular'a yönlenir (App).
// Kim neyi görür ve kime yazar veritabanında (RLS + fonksiyonlar) zorlanır; bu ekran yalnız arayüzdür.
import { useEffect, useMemo, useRef, useState } from 'react'
import { Navigate, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/auth/AuthProvider'
import { useAnnouncements, useChildContacts, useClasses, useConversations, useMessages, useModules, useStudents, type Announcement, type Conversation } from '@/lib/data'
import { LEVEL_TR, LEVELS, type Level } from '@/lib/roles'
import { ago, initials, localDate, localHM, todayISO, trD } from '@/lib/format'
import { Seg } from '@/components/Indicator'
import { Modal } from '@/components/Modal'
import { Icon } from '@/components/Icon'
import { useToast } from '@/components/Toast'
import { AttachmentList, Cover, FilePick, PickedFiles } from '@/components/Files'
import { uploadFiles, useAttachments, useFileRules } from '@/lib/files'

const AUD_TR = { veli: 'Veliler', ogrenci: 'Öğrenciler', ogretmen: 'Öğretmenler' } as const
type Aud = keyof typeof AUD_TR

const errText = (e: { message?: string } | null) => (e ? (/row-level security/i.test(e.message ?? '') ? 'Bu işlem için yetkin yok.' : (e.message ?? 'İşlem yapılamadı.')) : null)

/** İletişim: doğrudan mesajlaşma (sekme yok). */
export default function IletisimPage() {
  const { profile } = useAuth()
  const [sp] = useSearchParams()
  const mods = useModules()
  const canMessage = profile?.role !== 'ogrenci' && mods.mesaj
  const convs = useConversations(canMessage)
  // Eski bağlantı: /iletisim?sekme=duyurular (ya da ?tab=duyurular) → /duyurular
  if (sp.get('sekme') === 'duyurular' || sp.get('tab') === 'duyurular') return <Navigate to="/duyurular" replace />
  return (
    <>
      <div className="head a">
        <h1 className="hd">İletişim</h1>
      </div>
      {canMessage ? <Mesajlar convs={convs.data ?? []} loading={convs.isLoading} /> : <div className="empty">Bu bölüm okul yönetimince kapatıldı.</div>}
    </>
  )
}

/** Duyurular: ayrı sayfa (/duyurular). ?d=<id> ile bildirimden gelinen duyuru vurgulanır. */
export function DuyurularPage() {
  return (
    <>
      <div className="head a">
        <h1 className="hd">Duyurular</h1>
      </div>
      <Duyurular />
    </>
  )
}

// ---------------------------------------------------------------- Duyurular
function useMyClasses(enabled: boolean) {
  return useQuery({
    queryKey: ['my_classes'],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('my_classes')
      if (error) throw error
      return ((data ?? []) as (string | { my_classes: string })[]).map((x) => (typeof x === 'string' ? x : x.my_classes))
    },
  })
}

function Duyurular() {
  const { profile, role } = useAuth()
  const list = useAnnouncements()
  const [sp] = useSearchParams()
  const focus = sp.get('d')
  useEffect(() => {
    if (focus && list.data) document.getElementById(`duyuru-${focus}`)?.scrollIntoView({ block: 'center' })
  }, [focus, list.data])
  const classes = useClasses()
  const qc = useQueryClient()
  const toast = useToast()
  const [write, setWrite] = useState(false)
  const teacher = role === 'admin' || role === 'rehber' || role === 'brans'
  const cName = (id: string | null) => classes.data?.find((c) => c.id === id)?.name ?? 'Sınıf'
  const atts = useAttachments({ kind: 'announcement', ids: (list.data ?? []).map((a) => a.id) })
  const filesOf = (id: string) => (atts.data ?? []).filter((x) => x.announcement_id === id)
  const scopeText = (a: Announcement) => (a.scope === 'okul' ? 'Tüm okul' : a.scope === 'kademe' ? LEVEL_TR[a.level as Level] : cName(a.class_id))

  async function remove(a: Announcement) {
    const { error } = await supabase.from('announcements').delete().eq('id', a.id)
    if (error) return toast(errText(error)!, 'warn')
    qc.invalidateQueries({ queryKey: ['announcements'] })
    toast('Duyuru kaldırıldı')
  }

  return (
    <>
      {teacher && (
        <div className="kv a" style={{ ['--d' as string]: 2 }}>
          <span className="m" style={{ fontSize: 13 }}>
            {role === 'brans' ? 'Ders verdiğin ya da sınıf öğretmeni olduğun sınıflara duyuru yayınlayabilirsin.' : 'Tüm okula, bir kademeye ya da bir sınıfa duyuru yayınlayabilirsin.'}
          </span>
          <button className="btn pri" onClick={() => setWrite(true)}>
            <Icon name="plus" size={18} stroke={2} /> Duyuru yaz
          </button>
        </div>
      )}
      {list.isLoading ? (
        <p className="m">
          <span className="spinner" aria-hidden="true" /> Yükleniyor…
        </p>
      ) : (list.data ?? []).length ? (
        <div className="stack">
          {list.data!.map((a, i) => (
            <article
              key={a.id}
              id={`duyuru-${a.id}`}
              className="card a"
              style={{ ['--d' as string]: Math.min(i + 2, 8), padding: 18, display: 'flex', flexDirection: 'column', gap: 8, overflow: 'hidden', outline: focus === a.id ? '2px solid var(--primary)' : undefined }}
              data-testid="announcement"
              aria-label={a.title}
            >
              {filesOf(a.id).find((x) => x.is_cover) && <Cover a={filesOf(a.id).find((x) => x.is_cover)!} />}
              <div className="kv" style={{ alignItems: 'flex-start' }}>
                <h2 style={{ fontSize: 17 }}>{a.title}</h2>
                <span className="chip n">{scopeText(a)}</span>
              </div>
              <p style={{ fontSize: 14, whiteSpace: 'pre-line', margin: 0 }}>{a.body}</p>
              <AttachmentList items={filesOf(a.id).filter((x) => !x.is_cover)} />
              <div className="kv">
                <span className="m" style={{ fontSize: 12 }}>
                  {a.author_name ?? 'Okul'} · {localDate(a.created_at) === todayISO() ? `bugün ${localHM(a.created_at)}` : trD(localDate(a.created_at))}
                  {teacher ? ` · ${a.audience.map((x) => AUD_TR[x]).join(', ')}` : ''}
                </span>
                {(role === 'admin' || ((role === 'rehber' || role === 'brans') && a.created_by === profile?.id)) && (
                  <button className="btn sm" onClick={() => remove(a)} aria-label={`${a.title} duyurusunu kaldır`}>
                    <Icon name="trash" size={15} />
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="empty a">Henüz duyuru yok.</div>
      )}
      {write && <AnnouncementModal onClose={() => setWrite(false)} />}
    </>
  )
}

function AnnouncementModal({ onClose }: { onClose: () => void }) {
  const { profile, role } = useAuth()
  const classes = useClasses()
  const mine = useMyClasses(role === 'brans')
  const qc = useQueryClient()
  const toast = useToast()
  const onlyClass = role === 'brans'
  const [scope, setScope] = useState<'okul' | 'kademe' | 'sinif'>(onlyClass ? 'sinif' : 'okul')
  const [level, setLevel] = useState<Level>('ortaokul')
  const opts = (classes.data ?? []).filter((c) => !onlyClass || (mine.data ?? []).includes(c.id))
  const [cls, setCls] = useState('')
  const [aud, setAud] = useState<Aud[]>(['veli', 'ogrenci'])
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [cover, setCover] = useState<File | null>(null)
  const [files, setFiles] = useState<File[]>([])
  const rules = useFileRules()
  const clsId = cls || opts[0]?.id || ''

  async function send() {
    if (title.trim().length < 3) return setErr('Başlık en az 3 harf olmalı.')
    if (!body.trim()) return setErr('Duyuru metnini yaz.')
    if (!aud.length) return setErr('En az bir alıcı grubu seç.')
    if (scope === 'sinif' && !clsId) return setErr('Sınıf seç.')
    setBusy(true)
    const { data: row, error } = await supabase.from('announcements').insert({
      school_id: profile!.school_id,
      created_by: profile!.id,
      title: title.trim(),
      body: body.trim(),
      scope,
      level: scope === 'kademe' ? level : null,
      class_id: scope === 'sinif' ? clsId : null,
      audience: aud,
    }).select('id').single()
    if (error) {
      setBusy(false)
      return setErr(errText(error))
    }
    const upErr = cover || files.length ? await uploadFiles('announcement', row.id as string, files, { cover }) : null
    setBusy(false)
    qc.invalidateQueries({ queryKey: ['announcements'] })
    qc.invalidateQueries({ queryKey: ['attachments'] })
    if (upErr) {
      toast(`Duyuru yayınlandı ama bir dosya yüklenemedi: ${upErr}`, 'warn')
      return onClose()
    }
    toast('Duyuru yayınlandı; alıcılara bildirim gitti')
    onClose()
  }

  return (
    <Modal
      title="Duyuru yaz"
      sub="Yayınlanınca alıcılara bildirim gider."
      width={620}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Vazgeç
          </button>
          <button className="btn pri" onClick={send} disabled={busy}>
            {busy && <span className="spinner" aria-hidden="true" />} Yayınla
          </button>
        </>
      }
    >
      <label className="field" htmlFor="anTitle">
        Başlık
        <input id="anTitle" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} />
      </label>
      <label className="field" htmlFor="anBody">
        Metin
        <textarea id="anBody" rows={5} value={body} onChange={(e) => setBody(e.target.value)} maxLength={4000} />
      </label>
      {!onlyClass && (
        <div className="stack" style={{ gap: 6 }}>
          <span className="label">Kapsam</span>
          <Seg
            label="Kapsam"
            value={scope}
            onChange={setScope}
            options={[
              ['okul', 'Tüm okul'],
              ['kademe', 'Kademe'],
              ['sinif', 'Sınıf'],
            ]}
          />
        </div>
      )}
      {scope === 'kademe' && (
        <label className="field" htmlFor="anLevel">
          Kademe
          <select id="anLevel" value={level} onChange={(e) => setLevel(e.target.value as Level)}>
            {LEVELS.map((l) => (
              <option key={l} value={l}>
                {LEVEL_TR[l]}
              </option>
            ))}
          </select>
        </label>
      )}
      {scope === 'sinif' && (
        <label className="field" htmlFor="anClass">
          Sınıf
          <select id="anClass" value={clsId} onChange={(e) => setCls(e.target.value)}>
            {opts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          {onlyClass && !opts.length && <span className="m">Ders programında sana atanmış sınıf yok; yönetimle görüş.</span>}
        </label>
      )}
      {rules.announcement && (
        <div className="stack" style={{ gap: 6 }}>
          <span className="label">Görsel ve belgeler (isteğe bağlı · en fazla {rules.maxMb} MB)</span>
          <div className="btns">
            {rules.images && <FilePick label={cover ? 'Kapak görselini değiştir' : 'Kapak görseli'} multiple={false} imagesOnly onPick={(f) => setCover(f[0] ?? null)} />}
            <FilePick label="Dosya ekle" onPick={(f) => setFiles((x) => [...x, ...f])} />
          </div>
          {cover && <PickedFiles files={[cover]} onRemove={() => setCover(null)} />}
          <PickedFiles files={files} onRemove={(i) => setFiles((x) => x.filter((_, j) => j !== i))} />
        </div>
      )}
      <div className="stack" style={{ gap: 6 }}>
        <span className="label">Kime</span>
        <div className="btns">
          {(Object.keys(AUD_TR) as Aud[]).map((k) => {
            const on = aud.includes(k)
            return (
              <button key={k} type="button" className="check" role="checkbox" aria-checked={on} onClick={() => setAud((x) => (on ? x.filter((y) => y !== k) : [...x, k]))}>
                <span className={`box ${on ? 'on' : ''}`}>{on && <Icon name="check" size={13} stroke={3} />}</span>
                <span style={{ fontSize: 14 }}>{AUD_TR[k]}</span>
              </button>
            )
          })}
        </div>
      </div>
      {err && (
        <div className="err" role="alert">
          {err}
        </div>
      )}
    </Modal>
  )
}

// ---------------------------------------------------------------- Mesajlar
function Mesajlar({ convs, loading }: { convs: Conversation[]; loading: boolean }) {
  const { profile } = useAuth()
  const [sp, setSp] = useSearchParams()
  const [start, setStart] = useState(false)
  const open = sp.get('c')
  const setOpen = (id: string | null) => setSp(id ? { c: id } : {}, { replace: true })
  const cur = convs.find((c) => c.id === open) ?? null
  const other = (c: Conversation) =>
    profile?.id === c.parent_id ? { name: c.teacher_name, sub: c.teacher_branch ?? '' } : profile?.id === c.teacher_id ? { name: c.parent_name, sub: 'Veli' } : { name: `${c.parent_name} ↔ ${c.teacher_name}`, sub: 'Yönetici görünümü' }

  return (
    <>
      <div className="kv a" style={{ ['--d' as string]: 2 }}>
        <span className="m" style={{ fontSize: 13 }}>
          {profile?.role === 'veli' ? 'Çocuğunuzun öğretmenleri, rehberlik servisi ve okul yönetimiyle yazışabilirsiniz.' : 'Ders verdiğin sınıflardaki öğrencilerin velileriyle yazışabilirsin.'}
        </span>
        <button className="btn pri" onClick={() => setStart(true)}>
          <Icon name="pen" size={18} /> Yeni mesaj
        </button>
      </div>
      <div className="msgcols a" style={{ ['--d' as string]: 3 }}>
        <section className={`card ${cur ? 'hide-m' : ''}`} style={{ overflow: 'hidden', alignSelf: 'flex-start' }} aria-label="Yazışmalar">
          {loading ? (
            <p className="m" style={{ padding: 16 }}>
              <span className="spinner" aria-hidden="true" /> Yükleniyor…
            </p>
          ) : convs.length ? (
            convs.map((c) => {
              const o = other(c)
              return (
                <button key={c.id} className="srow" onClick={() => setOpen(c.id)} aria-current={c.id === open ? 'true' : undefined} data-testid="conversation" style={c.id === open ? { background: 'var(--primary-soft)' } : undefined}>
                  <span className="av s">{initials(o.name)}</span>
                  <span style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                    <span className="kv">
                      <b style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.name}</b>
                      <span className="m" style={{ fontSize: 11, flexShrink: 0 }}>
                        {ago(c.last_at)}
                      </span>
                    </span>
                    <span className="m" style={{ display: 'block', fontSize: 12 }}>
                      {c.student_name} · {o.sub}
                    </span>
                    <span style={{ display: 'block', fontSize: 13, color: 'var(--ink-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.last_body ?? 'Henüz mesaj yok'}</span>
                  </span>
                  {c.unread > 0 && (
                    <span className="badge" aria-label={`${c.unread} okunmamış`}>
                      {c.unread}
                    </span>
                  )}
                </button>
              )
            })
          ) : (
            <div className="empty" style={{ margin: 16 }}>
              Henüz yazışma yok. “Yeni mesaj” ile başlayabilirsin.
            </div>
          )}
        </section>
        {cur ? (
          <Thread c={cur} title={other(cur).name} onBack={() => setOpen(null)} />
        ) : (
          <div className="empty hide-m" style={{ alignSelf: 'flex-start' }}>
            Bir yazışma seç.
          </div>
        )}
      </div>
      {start && (
        <StartModal
          onClose={() => setStart(false)}
          onStarted={(id) => {
            setStart(false)
            setOpen(id)
          }}
        />
      )}
    </>
  )
}

function Thread({ c, title, onBack }: { c: Conversation; title: string; onBack: () => void }) {
  const { profile } = useAuth()
  const msgs = useMessages(c.id)
  const qc = useQueryClient()
  const toast = useToast()
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const end = useRef<HTMLDivElement>(null)
  const party = profile?.id === c.parent_id || profile?.id === c.teacher_id
  const n = msgs.data?.length ?? 0
  const rules = useFileRules()
  const [files, setFiles] = useState<File[]>([])
  const atts = useAttachments({ kind: 'message', ids: (msgs.data ?? []).map((m) => m.id) })

  useEffect(() => {
    end.current?.scrollIntoView({ block: 'nearest' })
    if (party && c.unread > 0) supabase.rpc('mark_conversation_read', { p_conversation: c.id }).then(() => qc.invalidateQueries({ queryKey: ['conversations'] }))
  }, [n, c.id, c.unread, party, qc])

  async function send() {
    if (!text.trim() && !files.length) return
    setBusy(true)
    const { data: mid, error } = await supabase.rpc('send_message', { p_conversation: c.id, p_body: text, p_with_files: files.length > 0 })
    if (error) {
      setBusy(false)
      return toast(errText(error)!, 'warn')
    }
    const upErr = files.length ? await uploadFiles('message', mid as string, files) : null
    setBusy(false)
    if (upErr) toast(upErr, 'warn')
    setText('')
    setFiles([])
    qc.invalidateQueries({ queryKey: ['attachments'] })
    qc.invalidateQueries({ queryKey: ['messages', c.id] })
    qc.invalidateQueries({ queryKey: ['conversations'] })
  }

  return (
    <section className="card" style={{ display: 'flex', flexDirection: 'column', minHeight: 420, overflow: 'hidden' }} aria-label={`${title} ile yazışma`}>
      <div className="kv" style={{ padding: '12px 16px', borderBottom: '1px solid var(--line)' }}>
        <span style={{ display: 'flex', gap: 10, alignItems: 'center', minWidth: 0 }}>
          <button className="btn sm show-m" onClick={onBack} aria-label="Yazışmalara dön">
            <Icon name="back" size={16} />
          </button>
          <span style={{ minWidth: 0 }}>
            <b style={{ display: 'block' }}>{title}</b>
            <span className="m" style={{ fontSize: 12 }}>
              Öğrenci: {c.student_name}
            </span>
          </span>
        </span>
      </div>
      <div className="stack" style={{ flex: 1, padding: 16, gap: 8, overflowY: 'auto', maxHeight: 460 }} aria-live="polite">
        {(msgs.data ?? []).map((m) => {
          const mine = m.sender_id === profile?.id
          const fromParent = m.sender_id === c.parent_id
          return (
            <div key={m.id} style={{ alignSelf: mine || (!party && !fromParent) ? 'flex-end' : 'flex-start', maxWidth: '82%' }} data-testid="message">
              <div
                style={{
                  background: mine ? 'var(--primary)' : 'var(--surface-sunken)',
                  color: mine ? 'var(--on-primary)' : 'var(--ink)',
                  padding: '9px 13px',
                  borderRadius: 16,
                  fontSize: 14,
                  whiteSpace: 'pre-line',
                  overflowWrap: 'anywhere',
                }}
              >
                {m.body || (atts.data?.some((x) => x.message_id === m.id) ? '' : '📎')}
                <AttachmentList items={(atts.data ?? []).filter((x) => x.message_id === m.id)} />
              </div>
              <span className="m" style={{ fontSize: 11, display: 'block', textAlign: mine ? 'right' : 'left', marginTop: 2 }}>
                {!party && (fromParent ? `${c.parent_name} · ` : `${c.teacher_name} · `)}
                {localDate(m.created_at) === todayISO() ? localHM(m.created_at) : `${trD(localDate(m.created_at))} ${localHM(m.created_at)}`}
                {mine && m.read_at ? ' · okundu' : ''}
              </span>
            </div>
          )
        })}
        {!msgs.isLoading && !n && <span className="m">Henüz mesaj yok. İlk mesajı yaz.</span>}
        <div ref={end} />
      </div>
      {party ? (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            send()
          }}
          style={{ display: 'flex', gap: 8, padding: 12, borderTop: '1px solid var(--line)', alignItems: 'flex-end', flexWrap: 'wrap' }}
        >
          {files.length > 0 && (
            <div style={{ flexBasis: '100%' }}>
              <PickedFiles files={files} onRemove={(i) => setFiles((x) => x.filter((_, j) => j !== i))} />
            </div>
          )}
          <label className="field" style={{ flex: 1 }}>
            <textarea
              aria-label="Mesajın"
              rows={2}
              style={{ minHeight: 48 }}
              value={text}
              maxLength={2000}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  send()
                }
              }}
              placeholder="Mesajını yaz… (Enter gönderir, Shift+Enter yeni satır)"
            />
          </label>
          {rules.message && <FilePick label="Dosya" onPick={(f) => setFiles((x) => [...x, ...f])} disabled={busy} />}
          <button className="btn pri" type="submit" disabled={busy || (!text.trim() && !files.length)}>
            {busy && <span className="spinner" aria-hidden="true" />} Gönder
          </button>
        </form>
      ) : (
        <p className="m" style={{ padding: 12, borderTop: '1px solid var(--line)', fontSize: 13, margin: 0 }}>
          Yönetici olarak bu yazışmayı yalnız görüntülüyorsun.
        </p>
      )}
    </section>
  )
}

function StartModal({ onClose, onStarted }: { onClose: () => void; onStarted: (id: string) => void }) {
  const { profile } = useAuth()
  const qc = useQueryClient()
  const veli = profile?.role === 'veli'
  const students = useStudents()
  const [sid, setSid] = useState('')
  const [who, setWho] = useState('')
  const [text, setText] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const kids = students.data ?? []
  const student = sid || (veli ? (kids[0]?.id ?? '') : '')
  const contacts = useChildContacts(veli ? student : undefined)
  const parents = useQuery({
    queryKey: ['student_parents', student],
    enabled: !veli && !!student,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('student_parents', { p_student: student })
      if (error) throw error
      return (data ?? []) as { id: string; full_name: string; relation: string | null }[]
    },
  })
  const people = useMemo(
    () =>
      veli
        ? (contacts.data ?? []).map((c) => ({
            id: c.id,
            label: `${c.full_name} · ${c.role === 'admin' ? 'Okul yönetimi' : c.branch === 'Rehberlik' ? 'Rehberlik servisi' : [c.homeroom ? 'Sınıf öğretmeni' : '', c.subjects.join(', ') || c.branch].filter(Boolean).join(' · ')}`,
          }))
        : (parents.data ?? []).map((p) => ({ id: p.id, label: `${p.full_name} · ${p.relation ?? 'Veli'}` })),
    [veli, contacts.data, parents.data],
  )
  const target = who || people[0]?.id || ''

  async function go() {
    if (!student || !target) return setErr(veli ? 'Kime yazacağını seç.' : 'Öğrenci ve veli seç.')
    if (!text.trim()) return setErr('Mesajını yaz.')
    setBusy(true)
    const { data: id, error } = await supabase.rpc('start_conversation', { p_student: student, p_other: target })
    if (error) {
      setBusy(false)
      return setErr(errText(error))
    }
    const { error: e2 } = await supabase.rpc('send_message', { p_conversation: id, p_body: text })
    setBusy(false)
    if (e2) return setErr(errText(e2))
    await qc.invalidateQueries({ queryKey: ['conversations'] })
    onStarted(id as string)
  }

  return (
    <Modal
      title="Yeni mesaj"
      width={560}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Vazgeç
          </button>
          <button className="btn pri" onClick={go} disabled={busy}>
            {busy && <span className="spinner" aria-hidden="true" />} Gönder
          </button>
        </>
      }
    >
      {(!veli || kids.length > 1) && (
        <label className="field" htmlFor="mStu">
          {veli ? 'Çocuğunuz' : 'Öğrenci'}
          <select
            id="mStu"
            value={student}
            onChange={(e) => {
              setSid(e.target.value)
              setWho('')
            }}
          >
            {!veli && <option value="">Seç</option>}
            {kids.map((s) => (
              <option key={s.id} value={s.id}>
                {s.full_name} · {s.class_name}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="field" htmlFor="mWho">
        {veli ? 'Kime' : 'Veli'}
        <select id="mWho" value={target} onChange={(e) => setWho(e.target.value)} disabled={!people.length}>
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
        {!!student && !people.length && !contacts.isLoading && !parents.isLoading && (
          <span className="m" style={{ fontWeight: 400 }}>
            {veli ? 'Yazılabilecek öğretmen bulunamadı.' : 'Bu öğrencinin onaylı velisi yok ya da öğrenci ders verdiğin sınıflarda değil.'}
          </span>
        )}
      </label>
      <label className="field" htmlFor="mText">
        Mesaj
        <textarea id="mText" rows={4} value={text} maxLength={2000} onChange={(e) => setText(e.target.value)} />
      </label>
      {err && (
        <div className="err" role="alert">
          {err}
        </div>
      )}
    </Modal>
  )
}
