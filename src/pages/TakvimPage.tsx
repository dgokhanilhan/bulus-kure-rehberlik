// Takvim (Faz D · 0015): sınav ve etkinlikler + ödev teslim günleri. Kim neyi görür / ekler veritabanında zorlanır.
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/auth/AuthProvider'
import { EVENT_COLOR, EVENT_TR, useAssignments, useCalendar, useClasses, useCourses, useHomework, usePeople, useSettings, useStudents, type CalEvent, type EventType } from '@/lib/data'
import { isTeacherP, LEVEL_TR, LEVELS, type Level } from '@/lib/roles'
import { GUN, addDays, isoDow, todayISO, trD, trDW } from '@/lib/format'
import { Modal } from '@/components/Modal'
import { ConfirmDelete } from '@/components/ConfirmDelete'
import { Icon } from '@/components/Icon'
import { useToast } from '@/components/Toast'
import { calendarInScope } from '@/lib/calendarScope'
import { useAyar } from '@/lib/ayarlar'
import { TakvimKonuKutusu, TakvimKonuPenceresi } from './Yaklasan'
import type { ClassRow } from '@/lib/types'
import { SABLON_BASLIK, takvimTablosuOku, type OkunanSatir } from '@/lib/takvimExcel'
import { cakisanlar, egitimYili, haftaBantlari, seviyeDegistir, seviyeyeUyar, sinifEtiketi } from '@/lib/takvim'

const AYLAR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık']
const TYPES = Object.keys(EVENT_TR) as EventType[]
const AUD = { veli: 'Veliler', ogrenci: 'Öğrenciler', ogretmen: 'Öğretmenler' } as const
const errText = (e: { message?: string } | null) => (e ? (/row-level security/i.test(e.message ?? '') ? 'Bu hedefe etkinlik ekleme yetkin yok.' : (e.message ?? 'Kaydedilemedi.')) : null)

/** Takvimde gösterilen öğe: gerçek etkinlik ya da ödev teslim günü (salt okunur). */
type Item = { key: string; title: string; type: EventType; starts_on: string; ends_on: string; time: string | null; ev?: CalEvent; homework?: string; classId?: string | null; taslak?: boolean }

const monthStart = (iso: string) => `${iso.slice(0, 7)}-01`
const monthEnd = (iso: string) => {
  const [y, m] = iso.split('-').map(Number) as [number, number]
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)
}

