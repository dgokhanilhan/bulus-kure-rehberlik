// Ana sayfa (Faz H · 0019): rol başına kartlar; hangi kartın görüneceği ve sırası Yönetim Merkezi → Ana sayfa düzeni'nden.
// Kapalı modülün kartı gösterilmez. Veriler RLS'ten geçer: kişi yalnız görebildiğini görür.
import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase, SCHOOL_SLUG } from '@/lib/supabase'
import { useAuth } from '@/auth/AuthProvider'
import {
  EVENT_COLOR,
  EVENT_TR,
  MEAL_TR,
  useAnnouncements,
  useBellTimes,
  useCalendar,
  useClasses,
  useConversations,
  useCourses,
  useDataset,
  useHomework,
  useHomeworkProgress,
  useHomeworkRows,
  useMeals,
  useModules,
  useSettings,
  useStudents,
  useTimetable,
} from '@/lib/data'
import { fmt, indexResults, studentExams, totalNet } from '@/lib/analiz'
import { addDays, isoDow, localDate, todayISO, todayLong, trD, trDW } from '@/lib/format'
import type { Modules } from '@/lib/roles'
import type { Student } from '@/lib/types'
import { LimitBars, useAttendanceLimits, useAttendanceWatchlist, LEVEL_INK, gun } from '@/components/Devamsizlik'
import { Seg } from '@/components/Indicator'
import { Icon } from '@/components/Icon'
import { examTrack } from '@/lib/roles'

/** 'yonetim': yöneticinin Bugün ekranındaki yan kartlar (0024). */
export type PanelRole = 'veli' | 'ogrenci' | 'ogretmen' | 'yonetim'
export type CardId =
  | 'duyuru' | 'odev' | 'yoklama' | 'program' | 'yemek' | 'takvim' | 'mesaj' | 'lgs' | 'bursluluk' | 'derslerim' | 'odev_kontrol' | 'devamsizlik'
  | 'deneme' | 'gorusmeler' | 'gorevler'
/** Kart genişliği (0024): geniş kart ana sayfa ızgarasında iki sütun kaplar. Yoksa dar. */
export type CardWidth = 'dar' | 'genis'
export interface LayoutItem {
  id: CardId
  on: boolean
  w?: CardWidth
}
export const CARD_TR: Record<CardId, string> = {
  duyuru: 'Duyurular',
  odev: 'Ödevler',
  yoklama: 'Devamsızlık',
  program: 'Bugünün dersleri',
  yemek: 'Bugünün yemeği',
  takvim: 'Yaklaşan etkinlikler',
  mesaj: 'Mesajlar',
  lgs: 'LGS / Deneme',
  bursluluk: 'Bursluluk sınavı',
  derslerim: 'Bugünkü derslerim',
  odev_kontrol: 'Kontrol bekleyen ödevler',
  devamsizlik: 'Devamsızlık sınırına yaklaşanlar',
  deneme: 'Son deneme',
  gorusmeler: 'Görüşmeler',
  gorevler: 'Görevler',
}
/** Kartın bağlı olduğu modül: kapalıysa kart gösterilmez. */
const CARD_MODULE: Partial<Record<CardId, keyof Modules>> = {
  duyuru: 'duyuru', odev: 'odev', odev_kontrol: 'odev', yoklama: 'yoklama', devamsizlik: 'yoklama', program: 'ders_programi', derslerim: 'ders_programi',
  yemek: 'yemek', takvim: 'takvim', mesaj: 'mesaj', lgs: 'lgs', bursluluk: 'bursluluk', deneme: 'lgs',
}
/** Veritabanı varsayılanlarıyla aynı (setting_spec, 0019). */
export const PANEL_DEFAULTS: Record<PanelRole, LayoutItem[]> = {
  veli: [
    { id: 'duyuru', on: true }, { id: 'odev', on: true }, { id: 'program', on: true }, { id: 'yemek', on: true }, { id: 'yoklama', on: true },
    { id: 'takvim', on: true }, { id: 'mesaj', on: true }, { id: 'lgs', on: true }, { id: 'bursluluk', on: false },
  ],
  ogrenci: [
    { id: 'program', on: true }, { id: 'odev', on: true }, { id: 'duyuru', on: true }, { id: 'takvim', on: true }, { id: 'yemek', on: true },
    { id: 'yoklama', on: true }, { id: 'lgs', on: true }, { id: 'bursluluk', on: false },
  ],
  ogretmen: [
    { id: 'derslerim', on: true }, { id: 'odev_kontrol', on: true }, { id: 'duyuru', on: true }, { id: 'takvim', on: true }, { id: 'mesaj', on: true },
    { id: 'devamsizlik', on: true }, { id: 'yemek', on: false },
  ],
  yonetim: [{ id: 'deneme', on: true }, { id: 'devamsizlik', on: true }, { id: 'gorusmeler', on: true }, { id: 'gorevler', on: true }],
}

