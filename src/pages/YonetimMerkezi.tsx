// Yönetim Merkezi (Faz A): genel ayarlar, modüller, eğitim yılları, ders kataloğu, ders saatleri, ders atamaları.
// Yazma yetkisi veritabanında (RLS + 0011–0012 fonksiyonları, aal2) zorlanır; bu ekran yalnız arayüzdür.
import { useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/auth/AuthProvider'
import { useAcademicYears, useAssignments, useBellTimes, useCourses, useModules, useSettings, type AcademicYear, type Course } from '@/lib/data'
import { LEVEL_TR, LEVELS, MODULE_DEFAULTS, type Level, type ModuleId } from '@/lib/roles'
import { trD } from '@/lib/format'
import type { ClassRow, Profile } from '@/lib/types'
import { Modal } from '@/components/Modal'
import { ConfirmDelete } from '@/components/ConfirmDelete'
import { Icon } from '@/components/Icon'
import { useToast } from '@/components/Toast'
import { SchoolLogo } from '@/components/Icon'
import { useSchoolInfo } from '@/lib/files'

const errText = (e: { code?: string; message?: string } | null, dup = 'Bu kayıt zaten var.') =>
  !e ? null : e.code === '23505' ? dup : /row-level security|42501/i.test(`${e.code} ${e.message}`) ? 'Bu işlem için yönetici yetkisi gerekir.' : (e.message ?? 'Kaydedilemedi.')

function useInvalidate() {
  const qc = useQueryClient()
  return (...keys: string[]) => keys.forEach((k) => qc.invalidateQueries({ queryKey: [k] }))
}

function Check({ on, onClick, label, hint }: { on: boolean; onClick: () => void; label: string; hint?: string }) {
  return (
    <button type="button" className="check" role="switch" aria-checked={on} onClick={onClick} style={{ alignItems: 'flex-start' }}>
      <span className={`box ${on ? 'on' : ''}`}>{on && <Icon name="check" size={13} stroke={3} />}</span>
      <span style={{ flex: 1, textAlign: 'left' }}>
        <b style={{ display: 'block', fontSize: 14 }}>{label}</b>
        {hint && (
          <span className="m" style={{ fontSize: 12, fontWeight: 400 }}>
            {hint}
          </span>
        )}
      </span>
    </button>
  )
}

// ---------------------------------------------------------------- Genel ayarlar
export function GenelAyarlar({ schoolName }: { schoolName: string }) {
  const s = useSettings()
  const toast = useToast()
  const inv = useInvalidate()
  const years = useAcademicYears()
  const [f, setF] = useState({ okul_adi: '', telefon: '', eposta: '', adres: '' })
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    const d = s.data ?? {}
    setF({ okul_adi: (d['genel.okul_adi'] as string) ?? schoolName, telefon: (d['genel.telefon'] as string) ?? '', eposta: (d['genel.eposta'] as string) ?? '', adres: (d['genel.adres'] as string) ?? '' })
  }, [s.data, schoolName])
  async function save() {
    setBusy(true)
    const { error } = await supabase.rpc('set_settings', { p: { 'genel.okul_adi': f.okul_adi, 'genel.telefon': f.telefon, 'genel.eposta': f.eposta, 'genel.adres': f.adres } })
    setBusy(false)
    if (error) return toast(errText(error)!, 'warn')
    inv('school_settings', 'school')
    toast('Genel ayarlar kaydedildi')
  }
  const active = years.data?.find((y) => y.is_active)
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF((x) => ({ ...x, [k]: e.target.value }))
  return (
    <section className="card a" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }} aria-label="Genel ayarlar">
      <label className="field" htmlFor="gAd">
        Okul adı
        <input id="gAd" value={f.okul_adi} onChange={set('okul_adi')} maxLength={120} />
      </label>
      <div className="grid2">
        <label className="field" htmlFor="gTel">
          Telefon
          <input id="gTel" value={f.telefon} onChange={set('telefon')} maxLength={40} inputMode="tel" />
        </label>
        <label className="field" htmlFor="gMail">
          E-posta
          <input id="gMail" type="email" value={f.eposta} onChange={set('eposta')} maxLength={120} />
        </label>
      </div>
      <label className="field" htmlFor="gAdres">
        Adres
        <textarea id="gAdres" rows={2} value={f.adres} onChange={set('adres')} maxLength={300} />
      </label>
      <LogoField />
      <div className="kv">
        <span className="m" style={{ fontSize: 13 }}>
          Aktif eğitim yılı: <b>{active?.name ?? '—'}</b> (Eğitim yılları bölümünden değiştirilir).
        </span>
        <button className="btn pri" onClick={save} disabled={busy}>
          {busy && <span className="spinner" aria-hidden="true" />} Kaydet
        </button>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------- Modüller
const MODULES: [ModuleId, string, string][] = [
  ['lgs', 'LGS / Deneme', 'Deneme yükleme, analiz, sınıf ısı haritası, veli raporları'],
  ['yoklama', 'Yoklama', 'Günlük yoklama ve devamsızlık bildirimleri'],
  ['ders_programi', 'Ders programı', 'Sınıf programları, veli ve öğrenci görünümü'],
  ['yemek', 'Yemek listesi', 'Haftalık yemek listesi'],
  ['duyuru', 'Duyurular', 'Okul, kademe ve sınıf duyuruları'],
  ['mesaj', 'Mesajlaşma', 'Veli–öğretmen yazışmaları'],
  ['odev', 'Ödev sistemi', 'Faz B ile gelecek'],
  ['takvim', 'Takvim', 'Faz D ile gelecek'],
  ['bursluluk', 'Bursluluk', 'Faz G ile gelecek'],
]
const SOON: ModuleId[] = ['odev', 'takvim', 'bursluluk']

