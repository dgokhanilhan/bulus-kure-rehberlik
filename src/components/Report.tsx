// Rapor ekranı (veli / öğretmen): prototipteki tam ekran "kâğıt" görünümü.
// Tam yetkili düzenler, yapay zekâyla yazdırır, kaydeder, gönderir; alıcılar yalnız okur ve PDF indirir.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/auth/AuthProvider'
import { supabase } from '@/lib/supabase'
import { isFullAccess, isTeacherP, ROLE_TR, roleOf } from '@/lib/roles'
import { SUBJECTS, fmt, totalNet, type Dataset } from '@/lib/analiz'
import { useDataset, useNotes, usePeople, useRefresh, useStudents, useTasks, useParentLinks } from '@/lib/data'
import { aiPayload, genVeli, reportData, type OgretmenBody, type VeliBody } from '@/lib/rapor'
import { fold, todayISO, trD } from '@/lib/format'
import type { Student } from '@/lib/types'
import { Icon, Logo } from './Icon'
import { useToast } from './Toast'
import type { PdfOgretmen, PdfVeli } from '@/lib/pdf'

type Target = { id: string } | { type: 'veli' | 'ogretmen'; sid: string; eid: string }
const Ctx = createContext<(t: Target) => void>(() => {})
export const useOpenReport = () => useContext(Ctx)

export function ReportProvider({ children }: { children: ReactNode }) {
  const [t, setT] = useState<Target | null>(null)
  const open = useCallback((x: Target) => setT(x), [])
  return (
    <Ctx.Provider value={open}>
      {children}
      {t && <ReportLoader target={t} onClose={() => setT(null)} />}
    </Ctx.Provider>
  )
}

interface Row {
  id: string
  type: 'veli' | 'ogretmen'
  student_id: string
  exam_id: string
  body: Record<string, unknown>
  ai_generated: boolean
  status: 'draft' | 'sent'
  sent_to_parent: boolean
  sent_to_student: boolean
  rehber: string | null
  sent_at: string | null
}

function ReportLoader({ target, onClose }: { target: Target; onClose: () => void }) {
  const q = useQuery({
    queryKey: ['report', target],
    queryFn: async () => {
      let r = supabase.from('reports_view').select('*')
      r = 'id' in target ? r.eq('id', target.id) : r.eq('type', target.type).eq('student_id', target.sid).eq('exam_id', target.eid)
      const { data, error } = await r.maybeSingle()
      if (error) throw error
      return data as Row | null
    },
  })
  const ds = useDataset()
  const students = useStudents()
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', k)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', k)
      document.body.style.overflow = ''
    }
  }, [onClose])
  const row = q.data
  const type = row?.type ?? ('type' in target ? target.type : null)
  const sid = row?.student_id ?? ('sid' in target ? target.sid : null)
  const eid = row?.exam_id ?? ('eid' in target ? target.eid : null)
  const s = students.data?.find((x) => x.id === sid)
  const ready = !q.isLoading && ds.data && s && type && eid
  return createPortal(
    <div className="rwrap" role="dialog" aria-modal="true" aria-label="Rapor" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      {!ready ? (
        <div className="rbar">
          <b>{q.isLoading || ds.isLoading || students.isLoading ? 'Rapor yükleniyor…' : 'Rapor bulunamadı.'}</b>
          <button className="btn sm" onClick={onClose} aria-label="Kapat">
            <Icon name="x" size={16} stroke={2.4} />
          </button>
        </div>
      ) : (
        <ReportView key={`${type}${sid}${eid}`} type={type} student={s} eid={eid} ds={ds.data!} row={row ?? null} onClose={onClose} />
      )}
    </div>,
    document.body,
  )
}