/** Kaydedilmiş düzen + sonradan eklenen kartlar (kayıtta yoksa varsayılan konumuyla, kapalı). */
export function usePanelLayout(role: PanelRole) {
  const s = useSettings()
  return useMemo(() => {
    const saved = s.data?.[`panel.${role}`] as LayoutItem[] | undefined
    if (!saved) return PANEL_DEFAULTS[role]
    const known = new Set(saved.map((x) => x.id))
    return [...saved, ...PANEL_DEFAULTS[role].filter((x) => !known.has(x.id)).map((x) => ({ ...x, on: false }))]
  }, [s.data, role])
}

const WideCtx = createContext(false)

function Card({ id, title, to, children, d }: { id: CardId; title: string; to?: string; children: ReactNode; d: number }) {
  const wide = useContext(WideCtx)
  return (
    <section className={`card a pcard${wide ? ' wide' : ''}`} style={{ ['--d' as string]: d }} aria-label={title} data-card={id}>
      <div className="kv">
        <h2 style={{ fontSize: 16 }}>{title}</h2>
        {to && (
          <Link to={to} className="m" style={{ fontSize: 13 }}>
            Tümü →
          </Link>
        )}
      </div>
      {children}
    </section>
  )
}

export default function PanelPage() {
  const { profile } = useAuth()
  const role: PanelRole = profile?.role === 'veli' ? 'veli' : profile?.role === 'ogrenci' ? 'ogrenci' : 'ogretmen'
  const layout = usePanelLayout(role)
  const mods = useModules()
  const students = useStudents()
  const [sp, setSp] = useSearchParams()
  const list = students.data ?? []
  const s = role === 'ogrenci' ? list.find((x) => x.id === profile?.student_id) : role === 'veli' ? (list.find((x) => x.id === sp.get('cocuk')) ?? list[0]) : undefined
  // LGS kartı yalnız seçili öğrenci 8. sınıftaysa: ana sayfa düzeni açık bıraksa da sınıf seviyesi aşılamaz (öğretmen ana sayfasında LGS kartı yok)
  const cards = layout.filter((c) => c.on && (!CARD_MODULE[c.id] || mods[CARD_MODULE[c.id]!]) && (c.id !== 'lgs' || examTrack(s?.grade) === 'lgs'))
  const first = profile?.full_name.split(' ')[0]

  return (
    <>
      <div className="head a">
        <div className="stack" style={{ gap: 4 }}>
          <span className="m" style={{ fontWeight: 500 }}>
            {todayLong()}
          </span>
          <h1 className="hd">Merhaba {first}</h1>
        </div>
      </div>
      {role === 'veli' && list.length > 1 && s && (
        <Seg className="a" label="Çocuk" value={s.id} onChange={(id) => setSp({ cocuk: id }, { replace: true })} options={list.map((x) => [x.id, x.full_name.split(' ')[0]!] as const)} style={{ alignSelf: 'flex-start' }} />
      )}
      {role !== 'ogretmen' && !s ? (
        <div className="empty">{students.isLoading ? 'Yükleniyor…' : 'Bağlı öğrenci bulunamadı.'}</div>
      ) : cards.length ? (
        <div className="pgrid">
          {cards.map((c, i) => (
            <WideCtx.Provider key={c.id} value={c.w === 'genis'}>
              <CardBody id={c.id} s={s} role={role} d={Math.min(i + 1, 8)} />
            </WideCtx.Provider>
          ))}
        </div>
      ) : (
        <div className="empty">Ana sayfada gösterilecek kart seçilmemiş.</div>
      )}
    </>
  )
}