export function Moduller() {
  const mods = useModules()
  const toast = useToast()
  const inv = useInvalidate()
  const [busy, setBusy] = useState<ModuleId | null>(null)
  async function toggle(m: ModuleId, label: string) {
    setBusy(m)
    const { error } = await supabase.rpc('set_settings', { p: { [`modul.${m}`]: !mods[m] } })
    setBusy(null)
    if (error) return toast(errText(error)!, 'warn')
    inv('school_settings')
    toast(`${label} ${mods[m] ? 'kapatıldı' : 'açıldı'}`)
  }
  return (
    <>
      <p className="m a" style={{ fontSize: 13 }}>
        Kapatılan modül menülerden ve ekranlardan kalkar; yönetici dışında kimse o modülün verisini göremez ve yazamaz. Veri silinmez; modül açılınca geri gelir.
      </p>
      <section className="card a" style={{ ['--d' as string]: 1, overflow: 'hidden' }} aria-label="Modüller">
        {MODULES.map(([m, label, hint]) => (
          <div key={m} className="srow" style={{ cursor: 'default' }} data-testid="module-row">
            <span style={{ flex: 1, minWidth: 0 }}>
              <b style={{ display: 'block' }}>{label}</b>
              <span className="m" style={{ fontSize: 12 }}>
                {hint}
              </span>
            </span>
            {SOON.includes(m) && <span className="chip n">Yakında</span>}
            <button
              type="button"
              role="switch"
              aria-checked={mods[m]}
              aria-label={`${label} modülü`}
              className={`btn sm ${mods[m] ? 'pri' : ''}`}
              style={{ minWidth: 86 }}
              disabled={busy === m}
              onClick={() => toggle(m, label)}
            >
              {mods[m] ? 'Açık' : 'Kapalı'}
            </button>
          </div>
        ))}
      </section>
      <p className="m" style={{ fontSize: 12 }}>
        Varsayılanlar: bursluluk dışında hepsi açık. Ödeme takibi, kulüpler ve anketler ileride bu listeye eklenecek.
      </p>
    </>
  )
}
export { MODULE_DEFAULTS }

