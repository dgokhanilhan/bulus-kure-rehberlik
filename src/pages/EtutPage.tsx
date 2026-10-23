// Cumartesi etütleri (0051). Rehber/yönetici: öğretmen × 5 ders planı, talepler, yayın, PDF. Öğretmen: talep, kendi etütleri,
// yoklama. Veli/öğrenci: yalnız kendi (çocuğunun) yayınlanmış etütleri. Yetki veritabanında (RLS + etut_* fonksiyonları).
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '@/auth/AuthProvider'
import { useModules, usePeople, useStudents } from '@/lib/data'
import { useSchoolInfo } from '@/lib/files'
import { isFullAccess, isTeacherP } from '@/lib/roles'
import { todayISO, trDW } from '@/lib/format'
import { useToast } from '@/components/Toast'
import { useAyar } from '@/lib/ayarlar'
import { Icon } from '@/components/Icon'
import { Modal } from '@/components/Modal'
import { useMyStudent } from './FamilyPages'
import {
  DERSLER,
  KADEME_TR,
  MESGUL_ETIKETLER,
  SALONLAR,
  VARSAYILAN_SAATLER,
  baslangicSaatleri,
  cumartesiler,
  isCumartesi,
  saatHatasi,
  sorunlar,
  yerlesimOner,
  type Hucre,
  type Kademe,
  type Saat,
} from '@/lib/etut'
import {
  etutKaydet,
  etutRpc,
  etutTalepEkle,
  etutTalepIptal,
  etutTalepReddet,
  etutYoklama,
  useEtutBenim,
  useEtutGunler,
  useEtutHucreler,
  useKademeOgretmenleri,
  useEtutOgrenci,
  useEtutRefresh,
  useEtutTalepler,
  type EtutGun,
  type EtutHucreRow,
  type EtutTalep,
} from '@/lib/etutData'
import { EtutIceAktar } from './EtutIceAktar'
import './Etut.css'

const kademeOf = (grade?: number | null): Kademe | null => (!grade ? null : grade >= 9 ? 'lise' : grade >= 5 ? 'ortaokul' : null)
const DURUM_TR: Record<EtutTalep['durum'], string> = { bekliyor: 'Bekliyor', planlandi: 'Programa yerleştirildi', reddedildi: 'Reddedildi', iptal: 'İptal edildi' }

export default function EtutPage() {
  const { role } = useAuth()
  const mods = useModules()
  if (!mods.etut && role !== 'admin') return <p className="m">Etüt bölümü okul yönetimi tarafından kapatıldı.</p>
  return (
    <div className="et">
      {isFullAccess(role!) ? <PlanView /> : role === 'brans' ? <OgretmenView /> : <AileView />}
    </div>
  )
}

// =====================================================================================================================
// Rehber / yönetici
// =====================================================================================================================
interface Draft {
  saatler: Saat[]
  hucreler: Hucre[]
  rows: string[] // öğretmen satırları (ad)
}

