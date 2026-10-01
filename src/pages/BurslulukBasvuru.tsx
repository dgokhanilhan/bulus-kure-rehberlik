// Herkese açık bursluluk sınavı sayfası (/bursluluk, giriş gerekmez) · Faz G (0018), Bursluluk 2.0 (0021).
// Yeni başvuru: sınav → sınıf → seans (kalan yerle) → bilgiler → takip kodu. Başvurumu görüntüle: takip koduyla, süre içinde düzenleme/iptal.
// Yazma yalnız apply_scholarship / edit_scholarship ile; tarih, kontenjan (kilitli), tekrar başvuru ve deneme sayısı sunucuda denetlenir.
import { useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase, SCHOOL_SLUG } from '@/lib/supabase'
import { KVKK_VERSION } from '@/lib/kvkk'
import { trD, trDW } from '@/lib/format'
import { useSchoolInfo } from '@/lib/files'
import { Icon } from '@/components/Icon'
import { Seg } from '@/components/Indicator'

interface PubSession {
  id: string
  name: string | null
  date: string
  starts_at: string
  ends_at: string
  location: string | null
  grades: { grade: number; capacity: number; remaining: number }[]
}
interface OpenExam {
  id: string
  name: string
  exam_date: string
  grades: number[]
  location: string | null
  description: string | null
  apply_until: string
  full: boolean
  sessions: PubSession[]
}
interface View {
  tracking_code: string
  student_name: string
  grade: number
  current_school: string | null
  parent_name: string
  phone_masked: string
  email_masked: string | null
  exam: string
  exam_date: string
  location: string | null
  session: { id: string; name: string | null; date: string; starts_at: string; ends_at: string } | null
  hall: string | null
  status: 'bekliyor' | 'onaylandi' | 'reddedildi' | 'iptal'
  created_at: string
  grades: number[]
  edit_until: string | null
  can_edit: boolean
  edit_fields: string[]
  sessions: PubSession[]
}
const ST_TR = { bekliyor: 'Değerlendiriliyor', onaylandi: 'Onaylandı', reddedildi: 'Reddedildi', iptal: 'İptal edildi' } as const
const ST_CHIP = { bekliyor: 'gold', onaylandi: 'up', reddedildi: 'down', iptal: 'n' } as const
const hm = (t: string) => t.slice(0, 5)
const sesTime = (s: { starts_at: string; ends_at: string }) => `${hm(s.starts_at)} – ${hm(s.ends_at)}`
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

