// Ana sayfa 2 (veli · öğrenci · öğretmen): üst özet alanı ve yeni kartlar. Kart düzeni ve gruplar PanelPage'de.
// Yalnız sistemde olan veri gösterilir; boş kart gizlenir. Veli/öğrenci ekranında sınıf sıralaması yok (öğrenci kendisiyle kıyaslanır).
import { createContext, Fragment, useContext, useMemo, type ReactNode } from 'react'
import { useSayfaIzinli } from '@/lib/izinliSayfalar'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/auth/AuthProvider'
import {
  useAnnouncements,
  useCalendar,
  useClasses,
  useConversations,
  useDataset,
  useHomework,
  useHomeworkProgress,
  useHomeworkRows,
  useMeetings,
  useReports,
  useRefresh,
  useStudents,
  useTasks,
  type Homework,
  type Task,
} from '@/lib/data'
import { SUBJECTS, fmt, indexResults, repeats, studentExams, subjectOf, totalNet } from '@/lib/analiz'
import { defterKur } from '@/lib/destek'
import { useKonuCalisma, useKonuIsaretle, useSoruTalepler } from '@/lib/destekData'
import { usePanoNotlar } from '@/lib/panoData'
import { useAyar } from '@/lib/ayarlar'
import { referansPuan } from '@/lib/hedef'
import { useDenemePuanlari } from './HedefTab'
import { addDays, isoDow, localDate, localHM, todayISO, trD, trDW } from '@/lib/format'
import { examTrack } from '@/lib/roles'
import type { Student } from '@/lib/types'
import { LEVEL_TEXT, gun, useAttendanceLimits } from './Devamsizlik'
import { useToast } from './Toast'

export type Grup = 'calisma' | 'okul' | 'iletisim'
export const GRUP_TR: Record<Grup, string> = { calisma: 'Çalışma ve gelişim', okul: 'Okul günü', iletisim: 'Duyurular ve iletişim' }

export const WideCtx = createContext(false)
export const GrupCtx = createContext<Grup>('calisma')

export function Card({
  id,
  title,
  to,
  toLabel = 'Tümü',
  children,
  d,
  label,
}: {
  id: string
  title: string
  to?: string
  toLabel?: string
  children: ReactNode
  d: number
  label?: string
}) {
  const wide = useContext(WideCtx)
  const grup = useContext(GrupCtx)
  const izinli = useSayfaIzinli()
  return (
    <section className={`card a pcard${wide ? ' wide' : ''}`} style={{ ['--d' as string]: d }} aria-label={label ?? title} data-card={id} data-grup={grup}>
      <div className="kv">
        <h2 className="pcard-title">{title}</h2>
        {to && izinli(to) && (
          <Link to={to} className="m" style={{ fontSize: 13 }}>
            {toLabel} →
          </Link>
        )}
      </div>
      {children}
    </section>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <span className="m" style={{ fontSize: 13 }}>
      {children}
    </span>
  )
}

const pay = (a: number, b: number) => (b > 0 ? Math.min(100, Math.round((a / b) * 100)) : 0)
function Bar({ v, geride }: { v: number; geride?: boolean }) {
  return (
    <span className={`as-bar${geride ? ' geride' : ''}`} aria-hidden="true">
      <i style={{ width: `${v}%` }} />
    </span>
  )
}
const haftaBasi = (today: string) => addDays(today, -(isoDow(today) - 1))

/** Açık görevler (son güne göre) ve son 7 günde tamamlananlar. */
function aktifGorevler(l: Task[], today: string) {
  const sinir = addDays(today, -7)
  return l
    .filter((t) => !t.completed_at || localDate(t.completed_at) >= sinir)
    .sort((a, b) => Number(!!a.completed_at) - Number(!!b.completed_at) || a.due_date.localeCompare(b.due_date))
}

function useOdevDurumu(s: Student) {
  const hw = useHomework()
  const rows = useHomeworkRows({ student: s.id })
  const today = todayISO()
  return useMemo(() => {
    const st = new Map((rows.data ?? []).map((r) => [r.homework_id, r.status]))
    const sinif = (hw.data ?? []).filter((h) => h.class_id === s.class_id && st.has(h.id))
    const bas = haftaBasi(today)
    const hafta = sinif.filter((h) => h.due_on && h.due_on >= bas && h.due_on <= addDays(bas, 6))
    const acik = sinif.filter((h) => st.get(h.id) === 'bekliyor').sort((a, b) => (a.due_on ?? '9').localeCompare(b.due_on ?? '9'))
    return {
      yuklendi: !!hw.data && !!rows.data,
      hafta: hafta.length,
      haftaBiten: hafta.filter((h) => st.get(h.id) === 'yapti').length,
      acik,
      geciken: acik.filter((h) => h.due_on && h.due_on < today),
    }
  }, [hw.data, rows.data, s.class_id, today])
}