function PlanView() {
  const toast = useToast()
  const ayar = useAyar()
  const varsayilan = (k: Kademe) => {
    const s = ayar.saatler(`etut.saatler_${k}`)
    return s.length === 5 ? s : VARSAYILAN_SAATLER[k]
  }
  const refresh = useEtutRefresh()
  const school = useSchoolInfo()
  const people = usePeople()
  const students = useStudents()
  const gunler = useEtutGunler()
  const talepler = useEtutTalepler()
  const today = todayISO()
  // Sınıflar → "Etüt programını aç": ?tarih=YYYY-MM-DD&kademe=lise ile açılır
  const [sp] = useSearchParams()
  const [kademe, setKademe] = useState<Kademe>(() => (sp.get('kademe') === 'lise' ? 'lise' : 'ortaokul'))
  const [tarih, setTarih] = useState(() => {
    const t = sp.get('tarih') ?? ''
    return isCumartesi(t) && t >= today ? t : cumartesiler(today, 1)[0]!
  })
  const gun = (gunler.data ?? []).find((g) => g.tarih === tarih && g.kademe === kademe) ?? null
  const hucreQ = useEtutHucreler(gun?.id)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState(false)
  const [edit, setEdit] = useState<{ teacher: string; ders: number } | null>(null)
  const [hepsi, setHepsi] = useState(false)
  const kademeOgr = useKademeOgretmenleri()
  const [saatAc, setSaatAc] = useState(false)
  const [ice, setIce] = useState(false)

  const teachers = useMemo(
    () =>
      (people.data ?? [])
        .filter(isTeacherP)
        .map((p) => ({ id: p.id, name: p.full_name, branch: p.branch }))
        .sort((a, b) => a.name.localeCompare(b.name, 'tr')),
    [people.data],
  )
  const kadOgr = useMemo(() => (students.data ?? []).filter((s) => kademeOf(s.grade) === kademe), [students.data, kademe])
  const stName = useMemo(() => new Map((students.data ?? []).map((s) => [s.id, `${s.full_name} (${s.class_name})`])), [students.data])
  const tid = (name: string) => teachers.find((t) => t.name.toLocaleLowerCase('tr') === name.trim().toLocaleLowerCase('tr'))?.id ?? null

  // Sunucudaki program → taslak (kaydedilmemiş değişiklik yoksa)
  const serverKey = `${tarih}|${kademe}|${gun?.id ?? ''}|${hucreQ.dataUpdatedAt}`
  useEffect(() => {
    if (dirty) return
    if (gun && !hucreQ.data) return
    const hucreler: Hucre[] = (hucreQ.data ?? []).map((h) => ({
      ders: h.ders,
      teacher_id: h.teacher_id,
      teacher_name: h.teacher_name,
      tur: h.tur,
      konu: h.konu,
      salon: h.salon,
      aciklama: h.aciklama,
      talep_id: h.talep_id,
      ogrenciler: h.etut_ogrenciler.map((o) => o.student_id),
    }))
    setDraft({
      saatler: gun ? gun.saatler : baslangicSaatleri(gunler.data ?? [], kademe, varsayilan(kademe)),
      hucreler,
      rows: [...new Set(hucreler.map((h) => h.teacher_name))],
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverKey, dirty, gunler.data, draft === null])

  const change = (f: (d: Draft) => Draft) => {
    setDraft((d) => (d ? f(d) : d))
    setDirty(true)
  }
  const switchTo = (t: string, k: Kademe) => {
    if (t === tarih && k === kademe) return // aynı seçim: taslak boşaltılmaz (yeniden yüklenmeyeceği için ekran takılırdı)
    if (dirty && !window.confirm('Kaydedilmemiş değişiklikler kaybolacak. Devam edilsin mi?')) return
    setDirty(false)
    setDraft(null)
    setTarih(t)
    setKademe(k)
  }

  if (!draft || people.isLoading || students.isLoading) return <p className="m">Yükleniyor…</p>
  // Satırlar: bu programda kaydı olanlar + bu kademede derse girenler (ders programından; iki kademede dersi olan ikisinde de).
  // "Diğer kademeyi de göster" açıksa bütün öğretmenler.
  const kademeAdlari = teachers.filter((t) => kademeOgr.data?.[kademe].has(t.id)).map((t) => t.name)
  const rows = [...new Set([...draft.rows, ...kademeAdlari, ...(hepsi ? teachers.map((t) => t.name) : [])])].sort((a, b) => a.localeCompare(b, 'tr'))
  const cellOf = (name: string, ders: number) =>
    draft.hucreler.find((h) => h.ders === ders && h.teacher_name.trim().toLocaleLowerCase('tr') === name.trim().toLocaleLowerCase('tr'))
  const issues = sorunlar(draft.hucreler, (id) => stName.get(id) ?? 'Öğrenci')
  const sh = saatHatasi(draft.saatler)
  const bekleyen = (talepler.data ?? []).filter((t) => t.durum === 'bekliyor')
  const serverCell = (name: string, ders: number) =>
    (hucreQ.data ?? []).find((h) => h.ders === ders && h.teacher_name.trim().toLocaleLowerCase('tr') === name.trim().toLocaleLowerCase('tr'))

  async function save(): Promise<string | null> {
    if (sh) return toast(sh, 'warn'), null
    const serious = issues.filter((i) => i.ciddi)
    if (serious.length) return toast(serious[0]!.text, 'warn'), null
    setBusy(true)
    try {
      const id = await etutKaydet(gun?.id ?? null, { tarih, kademe, saatler: draft!.saatler, hucreler: draft!.hucreler })
      setDirty(false)
      await refresh()
      toast(gun?.durum === 'yayinda' ? 'Kaydedildi; programı değişen öğrenci ve velilere bildirim gitti' : 'Taslak kaydedildi')
      return id
    } catch (e) {
      toast((e as Error).message, 'warn')
      return null
    } finally {
      setBusy(false)
    }
  }
  async function publish() {
    const id = dirty || !gun ? await save() : gun.id
    if (!id) return
    if (!window.confirm('Program yayınlansın mı? Etüdü olan öğrenci ve velilere bildirim gider.')) return
    try {
      await etutRpc('etut_yayinla', id)
      await refresh()
      toast('Program yayınlandı')
    } catch (e) {
      toast((e as Error).message, 'warn')
    }
  }
  async function remove() {
    if (!gun) return
    if (!window.confirm(gun.durum === 'yayinda' ? 'Yayındaki program silinsin mi? Öğrenci ve velilere "iptal" bildirimi gider.' : 'Taslak program silinsin mi?')) return
    try {
      await etutRpc('etut_sil', gun.id)
      setDirty(false)
      setDraft(null)
      await refresh()
      toast('Program silindi')
    } catch (e) {
      toast((e as Error).message, 'warn')
    }
  }
  async function downloadPdf() {
    try {
      const { etutPdf } = await import('@/lib/etutPdf')
      const blob = await etutPdf({
        school: school.data?.name ?? 'Buluş Küre Koleji',
        title: `${KADEME_TR[kademe]} · ${new Date(`${tarih}T12:00:00Z`).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', weekday: 'long', timeZone: 'UTC' })}`,
        durum: gun?.durum === 'yayinda' ? 'Yayında' : 'Taslak',
        saatler: draft!.saatler,
        satirlar: draft!.rows.map((r) => ({
          ogretmen: r,
          hucreler: DERSLER.map((d) => {
            const h = cellOf(r, d)
            if (!h) return null
            return h.tur === 'mesgul'
              ? { tur: 'mesgul' as const, aciklama: h.aciklama ?? '' }
              : { tur: 'etut' as const, konu: h.konu ?? '', salon: h.salon ?? '', ogrenciler: h.ogrenciler.map((s) => (stName.get(s) ?? '').replace(/ \(.*/, '')) }
          }),
        })),
        printed: new Date().toLocaleString('tr-TR', { dateStyle: 'long', timeStyle: 'short' }),
        logo: ayar.bool('rapor.logo'),
      })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `Etut-Programi_${kademe}_${tarih}.pdf`
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(a.href), 10_000)
    } catch {
      toast('PDF oluşturulamadı.', 'warn')
    }
  }
  function placeTalep(t: EtutTalep) {
    const name = teachers.find((x) => x.id === t.teacher_id)?.name ?? t.teacher_name
    const d = yerlesimOner(draft!.hucreler, name, t.ogrenciler, t.istenen_ders)
    if (!d) return toast(`${name} için bu programda uygun boş ders yok (öğretmen ya da öğrenciler dolu).`, 'warn')
    change((x) => ({
      ...x,
      rows: x.rows.includes(name) ? x.rows : [...x.rows, name],
      hucreler: [...x.hucreler, { ders: d, teacher_id: t.teacher_id, teacher_name: name, tur: 'etut', konu: t.konu, salon: null, aciklama: t.aciklama, talep_id: t.id, ogrenciler: t.ogrenciler }],
    }))
    toast(`${name} · ${d}. derse yerleştirildi. Kaydetmeyi unutma.`, 'spark')
  }
  async function rejectTalep(t: EtutTalep) {
    const not = window.prompt(`"${t.konu}" talebini reddetme gerekçesi (öğretmene gider):`)
    if (!not) return
    try {
      await etutTalepReddet(t.id, not)
      await refresh()
      toast('Talep reddedildi; öğretmene bildirildi')
    } catch (e) {
      toast((e as Error).message, 'warn')
    }
  }

  const sats = cumartesiler(today, 8)
  const pastSats = [...new Set((gunler.data ?? []).map((g) => g.tarih))].filter((t) => !sats.includes(t)).sort().reverse().slice(0, 8)
  const editing = edit ? (cellOf(edit.teacher, edit.ders) ?? null) : null

  return (
    <>
      <header className="page-intro">
        <span className="label">Rehberlik · Cumartesi</span>
        <h1 className="hd">Etüt</h1>
        <p className="m">Öğretmen × ders saati planını hazırla, öğretmenlerin etüt taleplerini yerleştir, yayınla. Yayınlanan program veli ve öğrenciye görünür.</p>
      </header>

      <section className="card et-card">
        <div className="et-bar">
          <label className="field">
            Cumartesi
            <select value={tarih} onChange={(e) => switchTo(e.target.value, kademe)}>
              {sats.map((t) => (
                <option key={t} value={t}>
                  {trDW(t)}
                  {(gunler.data ?? []).some((g) => g.tarih === t) ? ' •' : ''}
                </option>
              ))}
              {pastSats.length > 0 && (
                <optgroup label="Geçmiş">
                  {pastSats.map((t) => (
                    <option key={t} value={t}>
                      {trDW(t)}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </label>
          <div className="seg" role="group" aria-label="Kademe">
            {(['ortaokul', 'lise'] as Kademe[]).map((k) => (
              <button key={k} aria-pressed={kademe === k} className={kademe === k ? 'hwon' : ''} onClick={() => switchTo(tarih, k)}>
                {KADEME_TR[k]}
              </button>
            ))}
          </div>
          <span className={`chip ${gun?.durum === 'yayinda' ? 'up' : 'n'}`}>{!gun ? 'Yeni program' : gun.durum === 'yayinda' ? 'Yayında' : 'Taslak'}</span>
          {dirty && <span className="chip gold">Kaydedilmemiş değişiklik</span>}
        </div>

        <div className="et-saat">
          <button className="btn sm" onClick={() => setSaatAc(!saatAc)} aria-expanded={saatAc}>
            <Icon name="cal" size={15} /> Ders saatleri: {draft.saatler.map((s) => `${s.bas}–${s.bit}`).join(' · ')}
          </button>
          {saatAc && (
            <div className="et-saatler">
              {draft.saatler.map((s, i) => (
                <div key={i} className="et-saatrow">
                  <b>{i + 1}. ders</b>
                  <input type="time" aria-label={`${i + 1}. ders başlangıç`} value={s.bas} onChange={(e) => change((x) => ({ ...x, saatler: x.saatler.map((y, j) => (j === i ? { ...y, bas: e.target.value } : y)) }))} />
                  <input type="time" aria-label={`${i + 1}. ders bitiş`} value={s.bit} onChange={(e) => change((x) => ({ ...x, saatler: x.saatler.map((y, j) => (j === i ? { ...y, bit: e.target.value } : y)) }))} />
                </div>
              ))}
              <button className="btn sm" onClick={() => change((x) => ({ ...x, saatler: varsayilan(kademe).map((y) => ({ ...y })) }))}>
                Varsayılana dön
              </button>
              {sh && <p className="err">{sh}</p>}
            </div>
          )}
        </div>

        <div className="tbl et-tbl">
          <table>
            <thead>
              <tr>
                <th>Öğretmen</th>
                {DERSLER.map((d) => (
                  <th key={d}>
                    {d}. ders
                    <span className="et-th">
                      {draft.saatler[d - 1]?.bas}–{draft.saatler[d - 1]?.bit}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r}>
                  <td>
                    <b>{r}</b>
                  </td>
                  {DERSLER.map((d) => {
                    const h = cellOf(r, d)
                    return (
                      <td key={d}>
                        <button className={`et-cell ${h ? (h.tur === 'mesgul' ? 'busy' : 'etut') : ''}`} aria-label={`${r} ${d}. ders`} onClick={() => setEdit({ teacher: r, ders: d })}>
                          {!h ? (
                            <span className="m">+</span>
                          ) : h.tur === 'mesgul' ? (
                            <span>{h.aciklama || 'Meşgul'}</span>
                          ) : (
                            <>
                              <b>{h.konu}</b>
                              <span className="m">
                                {[h.salon, `${h.ogrenciler.length} öğrenci`].filter(Boolean).join(' · ')}
                              </span>
                            </>
                          )}
                        </button>
                      </td>
                    )
                  })}
                </tr>
              ))}
              {!rows.length && (
                <tr>
                  <td colSpan={6} className="m">
                    Henüz satır yok. Aşağıdan öğretmen ekle ya da bir talebi yerleştir.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="et-tools">
          <select
            aria-label="Öğretmen satırı ekle"
            value=""
            onChange={(e) => e.target.value && change((x) => ({ ...x, rows: x.rows.includes(e.target.value) ? x.rows : [...x.rows, e.target.value] }))}
          >
            <option value="">+ Öğretmen satırı ekle</option>
            {teachers
              .filter((t) => !rows.includes(t.name))
              .map((t) => (
                <option key={t.id} value={t.name}>
                  {t.name}
                </option>
              ))}
          </select>
          <button className="btn sm" onClick={() => setIce(true)}>
            <Icon name="up" size={15} /> İçe aktar (Excel, görsel, PDF)
          </button>
          <label className="et-check">
            <input type="checkbox" checked={hepsi} onChange={(e) => setHepsi(e.target.checked)} /> Diğer kademedeki öğretmenleri de göster
          </label>
        </div>
        <div className="et-issues" role="status">
          {issues.map((i, n) => (
            <p key={n} className={i.ciddi ? 'bad' : ''}>
              <Icon name="warn" size={15} /> {i.text}
            </p>
          ))}
        </div>
      </section>

      <section className="card et-card">
        <h2 className="sec">
          Bekleyen etüt talepleri <span className="chip n">{bekleyen.length}</span>
        </h2>
        {bekleyen.length ? (
          <ul className="et-talepler">
            {bekleyen.map((t) => (
              <li key={t.id}>
                <div>
                  <b>{t.konu}</b> · {t.teacher_name}
                  <span className="m">
                    {t.ogrenciler.map((s) => stName.get(s) ?? 'Öğrenci').join(', ')}
                    {t.istenen_tarih ? ` · istenen: ${trDW(t.istenen_tarih)}` : ''}
                    {t.istenen_ders ? ` ${t.istenen_ders}. ders` : ''}
                  </span>
                  {t.aciklama && <span className="m">{t.aciklama}</span>}
                </div>
                <div className="btns">
                  <button className="btn sm pri" onClick={() => placeTalep(t)}>
                    Bu programa yerleştir
                  </button>
                  <button className="btn sm" onClick={() => rejectTalep(t)}>
                    Reddet
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="m">Bekleyen talep yok.</p>
        )}
      </section>

      <div className="et-actions">
        {gun && (
          <button className="btn" onClick={remove} disabled={busy}>
            <Icon name="trash" size={16} /> Sil
          </button>
        )}
        <button className="btn" onClick={downloadPdf}>
          <Icon name="doc" size={16} /> PDF indir / yazdır
        </button>
        <button className="btn" onClick={save} disabled={busy || (!dirty && !!gun)}>
          <Icon name="check" size={16} /> Kaydet
        </button>
        <button className="btn pri" onClick={publish} disabled={busy || (gun?.durum === 'yayinda' && !dirty)}>
          <Icon name="right" size={16} /> {gun?.durum === 'yayinda' ? 'Değişiklikleri yayınla' : 'Yayınla'}
        </button>
      </div>

      {ice && (
        <EtutIceAktar
          teachers={teachers}
          kademeOgretmen={kademeOgr.data?.[kademe]}
          tarih={tarih}
          kademe={kademe}
          ogrenciler={kadOgr.map((s) => ({ id: s.id, full_name: s.full_name, class_name: s.class_name, grade: s.grade }))}
          onClose={() => setIce(false)}
          onApply={({ saatler, hucreler }) => {
            const key = (h: Hucre) => `${h.teacher_name.trim().toLocaleLowerCase('tr')}|${h.ders}`
            const yeni = new Set(hucreler.map(key))
            change((x) => ({
              saatler: saatler && !saatHatasi(saatler) ? saatler : x.saatler,
              rows: [...new Set([...x.rows, ...hucreler.map((h) => h.teacher_name)])],
              hucreler: [...x.hucreler.filter((h) => !yeni.has(key(h))), ...hucreler],
            }))
            setIce(false)
            toast(`${hucreler.length} hücre aktarıldı. Kontrol edip "Kaydet"e bas.`, 'spark')
          }}
        />
      )}
      {edit && (
        <HucreModal
          teacher={edit.teacher}
          ders={edit.ders}
          saat={draft.saatler[edit.ders - 1]!}
          value={editing}
          students={kadOgr.map((s) => ({ id: s.id, name: `${s.full_name} (${s.class_name})` }))}
          salonlar={ayar.list('etut.salonlar')}
          etiketler={ayar.list('etut.mesgul_etiketleri')}
          busyIn={(sid) => draft.hucreler.find((h) => h.ders === edit.ders && h.tur === 'etut' && h.ogrenciler.includes(sid) && h !== editing)?.teacher_name ?? null}
          server={!dirty && gun?.durum === 'yayinda' && tarih <= today ? (serverCell(edit.teacher, edit.ders) ?? null) : null}
          onYoklama={async () => {
            await refresh()
          }}
          onClose={() => setEdit(null)}
          onSave={(h) => {
            change((x) => ({
              ...x,
              rows: x.rows.includes(edit.teacher) ? x.rows : [...x.rows, edit.teacher],
              hucreler: [...x.hucreler.filter((y) => y !== editing), ...(h ? [{ ...h, ders: edit.ders, teacher_name: edit.teacher, teacher_id: editing?.teacher_id ?? tid(edit.teacher) }] : [])],
            }))
            setEdit(null)
          }}
        />
      )}
    </>
  )
}

function HucreModal(p: {
  teacher: string
  ders: number
  saat: Saat
  value: Hucre | null
  students: { id: string; name: string }[]
  busyIn: (sid: string) => string | null
  salonlar: string[]
  etiketler: string[]
  server: EtutHucreRow | null
  onYoklama: () => Promise<void>
  onClose: () => void
  onSave: (h: Omit<Hucre, 'ders' | 'teacher_name' | 'teacher_id'> | null) => void
}) {
  const toast = useToast()
  const [tur, setTur] = useState<'etut' | 'mesgul'>(p.value?.tur ?? 'etut')
  const [konu, setKonu] = useState(p.value?.konu ?? '')
  const [salon, setSalon] = useState(p.value?.salon ?? '')
  const [aciklama, setAciklama] = useState(p.value?.aciklama ?? '')
  const [sel, setSel] = useState<string[]>(p.value?.ogrenciler ?? [])
  const [q, setQ] = useState('')
  const found = q.trim().length >= 2 ? p.students.filter((s) => s.name.toLocaleLowerCase('tr').includes(q.trim().toLocaleLowerCase('tr'))).slice(0, 30) : []
  const name = (id: string) => p.students.find((s) => s.id === id)?.name ?? 'Öğrenci'
  return (
    <Modal
      title={`${p.teacher} · ${p.ders}. ders`}
      sub={`${p.saat.bas}–${p.saat.bit}`}
      onClose={p.onClose}
      footer={
        <>
          {p.value && (
            <button className="btn" onClick={() => p.onSave(null)}>
              Hücreyi boşalt
            </button>
          )}
          <button className="btn" onClick={p.onClose}>
            Vazgeç
          </button>
          <button
            className="btn pri"
            onClick={() => {
              if (tur === 'etut' && !konu.trim()) return toast('Etüt konusunu yaz.', 'warn')
              p.onSave({ tur, konu: tur === 'etut' ? konu.trim() : null, salon: tur === 'etut' ? salon.trim() || null : null, aciklama: aciklama.trim() || null, talep_id: p.value?.talep_id ?? null, ogrenciler: tur === 'etut' ? sel : [] })
            }}
          >
            Tamam
          </button>
        </>
      }
    >
      <div className="seg" role="group" aria-label="Hücre türü">
        <button aria-pressed={tur === 'etut'} className={tur === 'etut' ? 'hwon' : ''} onClick={() => setTur('etut')}>
          Etüt
        </button>
        <button aria-pressed={tur === 'mesgul'} className={tur === 'mesgul' ? 'hwon' : ''} onClick={() => setTur('mesgul')}>
          Meşgul
        </button>
      </div>
      {tur === 'etut' ? (
        <div className="stack" style={{ gap: 10, marginTop: 12 }}>
          <label className="field">
            Konu
            <input value={konu} maxLength={120} onChange={(e) => setKonu(e.target.value)} placeholder="Ör. Üslü ifadeler soru çözümü" />
          </label>
          <label className="field">
            Yer (isteğe bağlı)
            <input list="et-salonlar" value={salon} maxLength={40} onChange={(e) => setSalon(e.target.value)} placeholder="Ör. 9-A sınıfı" />
            <datalist id="et-salonlar">
              {(p.salonlar.length ? p.salonlar : SALONLAR).map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </label>
          <label className="field">
            Öğrenci ara (en az 2 harf)
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ad ya da sınıf" />
          </label>
          {found.length > 0 && (
            <ul className="et-found">
              {found.map((s) => {
                const busy = p.busyIn(s.id)
                const on = sel.includes(s.id)
                return (
                  <li key={s.id}>
                    <label className="et-check">
                      <input type="checkbox" checked={on} onChange={() => setSel(on ? sel.filter((x) => x !== s.id) : [...sel, s.id])} /> {s.name}
                      {busy && !on && <span className="chip down">Bu derste {busy} etüdünde</span>}
                    </label>
                  </li>
                )
              })}
            </ul>
          )}
          <div className="et-sel">
            {sel.map((id) => (
              <span key={id} className="chip up">
                {name(id)}
                <button className="xbtn" aria-label={`${name(id)} çıkar`} onClick={() => setSel(sel.filter((x) => x !== id))}>
                  <Icon name="x" size={12} />
                </button>
              </span>
            ))}
            {!sel.length && <span className="m">Öğrenci seçilmedi.</span>}
          </div>
          <label className="field">
            Not (isteğe bağlı)
            <input value={aciklama} maxLength={200} onChange={(e) => setAciklama(e.target.value)} />
          </label>
          {p.server && p.server.tur === 'etut' && (
            <Yoklama hucre={p.server} onDone={p.onYoklama} />
          )}
        </div>
      ) : (
        <div className="stack" style={{ gap: 10, marginTop: 12 }}>
          <div className="btns">
            {(p.etiketler.length ? p.etiketler : MESGUL_ETIKETLER).map((m) => (
              <button key={m} className={`btn sm${aciklama === m ? ' pri' : ''}`} onClick={() => setAciklama(m)}>
                {m}
              </button>
            ))}
          </div>
          <label className="field">
            Açıklama
            <input value={aciklama} maxLength={200} onChange={(e) => setAciklama(e.target.value)} placeholder="Ör. 9/A sınav gözetmeni" />
          </label>
        </div>
      )}
    </Modal>
  )
}

function Yoklama({ hucre, onDone }: { hucre: EtutHucreRow; onDone: () => Promise<void> }) {
  const toast = useToast()
  const [busy, setBusy] = useState<string | null>(null)
  async function mark(sid: string, d: 'geldi' | 'gelmedi' | null) {
    setBusy(sid)
    try {
      await etutYoklama(hucre.id, sid, d)
      await onDone()
    } catch (e) {
      toast((e as Error).message, 'warn')
    }
    setBusy(null)
  }
  return (
    <div className="et-yoklama">
      <b>Yoklama</b>
      {hucre.etut_ogrenciler.map((o) => (
        <div key={o.student_id} className="et-yrow">
          <span>
            {o.student_name} <span className="m">{o.class_name}</span>
          </span>
          <div className="btns">
            {(['geldi', 'gelmedi'] as const).map((d) => (
              <button
                key={d}
                className={`btn sm${o.yoklama === d ? (d === 'geldi' ? ' pri' : ' warn') : ''}`}
                aria-pressed={o.yoklama === d}
                disabled={busy === o.student_id}
                onClick={() => mark(o.student_id, o.yoklama === d ? null : d)}
              >
                {d === 'geldi' ? 'Geldi' : 'Gelmedi'}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// =====================================================================================================================
// Öğretmen
// =====================================================================================================================
function OgretmenView() {
  const { profile } = useAuth()
  const ayar = useAyar()
  const talepAcik = ayar.bool('etut.talep_acik')
  const yoklamaAcik = ayar.bool('etut.yoklama_ogretmen')
  const toast = useToast()
  const refresh = useEtutRefresh()
  const students = useStudents()
  const talepler = useEtutTalepler()
  const benim = useEtutBenim(profile?.id)
  const gunler = useEtutGunler()
  const today = todayISO()
  const [konu, setKonu] = useState('')
  const [aciklama, setAciklama] = useState('')
  const [sel, setSel] = useState<string[]>([])
  const [q, setQ] = useState('')
  const [istTarih, setIstTarih] = useState('')
  const [istDers, setIstDers] = useState('')
  const [busy, setBusy] = useState(false)
  const [progGun, setProgGun] = useState<string | null>(null)
  const list = students.data ?? []
  const found = q.trim().length >= 2 ? list.filter((s) => `${s.full_name} ${s.class_name}`.toLocaleLowerCase('tr').includes(q.trim().toLocaleLowerCase('tr'))).slice(0, 30) : []
  const name = (id: string) => {
    const s = list.find((x) => x.id === id)
    return s ? `${s.full_name} (${s.class_name})` : 'Öğrenci'
  }
  const mine = (talepler.data ?? []).filter((t) => t.teacher_id === profile?.id)
  const yayinda = (gunler.data ?? []).filter((g) => g.durum === 'yayinda')

  async function send() {
    if (konu.trim().length < 2) return toast('Etüt konusunu yaz.', 'warn')
    if (!sel.length) return toast('En az bir öğrenci seç.', 'warn')
    setBusy(true)
    try {
      await etutTalepEkle({ konu: konu.trim(), aciklama: aciklama.trim(), ogrenciler: sel, istenen_tarih: istTarih || null, istenen_ders: istDers ? Number(istDers) : null })
      setKonu('')
      setAciklama('')
      setSel([])
      setQ('')
      await refresh()
      toast('Talep rehber öğretmene iletildi')
    } catch (e) {
      toast((e as Error).message, 'warn')
    }
    setBusy(false)
  }

  return (
    <>
      <header className="page-intro">
        <span className="label">Cumartesi etütleri</span>
        <h1 className="hd">Etüt</h1>
        <p className="m">Öğrencilerin için etüt talebi oluştur; rehber öğretmen programa yerleştirir. Etüt gününde yoklamanı buradan al.</p>
      </header>

      {talepAcik ? (
      <section className="card et-card">
        <h2 className="sec">Etüt talebi oluştur</h2>
        <label className="field">
          Konu
          <input value={konu} maxLength={120} onChange={(e) => setKonu(e.target.value)} placeholder="Ör. Çarpanlar ve katlar tekrar" />
        </label>
        <label className="field">
          Öğrenci ara (en az 2 harf)
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ad ya da sınıf" />
        </label>
        {found.length > 0 && (
          <ul className="et-found">
            {found.map((s) => {
              const on = sel.includes(s.id)
              return (
                <li key={s.id}>
                  <label className="et-check">
                    <input type="checkbox" checked={on} onChange={() => setSel(on ? sel.filter((x) => x !== s.id) : [...sel, s.id])} /> {s.full_name} ({s.class_name})
                  </label>
                </li>
              )
            })}
          </ul>
        )}
        <div className="et-sel">
          {sel.map((id) => (
            <span key={id} className="chip up">
              {name(id)}
              <button className="xbtn" aria-label={`${name(id)} çıkar`} onClick={() => setSel(sel.filter((x) => x !== id))}>
                <Icon name="x" size={12} />
              </button>
            </span>
          ))}
        </div>
        <div className="et-fields">
          <label className="field">
            İstenen Cumartesi (isteğe bağlı)
            <select value={istTarih} onChange={(e) => setIstTarih(e.target.value)}>
              <option value="">Fark etmez</option>
              {cumartesiler(today, 6).map((t) => (
                <option key={t} value={t}>
                  {trDW(t)}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            İstenen ders (isteğe bağlı)
            <select value={istDers} onChange={(e) => setIstDers(e.target.value)}>
              <option value="">Fark etmez</option>
              {DERSLER.map((d) => (
                <option key={d} value={d}>
                  {d}. ders
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="field">
          Açıklama (isteğe bağlı)
          <input value={aciklama} maxLength={500} onChange={(e) => setAciklama(e.target.value)} />
        </label>
        <div className="btns">
          <button className="btn pri" onClick={send} disabled={busy}>
            <Icon name="right" size={16} /> Talebi gönder
          </button>
        </div>
      </section>
      ) : (
        <p className="m">Etüt talepleri şu an kapalı.</p>
      )}

      <section className="card et-card">
        <h2 className="sec">Taleplerim</h2>
        {mine.length ? (
          <ul className="et-talepler">
            {mine.map((t) => (
              <li key={t.id}>
                <div>
                  <b>{t.konu}</b> <span className={`chip ${t.durum === 'planlandi' ? 'up' : t.durum === 'reddedildi' ? 'down' : 'n'}`}>{DURUM_TR[t.durum]}</span>
                  <span className="m">
                    {t.ogrenciler.map(name).join(', ')}
                    {t.plan_tarih ? ` · ${trDW(t.plan_tarih)} ${t.plan_ders}. ders` : ''}
                  </span>
                  {t.karar_notu && <span className="m">Rehber öğretmen: {t.karar_notu}</span>}
                </div>
                {t.durum === 'bekliyor' && (
                  <button
                    className="btn sm"
                    onClick={async () => {
                      try {
                        await etutTalepIptal(t.id)
                        await refresh()
                        toast('Talep iptal edildi')
                      } catch (e) {
                        toast((e as Error).message, 'warn')
                      }
                    }}
                  >
                    İptal et
                  </button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="m">Henüz talebin yok.</p>
        )}
      </section>

      <section className="card et-card">
        <h2 className="sec">Etütlerim</h2>
        {(benim.data ?? []).length ? (
          <ul className="et-list">
            {[...(benim.data ?? [])]
              .sort((a, b) => (b.etut_gunler?.tarih ?? '').localeCompare(a.etut_gunler?.tarih ?? '') || a.ders - b.ders)
              .map((h) => {
                const g = h.etut_gunler!
                const sa = g.saatler[h.ders - 1]
                return (
                  <li key={h.id} className="et-item">
                    <b>
                      {trDW(g.tarih)} · {h.ders}. ders {sa ? `${sa.bas}–${sa.bit}` : ''}
                    </b>
                    <span className="m">{[h.konu, h.salon, KADEME_TR[g.kademe]].filter(Boolean).join(' · ')}</span>
                    {g.tarih <= today && yoklamaAcik ? (
                      <Yoklama hucre={h} onDone={async () => void (await refresh())} />
                    ) : (
                      <span className="m">{h.etut_ogrenciler.map((o) => `${o.student_name} (${o.class_name})`).join(', ')} · Yoklama etüt günü açılır.</span>
                    )}
                  </li>
                )
              })}
          </ul>
        ) : (
          <p className="m">Yayınlanmış etüdün yok.</p>
        )}
      </section>

      <section className="card et-card">
        <h2 className="sec">Yayınlanan programlar</h2>
        <div className="btns">
          {yayinda.map((g) => (
            <button key={g.id} className={`btn sm${progGun === g.id ? ' pri' : ''}`} onClick={() => setProgGun(progGun === g.id ? null : g.id)}>
              {trDW(g.tarih)} · {KADEME_TR[g.kademe]}
            </button>
          ))}
          {!yayinda.length && <span className="m">Yayınlanmış program yok.</span>}
        </div>
        {progGun && <ProgramOku gun={yayinda.find((g) => g.id === progGun)!} />}
      </section>
    </>
  )
}

function ProgramOku({ gun }: { gun: EtutGun }) {
  const q = useEtutHucreler(gun.id)
  const rows = [...new Set((q.data ?? []).map((h) => h.teacher_name))]
  return (
    <div className="tbl et-tbl">
      <table>
        <thead>
          <tr>
            <th>Öğretmen</th>
            {DERSLER.map((d) => (
              <th key={d}>
                {d}. ders
                <span className="et-th">
                  {gun.saatler[d - 1]?.bas}–{gun.saatler[d - 1]?.bit}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r}>
              <td>
                <b>{r}</b>
              </td>
              {DERSLER.map((d) => {
                const h = (q.data ?? []).find((x) => x.teacher_name === r && x.ders === d)
                return (
                  <td key={d} className={h?.tur === 'mesgul' ? 'et-busytd' : ''}>
                    {!h ? '—' : h.tur === 'mesgul' ? h.aciklama || 'Meşgul' : `${h.konu}${h.salon ? ` · ${h.salon}` : ''}`}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// =====================================================================================================================
// Veli / öğrenci
// =====================================================================================================================
function AileView() {
  const { s, veli } = useMyStudent()
  const q = useEtutOgrenci(s?.id)
  const today = todayISO()
  if (!s) return <p className="m">Yükleniyor…</p>
  const all = (q.data ?? []).filter((x) => x.etut_gunler)
  const gelecek = all.filter((x) => x.etut_gunler!.tarih >= today)
  const gecmis = all.filter((x) => x.etut_gunler!.tarih < today).reverse()
  const first = s.full_name.split(' ')[0]
  const Row = ({ x }: { x: (typeof all)[number] }) => {
    const sa = x.etut_gunler!.saatler[x.ders - 1]
    return (
      <li className="et-item">
        <b>
          {trDW(x.etut_gunler!.tarih)} · {x.ders}. ders {sa ? `${sa.bas}–${sa.bit}` : ''}
        </b>
        <span className="m">{[x.etut_hucreler?.konu, x.etut_hucreler?.teacher_name, x.etut_hucreler?.salon].filter(Boolean).join(' · ')}</span>
        {x.yoklama && <span className={`chip ${x.yoklama === 'geldi' ? 'up' : 'down'}`}>{x.yoklama === 'geldi' ? 'Katıldı' : 'Katılmadı'}</span>}
      </li>
    )
  }
  return (
    <>
      <header className="page-intro">
        <span className="label">Cumartesi etütleri</span>
        <h1 className="hd">Etüt</h1>
        <p className="m">
          {veli ? `${first} için planlanan Cumartesi etütlerini burada görebilirsiniz.` : 'Senin için planlanan Cumartesi etütleri burada.'}
        </p>
      </header>
      <section className="card et-card">
        <h2 className="sec">Yaklaşan etütler</h2>
        {gelecek.length ? (
          <ul className="et-list">
            {gelecek.map((x) => (
              <Row key={x.id} x={x} />
            ))}
          </ul>
        ) : (
          <p className="m">{veli ? 'Yaklaşan etüt yok. Program yayınlandığında burada görünür.' : 'Yaklaşan etüdün yok. Program yayınlandığında burada görünür.'}</p>
        )}
      </section>
      {gecmis.length > 0 && (
        <section className="card et-card">
          <h2 className="sec">Geçmiş etütler</h2>
          <ul className="et-list">
            {gecmis.map((x) => (
              <Row key={x.id} x={x} />
            ))}
          </ul>
        </section>
      )}
    </>
  )
}