/** Sunucu "bulunamadı"yı sonuç olarak döner (deneme sayılsın diye); tek biçime çevir. */
async function call<T>(r: PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<{ data: T | null; error: string | null }> {
  const { data, error } = await r
  const e = (data as { error?: string } | null)?.error
  return { data: error || e ? null : (data as T), error: error?.message ?? e ?? null }
}

export default function BurslulukBasvuru() {
  const info = useSchoolInfo()
  const [sp, setSp] = useSearchParams()
  const tab = sp.get('sekme') === 'takip' ? 'takip' : 'yeni'
  const go = (t: 'yeni' | 'takip', kod?: string) => setSp(t === 'takip' ? { sekme: 'takip', ...(kod ? { kod } : {}) } : {}, { replace: true })
  return (
    <main className="view" style={{ maxWidth: 720, margin: '0 auto' }}>
      <div className="stack a" style={{ gap: 4 }}>
        <span className="m" style={{ fontWeight: 500 }}>
          {info.data?.name ?? 'Buluş Küre Koleji'}
        </span>
        <h1 className="hd">Bursluluk sınavı</h1>
      </div>
      <Seg className="a" label="Bursluluk" value={tab} onChange={(t) => go(t)} options={[['yeni', 'Yeni başvuru'], ['takip', 'Başvurumu görüntüle']]} stretch />
      {tab === 'yeni' ? <NewApplication onTrack={(c) => go('takip', c)} /> : <Track initial={sp.get('kod') ?? ''} />}
    </main>
  )
}

// ---------------------------------------------------------------- Yeni başvuru
function NewApplication({ onTrack }: { onTrack: (code: string) => void }) {
  const exams = useQuery({
    queryKey: ['public-scholarship'],
    queryFn: async () => ((await supabase.rpc('public_scholarship_exams', { p_slug: SCHOOL_SLUG })).data ?? []) as OpenExam[],
  })
  const [examId, setExamId] = useState('')
  const [grade, setGrade] = useState<number | null>(null)
  const [session, setSession] = useState('')
  const [f, setF] = useState({ student_name: '', current_school: '', parent_name: '', phone: '', email: '', consent: false })
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<{ tracking_code: string; exam: string; student_name: string; grade: number; session: { name: string | null; date: string; starts_at: string; ends_at: string; location: string | null } } | null>(null)
  const [copied, setCopied] = useState(false)
  const list = exams.data ?? []
  const exam = list.find((e) => e.id === examId) ?? (list.length === 1 ? list[0] : undefined)
  const forGrade = (exam?.sessions ?? []).filter((s) => grade != null && s.grades.some((g) => g.grade === grade))
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF((x) => ({ ...x, [k]: e.target.value }))

  async function submit(e: FormEvent) {
    e.preventDefault()
    setErr(null)
    if (!exam) return setErr('Sınavı seçin.')
    if (grade == null) return setErr('Sınıf seviyesini seçin.')
    if (!session) return setErr('Seansı seçin.')
    if (f.student_name.trim().length < 3 || f.parent_name.trim().length < 3) return setErr('Öğrenci ve veli adını yazın.')
    if (f.phone.replace(/\D/g, '').length < 10) return setErr('Telefon numarasını yazın (ör. 0532 123 45 67).')
    if (f.email && !EMAIL.test(f.email.trim())) return setErr('E-posta geçersiz.')
    if (!f.consent) return setErr('Aydınlatma metnini onaylayın.')
    setBusy(true)
    const r = await call<NonNullable<typeof done>>(
      supabase.rpc('apply_scholarship', {
        p_slug: SCHOOL_SLUG,
        p: { exam_id: exam.id, session_id: session, grade, student_name: f.student_name, current_school: f.current_school, parent_name: f.parent_name, phone: f.phone, email: f.email, consent_version: KVKK_VERSION },
      }),
    )
    setBusy(false)
    if (r.error) {
      if (/kontenjan/i.test(r.error)) exams.refetch()
      return setErr(r.error)
    }
    setDone(r.data)
  }

  if (done)
    return (
      <section className="card a" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 12 }} aria-label="Başvuru alındı">
        <span className="chip up" style={{ alignSelf: 'flex-start' }}>
          <Icon name="check" size={14} stroke={2.4} /> Başvurunuz alındı
        </span>
        <dl className="sdl">
          <dt>Öğrenci</dt>
          <dd>{done.student_name}</dd>
          <dt>Sınıf</dt>
          <dd>{done.grade}. sınıf</dd>
          <dt>Sınav</dt>
          <dd>{done.exam}</dd>
          <dt>Tarih</dt>
          <dd>{trDW(done.session.date)}</dd>
          <dt>Seans</dt>
          <dd>
            {sesTime(done.session)}
            {done.session.name ? ` · ${done.session.name}` : ''}
          </dd>
          {done.session.location && (
            <>
              <dt>Yer</dt>
              <dd>{done.session.location}</dd>
            </>
          )}
        </dl>
        <div className="stack" style={{ gap: 4 }}>
          <span className="label">Takip kodu</span>
          <b className="mono" style={{ fontSize: 26, letterSpacing: 1 }} data-testid="tracking-code">
            {done.tracking_code}
          </b>
          <span className="m" style={{ fontSize: 13 }}>
            Bu kodu saklayın: başvurunuzu bu kodla görüntüleyebilirsiniz; okul izin verdiyse süre içinde değiştirebilirsiniz. Kod size ayrıca gönderilmez.
          </span>
        </div>
        <div className="btns">
          <button className="btn" onClick={() => navigator.clipboard?.writeText(done.tracking_code).then(() => setCopied(true))}>
            <Icon name="doc" size={16} /> {copied ? 'Kopyalandı' : 'Kodu kopyala'}
          </button>
          <button className="btn pri" onClick={() => onTrack(done.tracking_code)}>
            Başvurumu görüntüle
          </button>
        </div>
      </section>
    )
  if (exams.isLoading)
    return (
      <p className="m">
        <span className="spinner" aria-hidden="true" /> Yükleniyor…
      </p>
    )
  if (!list.length) return <div className="empty a">Şu anda başvuruya açık bursluluk sınavı yok.</div>

  return (
    <form className="stack a" style={{ gap: 14 }} noValidate onSubmit={submit} aria-label="Başvuru formu">
      {list.length > 1 && (
        <section className="card" style={{ padding: 16 }} aria-label="Sınav">
          <span className="label">1 · Sınav</span>
          <div className="stack" style={{ gap: 8, marginTop: 8 }}>
            {list.map((e) => (
              <button key={e.id} type="button" className={`scard ${exam?.id === e.id ? 'on' : ''}`} aria-pressed={exam?.id === e.id} disabled={e.full} onClick={() => (setExamId(e.id), setGrade(null), setSession(''))}>
                <b>{e.name}</b>
                <span className="m">
                  {trD(e.exam_date)} · son başvuru {trD(e.apply_until)}
                  {e.full ? ' · kontenjan doldu' : ''}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}
      {exam && (
        <>
          <section className="card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }} aria-label="Sınıf ve seans">
            <div>
              <h2 style={{ fontSize: 18 }}>{exam.name}</h2>
              <span className="m" style={{ fontSize: 13 }}>
                Son başvuru: {trD(exam.apply_until)}
                {exam.location ? ` · ${exam.location}` : ''}
              </span>
              {exam.description && <p style={{ margin: '6px 0 0', whiteSpace: 'pre-line', fontSize: 14 }}>{exam.description}</p>}
            </div>
            <span className="label">{list.length > 1 ? '2' : '1'} · Öğrencinin sınıfı</span>
            <div className="btns" role="group" aria-label="Sınıf seviyesi">
              {exam.grades.map((g) => (
                <button key={g} type="button" className={`btn ${grade === g ? 'pri' : ''}`} aria-pressed={grade === g} onClick={() => (setGrade(g), setSession(''))}>
                  {g}. sınıf
                </button>
              ))}
            </div>
            {grade != null && (
              <>
                <span className="label">{list.length > 1 ? '3' : '2'} · Seans</span>
                {!exam.sessions.length ? (
                  <div className="empty">Bu sınav için henüz seans tanımlanmamış.</div>
                ) : !forGrade.length ? (
                  <div className="empty">{grade}. sınıf için açık seans yok.</div>
                ) : (
                  <div className="sgrid" role="group" aria-label="Seanslar">
                    {forGrade.map((s) => {
                      const left = s.grades.find((g) => g.grade === grade)!.remaining
                      return (
                        <button key={s.id} type="button" className={`scard ${session === s.id ? 'on' : ''}`} aria-pressed={session === s.id} disabled={left <= 0} onClick={() => setSession(s.id)}>
                          <b>{trDW(s.date)}</b>
                          <span style={{ fontSize: 18, fontWeight: 600 }}>{sesTime(s)}</span>
                          {s.name && <span className="m">{s.name}</span>}
                          {s.location && <span className="m">{s.location}</span>}
                          <span className={`chip ${left <= 0 ? 'down' : left <= 5 ? 'gold' : 'up'}`} style={{ alignSelf: 'flex-start' }}>
                            {left <= 0 ? 'Dolu' : `${left} kişilik yer kaldı`}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                )}
              </>
            )}
          </section>
          {session && (
            <section className="card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }} aria-label="Bilgiler">
              <span className="label">{list.length > 1 ? '4' : '3'} · Öğrenci ve veli bilgileri</span>
              <div className="grid2">
                <label className="field" htmlFor="bName">
                  Öğrencinin adı soyadı
                  <input id="bName" value={f.student_name} onChange={set('student_name')} autoComplete="off" maxLength={80} />
                </label>
                <label className="field" htmlFor="bSchool">
                  Okulu (isteğe bağlı)
                  <input id="bSchool" value={f.current_school} onChange={set('current_school')} maxLength={150} />
                </label>
                <label className="field" htmlFor="bParent">
                  Velinin adı soyadı
                  <input id="bParent" value={f.parent_name} onChange={set('parent_name')} autoComplete="name" maxLength={80} />
                </label>
                <label className="field" htmlFor="bPhone">
                  Telefon
                  <input id="bPhone" inputMode="tel" autoComplete="tel" value={f.phone} onChange={set('phone')} placeholder="0532 123 45 67" />
                </label>
              </div>
              <label className="field" htmlFor="bMail">
                E-posta (isteğe bağlı)
                <input id="bMail" type="email" autoComplete="email" value={f.email} onChange={set('email')} />
              </label>
              <div className="stack" style={{ gap: 2 }}>
                <button type="button" className="check" role="checkbox" aria-checked={f.consent} onClick={() => setF((x) => ({ ...x, consent: !x.consent }))}>
                  <span className={`box ${f.consent ? 'on' : ''}`}>{f.consent && <Icon name="check" size={13} stroke={3} />}</span>
                  <span style={{ flex: 1, fontSize: 14 }}>Aydınlatma metnini okudum; başvuru için verdiğim bilgilerin işlenmesini kabul ediyorum.</span>
                </button>
                <a href="/kvkk" target="_blank" rel="noreferrer" style={{ fontSize: 13, marginLeft: 34 }}>
                  Aydınlatma metnini oku
                </a>
              </div>
              {err && (
                <div className="err" role="alert">
                  {err}
                </div>
              )}
              <button className="btn pri" type="submit" style={{ minHeight: 52, fontSize: 16 }} disabled={busy}>
                {busy && <span className="spinner" aria-hidden="true" />} Başvuruyu tamamla
              </button>
            </section>
          )}
          {!session && err && (
            <div className="err" role="alert">
              {err}
            </div>
          )}
        </>
      )}
    </form>
  )
}

// ---------------------------------------------------------------- Başvurumu görüntüle
function Track({ initial }: { initial: string }) {
  const [code, setCode] = useState(initial)
  const [v, setV] = useState<View | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState(false)

  async function look(e?: FormEvent) {
    e?.preventDefault()
    setErr(null)
    if (code.replace(/[^A-Za-z0-9]/g, '').length < 8) return setErr('Takip kodunu yazın (ör. BK-7K4P-92MX).')
    setBusy(true)
    const r = await call<View>(supabase.rpc('track_scholarship', { p_slug: SCHOOL_SLUG, p_code: code }))
    setBusy(false)
    setEditing(false)
    if (r.error) return (setV(null), setErr(r.error))
    setV(r.data)
  }

  return (
    <div className="stack a" style={{ gap: 14 }}>
      <form className="card" style={{ padding: 16, display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }} onSubmit={look} noValidate aria-label="Kodla başvuru bul">
        <label className="field" htmlFor="tCode" style={{ flex: 1, minWidth: 200 }}>
          Takip kodu
          <input id="tCode" className="mono" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="BK-XXXX-XXXX" autoComplete="off" autoCapitalize="characters" maxLength={20} />
        </label>
        <button className="btn pri" type="submit" disabled={busy} style={{ minHeight: 46 }}>
          {busy && <span className="spinner" aria-hidden="true" />} Görüntüle
        </button>
        {err && (
          <div className="err" role="alert" style={{ width: '100%' }}>
            {err}
          </div>
        )}
      </form>
      {v && !editing && <Details v={v} onEdit={() => setEditing(true)} />}
      {v && editing && <EditForm code={v.tracking_code} v={v} onDone={(nv) => (setV(nv), setEditing(false))} onCancel={() => setEditing(false)} />}
    </div>
  )
}

function Details({ v, onEdit }: { v: View; onEdit: () => void }) {
  const active = v.status === 'bekliyor' || v.status === 'onaylandi'
  return (
    <section className="card" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }} aria-label="Başvuru">
      <div className="kv" style={{ flexWrap: 'wrap' }}>
        <b className="mono" style={{ fontSize: 18 }}>
          {v.tracking_code}
        </b>
        <span className={`chip ${ST_CHIP[v.status]}`}>{ST_TR[v.status]}</span>
      </div>
      <dl className="sdl">
        <dt>Öğrenci</dt>
        <dd>{v.student_name}</dd>
        <dt>Sınıf</dt>
        <dd>
          {v.grade}. sınıf{v.current_school ? ` · ${v.current_school}` : ''}
        </dd>
        <dt>Sınav</dt>
        <dd>{v.exam}</dd>
        <dt>Tarih</dt>
        <dd>{trDW(v.session?.date ?? v.exam_date)}</dd>
        <dt>Seans</dt>
        <dd>{v.session ? `${sesTime(v.session)}${v.session.name ? ` · ${v.session.name}` : ''}` : 'Seans atanmamış'}</dd>
        {v.location && (
          <>
            <dt>Yer</dt>
            <dd>{v.location}</dd>
          </>
        )}
        <dt>Salon</dt>
        <dd>{v.hall ?? <span className="m">Henüz atanmadı</span>}</dd>
        <dt>Veli</dt>
        <dd>
          {v.parent_name} · {v.phone_masked}
          {v.email_masked ? ` · ${v.email_masked}` : ''}
        </dd>
        <dt>Başvuru tarihi</dt>
        <dd>{trD(v.created_at.slice(0, 10))}</dd>
      </dl>
      {v.can_edit ? (
        <div className="btns">
          <button className="btn" onClick={onEdit}>
            <Icon name="pen" size={15} /> Başvuruyu düzenle
          </button>
          <span className="m" style={{ fontSize: 13 }}>
            {trD(v.edit_until!)} tarihine kadar değiştirebilirsiniz.
          </span>
        </div>
      ) : (
        active &&
        v.edit_until && (
          <p className="m" style={{ margin: 0 }}>
            Düzenleme süresi sona ermiştir.
          </p>
        )
      )}
    </section>
  )
}

function EditForm({ code, v, onDone, onCancel }: { code: string; v: View; onDone: (v: View) => void; onCancel: () => void }) {
  const can = (k: string) => v.edit_fields.includes(k)
  const [f, setF] = useState({ student_name: v.student_name, current_school: v.current_school ?? '', parent_name: v.parent_name, phone: '', email: '' })
  const [grade, setGrade] = useState(v.grade)
  const [session, setSession] = useState(v.session?.id ?? '')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [sure, setSure] = useState(false)
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF((x) => ({ ...x, [k]: e.target.value }))
  const forGrade = v.sessions.filter((s) => s.grades.some((g) => g.grade === grade))

  async function send(p: Record<string, unknown>) {
    setErr(null)
    setBusy(true)
    const r = await call<View>(supabase.rpc('edit_scholarship', { p_slug: SCHOOL_SLUG, p_code: code, p }))
    setBusy(false)
    if (r.error) return setErr(r.error)
    onDone(r.data!)
  }
  function save(e: FormEvent) {
    e.preventDefault()
    if (f.email && !EMAIL.test(f.email.trim())) return setErr('E-posta geçersiz.')
    if (f.phone && f.phone.replace(/\D/g, '').length < 10) return setErr('Telefon numarası geçersiz.')
    const p: Record<string, unknown> = {}
    if (can('student_name')) p.student_name = f.student_name
    if (can('current_school')) p.current_school = f.current_school
    if (can('parent_name')) p.parent_name = f.parent_name
    if (can('phone') && f.phone) p.phone = f.phone
    if (can('email') && f.email) p.email = f.email
    if (can('grade')) p.grade = grade
    if (can('session')) {
      if (!session || !forGrade.some((s) => s.id === session)) return setErr('Seansı seçin.')
      p.session_id = session
    }
    send(p)
  }

  return (
    <form className="card" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }} onSubmit={save} noValidate aria-label="Başvuruyu düzenle">
      <h2 style={{ fontSize: 18 }}>Başvuruyu düzenle</h2>
      {(can('student_name') || can('current_school')) && (
        <div className="grid2">
          {can('student_name') && (
            <label className="field" htmlFor="eName">
              Öğrencinin adı soyadı
              <input id="eName" value={f.student_name} onChange={set('student_name')} maxLength={80} />
            </label>
          )}
          {can('current_school') && (
            <label className="field" htmlFor="eSchool">
              Okulu
              <input id="eSchool" value={f.current_school} onChange={set('current_school')} maxLength={150} />
            </label>
          )}
        </div>
      )}
      {can('grade') && (
        <div className="btns" role="group" aria-label="Sınıf seviyesi">
          {v.grades.map((g) => (
            <button key={g} type="button" className={`btn sm ${grade === g ? 'pri' : ''}`} aria-pressed={grade === g} onClick={() => (setGrade(g), setSession(''))}>
              {g}. sınıf
            </button>
          ))}
        </div>
      )}
      {can('session') && (
        <div className="sgrid" role="group" aria-label="Seanslar">
          {forGrade.map((s) => {
            const left = s.grades.find((g) => g.grade === grade)!.remaining
            return (
              <button key={s.id} type="button" className={`scard ${session === s.id ? 'on' : ''}`} aria-pressed={session === s.id} disabled={left <= 0 && session !== s.id} onClick={() => setSession(s.id)}>
                <b>{trDW(s.date)}</b>
                <span style={{ fontWeight: 600 }}>{sesTime(s)}</span>
                {s.name && <span className="m">{s.name}</span>}
                <span className={`chip ${left <= 0 ? 'down' : 'up'}`} style={{ alignSelf: 'flex-start' }}>
                  {left <= 0 ? 'Dolu' : `${left} kişilik yer kaldı`}
                </span>
              </button>
            )
          })}
          {!forGrade.length && <div className="empty">{grade}. sınıf için açık seans yok.</div>}
        </div>
      )}
      {(can('parent_name') || can('phone') || can('email')) && (
        <div className="grid2">
          {can('parent_name') && (
            <label className="field" htmlFor="eParent">
              Velinin adı soyadı
              <input id="eParent" value={f.parent_name} onChange={set('parent_name')} maxLength={80} />
            </label>
          )}
          {can('phone') && (
            <label className="field" htmlFor="ePhone">
              Yeni telefon (boş = değişmez)
              <input id="ePhone" inputMode="tel" value={f.phone} onChange={set('phone')} placeholder={v.phone_masked} />
            </label>
          )}
          {can('email') && (
            <label className="field" htmlFor="eMail">
              Yeni e-posta (boş = değişmez)
              <input id="eMail" type="email" value={f.email} onChange={set('email')} placeholder={v.email_masked ?? ''} />
            </label>
          )}
        </div>
      )}
      {err && (
        <div className="err" role="alert">
          {err}
        </div>
      )}
      <div className="btns">
        <button className="btn pri" type="submit" disabled={busy}>
          {busy && <span className="spinner" aria-hidden="true" />} Değişiklikleri kaydet
        </button>
        <button className="btn" type="button" onClick={onCancel}>
          Vazgeç
        </button>
      </div>
      <div style={{ borderTop: '1px solid var(--line)', paddingTop: 12 }}>
        {sure ? (
          <div className="btns">
            <span style={{ fontSize: 14 }}>Başvuru iptal edilsin mi? Bu işlem geri alınamaz.</span>
            <button className="btn warn" type="button" disabled={busy} onClick={() => send({ cancel: true })}>
              Evet, iptal et
            </button>
            <button className="btn" type="button" onClick={() => setSure(false)}>
              Hayır
            </button>
          </div>
        ) : (
          <button className="btn ghost sm" type="button" onClick={() => setSure(true)}>
            Başvuruyu iptal et
          </button>
        )}
      </div>
    </form>
  )
}
