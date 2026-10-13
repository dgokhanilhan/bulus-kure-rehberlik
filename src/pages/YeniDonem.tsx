import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { AcademicYear } from '@/lib/data'
import { Modal } from '@/components/Modal'
import { useToast } from '@/components/Toast'
import { HW_TR } from '@/lib/data'

type Preview = { source: string; target: string; counts: Record<string, number>; promoted: number; graduates: number }
const LABELS: Record<string, string> = {
  students: 'Öğrenciler',
  classes: 'Sınıflar',
  exams: 'Denemeler',
  exam_results: 'Deneme sonuçları',
  homework: 'Ödevler',
  homework_students: 'Ödev kontrolleri',
  tasks: 'Görevler',
  reports: 'Raporlar',
  attendance: 'Yoklama',
  meetings: 'Görüşmeler',
  notes: 'Notlar',
  calendar_events: 'Takvim etkinlikleri',
  teaching_assignments: 'Ders atamaları',
  timetable: 'Ders programı',
  announcements: 'Duyurular',
  conversations: 'Yazışmalar',
  messages: 'Mesajlar',
  meals: 'Yemek kayıtları',
  teacher_duties: 'Nöbet kayıtları',
  study_sessions: 'Etütler',
  attachments: 'Dosya bilgileri',
  notifications: 'Bildirimler',
  profiles: 'Kullanıcı bilgileri',
  courses: 'Dersler',
  parent_links: 'Veli bağlantıları',
  exam_questions: 'Deneme soru anahtarları',
  exam_items: 'Deneme kazanım bağlantıları',
  exam_imports: 'Deneme aktarım kayıtları',
  report_recipients: 'Rapor alıcıları',
  attendance_alerts: 'Yoklama uyarıları',
  gallery_albums: 'Galeri albümleri',
  gallery_media: 'Galeri dosyaları',
  scholarship_exams: 'Bursluluk sınavları',
  scholarship_applications: 'Bursluluk başvuruları',
  scholarship_sessions: 'Bursluluk oturumları',
  scholarship_session_quotas: 'Bursluluk kontenjanları',
}
export function YearTransition({ year, onClose }: { year: AcademicYear; onClose: () => void }) {
  const qc = useQueryClient(),
    toast = useToast()
  const [confirmation, setConfirmation] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('')
  const preview = useQuery({
    queryKey: ['year-transition-preview', year.id],
    queryFn: async () => {
      const r = await supabase.rpc('preview_year_transition', { p_target: year.id })
      if (r.error) throw r.error
      return r.data as Preview
    },
  })
  const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
  const tooEarly = today < year.starts
  async function start() {
    if (tooEarly || !preview.data || confirmation !== year.name) return
    setBusy(true)
    setError('')
    const r = await supabase.rpc('start_next_academic_year', { p_target: year.id, p_confirm: confirmation })
    setBusy(false)
    if (r.error) {
      setError(r.error.message)
      return
    }
    qc.clear()
    toast(`${year.name} başladı; önceki dönem arşivlendi.`)
    onClose()
  }
  return (
    <Modal
      title={`${year.name} yeni dönemi başlat`}
      width={720}
      onClose={busy ? () => {} : onClose}
      footer={
        <>
          <button className="btn" disabled={busy} onClick={onClose}>
            Vazgeç
          </button>
          <button className="btn warn" disabled={busy || tooEarly || !preview.data || confirmation !== year.name} onClick={start}>
            Arşivle ve yeni dönemi başlat
          </button>
        </>
      }
    >
      <p>
        Bu işlem şu anki dönemi kapatır. Eski dönem kayıtları yöneticiye özel arşivde korunur; yeni dönemde deneme, ödev, görev, rapor, yoklama, görüşme ve
        diğer günlük kayıtlar boş başlar. Kullanıcı hesapları, veli bağlantıları, ders/kazanım katalogları ve okul ayarları korunur. Ders atamaları, program ve
        nöbetler yeniden belirlenir. Galeri ve bursluluk kendi eğitim yılı/tarih arşivlerinde korunur. Mezun öğrencilerin ve okulda başka aktif çocuğu kalmayan
        velilerin hesapları pasife alınır; hesaplar silinmez. Öğretmen/yönetici rolleri ve diğer aktif çocukları olan veliler korunur.
      </p>
      {tooEarly && (
        <p className="err" role="alert">
          Yeni dönemin başlangıç tarihi ({year.starts}) henüz gelmedi. Mevcut dönem korunuyor; bu işlem çalıştırılamaz.
        </p>
      )}
      {preview.isLoading && <p>Önizleme hazırlanıyor…</p>}
      {preview.isError && (
        <p className="err" role="alert">
          Önizleme alınamadı: {preview.error.message}
        </p>
      )}
      {preview.data && (
        <>
          <p>
            <b>
              {preview.data.source} → {preview.data.target}
            </b>{' '}
            · {preview.data.promoted} öğrencinin sınıfı 1 artacak; {preview.data.graduates} öğrenci (8 ve 12. sınıflar) mezun arşivine alınacak. Öğrenciler ve
            mevcut dönemin sınıfları arşivde saklanır.
          </p>
          <div className="tbl" tabIndex={0} role="region" aria-label="Arşivlenecek kayıtların özeti">
            <table>
              <thead>
                <tr>
                  <th>Arşivlenecek kayıt</th>
                  <th>Adet</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(preview.data.counts)
                  .filter(([k]) => LABELS[k])
                  .map(([k, n]) => (
                    <tr key={k}>
                      <td>{LABELS[k]}</td>
                      <td>{n}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      <label className="field">
        Onay için {year.name} yaz
        <input value={confirmation} onChange={(e) => setConfirmation(e.target.value)} autoComplete="off" disabled={tooEarly || busy} />
      </label>
      {error && (
        <p className="err" role="alert">
          {error}
        </p>
      )}
    </Modal>
  )
}
export function YearArchives() {
  const toast = useToast()
  const [selected, setSelected] = useState<string | null>(null)
  const archives = useQuery({
    queryKey: ['year-archives'],
    queryFn: async () => {
      const r = await supabase
        .from('academic_year_archives')
        .select('id,created_at,counts,source_year:academic_years!source_year_id(name),target_year:academic_years!target_year_id(name)')
        .order('created_at', { ascending: false })
      if (r.error) throw r.error
      return r.data as unknown as {
        id: string
        created_at: string
        counts: Record<string, number>
        source_year: { name: string }
        target_year: { name: string }
      }[]
    },
  })
  const detail = useQuery({
    queryKey: ['year-archive', selected],
    enabled: !!selected,
    queryFn: async () => {
      const r = await supabase.rpc('read_academic_year_archive', { p_archive: selected! })
      if (r.error) throw r.error
      return r.data as Record<string, unknown[]>
    },
  })
  const [category, setCategory] = useState('students')
  async function download() {
    if (!detail.data) return
    const raw = await supabase.from('academic_year_archives').select('data').eq('id', selected!).single()
    if (raw.error) return toast('Arşiv indirilemedi.', 'warn')
    const url = URL.createObjectURL(new Blob([JSON.stringify(raw.data.data, null, 2)], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `donem-arsivi-${selected}.json`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  return (
    <section className="card stack" style={{ padding: 20 }}>
      <h3>Geçmiş dönem arşivi</h3>
      <p className="m">
        Arşiv yalnız iki adımlı doğrulamayı tamamlamış okul yöneticilerine açıktır. Öğrencileri ve önceki dönemin kayıtlarını buradan inceleyebilirsin; geçmiş
        kayıtlar yeni dönemle karışmaz.
      </p>
      {archives.isError ? (
        <p className="err">Arşiv listesi yüklenemedi.</p>
      ) : !archives.data?.length ? (
        <p className="m">Henüz dönem geçişi yapılmadı; mevcut dönem kayıtları devam ediyor.</p>
      ) : (
        archives.data.map((a) => (
          <button key={a.id} className="btn" onClick={() => setSelected(a.id)}>
            {a.source_year.name} arşivi · {a.counts.students ?? 0} öğrenci
          </button>
        ))
      )}
      {selected && (
        <Modal
          title="Geçmiş dönem arşivi"
          width={900}
          onClose={() => setSelected(null)}
          footer={
            <>
              <button className="btn" onClick={() => setSelected(null)}>
                Kapat
              </button>
              <button className="btn" disabled={!detail.data} onClick={download}>
                Arşivi indir (JSON)
              </button>
            </>
          }
        >
          {detail.isLoading ? (
            <p>Arşiv yükleniyor…</p>
          ) : detail.isError ? (
            <p className="err">Arşiv yüklenemedi.</p>
          ) : (
            <>
              <label className="field">
                Kayıt grubu
                <select aria-label="Kayıt grubu" value={category} onChange={(e) => setCategory(e.target.value)}>
                  {Object.keys(detail.data ?? {}).map((k) => (
                    <option key={k} value={k}>
                      {LABELS[k] ?? k} ({detail.data?.[k]?.length ?? 0})
                    </option>
                  ))}
                </select>
              </label>
              <ArchiveRows data={detail.data ?? {}} category={category} />
            </>
          )}
        </Modal>
      )}
    </section>
  )
}

function ArchiveRows({ data, category }: { data: Record<string, unknown[]>; category: string }) {
  const [limit, setLimit] = useState(50)
  useEffect(() => setLimit(50), [category])
  const records = (data[category] ?? []) as Record<string, unknown>[]
  const related = new Map<string, Record<string, unknown>>()
  for (const key of ['students', 'profiles', 'classes', 'courses', 'exams', 'homework', 'scholarship_exams'])
    for (const row of (data[key] ?? []) as Record<string, unknown>[]) if (typeof row.id === 'string') related.set(row.id, row)
  const name = (id: unknown) => {
    const r = related.get(String(id))
    return r ? String(r.full_name ?? r.name ?? r.title ?? '') : ''
  }
  const bodyLabels: Record<string, string> = {
    genel: 'Genel değerlendirme',
    guclu: 'Güçlü yönler',
    gelisim: 'Gelişim alanları',
    oneriler: 'Çalışma önerileri',
    mentor: 'Mentör değerlendirmesi',
    rehber: 'Rehberlik değerlendirmesi',
    toplanti: 'Toplantı gündemi',
  }
  if (!records.length) return <p className="m">Bu grupta kayıt yok.</p>
  return (
    <div className="stack" style={{ maxHeight: 440, overflow: 'auto' }} tabIndex={0} role="region" aria-label="Arşiv kayıtları">
      {records.slice(0, limit).map((r, i) => {
        const student = related.get(String(r.student_id)),
          exam = name(r.exam_id),
          course = name(r.course_id),
          who = name(r.author_id ?? r.created_by ?? r.teacher_id ?? r.parent_id)
        const title = String(
          r.full_name ??
            r.name ??
            r.title ??
            r.topic ??
            r.file_name ??
            r.subject ??
            (exam || course || name(r.homework_id) || student?.full_name || `Kayıt ${i + 1}`),
        )
        const date = String(r.day ?? r.exam_date ?? r.assigned_on ?? r.starts_on ?? r.session_date ?? r.starts_at ?? r.created_at ?? r.updated_at ?? '')
        const status =
          typeof r.status === 'string'
            ? ((HW_TR as Record<string, string>)[r.status] ??
              (
                { devamsiz: 'Devamsız', gec: 'Geç', raporlu: 'Raporlu', taslak: 'Taslak', sent: 'Gönderildi', yayinda: 'Yayında', arsiv: 'Arşiv' } as Record<
                  string,
                  string
                >
              )[r.status] ??
              r.status)
            : ''
        return (
          <article className="card stack" style={{ padding: 14, gap: 6 }} key={String(r.id ?? i)}>
            <b>{title}</b>
            <span className="m">
              {[
                student?.full_name,
                student?.class_name,
                r.class_name,
                name(r.class_id),
                course,
                who,
                date && Number.isFinite(Date.parse(date))
                  ? new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', dateStyle: 'medium' }).format(new Date(date))
                  : '',
                status,
              ]
                .filter(Boolean)
                .join(' · ')}
            </span>
            {typeof r.school_no === 'string' && <span>Okul no: {r.school_no}</span>}
            {typeof r.score === 'number' && <span>Puan: {r.score.toLocaleString('tr-TR')}</span>}
            {typeof r.total_net === 'number' && <span>Net: {r.total_net.toLocaleString('tr-TR')}</span>}
            {['description', 'note', 'items', 'text', 'topics', 'reply', 'rehber'].map((k) =>
              typeof r[k] === 'string' && r[k] ? (
                <p key={k} style={{ whiteSpace: 'pre-wrap', margin: 0 }}>
                  {String(r[k])}
                </p>
              ) : null,
            )}
            {typeof r.body === 'string' ? (
              <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{r.body}</p>
            ) : r.body && typeof r.body === 'object' ? (
              Object.entries(r.body)
                .filter(([k, v]) => bodyLabels[k] && typeof v === 'string' && v)
                .map(([k, v]) => (
                  <div key={k}>
                    <strong>{bodyLabels[k]}</strong>
                    <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{String(v)}</p>
                  </div>
                ))
            ) : null}
            {typeof r.q_no === 'number' && (
              <span>
                Soru: {r.q_no} · Doğru cevap: {String(r.correct_answer ?? '—')}
              </span>
            )}
          </article>
        )
      })}
      {records.length > limit && (
        <button className="btn" onClick={() => setLimit((n) => n + 50)}>
          Sonraki 50 kaydı göster ({limit}/{records.length})
        </button>
      )}
    </div>
  )
}
