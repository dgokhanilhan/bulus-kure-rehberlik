// Herkese açık bursluluk sınavı başvuru formu (/bursluluk, giriş gerekmez) · Faz G (0018).
// Yazma yalnız apply_scholarship() ile; tarih, sınıf seviyesi, kontenjan, tekrar ve kısa sürede çok başvuru sunucuda denetlenir.
import { useState, type FormEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase, SCHOOL_SLUG } from '@/lib/supabase'
import { KVKK_VERSION } from '@/lib/kvkk'
import { trD, trDW } from '@/lib/format'
import { useSchoolInfo } from '@/lib/files'
import { Icon } from '@/components/Icon'

interface OpenExam {
  id: string
  name: string
  exam_date: string
  starts_at: string | null
  ends_at: string | null
  grades: number[]
  location: string | null
  description: string | null
  apply_until: string
  full: boolean
}

export default function BurslulukBasvuru() {
  const info = useSchoolInfo()
  const exams = useQuery({
    queryKey: ['public-scholarship'],
    queryFn: async () => ((await supabase.rpc('public_scholarship_exams', { p_slug: SCHOOL_SLUG })).data ?? []) as OpenExam[],
  })
  const [f, setF] = useState({ exam_id: '', student_name: '', grade: '', current_school: '', parent_name: '', phone: '', email: '', consent: false })
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<{ code: string; exam: string; exam_date: string } | null>(null)
  const list = exams.data ?? []
  const exam = list.find((e) => e.id === (f.exam_id || list[0]?.id))
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF((x) => ({ ...x, [k]: e.target.value }))

  async function submit(e: FormEvent) {
    e.preventDefault()
    setErr(null)
    if (!exam) return setErr('Sınav seç.')
    if (f.student_name.trim().length < 3 || f.parent_name.trim().length < 3) return setErr('Öğrenci ve veli adını yaz.')
    if (!f.grade) return setErr('Sınıf seviyesini seç.')
    if (f.phone.replace(/\D/g, '').length < 10) return setErr('Telefon numarasını yaz (ör. 0532 123 45 67).')
    if (f.email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(f.email.trim())) return setErr('E-posta geçersiz.')
    if (!f.consent) return setErr('Aydınlatma metnini onayla.')
    setBusy(true)
    const { data, error } = await supabase.rpc('apply_scholarship', {
      p_slug: SCHOOL_SLUG,
      p: { exam_id: exam.id, student_name: f.student_name, grade: Number(f.grade), current_school: f.current_school, parent_name: f.parent_name, phone: f.phone, email: f.email, consent_version: KVKK_VERSION },
    })
    setBusy(false)
    if (error) return setErr(error.message)
    setDone(data as { code: string; exam: string; exam_date: string })
  }

  return (
    <main className="view" style={{ maxWidth: 720, margin: '0 auto' }}>
      <div className="stack a" style={{ gap: 4 }}>
        <span className="m" style={{ fontWeight: 500 }}>
          {info.data?.name ?? 'Buluş Küre Koleji'}
        </span>
        <h1 className="hd">Bursluluk sınavı başvurusu</h1>
      </div>
      {done ? (
        <section className="card a" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-start' }} aria-label="Başvuru alındı">
          <span className="chip up">
            <Icon name="check" size={14} stroke={2.4} /> Başvurun alındı
          </span>
          <h2 style={{ fontSize: 20 }}>{done.exam}</h2>
          <p style={{ margin: 0 }}>
            Sınav tarihi: <b>{trDW(done.exam_date)}</b>
          </p>
          <p style={{ margin: 0 }}>
            Başvuru numaran: <b className="mono" style={{ fontSize: 18 }} data-testid="application-code">{done.code}</b>
          </p>
          <p className="m" style={{ margin: 0 }}>
            Bu numarayı sakla. Sınav salonu ve saati okul tarafından telefonla ya da e-postayla bildirilecek.
          </p>
          <button className="btn" onClick={() => location.reload()}>
            Yeni başvuru
          </button>
        </section>
      ) : exams.isLoading ? (
        <p className="m">
          <span className="spinner" aria-hidden="true" /> Yükleniyor…
        </p>
      ) : !list.length ? (
        <div className="empty a">Şu anda başvuruya açık bursluluk sınavı yok.</div>
      ) : (
        <form className="card a stack" style={{ padding: 20, gap: 14 }} noValidate onSubmit={submit} aria-label="Başvuru formu">
          <label className="field" htmlFor="bExam">
            Sınav
            <select id="bExam" value={exam?.id ?? ''} onChange={set('exam_id')}>
              {list.map((e) => (
                <option key={e.id} value={e.id} disabled={e.full}>
                  {e.name} · {trD(e.exam_date)}
                  {e.full ? ' (kontenjan doldu)' : ''}
                </option>
              ))}
            </select>
          </label>
          {exam && (
            <div className="m" style={{ fontSize: 13 }}>
              {trDW(exam.exam_date)}
              {exam.starts_at ? ` · ${exam.starts_at.slice(0, 5)}${exam.ends_at ? `–${exam.ends_at.slice(0, 5)}` : ''}` : ''}
              {exam.location ? ` · ${exam.location}` : ''} · Son başvuru: {trD(exam.apply_until)}
              {exam.description && <p style={{ margin: '6px 0 0', whiteSpace: 'pre-line' }}>{exam.description}</p>}
            </div>
          )}
          <div className="grid2">
            <label className="field" htmlFor="bName">
              Öğrencinin adı soyadı
              <input id="bName" value={f.student_name} onChange={set('student_name')} autoComplete="off" maxLength={80} />
            </label>
            <label className="field" htmlFor="bGrade">
              Şu anki sınıfı
              <select id="bGrade" value={f.grade} onChange={set('grade')}>
                <option value="">Seç</option>
                {(exam?.grades ?? []).map((g) => (
                  <option key={g} value={g}>
                    {g}. sınıf
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="field" htmlFor="bSchool">
            Okulu (isteğe bağlı)
            <input id="bSchool" value={f.current_school} onChange={set('current_school')} maxLength={150} />
          </label>
          <div className="grid2">
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
          <button className="btn pri" type="submit" style={{ minHeight: 50, fontSize: 16 }} disabled={busy || !!exam?.full}>
            {busy && <span className="spinner" aria-hidden="true" />} Başvur
          </button>
        </form>
      )}
    </main>
  )
}