function useSonDeneme(s: Student, acik: boolean) {
  const ds = useDataset(acik)
  return useMemo(() => {
    if (!ds.data) return null
    const ex = studentExams(ds.data, s.id, indexResults(ds.data.results))
    const L = ex.at(-1)
    const P = ex.at(-2)
    return L
      ? {
          ad: L.exam.name,
          net: totalNet(L.result),
          fark: P ? totalNet(L.result) - totalNet(P.result) : null,
          seri: ex.slice(-6).map((x) => totalNet(x.result)),
        }
      : null
  }, [ds.data, s.id])
}

/** Takvimde LGS sınavı girilmişse kalan gün (yoksa null; tarih uydurulmaz). */
function useLgsGunu() {
  const today = todayISO()
  const cal = useCalendar(today, addDays(today, 400))
  const e = (cal.data ?? []).find((x) => /\bLGS\b/i.test(x.title) && !/deneme/i.test(x.title.toLocaleLowerCase('tr')) && x.type !== 'deneme')
  return e ? Math.round((Date.parse(e.starts_on) - Date.parse(today)) / 86400_000) : null
}

const isim = (s: Student) => s.full_name.split(' ')[0]!

// ============================== VELİ ÜST ==============================
export function VeliUst({ s }: { s: Student }) {
  const today = todayISO()
  const first = isim(s)
  const lgs = examTrack(s.grade) === 'lgs'
  const odev = useOdevDurumu(s)
  const tasks = useTasks(s.id)
  const son = useSonDeneme(s, lgs)
  const lim = useAttendanceLimits(s.id)
  const cal = useCalendar(today, addDays(today, 7))
  const ak = aktifGorevler(tasks.data ?? [], today)
  const soru = ak.reduce((a, t) => a + Math.min(t.solved, t.question_count), 0)
  const toplam = ak.reduce((a, t) => a + t.question_count, 0)
  const acikGorev = ak.filter((t) => !t.completed_at).length
  const lm = lim.data?.items.find((x) => x.current) ?? lim.data?.items[0]
  const sinav = (cal.data ?? []).find((e) => (e.type === 'yazili' || e.type === 'deneme') && e.starts_on >= today)

  const cumle: ReactNode[] = []
  if (odev.hafta)
    cumle.push(
      <>
        Bu hafta ödevlerinin{' '}
        <b>
          {odev.haftaBiten}/{odev.hafta}
        </b>
        'i tamam{odev.geciken.length ? `, ${odev.geciken.length} tanesi gecikti` : ''}.
      </>,
    )
  else if (odev.geciken.length) cumle.push(<>{odev.geciken.length} ödevi gecikti.</>)
  if (toplam)
    cumle.push(
      <>
        {' '}
        Rehberlik görevlerinde{' '}
        <b>
          {soru}/{toplam} soru
        </b>{' '}
        çözdü.
      </>,
    )
  if (sinav)
    cumle.push(
      <>
        {' '}
        {trDW(sinav.starts_on)} <b>{sinav.title}</b> var.
      </>,
    )
  if (son?.fark != null && Math.abs(son.fark) >= 0.5)
    cumle.push(
      <>
        {' '}
        Son denemede netini <b>{son.fark > 0 ? `↑ ${fmt(son.fark)} artırdı` : `↓ ${fmt(-son.fark)} azaldı`}</b>.
      </>,
    )

  return (
    <section className="as-hero a" aria-label={`Bu hafta ${first}`} data-testid="bu-hafta">
      <div className="as-lbl">Bu hafta {first}</div>
      <p>{cumle.length ? cumle.map((c, i) => <Fragment key={i}>{c}</Fragment>) : 'Bu hafta için henüz kayıtlı ödev, görev ya da sınav yok.'}</p>
      <div className="as-stats">
        <div className="as-st">
          <span className="k">Ödev</span>
          <span className="v num">
            {odev.hafta ? (
              <>
                {odev.haftaBiten}
                <small>/{odev.hafta}</small>
              </>
            ) : (
              odev.acik.length
            )}
          </span>
          <span className="u">{odev.geciken.length ? `↓ ${odev.geciken.length} gecikti` : odev.hafta ? 'bu hafta' : 'bekleyen'}</span>
        </div>
        <div className="as-st">
          <span className="k">Görev</span>
          <span className="v num">
            {soru}
            <small>/{toplam}</small>
          </span>
          <span className="u">{acikGorev ? `${acikGorev} görev açık` : 'açık görev yok'}</span>
        </div>
        {lgs && son && (
          <div className="as-st">
            <span className="k">Son deneme</span>
            <span className="v num">{fmt(son.net, 1)}</span>
            <span className="u">
              {son.fark == null ? 'net' : son.fark > 0 ? `↑ ${fmt(son.fark)} net` : son.fark < 0 ? `↓ ${fmt(-son.fark)} net` : 'değişmedi'}
            </span>
          </div>
        )}
        {lm && (
          <div className="as-st">
            <span className="k">Devamsızlık</span>
            <span className="v num">
              {gun(lm.used)}
              <small>/{gun(lm.limit)} gün</small>
            </span>
            <span className="u">{LEVEL_TEXT[lim.data!.level].toLocaleLowerCase('tr')}</span>
          </div>
        )}
      </div>
    </section>
  )
}

