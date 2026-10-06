import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { fmt, indexResults, repeats, totalNet } from '@/lib/analiz'
import { useClasses, useDataset, useStudents } from '@/lib/data'
import { useGenelDataset } from '@/lib/denemeData'
import { lastExamDelta } from '@/lib/denemeGenel'
import { fold, initials } from '@/lib/format'
import { LEVEL_TR, LEVELS } from '@/lib/roles'
import { useAuth } from '@/auth/AuthProvider'

export default function OgrencilerPage() {
  const { role } = useAuth()
  // Branş öğretmeni yalnız atandığı sınıfların öğrencilerini görür (RLS, 0023); sınıf filtresi de yalnız o sınıflardan oluşur
  const scoped = role === 'brans'
  const students = useStudents()
  const dsq = useDataset()
const genel = useGenelDataset()
  const classes = useClasses()
  const nav = useNavigate()
  const [cls, setCls] = useState<string>('all')
  const [q, setQ] = useState('')

  const rows = useMemo(() => {
  const ds = dsq.data
  const gd = genel.data
  if (!ds || !students.data) return []

  const idx = indexResults(ds.results)

  return students.data.map((s) => {
    const grade = Number.parseInt(String(s.class_name ?? '').split('/')[0] ?? '', 10)

    // 8. sınıf LGS mevcut motoruyla aynen devam eder.
    if (grade === 8) {
      const L = ds.exams.at(-1)
      const P = ds.exams.at(-2)
      const a = L ? idx.get(`${L.id}|${s.id}`) : undefined
      const b = P ? idx.get(`${P.id}|${s.id}`) : undefined
      const d = a && b ? totalNet(a) - totalNet(b) : null

      return {
        s,
        net: a ? totalNet(a) : null,
        d,
        rep: repeats(ds, s.id, undefined, idx).filter((r) => r.count >= 3).length,
      }
    }

    // 5–7 ve 9–12 yeni genel deneme altyapısını kullanır.
    const studentResults = new Map(
      (gd?.results ?? [])
        .filter((r) => r.student_id === s.id)
        .map((r) => [
          r.exam_id,
          {
            totalNet: r.total_net ?? 0,
            successPct: r.success_pct,
          },
        ]),
    )

    const delta = lastExamDelta(gd?.exams ?? [], studentResults)

    return {
      s,
      net: delta?.totalNet ?? null,
      d: delta?.deltaNet ?? null,
      rep: 0,
    }
  })
}, [dsq.data, genel.data, students.data])

  const visible = new Set((students.data ?? []).map((s) => s.class_name))
  const needle = fold(q)
  const list = rows.filter(({ s }) => (cls === 'all' || s.class_name === cls) && (!needle || fold(s.full_name).includes(needle) || (s.school_no ?? '').includes(needle)))

  return (
    <>
      <div className="head a">
        <h1 className="hd">Öğrenciler</h1>
        <label className="field" style={{ minWidth: 160 }}>
          <select aria-label="Sınıf" value={cls} onChange={(e) => setCls(e.target.value)}>
            <option value="all">{scoped ? 'Tüm öğrencilerim' : 'Tüm sınıflar'}</option>
            {LEVELS.map((lv) => {
              const cs = (classes.data ?? []).filter((c) => c.level === lv && (!scoped || visible.has(c.name)))
              return cs.length ? (
                <optgroup key={lv} label={LEVEL_TR[lv]}>
                  {cs.map((c) => (
                    <option key={c.id}>{c.name}</option>
                  ))}
                </optgroup>
              ) : null
            })}
          </select>
        </label>
      </div>
      {scoped && (
        <p className="m a" style={{ fontSize: 13, margin: 0 }}>
          Yalnız ders verdiğin ya da sınıf öğretmeni olduğun sınıfların öğrencileri listelenir. Sınıf ataması Yönetim Merkezi'nden yapılır.
        </p>
      )}
      <label className="field a" style={{ ['--d' as string]: 1, maxWidth: 420 }} htmlFor="qStu">
        <span className="m" style={{ fontWeight: 500 }}>
          Ara
        </span>
        <input id="qStu" placeholder="İsim veya okul no" value={q} onChange={(e) => setQ(e.target.value)} />
      </label>
      <section className="card a" style={{ ['--d' as string]: 2, overflow: 'hidden' }}>
        {students.isLoading || dsq.isLoading || genel.isLoading ? (
          <p className="m" style={{ padding: 16 }}>
            <span className="spinner" aria-hidden="true" /> Yükleniyor…
          </p>
        ) : (
          <div className="tbl">
            <table>
              <thead>
                <tr>
                  <th>Öğrenci</th>
                  <th>Sınıf</th>
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
                        {net == null ? <span className="chip n">{s.grade === 8 && dsq.data?.exams.length ? 'Girmedi' : 'Henüz sonuç yok'}</span> : rep ? <span className="chip down">{rep} tekrar eden hata</span> : <span className="chip up">Takipte</span>}
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
            {(students.data ?? []).length ? 'Aramaya uyan öğrenci yok.' : scoped ? 'Henüz sana atanmış bir sınıf yok; öğrenci listesi atama yapılınca görünür.' : 'Öğrenci yok.'}
          </div>
        )}
      </section>
    </>
  )
}
