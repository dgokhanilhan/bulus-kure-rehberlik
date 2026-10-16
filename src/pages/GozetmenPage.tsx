// Gözetmen Bul (bağımsız modül, 0048) — yalnız yönetici. Ders programını yalnız okur; kendi verisi gozetmen_* tablolarında.
// Kaldırmak için: supabase/geri-alma/0048_gozetmen_geri_al.sql ve oradaki dosya listesi.
import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { pages } from '@/lib/sayfali'
import { useBellTimes, useClasses, usePeople } from '@/lib/data'
import { useSchoolInfo } from '@/lib/files'
import { rolesOf } from '@/lib/roles'
import { GUN, isoDow, todayISO, trD, trDW } from '@/lib/format'
import { useToast } from '@/components/Toast'
import { Icon } from '@/components/Icon'
import {
  DURUM_TR,
  PRESETS,
  TYPE_TR,
  addMin,
  duration,
  oneri,
  presetOturumlar,
  sorunlar,
  uygunluk,
  type DersSatiri,
  type Durum,
  type ExamType,
  type Gecmis,
  type Gorev,
  type Ogretmen,
  type Oturum,
  type Uygunluk,
} from '@/lib/gozetmen'
import './Gozetmen.css'

const TITLES: Record<ExamType, string> = { ortaokul: 'Ortaokul Deneme Sınavı', tyt: 'TYT Denemesi', ayt: 'AYT Denemesi', diger: 'Deneme Sınavı' }
const newKey = () => Math.random().toString(36).slice(2, 10)

interface SavedRow {
  id: string
  title: string
  exam_type: ExamType
  exam_date: string
  note: string | null
  status: 'taslak' | 'atandi'
  gozetmen_oturumlar: { id: string; name: string; starts: string; ends: string; sort: number }[]
  gozetmen_siniflar: { class_id: string | null; class_name: string; room: string | null }[]
  gozetmen_gorevler: { oturum_id: string; role: 'gozetmen' | 'dinlendirici'; class_id: string | null; class_name: string | null; scope: string | null; teacher_id: string | null; teacher_name: string }[]
}

interface Form {
  id: string | null
  title: string
  type: ExamType
  date: string
  note: string
  oturumlar: Oturum[]
  classIds: string[]
  rooms: Record<string, string>
  gorevler: Gorev[]
}
const emptyForm = (type: ExamType = 'ortaokul', classIds: string[] = []): Form => ({
  id: null,
  title: TITLES[type],
  type,
  date: todayISO(),
  note: '',
  oturumlar: presetOturumlar(type, newKey),
  classIds,
  rooms: {},
  gorevler: [],
})