function CardBody({ id, s, role, d }: { id: CardId; s?: Student; role: PanelRole; d: number }) {
  switch (id) {
    case 'duyuru':
      return <DuyuruCard d={d} />
    case 'odev':
      return s ? <OdevCard s={s} d={d} /> : null
    case 'yoklama':
      return s ? <YoklamaCard s={s} d={d} /> : null
    case 'program':
      return s ? <ProgramCard s={s} d={d} /> : null
    case 'yemek':
      return <YemekCard d={d} />
    case 'takvim':
      return <TakvimCard d={d} />
    case 'mesaj':
      return role === 'ogrenci' ? null : <MesajCard d={d} />
    case 'lgs':
      return s ? <LgsCard s={s} d={d} /> : null
    case 'bursluluk':
      return <BurslulukCard d={d} />
    case 'derslerim':
      return <DerslerimCard d={d} />
    case 'odev_kontrol':
      return <OdevKontrolCard d={d} />
    case 'devamsizlik':
      return <DevamsizlikCard d={d} />
  }
}

function Empty({ children }: { children: ReactNode }) {
  return <span className="m" style={{ fontSize: 13 }}>{children}</span>
}

function DuyuruCard({ d }: { d: number }) {
  const list = useAnnouncements()
  const s = useSettings()
  const days = (s.data?.['duyuru.gosterim_gun'] as number | undefined) ?? 14
  const since = addDays(todayISO(), -days)
  const recent = (list.data ?? []).filter((a) => localDate(a.created_at) >= since).slice(0, 3)
  return (
    <Card id="duyuru" title={CARD_TR.duyuru} to="/duyurular" d={d}>
      {recent.length ? (
        recent.map((a) => (
          <Link key={a.id} to={`/duyurular?d=${a.id}`} className="prow">
            <b>{a.title}</b>
            <span className="m" style={{ fontSize: 12 }}>
              {trD(localDate(a.created_at))} · {a.author_name ?? 'Okul'}
            </span>
          </Link>
        ))
      ) : (
        <Empty>Son {days} günde duyuru yok.</Empty>
      )}
    </Card>
  )
}

function OdevCard({ s, d }: { s: Student; d: number }) {
  const hw = useHomework()
  const rows = useHomeworkRows({ student: s.id })
  const courses = useCourses()
  const today = todayISO()
  const st = new Map((rows.data ?? []).map((r) => [r.homework_id, r.status]))
  const open = (hw.data ?? []).filter((h) => h.class_id === s.class_id && (st.get(h.id) ?? 'bekliyor') === 'bekliyor').sort((a, b) => (a.due_on ?? '9').localeCompare(b.due_on ?? '9'))
  const late = open.filter((h) => h.due_on && h.due_on < today)
  return (
    <Card id="odev" title={CARD_TR.odev} to="/odevler" d={d}>
      <div className="btns">
        <span className="chip n">Bekleyen {open.length - late.length}</span>
        {late.length > 0 && <span className="chip down">Geciken {late.length}</span>}
      </div>
      {open.slice(0, 3).map((h) => (
        <Link key={h.id} to={`/odevler?odev=${h.id}`} className="prow">
          <b>{h.title}</b>
          <span className="m" style={{ fontSize: 12, color: h.due_on && h.due_on < today ? 'var(--signal)' : undefined }}>
            {courses.data?.find((c) => c.id === h.course_id)?.name} · {h.due_on ? `son gün ${trD(h.due_on)}` : 'tarihsiz'}
          </span>
        </Link>
      ))}
      {!open.length && <Empty>Bekleyen ödev yok.</Empty>}
    </Card>
  )
}

function YoklamaCard({ s, d }: { s: Student; d: number }) {
  const lim = useAttendanceLimits(s.id)
  return (
    <Card id="yoklama" title={CARD_TR.yoklama} to="/okul" d={d}>
      {lim.data ? <LimitBars l={lim.data} compact /> : <Empty>{lim.isLoading ? 'Yükleniyor…' : 'Bilgi yok.'}</Empty>}
    </Card>
  )
}

function useHm() {
  const bells = useBellTimes()
  return (p: number) => {
    const b = bells.data?.find((x) => x.period === p)
    return b ? `${b.starts.slice(0, 5)}–${b.ends.slice(0, 5)}` : `${p}. ders`
  }
}

