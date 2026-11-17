import { useMemo, useState } from 'react'
import { type BoardMark, type BoardStudent, type DailyBoardDraft } from '@/lib/akilliYoklama'

const MARKS: { value: BoardMark; label: string }[] = [
  { value: 'geldi', label: 'Geldi' },
  { value: 'devamsiz', label: 'Gelmedi' },
  { value: 'gec', label: 'Geç geldi' },
  { value: 'izinli', label: 'İzinli' },
  { value: 'raporlu', label: 'Raporlu' },
]

/**
 * Akıllı tahta için bağımsız, dokunmatik günlük yoklama ekranı.
 * Bilerek ağ erişimi, yerel saklama ve doğrulama içermez.
 * onReview yalnızca tamamlanmış TASLAĞI üst bileşene iletir.
 * Sunucu kimlik + TOTP doğrulaması ve atomik kayıt eklenene dek üretimde kullanılmamalıdır.
 */
export function AkilliYoklamaTahta({
  classId,
  className,
  day,
  students,
  onReview,
}: {
  classId: string
  className: string
  day: string
  students: BoardStudent[]
  onReview: (draft: DailyBoardDraft) => void
}) {
  const [marks, setMarks] = useState<Record<string, BoardMark>>({})
  const [review, setReview] = useState(false)
  const sorted = useMemo(() => [...students].sort((a, b) => a.full_name.localeCompare(b.full_name, 'tr')), [students])
  const selected = sorted.filter((s) => marks[s.id])
  const count = (status: BoardMark) => selected.filter((s) => marks[s.id] === status).length
  const complete = sorted.length > 0 && selected.length === sorted.length && sorted.every((s) => s.class_id === classId)
  const setMark = (id: string, status: BoardMark) => {
    setReview(false)
    setMarks((old) => ({ ...old, [id]: status }))
  }
  const summary = MARKS.map((m) => ({ ...m, count: count(m.value) }))
  return (
    <section aria-label="BK Akıllı Yoklama" style={{ maxWidth: 1100, margin: 'auto', padding: 24, fontFamily: 'inherit' }}>
      <header style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
        <div>
          <div style={{ fontSize: 14, opacity: 0.75 }}>Buluş Küre Koleji</div>
          <h1 style={{ fontSize: 30, margin: '4px 0' }}>BK Akıllı Yoklama</h1>
          <strong>{className} · {day}</strong>
        </div>
        <div aria-live="polite" style={{ fontSize: 20, fontWeight: 700 }}>{selected.length} / {sorted.length} işaretlendi</div>
      </header>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, margin: '22px 0' }} aria-label="Yoklama özeti">
        {summary.map((m) => (
          <div key={m.value} style={{ border: '1px solid #a5abb3', borderRadius: 12, padding: 14, minWidth: 130 }}>
            <div style={{ fontSize: 13 }}>{m.label}</div>
            <strong style={{ fontSize: 26 }}>{m.count}</strong>
          </div>
        ))}
      </div>
      <div style={{ display: 'grid', gap: 12 }}>
        {sorted.map((student, i) => (
          <div key={student.id} style={{ border: '1px solid #b6bcc3', borderRadius: 14, padding: 16, display: 'grid', gap: 10 }}>
            <strong style={{ fontSize: 19 }}>{i + 1}. {student.full_name}</strong>
            <div role="group" aria-label={student.full_name + ' yoklama durumu'} style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {MARKS.map((m) => (
                <button
                  key={m.value}
                  type="button"
                  aria-pressed={marks[student.id] === m.value}
                  onClick={() => setMark(student.id, m.value)}
                  style={{
                    minHeight: 52, minWidth: 120, padding: '10px 16px', borderRadius: 10, cursor: 'pointer',
                    border: '2px solid ' + (marks[student.id] === m.value ? '#185b50' : '#a5abb3'),
                    background: marks[student.id] === m.value ? '#185b50' : 'transparent',
                    color: marks[student.id] === m.value ? 'white' : 'inherit', fontSize: 16, fontWeight: 600,
                  }}
                >{m.label}</button>
              ))}
            </div>
          </div>
        ))}
      </div>
      <footer style={{ marginTop: 24, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <button
          type="button"
          disabled={!complete}
          onClick={() => setReview(true)}
          style={{ minHeight: 56, padding: '12px 22px', borderRadius: 12, fontSize: 18, fontWeight: 700, cursor: complete ? 'pointer' : 'not-allowed' }}
        >Yoklamayı gözden geçir</button>
        {!complete && <span role="status">Kaydetmeden önce her öğrenciyi işaretleyin.</span>}
      </footer>
      {review && complete && (
        <div role="dialog" aria-modal="true" aria-label="Yoklama özeti ve onay" style={{ marginTop: 20, border: '2px solid #185b50', borderRadius: 16, padding: 22 }}>
          <h2>Yoklama özeti</h2>
          <p>{className} · {day} · {sorted.length} öğrenci</p>
          {summary.map((m) => <p key={m.value}>{m.label}: <b>{m.count}</b></p>)}
          <p>Bu işlem henüz kaydetmez. Öğretmen kimliği ve Google Authenticator doğrulaması sonraki güvenli adımda yapılacaktır.</p>
          <button type="button" onClick={() => setReview(false)} style={{ minHeight: 48, marginRight: 12 }}>Düzenlemeye dön</button>
          <button
            type="button"
            onClick={() => { setReview(false); onReview({ class_id: classId, day, selections: sorted.map((s) => ({ student_id: s.id, status: marks[s.id] })) }) }}
            style={{ minHeight: 48 }}
          >Taslağı doğrulama adımına ilet</button>
        </div>
      )}
    </section>
  )
}
