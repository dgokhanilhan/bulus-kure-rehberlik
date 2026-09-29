// Devamsızlık (Faz E · 0016): sınır çubukları, öğrenci devamsızlık sekmesi ve devamsızlık raporu (yazdır / PDF).
// Sınırlar ve eşikler Yönetim Merkezi → Yoklama ayarları'ndan gelir; yalnız bilgilendirmedir.
import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { ATT_TR, useAcademicYears, useAttendance, type Attendance, type AttendanceStatus } from '@/lib/data'
import { todayISO, trD, trDW } from '@/lib/format'
import { useSchoolInfo } from '@/lib/files'
import type { Student } from '@/lib/types'
import { Modal } from './Modal'
import { Icon } from './Icon'
import { useToast } from './Toast'

export interface LimitItem {
  key: 'donem1' | 'donem2' | 'yillik' | 'toplam'
  label: string
  used: number
  limit: number
  current: boolean
}
export interface AttLimits {
  year: string
  term: 1 | 2
  items: LimitItem[]
  ratio: number
  level: 'normal' | 'sari' | 'turuncu' | 'kirmizi'
  thresholds: { sari: number; turuncu: number }
}
export const LEVEL_COLOR = { normal: 'var(--primary)', sari: '#c9962e', turuncu: '#e67700', kirmizi: '#c92a2a' } as const
/** Yazı için koyu tonlar (beyaz zeminde WCAG AA kontrast). */
export const LEVEL_INK = { normal: 'var(--primary)', sari: '#7a5a12', turuncu: '#a34a00', kirmizi: '#b02525' } as const
export const LEVEL_TEXT = { normal: 'Sınırın altında', sari: 'Dikkat', turuncu: 'Sınıra yaklaştı', kirmizi: 'Sınıra ulaştı' } as const
export const gun = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1).replace('.', ','))

export function useAttendanceLimits(sid?: string | null) {
  return useQuery({
    queryKey: ['attendance_limits', sid ?? ''],
    enabled: !!sid,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('attendance_limits', { p_student: sid })
      if (error) throw error
      return data as AttLimits | null
    },
  })
}

export interface WatchRow {
  student_id: string
  full_name: string
  class_name: string
  level: AttLimits['level']
  ratio: number
  label: string
  used: number
  lim: number
}
export function useAttendanceWatchlist(enabled: boolean) {
  return useQuery({
    queryKey: ['attendance_watchlist'],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('attendance_watchlist')
      if (error) throw error
      return (data ?? []) as WatchRow[]
    },
  })
}

const levelOf = (it: LimitItem, t: AttLimits['thresholds']) => {
  const r = it.limit > 0 ? it.used / it.limit : 0
  return r >= 1 ? 'kirmizi' : r * 100 >= t.turuncu ? 'turuncu' : r * 100 >= t.sari ? 'sari' : 'normal'
}

/** Dönem / yıllık / toplam sınır çubukları. */
export function LimitBars({ l, compact }: { l: AttLimits; compact?: boolean }) {
  const items = l.items.filter((i) => i.limit > 0 && (!compact || i.current))
  if (!items.length) return <span className="m">Devamsızlık sınırı tanımlı değil.</span>
  return (
    <div className="stack" style={{ gap: 10 }} aria-label="Devamsızlık sınırları">
      {items.map((it) => {
        const lv = levelOf(it, l.thresholds)
        const left = it.limit - it.used
        return (
          <div key={it.key} data-testid="limit-bar">
            <div className="kv" style={{ fontSize: 13 }}>
              <span>
                {it.label}
                {it.current && it.key.startsWith('donem') ? ' (bu dönem)' : ''}
              </span>
              <b style={{ color: lv === 'normal' ? undefined : LEVEL_INK[lv] }}>
                {gun(it.used)}/{it.limit} gün
              </b>
            </div>
            <div style={{ height: 8, borderRadius: 99, background: 'var(--surface-sunken)', overflow: 'hidden', marginTop: 4 }} role="img" aria-label={`${it.label}: ${gun(it.used)} / ${it.limit} gün`}>
              <i style={{ display: 'block', height: '100%', width: `${Math.min(100, (it.used / it.limit) * 100)}%`, background: LEVEL_COLOR[lv] }} />
            </div>
            {lv !== 'normal' && it.current && (
              <span style={{ fontSize: 12, color: LEVEL_INK[lv], fontWeight: 600 }}>{left > 0 ? `⚠ Sınıra ${gun(left)} gün kaldı` : '⚠ Sınıra ulaştı'}</span>
            )}
          </div>
        )
      })}
      <span className="m" style={{ fontSize: 11 }}>
        Bilgilendirme amaçlıdır; kesin durum için okul yönetimiyle görüşün.
      </span>
    </div>
  )
}

