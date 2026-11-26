// Ana sayfa (Faz H · 0019; ana sayfa 2 · 0097): rol başına üst özet + gruplu kartlar. Hangi kartın görüneceği ve sırası
// Yönetim Merkezi → Ana sayfa düzeni'nden; grupların sırası düzendeki ilk kartlarına göre. Kapalı modülün kartı ve boş kart gösterilmez.
// Veriler RLS'ten geçer: kişi yalnız görebildiğini görür.
import { useMemo } from 'react'
import { Link } from 'react-router-dom'
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
  useHomeworkRows,
  useMeals,
  useModules,
  useSettings,
  useStudents,
  useTimetable,
} from '@/lib/data'
import { fmt, indexResults, studentExams, totalNet } from '@/lib/analiz'
import { GUN, addDays, isoDow, localDate, todayISO, todayLong, trD, trDW } from '@/lib/format'
import type { Modules } from '@/lib/roles'
import type { Student } from '@/lib/types'
import { LimitBars, useAttendanceLimits, useAttendanceWatchlist, LEVEL_INK, gun } from '@/components/Devamsizlik'
import { Seg } from '@/components/Indicator'
import { Icon } from '@/components/Icon'
import { examTrack } from '@/lib/roles'
import {
  BugununKonulari,
  Card,
  CozemedimKart,
  DefterKart,
  DersDenemeKart,
  Empty,
  GorevlerKart,
  GorusmeRaporKart,
  GrupCtx,
  GRUP_TR,
  HedeflerKart,
  NobetKart,
  OdaKart,
  OgrenciUst,
  OgretmenUst,
  VeliBeklenen,
  VeliUst,
  WideCtx,
  YapilacaklarKart,
  useBugunDerslerim,
  useKontrolBekleyen,
  type Grup,
} from '@/components/AnaSayfa'

/** 'yonetim': yöneticinin Bugün ekranındaki yan kartlar (0024). */
export type PanelRole = 'veli' | 'ogrenci' | 'ogretmen' | 'yonetim'
export type CardId =
  | 'duyuru' | 'odev' | 'yoklama' | 'program' | 'yemek' | 'takvim' | 'mesaj' | 'lgs' | 'bursluluk' | 'derslerim' | 'odev_kontrol' | 'devamsizlik'
  | 'deneme' | 'gorusmeler' | 'gorevler'
  | 'hedefler' | 'defter' | 'gorusme' | 'cozemedim' | 'ders_deneme' | 'nobet' | 'oda'
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
  hedefler: 'Hedefler',
  defter: 'Yanlış defteri',
  gorusme: 'Görüşmeler ve raporlar',
  cozemedim: 'Çözemedim soruları',
  ders_deneme: 'Dersimde son deneme',
  nobet: 'Bugünkü nöbet',
  oda: 'Öğretmenler Odası',
}
/** Kartın bağlı olduğu modül: kapalıysa kart gösterilmez. */
const CARD_MODULE: Partial<Record<CardId, keyof Modules>> = {
  duyuru: 'duyuru', odev: 'odev', odev_kontrol: 'odev', yoklama: 'yoklama', devamsizlik: 'yoklama', program: 'ders_programi', derslerim: 'ders_programi',
  yemek: 'yemek', takvim: 'takvim', mesaj: 'mesaj', lgs: 'lgs', bursluluk: 'bursluluk', deneme: 'lgs', hedefler: 'lgs', defter: 'lgs', ders_deneme: 'lgs', oda: 'oda',
}
/** Kartın ana sayfadaki grubu (renk ve başlık). */
const GRUP: Record<CardId, Grup> = {
  hedefler: 'calisma', gorevler: 'calisma', odev: 'calisma', lgs: 'calisma', defter: 'calisma', gorusme: 'calisma', cozemedim: 'calisma', derslerim: 'calisma',
  odev_kontrol: 'calisma', ders_deneme: 'calisma', devamsizlik: 'calisma', deneme: 'calisma', gorusmeler: 'calisma',
  program: 'okul', yemek: 'okul', yoklama: 'okul', nobet: 'okul', takvim: 'okul', bursluluk: 'okul',
  duyuru: 'iletisim', mesaj: 'iletisim', oda: 'iletisim',
}
/** Veritabanı varsayılanlarıyla aynı (setting_spec, 0097). */
export const PANEL_DEFAULTS: Record<PanelRole, LayoutItem[]> = {
  veli: [
    { id: 'hedefler', on: true }, { id: 'gorevler', on: true }, { id: 'odev', on: true }, { id: 'lgs', on: true }, { id: 'defter', on: true }, { id: 'gorusme', on: true },
    { id: 'program', on: true }, { id: 'yemek', on: true }, { id: 'yoklama', on: true }, { id: 'takvim', on: true }, { id: 'duyuru', on: true }, { id: 'mesaj', on: true },
    { id: 'bursluluk', on: false },
  ],
  ogrenci: [
    { id: 'odev', on: true, w: 'genis' }, { id: 'hedefler', on: true }, { id: 'lgs', on: true }, { id: 'cozemedim', on: true }, { id: 'defter', on: true },
    { id: 'program', on: true }, { id: 'yemek', on: true }, { id: 'yoklama', on: true }, { id: 'takvim', on: true }, { id: 'duyuru', on: true }, { id: 'bursluluk', on: false },
  ],
  ogretmen: [
    { id: 'derslerim', on: true, w: 'genis' }, { id: 'odev_kontrol', on: true }, { id: 'cozemedim', on: true }, { id: 'ders_deneme', on: true }, { id: 'devamsizlik', on: true },
    { id: 'nobet', on: true }, { id: 'takvim', on: true }, { id: 'yemek', on: false }, { id: 'duyuru', on: true }, { id: 'mesaj', on: true }, { id: 'oda', on: true },
  ],
  yonetim: [{ id: 'deneme', on: true }, { id: 'devamsizlik', on: true }, { id: 'gorusmeler', on: true }, { id: 'gorevler', on: true }],
}