export function VeliBeklenen({ s }: { s: Student }) {
  const today = todayISO()
  const convs = useConversations(true)
  const meet = useMeetings(s.id)
  const odev = useOdevDurumu(s)
  const ann = useAnnouncements()
  const ayar = useAyar()
  const okunmamis = (convs.data ?? []).reduce((n, c) => n + c.unread, 0)
  const yanit = ayar.bool('aile.gorusmeler')
    ? (meet.data ?? []).filter((m) => !m.reply && !m.canceled_at && localDate(m.starts_at) >= today && m.with_whom !== 'ogrenci')
    : []
  const yeni = (ann.data ?? []).filter((a) => localDate(a.created_at) >= addDays(today, -3))
  const satirlar: { k: string; t: string; a: string; to: string; b: string }[] = []
  if (okunmamis)
    satirlar.push({ k: 'mesaj', t: `${okunmamis} okunmamış mesaj`, a: convs.data?.find((c) => c.unread)?.teacher_name ?? '', to: '/iletisim', b: 'Aç' })
  for (const m of yanit.slice(0, 2))
    satirlar.push({
      k: `g${m.id}`,
      t: 'Görüşme davetine yanıt',
      a: `${trDW(localDate(m.starts_at))} · ${localHM(m.starts_at)}`,
      to: '/gorusmeler',
      b: 'Yanıtla',
    })
  if (odev.geciken.length)
    satirlar.push({
      k: 'odev',
      t: odev.geciken.length > 1 ? `${odev.geciken.length} geciken ödev` : 'Geciken ödev',
      a: odev.geciken[0]!.title,
      to: `/odevler?odev=${odev.geciken[0]!.id}`,
      b: 'Gör',
    })
  if (yeni.length)
    satirlar.push({
      k: 'duyuru',
      t: yeni.length > 1 ? `Son 3 günde ${yeni.length} duyuru` : 'Yeni duyuru',
      a: yeni
        .slice(0, 2)
        .map((x) => x.title)
        .join(', '),
      to: '/duyurular',
      b: 'Oku',
    })
  return (
    <section className="as-exp a" aria-label="Sizden beklenen" data-testid="sizden-beklenen">
      <h2>Sizden beklenen{satirlar.length ? ` · ${satirlar.length}` : ''}</h2>
      {satirlar.length ? (
        satirlar.map((x) => (
          <div key={x.k} className="as-li">
            <div className="t">
              <b>{x.t}</b>
              {x.a && <span className="m">{x.a}</span>}
            </div>
            <Link className="btn sm" to={x.to}>
              {x.b}
            </Link>
          </div>
        ))
      ) : (
        <span className="m">Şu an sizden beklenen bir şey yok.</span>
      )}
    </section>
  )
}