// ---------------------------------------------------------------- Eğitim yılları
export function EgitimYillari() {
  const years = useAcademicYears()
  const [edit, setEdit] = useState<AcademicYear | 'new' | null>(null)
  const toast = useToast()
  const inv = useInvalidate()
  async function activate(y: AcademicYear) {
    const { error } = await supabase.from('academic_years').update({ is_active: true }).eq('id', y.id)
    if (error) return toast(errText(error)!, 'warn')
    inv('academic_years')
    toast(`${y.name} aktif eğitim yılı yapıldı`)
  }
  return (
    <>
      <div className="kv a">
        <span className="m" style={{ fontSize: 13 }}>
          Dönem tarihleri devamsızlık limitleri ve raporlarında kullanılır. Aynı anda tek bir yıl aktiftir.
        </span>
        <button className="btn pri" onClick={() => setEdit('new')}>
          <Icon name="plus" size={18} stroke={2} /> Eğitim yılı ekle
        </button>
      </div>
      <section className="card a" style={{ ['--d' as string]: 1, overflow: 'hidden' }}>
        <div className="tbl">
          <table>
            <thead>
              <tr>
                <th>Yıl</th>
                <th>1. dönem</th>
                <th>2. dönem</th>
                <th>Durum</th>
                <th aria-label="İşlemler" />
              </tr>
            </thead>
            <tbody>
              {(years.data ?? []).map((y) => (
                <tr key={y.id} data-testid="year-row">
                  <td>
                    <b>{y.name}</b>
                  </td>
                  <td>
                    {trD(y.starts)} – {trD(y.term1_ends)}
                  </td>
                  <td>
                    {trD(y.term2_starts)} – {trD(y.ends)}
                  </td>
                  <td>{y.is_active ? <span className="chip up">Aktif</span> : <span className="chip n">Pasif</span>}</td>
                  <td>
                    <div className="btns" style={{ justifyContent: 'flex-end' }}>
                      {!y.is_active && (
                        <button className="btn sm" onClick={() => activate(y)}>
                          Aktif yap
                        </button>
                      )}
                      <button className="btn sm" onClick={() => setEdit(y)} aria-label={`${y.name} düzenle`}>
                        <Icon name="pen" size={15} /> Düzenle
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {edit && <YearModal y={edit === 'new' ? null : edit} onClose={() => setEdit(null)} />}
    </>
  )
}

function YearModal({ y, onClose }: { y: AcademicYear | null; onClose: () => void }) {
  const { profile } = useAuth()
  const toast = useToast()
  const inv = useInvalidate()
  const base = new Date().getFullYear() + (y ? 0 : 1)
  const [f, setF] = useState({
    name: y?.name ?? `${base}-${base + 1}`,
    starts: y?.starts ?? `${base}-09-08`,
    term1_ends: y?.term1_ends ?? `${base + 1}-01-22`,
    term2_starts: y?.term2_starts ?? `${base + 1}-02-08`,
    ends: y?.ends ?? `${base + 1}-06-25`,
  })
  const [err, setErr] = useState<string | null>(null)
  async function save() {
    if (!(f.starts < f.term1_ends && f.term1_ends < f.term2_starts && f.term2_starts < f.ends)) return setErr('Tarihler sırayla olmalı: başlangıç < 1. dönem sonu < 2. dönem başı < bitiş.')
    const { error } = y ? await supabase.from('academic_years').update(f).eq('id', y.id) : await supabase.from('academic_years').insert({ ...f, school_id: profile!.school_id })
    if (error) return setErr(errText(error, `${f.name} zaten var.`))
    inv('academic_years')
    toast(`${f.name} kaydedildi`)
    onClose()
  }
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF((x) => ({ ...x, [k]: e.target.value }))
  return (
    <Modal
      title={y ? `${y.name} eğitim yılı` : 'Eğitim yılı ekle'}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Vazgeç
          </button>
          <button className="btn pri" onClick={save}>
            Kaydet
          </button>
        </>
      }
    >
      <label className="field" htmlFor="yName">
        Ad (ör. 2026-2027)
        <input id="yName" value={f.name} onChange={set('name')} pattern="\d{4}-\d{4}" />
      </label>
      <div className="grid2">
        <label className="field" htmlFor="yS">
          Başlangıç
          <input id="yS" type="date" value={f.starts} onChange={set('starts')} />
        </label>
        <label className="field" htmlFor="yT1">
          1. dönem sonu
          <input id="yT1" type="date" value={f.term1_ends} onChange={set('term1_ends')} />
        </label>
        <label className="field" htmlFor="yT2">
          2. dönem başı
          <input id="yT2" type="date" value={f.term2_starts} onChange={set('term2_starts')} />
        </label>
        <label className="field" htmlFor="yE">
          Bitiş
          <input id="yE" type="date" value={f.ends} onChange={set('ends')} />
        </label>
      </div>
      {err && (
        <div className="err" role="alert">
          {err}
        </div>
      )}
    </Modal>
  )
}

// ---------------------------------------------------------------- Dersler
export function Dersler() {
  const courses = useCourses()
  const [edit, setEdit] = useState<Course | 'new' | null>(null)
  const [del, setDel] = useState<Course | null>(null)
  const [lv, setLv] = useState<'all' | Level>('all')
  const toast = useToast()
  const inv = useInvalidate()
  const list = (courses.data ?? []).filter((c) => lv === 'all' || !c.levels.length || c.levels.includes(lv))
  return (
    <>
      <div className="kv a" style={{ alignItems: 'flex-end' }}>
        <label className="field" htmlFor="dLv" style={{ minWidth: 160 }}>
          Kademe
          <select id="dLv" value={lv} onChange={(e) => setLv(e.target.value as 'all' | Level)}>
            <option value="all">Hepsi</option>
            {LEVELS.map((l) => (
              <option key={l} value={l}>
                {LEVEL_TR[l]}
              </option>
            ))}
          </select>
        </label>
        <button className="btn pri" onClick={() => setEdit('new')}>
          <Icon name="plus" size={18} stroke={2} /> Ders ekle
        </button>
      </div>
      <section className="card a" style={{ ['--d' as string]: 1, overflow: 'hidden' }} aria-label="Ders kataloğu">
        <div className="tbl">
          <table>
            <thead>
              <tr>
                <th>Ders</th>
                <th>Kısa ad</th>
                <th>Kademe</th>
                <th>Durum</th>
                <th aria-label="İşlemler" />
              </tr>
            </thead>
            <tbody>
              {list.map((c) => (
                <tr key={c.id} data-testid="course-row">
                  <td>
                    <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: 99, background: c.color ?? 'var(--line-strong)' }} />
                      <b>{c.name}</b>
                    </span>
                  </td>
                  <td className="mono">{c.short_name}</td>
                  <td>{c.levels.length ? c.levels.map((l) => LEVEL_TR[l]).join(', ') : 'Hepsi'}</td>
                  <td>{c.active ? <span className="chip up">Aktif</span> : <span className="chip n">Pasif</span>}</td>
                  <td>
                    <div className="btns" style={{ justifyContent: 'flex-end' }}>
                      <button className="btn sm" onClick={() => setEdit(c)} aria-label={`${c.name} dersini düzenle`}>
                        <Icon name="pen" size={15} /> Düzenle
                      </button>
                      <button className="btn sm" onClick={() => setDel(c)} aria-label={`${c.name} dersini sil`}>
                        <Icon name="trash" size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {edit && <CourseModal c={edit === 'new' ? null : edit} onClose={() => setEdit(null)} />}
      {del && (
        <ConfirmDelete
          title={`${del.name} dersini sil`}
          name={del.name}
          onClose={() => setDel(null)}
          onConfirm={async () => {
            const { error } = await supabase.from('courses').delete().eq('id', del.id)
            if (error) return error.code === '23503' ? 'Bu ders ders programında kullanılıyor; silmek yerine pasif yap.' : errText(error)
            inv('courses', 'teaching_assignments')
            toast(`${del.name} silindi`)
            setDel(null)
            return null
          }}
        >
          <b>{del.name}</b> katalogdan silinecek; bu dersin öğretmen atamaları da kalkar. Ders programında kullanılıyorsa silinmez (pasif yapabilirsin).
        </ConfirmDelete>
      )}
    </>
  )
}

const COLORS = ['#1f5f5b', '#b5541a', '#3b5bdb', '#9c36b5', '#2b8a3e', '#e67700', '#c92a2a', '#495057']

function CourseModal({ c, onClose }: { c: Course | null; onClose: () => void }) {
  const { profile } = useAuth()
  const toast = useToast()
  const inv = useInvalidate()
  const [f, setF] = useState({ name: c?.name ?? '', short_name: c?.short_name ?? '', levels: c?.levels ?? [], color: c?.color ?? '', active: c?.active ?? true })
  const [err, setErr] = useState<string | null>(null)
  async function save() {
    if (f.name.trim().length < 2) return setErr('Ders adı en az 2 harf olmalı.')
    const short = (f.short_name.trim() || f.name.trim().slice(0, 3)).toLocaleUpperCase('tr')
    const row = { name: f.name.trim(), short_name: short, levels: f.levels, color: f.color || null, active: f.active }
    const { error } = c ? await supabase.from('courses').update(row).eq('id', c.id) : await supabase.from('courses').insert({ ...row, school_id: profile!.school_id })
    if (error) return setErr(errText(error, `${row.name} dersi zaten var.`))
    inv('courses')
    toast(`${row.name} kaydedildi`)
    onClose()
  }
  return (
    <Modal
      title={c ? `${c.name} dersi` : 'Ders ekle'}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Vazgeç
          </button>
          <button className="btn pri" onClick={save}>
            Kaydet
          </button>
        </>
      }
    >
      <div className="grid2">
        <label className="field" htmlFor="cName">
          Ders adı
          <input id="cName" value={f.name} onChange={(e) => setF((x) => ({ ...x, name: e.target.value }))} maxLength={60} />
        </label>
        <label className="field" htmlFor="cShort">
          Kısa ad (en fazla 8)
          <input id="cShort" value={f.short_name} onChange={(e) => setF((x) => ({ ...x, short_name: e.target.value }))} maxLength={8} placeholder="MAT" />
        </label>
      </div>
      <div className="stack" style={{ gap: 6 }}>
        <span className="label">Kademe (hiçbiri seçilmezse bütün kademeler)</span>
        <div className="btns">
          {LEVELS.map((l) => {
            const on = f.levels.includes(l)
            return (
              <button key={l} type="button" className="check" role="checkbox" aria-checked={on} onClick={() => setF((x) => ({ ...x, levels: on ? x.levels.filter((y) => y !== l) : [...x.levels, l] }))}>
                <span className={`box ${on ? 'on' : ''}`}>{on && <Icon name="check" size={13} stroke={3} />}</span>
                <span style={{ fontSize: 14 }}>{LEVEL_TR[l]}</span>
              </button>
            )
          })}
        </div>
      </div>
      <div className="stack" style={{ gap: 6 }}>
        <span className="label">Renk (isteğe bağlı)</span>
        <div className="btns" role="radiogroup" aria-label="Renk">
          <button type="button" role="radio" aria-checked={!f.color} aria-label="Renksiz" className="btn sm" onClick={() => setF((x) => ({ ...x, color: '' }))}>
            Yok
          </button>
          {COLORS.map((col) => (
            <button
              key={col}
              type="button"
              role="radio"
              aria-checked={f.color === col}
              aria-label={`Renk ${col}`}
              onClick={() => setF((x) => ({ ...x, color: col }))}
              style={{ width: 30, height: 30, borderRadius: 99, background: col, border: f.color === col ? '3px solid var(--ink)' : '2px solid var(--surface)', boxShadow: '0 0 0 1px var(--line-strong)' }}
            />
          ))}
        </div>
      </div>
      <Check on={f.active} onClick={() => setF((x) => ({ ...x, active: !x.active }))} label="Aktif" hint="Pasif ders ders programında ve atamalarda seçilemez; eski kayıtlar korunur." />
      {err && (
        <div className="err" role="alert">
          {err}
        </div>
      )}
    </Modal>
  )
}

// ---------------------------------------------------------------- Ders saatleri
export function DersSaatleri() {
  const bells = useBellTimes()
  const toast = useToast()
  const inv = useInvalidate()
  const [draft, setDraft] = useState<Record<number, { starts: string; ends: string; label: string }>>({})
  const [add, setAdd] = useState({ starts: '', ends: '' })
  const [del, setDel] = useState<number | null>(null)
  const list = bells.data ?? []
  const val = (p: number) => {
    const b = list.find((x) => x.period === p)
    return draft[p] ?? { starts: b?.starts.slice(0, 5) ?? '', ends: b?.ends.slice(0, 5) ?? '', label: b?.label ?? '' }
  }
  const done = (m: string) => {
    inv('bell_times', 'timetable')
    toast(m)
  }
  async function saveAll() {
    const rows = Object.keys(draft).map(Number)
    const bad = rows.find((p) => !val(p).starts || !val(p).ends || val(p).ends <= val(p).starts)
    if (bad) return toast(`${bad}. dersin başlangıç ve bitiş saatini kontrol et.`, 'warn')
    for (const p of rows) {
      const { error } = await supabase.from('bell_times').update({ starts: val(p).starts, ends: val(p).ends, label: val(p).label.trim() || null }).eq('period', p)
      if (error) return toast(errText(error)!, 'warn')
    }
    setDraft({})
    done('Ders saatleri kaydedildi')
  }
  async function addBell() {
    if (!add.starts || !add.ends || add.ends <= add.starts) return toast('Yeni ders saatinin başlangıç ve bitişini gir.', 'warn')
    const { data, error } = await supabase.rpc('add_bell', { p_starts: add.starts, p_ends: add.ends })
    if (error) return toast(errText(error)!, 'warn')
    setAdd({ starts: '', ends: '' })
    done(`${data}. ders saati eklendi`)
  }
  async function toggle(p: number, active: boolean) {
    const { error } = await supabase.from('bell_times').update({ active: !active }).eq('period', p)
    if (error) return toast(errText(error)!, 'warn')
    done(`${p}. ders ${active ? 'pasif' : 'aktif'} yapıldı`)
  }
  async function move(p: number, up: boolean) {
    const { error } = await supabase.rpc('move_bell', { p_period: p, p_up: up })
    if (error) return toast(errText(error)!, 'warn')
    done('Sıra değişti; ders programındaki dersler de taşındı')
  }
  return (
    <>
      <p className="m a" style={{ fontSize: 13 }}>
        Bütün sınıflar için ortak zil saatleri. Ders programı buradaki aktif saatlerden oluşur. Sırası değişince programdaki dersler de saatiyle birlikte taşınır.
      </p>
      <section className="card a" style={{ ['--d' as string]: 1, overflow: 'hidden' }} aria-label="Ders saatleri">
        <div className="tbl">
          <table>
            <thead>
              <tr>
                <th>Sıra</th>
                <th>Başlangıç</th>
                <th>Bitiş</th>
                <th>Ad (isteğe bağlı)</th>
                <th>Durum</th>
                <th aria-label="İşlemler" />
              </tr>
            </thead>
            <tbody>
              {list.map((b, i) => (
                <tr key={b.period} data-testid="bell-row" style={b.active === false ? { opacity: 0.6 } : undefined}>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <b>{b.period}. ders</b>
                  </td>
                  <td>
                    <label className="field">
                      <input type="time" aria-label={`${b.period}. ders başlangıç`} value={val(b.period).starts} onChange={(e) => setDraft((d) => ({ ...d, [b.period]: { ...val(b.period), starts: e.target.value } }))} />
                    </label>
                  </td>
                  <td>
                    <label className="field">
                      <input type="time" aria-label={`${b.period}. ders bitiş`} value={val(b.period).ends} onChange={(e) => setDraft((d) => ({ ...d, [b.period]: { ...val(b.period), ends: e.target.value } }))} />
                    </label>
                  </td>
                  <td>
                    <label className="field">
                      <input aria-label={`${b.period}. ders adı`} placeholder="Öğle arası, etüt…" value={val(b.period).label} maxLength={30} onChange={(e) => setDraft((d) => ({ ...d, [b.period]: { ...val(b.period), label: e.target.value } }))} />
                    </label>
                  </td>
                  <td>
                    <button className={`btn sm ${b.active === false ? '' : 'pri'}`} role="switch" aria-checked={b.active !== false} aria-label={`${b.period}. ders aktif`} onClick={() => toggle(b.period, b.active !== false)}>
                      {b.active === false ? 'Pasif' : 'Aktif'}
                    </button>
                  </td>
                  <td>
                    <div className="btns" style={{ justifyContent: 'flex-end', flexWrap: 'nowrap' }}>
                      <button className="btn sm" disabled={i === 0} onClick={() => move(b.period, true)} aria-label={`${b.period}. dersi yukarı taşı`}>
                        <span style={{ display: 'inline-flex', transform: 'rotate(180deg)' }}>
                          <Icon name="down" size={15} />
                        </span>
                      </button>
                      <button className="btn sm" disabled={i === list.length - 1} onClick={() => move(b.period, false)} aria-label={`${b.period}. dersi aşağı taşı`}>
                        <Icon name="down" size={15} />
                      </button>
                      <button className="btn sm" onClick={() => setDel(b.period)} aria-label={`${b.period}. ders saatini sil`}>
                        <Icon name="trash" size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!list.length && (
          <div className="empty" style={{ margin: 16 }}>
            Henüz ders saati yok. Aşağıdan ilk ders saatini ekle.
          </div>
        )}
      </section>
      <div className="kv a" style={{ ['--d' as string]: 2, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div className="btns" style={{ alignItems: 'flex-end' }}>
          <label className="field" htmlFor="bNewS">
            Yeni ders başlangıç
            <input id="bNewS" type="time" value={add.starts} onChange={(e) => setAdd((x) => ({ ...x, starts: e.target.value }))} />
          </label>
          <label className="field" htmlFor="bNewE">
            Bitiş
            <input id="bNewE" type="time" value={add.ends} onChange={(e) => setAdd((x) => ({ ...x, ends: e.target.value }))} />
          </label>
          <button className="btn" onClick={addBell}>
            <Icon name="plus" size={16} stroke={2} /> Ders saati ekle
          </button>
        </div>
        <button className="btn pri" onClick={saveAll} disabled={!Object.keys(draft).length}>
          Değişiklikleri kaydet
        </button>
      </div>
      {del != null && (
        <Modal
          title={`${del}. ders saatini sil`}
          onClose={() => setDel(null)}
          footer={
            <>
              <button className="btn" onClick={() => setDel(null)}>
                Vazgeç
              </button>
              <button
                className="btn warn"
                onClick={async () => {
                  const { error } = await supabase.rpc('delete_bell', { p_period: del })
                  setDel(null)
                  if (error) return toast(errText(error)!, 'warn')
                  done(`${del}. ders saati silindi`)
                }}
              >
                <Icon name="trash" size={16} /> Sil
              </button>
            </>
          }
        >
          <p style={{ fontSize: 14 }}>Sonraki ders saatleri bir yukarı kayar (programdaki dersleriyle birlikte). O saatte ders programında ders varsa silinmez; önce dersleri kaldır ya da saati pasif yap.</p>
        </Modal>
      )}
    </>
  )
}

// ---------------------------------------------------------------- Ders atamaları
export function DersAtamalari({ classes, profiles }: { classes: ClassRow[]; profiles: Profile[] }) {
  const courses = useCourses()
  const asg = useAssignments()
  const { profile } = useAuth()
  const toast = useToast()
  const inv = useInvalidate()
  const [view, setView] = useState<'sinif' | 'ogretmen'>('sinif')
  const [cls, setCls] = useState(classes[0]?.id ?? '')
  const [f, setF] = useState({ course: '', teacher: '' })
  const teachers = profiles.filter((p) => p.status === 'approved' && (p.role === 'ogretmen' || p.role === 'admin'))
  const cur = classes.find((c) => c.id === cls)
  const activeCourses = (courses.data ?? []).filter((c) => c.active && (!cur || !c.levels.length || c.levels.includes(cur.level)))
  const cName = (id: string) => courses.data?.find((c) => c.id === id)?.name ?? '—'
  const tName = (id: string) => teachers.find((t) => t.id === id)?.full_name ?? profiles.find((p) => p.id === id)?.full_name ?? '—'
  const clName = (id: string) => classes.find((c) => c.id === id)?.name ?? '—'
  const rows = useMemo(() => (asg.data ?? []).filter((a) => a.class_id === cls).sort((a, b) => cName(a.course_id).localeCompare(cName(b.course_id), 'tr')), [asg.data, cls, courses.data]) // eslint-disable-line react-hooks/exhaustive-deps

  async function assign() {
    const course = f.course || activeCourses[0]?.id
    if (!course || !f.teacher) return toast('Ders ve öğretmen seç.', 'warn')
    const { error } = await supabase.from('teaching_assignments').insert({ school_id: profile!.school_id, class_id: cls, course_id: course, teacher_id: f.teacher })
    if (error) return toast(errText(error, 'Bu atama zaten var.')!, 'warn')
    inv('teaching_assignments')
    toast(`${cur?.name} · ${cName(course)} → ${tName(f.teacher)}`)
    setF({ course: '', teacher: '' })
  }
  async function remove(id: string) {
    const { error } = await supabase.from('teaching_assignments').delete().eq('id', id)
    if (error) return toast(errText(error)!, 'warn')
    inv('teaching_assignments')
    toast('Atama kaldırıldı')
  }

  return (
    <>
      <p className="m a" style={{ fontSize: 13 }}>
        Öğretmen, atandığı sınıflarda duyuru yayınlar ve o sınıfların velileriyle yazışır (ödev ve yoklama yetkileri de buradan gelecek). Ders programına öğretmenli ders girildiğinde atama kendiliğinden oluşur.
      </p>
      <div className="btns a" style={{ ['--d' as string]: 1 }} role="group" aria-label="Görünüm">
        <button className={`btn sm ${view === 'sinif' ? 'pri' : ''}`} aria-pressed={view === 'sinif'} onClick={() => setView('sinif')}>
          Sınıfa göre
        </button>
        <button className={`btn sm ${view === 'ogretmen' ? 'pri' : ''}`} aria-pressed={view === 'ogretmen'} onClick={() => setView('ogretmen')}>
          Öğretmene göre
        </button>
      </div>
      {view === 'sinif' ? (
        <>
          <section className="card a" style={{ ['--d' as string]: 2, padding: 16, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }} aria-label="Yeni atama">
            <label className="field" htmlFor="aCls" style={{ minWidth: 120 }}>
              Sınıf
              <select id="aCls" value={cls} onChange={(e) => setCls(e.target.value)}>
                {LEVELS.map((lv) => {
                  const cs = classes.filter((c) => c.level === lv)
                  return cs.length ? (
                    <optgroup key={lv} label={LEVEL_TR[lv]}>
                      {cs.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </optgroup>
                  ) : null
                })}
              </select>
            </label>
            <label className="field" htmlFor="aCourse" style={{ minWidth: 180 }}>
              Ders
              <select id="aCourse" value={f.course || activeCourses[0]?.id || ''} onChange={(e) => setF((x) => ({ ...x, course: e.target.value }))}>
                {activeCourses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field" htmlFor="aTeacher" style={{ minWidth: 220 }}>
              Öğretmen
              <select id="aTeacher" value={f.teacher} onChange={(e) => setF((x) => ({ ...x, teacher: e.target.value }))}>
                <option value="">Seç</option>
                {teachers.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.full_name} · {t.role === 'admin' ? 'Yönetici' : t.branch}
                  </option>
                ))}
              </select>
            </label>
            <button className="btn pri" onClick={assign}>
              <Icon name="plus" size={16} stroke={2} /> Ata
            </button>
          </section>
          <section className="card a" style={{ ['--d' as string]: 3, overflow: 'hidden' }} aria-label={`${cur?.name ?? ''} atamaları`}>
            {rows.length ? (
              <div className="tbl">
                <table>
                  <thead>
                    <tr>
                      <th>Ders</th>
                      <th>Öğretmen</th>
                      <th aria-label="İşlemler" />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((a) => (
                      <tr key={a.id} data-testid="assignment-row">
                        <td>
                          <b>{cName(a.course_id)}</b>
                        </td>
                        <td>{tName(a.teacher_id)}</td>
                        <td>
                          <div className="btns" style={{ justifyContent: 'flex-end' }}>
                            <button className="btn sm" onClick={() => remove(a.id)} aria-label={`${cName(a.course_id)} – ${tName(a.teacher_id)} atamasını kaldır`}>
                              <Icon name="trash" size={15} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="empty" style={{ margin: 16 }}>
                {cur?.name} için atama yok.
              </div>
            )}
          </section>
        </>
      ) : (
        <section className="card a" style={{ ['--d' as string]: 2, overflow: 'hidden' }} aria-label="Öğretmenlere göre atamalar">
          <div className="tbl">
            <table>
              <thead>
                <tr>
                  <th>Öğretmen</th>
                  <th>Sınıf · ders</th>
                </tr>
              </thead>
              <tbody>
                {teachers.map((t) => {
                  const mine = (asg.data ?? []).filter((a) => a.teacher_id === t.id)
                  return (
                    <tr key={t.id}>
                      <td>
                        <b>{t.full_name}</b>
                        <span className="m" style={{ fontSize: 12 }}>
                          {' '}
                          · {t.role === 'admin' ? 'Yönetici' : t.branch}
                        </span>
                      </td>
                      <td>
                        <span className="btns" style={{ gap: 4 }}>
                          {mine.length ? (
                            mine.map((a) => (
                              <span key={a.id} className="chip n">
                                {clName(a.class_id)} · {cName(a.course_id)}
                              </span>
                            ))
                          ) : (
                            <span className="m">—</span>
                          )}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  )
}

// ---------------------------------------------------------------- Ödev ayarları
const HW_BOOLS: [string, string, string, boolean][] = [
  ['odev.son_tarih_zorunlu', 'Son teslim tarihi zorunlu', 'Kapalıysa öğretmen tarihsiz ödev verebilir.', true],
  ['odev.veli_durum_gorur', 'Veli ödev durumunu görür', 'Yaptı / Yapmadı / Eksik ve öğretmen notu veliye görünür, bildirimi gider.', true],
  ['odev.geciken_kirmizi', 'Geciken ödev kırmızı gösterilir', 'Veli ve öğrenci ekranında süresi geçmiş, yapılmamış ödevler.', true],
  ['odev.bildirim_yeni', 'Yeni ödevde bildirim', 'Ödev verilince öğrencilere ve velilere.', true],
  ['odev.bildirim_kontrol', 'Ödev kontrol edilince bildirim', 'Öğretmen durum işaretleyince öğrenciye (ve ayar açıksa veliye).', true],
  ['odev.ogretmen_dosya', 'Öğretmen ek dosya yükleyebilir', 'Dosya altyapısıyla (Faz C) devreye girer.', true],
  ['odev.ogrenci_dosya', 'Öğrenci dosya yükleyebilir', 'Dosya altyapısıyla (Faz C) devreye girer.', false],
]
export function OdevAyarlari() {
  const s = useSettings()
  const toast = useToast()
  const inv = useInvalidate()
  const [days, setDays] = useState<string | null>(null)
  const val = (k: string, d: boolean) => (typeof s.data?.[k] === 'boolean' ? (s.data[k] as boolean) : d)
  const dayVal = days ?? String((s.data?.['odev.hatirlatma_gun'] as number | undefined) ?? 1)
  async function put(p: Record<string, unknown>, m: string) {
    const { error } = await supabase.rpc('set_settings', { p })
    if (error) return toast(errText(error)!, 'warn')
    inv('school_settings')
    toast(m)
  }
  return (
    <>
      <section className="card a" style={{ padding: 8, display: 'flex', flexDirection: 'column' }} aria-label="Ödev ayarları">
        {HW_BOOLS.map(([k, l, h, d]) => (
          <div key={k} style={{ padding: 8 }}>
            <Check on={val(k, d)} onClick={() => put({ [k]: !val(k, d) }, `${l}: ${val(k, d) ? 'kapalı' : 'açık'}`)} label={l} hint={h} />
          </div>
        ))}
      </section>
      <section className="card a" style={{ ['--d' as string]: 1, padding: 16, display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <label className="field" htmlFor="hwDays" style={{ maxWidth: 260 }}>
          Son teslimden kaç gün önce hatırlatılsın? (0 = kapalı)
          <input id="hwDays" type="number" min={0} max={14} value={dayVal} onChange={(e) => setDays(e.target.value)} />
        </label>
        <button className="btn pri" disabled={days === null} onClick={() => put({ 'odev.hatirlatma_gun': Number(dayVal) }, 'Hatırlatma günü kaydedildi').then(() => setDays(null))}>
          Kaydet
        </button>
        <span className="m" style={{ fontSize: 12 }}>
          Hatırlatma her sabah 08.00'de, hâlâ “Bekliyor” olan öğrencilere ve velilerine bir kez gider.
        </span>
      </section>
    </>
  )
}

function LogoField() {
  const { profile } = useAuth()
  const info = useSchoolInfo()
  const toast = useToast()
  const inv = useInvalidate()
  const [busy, setBusy] = useState(false)
  async function upload(f: File | undefined) {
    if (!f) return
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(f.type) || f.size > 2 * 1048576) return toast('Logo PNG, JPG ya da WEBP ve en fazla 2 MB olmalı.', 'warn')
    setBusy(true)
    const path = `${profile!.school_id}/logo-${Date.now()}.${f.type.split('/')[1]}`
    const up = await supabase.storage.from('okul').upload(path, f, { contentType: f.type })
    const { error } = up.error ? up : await supabase.rpc('set_settings', { p: { 'genel.logo': path } })
    setBusy(false)
    if (error) return toast(errText(error)!, 'warn')
    inv('school-info', 'school_settings')
    toast('Logo güncellendi')
  }
  async function remove() {
    const { error } = await supabase.rpc('set_settings', { p: { 'genel.logo': '' } })
    if (error) return toast(errText(error)!, 'warn')
    inv('school-info', 'school_settings')
    toast('Logo kaldırıldı')
  }
  return (
    <div className="kv" style={{ justifyContent: 'flex-start', gap: 14 }}>
      <SchoolLogo url={info.data?.logo} size={48} />
      <label className="btn sm" style={{ cursor: 'pointer' }}>
        {busy ? <span className="spinner" aria-hidden="true" /> : <Icon name="up" size={16} />} Logo yükle
        <input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => upload(e.target.files?.[0])} aria-label="Logo yükle" />
      </label>
      {info.data?.logo && (
        <button className="btn sm" onClick={remove}>
          Logoyu kaldır
        </button>
      )}
      <span className="m" style={{ fontSize: 12 }}>
        Giriş ekranında ve üst çubukta görünür (PNG/JPG/WEBP, en fazla 2 MB).
      </span>
    </div>
  )
}

// ---------------------------------------------------------------- Dosya ve duyuru ayarları
export function DosyaDuyuruAyarlari() {
  const s = useSettings()
  const toast = useToast()
  const inv = useInvalidate()
  const [mb, setMb] = useState<string | null>(null)
  const [days, setDays] = useState<string | null>(null)
  const b = (k: string, d: boolean) => (typeof s.data?.[k] === 'boolean' ? (s.data[k] as boolean) : d)
  const scope = (s.data?.['duyuru.ogretmen_kapsam'] as string | undefined) ?? 'sinif'
  const mbVal = mb ?? String((s.data?.['dosya.max_mb'] as number | undefined) ?? 10)
  const dayVal = days ?? String((s.data?.['duyuru.gosterim_gun'] as number | undefined) ?? 14)
  async function put(p: Record<string, unknown>, m: string) {
    const { error } = await supabase.rpc('set_settings', { p })
    if (error) return toast(errText(error)!, 'warn')
    inv('school_settings')
    toast(m)
  }
  const sw = (k: string, d: boolean, l: string, h: string) => (
    <div style={{ padding: 8 }}>
      <Check on={b(k, d)} onClick={() => put({ [k]: !b(k, d) }, `${l}: ${b(k, d) ? 'kapalı' : 'açık'}`)} label={l} hint={h} />
    </div>
  )
  return (
    <>
      <h3 className="label a">Dosyalar</h3>
      <section className="card a" style={{ padding: 8 }} aria-label="Dosya ayarları">
        {sw('dosya.gorsel', true, 'Görsel yüklenebilir', 'JPG, JPEG, PNG, WEBP')}
        {sw('dosya.pdf', true, 'PDF yüklenebilir', 'Belgeler, izin formları')}
        {sw('mesaj.dosya', true, 'Mesajlarda dosya', 'Veli ve öğretmen mesaja dosya ekleyebilir')}
        <div style={{ padding: 8, display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <label className="field" htmlFor="fMb" style={{ maxWidth: 220 }}>
            Dosya başına en fazla (MB, 1–25)
            <input id="fMb" type="number" min={1} max={25} value={mbVal} onChange={(e) => setMb(e.target.value)} />
          </label>
          <button className="btn pri" disabled={mb === null} onClick={() => put({ 'dosya.max_mb': Number(mbVal) }, 'Dosya boyutu sınırı kaydedildi').then(() => setMb(null))}>
            Kaydet
          </button>
        </div>
      </section>
      <h3 className="label a">Duyurular</h3>
      <section className="card a" style={{ padding: 8 }} aria-label="Duyuru ayarları">
        {sw('duyuru.dosya', true, 'Duyurularda görsel ve belge', 'Kapak görseli, fotoğraf, PDF')}
        {sw('duyuru.ogretmen_yazabilir', true, 'Öğretmenler duyuru yayınlayabilir', 'Kapalıysa yalnız yönetim ve rehberlik yayınlar')}
        <div style={{ padding: 8 }}>
          <label className="field" htmlFor="dScope" style={{ maxWidth: 360 }}>
            Öğretmen hangi kapsamda duyuru yapabilir?
            <select id="dScope" value={scope} onChange={(e) => put({ 'duyuru.ogretmen_kapsam': e.target.value }, 'Öğretmen duyuru kapsamı kaydedildi')}>
              <option value="sinif">Yalnız ders verdiği / sınıf öğretmeni olduğu sınıflar</option>
              <option value="kademe">Ders verdiği kademeler (ör. tüm ortaokul)</option>
              <option value="okul">Tüm okul</option>
            </select>
          </label>
        </div>
        <div style={{ padding: 8, display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <label className="field" htmlFor="dDays" style={{ maxWidth: 260 }}>
            Duyuru ana sayfada kaç gün öne çıksın? (1–365)
            <input id="dDays" type="number" min={1} max={365} value={dayVal} onChange={(e) => setDays(e.target.value)} />
          </label>
          <button className="btn pri" disabled={days === null} onClick={() => put({ 'duyuru.gosterim_gun': Number(dayVal) }, 'Gösterim süresi kaydedildi').then(() => setDays(null))}>
            Kaydet
          </button>
        </div>
      </section>
    </>
  )
}