/** Kaydedilmiş düzen + sonradan eklenen kartlar (kayıtta yoksa varsayılan durumuyla, en sonda). Bilinmeyen kart atlanır. */
export function usePanelLayout(role: PanelRole) {
  const s = useSettings()
  return useMemo(() => {
    const saved = (s.data?.[`panel.${role}`] as LayoutItem[] | undefined)?.filter((x) => x.id in CARD_TR)
    if (!saved) return PANEL_DEFAULTS[role]
    const known = new Set(saved.map((x) => x.id))
    return [...saved, ...PANEL_DEFAULTS[role].filter((x) => !known.has(x.id))]
  }, [s.data, role])
}

export default function PanelPage() {
  const { profile, activeStudent, switchStudent } = useAuth()
  const role: PanelRole = profile?.role === 'veli' ? 'veli' : profile?.role === 'ogrenci' ? 'ogrenci' : 'ogretmen'
  const settings = useSettings()
  const layout = usePanelLayout(role)
  const mods = useModules()
  const students = useStudents()
  const list = students.data ?? []
  const s = role === 'ogrenci' ? list.find((x) => x.id === profile?.student_id) : role === 'veli' ? (list.find((x) => x.id === activeStudent?.id) ?? list[0]) : undefined
  // LGS kartı yalnız seçili öğrenci 8. sınıftaysa: ana sayfa düzeni açık bıraksa da sınıf seviyesi aşılamaz (öğretmen ana sayfasında LGS kartı yok)
  const cards = layout.filter((c) => c.on && (!CARD_MODULE[c.id] || mods[CARD_MODULE[c.id]!]) && (c.id !== 'lgs' || examTrack(s?.grade) === 'lgs'))
  // Gruplar düzendeki ilk kartlarının sırasıyla dizilir (yöneticinin sıralaması korunur)
  const gruplar = [...new Set(cards.map((c) => GRUP[c.id]))].map((g) => [g, cards.filter((c) => GRUP[c.id] === g)] as const)
  const first = profile?.full_name.split(' ')[0]
  let sira = 0

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
      {!!settings.data?.['okul.karsilama'] && <p className="school-welcome">{String(settings.data['okul.karsilama'])}</p>}
      {role === 'veli' && list.length > 1 && s && (
        <Seg className="a" label="Çocuk" value={s.id} onChange={switchStudent} options={list.map((x) => [x.id, x.full_name.split(' ')[0]!] as const)} style={{ alignSelf: 'flex-start' }} />
      )}
      {role !== 'ogretmen' && !s ? (
        <div className="empty">{students.isLoading ? 'Yükleniyor…' : 'Bağlı öğrenci bulunamadı.'}</div>
      ) : (
        <>
          {role === 'veli' && s && (
            <div className="as-ust">
              <VeliUst s={s} />
              <VeliBeklenen s={s} />
            </div>
          )}
          {role === 'ogrenci' && s && (
            <div className="as-ust">
              <OgrenciUst s={s} />
              <BugununKonulari s={s} />
            </div>
          )}
          {role === 'ogretmen' && <OgretmenUst />}
          {cards.length ? (
            gruplar.map(([g, cs]) => (
              <section key={g} className="as-grup" aria-label={GRUP_TR[g]} data-grup={g}>
                <h2 className="as-grup-baslik">{GRUP_TR[g]}</h2>
                <div className="pgrid">
                  <GrupCtx.Provider value={g}>
                    {cs.map((c) => (
                      <WideCtx.Provider key={c.id} value={c.w === 'genis'}>
                        <CardBody id={c.id} s={s} role={role} d={Math.min(++sira, 8)} />
                      </WideCtx.Provider>
                    ))}
                  </GrupCtx.Provider>
                </div>
              </section>
            ))
          ) : (
            <div className="empty">Ana sayfada gösterilecek kart seçilmemiş.</div>
          )}
        </>
      )}
    </>
  )
}