// ============================== ÖĞRENCİ ÜST ==============================
const HAFTALIK_HEDEF = 5
export function OgrenciUst({ s }: { s: Student }) {
  const today = todayISO()
  const ayar = useAyar()
  const lgs = examTrack(s.grade) === 'lgs'
  const defter = lgs && ayar.bool('aile.yanlis_defteri')
  const marks = useKonuCalisma(s.id, defter)
  const odev = useOdevDurumu(s)
  const tasks = useTasks(s.id)
  const lgsGun = useLgsGunu()
  const bas = haftaBasi(today)
  const buHafta = [...(marks.data?.values() ?? [])].filter((x) => localDate(x) >= bas).length
  const acik = (tasks.data ?? []).filter((t) => !t.completed_at)
  const n = Math.min(buHafta, HAFTALIK_HEDEF)
  return (
    <section className="as-hero ogr a" aria-label="Haftalık özet" data-testid="haftalik-ozet">
      {defter && (
        <div
          className="as-ring"
          style={{ ['--p' as string]: `${pay(n, HAFTALIK_HEDEF)}%` }}
          role="img"
          aria-label={`Haftalık hedef: ${n} / ${HAFTALIK_HEDEF} konu`}
        >
          <b className="num">
            {n}/{HAFTALIK_HEDEF}
          </b>
        </div>
      )}
      <div style={{ minWidth: 0 }}>
        <div className="as-lbl">{defter ? 'Haftalık hedefin' : 'Bu hafta'}</div>
        <p>
          {defter ? (
            buHafta >= HAFTALIK_HEDEF ? (
              <>
                <b>Bu hafta {buHafta} konu çalıştın</b>, haftalık hedefini tamamladın.
              </>
            ) : (
              <>
                <b>Bu hafta {buHafta} konu çalıştın</b>, hedefe {HAFTALIK_HEDEF - buHafta} kaldı.
              </>
            )
          ) : null}{' '}
          {acik.length ? `${acik.length} açık görevin` : 'Açık görevin yok'}
          {odev.acik.length ? ` ve ${odev.acik.length} bekleyen ödevin var.` : acik.length ? ' var.' : '.'}
        </p>
      </div>
      {lgs && lgsGun != null && lgsGun >= 0 && (
        <div className="as-gun">
          <span className="num">{lgsGun}</span>
          <span>gün LGS'ye</span>
        </div>
      )}
    </section>
  )
}

export function BugununKonulari({ s }: { s: Student }) {
  const ayar = useAyar()
  const lgs = examTrack(s.grade) === 'lgs'
  const acik = lgs && ayar.bool('aile.yanlis_defteri')
  const ds = useDataset(acik)
  const marks = useKonuCalisma(s.id, acik)
  const isaretle = useKonuIsaretle(s.id)
  const toast = useToast()
  const satir = useMemo(
    () =>
      ds.data && marks.data
        ? defterKur(repeats(ds.data, s.id), marks.data, (k) => subjectOf(ds.data!, k).ad)
            .filter((x) => x.durum !== 'tamam')
            .slice(0, 3)
        : [],
    [ds.data, marks.data, s.id],
  )
  if (!acik || !satir.length) return null
  return (
    <section className="as-exp a" aria-label="Bugünün 3 konusu" data-testid="bugunun-konulari">
      <h2>Bugünün {satir.length} konusu</h2>
      {satir.map((x) => (
        <div key={x.konu} className="as-li">
          <div className="t">
            <b>{x.baslik}</b>
            <span className="m">
              {x.ders} · {x.sayi} denemede yanlış{x.durum === 'tekrar' ? ' · yeniden bakma zamanı' : ''}
            </span>
          </div>
          <button
            type="button"
            className="btn sm pri"
            disabled={isaretle.isPending}
            onClick={() =>
              isaretle.mutate(
                { konu: x.konu, calisti: true },
                { onSuccess: () => toast('Harika, işaretlendi'), onError: (e) => toast((e as Error).message, 'warn') },
              )
            }
          >
            Çalıştım
          </button>
        </div>
      ))}
      {ayar.bool('aile.soru_sor') && (
        <Link to="/ozet" className="m" style={{ fontSize: 13 }}>
          Bir soruda takıldıysan: Çözemedim, sor →
        </Link>
      )}
    </section>
  )
}

// ============================== ÖĞRETMEN ÜST ==============================
export function useBugunDerslerim() {
  const { profile } = useAuth()
  const today = todayISO()
  const dow = isoDow(today)
  return useQuery({
    queryKey: ['my-lessons', profile?.id, dow],
    enabled: !!profile?.id,
    queryFn: async () =>
      ((await supabase.from('timetable').select('id, class_id, period, subject').eq('teacher_id', profile!.id).eq('weekday', dow).order('period')).data ??
        []) as {
        id: string
        class_id: string
        period: number
        subject: string
      }[],
  })
}
function useKontrolBekleyen() {
  const { profile } = useAuth()
  const hw = useHomework()
  const prog = useHomeworkProgress(true)
  const today = todayISO()
  return useMemo(
    () =>
      (hw.data ?? [])
        .filter((h) => h.teacher_id === profile?.id && h.due_on && h.due_on <= today)
        .map((h) => ({ h, waiting: (prog.data ?? []).filter((r) => r.homework_id === h.id && r.status === 'bekliyor').length }))
        .filter((x) => x.waiting > 0),
    [hw.data, prog.data, profile?.id, today],
  )
}
export { useKontrolBekleyen }

