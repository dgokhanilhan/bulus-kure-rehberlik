import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { fmt, indexResults, repeats, totalNet } from '@/lib/analiz'
import { useDataset, useStudents } from '@/lib/data'
import { fold, initials } from '@/lib/format'
import { SUBE } from '@/lib/roles'
import { Seg } from '@/components/Indicator'

export default function OgrencilerPage() {
  const students = useStudents()
  const dsq = useDataset()
  const nav = useNavigate()
  const [cls, setCls] = useState<string>('all')
  const [q, setQ] = useState('')

  const rows = useMemo(() => {
    const ds = dsq.data
    if (!ds || !students.data) return []
    const idx = indexResults(ds.results)
    const L = ds.exams.at(-1)
    const P = ds.exams.at(-2)
    return students.data.map((s) => {
      const a = L ? idx.get(`${L.id}|${s.id}`) : undefined
      const b = P ? idx.get(`${P.id}|${s.id}`) : undefined
      const d = a && b ? totalNet(a) - totalNet(b) : null
      return { s, net: a ? totalNet(a) : null, d, rep: repeats(ds, s.id, undefined, idx).filter((r) => r.count >= 3).length }
    })
  }, [dsq.data, students.data])

  const needle = fold(q)
  const list = rows.filter(({ s }) => (cls === 'all' || s.class_name === cls) && (!needle || fold(s.full_name).includes(needle) || (s.school_no ?? '').includes(needle)))

  return (
    <>
      <div className="head a">
        <h1 className="hd">Öğrenciler</h1>
        <Seg label="Şube" value={cls} onChange={setCls} options={[['all', 'Tümü'], ...SUBE.map((c) => [c, c] as const)]} />
      </div>
      <label className="field a" style={{ ['--d' as string]: 1, maxWidth: 420 }} htmlFor="qStu">
        <span className="m" style={{ fontWeight: 500 }}>
          Ara
        </span>
        <input id="qStu" placeholder="İsim veya okul no" value={q} onChange={(e) => setQ(e.target.value)} />
      </label>
      <section className="card a" style={{ ['--d' as string]: 2, overflow: 'hidden' }}>
        {students.isLoading || dsq.isLoading ? (
          <p className="m" style={{ padding: 16 }}>
            <span className="spinner" aria-hidden="true" /> Yükleniyor…
          </p>
        ) : (
          <div className="tbl">
            <table>
              <thead>
                <tr>
                  <th>Öğrenci</th>
                  <th>Şube</th>
                  <th className="num">Son net</th>
                  <th className="num">Değişim</th>
                  <th>Durum</th>
                </tr>
              </thead>
              <tbody>
                {list.map(({ s, net, d, rep }) => {
                  const open = () => nav(`/ogrenciler/${s.id}`)
                  return (
                    <tr
                      key={s.id}
                      className="click"
                      tabIndex={0}
                      onClick={open}
                      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), open())}
                      aria-label={`${s.full_name} dosyası`}
                    >
                      <td>
                        <span style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                          <span className="av s" style={{ width: 34, height: 34, fontSize: 12 }}>
                            {initials(s.full_name)}
                          </span>
                          <b>{s.full_name}</b>
                          <span className="m mono" style={{ fontSize: 12 }}>
                            {s.school_no}
                          </span>
                        </span>
                      </td>
                      <td>{s.class_name}</td>
                      <td className="num">{net != null ? fmt(net, 2) : '—'}</td>
                      <td className="num" style={{ color: d == null ? 'var(--ink-muted)' : d < -1 ? 'var(--signal)' : d > 1 ? 'var(--primary)' : 'var(--ink-muted)', fontWeight: 600 }}>
                        {d == null ? '—' : `${d > 0 ? '↑ ' : d < 0 ? '↓ ' : ''}${fmt(Math.abs(d))}`}
                      </td>
                      <td>
                        {net == null ? <span className="chip n">Girmedi</span> : rep ? <span className="chip down">{rep} tekrar eden hata</span> : <span className="chip up">Takipte</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        {!students.isLoading && !list.length && (
          <div className="empty" style={{ margin: 16 }}>
            Aramaya uyan öğrenci yok.
          </div>
        )}
      </section>
    </>
  )
}