/** Öğrenci dosyasındaki Devamsızlık sekmesi. */
export function DevamsizlikTab({ s }: { s: Student }) {
  const lim = useAttendanceLimits(s.id)
  const att = useAttendance({ student: s.id })
  const [report, setReport] = useState(false)
  const recs = att.data ?? []
  return (
    <div className="cols" style={{ ['--side' as string]: '360px' }}>
      <section className="card a" style={{ ['--d' as string]: 3, overflow: 'hidden' }} aria-label="Devamsızlık kayıtları">
        <div className="kv" style={{ padding: '14px 16px' }}>
          <h2 style={{ fontSize: 17 }}>Kayıtlar</h2>
          <button className="btn pri" onClick={() => setReport(true)}>
            <Icon name="doc" size={16} /> Devamsızlık raporu
          </button>
        </div>
        {recs.length ? (
          <div className="tbl">
            <table>
              <thead>
                <tr>
                  <th>Tarih</th>
                  <th>Durum</th>
                  <th>Açıklama</th>
                </tr>
              </thead>
              <tbody>
                {recs.map((a) => (
                  <tr key={a.id} data-testid="att-row">
                    <td>{trDW(a.day)}</td>
                    <td>
                      <span className={`chip ${a.status === 'devamsiz' ? 'down' : 'n'}`}>{ATT_TR[a.status]}</span>
                    </td>
                    <td className="m">{a.note ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty" style={{ margin: 16 }}>
            Devamsızlık kaydı yok.
          </div>
        )}
      </section>
      <aside className="card a" style={{ ['--d' as string]: 4, padding: 18, alignSelf: 'flex-start' }} aria-label="Devamsızlık sınırları">
        <h2 style={{ fontSize: 17, marginBottom: 10 }}>Sınırlar {lim.data ? `· ${lim.data.year}` : ''}</h2>
        {lim.data ? <LimitBars l={lim.data} /> : <span className="m">{lim.isLoading ? 'Yükleniyor…' : 'Aktif eğitim yılı tanımlı değil.'}</span>}
      </aside>
      {report && <ReportModal s={s} rows={recs} onClose={() => setReport(false)} />}
    </div>
  )
}

type Range = 'bugune' | 'donem1' | 'donem2' | 'ozel'

function ReportModal({ s, rows, onClose }: { s: Student; rows: Attendance[]; onClose: () => void }) {
  const years = useAcademicYears()
  const info = useSchoolInfo()
  const toast = useToast()
  const y = years.data?.find((x) => x.is_active)
  const today = todayISO()
  const [range, setRange] = useState<Range>('bugune')
  const [custom, setCustom] = useState({ from: y?.starts ?? today, to: today })
  const [busy, setBusy] = useState(false)
  const [from, to] = !y
    ? [custom.from, custom.to]
    : range === 'bugune'
      ? [y.starts, today]
      : range === 'donem1'
        ? [y.starts, y.term1_ends]
        : range === 'donem2'
          ? [y.term2_starts, y.ends]
          : [custom.from, custom.to]
  const list = useMemo(() => rows.filter((r) => r.day >= from && r.day <= to).sort((a, b) => a.day.localeCompare(b.day)), [rows, from, to])
  const c = (k: AttendanceStatus) => list.filter((r) => r.status === k).length
  const sum = [
    ['Toplam kayıt', list.length],
    ['Raporsuz (gelmedi)', c('devamsiz')],
    ['Raporlu', c('raporlu')],
    ['İzinli', c('izinli')],
    ['Geç kalma', c('gec')],
  ] as const
  const school = info.data?.name ?? 'Buluş Küre Koleji'

  async function pdf() {
    setBusy(true)
    try {
      const { attendancePdfBlob } = await import('@/lib/pdf')
      const blob = await attendancePdfBlob({
        school,
        student: s.full_name,
        className: s.class_name,
        schoolNo: s.school_no ?? '—',
        range: `${trD(from)} – ${trD(to)}`,
        summary: sum.map(([k, v]) => [k, String(v)]),
        rows: list.map((r) => ({ date: trDW(r.day), status: ATT_TR[r.status], note: r.note ?? '' })),
        printed: trD(today),
      })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `devamsizlik-${s.full_name.toLocaleLowerCase('tr').replace(/\s+/g, '-')}.pdf`
      a.click()
    } catch {
      toast('PDF oluşturulamadı.', 'warn')
    }
    setBusy(false)
  }

  return (
    <Modal
      title="Devamsızlık raporu"
      sub={`${s.full_name} · ${s.class_name}`}
      width={760}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={() => window.print()}>
            Yazdır
          </button>
          <button className="btn pri" onClick={pdf} disabled={busy}>
            {busy && <span className="spinner" aria-hidden="true" />} PDF indir
          </button>
        </>
      }
    >
      <div className="btns noprint" role="group" aria-label="Tarih aralığı">
        {(
          [
            ['bugune', 'Bugüne kadar'],
            ['donem1', '1. dönem'],
            ['donem2', '2. dönem'],
            ['ozel', 'Tarih seç'],
          ] as [Range, string][]
        ).map(([k, l]) => (
          <button key={k} type="button" className={`btn sm ${range === k ? 'pri' : ''}`} aria-pressed={range === k} onClick={() => setRange(k)}>
            {l}
          </button>
        ))}
      </div>
      {range === 'ozel' && (
        <div className="grid2 noprint">
          <label className="field" htmlFor="rFrom">
            Başlangıç
            <input id="rFrom" type="date" value={custom.from} onChange={(e) => setCustom((x) => ({ ...x, from: e.target.value }))} />
          </label>
          <label className="field" htmlFor="rTo">
            Bitiş
            <input id="rTo" type="date" value={custom.to} min={custom.from} onChange={(e) => setCustom((x) => ({ ...x, to: e.target.value }))} />
          </label>
        </div>
      )}
      <div className="printable stack" style={{ gap: 12 }}>
        <div className="kv print-only" style={{ borderBottom: '2px solid var(--ink)', paddingBottom: 8 }}>
          <b style={{ fontSize: 16 }}>{school} · Devamsızlık raporu</b>
          <span className="m">{trD(today)}</span>
        </div>
        <div className="kv" style={{ fontSize: 14 }}>
          <span>
            <b>{s.full_name}</b> · {s.class_name} · No {s.school_no ?? '—'}
          </span>
          <span className="m" data-testid="report-range">
            {trD(from)} – {trD(to)}
          </span>
        </div>
        <div className="btns" aria-label="Özet">
          {sum.map(([k, v]) => (
            <span key={k} className="chip n" style={{ fontSize: 13 }}>
              {k}: <b>{v}</b>
            </span>
          ))}
        </div>
        {list.length ? (
          <div className="tbl">
            <table>
              <thead>
                <tr>
                  <th>Tarih</th>
                  <th>Durum</th>
                  <th>Açıklama</th>
                </tr>
              </thead>
              <tbody>
                {list.map((r) => (
                  <tr key={r.id} data-testid="report-row">
                    <td>{trDW(r.day)}</td>
                    <td>{ATT_TR[r.status]}</td>
                    <td>{r.note ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty">Bu aralıkta devamsızlık kaydı yok.</div>
        )}
      </div>
    </Modal>
  )
}