export function OgretmenUst() {
  const ders = useBugunDerslerim()
  const kontrol = useKontrolBekleyen()
  const sorular = useSoruTalepler(undefined, true)
  const convs = useConversations(true)
  const classes = useClasses()
  const okunmamis = (convs.data ?? []).reduce((n, c) => n + c.unread, 0)
  const bekleyenSoru = (sorular.data ?? []).filter((x) => x.durum !== 'cozuldu').length
  const l = ders.data ?? []
  const sinifAd = (id: string) => classes.data?.find((c) => c.id === id)?.name ?? ''
  const ogrenci = kontrol.reduce((a, x) => a + x.waiting, 0)
  return (
    <section className="as-hero a" aria-label="Bugün özeti" data-testid="ogretmen-ozet">
      <div className="as-lbl">Bugün</div>
      <div className="as-stats">
        <div className="as-st">
          <span className="k">Dersim</span>
          <span className="v num">{l.length}</span>
          <span className="u">{l.length ? `ilk ders ${sinifAd(l[0]!.class_id)}` : 'bugün ders yok'}</span>
        </div>
        <div className="as-st">
          <span className="k">Kontrol bekleyen</span>
          <span className="v num">{ogrenci}</span>
          <span className="u">{kontrol.length ? `öğrenci · ${kontrol.length} ödev` : 'ödev yok'}</span>
        </div>
        <div className="as-st">
          <span className="k">Yanıt bekleyen soru</span>
          <span className="v num">{bekleyenSoru}</span>
          <span className="u">Çözemedim</span>
        </div>
        <div className="as-st">
          <span className="k">Okunmamış mesaj</span>
          <span className="v num">{okunmamis}</span>
          <span className="u">İletişim</span>
        </div>
      </div>
    </section>
  )
}

// ============================== KARTLAR ==============================
interface HedefSatir {
  sinav: 'LGS' | 'YKS'
  kurum: string
  program: string | null
  taban_puan: number | null
}
/** Hedefler (0060 aile_hedefleri): deneme puanıyla tahmini karşılaştırma; ayrıntı ve okul ekleme Hedefim sayfasında. */
export function HedeflerKart({ s, d, veli }: { s: Student; d: number; veli: boolean }) {
  const sinav = s.grade === 8 ? 'LGS' : 'YKS'
  const q = useQuery({
    // Anahtar Hedefim'in listesinden (aile_hedef_listesi) ayrı: iki fonksiyonun döndürdüğü alanlar farklı
    queryKey: ['aile-hedefleri-kart', s.id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('aile_hedefleri', { p_student: s.id })
      if (error) throw new Error(error.message)
      return ((data ?? []) as HedefSatir[]).map((h) => ({ ...h, taban_puan: h.taban_puan === null ? null : Number(h.taban_puan) }))
    },
  })
  // Hedefler bölümüyle aynı referans: LGS denemelerinin son 3 puan ortalaması (YKS'de puan türü farklı olduğundan yalnız taban gösterilir)
  const puanlar = useDenemePuanlari(s.id)
  if (![8, 11, 12].includes(s.grade ?? 0) || q.isLoading || q.isError) return null
  const list = (q.data ?? []).filter((h) => h.sinav === sinav).slice(0, 3)
  const ref =
    sinav === 'LGS' ? referansPuan((puanlar.data ?? []).filter((r) => r.exams.exam_type === 'LGS' || r.exams.exam_type === null).map((r) => r.score)) : null
  return (
    <Card id="hedefler" title="Hedefim" to="/hedefim" toLabel="Hedefim" d={d}>
      {list.length ? (
        <>
          {list.map((h, i) => {
            const f = ref !== null && h.taban_puan !== null ? ref - h.taban_puan : null
            return (
              <div key={i} className="as-li">
                <div className="t">
                  <b>{h.sinav === 'YKS' ? `${h.program ?? ''} · ${h.kurum}` : h.kurum}</b>
                  <span className="m">
                    {h.taban_puan === null ? 'Taban puan yok' : `Taban ${fmt(h.taban_puan, 2)}`}
                    {ref !== null && sinav === 'LGS' ? ` · tahmini puan ${fmt(ref, 1)}` : ''}
                  </span>
                </div>
                {f !== null && <span className={`chip ${f >= 0 ? 'up' : 'down'}`}>{f >= 0 ? '✓ Ulaşıldı' : `↓ ${fmt(-f)} puan`}</span>}
              </div>
            )
          })}
          <span className="m" style={{ fontSize: 12 }}>
            Puanlar son denemelere göre tahminidir.
          </span>
        </>
      ) : (
        <Empty>
          {veli
            ? 'Henüz hedef okul seçilmedi. Hedefim sayfasından okul ekleyebilirsiniz.'
            : 'Henüz hedef okulun yok. Hedefim sayfasından okul ekleyebilirsin.'}
        </Empty>
      )}
    </Card>
  )
}

