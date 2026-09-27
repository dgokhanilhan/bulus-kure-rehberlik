import { SUBJECT, SUBJECTS, fmt, totalNet, wrongOutcomes, type Dataset, type Exam, type Result } from '@/lib/analiz'
import { trD } from '@/lib/format'
import { Modal } from './Modal'

/** Bir denemenin ders sonuçları ve yanlış yapılan konular (prototipteki examDetail). */
export function ExamModal({ ds, exam, result, prev, studentName, onClose, onReport }: { ds: Dataset; exam: Exam; result: Result; prev?: Result; studentName: string; onClose: () => void; onReport?: (t: 'veli' | 'ogretmen') => void }) {
  const { wrong, unreadable } = wrongOutcomes(ds, result)
  const sub = [exam.publisher, trD(exam.exam_date), result.score != null ? `Puan ${fmt(result.score)}` : null, `Net ${fmt(totalNet(result), 2)}`].filter(Boolean).join(' · ')
  return (
    <Modal
      title={`${exam.name} · ${studentName}`}
      sub={sub}
      width={720}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Kapat
          </button>
          {onReport && (
            <>
              <button className="btn" onClick={() => onReport('ogretmen')}>
                Öğretmen raporu
              </button>
              <button className="btn soft" onClick={() => onReport('veli')}>
                Veli raporu
              </button>
            </>
          )}
        </>
      }
    >
      <div className="tbl">
        <table>
          <thead>
            <tr>
              <th>Ders</th>
              <th className="num">D</th>
              <th className="num">Y</th>
              <th className="num">B</th>
              <th className="num">Net</th>
              <th className="num">Önceki</th>
            </tr>
          </thead>
          <tbody>
            {SUBJECTS.map((s) => {
              const q = result.subjects[s.code]
              const p = prev?.subjects[s.code]
              return (
                <tr key={s.code}>
                  <td>{s.ad}</td>
                  <td className="num">{q?.d ?? '—'}</td>
                  <td className="num">{q?.y ?? '—'}</td>
                  <td className="num">{q?.b ?? '—'}</td>
                  <td className="num">
                    <b>{q ? fmt(q.net, 2) : '—'}</b>
                  </td>
                  <td className="num m">{p ? fmt(p.net, 2) : '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="stack" style={{ gap: 6 }}>
        <span className="label">Yanlış yapılan konular</span>
        {wrong.length ? (
          <div className="btns">
            {wrong.map((o) => (
              <span className="chip down" key={o.code}>
                {SUBJECT[o.subject].short} · {o.title}
              </span>
            ))}
          </div>
        ) : (
          <span className="m">Güvenilir konu verisinde yanlış yok.</span>
        )}
        {unreadable && (
          <span className="m" style={{ fontSize: 13 }}>
            Bu denemenin bazı konu bilgileri okunamadı; bunlar tahmin edilmez.
          </span>
        )}
      </div>
    </Modal>
  )
}