export default function GozetmenPage() {
  const [tab, setTab] = useState<'plan' | 'gecmis'>('plan')
  const classes = useClasses()
  const people = usePeople()
  const bells = useBellTimes()
  const school = useSchoolInfo()
  const lessons = useQuery({
    queryKey: ['gozetmen', 'timetable'],
    queryFn: () =>
      pages<DersSatiri>((a, b) => supabase.from('timetable').select('class_id, weekday, period, subject, teacher_id').order('id').range(a, b)),
  })
  const saved = useQuery({
    queryKey: ['gozetmen', 'sinavlar'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('gozetmen_sinavlar')
        .select(
          'id, title, exam_type, exam_date, note, status, gozetmen_oturumlar(id, name, starts, ends, sort), gozetmen_siniflar(class_id, class_name, room), gozetmen_gorevler(oturum_id, role, class_id, class_name, scope, teacher_id, teacher_name)',
        )
        .order('exam_date', { ascending: false })
        .limit(300)
      if (error) throw error
      return (data ?? []) as unknown as SavedRow[]
    },
  })
  const activeClasses = useMemo(() => (classes.data ?? []).filter((c) => c.active !== false), [classes.data])
  const teachers: Ogretmen[] = useMemo(
    () =>
      (people.data ?? [])
        .filter((p) => rolesOf(p).includes('ogretmen'))
        .map((p) => ({ id: p.id, full_name: p.full_name, branch: p.branch }))
        .sort((a, b) => a.full_name.localeCompare(b.full_name, 'tr')),
    [people.data],
  )
  const gradesOfType = (t: ExamType) => activeClasses.filter((c) => PRESETS[t].grades.includes(c.grade)).map((c) => c.id)
  const [form, setForm] = useState<Form | null>(null)
  const f = form ?? emptyForm('ortaokul', gradesOfType('ortaokul'))
  const set = (p: Partial<Form>) => setForm({ ...f, ...p })

  const loading = classes.isLoading || people.isLoading || bells.isLoading || lessons.isLoading
  const failed = classes.error || people.error || bells.error || lessons.error || saved.error

  function openSaved(r: SavedRow) {
    const os = [...r.gozetmen_oturumlar].sort((a, b) => a.sort - b.sort)
    setForm({
      id: r.id,
      title: r.title,
      type: r.exam_type,
      date: r.exam_date,
      note: r.note ?? '',
      oturumlar: os.map((o) => ({ key: o.id, name: o.name, starts: o.starts.slice(0, 5), ends: o.ends.slice(0, 5) })),
      classIds: r.gozetmen_siniflar.map((c) => c.class_id).filter((x): x is string => !!x),
      rooms: Object.fromEntries(r.gozetmen_siniflar.filter((c) => c.class_id && c.room).map((c) => [c.class_id!, c.room!])),
      gorevler: r.gozetmen_gorevler.map((g) => ({ ...g, oturum_key: g.oturum_id })),
    })
    setTab('plan')
  }

  return (
    <div className="gz">
      <header className="page-intro">
        <span className="label">Yönetim · Sınav görevlendirme</span>
        <h1 className="hd">Gözetmen Bul</h1>
        <p className="m">
          Deneme sınavının oturumlarını ve sınıflarını seç; ders programına göre kimin boşta olduğunu gör, gözetmen ve dinlendirici öğretmenleri ata,
          çizelgeyi indir.
        </p>
      </header>
      <div className="seg" role="group" aria-label="Görünüm">
        <button aria-pressed={tab === 'plan'} className={tab === 'plan' ? 'hwon' : ''} onClick={() => setTab('plan')}>
          {f.id ? 'Sınavı düzenle' : 'Yeni görevlendirme'}
        </button>
        <button aria-pressed={tab === 'gecmis'} className={tab === 'gecmis' ? 'hwon' : ''} onClick={() => setTab('gecmis')}>
          Geçmiş {saved.data?.length ? `(${saved.data.length})` : ''}
        </button>
      </div>
      {failed ? (
        <p role="alert" className="err">
          Veriler yüklenemedi. Sayfayı yenileyip tekrar dene.
        </p>
      ) : loading ? (
        <p role="status" className="m">
          <span className="spinner" aria-hidden="true" /> Ders programı ve öğretmenler yükleniyor…
        </p>
      ) : tab === 'plan' ? (
        <Planla
          f={f}
          set={set}
          reset={(t) => setForm(emptyForm(t, gradesOfType(t)))}
          classes={activeClasses}
          teachers={teachers}
          bells={bells.data ?? []}
          lessons={lessons.data ?? []}
          saved={saved.data ?? []}
          school={school.data?.name ?? 'Buluş Küre Koleji'}
          gradesOfType={gradesOfType}
        />
      ) : (
        <GecmisView rows={saved.data ?? []} teachers={teachers} onOpen={openSaved} school={school.data?.name ?? 'Buluş Küre Koleji'} onNew={() => { setForm(null); setTab('plan') }} />
      )}
    </div>
  )
}

type ClassLite = { id: string; name: string; grade: number; level: string }