/** Veli: rehberlik görevleri (açık + son 7 günde biten). Kontroller gösterilmez; yalnız toplam ilerleme. */
export function GorevlerKart({ s, d }: { s: Student; d: number }) {
  const today = todayISO()
  const tasks = useTasks(s.id)
  const l = aktifGorevler(tasks.data ?? [], today).slice(0, 3)
  if (!tasks.data || !l.length) return null
  return (
    <Card id="gorevler" title="Rehberlik görevleri" to="/gorevler" d={d}>
      {l.map((t) => {
        const late = !t.completed_at && t.due_date < today
        return (
          <div key={t.id} className="as-gorev">
            <div className="as-li">
              <div className="t">
                <b>{t.topic}</b>
                <span className="m">
                  {SUBJECTS.find((x) => x.code === t.subject)?.ad ?? t.subject} · son gün {trD(t.due_date)}
                </span>
              </div>
              <span className={`chip ${t.completed_at ? 'up' : late ? 'down' : 'n'}`}>{t.completed_at ? '✓ Bitti' : late ? '↓ Gecikti' : 'Devam ediyor'}</span>
            </div>
            <Bar v={pay(t.solved, t.question_count)} geride={late} />
            <span className="m num" style={{ fontSize: 12 }}>
              {Math.min(t.solved, t.question_count)}/{t.question_count} soru
            </span>
          </div>
        )
      })}
    </Card>
  )
}

/** Öğrenci: görev ve ödevler tek listede, son güne göre. Görevde "＋ 5 soru" ile ilerleme. */
export function YapilacaklarKart({ s, d }: { s: Student; d: number }) {
  const today = todayISO()
  const tasks = useTasks(s.id)
  const odev = useOdevDurumu(s)
  const refresh = useRefresh()
  const toast = useToast()
  type Is = { k: string; son: string; t?: Task; h?: Homework }
  const isler: Is[] = [
    ...(tasks.data ?? []).filter((t) => !t.completed_at).map((t) => ({ k: `t${t.id}`, son: t.due_date, t })),
    ...odev.acik.map((h) => ({ k: `h${h.id}`, son: h.due_on ?? '9999-12-31', h })),
  ].sort((a, b) => a.son.localeCompare(b.son))
  const ilerle = async (t: Task) => {
    const solved = Math.min(t.question_count, t.solved + 5)
    const { error } = await supabase.from('tasks').update({ solved }).eq('id', t.id)
    if (error) return toast('Kaydedilemedi. Tekrar dene.', 'warn')
    toast(solved >= t.question_count ? 'Tebrikler, görev tamam!' : 'İlerleme kaydedildi')
    refresh('tasks')
  }
  return (
    <Card id="odev" title="Yapılacaklar" to="/gorevler" toLabel="Görevlerim" d={d} label="Ödevler">
      {!tasks.data || !odev.yuklendi ? (
        <Empty>Yükleniyor…</Empty>
      ) : !isler.length ? (
        <Empty>Bekleyen görev ya da ödev yok.</Empty>
      ) : (
        isler.slice(0, 6).map((x) =>
          x.t ? (
            <div key={x.k} className="as-gorev">
              <div className="as-li">
                <div className="t">
                  <b>{x.t.topic} · görev</b>
                  <span className="m" style={x.t.due_date < today ? { color: 'var(--signal-ink, var(--signal))' } : undefined}>
                    {x.t.due_date < today ? '↓ Gecikti · ' : ''}son gün {trD(x.t.due_date)}
                  </span>
                </div>
                <button type="button" className="btn sm pri" onClick={() => ilerle(x.t!)} aria-label={`${x.t.topic}: 5 soru daha çözdüm`}>
                  ＋ 5 soru
                </button>
              </div>
              <Bar v={pay(x.t.solved, x.t.question_count)} geride={x.t.due_date < today} />
              <span className="m num" style={{ fontSize: 12 }}>
                {x.t.solved}/{x.t.question_count} soru
              </span>
            </div>
          ) : (
            <Link key={x.k} to={`/odevler?odev=${x.h!.id}`} className="as-li as-link">
              <div className="t">
                <b>{x.h!.title} · ödev</b>
                <span className="m" style={x.h!.due_on && x.h!.due_on < today ? { color: 'var(--signal-ink, var(--signal))' } : undefined}>
                  {x.h!.due_on ? `${x.h!.due_on < today ? '↓ Gecikti · ' : ''}son gün ${trD(x.h!.due_on)}` : 'tarihsiz'}
                </span>
              </div>
              <span className={`chip ${x.h!.due_on && x.h!.due_on < today ? 'down' : 'n'}`}>{x.h!.due_on && x.h!.due_on < today ? 'Geciken' : 'Bekliyor'}</span>
            </Link>
          ),
        )
      )}
    </Card>
  )
}