function ReportView({ type, student: s, eid, ds, row, onClose }: { type: 'veli' | 'ogretmen'; student: Student; eid: string; ds: Dataset; row: Row | null; onClose: () => void }) {
  const { role, profile } = useAuth()
  const toast = useToast()
  const refresh = useRefresh()
  const E = isFullAccess(role!)
  const V = type === 'veli'
  const R = useMemo(() => reportData(ds, s.id, eid), [ds, s.id, eid])
  const exam = ds.exams.find((e) => e.id === eid)!
  const [body, setBody] = useState<VeliBody | OgretmenBody>(() => {
    if (row) return V ? ({ ...(row.body as unknown as VeliBody), rehber: row.rehber ?? '', ai: row.ai_generated } as VeliBody) : (row.body as unknown as OgretmenBody)
    if (V && R) return genVeli(R, s.full_name, s.id + eid)
    return V ? ({ genel: '', guclu: '', gelisim: '', oneriler: '', mentor: '', rehber: '', ai: false } as VeliBody) : { toplanti: '' }
  })
  const [ai, setAi] = useState<null | 'run' | { err: string }>(null)
  const [mentorEdited, setMentorEdited] = useState(false)
  const [sendOpen, setSendOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const tasks = useTasks(V ? undefined : s.id)
  const notes = useNotes(V ? undefined : s.id)
  const people = usePeople()
  const links = useParentLinks(E)
  const [rec, setRec] = useState({ veli: true, ogrenci: false, users: [] as string[] })

  if (!R) return <div className="empty">Bu öğrencinin bu denemede sonucu yok.</div>
  const vb = body as VeliBody
  const ob = body as OgretmenBody
  const set = (k: string, v: string) => setBody((b) => ({ ...b, [k]: v }))

  async function save(quiet = false): Promise<string | null> {
    setBusy(true)
    const payload = V ? { genel: vb.genel, guclu: vb.guclu, gelisim: vb.gelisim, oneriler: vb.oneriler, mentor: vb.mentor, rehber: vb.rehber } : { toplanti: ob.toplanti }
    const { data, error } = await supabase
      .from('reports')
      .upsert({ type, student_id: s.id, exam_id: eid, body: payload, ai_generated: V ? vb.ai : false, created_by: profile!.id }, { onConflict: 'type,student_id,exam_id' })
      .select('id')
      .single()
    setBusy(false)
    if (error) {
      toast(error.message || 'Kaydedilemedi.', 'warn')
      return null
    }
    if (!quiet) toast('Rapor kaydedildi')
    refresh('reports')
    return data.id as string
  }

  async function writeAi() {
    setAi('run')
    const { data, error } = await supabase.functions.invoke('ai-veli-raporu', { body: { student_id: s.id, payload: aiPayload(R!) } })
    if (error || !data?.report) {
      const ctx = (error as { context?: Response } | null)?.context
      const st = ctx?.status
      const why = st === 422 ? await ctx!.json().then((b: { detail?: string[] }) => (b.detail ?? []).map((d) => d.replace(/^yasak:/, '')).join(', '), () => '') : ''
      setAi({
        err:
          st === 401
            ? 'Oturumun süresi dolmuş; çıkış yapıp yeniden gir. Kural tabanlı taslak duruyor.'
            : st === 429
            ? 'Yapay zekâ kotası doldu (günlük ya da aylık sınır). Kural tabanlı taslak duruyor.'
            : st === 503
              ? 'Yapay zekâ henüz yapılandırılmadı. Kural tabanlı taslak duruyor.'
              : st === 422
                ? `Yapay zekânın metni yazım kurallarına uymadığı için kullanılmadı${why ? ` (${why})` : ''}. Kural tabanlı taslak duruyor.`
                : 'Yapay zekâ şu an yanıt vermedi; kural tabanlı taslak duruyor. Birazdan tekrar deneyebilirsin.',
      })
      return
    }
    const raw = data.report as { genel: string; guclu: string; gelisim: string; oneriler: string[]; mentorOneri: string }
    // Yapay zekâ denemeleri "Deneme 1…n" olarak gördü; metinde geçerse gerçek adlarına çevir.
    const un = (t: string) => t.replace(/Deneme (\d{1,3})\b/g, (m, n) => R!.exams[Number(n) - 1]?.name ?? m)
    const r = { genel: un(raw.genel), guclu: un(raw.guclu), gelisim: un(raw.gelisim), oneriler: raw.oneriler.map(un), mentorOneri: un(raw.mentorOneri) }
    setBody((b) => ({ ...(b as VeliBody), genel: r.genel, guclu: r.guclu, gelisim: r.gelisim, oneriler: r.oneriler.join('\n'), mentor: mentorEdited ? (b as VeliBody).mentor : r.mentorOneri, ai: true }))
    setAi(null)
    toast('Rapor yapay zekâ ile yazıldı', 'spark')
    // Metin sayfanın aşağısındaki bölümlere yazılır; oraya kaydır ki görülsün.
    requestAnimationFrame(() => document.getElementById('rapor-genel')?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }

  const hasParent = links.data?.some((l) => l.student_id === s.id) ?? false
  const hasStudent = people.data?.some((p) => p.role === 'ogrenci' && p.student_id === s.id) ?? false
  const teachers = (people.data ?? []).filter((p) => p.role !== 'admin' && isTeacherP(p) && p.id !== profile?.id)

  async function send() {
    const rid = await save(true)
    if (!rid) return
    const { data, error } = V
      ? await supabase.rpc('send_report', { p_report: rid, p_parent: rec.veli, p_student: rec.ogrenci })
      : await supabase.rpc('send_report', { p_report: rid, p_users: rec.users })
    if (error) return toast(error.message || 'Gönderilemedi.', 'warn')
    setSendOpen(false)
    toast(data ? `Gönderildi · ${data} kişi` : 'Kaydedildi; seçilen alıcıların onaylı hesabı yok')
    refresh('reports')
  }

  // ---------- görünüm verisi ----------
  const x = R.cur
  const P = R.prev
  const subjRows = SUBJECTS.map((d) => {
    const q = x.subjects[d.code]
    const p = P?.subjects[d.code]
    const df = q && p ? q.net - p.net : 0
    return { d, q, p, trend: (q && p ? (df > 1 ? 'up' : df < -1 ? 'down' : null) : null) as 'up' | 'down' | null }
  })
  const info: [string, string][] = [
    ['Ad Soyad', s.full_name],
    ['Şube', s.class_name],
    ['Deneme', `${exam.name}${exam.publisher ? ` · ${exam.publisher}` : ''}`],
    ['Tarih', trD(exam.exam_date)],
    ['Puan', x.score != null ? fmt(x.score) : '—'],
    ['Toplam Net', fmt(totalNet(x), 2)],
  ]
  const name = (uid: string) => people.data?.find((p) => p.id === uid)
  const teacherNotes = (notes.data ?? []).filter((n) => n.visibility !== 'rehber')
  const myTasks = tasks.data ?? []
  const today = todayISO()

  async function downloadPdf() {
    toast('PDF hazırlanıyor…', 'doc')
    const { reportPdfBlob } = await import('@/lib/pdf')
    const common = {
      student: s.full_name,
      className: s.class_name,
      exam: info[2]![1],
      date: info[3]![1],
      score: info[4]![1],
      totalNet: info[5]![1],
      reportDate: new Date().toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' }),
      subjects: subjRows.map((r) => ({ ad: r.d.ad, d: String(r.q?.d ?? '—'), y: String(r.q?.y ?? '—'), b: String(r.q?.b ?? '—'), net: r.q ? fmt(r.q.net, 2) : '—', prev: r.p ? fmt(r.p.net, 2) : '—', trend: r.trend })),
    }
    const data: PdfVeli | PdfOgretmen = V
      ? { ...common, kind: 'veli', genel: vb.genel, guclu: vb.guclu, gelisim: vb.gelisim, oneriler: vb.oneriler.split('\n').map((o) => o.trim()).filter(Boolean), mentor: vb.mentor, rehber: vb.rehber ?? '' }
      : {
          ...common,
          kind: 'ogretmen',
          history: {
            exams: R!.exams.map((e) => e.name),
            rows: SUBJECTS.map((d) => ({ ad: d.ad, nets: R!.exams.map((e) => (e.result.subjects[d.code] ? fmt(e.result.subjects[d.code]!.net, 2) : '—')) })),
            totals: R!.exams.map((e) => fmt(totalNet(e.result), 2)),
          },
          repeats: R!.kzMissing ? [] : R!.rep.map((r) => ({ konu: r.outcome.title, kod: r.outcome.code, ders: SUBJECTS.find((q) => q.code === r.outcome.subject)!.ad, denemeler: r.examNames.join(', ') })),
          repeatsNote: R!.kzMissing ? 'Konu bilgisi okunamadığı için tekrar eden hata analizi yapılamadı.' : 'Tekrar eden hata yok.',
          tasks: myTasks.map((t) => ({ konu: t.topic, son: trD(t.due_date), ilerleme: `${t.solved}/${t.question_count}`, durum: t.completed_at ? 'Tamamlandı' : t.due_date < today ? 'Gecikti' : 'Devam ediyor' })),
          notes: teacherNotes.map((n) => ({ yazar: `${name(n.author_id)?.full_name ?? 'Öğretmen'}${name(n.author_id)?.branch ? ` (${name(n.author_id)!.branch})` : ''}`, metin: n.body ?? '' })),
          toplanti: ob.toplanti,
        }
    try {
      const blob = await reportPdfBlob(data)
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `${V ? 'Veli-Raporu' : 'Ogretmen-Raporu'}_${fold(s.full_name).replace(/\s+/g, '-')}_${exam.name.replace(/[^\p{L}\d-]+/gu, '-')}.pdf`
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(a.href), 10_000)
    } catch {
      toast('PDF oluşturulamadı', 'warn')
    }
  }

  const tx = (k: 'genel' | 'guclu' | 'gelisim' | 'mentor' | 'rehber' | 'toplanti', rows: number, label: string, placeholder?: string) =>
    E ? (
      <textarea
        className="ptxt"
        rows={rows}
        aria-label={label}
        placeholder={placeholder}
        value={((body as unknown as Record<string, string>)[k] ?? '') as string}
        onChange={(e) => {
          if (k === 'mentor') setMentorEdited(true)
          set(k, e.target.value)
        }}
      />
    ) : (
      <p className="tx">{((body as unknown as Record<string, string>)[k] || '—') as string}</p>
    )

  return (
    <>
      <div className="rbar">
        <b>
          {V ? 'Veli raporu' : 'Öğretmen raporu'} · {s.full_name} · {exam.name}
          {row?.status === 'sent' && <span className="chip up" style={{ marginLeft: 8 }}>Gönderildi</span>}
        </b>
        {E && V && (
          <button className={`btn sm ${ai === 'run' ? '' : 'gold'}`} onClick={writeAi} disabled={ai === 'run'}>
            {ai === 'run' ? (
              <>
                <span className="spinner" aria-hidden="true" /> Yazıyor…
              </>
            ) : (
              <>
                <Icon name="spark" size={16} />
                Yapay zekâ ile yaz
              </>
            )}
          </button>
        )}
        {E && (
          <button className="btn sm" onClick={() => save()} disabled={busy}>
            <Icon name="check" size={16} />
            Kaydet
          </button>
        )}
        <button className="btn sm" onClick={downloadPdf}>
          <Icon name="up" size={16} />
          PDF indir
        </button>
        {E && (
          <button className="btn sm pri" onClick={() => setSendOpen(!sendOpen)}>
            <Icon name="right" size={16} />
            Gönder
          </button>
        )}
        <button className="btn sm" onClick={onClose} aria-label="Kapat">
          <Icon name="x" size={16} stroke={2.4} />
        </button>
      </div>

      {sendOpen && (
        <div className="card" style={{ maxWidth: 840, margin: '0 auto 14px', padding: 16, display: 'flex', flexDirection: 'column', gap: 10, animation: 'drop .3s var(--ease)' }} role="group" aria-label="Alıcılar">
          <b>Kime gönderilsin?</b>
          {V ? (
            <>
              <Check on={rec.veli} onClick={() => setRec({ ...rec, veli: !rec.veli })} label="Veli" hint={hasParent ? 'Onaylı hesap var' : 'Onaylı hesap yok'} />
              <Check on={rec.ogrenci} onClick={() => setRec({ ...rec, ogrenci: !rec.ogrenci })} label="Öğrenci" hint={hasStudent ? 'Onaylı hesap var' : 'Onaylı hesap yok'} />
            </>
          ) : (
            <>
              <Check
                on={teachers.length > 0 && rec.users.length === teachers.length}
                onClick={() => setRec({ ...rec, users: rec.users.length === teachers.length ? [] : teachers.map((t) => t.id) })}
                label="Tüm öğretmenler"
                bold
              />
              {teachers.map((t) => (
                <Check
                  key={t.id}
                  on={rec.users.includes(t.id)}
                  onClick={() => setRec({ ...rec, users: rec.users.includes(t.id) ? rec.users.filter((u) => u !== t.id) : [...rec.users, t.id] })}
                  label={t.full_name}
                  hint={roleOf({ role: 'ogretmen', branch: t.branch }) === 'rehber' ? ROLE_TR.rehber : (t.branch ?? '')}
                />
              ))}
            </>
          )}
          <div className="btns">
            <button className="btn pri" onClick={send}>
              <Icon name="right" size={16} />
              Gönder
            </button>
            <button className="btn" onClick={() => setSendOpen(false)}>
              Vazgeç
            </button>
          </div>
        </div>
      )}
      {ai && ai !== 'run' && (
        <div className="aibox" style={{ maxWidth: 840, margin: '0 auto 14px' }} role="status">
          <Icon name="warn" size={18} />
          {ai.err}
        </div>
      )}
      {V && vb.ai && E && (
        <div className="aibox" style={{ maxWidth: 840, margin: '0 auto 14px' }}>
          <Icon name="spark" size={18} />
          Metin yapay zekâ tarafından senin kurallarınla yazıldı. Gözden geçirip düzenleyebilirsin.
        </div>
      )}

      <article className="paper" data-testid="report-paper">
        <div className="rh">
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <Logo />
            <div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 21, fontWeight: 600, lineHeight: 1.2 }}>Buluş Küre Koleji</div>
              <div style={{ color: '#56636a', fontSize: 13 }}>Rehberlik &amp; Mentörlük · {V ? 'Veli Gelişim Raporu' : 'Öğretmen Bilgilendirme Raporu'}</div>
            </div>
          </div>
          <div style={{ textAlign: 'right', fontSize: 12.5, color: '#56636a' }}>
            Rapor tarihi
            <br />
            <b style={{ color: '#1b2a2f' }}>{new Date(row?.sent_at ?? Date.now()).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })}</b>
          </div>
        </div>
        <div className="info">
          {info.map(([k, v]) => (
            <div key={k}>
              <span>{k}</span>
              <b>{v}</b>
            </div>
          ))}
        </div>
        {!V && (
          <div className="sec">
            <h3>Net gelişimi</h3>
            <table>
              <thead>
                <tr>
                  <th>Ders</th>
                  {R.exams.map((e) => (
                    <th key={e.name} className="pnum">
                      {e.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {SUBJECTS.map((d) => (
                  <tr key={d.code}>
                    <td>{d.ad}</td>
                    {R.exams.map((e) => (
                      <td key={e.name} className="pnum">
                        {e.result.subjects[d.code] ? fmt(e.result.subjects[d.code]!.net, 2) : '—'}
                      </td>
                    ))}
                  </tr>
                ))}
                <tr>
                  <td>
                    <b>Toplam</b>
                  </td>
                  {R.exams.map((e) => (
                    <td key={e.name} className="pnum">
                      <b>{fmt(totalNet(e.result), 2)}</b>
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        )}
        <div className="sec">
          <h3>Ders Performansı</h3>
          <table>
            <thead>
              <tr>
                <th>Ders</th>
                <th className="pnum">D</th>
                <th className="pnum">Y</th>
                <th className="pnum">B</th>
                <th className="pnum">Net</th>
                <th className="pnum">Önceki</th>
              </tr>
            </thead>
            <tbody>
              {subjRows.map((r) => (
                <tr key={r.d.code}>
                  <td>{r.d.ad}</td>
                  <td className="pnum">{r.q?.d ?? '—'}</td>
                  <td className="pnum">{r.q?.y ?? '—'}</td>
                  <td className="pnum">{r.q?.b ?? '—'}</td>
                  <td className="pnum">
                    <b>{r.q ? fmt(r.q.net, 2) : '—'}</b>
                  </td>
                  <td className="pnum" style={{ color: r.trend === 'down' ? '#b5541a' : r.trend === 'up' ? '#1f5f5b' : '#56636a' }}>
                    {r.p ? fmt(r.p.net, 2) : '—'}
                    {r.trend === 'up' ? ' ↑' : r.trend === 'down' ? ' ↓' : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {V ? (
          <>
            <div className="sec" id="rapor-genel">
              <h3>Genel Değerlendirme</h3>
              {tx('genel', 6, 'Genel değerlendirme')}
            </div>
            <div className="sec">
              <h3>Güçlü Yönler</h3>
              {tx('guclu', 3, 'Güçlü yönler')}
            </div>
            <div className="sec">
              <h3>Üzerinde Çalışılması Gereken Alanlar</h3>
              {tx('gelisim', 4, 'Üzerinde çalışılması gereken alanlar')}
            </div>
            <div className="sec">
              <h3>Çalışma Önerileri</h3>
              {E ? (
                <>
                  <textarea className="ptxt" rows={5} aria-label="Çalışma önerileri (her satıra bir öneri)" value={vb.oneriler} onChange={(e) => set('oneriler', e.target.value)} />
                  <span style={{ fontSize: 11.5, color: '#56636a' }}>Her satır bir öneri olarak yazdırılır.</span>
                </>
              ) : (
                <ol style={{ margin: 0, paddingLeft: 20 }}>
                  {vb.oneriler
                    .split('\n')
                    .filter(Boolean)
                    .map((o, i) => (
                      <li key={i}>{o}</li>
                    ))}
                </ol>
              )}
            </div>
            <div className="sec">
              <h3>Mentör Yorumu</h3>
              {tx('mentor', 3, 'Mentör yorumu')}
            </div>
            {(E || vb.rehber) && (
              <div className="sec">
                <h3>Rehber Öğretmen Yorumu</h3>
                {tx('rehber', 3, 'Rehber öğretmen yorumu', 'Rehber öğretmen gözlemi (boş bırakılırsa raporda yer almaz)')}
              </div>
            )}
            <div className="foot">
              <span>Bu rapor öğrencinin yalnızca kendi önceki denemeleriyle karşılaştırılmasına dayanır.</span>
              <span>Buluş Küre Koleji Rehberlik &amp; Mentörlük</span>
            </div>
          </>
        ) : (
          <>
            <div className="sec">
              <h3>Tekrar eden hatalar</h3>
              {!R.kzMissing && R.rep.length ? (
                <table>
                  <thead>
                    <tr>
                      <th>Konu</th>
                      <th>Kod</th>
                      <th>Ders</th>
                      <th>Yanlış olduğu denemeler</th>
                    </tr>
                  </thead>
                  <tbody>
                    {R.rep.map((r) => (
                      <tr key={r.outcome.code}>
                        <td>{r.outcome.title}</td>
                        <td style={{ fontFamily: 'var(--font-mono)' }}>{r.outcome.code}</td>
                        <td>{SUBJECTS.find((q) => q.code === r.outcome.subject)!.ad}</td>
                        <td>{r.examNames.join(', ')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="tx">{R.kzMissing ? 'Konu bilgisi okunamadığı için tekrar eden hata analizi yapılamadı.' : 'Tekrar eden hata yok.'}</p>
              )}
            </div>
            <div className="sec">
              <h3>Görevler</h3>
              {myTasks.length ? (
                <table>
                  <thead>
                    <tr>
                      <th>Konu</th>
                      <th>Son gün</th>
                      <th className="pnum">İlerleme</th>
                      <th>Durum</th>
                    </tr>
                  </thead>
                  <tbody>
                    {myTasks.map((t) => (
                      <tr key={t.id}>
                        <td>{t.topic}</td>
                        <td>{trD(t.due_date)}</td>
                        <td className="pnum">
                          {t.solved}/{t.question_count}
                        </td>
                        <td>{t.completed_at ? 'Tamamlandı' : t.due_date < today ? 'Gecikti' : 'Devam ediyor'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="tx">Görev yok.</p>
              )}
            </div>
            <div className="sec">
              <h3>Öğretmen notları</h3>
              {teacherNotes.length ? (
                teacherNotes.map((n) => (
                  <p className="tx" style={{ marginBottom: 6 }} key={n.id}>
                    <b>{name(n.author_id)?.full_name ?? 'Öğretmen'}</b>
                    {name(n.author_id)?.branch ? ` (${name(n.author_id)!.branch})` : ''}: {n.body}
                  </p>
                ))
              ) : (
                <p className="tx">Not yok.</p>
              )}
            </div>
            <div className="sec">
              <h3>Toplantı gündemi / değerlendirme</h3>
              {tx('toplanti', 4, 'Toplantı gündemi')}
            </div>
            <div className="foot">
              <span>Kurum içi kullanım içindir. Veli ile paylaşılmaz.</span>
              <span>Buluş Küre Koleji Rehberlik &amp; Mentörlük</span>
            </div>
          </>
        )}
      </article>
    </>
  )
}

function Check({ on, onClick, label, hint, bold }: { on: boolean; onClick: () => void; label: string; hint?: string; bold?: boolean }) {
  return (
    <button type="button" className="check" role="checkbox" aria-checked={on} onClick={onClick}>
      <span className={`box ${on ? 'on' : ''}`}>{on && <Icon name="check" size={13} stroke={3} />}</span>
      <span style={{ flex: 1, fontWeight: bold ? 600 : undefined }}>{label}</span>
      {hint && (
        <span className="m" style={{ fontSize: 13 }}>
          {hint}
        </span>
      )}
    </button>
  )
}