function ProgramCard({ s, d }: { s: Student; d: number }) {
  const tt = useTimetable(s.class_id)
  const hm = useHm()
  const dow = isoDow(todayISO())
  const list = (tt.data ?? []).filter((l) => l.weekday === dow)
  return (
    <Card id="program" title={CARD_TR.program} to="/okul" d={d}>
      {list.length ? (
        list.map((l) => (
          <div key={l.id} className="kv" style={{ fontSize: 14 }}>
            <b>{l.subject}</b>
            <span className="m mono" style={{ fontSize: 12 }}>
              {hm(l.period)}
            </span>
          </div>
        ))
      ) : (
        <Empty>{dow > 5 ? 'Bugün okul yok.' : 'Bugün için ders programı girilmemiş.'}</Empty>
      )}
    </Card>
  )
}

function YemekCard({ d }: { d: number }) {
  const today = todayISO()
  const meals = useMeals(today, today)
  return (
    <Card id="yemek" title={CARD_TR.yemek} d={d}>
      {(meals.data ?? []).length ? (
        meals.data!.map((m) => (
          <div key={m.id} style={{ fontSize: 14 }}>
            <span className="label">{MEAL_TR[m.meal]}</span>
            <div>{m.items}</div>
          </div>
        ))
      ) : (
        <Empty>Bugün için yemek listesi yok.</Empty>
      )}
    </Card>
  )
}

function TakvimCard({ d }: { d: number }) {
  const today = todayISO()
  const cal = useCalendar(today, addDays(today, 30))
  const list = (cal.data ?? []).slice(0, 4)
  return (
    <Card id="takvim" title={CARD_TR.takvim} to="/takvim" d={d}>
      {list.length ? (
        list.map((e) => (
          <Link key={e.id} to={`/takvim?etkinlik=${e.id}`} className="prow" style={{ borderLeft: `3px solid ${EVENT_COLOR[e.type]}`, paddingLeft: 8 }}>
            <b>{e.title}</b>
            <span className="m" style={{ fontSize: 12 }}>
              {EVENT_TR[e.type]} · {trDW(e.starts_on)}
              {e.starts_at ? ` · ${e.starts_at.slice(0, 5)}` : ''}
            </span>
          </Link>
        ))
      ) : (
        <Empty>Önümüzdeki 30 günde etkinlik yok.</Empty>
      )}
    </Card>
  )
}

function MesajCard({ d }: { d: number }) {
  const convs = useConversations(true)
  const { profile } = useAuth()
  const unread = (convs.data ?? []).reduce((n, c) => n + c.unread, 0)
  const last = convs.data?.[0]
  return (
    <Card id="mesaj" title={CARD_TR.mesaj} to="/iletisim" d={d}>
      <span className={`chip ${unread ? 'gold' : 'n'}`} style={{ alignSelf: 'flex-start' }}>
        {unread ? `${unread} okunmamış mesaj` : 'Okunmamış mesaj yok'}
      </span>
      {last && (
        <Link to={`/iletisim?c=${last.id}`} className="prow">
          <b>{profile?.id === last.parent_id ? last.teacher_name : last.parent_name}</b>
          <span className="m" style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {last.last_body ?? ''}
          </span>
        </Link>
      )}
    </Card>
  )
}

function LgsCard({ s, d }: { s: Student; d: number }) {
  const ds = useDataset()
  const ex = useMemo(() => (ds.data ? studentExams(ds.data, s.id, indexResults(ds.data.results)) : []), [ds.data, s.id])
  const L = ex.at(-1)
  const P = ex.at(-2)
  const diff = L && P ? totalNet(L.result) - totalNet(P.result) : null
  return (
    <Card id="lgs" title={CARD_TR.lgs} to="/ozet" d={d}>
      {L ? (
        <>
          <span className="m" style={{ fontSize: 13 }}>
            Son deneme · {L.exam.name}
          </span>
          <div style={{ display: 'flex', gap: 18, alignItems: 'baseline' }}>
            <span style={{ fontSize: 28, fontWeight: 600 }}>{fmt(totalNet(L.result), 2)}</span>
            <span className="m">net</span>
            {diff != null && (
              <span style={{ color: diff < -1 ? 'var(--signal)' : diff > 1 ? 'var(--primary)' : 'var(--ink-muted)', fontWeight: 600 }}>
                {diff > 0 ? '↑ ' : diff < 0 ? '↓ ' : ''}
                {fmt(Math.abs(diff))}
              </span>
            )}
          </div>
        </>
      ) : (
        <Empty>Henüz deneme sonucu yok.</Empty>
      )}
    </Card>
  )
}