/** Yanlış defteri özeti (veli ve öğrenci; okul ayarı ve LGS'ye bağlı). */
export function DefterKart({ s, d, veli }: { s: Student; d: number; veli: boolean }) {
  const ayar = useAyar()
  const acik = examTrack(s.grade) === 'lgs' && ayar.bool('aile.yanlis_defteri')
  const ds = useDataset(acik)
  const marks = useKonuCalisma(s.id, acik)
  const satir = useMemo(
    () => (ds.data && marks.data ? defterKur(repeats(ds.data, s.id), marks.data, (k) => subjectOf(ds.data!, k).ad) : []),
    [ds.data, marks.data, s.id],
  )
  if (!acik || !satir.length) return null
  const bekleyen = satir.filter((x) => x.durum !== 'tamam')
  const tekrar = satir.find((x) => x.durum === 'tekrar')
  return (
    <Card id="defter" title="Yanlış defteri" to="/ozet" toLabel="Aç" d={d}>
      <div className="btns">
        <span className="chip n">{bekleyen.length} konu bekliyor</span>
        <span className="chip up">{satir.length - bekleyen.length} çalışıldı</span>
      </div>
      {tekrar && !veli ? (
        <Empty>"{tekrar.baslik}" konusuna yeniden bakma zamanı.</Empty>
      ) : (
        bekleyen.slice(0, 2).map((x) => (
          <div key={x.konu} className="as-li">
            <div className="t">
              <b>{x.baslik}</b>
              <span className="m">
                {x.ders} · {x.sayi} denemede yanlış
              </span>
            </div>
          </div>
        ))
      )}
    </Card>
  )
}

/** Veli: yaklaşan görüşme ve gönderilen raporlar (okul ayarlarına bağlı). */
export function GorusmeRaporKart({ s, d }: { s: Student; d: number }) {
  const ayar = useAyar()
  const today = todayISO()
  const meet = useMeetings(s.id)
  const rep = useReports(s.id)
  const g = ayar.bool('aile.gorusmeler')
    ? (meet.data ?? []).filter((m) => !m.canceled_at && localDate(m.starts_at) >= today).sort((a, b) => a.starts_at.localeCompare(b.starts_at))
    : []
  const r = ayar.bool('aile.raporlar') ? (rep.data ?? []).filter((x) => x.sent_at).sort((a, b) => (b.sent_at ?? '').localeCompare(a.sent_at ?? '')) : []
  if (!g.length && !r.length) return null
  return (
    <Card id="gorusme" title="Görüşmeler ve raporlar" to={g.length ? '/gorusmeler' : '/raporlar'} d={d}>
      {g.slice(0, 2).map((m) => (
        <div key={m.id} className="as-li">
          <div className="t">
            <b>Rehberlik görüşmesi</b>
            <span className="m">
              {trDW(localDate(m.starts_at))} · {localHM(m.starts_at)}
            </span>
          </div>
          <span className={`chip ${m.reply ? 'up' : 'gold'}`}>
            {m.reply === 'ok' ? '✓ Katılıyorum' : m.reply === 'no' ? 'Katılamıyorum' : 'Yanıt bekliyor'}
          </span>
        </div>
      ))}
      {r.slice(0, 2).map((x) => (
        <Link key={x.id} to="/raporlar" className="as-li as-link">
          <div className="t">
            <b>Gelişim raporu</b>
            <span className="m">Gönderildi · {trD(localDate(x.sent_at!))}</span>
          </div>
          <span className="chip n">Aç</span>
        </Link>
      ))}
    </Card>
  )
}

