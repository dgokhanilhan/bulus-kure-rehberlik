import { useMemo, useRef, useState, type DragEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { readExamFile } from '@/lib/engine'
import { ADAPTER_PUBLISHER, buildPayload, buildReview, pendingCount, titleCase, type Review } from '@/lib/deneme'
import { SUBJECT } from '@/lib/analiz'
import { useClasses, useRefresh, useStudents } from '@/lib/data'
import { todayISO, trD } from '@/lib/format'
import { DENEME_GRADE } from '@/lib/roles'
import type { Student } from '@/lib/types'
import { Icon } from '@/components/Icon'
import { Dropdown } from '@/components/Indicator'
import { Toggle } from '@/components/Tasks'
import { useToast } from '@/components/Toast'
import { ConfirmDelete } from '@/components/ConfirmDelete'

type Step = 'drop' | 'read' | 'review' | 'done'
interface ExamRow {
  id: string
  name: string
  publisher: string | null
  exam_date: string
  published_at: string | null
}

const STEPS = ['Yükle', 'Oku', 'Kontrol', 'Yayınla']

export default function DenemelerPage() {
  const students = useStudents()
  const toast = useToast()
  const refresh = useRefresh()
  const nav = useNavigate()
  const fileRef = useRef<HTMLInputElement>(null)
  const exams = useQuery({
    queryKey: ['exams-list'],
    queryFn: async () => {
      const [e, r] = await Promise.all([
        supabase.from('exams').select('id, name, publisher, exam_date, published_at').order('exam_date', { ascending: false }),
        supabase.from('exam_results').select('exam_id'),
      ])
      if (e.error) throw e.error
      const count = new Map<string, number>()
      for (const x of r.data ?? []) count.set(x.exam_id, (count.get(x.exam_id) ?? 0) + 1)
      return { exams: e.data as ExamRow[], count }
    },
  })

  const [step, setStep] = useState<Step>('drop')
  const [name, setName] = useState<string | null>(null)
  const [date, setDate] = useState(todayISO())
  const [publisher, setPublisher] = useState('')
  const [file, setFile] = useState<string>('')
  const [progress, setProgress] = useState<{ page: number; total: number } | null>(null)
  const [lines, setLines] = useState<[string, boolean][]>([])
  const [rv, setRv] = useState<Review | null>(null)
  const [fixSrc, setFixSrc] = useState('Kural tabanlı')
  const [notify, setNotify] = useState(true)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<{ name: string; count: number } | null>(null)
  const [over, setOver] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const nextName = `TG-${(exams.data?.exams.filter((e) => e.name.startsWith('TG-')).length ?? 0) + 1}`
  const examName = name ?? nextName
  const today = todayISO()

  async function start(f: File) {
    setErr(null)
    setFile(f.name)
    setStep('read')
    setLines([['Dosya açılıyor…', false]])
    setProgress(null)
    try {
      const pack = await readExamFile(f, (page, total) => setProgress({ page, total }))
      if (!pack.records.length) throw new Error(pack.failedPages?.[0]?.error ?? 'Bu dosyada öğrenci sonucu bulunamadı.')
      const roster = students.data ?? (await students.refetch()).data ?? []
      const review = buildReview(pack, roster)
      const adapter = review.adapter ?? ''
      const qs = pack.records.flatMap((r) => r.questions)
      const mapped = qs.filter((q) => q.officialOutcomeCode).length
      const fixes = review.rows.filter((r) => r.match.kind === 'fixed').length
      setPublisher(ADAPTER_PUBLISHER[adapter] ?? '')
      if (name === null && review.examName) setName(review.examName)
      const base: [string, boolean][] = [
        [ADAPTER_PUBLISHER[adapter] ? `Yayınevi tanındı: ${ADAPTER_PUBLISHER[adapter]}` : 'Sayfa düzeni tanındı', true],
        [`${pack.records.length} öğrenci sayfası bulundu${review.failedPages.length ? ` · ${review.failedPages.length} sayfa tanınmadı` : ''}`, true],
        ['Netler ve puanlar okundu', true],
        [qs.length ? `Konular resmî listeyle eşleştirildi (%${Math.round((mapped / qs.length) * 1000) / 10})` : 'Bu dosyada konu (kazanım) bilgisi yok', true],
      ]
      setLines([...base, ['İsimler kontrol ediliyor…', false]])
      const src = await aiFix(review, roster)
      setFixSrc(src)
      const total = review.rows.filter((r) => r.match.kind === 'fixed').length
      setLines([...base, [total ? `${total} isim yazım hatası düzeltildi (${src.toLocaleLowerCase('tr')})` : fixes ? 'İsimler eşleştirildi' : 'Bütün isimler listede', true]])
      setRv(review)
      setTimeout(() => setStep('review'), 700)
    } catch (e) {
      setErr((e as Error).message)
      setStep('drop')
    }
  }

  async function publish() {
    if (!rv) return
    setBusy(true)
    const p = buildPayload(rv, { name: examName, publisher: publisher.trim() || null, exam_date: date, notify })
    const { error } = await supabase.rpc('publish_exam', { p })
    setBusy(false)
    if (error) return toast(error.message || 'Yayınlanamadı.', 'warn')
    setDone({ name: examName, count: p.results.length })
    setStep('done')
    toast(`${examName} yayınlandı`)
    refresh('dataset', 'exams-list', 'students')
  }

  const [del, setDel] = useState<ExamRow | null>(null)
  async function removeExam(e: ExamRow): Promise<string | null> {
    const { error } = await supabase.rpc('delete_exam', { p_exam: e.id })
    if (error) return error.message || 'Silinemedi.'
    toast(`${e.name} silindi`)
    setDel(null)
    refresh('dataset', 'exams-list', 'students', 'reports')
    return null
  }

  const reset = () => {
    setStep('drop')
    setRv(null)
    setName(null)
    setDone(null)
    setErr(null)
  }

  const idx = ['drop', 'read', 'review', 'done'].indexOf(step)
  return (
    <>
      <h1 className="hd a">Denemeler</h1>
      <ol className="steps a" style={{ ['--d' as string]: 1 }} aria-label="Adımlar">
        {STEPS.map((l, i) => (
          <li key={l} className={i === idx ? 'on' : i < idx ? 'done' : ''} aria-current={i === idx ? 'step' : undefined}>
            <span>{i < idx ? <Icon name="check" size={14} stroke={3} /> : i + 1}</span>
            {l}
          </li>
        ))}
      </ol>

      {step === 'drop' && (
        <div className="stack a" style={{ ['--d' as string]: 2 }}>
          <div className="grid2">
            <label className="field" htmlFor="upName">
              Deneme adı
              <input id="upName" value={examName} onChange={(e) => setName(e.target.value)} />
            </label>
            <label className="field" htmlFor="upDate">
              Tarih
              <input id="upDate" type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} />
            </label>
          </div>
          <label
            className={`drop ${over ? 'over' : ''}`}
            htmlFor="upFile"
            onDragOver={(e: DragEvent) => (e.preventDefault(), setOver(true))}
            onDragLeave={() => setOver(false)}
            onDrop={(e: DragEvent) => {
              e.preventDefault()
              setOver(false)
              const f = e.dataTransfer.files[0]
              if (f) start(f)
            }}
          >
            <span className="floaty" style={{ width: 62, height: 62, borderRadius: 18, background: 'var(--primary-soft)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="up" size={28} />
            </span>
            <b style={{ fontSize: 20 }}>Sonuç PDF'ini seç ya da buraya bırak</b>
            <span className="m">PDF bilgisayarında okunur; sunucuya yalnız okunan sonuçlar gider. Yayınevi otomatik tanınır.</span>
            <input
              id="upFile"
              ref={fileRef}
              type="file"
              accept="application/pdf,.pdf,.json,application/json"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) start(f)
                e.target.value = ''
              }}
            />
            <span className="btn pri" style={{ pointerEvents: 'none' }}>
              PDF seç
            </span>
          </label>
          {err && (
            <div className="card issue" role="alert">
              <span className="t">DOSYA OKUNAMADI</span>
              <b>{err}</b>
              <span className="m" style={{ fontSize: 14 }}>
                Parolasız ve metni seçilebilen bir PDF yükle. Taranmış (fotoğraf) PDF'ler okunamaz.
              </span>
            </div>
          )}
          {(import.meta.env.DEV || import.meta.env.VITE_DEMO === '1') && (
            <button
              type="button"
              className="btn"
              style={{ alignSelf: 'center' }}
              onClick={async () => {
                const res = await fetch('/ornek/ornek-deneme.json')
                start(new File([await res.blob()], 'ornek-deneme.json', { type: 'application/json' }))
              }}
            >
              Örnek dosyayla dene
            </button>
          )}
          <Dropdown title="Yüklenen denemeler" sub={`${exams.data?.exams.length ?? 0} deneme`} icon={<Icon name="doc" size={22} />} delay={3}>
            <div className="tbl">
              <table>
                <tbody>
                  {(exams.data?.exams ?? []).map((e) => {
                    return (
                      <tr key={e.id} data-testid="exam-row">
                        <td>
                          <b>{e.name}</b>
                        </td>
                        <td>{e.publisher ?? '—'}</td>
                        <td className="m">{trD(e.exam_date)}</td>
                        <td className="num">{exams.data?.count.get(e.id) ?? 0} öğrenci</td>
                        <td style={{ textAlign: 'right' }}>
                          <button className="btn sm ghost" style={{ color: 'var(--signal-ink)' }} onClick={() => setDel(e)} aria-label={`${e.name} denemesini sil`}>
                            <Icon name="trash" size={14} />
                            Sil
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <span className="m" style={{ fontSize: 12 }}>
              Yanlış yüklenen deneme silinebilir; öğrencilerin bu denemedeki sonuçları ve raporları da silinir.
            </span>
          </Dropdown>
        </div>
      )}

      {del && (
        <ConfirmDelete title="Denemeyi sil" name={del.name} onClose={() => setDel(null)} onConfirm={() => removeExam(del)}>
          <b>{del.name}</b> ({exams.data?.count.get(del.id) ?? 0} öğrenci) silinecek: bu denemenin bütün sonuçları, cevap anahtarı ve bu denemeye ait raporlar kalıcı olarak kaldırılır.
          Bu yüklemeyle açılan ve başka kaydı olmayan öğrenci kayıtları da silinir.
        </ConfirmDelete>
      )}

      {step === 'read' && (
        <section className="card a" style={{ ['--d' as string]: 1, padding: 26, display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 660 }} aria-live="polite">
          <h2 style={{ fontSize: 19 }}>{file} okunuyor</h2>
          {progress && progress.total > 1 && (
            <div className="stack" style={{ gap: 6 }}>
              <div className="prog" role="progressbar" aria-valuemin={0} aria-valuemax={progress.total} aria-valuenow={progress.page} aria-label="Sayfalar">
                <i style={{ width: `${(progress.page / progress.total) * 100}%` }} />
              </div>
              <span className="m mono" style={{ fontSize: 13 }}>
                {progress.page} / {progress.total} sayfa
              </span>
            </div>
          )}
          {lines.map(([x, ok], i) => (
            <div key={i} className="a" style={{ ['--d' as string]: i * 2 + 2, display: 'flex', gap: 12, alignItems: 'center' }}>
              <span style={{ width: 22, display: 'inline-flex', justifyContent: 'center', color: 'var(--primary)' }}>{ok ? <Icon name="check" size={18} stroke={2.6} /> : <span className="spinner" />}</span>
              {x}
            </div>
          ))}
        </section>
      )}

      {step === 'review' && rv && students.data && (
        <ReviewStep
          rv={rv}
          setRv={setRv}
          students={students.data}
          examName={examName}
          setName={setName}
          publisher={publisher}
          setPublisher={setPublisher}
          date={date}
          fixSrc={fixSrc}
          notify={notify}
          setNotify={setNotify}
          busy={busy}
          onPublish={publish}
          onCancel={reset}
        />
      )}

      {step === 'done' && done && (
        <section className="card a" style={{ ['--d' as string]: 1, padding: 34, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 14, maxWidth: 700 }}>
          <svg width="72" height="72" viewBox="0 0 72 72" className="pp" aria-hidden="true">
            <circle cx="36" cy="36" r="34" fill="var(--primary-soft)" />
            <path className="draw" pathLength={1} d="M22 37l10 10 19-21" fill="none" stroke="var(--primary)" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 500 }}>{done.name} yayınlandı</h2>
          <p className="m" style={{ fontSize: 16 }}>
            {done.count} öğrencinin sonucu profillerine işlendi{notify ? ', veli ve öğrencilere bildirim gitti' : ''}. Yanlışlık varsa "Yüklenen denemeler" listesinden silebilirsin.
          </p>
          <div className="btns">
            <button className="btn pri" onClick={() => nav('/bugun')}>
              Bugün'e dön
            </button>
            <button className="btn" onClick={reset}>
              Yeni deneme
            </button>
          </div>
        </section>
      )}
    </>
  )
}

/** Belirsiz isimler için yapay zekâ (yalnız isim listeleri gider). Yapılandırılmamışsa kural tabanlı kalır. */
async function aiFix(rv: Review, roster: Student[]): Promise<string> {
  const unknown = rv.rows.filter((r) => r.match.kind === 'unknown')
  if (!unknown.length) return 'Kural tabanlı'
  try {
    const { data, error } = await supabase.functions.invoke('ai-isim-duzelt', {
      body: { read: unknown.map((r) => r.read.name), roster: roster.map((s) => s.full_name) },
    })
    if (error || !Array.isArray(data?.matches)) return 'Kural tabanlı'
    let used = false
    for (const m of data.matches as { raw: string; match: string | null; sure: boolean }[]) {
      if (!m.match || !m.sure) continue
      const hits = roster.filter((s) => s.full_name === m.match)
      const row = unknown.find((r) => r.read.name === m.raw)
      if (hits.length !== 1 || !row) continue
      if (rv.rows.some((r) => r.choice?.kind === 'student' && r.choice.id === hits[0]!.id)) continue
      row.match = { kind: 'fixed', id: hits[0]!.id, via: 'name' }
      row.choice = { kind: 'student', id: hits[0]!.id }
      used = true
    }
    return used ? 'Yapay zekâ' : 'Kural tabanlı'
  } catch {
    return 'Kural tabanlı'
  }
}

function ReviewStep(props: {
  rv: Review
  setRv: (r: Review) => void
  students: Student[]
  examName: string
  setName: (s: string) => void
  publisher: string
  setPublisher: (s: string) => void
  date: string
  fixSrc: string
  notify: boolean
  setNotify: (b: boolean) => void
  busy: boolean
  onPublish: () => void
  onCancel: () => void
}) {
  const { rv, students } = props
  const classes = useClasses()
  const eighth = (classes.data ?? []).filter((c) => c.grade === DENEME_GRADE).map((c) => c.name)
  const left = pendingCount(rv)
  const update = (fn: (r: Review) => void) => {
    const c: Review = { ...rv, rows: rv.rows.map((r) => ({ ...r, subjectIssues: r.subjectIssues.map((i) => ({ ...i })) })), failedPages: rv.failedPages.map((f) => ({ ...f })) }
    fn(c)
    props.setRv(c)
  }
  const stu = (id: string) => students.find((s) => s.id === id)
  const fixed = rv.rows.filter((r) => r.match.kind === 'fixed')
  const unknown = rv.rows.filter((r) => r.match.kind === 'unknown')
  const withIssues = rv.rows.filter((r) => r.subjectIssues.length)
  const infos = rv.rows.filter((r) => r.notes.length && r.choice?.kind !== 'skip')
  const ready = rv.rows.filter((r) => r.choice && r.choice.kind !== 'skip' && r.subjectIssues.every((i) => i.choice)).length
  const total = useMemo(() => rv.rows.length, [rv])
  let d = 3

  return (
    <div className="cols" style={{ ['--side' as string]: '320px' }}>
      <div className="stack">
        <div className="dark a" style={{ ['--d' as string]: 1, padding: '18px 22px', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <span className="big">
            {ready}
            <span className="m" style={{ fontSize: 18 }}>
              {' '}
              / {total} hazır
            </span>
          </span>
          <span className={`chip ${left ? 'gold' : 'up'}`} data-testid="pending-chip">
            {left ? `${left} kontrol bekliyor` : 'Hepsi tamam'}
          </span>
        </div>

        {fixed.length > 0 && (
          <Dropdown title={`${props.fixSrc === 'Yapay zekâ' ? 'Yapay zekâ' : 'Sistem'} ${fixed.length} yazım hatasını düzeltti`} sub={fixed.map((r) => `${r.read.name} → ${stu((r.match as { id: string }).id)?.full_name}`).join(' · ')} icon={<Icon name="spark" size={22} />} delay={2}>
            {fixed.map((r) => (
              <div className="kv" key={r.key}>
                <span className="mono">{r.read.name}</span>
                <Icon name="right" size={16} stroke={2} />
                <b style={{ flex: 1 }}>{stu((r.match as { id: string }).id)?.full_name}</b>
                <span className="chip up">{(r.match as { via: string }).via === 'no' ? 'Okul no ile' : props.fixSrc}</span>
              </div>
            ))}
          </Dropdown>
        )}

        {unknown.map((r) => {
          const ok = !!r.choice
          const cls = (r.read.class ?? '').toLocaleUpperCase('tr').replace(/\s/g, '')
          const newCls = eighth.includes(cls) ? cls : (eighth[0] ?? `${DENEME_GRADE}/A`)
          const cands = r.match.kind === 'unknown' ? r.match.candidates : []
          return (
            <article key={r.key} className={`card issue a ${ok ? 'ok' : ''}`} style={{ ['--d' as string]: d++ }} data-testid="issue">
              <div className="kv">
                <span className="t">{ok ? '✓ ' : ''}LİSTEDE YOK</span>
                <span className="mono m" style={{ fontSize: 13 }}>
                  PDF: {r.read.name} {r.read.class ? `· ${r.read.class}` : ''} {r.read.number ? `· No ${r.read.number}` : ''} · s.{r.page}
                </span>
              </div>
              <b>{r.notes.find((n) => n.startsWith('Aynı öğrenci')) ?? 'Bu isim okul listesinde bulunamadı; güvenli bir eşleşme de yok.'}</b>
              <div className="btns">
                {cands.map((id) => (
                  <ChoiceBtn key={id} on={r.choice?.kind === 'student' && r.choice.id === id} onClick={() => update((c) => (c.rows.find((x) => x.key === r.key)!.choice = { kind: 'student', id }))}>
                    {stu(id)?.full_name} ({stu(id)?.class_name}) olarak eşleştir
                  </ChoiceBtn>
                ))}
                <ChoiceBtn on={r.choice?.kind === 'new'} onClick={() => update((c) => (c.rows.find((x) => x.key === r.key)!.choice = { kind: 'new', class_name: newCls }))}>
                  Yeni öğrenci olarak ekle ({titleCase(r.read.name)} · {newCls})
                </ChoiceBtn>
                <ChoiceBtn on={r.choice?.kind === 'skip'} onClick={() => update((c) => (c.rows.find((x) => x.key === r.key)!.choice = { kind: 'skip' }))}>
                  Bu sayfayı atla
                </ChoiceBtn>
              </div>
              <label className="field" style={{ maxWidth: 360 }}>
                Listeden başka bir öğrenci seç
                <select
                  value={r.choice?.kind === 'student' && !cands.includes(r.choice.id) ? r.choice.id : ''}
                  onChange={(e) => e.target.value && update((c) => (c.rows.find((x) => x.key === r.key)!.choice = { kind: 'student', id: e.target.value }))}
                >
                  <option value="">Seç</option>
                  {students.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.full_name} · {s.class_name}
                    </option>
                  ))}
                </select>
              </label>
            </article>
          )
        })}

        {withIssues.flatMap((r) =>
          r.choice?.kind === 'skip'
            ? []
            : r.subjectIssues.map((i) => {
                const n = i.subject === 'TUR' || i.subject === 'MAT' || i.subject === 'FEN' ? 20 : 10
                const who = r.choice?.kind === 'student' ? stu(r.choice.id)?.full_name : titleCase(r.read.name)
                const set = (v: 'fix' | 'null') => update((c) => (c.rows.find((x) => x.key === r.key)!.subjectIssues.find((x) => x.subject === i.subject)!.choice = v))
                return (
                  <article key={r.key + i.subject} className={`card issue a ${i.choice ? 'ok' : ''}`} style={{ ['--d' as string]: d++ }} data-testid="issue">
                    <div className="kv">
                      <span className="t">{i.choice ? '✓ ' : ''}SAYILAR TUTMUYOR</span>
                      <span className="mono m" style={{ fontSize: 13 }}>
                        {i.d}+{i.y}+{i.b} = {(i.d ?? 0) + (i.y ?? 0) + (i.b ?? 0)} ≠ {n}
                      </span>
                    </div>
                    <b>
                      {who} · {SUBJECT[i.subject].ad}
                    </b>
                    <span className="m" style={{ fontSize: 14 }}>
                      1. sayfadaki resmî sonuç esas alınır.{' '}
                      {i.canFix ? `Net (${i.net}) doğru ve yanlışla tutarlı; boş sayısı okunurken kaçmış görünüyor.` : 'Doğru, yanlış ve net birbiriyle tutarlı değil; düzeltme önerilemez.'}
                    </span>
                    <div className="btns">
                      {i.canFix && (
                        <ChoiceBtn on={i.choice === 'fix'} onClick={() => set('fix')}>
                          Boş = {n - (i.d ?? 0) - (i.y ?? 0)} olarak düzelt
                        </ChoiceBtn>
                      )}
                      <ChoiceBtn on={i.choice === 'null'} onClick={() => set('null')}>
                        {SUBJECT[i.subject].short} sonucunu boş bırak
                      </ChoiceBtn>
                    </div>
                  </article>
                )
              }),
        )}

        {rv.failedPages.map((f, k) => (
          <article key={`p${f.page}`} className={`card issue a ${f.skip ? 'ok' : ''}`} style={{ ['--d' as string]: d++ }} data-testid="issue">
            <div className="kv">
              <span className="t">{f.skip ? '✓ ' : ''}SAYFA OKUNAMADI</span>
              <span className="mono m" style={{ fontSize: 13 }}>
                s.{f.page}
              </span>
            </div>
            <b>{f.error}</b>
            <span className="m" style={{ fontSize: 14 }}>
              Bu sayfadaki bilgiler uydurulmaz. Bir öğrencinin sonucuysa yayınladıktan sonra o öğrenci için ayrıca kontrol et.
            </span>
            <div className="btns">
              <ChoiceBtn on={f.skip} onClick={() => update((c) => (c.failedPages[k]!.skip = true))}>
                Bu sayfayı atla
              </ChoiceBtn>
            </div>
          </article>
        ))}

        {infos.length > 0 && (
          <Dropdown title="Bilgi" sub={`${infos.length} öğrencide not var (karar gerekmez)`} icon={<Icon name="warn" size={22} />} delay={d++}>
            {infos.map((r) => (
              <div key={r.key} className="stack" style={{ gap: 2 }}>
                <b style={{ fontSize: 14 }}>{r.choice?.kind === 'student' ? stu(r.choice.id)?.full_name : titleCase(r.read.name)}</b>
                {r.notes.map((n) => (
                  <span key={n} className="m" style={{ fontSize: 13 }}>
                    {n}
                  </span>
                ))}
              </div>
            ))}
          </Dropdown>
        )}
      </div>
      <aside className="stack">
        <Dropdown title={`${props.examName}${props.publisher ? ` · ${props.publisher}` : ''}`} sub={`${trD(props.date)} · ${total} öğrenci`} icon={<Icon name="doc" size={22} />} delay={2} defaultOpen>
          <label className="field" htmlFor="rvName">
            Deneme adı
            <input id="rvName" value={props.examName} onChange={(e) => props.setName(e.target.value)} />
          </label>
          <label className="field" htmlFor="rvPub">
            Yayınevi
            <input id="rvPub" value={props.publisher} onChange={(e) => props.setPublisher(e.target.value)} placeholder="Örn. ATA Yayınları" />
          </label>
          <div className="kv">
            <span className="m">İsim düzeltme</span>
            <span>{props.fixSrc}</span>
          </div>
        </Dropdown>
        <div className="card a" style={{ ['--d' as string]: 3, padding: '6px 16px' }}>
          <Toggle on={props.notify} onClick={() => props.setNotify(!props.notify)} title="Veli ve öğrencilere haber ver" sub="Onaylı hesaplara bildirim gider" />
        </div>
        <button className={`btn pri a ${left ? '' : 'pulse'}`} style={{ ['--d' as string]: 4, minHeight: 52, fontSize: 16 }} disabled={!!left || props.busy} onClick={props.onPublish}>
          {left ? 'Önce kontrolleri bitir' : 'Yayınla'}
        </button>
        <button className="btn ghost" onClick={props.onCancel}>
          Vazgeç
        </button>
      </aside>
    </div>
  )
}

function ChoiceBtn({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" className={`btn sm ${on ? 'soft' : ''}`} aria-pressed={on} onClick={onClick}>
      {children}
    </button>
  )
}