function BurslulukCard({ d }: { d: number }) {
  const q = useQuery({ queryKey: ['public-scholarship'], queryFn: async () => ((await supabase.rpc('public_scholarship_exams', { p_slug: SCHOOL_SLUG })).data ?? []) as { id: string; name: string; exam_date: string; apply_until: string }[] })
  return (
    <Card id="bursluluk" title={CARD_TR.bursluluk} d={d}>
      {(q.data ?? []).length ? (
        q.data!.map((e) => (
          <a key={e.id} href="/bursluluk" className="prow">
            <b>{e.name}</b>
            <span className="m" style={{ fontSize: 12 }}>
              Sınav {trD(e.exam_date)} · son başvuru {trD(e.apply_until)}
            </span>
          </a>
        ))
      ) : (
        <Empty>Şu anda başvuruya açık bursluluk sınavı yok.</Empty>
      )}
    </Card>
  )
}

function DerslerimCard({ d }: { d: number }) {
  const { profile } = useAuth()
  const classes = useClasses()
  const hm = useHm()
  const dow = isoDow(todayISO())
  const q = useQuery({
    queryKey: ['my-lessons', profile?.id, dow],
    queryFn: async () => ((await supabase.from('timetable').select('id, class_id, period, subject').eq('teacher_id', profile!.id).eq('weekday', dow).order('period')).data ?? []) as { id: string; class_id: string; period: number; subject: string }[],
  })
  return (
    <Card id="derslerim" title={CARD_TR.derslerim} d={d}>
      {(q.data ?? []).length ? (
        q.data!.map((l) => (
          <div key={l.id} className="kv" style={{ fontSize: 14 }}>
            <span>
              <b>{classes.data?.find((c) => c.id === l.class_id)?.name}</b> · {l.subject}
            </span>
            <span className="m mono" style={{ fontSize: 12 }}>
              {hm(l.period)}
            </span>
          </div>
        ))
      ) : (
        <Empty>{dow > 5 ? 'Bugün ders yok.' : 'Bugün için ders programında dersin yok.'}</Empty>
      )}
    </Card>
  )
}

function OdevKontrolCard({ d }: { d: number }) {
  const { profile } = useAuth()
  const hw = useHomework()
  const prog = useHomeworkProgress(true)
  const classes = useClasses()
  const today = todayISO()
  const mine = (hw.data ?? [])
    .filter((h) => h.teacher_id === profile?.id && h.due_on && h.due_on <= today)
    .map((h) => ({ h, waiting: (prog.data ?? []).filter((r) => r.homework_id === h.id && r.status === 'bekliyor').length }))
    .filter((x) => x.waiting > 0)
  return (
    <Card id="odev_kontrol" title={CARD_TR.odev_kontrol} to="/odevler" d={d}>
      {mine.length ? (
        mine.slice(0, 4).map(({ h, waiting }) => (
          <Link key={h.id} to={`/odevler?odev=${h.id}`} className="prow">
            <b>{h.title}</b>
            <span className="m" style={{ fontSize: 12 }}>
              {classes.data?.find((c) => c.id === h.class_id)?.name} · son gün {trD(h.due_on!)} · {waiting} öğrenci bekliyor
            </span>
          </Link>
        ))
      ) : (
        <Empty>Kontrol bekleyen ödev yok.</Empty>
      )}
    </Card>
  )
}

function DevamsizlikCard({ d }: { d: number }) {
  const w = useAttendanceWatchlist(true)
  return (
    <Card id="devamsizlik" title={CARD_TR.devamsizlik} d={d}>
      {(w.data ?? []).length ? (
        w.data!.slice(0, 5).map((x) => (
          <Link key={x.student_id} to={`/ogrenciler/${x.student_id}?sekme=devamsizlik`} className="prow">
            <b>
              {x.full_name} <span className="m" style={{ fontWeight: 400, fontSize: 12 }}>{x.class_name}</span>
            </b>
            <span style={{ fontSize: 12, color: LEVEL_INK[x.level], fontWeight: 600 }}>
              {gun(x.used)}/{x.lim} · {x.used >= x.lim ? 'sınıra ulaştı' : `sınıra ${gun(x.lim - x.used)} gün kaldı`}
            </span>
          </Link>
        ))
      ) : (
        <Empty>Sınıra yaklaşan öğrenci yok.</Empty>
      )}
    </Card>
  )
}

export { Icon }