/** Çözemedim: öğrencide kendi soruları; öğretmende yanıt bekleyen öğrenci soruları. */
export function CozemedimKart({ s, d }: { s?: Student; d: number }) {
  const ayar = useAyar()
  const ogretmen = !s
  const acik = ayar.bool('aile.soru_sor')
  const q = useSoruTalepler(s?.id, acik)
  const students = useStudents(ogretmen)
  if (!acik || !q.data) return null
  const l = ogretmen ? q.data.filter((x) => x.durum !== 'cozuldu') : q.data
  if (!l.length) return null
  const ad = (sid: string) => {
    const st = students.data?.find((x) => x.id === sid)
    return st ? `${st.class_name} · ${st.full_name}` : ''
  }
  return (
    <Card id="cozemedim" title={ogretmen ? 'Çözemedim soruları' : 'Çözemedim sorularım'} to={ogretmen ? '/ogretmenler-odasi' : '/ozet'} d={d}>
      {l.slice(0, 3).map((x) => (
        <div key={x.id} className="as-li">
          <div className="t">
            <b>{ogretmen ? ad(x.student_id) || x.ders : x.ders}</b>
            <span className="m">
              {ogretmen ? x.ders : x.durum === 'cozuldu' ? 'Öğretmenin yanıtladı' : 'Öğretmenin bakması bekleniyor'}
              {x.aciklama ? ` · ${x.aciklama.slice(0, 40)}` : ''}
            </span>
          </div>
          <span className={`chip ${x.durum === 'cozuldu' ? 'up' : x.durum === 'yeni' ? 'gold' : 'n'}`}>
            {x.durum === 'cozuldu' ? 'Yanıtlandı' : x.durum === 'yeni' ? 'Yeni' : 'Görüldü'}
          </span>
        </div>
      ))}
    </Card>
  )
}

const NOBET_YER: Record<string, string> = { kantin: 'Kantin', arka_bahce: 'Arka bahçe', lise_1: '1. kat lise', orta_56: '2. kat 5/6', orta_78: '2. kat 7/8' }
const NOBET_ZAMAN: Record<string, string> = { before_noon: 'Öğleden önce', after_noon: 'Öğleden sonra' }
/** Öğretmen: bugünkü nöbet (Nöbet Takip). Nöbet yoksa kart görünmez. */
export function NobetKart({ d }: { d: number }) {
  const { profile } = useAuth()
  const dow = isoDow(todayISO())
  const q = useQuery({
    queryKey: ['ana-nobet', profile?.id, dow],
    enabled: !!profile?.id,
    queryFn: async () =>
      ((await supabase.from('teacher_duties').select('id, weekday, period, location').eq('teacher_id', profile!.id).eq('weekday', dow)).data ?? []) as {
        id: string
        period: string
        location: string
      }[],
  })
  if (!q.data?.length) return null
  return (
    <Card id="nobet" title="Bugünkü nöbetin" to="/nobet-takip" toLabel="Nöbet takip" d={d}>
      {q.data.map((x) => (
        <div key={x.id} className="as-li">
          <div className="t">
            <b>{NOBET_YER[x.location] ?? x.location}</b>
            <span className="m">{NOBET_ZAMAN[x.period] ?? x.period}</span>
          </div>
        </div>
      ))}
    </Card>
  )
}

/** Öğretmen: Öğretmenler Odası panosundaki son notlar. */
export function OdaKart({ d }: { d: number }) {
  const q = usePanoNotlar()
  const today = todayISO()
  const l = (q.data ?? []).filter((x) => !x.bitis || x.bitis >= today).slice(0, 2)
  if (!l.length) return null
  return (
    <Card id="oda" title="Öğretmenler Odası" to="/ogretmenler-odasi?sekme=pano" toLabel="Pano" d={d}>
      {l.map((x) => (
        <Link key={x.id} to="/ogretmenler-odasi" className="as-li as-link">
          <div className="t">
            <b style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{x.metin}</b>
            <span className="m">
              {x.yazan_p?.full_name ?? 'Öğretmen'} · {trD(localDate(x.created_at))}
            </span>
          </div>
        </Link>
      ))}
    </Card>
  )
}