export default function TakvimPage() {
  const { profile, role } = useAuth()
  const [sp, setSp] = useSearchParams()
  const nav = useNavigate()
  const today = todayISO()
  const [month, setMonth] = useState(monthStart(today))
  const [filter, setFilter] = useState<'all' | EventType>('all')
  const [seviye, setSeviye] = useState<number | 'all'>('all')
  const liste = sp.get('gorunum') === 'liste'
  const [aralik, setAralik] = useState<'ay' | 'yil'>('yil')
  const [edit, setEdit] = useState<CalEvent | 'new' | null>(null)
  const [kopya, setKopya] = useState<CalEvent | null>(null)
  const [aktar, setAktar] = useState(false)
  const dar = useDar()
  const settings = useSettings()
  const classes = useClasses()
  const from = addDays(month, 1 - isoDow(month))
  const to = addDays(monthEnd(month), 7 - isoDow(monthEnd(month)))
  const upTo = addDays(today, 45)
  const yil = egitimYili(month)
  const listeAralik = aralik === 'yil' ? yil : { from: month, to: monthEnd(month), ad: `${AYLAR[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}` }
  const cal = useCalendar(liste ? listeAralik.from : from < today ? from : today, liste ? listeAralik.to : to > upTo ? to : upTo)
  const hw = useHomework()
  const students = useStudents()
  const family = role === 'veli' || role === 'ogrenci'
  const loading = cal.isPending || hw.isPending || (family && students.isPending)
  const failed = cal.isError || hw.isError || (family && students.isError)
  const open = sp.get('etkinlik')
  const single = useQuery({
    queryKey: ['calendar-one', open, profile?.id, profile?.role],
    enabled: !!open,
    queryFn: async () => (await supabase.from('calendar_events').select('*').eq('id', open!).maybeSingle()).data as CalEvent | null,
  })
  const teacherCan = (settings.data?.['takvim.ogretmen_ekler'] as boolean | undefined) ?? true
  const canAdd = role === 'admin' || role === 'rehber' || (role === 'brans' && teacherCan)
  const clsList = classes.data ?? []
  const stuList = students.data ?? []
  // Sınıf etiketi ve sınıf filtresi okul personeli içindir; veli/öğrenci zaten yalnız kendi sınıfını görür.
  const etiketli = !family
  const seviyeler = [...new Set(clsList.filter((c) => c.active !== false).map((c) => c.grade))].sort((a, b) => a - b)

  const items = useMemo<Item[]>(() => {
    const evs: Item[] = (cal.data ?? []).map((e) => ({ key: e.id, title: e.title, type: e.type, starts_on: e.starts_on, ends_on: e.ends_on, time: e.starts_at?.slice(0, 5) ?? null, ev: e, taslak: !!e.taslak }))
    // Ödev teslim günleri: aile kendi çocuğunun sınıfınınkini, öğretmen verdiklerini görür
    const mineCls = new Set(stuList.map((s) => s.class_id))
    const hws: Item[] = (hw.data ?? [])
      .filter((h) => h.due_on && (family ? mineCls.has(h.class_id) : h.teacher_id === profile?.id))
      .map((h) => ({ key: `hw-${h.id}`, title: h.title, type: 'odev_teslim', starts_on: h.due_on!, ends_on: h.due_on!, time: null, homework: h.id, classId: h.class_id }))
    const uyar = (x: Item) => {
      if (seviye === 'all') return true
      if (x.ev) return seviyeyeUyar(x.ev, seviye, clsList, stuList)
      return clsList.find((c) => c.id === x.classId)?.grade === seviye
    }
    return [...evs, ...hws].filter((x) => (filter === 'all' || x.type === filter) && uyar(x))
  }, [cal.data, hw.data, stuList, clsList, family, profile?.id, filter, seviye])

  const etiket = (x: Item) => (etiketli && x.ev ? sinifEtiketi(x.ev, clsList) : null)
  const tekGun = (d: string) => items.filter((x) => x.starts_on === d && x.ends_on === d)
  const cokGun = items.filter((x) => x.ends_on > x.starts_on)
  const days = Array.from({ length: Math.round((Date.parse(to) - Date.parse(from)) / 86400_000) + 1 }, (_, i) => addDays(from, i))
  const weeks = Array.from({ length: days.length / 7 }, (_, i) => days.slice(i * 7, i * 7 + 7))
  const sirala = (a: Item, b: Item) => a.starts_on.localeCompare(b.starts_on) || (a.time ?? '').localeCompare(b.time ?? '')
  const upcoming = items.filter((x) => x.ends_on >= today && x.starts_on <= upTo).sort(sirala)
  const [y, m] = month.split('-').map(Number) as [number, number]
  const shift = (n: number) => setMonth(monthStart(new Date(Date.UTC(y, m - 1 + n, 1)).toISOString()))
  const candidate = open ? (cal.data?.find((e) => e.id === open) ?? single.data ?? null) : null
  const detail = candidate && calendarInScope(candidate, profile?.role, profile?.id, stuList) ? candidate : null
  const openItem = (x: Item) => (x.homework ? nav(`/odevler?odev=${x.homework}`) : setSp((p) => ({ ...Object.fromEntries(p), etkinlik: x.key }), { replace: true }))
  const gorunum = (l: boolean) =>
    setSp(
      (p) => {
        const n = new URLSearchParams(p)
        if (l) n.set('gorunum', 'liste')
        else n.delete('gorunum')
        return n
      },
      { replace: true },
    )
  const kapatDetay = () =>
    setSp(
      (p) => {
        const n = new URLSearchParams(p)
        n.delete('etkinlik')
        return n
      },
      { replace: true },
    )
  // Bildirimden gelinen etkinlik silinmiş ya da artık görünmüyorsa boş takvimde bırakma: söyle ve bağlantıyı temizle
  const toastAna = useToast()
  const yok = !!open && !cal.isPending && single.isSuccess && !detail
  useEffect(() => {
    if (!yok) return
    toastAna('Bu etkinlik kaldırılmış ya da artık takviminde görünmüyor.', 'warn')
    kapatDetay()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yok])
  const seviyeAdi = seviye === 'all' ? null : `${seviye}. sınıflar`
  const filtreAdi = [filter === 'all' ? null : EVENT_TR[filter], seviyeAdi].filter(Boolean).join(' · ')

  return (
    <>
      <div className="head a takvim-head">
        <h1 className="hd">Takvim</h1>
        {canAdd && (
          <div className="btns">
            {(role === 'admin' || role === 'rehber') && (
              <button className="btn" onClick={() => setAktar(true)}>
                <Icon name="grid" size={16} /> Excel'den yükle
              </button>
            )}
            <button className="btn pri" onClick={() => setEdit('new')}>
              <Icon name="plus" size={18} stroke={2} /> Etkinlik ekle
            </button>
          </div>
        )}
      </div>
      {canAdd && <TaslakCubugu />}
      <div className="caltool a" style={{ ['--d' as string]: 1 }}>
        <div className="segm calgor" role="group" aria-label="Görünüm">
          <button type="button" aria-pressed={!liste} onClick={() => gorunum(false)}>
            <Icon name="cal" size={16} /> Takvim
          </button>
          <button type="button" aria-pressed={liste} onClick={() => gorunum(true)}>
            <Icon name="doc" size={16} /> Liste
          </button>
        </div>
        {(!liste || aralik === 'ay') && (
          <div className="calnav">
            <button className="btn sm" onClick={() => shift(-1)} aria-label="Önceki ay">
              <Icon name="back" size={16} />
            </button>
            <b aria-live="polite">
              {AYLAR[m - 1]} {y}
            </b>
            <button className="btn sm" onClick={() => shift(1)} aria-label="Sonraki ay">
              <Icon name="right" size={16} />
            </button>
            <button className="btn sm" onClick={() => setMonth(monthStart(today))}>
              Bugün
            </button>
          </div>
        )}
        {liste && (
          <label className="field calaralik">
            <select aria-label="Liste aralığı" value={aralik} onChange={(e) => setAralik(e.target.value as 'ay' | 'yil')}>
              <option value="yil">{yil.ad}</option>
              <option value="ay">Tek ay</option>
            </select>
          </label>
        )}
        <div className="calfilt">
          <label className="field">
            <select aria-label="Tür" value={filter} onChange={(e) => setFilter(e.target.value as 'all' | EventType)}>
              <option value="all">Bütün türler</option>
              {TYPES.map((t) => (
                <option key={t} value={t}>
                  {EVENT_TR[t]}
                </option>
              ))}
            </select>
          </label>
          {etiketli && seviyeler.length > 1 && (
            <label className="field">
              <select aria-label="Sınıf" value={String(seviye)} onChange={(e) => setSeviye(e.target.value === 'all' ? 'all' : Number(e.target.value))}>
                <option value="all">Bütün sınıflar</option>
                {seviyeler.map((g) => (
                  <option key={g} value={g}>
                    {g}. sınıf
                  </option>
                ))}
              </select>
            </label>
          )}
          {!liste && canAdd && <TakvimAfisDugmesi month={month} items={items} etiket={etiket} filtreAdi={filtreAdi} />}
        </div>
      </div>
      {failed ? <div className="card" role="alert" style={{ padding: 16 }}>Takvim bilgileri yüklenemedi. <button className="btn sm" onClick={() => { void cal.refetch(); void hw.refetch(); if (family) void students.refetch() }}>Yeniden dene</button></div> : loading ? <p role="status">Takvim yükleniyor…</p> : null}
      {liste ? (
        <TakvimListesi items={[...items].sort(sirala)} aralikAdi={listeAralik.ad} filtreAdi={filtreAdi} openItem={openItem} loading={loading} />
      ) : (
        <div className="calcols" aria-busy={loading}>
          {dar ? (
            <TelefonTakvimi month={month} today={today} weeks={weeks} items={items} etiket={etiket} openItem={openItem} sirala={sirala} />
          ) : (
          <section className="card a calgrid" style={{ ['--d' as string]: 2 }} aria-label={`${AYLAR[m - 1]} ${y} takvimi`}>
            {['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'].map((d, i) => (
              <div key={d} className="calhd" title={GUN[i + 1]}>
                {d}
              </div>
            ))}
            {weeks.map((w) => {
              const { bantlar, serit } = haftaBantlari(w, cokGun)
              const satir = serit + 2
              return (
                <div key={w[0]} className="calweek" style={{ gridTemplateRows: `26px ${'22px '.repeat(serit)}minmax(60px,auto)` }}>
                  {w.map((d, i) => (
                    <div key={d} className={`calday${d.slice(0, 7) !== month.slice(0, 7) ? ' out' : ''}${d === today ? ' today' : ''}`} style={{ gridColumn: i + 1 }} data-testid="cal-day" data-date={d}>
                      <span className="calnum">{Number(d.slice(8))}</span>
                    </div>
                  ))}
                  {bantlar.map((b) => {
                    const x = b.item
                    const t = etiket(x)
                    return (
                      <button
                        key={x.key}
                        className={`calband${b.oncedenGelir ? ' onceden' : ''}${b.sonraSurer ? ' surer' : ''}${x.taslak ? ' taslak' : ''}`}
                        style={{ gridColumn: `${b.bas + 1} / ${b.son + 2}`, gridRow: b.serit + 2, ['--c' as string]: EVENT_COLOR[x.type] }}
                        onClick={() => openItem(x)}
                        title={`${EVENT_TR[x.type]}: ${x.title} (${trD(x.starts_on)} – ${trD(x.ends_on)})`}
                        aria-label={`${trD(x.starts_on)} – ${trD(x.ends_on)} · ${x.taslak ? 'Taslak · ' : ''}${EVENT_TR[x.type]}: ${x.title}`}
                      >
                        {b.oncedenGelir && <span aria-hidden="true">←</span>}
                        {t && <span className="ctag">{t}</span>}
                        <span className="bt">{x.title}</span>
                        {!b.oncedenGelir && b.son - b.bas >= 2 && <span className="m" style={{ fontWeight: 500 }}>· {trD(x.starts_on)} – {trD(x.ends_on)}</span>}
                        {b.sonraSurer && <span aria-hidden="true" style={{ marginLeft: 'auto' }}>→</span>}
                      </button>
                    )
                  })}
                  {w.map((d, i) => {
                    const list = tekGun(d).sort(sirala)
                    if (!list.length) return null
                    return (
                      <div key={`c-${d}`} className="calcell" style={{ gridColumn: i + 1, gridRow: satir }}>
                        {list.slice(0, 3).map((x) => {
                          const t = etiket(x)
                          return (
                            <button key={x.key} className={`calchip${x.taslak ? ' taslak' : ''}`} style={{ ['--c' as string]: EVENT_COLOR[x.type] }} onClick={() => openItem(x)} title={`${x.taslak ? 'Taslak · ' : ''}${EVENT_TR[x.type]}: ${x.title}${t ? ` · ${t}` : ''}`} aria-label={`${trD(d)} · ${x.taslak ? 'Taslak · ' : ''}${EVENT_TR[x.type]}: ${x.title}`}>
                              {t && <span className="ctag">{t}</span>}
                              {x.time ? `${x.time} ` : ''}
                              {x.title}
                            </button>
                          )
                        })}
                        {list.length > 3 && <span className="m" style={{ fontSize: 11 }}>+{list.length - 3}</span>}
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </section>
          )}
          <aside className="card a" style={{ ['--d' as string]: 3, padding: 16, display: 'flex', flexDirection: 'column', gap: 10, alignSelf: 'flex-start' }} aria-label="Yaklaşanlar">
            <h2 style={{ fontSize: 17 }}>Yaklaşanlar</h2>
            {loading ? <span className="m">Etkinlikler yükleniyor…</span> : failed ? <span className="m">Etkinlikler şu anda gösterilemiyor.</span> : upcoming.length ? (
              upcoming.slice(0, 15).map((x) => (
                <button key={x.key} className="srow" style={{ padding: '8px 4px', borderTop: 0 }} onClick={() => openItem(x)} data-testid="upcoming">
                  <span style={{ width: 4, alignSelf: 'stretch', borderRadius: 4, background: EVENT_COLOR[x.type] }} aria-hidden="true" />
                  <span style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                    <b style={{ display: 'block', fontSize: 14 }}>{x.title}</b>
                    <span className="m" style={{ fontSize: 12 }}>
                      {EVENT_TR[x.type]} · {trDW(x.starts_on)}
                      {x.time ? ` · ${x.time}` : ''}
                      {x.ends_on !== x.starts_on ? ` → ${trD(x.ends_on)}` : ''}
                      {etiket(x) ? ` · ${etiket(x)}` : ''}
                      {x.taslak ? ' · Taslak' : ''}
                    </span>
                  </span>
                </button>
              ))
            ) : (
              <span className="m">Önümüzdeki 45 günde etkinlik yok.</span>
            )}
          </aside>
        </div>
      )}
      {detail && <EventDetail e={detail} onClose={kapatDetay} onEdit={() => setEdit(detail)} onCopy={canAdd ? () => { setKopya(detail); kapatDetay() } : undefined} />}
      {edit && <EventModal e={edit === 'new' ? null : edit} onClose={() => setEdit(null)} />}
      {kopya && <EventModal e={kopya} kopya onClose={() => setKopya(null)} />}
      {aktar && <ExcelAktar onClose={() => setAktar(false)} />}
    </>
  )
}

function targetText(e: CalEvent, cls: (id: string | null) => string, stu: (id: string | null) => string, per: (id: string | null) => string) {
  return e.target === 'okul' ? 'Tüm okul' : e.target === 'kademe' ? LEVEL_TR[e.level!] : e.target === 'sinif' ? (e.class_ids?.length ? e.class_ids.map(cls).join(', ') : cls(e.class_id)) : e.target === 'ogrenci' ? stu(e.student_id) : per(e.teacher_id)
}

function EventDetail({ e, onClose, onEdit, onCopy }: { e: CalEvent; onClose: () => void; onEdit: () => void; onCopy?: () => void }) {
  const { profile, role } = useAuth()
  const classes = useClasses()
  const students = useStudents()
  const people = usePeople()
  const courses = useCourses()
  const qc = useQueryClient()
  const toast = useToast()
  const [del, setDel] = useState(false)
  // Deneme etkinliğine bağlı kazanım listesi varsa "Konuları gör" (0091)
  const [konuAcik, setKonuAcik] = useState(false)
  const mine = role === 'admin' || ((role === 'rehber' || role === 'brans') && e.created_by === profile?.id)
  if (konuAcik) return <TakvimKonuPenceresi eventId={e.id} onBack={() => setKonuAcik(false)} onClose={onClose} />
  const cls = (id: string | null) => classes.data?.find((c) => c.id === id)?.name ?? 'Sınıf'
  const stu = (id: string | null) => students.data?.find((s) => s.id === id)?.full_name ?? 'Öğrenci'
  const per = (id: string | null) => people.data?.find((p) => p.id === id)?.full_name ?? 'Öğretmen'
  const time = e.starts_at ? `${e.starts_at.slice(0, 5)}${e.ends_at ? `–${e.ends_at.slice(0, 5)}` : ''}` : 'Tüm gün'
  return (
    <Modal
      title={e.title}
      sub={EVENT_TR[e.type]}
      onClose={onClose}
      footer={
        mine ? (
          <>
            <button className="btn" onClick={() => setDel(true)} style={{ marginRight: 'auto' }}>
              <Icon name="trash" size={15} /> Sil
            </button>
            {e.taslak && (
              <button
                className="btn"
                onClick={async () => {
                  const { error } = await supabase.rpc('takvim_yayinla', { p_ids: [e.id] })
                  if (error) return toast(errText(error) ?? 'Yayınlanamadı')
                  qc.invalidateQueries({ queryKey: ['calendar'] })
                  qc.invalidateQueries({ queryKey: ['calendar-one'] })
                  qc.invalidateQueries({ queryKey: ['takvim-taslak'] })
                  toast('Etkinlik yayınlandı; ilgililere bildirim gitti')
                  onClose()
                }}
              >
                <Icon name="mega" size={15} /> Yayınla
              </button>
            )}
            {onCopy && (
              <button className="btn" onClick={onCopy}>
                <Icon name="repeat" size={15} /> Kopyala
              </button>
            )}
            <button className="btn pri" onClick={onEdit}>
              <Icon name="pen" size={15} /> Düzenle
            </button>
          </>
        ) : undefined
      }
    >
      <div className="stack" style={{ gap: 8, fontSize: 14 }}>
        <div className="kv">
          <span className="m">Tarih</span>
          <b>
            {trDW(e.starts_on)}
            {e.ends_on !== e.starts_on ? ` → ${trDW(e.ends_on)}` : ''}
          </b>
        </div>
        <div className="kv">
          <span className="m">Saat</span>
          <b>{time}</b>
        </div>
        {e.location && (
          <div className="kv">
            <span className="m">Yer</span>
            <b>{e.location}</b>
          </div>
        )}
        <div className="kv">
          <span className="m">Kimin için</span>
          <b>{targetText(e, cls, stu, per)}</b>
        </div>
        {e.course_id && (
          <div className="kv">
            <span className="m">Ders</span>
            <b>{courses.data?.find((c) => c.id === e.course_id)?.name}</b>
          </div>
        )}
        {e.description && <p style={{ whiteSpace: 'pre-line', margin: 0 }}>{e.description}</p>}
      </div>
      {e.taslak && (
        <div className="cakisma" role="status" style={{ marginTop: 12 }}>
          <b>Taslak</b>
          <span>Yalnız ekleyen ve yönetim görüyor. Henüz kimseye bildirim gitmedi.</span>
        </div>
      )}
      {e.type === 'deneme' && <TakvimKonuKutusu eventId={e.id} onAc={() => setKonuAcik(true)} />}
      {del && (
        <ConfirmDelete
          title="Etkinliği sil"
          name={e.title}
          onClose={() => setDel(false)}
          onConfirm={async () => {
            const { error } = await supabase.from('calendar_events').delete().eq('id', e.id)
            if (error) return errText(error)
            qc.invalidateQueries({ queryKey: ['calendar'] })
            qc.invalidateQueries({ queryKey: ['takvim-taslak'] })
            toast('Etkinlik silindi')
            onClose()
            return null
          }}
        >
          <b>{e.title}</b> takvimden silinecek.
        </ConfirmDelete>
      )}
    </Modal>
  )
}

function EventModal({ e: kaynak, kopya = false, onClose }: { e: CalEvent | null; kopya?: boolean; onClose: () => void }) {
  // Kopyada alanlar kaynaktan dolar ama kayıt yeni etkinlik olarak eklenir.
  const e = kopya ? null : kaynak
  const k = kaynak
  const { profile, role } = useAuth()
  const classes = useClasses()
  const students = useStudents()
  const people = usePeople()
  const courses = useCourses()
  const asg = useAssignments()
  const qc = useQueryClient()
  const toast = useToast()
  const staff = role === 'admin' || role === 'rehber'
  const myClassIds = useMemo(() => {
    const s = new Set<string>()
    for (const a of asg.data ?? []) if (a.teacher_id === profile?.id) s.add(a.class_id)
    for (const c of classes.data ?? []) if (c.homeroom_teacher_id === profile?.id) s.add(c.id)
    return s
  }, [asg.data, classes.data, profile?.id])
  const clsOpts = (classes.data ?? []).filter((c) => staff || myClassIds.has(c.id))
  const stuOpts = (students.data ?? []).filter((s) => staff || (s.class_id && myClassIds.has(s.class_id)))
  const teachers = (people.data ?? []).filter(isTeacherP)
  const targets: [CalEvent['target'], string][] = staff
    ? [['okul', 'Tüm okul'], ['kademe', 'Kademe'], ['sinif', 'Sınıf'], ['ogrenci', 'Öğrenci'], ['ogretmen', 'Öğretmen']]
    : [['sinif', 'Sınıfım'], ['ogrenci', 'Öğrencim'], ['ogretmen', 'Kendim']]
  const [f, setF] = useState({
    title: k?.title ?? '',
    type: (k?.type ?? (staff ? 'diger' : 'yazili')) as EventType,
    starts_on: k?.starts_on ?? todayISO(),
    ends_on: k?.ends_on ?? todayISO(),
    allDay: !k?.starts_at,
    starts_at: k?.starts_at?.slice(0, 5) ?? '09:00',
    ends_at: k?.ends_at?.slice(0, 5) ?? '',
    location: k?.location ?? '',
    description: k?.description ?? '',
    target: (k && targets.some(([t]) => t === k.target) ? k.target : targets[0]![0]) as CalEvent['target'],
    level: (k?.level ?? 'ortaokul') as Level,
    class_id: k?.class_id ?? '',
    class_ids: k?.class_ids?.length ? k.class_ids : k?.class_id ? [k.class_id] : [],
    student_id: k?.student_id ?? '',
    teacher_id: k?.teacher_id ?? (staff ? '' : (profile?.id ?? '')),
    course_id: k?.course_id ?? '',
    audience: k?.audience ?? (['veli', 'ogrenci', 'ogretmen'] as CalEvent['audience']),
    taslak: kopya ? false : (k?.taslak ?? false),
  })
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (f.ends_on < f.starts_on) setF((x) => ({ ...x, ends_on: x.starts_on }))
  }, [f.starts_on]) // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k: keyof typeof f) => (ev: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF((x) => ({ ...x, [k]: ev.target.value }))
  // Çakışma uyarısı: aynı günlere düşen tatiller ve aynı sınıfları ilgilendiren başka etkinlikler (kaydı engellemez).
  const gunler = useCalendar(f.starts_on, f.ends_on >= f.starts_on ? f.ends_on : f.starts_on)
  const cakisma = useMemo(
    () =>
      f.target === 'ogretmen'
        ? { tatil: [], ayniSinif: [] }
        : cakisanlar(
            { id: e?.id, starts_on: f.starts_on, ends_on: f.ends_on, target: f.target, level: f.target === 'kademe' ? f.level : null, class_id: null, class_ids: f.class_ids, student_id: f.student_id || stuOpts[0]?.id || null },
            gunler.data ?? [],
            classes.data ?? [],
            students.data ?? [],
          ),
    [f.starts_on, f.ends_on, f.target, f.level, f.class_ids, f.student_id, gunler.data, classes.data, students.data, e?.id], // eslint-disable-line react-hooks/exhaustive-deps
  )

  async function save() {
    if (f.title.trim().length < 3) return setErr('Başlık en az 3 harf olmalı.')
    if (f.ends_on < f.starts_on) return setErr('Bitiş, başlangıçtan önce olamaz.')
    const selectedClasses = f.class_ids.length ? f.class_ids : f.class_id ? [f.class_id] : []
    const cls = selectedClasses[0] || ''
    const stu = f.student_id || stuOpts[0]?.id || ''
    const tch = staff ? f.teacher_id || teachers[0]?.id || '' : profile!.id
    if (f.target === 'sinif' && !cls) return setErr('Sınıf seç.')
    if (f.target === 'ogrenci' && !stu) return setErr('Öğrenci seç.')
    if (!f.audience.length) return setErr('En az bir alıcı grubu seç.')
    const row = {
      title: f.title.trim(),
      type: f.type,
      starts_on: f.starts_on,
      ends_on: f.ends_on,
      starts_at: f.allDay ? null : f.starts_at || null,
      ends_at: f.allDay ? null : f.ends_at || null,
      location: f.location.trim() || null,
      description: f.description.trim() || null,
      target: f.target,
      level: f.target === 'kademe' ? f.level : null,
      class_id: f.target === 'sinif' ? cls : null,
      class_ids: f.target === 'sinif' ? selectedClasses : [],
      student_id: f.target === 'ogrenci' ? stu : null,
      teacher_id: f.target === 'ogretmen' ? tch : null,
      course_id: f.course_id || null,
      audience: f.audience,
      ...(e && !e.taslak ? {} : { taslak: f.taslak }),
    }
    setBusy(true)
    const { error } = e ? await supabase.from('calendar_events').update(row).eq('id', e.id) : await supabase.from('calendar_events').insert({ ...row, school_id: profile!.school_id, created_by: profile!.id })
    setBusy(false)
    if (error) return setErr(errText(error))
    qc.invalidateQueries({ queryKey: ['calendar'] })
    qc.invalidateQueries({ queryKey: ['calendar-one'] })
    qc.invalidateQueries({ queryKey: ['takvim-taslak'] })
    const tarihDegisti = !!e && !e.taslak && (e.starts_on !== f.starts_on || e.ends_on !== f.ends_on)
    toast(
      f.taslak
        ? 'Taslak kaydedildi; kimseye bildirim gitmedi'
        : e?.taslak
          ? 'Etkinlik yayınlandı; ilgililere bildirim gitti'
          : e
            ? tarihDegisti
              ? 'Etkinlik güncellendi; tarih değişikliği ilgililere bildirildi'
              : 'Etkinlik güncellendi'
            : 'Etkinlik eklendi; ilgililere bildirim gitti',
    )
    onClose()
  }

  return (
    <Modal
      title={e ? 'Etkinliği düzenle' : kopya ? 'Etkinliği kopyala' : 'Etkinlik ekle'}
      width={640}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Vazgeç
          </button>
          <button className="btn pri" onClick={save} disabled={busy}>
            {busy && <span className="spinner" aria-hidden="true" />} Kaydet
          </button>
        </>
      }
    >
      <div className="grid2">
        <label className="field" htmlFor="eTitle">
          Başlık
          <input id="eTitle" value={f.title} onChange={set('title')} maxLength={150} />
        </label>
        <label className="field" htmlFor="eType">
          Tür
          <select id="eType" value={f.type} onChange={set('type')}>
            {TYPES.filter((t) => t !== 'odev_teslim').map((t) => (
              <option key={t} value={t}>
                {EVENT_TR[t]}
              </option>
            ))}
          </select>
        </label>
        <label className="field" htmlFor="eFrom">
          Başlangıç
          <input id="eFrom" type="date" value={f.starts_on} onChange={set('starts_on')} />
        </label>
        <label className="field" htmlFor="eTo">
          Bitiş
          <input id="eTo" type="date" value={f.ends_on} min={f.starts_on} onChange={set('ends_on')} />
        </label>
      </div>
      <button type="button" className="check" role="checkbox" aria-checked={f.allDay} onClick={() => setF((x) => ({ ...x, allDay: !x.allDay }))}>
        <span className={`box ${f.allDay ? 'on' : ''}`}>{f.allDay && <Icon name="check" size={13} stroke={3} />}</span>
        <span style={{ fontSize: 14 }}>Tüm gün</span>
      </button>
      {!f.allDay && (
        <div className="grid2">
          <label className="field" htmlFor="eSAt">
            Saat
            <input id="eSAt" type="time" value={f.starts_at} onChange={set('starts_at')} />
          </label>
          <label className="field" htmlFor="eEAt">
            Bitiş saati (isteğe bağlı)
            <input id="eEAt" type="time" value={f.ends_at} onChange={set('ends_at')} />
          </label>
        </div>
      )}
      <div className="grid2">
        <label className="field" htmlFor="eTarget">
          Kimin için
          <select id="eTarget" value={f.target} onChange={set('target')}>
            {targets.map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </label>
        {f.target === 'kademe' && (
          <label className="field" htmlFor="eLevel">
            Kademe
            <select id="eLevel" value={f.level} onChange={set('level')}>
              {LEVELS.map((l) => (
                <option key={l} value={l}>
                  {LEVEL_TR[l]}
                </option>
              ))}
            </select>
          </label>
        )}
        {f.target === 'sinif' && (
          <SinifSecici clsOpts={clsOpts} secili={f.class_ids} onChange={(ids) => setF((x) => ({ ...x, class_id: '', class_ids: ids }))} />
        )}
        {f.target === 'ogrenci' && (
          <label className="field" htmlFor="eStu">
            Öğrenci
            <select id="eStu" value={f.student_id || stuOpts[0]?.id || ''} onChange={set('student_id')}>
              {stuOpts.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.full_name} · {s.class_name}
                </option>
              ))}
            </select>
          </label>
        )}
        {f.target === 'ogretmen' && staff && (
          <label className="field" htmlFor="eTch">
            Öğretmen
            <select id="eTch" value={f.teacher_id || teachers[0]?.id || ''} onChange={set('teacher_id')}>
              {teachers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.full_name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {['yazili', 'proje'].includes(f.type) && (
        <label className="field" htmlFor="eCourse">
          Ders (isteğe bağlı)
          <select id="eCourse" value={f.course_id} onChange={set('course_id')}>
            <option value="">—</option>
            {(courses.data ?? [])
              .filter((c) => c.active)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </select>
        </label>
      )}
      {f.target !== 'ogretmen' && (
        <div className="stack" style={{ gap: 6 }}>
          <span className="label">Kime görünsün</span>
          <div className="btns">
            {(Object.keys(AUD) as (keyof typeof AUD)[]).map((k) => {
              const on = f.audience.includes(k)
              return (
                <button key={k} type="button" className="check" role="checkbox" aria-checked={on} onClick={() => setF((x) => ({ ...x, audience: on ? x.audience.filter((a) => a !== k) : [...x.audience, k] }))}>
                  <span className={`box ${on ? 'on' : ''}`}>{on && <Icon name="check" size={13} stroke={3} />}</span>
                  <span style={{ fontSize: 14 }}>{AUD[k]}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}
      <label className="field" htmlFor="eLoc">
        Yer (isteğe bağlı)
        <input id="eLoc" value={f.location} onChange={set('location')} maxLength={120} placeholder="ör. Konferans salonu" />
      </label>
      <label className="field" htmlFor="eDesc">
        Açıklama (isteğe bağlı)
        <textarea id="eDesc" rows={3} value={f.description} onChange={set('description')} maxLength={2000} />
      </label>
      {(!e || e.taslak) && (
        <button type="button" className="check" role="checkbox" aria-checked={f.taslak} onClick={() => setF((x) => ({ ...x, taslak: !x.taslak }))}>
          <span className={`box ${f.taslak ? 'on' : ''}`}>{f.taslak && <Icon name="check" size={13} stroke={3} />}</span>
          <span style={{ fontSize: 14 }}>
            Taslak olarak kaydet <span className="m">· yalnız sen ve yönetim görür, bildirim gitmez</span>
          </span>
        </button>
      )}
      {e && !e.taslak && (e.starts_on !== f.starts_on || e.ends_on !== f.ends_on) && (
        <span className="m" role="status">
          Tarih değişikliği kaydedilince ilgililere bildirilir.
        </span>
      )}
      {(cakisma.tatil.length > 0 || cakisma.ayniSinif.length > 0) && (
        <div className="cakisma" role="status" data-testid="cakisma">
          <b style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icon name="warn" size={15} /> Bu tarihlere dikkat
          </b>
          {cakisma.tatil.map((x) => (
            <span key={x.id}>
              Tatile denk geliyor: <b>{x.title}</b> ({trD(x.starts_on)}
              {x.ends_on !== x.starts_on ? ` – ${trD(x.ends_on)}` : ''})
            </span>
          ))}
          {cakisma.ayniSinif.slice(0, 5).map((x) => (
            <span key={x.id}>
              Aynı gün aynı sınıflarda: <b>{x.title}</b> · {EVENT_TR[x.type]} · {trD(x.starts_on)}
            </span>
          ))}
          {cakisma.ayniSinif.length > 5 && <span className="m">ve {cakisma.ayniSinif.length - 5} etkinlik daha</span>}
          <span className="m">İstersen yine de kaydedebilirsin.</span>
        </div>
      )}
      {err && (
        <div className="err" role="alert">
          {err}
        </div>
      )}
    </Modal>
  )
}

/** Sınıf seçici: seviye düğmeleri seçime ekler / tekrar basınca çıkarır; hazır gruplar ekler; tek tek işaretlenebilir. */
function SinifSecici({ clsOpts, secili, onChange }: { clsOpts: ClassRow[]; secili: string[]; onChange: (ids: string[]) => void }) {
  const aktif = clsOpts.filter((c) => c.active !== false)
  const seviyeler = [...new Set(aktif.map((c) => c.grade))].sort((a, b) => a - b)
  const seviyeSiniflari = (g: number) => aktif.filter((c) => c.grade === g).map((c) => c.id)
  const ekle = (ids: string[]) => onChange([...new Set([...secili, ...ids])])
  const gruplar: [string, string[]][] = []
  if ([5, 6, 7].every((g) => seviyeler.includes(g))) gruplar.push(['5-6-7', [5, 6, 7].flatMap(seviyeSiniflari)])
  for (const l of LEVELS) {
    const ids = aktif.filter((c) => c.level === l).map((c) => c.id)
    const grs = new Set(aktif.filter((c) => c.level === l).map((c) => c.grade))
    if (grs.size > 1) gruplar.push([`${LEVEL_TR[l]} tümü`, ids])
  }
  const adlar = clsOpts.filter((c) => secili.includes(c.id)).map((c) => c.name)
  return (
    <fieldset className="field sinifsec" style={{ border: 0, padding: 0, margin: 0, gridColumn: '1 / -1' }}>
      <legend>Sınıflar</legend>
      <div className="btns" style={{ flexWrap: 'wrap' }}>
        {seviyeler.map((g) => {
          const ids = seviyeSiniflari(g)
          const n = ids.filter((id) => secili.includes(id)).length
          const hepsi = n === ids.length
          return (
            <button key={g} type="button" className={`tgl${hepsi ? ' on' : n ? ' yarim' : ''}`} aria-pressed={hepsi} onClick={() => onChange(seviyeDegistir(secili, ids))}>
              {hepsi && <Icon name="check" size={14} stroke={3} />}
              {g}. sınıflar
              <small>
                {n}/{ids.length}
              </small>
            </button>
          )
        })}
      </div>
      {gruplar.length > 0 && (
        <div className="btns" style={{ flexWrap: 'wrap', alignItems: 'center' }}>
          <span className="m">Hazır gruplar:</span>
          {gruplar.map(([ad, ids]) => (
            <button key={ad} type="button" className="btn sm" onClick={() => ekle(ids)}>
              <Icon name="plus" size={14} /> {ad}
            </button>
          ))}
          {secili.length > 0 && (
            <button type="button" className="btn sm ghost" onClick={() => onChange([])}>
              Temizle
            </button>
          )}
        </div>
      )}
      <div className="btns sinifkutu" style={{ flexWrap: 'wrap' }}>
        {clsOpts
          .filter((c) => c.active !== false || secili.includes(c.id))
          .map((c) => (
            <label className="check" key={c.id}>
              <input type="checkbox" checked={secili.includes(c.id)} onChange={(ev) => onChange(ev.target.checked ? [...secili, c.id] : secili.filter((id) => id !== c.id))} />
              {c.name}
            </label>
          ))}
      </div>
      <span className="m">
        {adlar.length ? <b>{adlar.length} sınıf seçili: {adlar.join(', ')}.</b> : <b>Henüz sınıf seçilmedi.</b>} Yalnız seçilen sınıfların öğrencileri ve velileri görür.
      </span>
    </fieldset>
  )
}

function useOkulAdi() {
  const q = useQuery({ queryKey: ['school-name'], queryFn: async () => (await supabase.from('schools').select('name').maybeSingle()).data?.name as string | undefined })
  return q.data || 'Buluş Küre Koleji'
}

function dosyaIndir(blob: Blob, ad: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = ad.replace(/[<>:"/\\|?*]/g, '-')
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

/** Aylık takvim afişi: logolu, renkli, A4 yatay PDF (pano için). */
/** Telefon genişliği (≤600px): ayın ızgarası yerine dokunulabilir gün ızgarası + seçili günün yazılı listesi. */
function useDar() {
  const q = '(max-width: 600px)'
  const [dar, setDar] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.(q).matches)
  useEffect(() => {
    const mq = window.matchMedia?.(q)
    if (!mq) return
    const f = () => setDar(mq.matches)
    f()
    mq.addEventListener('change', f)
    return () => mq.removeEventListener('change', f)
  }, [])
  return dar
}

/**
 * Telefonda takvim: her gün 44px'ten büyük bir düğme. Tek günlük etkinlikler renkli nokta, çok günlükler (tatil gibi)
 * günlerin arkasında yumuşak renkli bir aralık olarak görünür. Renk tek başına anlam taşımaz: seçili günün etkinlikleri
 * ızgaranın altında adıyla, türüyle ve tarihiyle yazılır.
 */
function TelefonTakvimi({
  month,
  today,
  weeks,
  items,
  etiket,
  openItem,
  sirala,
}: {
  month: string
  today: string
  weeks: string[][]
  items: Item[]
  etiket: (x: Item) => string | null
  openItem: (x: Item) => void
  sirala: (a: Item, b: Item) => number
}) {
  const ilk = today.slice(0, 7) === month.slice(0, 7) ? today : month
  const [secili, setSecili] = useState(ilk)
  useEffect(() => setSecili(ilk), [ilk])
  const gunun = (d: string) => items.filter((x) => x.starts_on <= d && x.ends_on >= d)
  const liste = gunun(secili).sort((a, b) => Number(b.ends_on > b.starts_on) - Number(a.ends_on > a.starts_on) || sirala(a, b))
  const [, ay] = month.split('-').map(Number) as [number, number]
  return (
    <>
      <section className="card a mcal" style={{ ['--d' as string]: 2 }} aria-label={`${AYLAR[ay - 1]} ${month.slice(0, 4)} takvimi`}>
        <div className="mcal-wk" aria-hidden="true">
          {['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'].map((d) => (
            <span key={d} className="mcal-hd">
              {d}
            </span>
          ))}
        </div>
        {weeks.map((w) => (
          <div key={w[0]} className="mcal-wk">
            {w.map((d, i) => {
              const g = gunun(d)
              const cok = g.filter((x) => x.ends_on > x.starts_on).sort(sirala)[0]
              const tek = g.filter((x) => x.ends_on === x.starts_on).sort(sirala)
              const bas = !!cok && (cok.starts_on === d || i === 0)
              const son = !!cok && (cok.ends_on === d || i === 6)
              return (
                <button
                  key={d}
                  type="button"
                  className={`mcal-gun${d.slice(0, 7) !== month.slice(0, 7) ? ' out' : ''}${d === today ? ' today' : ''}`}
                  aria-pressed={d === secili}
                  aria-label={`${trDW(d)}${g.length ? `, ${g.length} etkinlik` : ''}`}
                  onClick={() => setSecili(d)}
                  data-testid="mcal-gun"
                  data-date={d}
                >
                  {cok && <span className={`mcal-aralik${bas ? ' bas' : ''}${son ? ' son' : ''}`} style={{ ['--c' as string]: EVENT_COLOR[cok.type] }} aria-hidden="true" />}
                  <span className="mcal-no">{Number(d.slice(8))}</span>
                  <span className="mcal-nokta" aria-hidden="true">
                    {tek.slice(0, 3).map((x) => (
                      <i key={x.key} style={{ background: EVENT_COLOR[x.type] }} />
                    ))}
                    {tek.length > 3 && <b>+</b>}
                  </span>
                </button>
              )
            })}
          </div>
        ))}
      </section>
      <section className="card a mgun" style={{ ['--d' as string]: 3 }} aria-label="Seçili gün" aria-live="polite">
        <h2>{trDW(secili)}</h2>
        {liste.length ? (
          liste.map((x) => {
            const t = etiket(x)
            return (
              <button key={x.key} className="srow" onClick={() => openItem(x)} data-testid="mgun-oge">
                <span style={{ width: 4, alignSelf: 'stretch', borderRadius: 4, background: EVENT_COLOR[x.type] }} aria-hidden="true" />
                <span style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                  <b style={{ display: 'block', fontSize: 15 }}>{x.title}</b>
                  <span className="m" style={{ fontSize: 13 }}>
                    {EVENT_TR[x.type]}
                    {x.time ? ` · ${x.time}` : ''}
                    {x.ends_on !== x.starts_on ? ` · ${trD(x.starts_on)} – ${trD(x.ends_on)}` : ''}
                    {t ? ` · ${t}` : ''}
                    {x.taslak ? ' · Taslak' : ''}
                  </span>
                </span>
                <Icon name="right" size={16} />
              </button>
            )
          })
        ) : (
          <span className="m">Bu gün etkinlik yok.</span>
        )}
      </section>
    </>
  )
}

function TakvimAfisDugmesi({ month, items, etiket, filtreAdi }: { month: string; items: Item[]; etiket: (x: Item) => string | null; filtreAdi: string }) {
  const okul = useOkulAdi()
  const ayar = useAyar()
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const [y, m] = month.split('-').map(Number) as [number, number]
  async function indir() {
    setBusy(true)
    try {
      const { takvimAfisPdf } = await import('@/lib/takvimAfis')
      const blob = await takvimAfisPdf({
        yil: y,
        ay: m,
        okul,
        filtre: filtreAdi,
        logo: ayar.bool('rapor.logo'),
        bugun: todayISO(),
        ogeler: items.map((x) => ({ key: x.key, title: x.title, type: x.type, turAdi: EVENT_TR[x.type], renk: EVENT_COLOR[x.type], starts_on: x.starts_on, ends_on: x.ends_on, time: x.time, etiket: etiket(x) })),
      })
      dosyaIndir(blob, `Takvim-${AYLAR[m - 1]}-${y}.pdf`)
    } catch {
      toast('Afiş hazırlanamadı. Yeniden dene.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <button className="btn" onClick={indir} disabled={busy} title="Renkli yazıcı için A4 yatay aylık takvim">
      {busy ? <span className="spinner" aria-hidden="true" /> : <Icon name="image" size={16} />} Afiş indir (PDF)
    </button>
  )
}

/** Liste görünümü: tarihe göre sıralı, aylara göre gruplu; PDF / Excel / Yazdır. */
function TakvimListesi({ items, aralikAdi, filtreAdi, openItem, loading }: { items: Item[]; aralikAdi: string; filtreAdi: string; openItem: (x: Item) => void; loading: boolean }) {
  const classes = useClasses()
  const students = useStudents()
  const people = usePeople()
  const okul = useOkulAdi()
  const ayar = useAyar()
  const toast = useToast()
  const [busy, setBusy] = useState<string | null>(null)
  const cls = (id: string | null) => classes.data?.find((c) => c.id === id)?.name ?? 'Sınıf'
  const stu = (id: string | null) => students.data?.find((s) => s.id === id)?.full_name ?? 'Öğrenci'
  const per = (id: string | null) => people.data?.find((p) => p.id === id)?.full_name ?? 'Öğretmen'
  const gun = (d: string) => GUN[isoDow(d)]!
  const tarih = (x: Item) => (x.ends_on !== x.starts_on ? `${trD(x.starts_on)} – ${trD(x.ends_on)}` : trD(x.starts_on))
  const gunYaz = (x: Item) => (x.ends_on !== x.starts_on ? `${gun(x.starts_on).slice(0, 3)}–${gun(x.ends_on).slice(0, 3)}` : gun(x.starts_on))
  const kimin = (x: Item) => (x.ev ? targetText(x.ev, cls, stu, per) : x.classId ? cls(x.classId) : '')
  const etk = (x: Item) => `${x.title}${x.time ? ` · ${x.time}` : ''}`
  const gruplar = new Map<string, Item[]>()
  for (const x of items) {
    const k = x.starts_on.slice(0, 7)
    gruplar.set(k, [...(gruplar.get(k) ?? []), x])
  }
  const ayAdi = (k: string) => `${AYLAR[Number(k.slice(5)) - 1]} ${k.slice(0, 4)}`
  const baslik = `Takvim · ${aralikAdi}${filtreAdi ? ` · ${filtreAdi}` : ''}`
  async function disa(tur: 'pdf' | 'xlsx') {
    setBusy(tur)
    try {
      const rows = items.map((x) => [`${tarih(x)} ${x.ends_on.slice(0, 4)}`, gunYaz(x), etk(x), EVENT_TR[x.type], kimin(x)])
      const kolon = (id: string, title: string, width: number) => ({ id, source: id as never, title, width })
      const config = {
        title: baslik,
        description: '',
        date: `Hazırlanma: ${trD(todayISO())} ${todayISO().slice(0, 4)}`,
        footer: '',
        signatures: '',
        orientation: 'portrait' as const,
        rowHeight: 18,
        columns: [kolon('tarih', 'Tarih', 18), kolon('gun', 'Gün', 12), kolon('etkinlik', 'Etkinlik', 34), kolon('tur', 'Tür', 14), kolon('sinif', 'Sınıflar', 22)],
        classIds: [],
        studentIds: [],
        search: '',
        missingPhone: false,
        grouping: 'child' as const,
        sort: 'name' as const,
        excluded: [],
        entries: {},
      }
      const blob = tur === 'xlsx' ? await (await import('@/lib/listExcel')).listExcel(config, rows, okul) : await (await import('@/lib/listPdf')).listPdf(config, rows, okul, ayar.bool('rapor.logo'))
      dosyaIndir(blob, `${baslik}.${tur}`)
    } catch {
      toast('Dosya hazırlanamadı. Yeniden dene.')
    } finally {
      setBusy(null)
    }
  }
  return (
    <section className="card a printable" style={{ ['--d' as string]: 2, padding: '16px 20px' }} aria-label="Etkinlik listesi" aria-busy={loading}>
      <div className="kv" style={{ flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h2 style={{ fontSize: 18, margin: 0 }}>{aralikAdi}</h2>
          <span className="m">
            {items.length} etkinlik{filtreAdi ? ` · ${filtreAdi}` : ''}
          </span>
        </div>
        <div className="btns noprint" style={{ flexWrap: 'wrap' }}>
          <button className="btn sm" onClick={() => disa('pdf')} disabled={!!busy || !items.length}>
            {busy === 'pdf' ? <span className="spinner" aria-hidden="true" /> : <Icon name="doc" size={15} />} PDF indir
          </button>
          <button className="btn sm" onClick={() => disa('xlsx')} disabled={!!busy || !items.length}>
            {busy === 'xlsx' ? <span className="spinner" aria-hidden="true" /> : <Icon name="grid" size={15} />} Excel indir
          </button>
          <button className="btn sm" onClick={() => window.print()} disabled={!items.length}>
            <Icon name="clip" size={15} /> Yazdır
          </button>
        </div>
      </div>
      {!loading && !items.length && <p className="m">Bu aralıkta etkinlik yok.</p>}
      {[...gruplar].map(([k, l]) => (
        <div key={k} style={{ marginTop: 16 }}>
          <h3 style={{ fontSize: 16, margin: '0 0 6px' }}>
            {ayAdi(k)} <span className="m" style={{ fontWeight: 500, fontSize: 13 }}>· {l.length} etkinlik</span>
          </h3>
          <div style={{ overflowX: 'auto' }}>
            <table className="ctbl">
              <thead>
                <tr>
                  <th style={{ width: 150 }}>Tarih</th>
                  <th style={{ width: 100 }}>Gün</th>
                  <th>Etkinlik</th>
                  <th style={{ width: 160 }}>Tür</th>
                  <th style={{ width: 200 }}>Sınıflar</th>
                </tr>
              </thead>
              <tbody>
                {l.map((x) => (
                  <tr key={x.key} className="tik" onClick={() => openItem(x)} data-testid="liste-satir">
                    <td>
                      <b>{tarih(x)}</b>
                    </td>
                    <td>{gunYaz(x)}</td>
                    <td>
                      <button
                        type="button"
                        onClick={(ev) => {
                          ev.stopPropagation()
                          openItem(x)
                        }}
                        style={{ background: 'none', border: 0, padding: 0, minHeight: 0, color: 'inherit', font: 'inherit', textAlign: 'left', cursor: 'pointer' }}
                      >
                        {x.taslak && <span className="tbadge">Taslak</span>}
                        {etk(x)}
                      </button>
                    </td>
                    <td>
                      <span className="ctur" style={{ ['--c' as string]: EVENT_COLOR[x.type] }}>
                        <i aria-hidden="true" />
                        {EVENT_TR[x.type]}
                      </span>
                    </td>
                    <td>{kimin(x)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </section>
  )
}

/** Yayında olmayan taslaklar (ekleyenin kendi taslakları; yönetici hepsini) + "Tümünü yayınla". */
function TaslakCubugu() {
  const { profile, role } = useAuth()
  const qc = useQueryClient()
  const toast = useToast()
  const [onay, setOnay] = useState(false)
  const [busy, setBusy] = useState(false)
  const q = useQuery({
    queryKey: ['takvim-taslak', profile?.id],
    enabled: !!profile,
    queryFn: async () => {
      const { data, error } = await supabase.from('calendar_events').select('id, title, starts_on, created_by').eq('taslak', true).order('starts_on')
      if (error) throw error
      return (data ?? []) as { id: string; title: string; starts_on: string; created_by: string | null }[]
    },
  })
  const benim = (q.data ?? []).filter((x) => role === 'admin' || x.created_by === profile?.id)
  if (!benim.length) return null
  const ilk = benim[0]!.starts_on
  const son = benim[benim.length - 1]!.starts_on
  async function yayinla() {
    setBusy(true)
    const { data, error } = await supabase.rpc('takvim_yayinla', { p_ids: benim.map((x) => x.id) })
    setBusy(false)
    if (error) return toast(errText(error) ?? 'Yayınlanamadı')
    qc.invalidateQueries({ queryKey: ['calendar'] })
    qc.invalidateQueries({ queryKey: ['takvim-taslak'] })
    setOnay(false)
    toast(`${data ?? benim.length} etkinlik yayınlandı; her kişiye tek bildirim gitti`)
  }
  return (
    <div className="card a cakisma" style={{ marginBottom: 12, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10 }} data-testid="taslak-cubugu">
      <span style={{ flex: 1, minWidth: 220 }}>
        <b>{benim.length} taslak etkinlik</b> yayında değil ({trD(ilk)}
        {son !== ilk ? ` – ${trD(son)}` : ''}). Veliler ve öğrenciler henüz görmüyor.
      </span>
      <button className="btn pri" onClick={() => setOnay(true)}>
        <Icon name="mega" size={16} /> Tümünü yayınla
      </button>
      {onay && (
        <Modal
          title="Taslakları yayınla"
          onClose={() => setOnay(false)}
          footer={
            <>
              <button className="btn" onClick={() => setOnay(false)}>
                Vazgeç
              </button>
              <button className="btn pri" onClick={yayinla} disabled={busy}>
                {busy && <span className="spinner" aria-hidden="true" />} {benim.length} etkinliği yayınla
              </button>
            </>
          }
        >
          <p style={{ marginTop: 0 }}>
            {benim.length} etkinlik takvimde herkese görünür olacak. İlgili velilere, öğrencilere ve öğretmenlere <b>kişi başı tek bildirim</b> gider.
          </p>
          <ul className="m" style={{ maxHeight: 220, overflow: 'auto', paddingLeft: 18, margin: 0 }}>
            {benim.slice(0, 40).map((x) => (
              <li key={x.id}>
                {trD(x.starts_on)} · {x.title}
              </li>
            ))}
            {benim.length > 40 && <li>ve {benim.length - 40} etkinlik daha</li>}
          </ul>
        </Modal>
      )}
    </div>
  )
}

/** Excel'den toplu etkinlik: şablon indir → dosya seç → önizle → taslak olarak ekle. */
function ExcelAktar({ onClose }: { onClose: () => void }) {
  const { profile } = useAuth()
  const classes = useClasses()
  const qc = useQueryClient()
  const toast = useToast()
  const [ad, setAd] = useState('')
  const [satirlar, setSatirlar] = useState<OkunanSatir[] | null>(null)
  const [hata, setHata] = useState<string | null>(null)
  const [mevcut, setMevcut] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const dosya = useRef<HTMLInputElement>(null)
  const turler = Object.fromEntries(TYPES.filter((t) => t !== 'odev_teslim').map((t) => [t, EVENT_TR[t]]))
  const anahtar = (x: { starts_on: string; title: string }) => `${x.starts_on}|${x.title.toLocaleLowerCase('tr-TR').trim()}`
  async function sablon() {
    const ExcelJS = (await import('exceljs')).default
    const book = new ExcelJS.Workbook()
    const sh = book.addWorksheet('Takvim')
    sh.columns = SABLON_BASLIK.map((h, i) => ({ header: h, width: [14, 14, 34, 18, 22, 8, 18, 30][i] }))
    sh.getRow(1).font = { bold: true }
    sh.addRow(['12.01.2027', '', 'LGS Deneme 4', 'Deneme', '8', '09:30', 'Spor salonu', ''])
    sh.addRow(['13.01.2027', '', 'Matematik yazılı', 'Yazılı', '5-7', '', '', ''])
    sh.addRow(['14.01.2027', '', 'Fen yazılı', 'Yazılı', '8/A, 8/B', '', '', ''])
    sh.addRow(['25.01.2027', '05.02.2027', 'Yarıyıl tatili', 'Tatil', 'Tümü', '', '', ''])
    const not = book.addWorksheet('Açıklama')
    not.columns = [{ width: 100 }]
    ;[
      'Başlangıç ve Bitiş: gg.aa.yyyy (Bitiş boşsa tek gün).',
      `Tür: ${Object.values(turler).join(', ')}.`,
      'Sınıflar: Tümü · Ortaokul · 8 (bütün 8. sınıflar) · 5-7 (5, 6, 7. sınıflar) · 8/A, 8/B (virgülle).',
      'Saat isteğe bağlı (09:30). Yer ve Açıklama isteğe bağlı.',
      'Yüklenen etkinlikler önce taslak olur; kontrol edip "Tümünü yayınla" deyince bildirim gider.',
    ].forEach((t) => not.addRow([t]))
    const b = await book.xlsx.writeBuffer()
    dosyaIndir(new Blob([new Uint8Array(b)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'Takvim-sablonu.xlsx')
  }
  async function oku(file: File) {
    setHata(null)
    setSatirlar(null)
    setAd(file.name)
    try {
      const readXlsx = (await import('read-excel-file')).default
      const rows = (await readXlsx(file)) as unknown[][]
      const r = takvimTablosuOku(rows, classes.data ?? [], turler)
      if (r.hata) return setHata(r.hata)
      if (!r.satirlar.length) return setHata('Dosyada etkinlik satırı bulunamadı.')
      const tarihler = r.satirlar.flatMap((x) => (x.event ? [x.event.starts_on] : []))
      if (tarihler.length) {
        const { data } = await supabase
          .from('calendar_events')
          .select('title, starts_on')
          .gte('starts_on', tarihler.reduce((a, b) => (a < b ? a : b)))
          .lte('starts_on', tarihler.reduce((a, b) => (a > b ? a : b)))
        setMevcut(new Set((data ?? []).map(anahtar)))
      }
      setSatirlar(r.satirlar)
    } catch {
      setHata('Dosya okunamadı. Excel (.xlsx) dosyası seç.')
    }
  }
  const eklenecek = (satirlar ?? []).filter((x) => x.event && !mevcut.has(anahtar(x.event)))
  const tekrar = (satirlar ?? []).filter((x) => x.event && mevcut.has(anahtar(x.event))).length
  const hatali = (satirlar ?? []).filter((x) => x.hata).length
  async function kaydet() {
    if (!eklenecek.length || !profile) return
    setBusy(true)
    const { error } = await supabase
      .from('calendar_events')
      .insert(eklenecek.map((x) => ({ ...x.event!, taslak: true, ends_at: null, audience: ['veli', 'ogrenci', 'ogretmen'], school_id: profile.school_id, created_by: profile.id })))
    setBusy(false)
    if (error) return setHata(errText(error))
    qc.invalidateQueries({ queryKey: ['calendar'] })
    qc.invalidateQueries({ queryKey: ['takvim-taslak'] })
    toast(`${eklenecek.length} etkinlik taslak olarak eklendi; kimseye bildirim gitmedi`)
    onClose()
  }
  return (
    <Modal
      title="Excel'den etkinlik yükle"
      width={860}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Vazgeç
          </button>
          <button className="btn pri" onClick={kaydet} disabled={busy || !eklenecek.length}>
            {busy && <span className="spinner" aria-hidden="true" />} {eklenecek.length} etkinliği taslak olarak ekle
          </button>
        </>
      }
    >
      <p style={{ marginTop: 0 }}>
        Sütunlar: <b>{SABLON_BASLIK.join(', ')}</b>. Eklenen etkinlikler önce <b>taslak</b> olur; takvimde kontrol edip "Tümünü yayınla" deyince bildirim gider.
      </p>
      <div className="btns" style={{ flexWrap: 'wrap' }}>
        <button className="btn" onClick={sablon}>
          <Icon name="down" size={16} /> Şablonu indir
        </button>
        <button className="btn pri" onClick={() => dosya.current?.click()}>
          <Icon name="up" size={16} /> Dosya seç
        </button>
        <input ref={dosya} type="file" accept=".xlsx" hidden onChange={(ev) => ev.target.files?.[0] && void oku(ev.target.files[0])} aria-label="Excel dosyası" />
        {ad && <span className="m">{ad}</span>}
      </div>
      {hata && (
        <div className="err" role="alert">
          {hata}
        </div>
      )}
      {satirlar && (
        <>
          <p className="m" role="status" style={{ margin: '12px 0 6px' }}>
            <b>{eklenecek.length}</b> etkinlik eklenecek
            {tekrar ? ` · ${tekrar} satır takvimde zaten var (atlanır)` : ''}
            {hatali ? ` · ${hatali} satır okunamadı (atlanır)` : ''}
          </p>
          <div style={{ maxHeight: 360, overflow: 'auto' }}>
            <table className="ctbl aktar-tbl">
              <thead>
                <tr>
                  <th>Satır</th>
                  <th>Tarih</th>
                  <th>Etkinlik</th>
                  <th>Tür</th>
                  <th>Sınıflar</th>
                  <th>Durum</th>
                </tr>
              </thead>
              <tbody>
                {satirlar.map((x) => {
                  const ev = x.event
                  const var_ = ev && mevcut.has(anahtar(ev))
                  return (
                    <tr key={x.no}>
                      <td>{x.no}</td>
                      <td>{ev ? (ev.ends_on !== ev.starts_on ? `${trD(ev.starts_on)} – ${trD(ev.ends_on)}` : trD(ev.starts_on)) : x.ham[0] || '—'}</td>
                      <td>{ev ? `${ev.title}${ev.starts_at ? ` · ${ev.starts_at}` : ''}` : x.ham[2] || '—'}</td>
                      <td>{ev ? EVENT_TR[ev.type as EventType] : x.ham[3] || '—'}</td>
                      <td>{ev ? x.sinifYazi : x.ham[4] || '—'}</td>
                      <td className={x.hata ? 'hata' : ''}>{x.hata ? `Okunamadı: ${x.hata}` : var_ ? 'Zaten var, atlanır' : 'Eklenecek'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Modal>
  )
}