function Planla(p: {
  f: Form
  set: (x: Partial<Form>) => void
  reset: (t: ExamType) => void
  classes: ClassLite[]
  teachers: Ogretmen[]
  bells: { period: number; starts: string; ends: string; active?: boolean }[]
  lessons: DersSatiri[]
  saved: SavedRow[]
  school: string
  gradesOfType: (t: ExamType) => string[]
}) {
  const { f, set, classes, teachers } = p
  const toast = useToast()
  const qc = useQueryClient()
  const [busy, setBusy] = useState(false)
  const [dinPer, setDinPer] = useState(8)
  const [haric, setHaric] = useState<Set<string>>(new Set())
  const [view, setView] = useState<string | null>(null)
  const weekday = isoDow(f.date)
  const cls = useMemo(() => classes.filter((c) => f.classIds.includes(c.id)), [classes, f.classIds])
  const siniflar = cls.map((c) => ({ class_id: c.id, class_name: c.name, room: f.rooms[c.id] ?? null }))
  const classNames = useMemo(() => new Map(classes.map((c) => [c.id, c.name])), [classes])
  const name = useMemo(() => new Map(teachers.map((t) => [t.id, t.full_name])), [teachers])

  const uygun = useMemo(() => {
    const m = new Map<string, Map<string, Uygunluk>>()
    const examIds = new Set(f.classIds)
    for (const o of f.oturumlar)
      m.set(o.key, uygunluk({ weekday, oturum: o, bells: p.bells, lessons: p.lessons, examClassIds: examIds, classNames, teachers }))
    return m
  }, [f.oturumlar, f.classIds, weekday, p.bells, p.lessons, classNames, teachers])

  // Son 12 ayın görevleri (bu sınav hariç): dengeli dağıtım ve "kaç görev aldı" bilgisi
  const gecmis = useMemo(() => {
    const from = new Date(Date.now() - 365 * 864e5).toISOString().slice(0, 10)
    const m = new Map<string, Gecmis>()
    for (const r of p.saved) {
      if (r.id === f.id || r.exam_date < from || r.status !== 'atandi') continue
      for (const g of r.gozetmen_gorevler) {
        if (!g.teacher_id) continue
        const x = m.get(g.teacher_id) ?? { gozetmen: 0, dinlendirici: 0 }
        x[g.role]++
        m.set(g.teacher_id, x)
      }
    }
    return m
  }, [p.saved, f.id])
  const past = (tid: string) => {
    const g = gecmis.get(tid)
    return g ? g.gozetmen + g.dinlendirici : 0
  }
  const issues = sorunlar({ oturumlar: f.oturumlar, siniflar, gorevler: f.gorevler, uygun, dinlendiriciBasina: dinPer })
  const serious = issues.filter((i) => i.ciddi)
  const conflictIds = useMemo(() => {
    const s = new Set<string>()
    for (const o of f.oturumlar) {
      const ids = f.gorevler.filter((g) => g.oturum_key === o.key && g.teacher_id).map((g) => g.teacher_id!)
      ids.forEach((id, i) => ids.indexOf(id) !== i && s.add(`${o.key}|${id}`))
    }
    return s
  }, [f.gorevler, f.oturumlar])

  // ---------- düzenleme ----------
  const setOturum = (key: string, x: Partial<Oturum>) => set({ oturumlar: f.oturumlar.map((o) => (o.key === key ? { ...o, ...x } : o)) })
  const addOturum = () => {
    const last = f.oturumlar.at(-1)
    const starts = last ? addMin(last.ends, PRESETS[f.type].mola || 30) : '09:30'
    set({ oturumlar: [...f.oturumlar, { key: newKey(), name: `${f.oturumlar.length + 1}. Oturum`, starts, ends: addMin(starts, 60) }] })
  }
  const removeOturum = (key: string) =>
    set({ oturumlar: f.oturumlar.filter((o) => o.key !== key), gorevler: f.gorevler.filter((g) => g.oturum_key !== key) })
  const toggleClass = (id: string) => {
    const on = f.classIds.includes(id)
    const c = classes.find((x) => x.id === id)
    set({
      classIds: on ? f.classIds.filter((x) => x !== id) : [...f.classIds, id],
      gorevler: on ? f.gorevler.filter((g) => !(g.role === 'gozetmen' && g.class_name === c?.name)) : f.gorevler,
    })
  }
  const pickClasses = (ids: string[]) => {
    const keep = new Set(ids.map((id) => classNames.get(id)))
    set({ classIds: ids, gorevler: f.gorevler.filter((g) => g.role !== 'gozetmen' || keep.has(g.class_name ?? '')) })
  }
  const setCell = (okey: string, className: string, classId: string, tid: string) => {
    const rest = f.gorevler.filter((g) => !(g.oturum_key === okey && g.role === 'gozetmen' && g.class_name === className))
    set({
      gorevler: tid ? [...rest, { oturum_key: okey, role: 'gozetmen', class_id: classId, class_name: className, teacher_id: tid, teacher_name: name.get(tid)! }] : rest,
    })
  }
  const addDin = (okey: string, tid: string) =>
    tid &&
    set({ gorevler: [...f.gorevler, { oturum_key: okey, role: 'dinlendirici', class_id: null, class_name: null, scope: null, teacher_id: tid, teacher_name: name.get(tid)! }] })
  const updDin = (g: Gorev, x: Partial<Gorev> | null) =>
    set({ gorevler: x ? f.gorevler.map((y) => (y === g ? { ...y, ...x } : y)) : f.gorevler.filter((y) => y !== g) })
  const autoFill = () => {
    const next = oneri({ oturumlar: f.oturumlar, siniflar, teachers, uygun, gecmis, gorevler: f.gorevler, dinlendiriciBasina: dinPer, haric })
    const added = next.length - f.gorevler.length
    set({ gorevler: next })
    toast(added ? `${added} görev önerildi. Gözden geçirip "Atamayı yap"a bas.` : 'Boş hücre kalmadı ya da uygun öğretmen yok.', added ? 'spark' : 'warn')
  }
  const applyType = (t: ExamType) => {
    if (t === f.type) return
    if (f.gorevler.length && !window.confirm('Sınav türü değişince oturumlar ve sınıflar hazır düzene döner; mevcut görevler silinir. Devam edilsin mi?')) return
    p.reset(t)
  }

  async function save(atama: boolean) {
    if (f.title.trim().length < 2) return toast('Sınav adını yaz.', 'warn')
    if (!f.oturumlar.length || !siniflar.length) return toast('En az bir oturum ve bir sınıf gerekli.', 'warn')
    if (f.oturumlar.some((o) => duration(o) <= 0)) return toast('Oturum saatlerini kontrol et.', 'warn')
    if (atama && serious.length && !window.confirm(`${serious.length} sorun var (ör. ${serious[0]!.text}). Yine de atama yapılsın mı?`)) return
    setBusy(true)
    const { data, error } = await supabase.rpc('gozetmen_kaydet', {
      p_sinav: f.id,
      p_atama: atama,
      p_data: {
        title: f.title,
        exam_type: f.type,
        exam_date: f.date,
        note: f.note,
        oturumlar: f.oturumlar.map((o) => ({ key: o.key, name: o.name, starts: o.starts, ends: o.ends })),
        siniflar,
        gorevler: f.gorevler.filter((g) => f.oturumlar.some((o) => o.key === g.oturum_key)),
      },
    })
    setBusy(false)
    if (error) return toast(error.message || 'Kaydedilemedi.', 'warn')
    await qc.invalidateQueries({ queryKey: ['gozetmen', 'sinavlar'] })
    set({ id: data as string })
    toast(atama ? 'Atama yapıldı ve kaydedildi' : 'Taslak kaydedildi')
  }

  const cizelge = () =>
    buildCizelge({ school: p.school, title: f.title, type: f.type, date: f.date, note: f.note, oturumlar: f.oturumlar, siniflar, gorevler: f.gorevler })
  async function download(kind: 'pdf' | 'png') {
    try {
      const m = await import('@/lib/gozetmenPdf')
      const blob = kind === 'pdf' ? await m.cizelgePdf(cizelge()) : await m.cizelgePng(cizelge())
      saveBlob(blob, `Gozetmen-Cizelgesi_${f.date}.${kind}`)
    } catch {
      toast(kind === 'pdf' ? 'PDF oluşturulamadı.' : 'Görsel oluşturulamadı.', 'warn')
    }
  }

  const ov = view && f.oturumlar.some((o) => o.key === view) ? view : f.oturumlar[0]?.key
  const ou = ov ? uygun.get(ov) : undefined
  const groups: Durum[] = ['bos', 'serbest', 'dersi_var']
  const grades = [...new Set(classes.map((c) => c.grade))].sort((a, b) => a - b)
  const load = new Map<string, number>()
  for (const g of f.gorevler) if (g.teacher_id) load.set(g.teacher_id, (load.get(g.teacher_id) ?? 0) + 1)

  return (
    <>
      {/* 1 · Sınav */}
      <section className="card gz-card">
        <div className="gz-step">
          <span className="gz-n">1</span>
          <h2 className="sec">Sınav</h2>
          {f.id && <span className="chip up">Kayıtlı sınav düzenleniyor</span>}
        </div>
        <div className="seg" role="group" aria-label="Sınav türü">
          {(Object.keys(TYPE_TR) as ExamType[]).map((t) => (
            <button key={t} aria-pressed={f.type === t} className={f.type === t ? 'hwon' : ''} onClick={() => applyType(t)}>
              {TYPE_TR[t]}
            </button>
          ))}
        </div>
        <div className="gz-fields">
          <label className="field">
            Sınav adı
            <input value={f.title} maxLength={120} onChange={(e) => set({ title: e.target.value })} />
          </label>
          <label className="field">
            Tarih
            <input type="date" value={f.date} onChange={(e) => e.target.value && set({ date: e.target.value })} />
          </label>
        </div>
        <p className="m gz-day">
          <Icon name="cal" size={16} /> {trDW(f.date)} ·{' '}
          {weekday > 6 ? 'Pazar günü ders yok; bütün öğretmenler boşta görünür.' : `${GUN[weekday]} ders programına göre analiz ediliyor.`}
        </p>
        <div className="gz-otlist">
          {f.oturumlar.map((o) => (
            <div className="gz-ot" key={o.key}>
              <label className="field gz-otname">
                Oturum
                <input value={o.name} maxLength={60} onChange={(e) => setOturum(o.key, { name: e.target.value })} />
              </label>
              <label className="field">
                Başlangıç
                <input
                  type="time"
                  value={o.starts}
                  onChange={(e) => e.target.value && setOturum(o.key, { starts: e.target.value, ends: addMin(e.target.value, duration(o)) })}
                />
              </label>
              <label className="field">
                Süre (dk)
                <input
                  type="number"
                  min={10}
                  max={400}
                  value={duration(o)}
                  onChange={(e) => Number(e.target.value) > 0 && setOturum(o.key, { ends: addMin(o.starts, Number(e.target.value)) })}
                />
              </label>
              <label className="field">
                Bitiş
                <input type="time" value={o.ends} onChange={(e) => e.target.value && setOturum(o.key, { ends: e.target.value })} />
              </label>
              <button className="btn sm" aria-label={`${o.name} oturumunu kaldır`} disabled={f.oturumlar.length < 2} onClick={() => removeOturum(o.key)}>
                <Icon name="trash" size={16} />
              </button>
            </div>
          ))}
          <div className="btns">
            <button className="btn sm" onClick={addOturum} disabled={f.oturumlar.length >= 6}>
              <Icon name="plus" size={16} /> Oturum ekle
            </button>
            {f.oturumlar.length > 1 && (
              <span className="m gz-mola">
                Oturum arası:{' '}
                {f.oturumlar
                  .slice(1)
                  .map((o, i) => `${Math.max(0, duration({ starts: f.oturumlar[i]!.ends, ends: o.starts }))} dk`)
                  .join(' · ')}
              </span>
            )}
          </div>
        </div>
        <label className="field" style={{ marginTop: 12 }}>
          Not (çizelgede görünür, isteğe bağlı)
          <input value={f.note} maxLength={300} placeholder="Ör. Gözetmenler 09.15'te öğretmenler odasında toplanır." onChange={(e) => set({ note: e.target.value })} />
        </label>
      </section>

      {/* 2 · Sınıflar */}
      <section className="card gz-card">
        <div className="gz-step">
          <span className="gz-n">2</span>
          <h2 className="sec">Sınava girecek sınıflar</h2>
          <span className="chip n">{cls.length} sınıf</span>
        </div>
        <div className="btns gz-quick">
          <button className="btn sm" onClick={() => pickClasses(classes.filter((c) => c.grade >= 5 && c.grade <= 8).map((c) => c.id))}>
            Tüm ortaokul
          </button>
          <button className="btn sm" onClick={() => pickClasses(classes.filter((c) => c.grade >= 9).map((c) => c.id))}>
            Tüm lise
          </button>
          <button className="btn sm" onClick={() => pickClasses(classes.map((c) => c.id))}>
            Tüm okul
          </button>
          {PRESETS[f.type].grades.length > 0 && (
            <button className="btn sm" onClick={() => pickClasses(p.gradesOfType(f.type))}>
              {TYPE_TR[f.type]} sınıfları
            </button>
          )}
          <button className="btn sm" onClick={() => pickClasses([])}>
            Temizle
          </button>
        </div>
        <div className="gz-grades">
          {grades.map((gr) => {
            const ids = classes.filter((c) => c.grade === gr).map((c) => c.id)
            const allOn = ids.every((id) => f.classIds.includes(id))
            return (
              <div className="gz-grade" key={gr}>
                <button
                  className={`gz-gradebtn${allOn ? ' on' : ''}`}
                  aria-pressed={allOn}
                  onClick={() => pickClasses(allOn ? f.classIds.filter((id) => !ids.includes(id)) : [...new Set([...f.classIds, ...ids])])}
                >
                  {gr}. sınıflar
                </button>
                {classes
                  .filter((c) => c.grade === gr)
                  .map((c) => (
                    <button key={c.id} className={`gz-cls${f.classIds.includes(c.id) ? ' on' : ''}`} aria-pressed={f.classIds.includes(c.id)} onClick={() => toggleClass(c.id)}>
                      {c.name}
                    </button>
                  ))}
              </div>
            )
          })}
          {!classes.length && <p className="m">Henüz sınıf yok. Sınıflar Yönetim bölümünden açılır.</p>}
        </div>
      </section>

      {/* 3 · Uygunluk */}
      <section className="card gz-card">
        <div className="gz-step">
          <span className="gz-n">3</span>
          <h2 className="sec">Öğretmen uygunluğu</h2>
        </div>
        {f.oturumlar.length > 1 && (
          <div className="seg" role="group" aria-label="Oturum">
            {f.oturumlar.map((o) => (
              <button key={o.key} aria-pressed={ov === o.key} className={ov === o.key ? 'hwon' : ''} onClick={() => setView(o.key)}>
                {o.name} · {o.starts}–{o.ends}
              </button>
            ))}
          </div>
        )}
        <p className="m gz-hint">
          Bir öğretmene dokunarak bu sınavda görev verilmeyecekler arasına alabilirsin (izin, rapor vb.). Rakam: son 12 ayda aldığı görev sayısı.
        </p>
        <div className="gz-avail">
          {groups.map((d) => {
            const list = teachers.filter((t) => ou?.get(t.id)?.durum === d)
            return (
              <div key={d} className={`gz-col gz-${d}`}>
                <h3>
                  {d === 'dersi_var' ? <Icon name="warn" size={16} /> : <Icon name="check" size={16} />} {DURUM_TR[d]} <span className="chip n">{list.length}</span>
                </h3>
                <ul>
                  {list.map((t) => {
                    const u = ou!.get(t.id)!
                    const x = haric.has(t.id)
                    return (
                      <li key={t.id}>
                        <button
                          className={`gz-t${x ? ' off' : ''}`}
                          aria-pressed={x}
                          title={x ? 'Görev verilmeyecek; tekrar dokun' : 'Görev verilmeyecekler arasına al'}
                          onClick={() => setHaric((h) => { const n = new Set(h); if (n.has(t.id)) n.delete(t.id); else n.add(t.id); return n })}
                        >
                          <span className="gz-tn">{t.full_name}</span>
                          <span className="gz-tc">{past(t.id)}</span>
                        </button>
                        {u.dersler.length > 0 && (
                          <span className="gz-ders">
                            {u.dersler.map((l) => `${l.period}. ders ${l.class_name} ${l.subject}${l.inExam ? ' (sınavda)' : ''}`).join(' · ')}
                          </span>
                        )}
                        {x && <span className="gz-ders">Görev verilmeyecek</span>}
                      </li>
                    )
                  })}
                  {!list.length && <li className="m">—</li>}
                </ul>
              </div>
            )
          })}
        </div>
        {!p.bells.length && <p className="err">Ders saatleri tanımlı değil; uygunluk hesaplanamaz. Ders saatleri Yönetim bölümünden eklenir.</p>}
      </section>

      {/* 4 · Görevlendirme */}
      <section className="card gz-card">
        <div className="gz-step">
          <span className="gz-n">4</span>
          <h2 className="sec">Görevlendirme</h2>
          <span className="chip n">{f.gorevler.length} görev</span>
        </div>
        <div className="gz-tools">
          <button className="btn gold" onClick={autoFill} disabled={!siniflar.length}>
            <Icon name="spark" size={16} /> Akıllı dağıt
          </button>
          <label className="gz-din">
            Her
            <input type="number" min={0} max={40} value={dinPer} onChange={(e) => setDinPer(Math.max(0, Math.min(40, Number(e.target.value) || 0)))} />
            sınıfa 1 dinlendirici
          </label>
          <button className="btn sm" disabled={!f.gorevler.length} onClick={() => window.confirm('Bütün görevler temizlensin mi?') && set({ gorevler: [] })}>
            Görevleri temizle
          </button>
        </div>
        <p className="m gz-hint">
          Akıllı dağıt yalnız boş hücreleri doldurur: dersi olan öğretmeni seçmez, aynı kişiyi çakışan oturumlara yazmaz, geçmişte daha az görev almış
          öğretmenlere öncelik verir. Seçtiğin görevlere dokunmaz.
        </p>
        {siniflar.length ? (
          <div className="tbl gz-tbl">
            <table>
              <thead>
                <tr>
                  <th>Sınıf</th>
                  <th>Salon</th>
                  {f.oturumlar.map((o) => (
                    <th key={o.key}>
                      {o.name}
                      <span className="gz-th">
                        {o.starts}–{o.ends}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {cls.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <b>{c.name}</b>
                    </td>
                    <td>
                      <input
                        className="gz-room"
                        aria-label={`${c.name} salonu`}
                        placeholder="Kendi sınıfı"
                        maxLength={40}
                        value={f.rooms[c.id] ?? ''}
                        onChange={(e) => set({ rooms: { ...f.rooms, [c.id]: e.target.value } })}
                      />
                    </td>
                    {f.oturumlar.map((o) => {
                      const g = f.gorevler.find((x) => x.oturum_key === o.key && x.role === 'gozetmen' && x.class_name === c.name)
                      const u = g?.teacher_id ? uygun.get(o.key)?.get(g.teacher_id) : undefined
                      const bad = !!g?.teacher_id && (u?.durum === 'dersi_var' || conflictIds.has(`${o.key}|${g.teacher_id}`))
                      return (
                        <td key={o.key}>
                          <TeacherSelect
                            label={`${o.name} · ${c.name} gözetmeni`}
                            value={g?.teacher_id ?? ''}
                            bad={bad}
                            teachers={teachers}
                            uyg={uygun.get(o.key)}
                            past={past}
                            onChange={(tid) => setCell(o.key, c.name, c.id, tid)}
                          />
                        </td>
                      )
                    })}
                  </tr>
                ))}
                <tr className="gz-dinrow">
                  <td colSpan={2}>
                    <b>Dinlendirici</b>
                  </td>
                  {f.oturumlar.map((o) => (
                    <td key={o.key}>
                      {f.gorevler
                        .filter((g) => g.oturum_key === o.key && g.role === 'dinlendirici')
                        .map((g, i) => (
                          <div className={`gz-dinitem${g.teacher_id && conflictIds.has(`${o.key}|${g.teacher_id}`) ? ' bad' : ''}`} key={`${g.teacher_id}${i}`}>
                            <span>{g.teacher_name}</span>
                            <input
                              aria-label={`${g.teacher_name} sorumlu olduğu yer`}
                              placeholder="Sorumlu olduğu yer"
                              maxLength={80}
                              value={g.scope ?? ''}
                              onChange={(e) => updDin(g, { scope: e.target.value })}
                            />
                            <button className="xbtn" aria-label={`${g.teacher_name} dinlendirici görevini kaldır`} onClick={() => updDin(g, null)}>
                              <Icon name="x" size={14} />
                            </button>
                          </div>
                        ))}
                      <TeacherSelect label={`${o.name} dinlendirici ekle`} value="" teachers={teachers} uyg={uygun.get(o.key)} past={past} onChange={(tid) => addDin(o.key, tid)} placeholder="+ Dinlendirici ekle" />
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty">
            <p>Önce sınava girecek sınıfları seç.</p>
          </div>
        )}

        <div className="gz-issues" role="status">
          {issues.length ? (
            issues.map((i, n) => (
              <p key={n} className={i.ciddi ? 'bad' : ''}>
                <Icon name="warn" size={15} /> {i.text}
              </p>
            ))
          ) : siniflar.length ? (
            <p className="ok">
              <Icon name="check" size={15} /> Bütün sınıflara gözetmen atandı; çakışma yok.
            </p>
          ) : null}
        </div>
        {load.size > 0 && (
          <div className="gz-load">
            <span className="m">Bu sınavdaki görev sayısı:</span>
            {[...load.entries()]
              .sort((a, b) => b[1] - a[1] || (name.get(a[0]) ?? '').localeCompare(name.get(b[0]) ?? '', 'tr'))
              .map(([tid, n]) => (
                <span key={tid} className={`chip ${n > 1 ? 'gold' : 'n'}`}>
                  {name.get(tid) ?? '?'} {n}
                </span>
              ))}
          </div>
        )}
      </section>

      <div className="gz-actions">
        <button className="btn" disabled={busy} onClick={() => save(false)}>
          Taslak kaydet
        </button>
        <button className="btn" disabled={!f.gorevler.length} onClick={() => download('png')}>
          <Icon name="image" size={16} /> Görsel indir
        </button>
        <button className="btn" disabled={!f.gorevler.length} onClick={() => download('pdf')}>
          <Icon name="doc" size={16} /> PDF indir
        </button>
        <button className="btn pri gz-ata" disabled={busy || !siniflar.length} onClick={() => save(true)}>
          {busy ? <span className="spinner" aria-hidden="true" /> : <Icon name="check" size={18} />} ATAMAYI YAP
        </button>
      </div>
    </>
  )
}

function TeacherSelect(p: {
  label: string
  value: string
  teachers: Ogretmen[]
  uyg: Map<string, Uygunluk> | undefined
  past: (tid: string) => number
  onChange: (tid: string) => void
  bad?: boolean
  placeholder?: string
}) {
  const by = (d: Durum) => p.teachers.filter((t) => (p.uyg?.get(t.id)?.durum ?? 'bos') === d)
  return (
    <select className={`gz-sel${p.bad ? ' bad' : ''}${p.value ? ' set' : ''}`} aria-label={p.label} value={p.value} onChange={(e) => p.onChange(e.target.value)}>
      <option value="">{p.placeholder ?? '— Seç —'}</option>
      {(['bos', 'serbest', 'dersi_var'] as Durum[]).map((d) => (
        <optgroup key={d} label={DURUM_TR[d]}>
          {by(d).map((t) => (
            <option key={t.id} value={t.id}>
              {t.full_name} ({p.past(t.id)}){d === 'dersi_var' ? ' · dersi var' : ''}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  )
}

function GecmisView(p: { rows: SavedRow[]; teachers: Ogretmen[]; onOpen: (r: SavedRow) => void; onNew: () => void; school: string }) {
  const toast = useToast()
  const qc = useQueryClient()
  const stats = useMemo(() => {
    const m = new Map<string, { ad: string; gozetmen: number; dinlendirici: number; son: string }>()
    for (const r of p.rows) {
      if (r.status !== 'atandi') continue
      for (const g of r.gozetmen_gorevler) {
        const k = g.teacher_id ?? g.teacher_name
        const x = m.get(k) ?? { ad: g.teacher_name, gozetmen: 0, dinlendirici: 0, son: '' }
        x[g.role]++
        if (r.exam_date > x.son) x.son = r.exam_date
        m.set(k, x)
      }
    }
    for (const t of p.teachers) if (!m.has(t.id)) m.set(t.id, { ad: t.full_name, gozetmen: 0, dinlendirici: 0, son: '' })
    return [...m.values()].sort((a, b) => b.gozetmen + b.dinlendirici - (a.gozetmen + a.dinlendirici) || a.ad.localeCompare(b.ad, 'tr'))
  }, [p.rows, p.teachers])
  async function remove(r: SavedRow) {
    if (!window.confirm(`"${r.title}" (${trD(r.exam_date)}) ve bütün görevleri silinsin mi?`)) return
    const { error } = await supabase.from('gozetmen_sinavlar').delete().eq('id', r.id)
    if (error) return toast(error.message || 'Silinemedi.', 'warn')
    await qc.invalidateQueries({ queryKey: ['gozetmen', 'sinavlar'] })
    toast('Sınav silindi')
  }
  async function pdfOf(r: SavedRow) {
    const os = [...r.gozetmen_oturumlar].sort((a, b) => a.sort - b.sort)
    try {
      const m = await import('@/lib/gozetmenPdf')
      const blob = await m.cizelgePdf(
        buildCizelge({
          school: p.school,
          title: r.title,
          type: r.exam_type,
          date: r.exam_date,
          note: r.note ?? '',
          oturumlar: os.map((o) => ({ key: o.id, name: o.name, starts: o.starts.slice(0, 5), ends: o.ends.slice(0, 5) })),
          siniflar: r.gozetmen_siniflar,
          gorevler: r.gozetmen_gorevler.map((g) => ({ ...g, oturum_key: g.oturum_id })),
        }),
      )
      saveBlob(blob, `Gozetmen-Cizelgesi_${r.exam_date}.pdf`)
    } catch {
      toast('PDF oluşturulamadı.', 'warn')
    }
  }
  const max = Math.max(1, ...stats.map((s) => s.gozetmen + s.dinlendirici))
  return (
    <>
      <div className="btns">
        <button className="btn pri" onClick={p.onNew}>
          <Icon name="plus" size={16} /> Yeni görevlendirme
        </button>
      </div>
      {p.rows.length ? (
        <div className="gz-hist">
          {p.rows.map((r) => (
            <section key={r.id} className="card gz-hcard">
              <div className="kv">
                <b>{r.title}</b>
                <span className={`chip ${r.status === 'atandi' ? 'up' : 'n'}`}>{r.status === 'atandi' ? 'Atandı' : 'Taslak'}</span>
              </div>
              <p className="m">
                {trDW(r.exam_date)} · {TYPE_TR[r.exam_type]} · {r.gozetmen_siniflar.length} sınıf · {r.gozetmen_oturumlar.length} oturum ·{' '}
                {r.gozetmen_gorevler.length} görev
              </p>
              <div className="btns">
                <button className="btn sm" onClick={() => p.onOpen(r)}>
                  <Icon name="pen" size={15} /> Aç
                </button>
                <button className="btn sm" onClick={() => pdfOf(r)}>
                  <Icon name="doc" size={15} /> PDF
                </button>
                <button className="btn sm" onClick={() => remove(r)}>
                  <Icon name="trash" size={15} /> Sil
                </button>
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="empty">
          <p>Henüz kaydedilmiş görevlendirme yok.</p>
        </div>
      )}
      <section className="card gz-card">
        <h2 className="sec">Öğretmen görev dağılımı</h2>
        <p className="m gz-hint">Atanmış bütün sınavlardaki toplam görevler. Akıllı dağıt son 12 ayı dikkate alır.</p>
        <div className="tbl">
          <table>
            <thead>
              <tr>
                <th>Öğretmen</th>
                <th>Gözetmen</th>
                <th>Dinlendirici</th>
                <th>Son görev</th>
                <th aria-label="Dağılım" />
              </tr>
            </thead>
            <tbody>
              {stats.map((s) => (
                <tr key={s.ad}>
                  <td>{s.ad}</td>
                  <td className="num">{s.gozetmen}</td>
                  <td className="num">{s.dinlendirici}</td>
                  <td>{s.son ? trD(s.son) : '—'}</td>
                  <td style={{ width: '30%' }}>
                    <span className="gz-bar" style={{ width: `${((s.gozetmen + s.dinlendirici) / max) * 100}%` }} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  )
}

function buildCizelge(d: {
  school: string
  title: string
  type: ExamType
  date: string
  note: string
  oturumlar: Oturum[]
  siniflar: { class_id: string | null; class_name: string; room?: string | null }[]
  gorevler: Gorev[]
}) {
  const sorted = [...d.siniflar].sort((a, b) => a.class_name.localeCompare(b.class_name, 'tr', { numeric: true }))
  const per = new Map<string, string[]>()
  for (const o of d.oturumlar)
    for (const g of d.gorevler.filter((x) => x.oturum_key === o.key)) {
      const t = g.role === 'gozetmen' ? `${o.name}: ${g.class_name}` : `${o.name}: dinlendirici${g.scope ? ` (${g.scope})` : ''}`
      per.set(g.teacher_name, [...(per.get(g.teacher_name) ?? []), t])
    }
  return {
    school: d.school,
    title: d.title,
    type: TYPE_TR[d.type],
    date: new Date(`${d.date}T12:00:00Z`).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', weekday: 'long', timeZone: 'UTC' }),
    note: d.note,
    printed: new Date().toLocaleString('tr-TR', { dateStyle: 'long', timeStyle: 'short' }),
    oturumlar: d.oturumlar.map((o) => ({ name: o.name, saat: `${o.starts}–${o.ends}` })),
    rows: sorted.map((c) => ({
      sinif: c.class_name,
      salon: c.room ?? '',
      cells: d.oturumlar.map((o) =>
        d.gorevler
          .filter((g) => g.oturum_key === o.key && g.role === 'gozetmen' && g.class_name === c.class_name)
          .map((g) => g.teacher_name)
          .join(', '),
      ),
    })),
    dinlendirici: d.oturumlar.map((o) =>
      d.gorevler
        .filter((g) => g.oturum_key === o.key && g.role === 'dinlendirici')
        .map((g) => `${g.teacher_name}${g.scope ? ` (${g.scope})` : ''}`)
        .join(', '),
    ),
    ogretmenler: [...per.entries()].sort((a, b) => a[0].localeCompare(b[0], 'tr')).map(([ad, g]) => ({ ad, gorev: g.join(' · ') })),
  }
}

function saveBlob(blob: Blob, filename: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000)
}