function CardBody({ id, s, role, d }: { id: CardId; s?: Student; role: PanelRole; d: number }) {
  switch (id) {
    case 'duyuru':
      return <DuyuruCard d={d} />
    case 'odev':
      return s ? role === 'ogrenci' ? <YapilacaklarKart s={s} d={d} /> : <OdevCard s={s} d={d} /> : null
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
    case 'hedefler':
      return s ? <HedeflerKart s={s} d={d} veli={role === 'veli'} /> : null
    case 'gorevler':
      return s && role === 'veli' ? <GorevlerKart s={s} d={d} /> : null
    case 'defter':
      return s ? <DefterKart s={s} d={d} veli={role === 'veli'} /> : null
    case 'gorusme':
      return s && role === 'veli' ? <GorusmeRaporKart s={s} d={d} /> : null
    case 'cozemedim':
      return role === 'veli' ? null : <CozemedimKart s={s} d={d} />
    case 'ders_deneme':
      return role === 'ogretmen' ? <DersDenemeKart d={d} /> : null
    case 'nobet':
      return role === 'ogretmen' ? <NobetKart d={d} /> : null
    case 'oda':
      return role === 'ogretmen' ? <OdaKart d={d} /> : null
    default:
      return null
  }
}

function DuyuruCard({ d }: { d: number }) {
  const list = useAnnouncements()
  const s = useSettings()
  const days = (s.data?.['duyuru.gosterim_gun'] as number | undefined) ?? 14
  const since = addDays(todayISO(), -days)
  const recent = (list.data ?? []).filter((a) => localDate(a.created_at) >= since).slice(0, 3)
  if (!recent.length) return null
  return (
    <Card id="duyuru" title={CARD_TR.duyuru} to="/duyurular" d={d}>
      {recent.map((a) => (
        <Link key={a.id} to={`/duyurular?d=${a.id}`} className="prow">
          <b>{a.title}</b>
          <span className="m" style={{ fontSize: 12 }}>
            {trD(localDate(a.created_at))} · {a.author_name ?? 'Okul'}
          </span>
        </Link>
      ))}
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
  const today = todayISO()
  const dow = isoDow(today)
  const bugun = (tt.data ?? []).filter((l) => l.weekday === dow)
  // Hafta sonu ya da bugün ders yoksa: programdaki bir sonraki okul günü ("Pazartesi'nin dersleri")
  const sonraki = bugun.length ? null : [1, 2, 3, 4, 5, 6, 7].map((i) => isoDow(addDays(today, i))).find((g) => (tt.data ?? []).some((l) => l.weekday === g))
  const list = sonraki ? (tt.data ?? []).filter((l) => l.weekday === sonraki) : bugun
  return (
    <Card id="program" title={sonraki ? `${GUN[sonraki]} günün dersleri` : CARD_TR.program} label={CARD_TR.program} to="/okul" toLabel="Program" d={d}>
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
  if (!(meals.data ?? []).length) return null
  return (
    <Card id="yemek" title={CARD_TR.yemek} d={d}>
      {meals.data!.map((m) => (
        <div key={m.id} style={{ fontSize: 14 }}>
          <span className="label">{MEAL_TR[m.meal]}</span>
          <div>{m.items}</div>
        </div>
      ))}
    </Card>
  )
}

function TakvimCard({ d }: { d: number }) {
  const today = todayISO()
  const cal = useCalendar(today, addDays(today, 30))
  const list = (cal.data ?? []).slice(0, 4)
  if (!list.length) return null
  return (
    <Card id="takvim" title={CARD_TR.takvim} to="/takvim" d={d}>
      {list.map((e) => (
        <Link key={e.id} to={`/takvim?etkinlik=${e.id}`} className="prow" style={{ borderLeft: `3px solid ${EVENT_COLOR[e.type]}`, paddingLeft: 8 }}>
          <b>{e.title}</b>
          <span className="m" style={{ fontSize: 12 }}>
            {EVENT_TR[e.type]} · {trDW(e.starts_on)}
            {e.starts_at ? ` · ${e.starts_at.slice(0, 5)}` : ''}
          </span>
        </Link>
      ))}
    </Card>
  )
}

function MesajCard({ d }: { d: number }) {
  const convs = useConversations(true)
  const { profile } = useAuth()
  const unread = (convs.data ?? []).reduce((n, c) => n + c.unread, 0)
  const last = convs.data?.[0]
  if (!last) return null
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
            <span className="num" style={{ fontSize: 28, fontWeight: 600 }}>{fmt(totalNet(L.result), 2)}</span>
            <span className="m">net</span>
            {diff != null && (
              <span style={{ color: diff < -1 ? 'var(--signal)' : diff > 1 ? 'var(--primary)' : 'var(--ink-muted)', fontWeight: 600 }}>
                {diff > 0 ? '↑ ' : diff < 0 ? '↓ ' : ''}
                {fmt(Math.abs(diff))}
              </span>
            )}
          </div>
          {ex.length > 1 && <Spark v={ex.slice(-6).map((x) => totalNet(x.result))} />}
        </>
      ) : (
        <Empty>Henüz deneme sonucu yok.</Empty>
      )}
    </Card>
  )
}

