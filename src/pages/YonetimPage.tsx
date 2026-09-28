// Yönetim paneli (yalnız yönetici): sınıflar, öğrenciler, öğretmenler, veliler, kapalı hesaplar.
// Yazma yetkisi veritabanında (RLS + 0008 RPC'leri, aal2) zorlanır; bu ekran yalnız arayüzdür.
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/auth/AuthProvider'
import { useClasses } from '@/lib/data'
import { BRANS, LEVEL_TR, LEVELS, ROLE_TR, roleOf } from '@/lib/roles'
import { fold, initials } from '@/lib/format'
import type { ClassRow, Profile } from '@/lib/types'
import { Seg } from '@/components/Indicator'
import { Modal } from '@/components/Modal'
import { ConfirmDelete } from '@/components/ConfirmDelete'
import { Icon } from '@/components/Icon'
import { useToast } from '@/components/Toast'

type Tab = 'siniflar' | 'ogrenciler' | 'ogretmenler' | 'veliler' | 'kapali'
const TABS: [Tab, string][] = [
  ['siniflar', 'Sınıflar'],
  ['ogrenciler', 'Öğrenciler'],
  ['ogretmenler', 'Öğretmenler'],
  ['veliler', 'Veliler'],
  ['kapali', 'Kapalı hesaplar'],
]
const HARF = 'ABCDEFGHIJKLMNOPRSTUVYZ'.split('')

interface Stu {
  id: string
  full_name: string
  class_id: string | null
  class_name: string
  school_no: string | null
}
interface Link2 {
  parent_id: string
  student_id: string
  relation: string | null
}

/** Veritabanı hatasını kullanıcı diline çevirir. */
function msg(e: { code?: string; message?: string } | null, dup = 'Bu kayıt zaten var.') {
  if (!e) return null
  if (e.code === '23505') return dup
  if (e.code === '42501' || /row-level security/i.test(e.message ?? '')) return 'Bu işlem için yönetici yetkisi gerekir.'
  return e.message ?? 'İşlem yapılamadı.'
}

function useAdminData() {
  return useQuery({
    queryKey: ['yonetim'],
    queryFn: async () => {
      const [p, s, l] = await Promise.all([
        supabase.from('profiles').select('*').in('status', ['approved', 'rejected']).order('full_name'),
        supabase.from('students').select('id, full_name, class_id, class_name, school_no').is('archived_at', null).order('class_name').order('full_name'),
        supabase.from('parent_links').select('parent_id, student_id, relation'),
      ])
      if (p.error) throw p.error
      if (s.error) throw s.error
      if (l.error) throw l.error
      return { profiles: p.data as Profile[], students: s.data as Stu[], links: l.data as Link2[] }
    },
  })
}

export default function YonetimPage() {
  const [sp, setSp] = useSearchParams()
  const tab = (TABS.find(([k]) => k === sp.get('sekme'))?.[0] ?? 'siniflar') as Tab
  const setTab = (t: Tab) => setSp(t === 'siniflar' ? {} : { sekme: t }, { replace: true })
  const data = useAdminData()
  const classes = useClasses()

  return (
    <>
      <div className="head a">
        <div className="stack" style={{ gap: 4 }}>
          <h1 className="hd">Yönetim</h1>
          <span className="m">Sınıfları, öğrencileri ve hesapları buradan yönetirsin. Yeni kayıtları onaylamak için Onaylar sayfası.</span>
        </div>
      </div>
      <div style={{ overflowX: 'auto' }} className="a">
        <Seg label="Yönetim bölümü" value={tab} onChange={setTab} options={TABS} />
      </div>
      {data.isLoading || classes.isLoading ? (
        <p className="m">
          <span className="spinner" aria-hidden="true" /> Yükleniyor…
        </p>
      ) : data.isError || classes.isError ? (
        <div className="empty">Yönetim verisi yüklenemedi. Sayfayı yenile.</div>
      ) : (
        <>
          {tab === 'siniflar' && <Siniflar classes={classes.data!} {...data.data!} />}
          {tab === 'ogrenciler' && <Ogrenciler classes={classes.data!} {...data.data!} />}
          {tab === 'ogretmenler' && <Ogretmenler classes={classes.data!} {...data.data!} />}
          {tab === 'veliler' && <Veliler {...data.data!} />}
          {tab === 'kapali' && <Kapali {...data.data!} />}
        </>
      )}
    </>
  )
}

