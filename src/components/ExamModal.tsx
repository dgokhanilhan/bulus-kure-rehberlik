import { AnalysisDisclosure } from './AnalysisDisclosure'
import { ScoreCards } from './ScoreCards'
import { SUBJECTS, fmt, subjectOf, totalNet, wrongOutcomes, outcomeSourceLabel, type Dataset, type Exam, type Result } from '@/lib/analiz'
import { pdfTopicKey } from '@/lib/pdfTopics'
import { trD } from '@/lib/format'
import { Modal } from './Modal'

/** Bir denemenin ders sonuçları ve yanlış yapılan konular (prototipteki examDetail). */
export function ExamModal({ ds, exam, result, prev, studentName, onClose, onReport }: { ds: Dataset; exam: Exam; result: Result; prev?: Result; studentName: string; onClose: () => void; onReport?: (t: 'veli' | 'ogretmen') => void }) {
  const { wrong, unreadable } = wrongOutcomes(ds, result)
  const blankTopics = new Set(result.topics?.filter(t=>t.b>0 && t.y===0).map(pdfTopicKey))
  const targets = [...wrong, ...ds.outcomes.filter(o=>blankTopics.has(o.code))]
  const missing = unreadable || (!result.outcomes_ok && !result.topics?.length && !result.kazanim)
  const missingTopicSubjects = result.topics?.length ? ds.subjects.filter(s=>result.subjects[s.code] && !result.topics!.some(t=>t.section===s.code)) : []
  const sub = [exam.publisher, trD(exam.exam_date), result.score != null ? `Puan ${fmt(result.score)}` : null, `Net ${fmt(totalNet(result), 2)}`].filter(Boolean).join(' · ')
  return (
    <Modal
      title={`${exam.name} · ${studentName}`}
      sub={sub}
      width={920}
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
      <ScoreCards score={result.score} scores={result.scores} />
      <h3 className="sec">Ders sonuçları</h3>
      <div className="tbl result-table" role="region" aria-label="Ders sonuçları" tabIndex={0}>
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
            {ds.subjects.filter((s) => ds.subjects === SUBJECTS || result.subjects[s.code] || prev?.subjects[s.code]).map((s) => {
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
      <AnalysisDisclosure title={result.topics?.length ? 'Yanlış ve boş yapılan konular' : 'Yanlış yapılan konular'} count={targets.length} countLabel={result.topics?.length ? 'konu' : 'hedef'}>
        {targets.length ? (
          <div className="outcome-groups">
            {[...new Set(targets.map(o => o.subject))].map(subject => {
              const group = targets.filter(o => o.subject === subject)
              return <details className="outcome-group" key={subject}>
                <summary><strong>{subjectOf(ds, subject).ad}</strong><span className="chip down">{group.length} konu</span></summary>
                <ul>{group.map(o => {
                  const t=result.topics?.find(t=>pdfTopicKey(t)===o.code)
                  return <li key={o.code}><span>{o.title}</span><small className="m">{outcomeSourceLabel(o)}{t && ` · ${t.n} soru · ${t.d} doğru · ${t.y} yanlış · ${t.b} boş`}</small></li>
                })}</ul>
              </details>
            })}
          </div>
        ) : <p className="m">{missing ? 'Konu analizi henüz tamamlanmadı.' : result.topics?.length ? 'Okunan konu analizinde yanlış veya boş yok.' : 'Güvenilir konu verisinde yanlış yok.'}</p>}
        {missing && (
          <span className="m" style={{ fontSize: 13 }}>
            Bu denemenin bazı konu bilgileri okunamadı ya da resmî listeyle eşleşmedi; bunlar tahmin edilmez.
          </span>
        )}
        {!!missingTopicSubjects.length && <p className="m">{missingTopicSubjects.map(s=>s.ad).join(', ')}: konu tablosu okunamadı veya ders toplamlarıyla uyuşmadı. Bu derslerin konu analizi eklenmedi; ders sonuçları korundu.</p>}
      </AnalysisDisclosure>
    </Modal>
  )
}