function BurslulukCard({ d }: { d: number }) {
  const q = useQuery({ queryKey: ['public-scholarship'], queryFn: async () => ((await supabase.rpc('public_scholarship_exams', { p_slug: SCHOOL_SLUG })).data ?? []) as { id: string; name: string; exam_date: string; apply_until: string }[] })
  if (!(q.data ?? []).length) return null
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
  const classes = useClasses()
  const bells = useBellTimes()
  const hm = useHm()
  const dow = isoDow(todayISO())
  const q = useBugunDerslerim()
  const simdi = new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date())
  // Sıradaki ders: bitiş saati henüz gelmemiş ilk ders (zil saatleri girilmemişse işaretlenmez)
  const sonraki = (q.data ?? []).find((l) => {
    const b = bells.data?.find((x) => x.period === l.period)
    return b ? b.ends.slice(0, 5) > simdi : false
  })
  const ad = (id: string) => classes.data?.find((c) => c.id === id)?.name ?? ''
  return (
    <Card id="derslerim" title={CARD_TR.derslerim} to="/okul" toLabel="Program" d={d}>
      {(q.data ?? []).length ? (
        q.data!.map((l) => (
          <div key={l.id} className={`as-ders${l === sonraki ? ' simdi' : ''}`}>
            <span className="m num">{hm(l.period)}</span>
            <div className="t">
              <b>
                {ad(l.class_id)} · {l.subject}
              </b>
              {l === sonraki && <span className="chip up">Sıradaki</span>}
            </div>
            <div className="as-acts">
              <Link className={`btn sm${l === sonraki ? ' pri' : ''}`} to={`/odevler?yeni=${l.class_id}`} aria-label={`${ad(l.class_id)} ${l.subject} için ödev ver`}>
                ＋ Ödev
              </Link>
              <Link className="btn sm" to={`/ogrenciler?sinif=${encodeURIComponent(ad(l.class_id))}`} aria-label={`${ad(l.class_id)} öğrencilerine not ekle`}>
                ✎ Not
              </Link>
            </div>
          </div>
        ))
      ) : (
        <Empty>{dow > 5 ? 'Bugün ders yok.' : 'Bugün için ders programında dersin yok.'}</Empty>
      )}
    </Card>
  )
}

function OdevKontrolCard({ d }: { d: number }) {
  const classes = useClasses()
  const mine = useKontrolBekleyen()
  return (
    <Card id="odev_kontrol" title={CARD_TR.odev_kontrol} to="/odevler" d={d}>
      {mine.length ? (
        mine.slice(0, 4).map(({ h, waiting }, i) => (
          <div key={h.id} className="as-li">
            <div className="t">
              <b>{h.title}</b>
              <span className="m">
                {classes.data?.find((c) => c.id === h.class_id)?.name} · son gün {trD(h.due_on!)} · {waiting} öğrenci bekliyor
              </span>
            </div>
            <Link className={`btn sm${i === 0 ? ' pri' : ''}`} to={`/odevler?odev=${h.id}`}>
              Kontrol et
            </Link>
          </div>
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

function Spark({ v }: { v: number[] }) {
  const max = Math.max(...v, 1)
  return (
    <span className="as-spark" role="img" aria-label={`Son ${v.length} denemenin toplam neti`}>
      {v.map((x, i) => (
        <i key={i} style={{ height: `${Math.max(8, Math.round((x / max) * 100))}%` }} />
      ))}
    </span>
  )
}

export { Icon }