function useReload() {
  const qc = useQueryClient()
  return () => {
    for (const k of ['yonetim', 'classes', 'students', 'people', 'onaylar', 'signup-classes']) qc.invalidateQueries({ queryKey: [k] })
  }
}

const teachersOf = (profiles: Profile[]) => profiles.filter((p) => p.status === 'approved' && (p.role === 'ogretmen' || p.role === 'admin'))

// ---------------------------------------------------------------- Sınıflar
function Siniflar({ classes, profiles, students }: { classes: ClassRow[]; profiles: Profile[]; students: Stu[] }) {
  const [edit, setEdit] = useState<ClassRow | 'new' | null>(null)
  const [del, setDel] = useState<ClassRow | null>(null)
  const reload = useReload()
  const toast = useToast()
  const name = (id: string | null) => profiles.find((p) => p.id === id)?.full_name
  return (
    <>
      <div className="kv a">
        <span className="m">{classes.length} sınıf · {students.length} öğrenci</span>
        <button className="btn pri" onClick={() => setEdit('new')}>
          <Icon name="plus" size={18} stroke={2} /> Sınıf ekle
        </button>
      </div>
      {LEVELS.map((lv, i) => {
        const cs = classes.filter((c) => c.level === lv)
        return (
          <section key={lv} className="card a" style={{ ['--d' as string]: i + 1, overflow: 'hidden' }} aria-label={LEVEL_TR[lv]}>
            <div className="kv" style={{ padding: '14px 16px 4px' }}>
              <h2 style={{ fontSize: 17 }}>{LEVEL_TR[lv]}</h2>
              <span className="chip n">{cs.length} sınıf</span>
            </div>
            {cs.length ? (
              <div className="tbl">
                <table>
                  <thead>
                    <tr>
                      <th>Sınıf</th>
                      <th className="num">Öğrenci</th>
                      <th>Sınıf öğretmeni</th>
                      <th aria-label="İşlemler" />
                    </tr>
                  </thead>
                  <tbody>
                    {cs.map((c) => (
                      <tr key={c.id} data-testid="class-row">
                        <td>
                          <b>{c.name}</b>
                        </td>
                        <td className="num">{students.filter((s) => s.class_id === c.id).length}</td>
                        <td>{name(c.homeroom_teacher_id) ?? <span className="m">—</span>}</td>
                        <td>
                          <div className="btns" style={{ justifyContent: 'flex-end' }}>
                            <button className="btn sm" onClick={() => setEdit(c)} aria-label={`${c.name} sınıfını düzenle`}>
                              <Icon name="pen" size={15} /> Düzenle
                            </button>
                            <button className="btn sm" onClick={() => setDel(c)} aria-label={`${c.name} sınıfını sil`}>
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
                Bu kademede sınıf yok.
              </div>
            )}
          </section>
        )
      })}
      {edit && <ClassModal c={edit === 'new' ? null : edit} teachers={teachersOf(profiles)} onClose={() => setEdit(null)} />}
      {del && (
        <ConfirmDelete
          title={`${del.name} sınıfını sil`}
          name={del.name}
          onClose={() => setDel(null)}
          onConfirm={async () => {
            const { error } = await supabase.rpc('delete_class', { p_class: del.id })
            if (error) return msg(error)
            toast(`${del.name} silindi`)
            setDel(null)
            reload()
            return null
          }}
        >
          <b>{del.name}</b> sınıfı silinecek. İçinde öğrenci varsa silinmez; önce öğrencileri başka sınıfa taşı.
        </ConfirmDelete>
      )}
    </>
  )
}

function ClassModal({ c, teachers, onClose }: { c: ClassRow | null; teachers: Profile[]; onClose: () => void }) {
  const { profile } = useAuth()
  const reload = useReload()
  const toast = useToast()
  const [grade, setGrade] = useState(c?.grade ?? 1)
  const [section, setSection] = useState(c?.section ?? 'A')
  const [teacher, setTeacher] = useState(c?.homeroom_teacher_id ?? '')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  async function save() {
    setBusy(true)
    const row = { grade, section, homeroom_teacher_id: teacher || null }
    const { error } = c ? await supabase.from('classes').update(row).eq('id', c.id) : await supabase.from('classes').insert({ ...row, school_id: profile!.school_id })
    setBusy(false)
    if (error) return setErr(msg(error, `${grade}/${section} sınıfı zaten var.`))
    toast(c ? `${grade}/${section} güncellendi` : `${grade}/${section} açıldı`)
    reload()
    onClose()
  }
  return (
    <Modal
      title={c ? `${c.name} sınıfını düzenle` : 'Sınıf ekle'}
      sub={c ? 'Düzey ya da şube değişirse öğrencilerin sınıf bilgisi de değişir.' : 'Kademe düzeyden otomatik belirlenir: 1–4 ilkokul, 5–8 ortaokul, 9–12 lise.'}
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
        <label className="field" htmlFor="cGrade">
          Düzey
          <select id="cGrade" value={grade} onChange={(e) => setGrade(Number(e.target.value))}>
            {LEVELS.map((lv) => (
              <optgroup key={lv} label={LEVEL_TR[lv]}>
                {Array.from({ length: 12 }, (_, i) => i + 1)
                  .filter((g) => (lv === 'ilkokul' ? g <= 4 : lv === 'ortaokul' ? g > 4 && g <= 8 : g > 8))
                  .map((g) => (
                    <option key={g} value={g}>
                      {g}. sınıf
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
        </label>
        <label className="field" htmlFor="cSection">
          Şube
          <select id="cSection" value={section} onChange={(e) => setSection(e.target.value)}>
            {HARF.map((h) => (
              <option key={h}>{h}</option>
            ))}
          </select>
        </label>
      </div>
      <label className="field" htmlFor="cTeacher">
        Sınıf öğretmeni (isteğe bağlı)
        <select id="cTeacher" value={teacher} onChange={(e) => setTeacher(e.target.value)}>
          <option value="">Yok</option>
          {teachers.map((t) => (
            <option key={t.id} value={t.id}>
              {t.full_name} · {t.role === 'admin' ? 'Yönetici' : t.branch}
            </option>
          ))}
        </select>
      </label>
      {err && (
        <div className="err" role="alert">
          {err}
        </div>
      )}
    </Modal>
  )
}

// ---------------------------------------------------------------- Öğrenciler
function Ogrenciler({ classes, profiles, students, links }: { classes: ClassRow[]; profiles: Profile[]; students: Stu[]; links: Link2[] }) {
  const [cls, setCls] = useState('all')
  const [q, setQ] = useState('')
  const [edit, setEdit] = useState<Stu | 'new' | null>(null)
  const [del, setDel] = useState<Stu | null>(null)
  const reload = useReload()
  const toast = useToast()
  const needle = fold(q)
  const list = students.filter((s) => (cls === 'all' || s.class_id === cls) && (!needle || fold(s.full_name).includes(needle) || (s.school_no ?? '').includes(q.trim())))
  const account = (sid: string) => profiles.find((p) => p.role === 'ogrenci' && p.student_id === sid && p.status === 'approved')
  return (
    <>
      <div className="kv a" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div className="btns" style={{ alignItems: 'flex-end' }}>
          <label className="field" htmlFor="yCls" style={{ minWidth: 160 }}>
            Sınıf
            <ClassSelect id="yCls" classes={classes} value={cls} onChange={setCls} all />
          </label>
          <label className="field" htmlFor="yQ" style={{ minWidth: 220 }}>
            Ara
            <input id="yQ" placeholder="İsim veya okul no" value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
        </div>
        <button className="btn pri" onClick={() => setEdit('new')} disabled={!classes.length} title={classes.length ? undefined : 'Önce sınıf aç'}>
          <Icon name="plus" size={18} stroke={2} /> Öğrenci ekle
        </button>
      </div>
      <section className="card a" style={{ ['--d' as string]: 1, overflow: 'hidden' }}>
        {list.length ? (
          <div className="tbl">
            <table>
              <thead>
                <tr>
                  <th>Öğrenci</th>
                  <th>Sınıf</th>
                  <th>Okul no</th>
                  <th>Hesaplar</th>
                  <th aria-label="İşlemler" />
                </tr>
              </thead>
              <tbody>
                {list.map((s) => {
                  const veli = links.filter((l) => l.student_id === s.id).length
                  return (
                    <tr key={s.id} data-testid="student-row">
                      <td>
                        <span style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                          <span className="av s" style={{ width: 32, height: 32, fontSize: 12 }}>
                            {initials(s.full_name)}
                          </span>
                          <b>{s.full_name}</b>
                        </span>
                      </td>
                      <td>{s.class_name}</td>
                      <td className="mono">{s.school_no ?? '—'}</td>
                      <td>
                        <span className="btns" style={{ gap: 4 }}>
                          <span className={`chip ${account(s.id) ? 'up' : 'n'}`}>{account(s.id) ? 'Öğrenci hesabı' : 'Hesap yok'}</span>
                          {veli > 0 && <span className="chip up">{veli} veli</span>}
                        </span>
                      </td>
                      <td>
                        <div className="btns" style={{ justifyContent: 'flex-end' }}>
                          <button className="btn sm" onClick={() => setEdit(s)} aria-label={`${s.full_name} düzenle`}>
                            <Icon name="pen" size={15} /> Düzenle
                          </button>
                          <button className="btn sm" onClick={() => setDel(s)} aria-label={`${s.full_name} sil`}>
                            <Icon name="trash" size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty" style={{ margin: 16 }}>
            {students.length ? 'Bu filtrede öğrenci yok.' : 'Henüz öğrenci yok. Öğrenci ekleyebilir ya da kayıtları onaylayabilirsin.'}
          </div>
        )}
      </section>
      {edit && <StudentModal s={edit === 'new' ? null : edit} classes={classes} defaultClass={cls === 'all' ? classes[0]?.id : cls} onClose={() => setEdit(null)} />}
      {del && (
        <ConfirmDelete
          title="Öğrenciyi sil"
          name={del.full_name}
          onClose={() => setDel(null)}
          onConfirm={async () => {
            const { error } = await supabase.rpc('delete_student', { p_student: del.id })
            if (error) return msg(error)
            toast(`${del.full_name} silindi`)
            setDel(null)
            reload()
            return null
          }}
        >
          <b>{del.full_name}</b> ({del.class_name}) ve bütün kayıtları kalıcı olarak silinecek: deneme sonuçları, görevler, görüşmeler, notlar, raporlar, veli bağları. Öğrenci hesabı varsa onay bekleyen duruma döner.
        </ConfirmDelete>
      )}
    </>
  )
}

function ClassSelect({ id, classes, value, onChange, all }: { id: string; classes: ClassRow[]; value: string; onChange: (v: string) => void; all?: boolean }) {
  return (
    <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
      {all && <option value="all">Tüm sınıflar</option>}
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
  )
}

function StudentModal({ s, classes, defaultClass, onClose }: { s: Stu | null; classes: ClassRow[]; defaultClass?: string; onClose: () => void }) {
  const { profile } = useAuth()
  const reload = useReload()
  const toast = useToast()
  const [name, setName] = useState(s?.full_name ?? '')
  const [cls, setCls] = useState(s?.class_id ?? defaultClass ?? '')
  const [no, setNo] = useState(s?.school_no ?? '')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  async function save() {
    const n = name.trim().replace(/\s+/g, ' ')
    if (n.length < 3) return setErr('Ad soyad en az 3 harf olmalı.')
    if (!cls) return setErr('Sınıf seç.')
    const nr = no.replace(/\D/g, '').slice(0, 10) || null
    setBusy(true)
    const row = { full_name: n, class_id: cls, school_no: nr }
    const { error } = s ? await supabase.from('students').update(row).eq('id', s.id) : await supabase.from('students').insert({ ...row, school_id: profile!.school_id })
    setBusy(false)
    if (error) return setErr(msg(error, `${nr} okul numarası başka bir öğrencide kayıtlı.`))
    toast(s ? `${n} güncellendi` : `${n} eklendi`)
    reload()
    onClose()
  }
  return (
    <Modal
      title={s ? 'Öğrenciyi düzenle' : 'Öğrenci ekle'}
      sub={s ? 'Sınıfını değiştirerek öğrenciyi başka sınıfa taşıyabilirsin.' : 'Öğrenci hesabı gerekmez; öğrenci ve veli sonradan kayıt olup bu kayda bağlanır.'}
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
      <label className="field" htmlFor="sName">
        Ad soyad
        <input id="sName" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
      </label>
      <div className="grid2">
        <label className="field" htmlFor="sCls">
          Sınıf
          <ClassSelect id="sCls" classes={classes} value={cls} onChange={setCls} />
        </label>
        <label className="field" htmlFor="sNo">
          Okul no (isteğe bağlı)
          <input id="sNo" inputMode="numeric" value={no} onChange={(e) => setNo(e.target.value)} />
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

// ---------------------------------------------------------------- Öğretmenler
function Ogretmenler({ classes, profiles }: { classes: ClassRow[]; profiles: Profile[] }) {
  const { profile: me } = useAuth()
  const [edit, setEdit] = useState<Profile | null>(null)
  const [close, setClose] = useState<Profile | null>(null)
  const list = teachersOf(profiles)
  return (
    <>
      <div className="card a" style={{ padding: 16, display: 'flex', gap: 12, alignItems: 'center' }}>
        <Icon name="users" size={22} />
        <span style={{ flex: 1, fontSize: 14 }}>
          Yeni öğretmen, giriş ekranındaki <b>Kayıt ol → Öğretmen</b> ile kendi hesabını açar; sen <Link to="/onaylar">Onaylar</Link> sayfasından onaylarsın. Burada ad ve branşını düzenler, sınıf öğretmenliği verir (Sınıflar) ya da hesabını kapatırsın.
        </span>
      </div>
      <section className="card a" style={{ ['--d' as string]: 1, overflow: 'hidden' }}>
        <div className="tbl">
          <table>
            <thead>
              <tr>
                <th>Öğretmen</th>
                <th>Rol / branş</th>
                <th>Sınıf öğretmenliği</th>
                <th>E-posta</th>
                <th aria-label="İşlemler" />
              </tr>
            </thead>
            <tbody>
              {list.map((t) => (
                <tr key={t.id} data-testid="teacher-row">
                  <td>
                    <b>{t.full_name}</b>
                  </td>
                  <td>{t.role === 'admin' ? ROLE_TR.admin : `${ROLE_TR[roleOf(t)]} · ${t.branch}`}</td>
                  <td>
                    {classes
                      .filter((c) => c.homeroom_teacher_id === t.id)
                      .map((c) => c.name)
                      .join(', ') || <span className="m">—</span>}
                  </td>
                  <td className="m" style={{ fontSize: 13 }}>
                    {t.email}
                  </td>
                  <td>
                    <div className="btns" style={{ justifyContent: 'flex-end' }}>
                      <button className="btn sm" onClick={() => setEdit(t)} aria-label={`${t.full_name} düzenle`}>
                        <Icon name="pen" size={15} /> Düzenle
                      </button>
                      {t.id !== me?.id && (
                        <button className="btn sm" onClick={() => setClose(t)} aria-label={`${t.full_name} hesabını kapat`}>
                          <Icon name="lock" size={15} /> Kapat
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {edit && <ProfileModal p={edit} onClose={() => setEdit(null)} />}
      {close && <CloseAccount p={close} onClose={() => setClose(null)} />}
    </>
  )
}

function ProfileModal({ p, onClose }: { p: Profile; onClose: () => void }) {
  const reload = useReload()
  const toast = useToast()
  const [name, setName] = useState(p.full_name)
  const [branch, setBranch] = useState(p.branch ?? '')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  async function save() {
    setBusy(true)
    const { error } = await supabase.rpc('admin_update_profile', { p_profile: p.id, p_full_name: name, p_branch: p.role === 'ogretmen' ? branch : null })
    setBusy(false)
    if (error) return setErr(msg(error))
    toast(`${name.trim()} güncellendi`)
    reload()
    onClose()
  }
  return (
    <Modal
      title={`${ROLE_TR[roleOf(p)]} bilgilerini düzenle`}
      sub={p.email ?? undefined}
      avatar={p.full_name}
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
      <label className="field" htmlFor="pName">
        Ad soyad
        <input id="pName" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
      </label>
      {p.role === 'ogretmen' && (
        <label className="field" htmlFor="pBranch">
          Branş
          <select id="pBranch" value={branch} onChange={(e) => setBranch(e.target.value)}>
            {BRANS.map((b) => (
              <option key={b}>{b}</option>
            ))}
          </select>
        </label>
      )}
      {err && (
        <div className="err" role="alert">
          {err}
        </div>
      )}
    </Modal>
  )
}

function CloseAccount({ p, onClose }: { p: Profile; onClose: () => void }) {
  const reload = useReload()
  const toast = useToast()
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  return (
    <Modal
      title="Hesabı kapat"
      avatar={p.full_name}
      sub={`${p.full_name} · ${ROLE_TR[roleOf(p)]}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Vazgeç
          </button>
          <button
            className="btn warn"
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              const { error } = await supabase.rpc('set_user_active', { p_profile: p.id, p_active: false })
              setBusy(false)
              if (error) return setErr(msg(error))
              toast(`${p.full_name} hesabı kapatıldı`)
              reload()
              onClose()
            }}
          >
            <Icon name="lock" size={16} /> Hesabı kapat
          </button>
        </>
      }
    >
      <p style={{ fontSize: 14 }}>
        {p.full_name} artık uygulamaya giremez; sınıf öğretmenliği varsa boşalır. Yazdığı notlar ve raporlar silinmez. Hesabı istediğin zaman <b>Kapalı hesaplar</b> bölümünden yeniden açabilirsin.
      </p>
      {err && (
        <div className="err" role="alert">
          {err}
        </div>
      )}
    </Modal>
  )
}

// ---------------------------------------------------------------- Veliler
function Veliler({ profiles, students, links }: { profiles: Profile[]; students: Stu[]; links: Link2[] }) {
  const reload = useReload()
  const toast = useToast()
  const [edit, setEdit] = useState<Profile | null>(null)
  const [close, setClose] = useState<Profile | null>(null)
  const [add, setAdd] = useState<Record<string, string>>({})
  const veliler = profiles.filter((p) => p.role === 'veli' && p.status === 'approved')
  const stu = (id: string) => students.find((s) => s.id === id)

  async function link(p: Profile) {
    const sid = add[p.id]
    if (!sid) return
    const { error } = await supabase.from('parent_links').insert({ parent_id: p.id, student_id: sid, relation: p.declared.relation ?? null })
    if (error) return toast(msg(error, 'Bu öğrenci zaten bu veliye bağlı.')!, 'warn')
    toast(`${stu(sid)?.full_name} bağlandı`)
    setAdd((x) => ({ ...x, [p.id]: '' }))
    reload()
  }
  async function unlink(p: Profile, sid: string) {
    const { error } = await supabase.from('parent_links').delete().eq('parent_id', p.id).eq('student_id', sid)
    if (error) return toast(msg(error)!, 'warn')
    toast(`${stu(sid)?.full_name} bağlantısı kaldırıldı`)
    reload()
  }

  return (
    <>
      {veliler.length ? (
        <div className="stack">
          {veliler.map((p, i) => {
            const kids = links.filter((l) => l.parent_id === p.id)
            return (
              <article key={p.id} className="card a" style={{ ['--d' as string]: Math.min(i, 6), padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }} data-testid="parent-row">
                <div className="kv" style={{ flexWrap: 'wrap' }}>
                  <span style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <span className="av s">{initials(p.full_name)}</span>
                    <span>
                      <b style={{ display: 'block' }}>{p.full_name}</b>
                      <span className="m" style={{ fontSize: 13 }}>
                        {p.declared.relation ?? 'Veli'} · {p.email}
                      </span>
                    </span>
                  </span>
                  <div className="btns">
                    <button className="btn sm" onClick={() => setEdit(p)} aria-label={`${p.full_name} düzenle`}>
                      <Icon name="pen" size={15} /> Düzenle
                    </button>
                    <button className="btn sm" onClick={() => setClose(p)} aria-label={`${p.full_name} hesabını kapat`}>
                      <Icon name="lock" size={15} /> Kapat
                    </button>
                  </div>
                </div>
                <div className="btns">
                  {kids.map((l) => (
                    <span key={l.student_id} className="chip up" style={{ paddingRight: 4 }}>
                      {stu(l.student_id)?.full_name} · {stu(l.student_id)?.class_name}
                      <button className="xbtn" style={{ width: 22, height: 22 }} onClick={() => unlink(p, l.student_id)} aria-label={`${stu(l.student_id)?.full_name} bağlantısını kaldır`}>
                        <Icon name="x" size={12} stroke={2.6} />
                      </button>
                    </span>
                  ))}
                  {!kids.length && <span className="chip down">Bağlı öğrenci yok</span>}
                </div>
                <div className="btns" style={{ alignItems: 'flex-end' }}>
                  <label className="field" style={{ minWidth: 240 }} htmlFor={`add-${p.id}`}>
                    Öğrenci bağla
                    <select id={`add-${p.id}`} value={add[p.id] ?? ''} onChange={(e) => setAdd((x) => ({ ...x, [p.id]: e.target.value }))}>
                      <option value="">Seç</option>
                      {students
                        .filter((s) => !kids.some((k) => k.student_id === s.id))
                        .map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.full_name} · {s.class_name}
                          </option>
                        ))}
                    </select>
                  </label>
                  <button className="btn sm" disabled={!add[p.id]} onClick={() => link(p)}>
                    <Icon name="plus" size={15} /> Bağla
                  </button>
                </div>
              </article>
            )
          })}
        </div>
      ) : (
        <div className="empty">Onaylı veli yok. Veliler kayıt olup Onaylar sayfasında onaylanınca burada görünür.</div>
      )}
      {edit && <ProfileModal p={edit} onClose={() => setEdit(null)} />}
      {close && <CloseAccount p={close} onClose={() => setClose(null)} />}
    </>
  )
}

// ---------------------------------------------------------------- Kapalı hesaplar
function Kapali({ profiles, students }: { profiles: Profile[]; students: Stu[] }) {
  const reload = useReload()
  const toast = useToast()
  const list = profiles.filter((p) => p.status === 'rejected')
  async function open(p: Profile) {
    const { error } = await supabase.rpc('set_user_active', { p_profile: p.id, p_active: true })
    if (error) return toast(msg(error)!, 'warn')
    toast(`${p.full_name} hesabı yeniden açıldı`)
    reload()
  }
  return list.length ? (
    <section className="card a" style={{ overflow: 'hidden' }}>
      <div className="tbl">
        <table>
          <thead>
            <tr>
              <th>Kişi</th>
              <th>Rol</th>
              <th>E-posta</th>
              <th aria-label="İşlemler" />
            </tr>
          </thead>
          <tbody>
            {list.map((p) => (
              <tr key={p.id} data-testid="closed-row">
                <td>
                  <b>{p.full_name}</b>
                  {p.role === 'ogrenci' && p.student_id && (
                    <span className="m" style={{ fontSize: 13 }}>
                      {' '}
                      · {students.find((s) => s.id === p.student_id)?.class_name}
                    </span>
                  )}
                </td>
                <td>{ROLE_TR[roleOf(p)]}</td>
                <td className="m" style={{ fontSize: 13 }}>
                  {p.email}
                </td>
                <td>
                  <div className="btns" style={{ justifyContent: 'flex-end' }}>
                    <button className="btn sm" onClick={() => open(p)} aria-label={`${p.full_name} hesabını yeniden aç`}>
                      <Icon name="check" size={15} /> Yeniden aç
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  ) : (
    <div className="empty">Kapatılmış ya da reddedilmiş hesap yok.</div>
  )
}
