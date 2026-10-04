// Denemeler → 5–12 genel içe aktarma sihirbazı (8. sınıf LGS PDF'leri mevcut akışta kalır).
// Kaynak: tanınan PDF (genel motor) · Excel/CSV · elle giriş. Hepsi aynı kontrol ekranından geçer ve import_exam ile
// tek işlemde taslak (ya da hemen yayında) kaydedilir. Tanıma güveni düşük alan boş bırakılır; kullanıcı seçmeden ilerlenmez.
import { useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useClasses, useRefresh, useStudents } from '@/lib/data'
import { todayISO } from '@/lib/format'
import { Icon } from '@/components/Icon'
import { Toggle } from '@/components/Tasks'
import { useToast } from '@/components/Toast'
import { EXAM_TYPE_TR, defaultExamType, isScore, totals, type ExamType, type YksPart } from '@/lib/denemeGenel'
import { usePublishers, useExamTemplates, useTypeDefaults, type TemplateRow } from '@/lib/denemeData'
import { buildGenelReview, genelPending, toImportPayload, type Choice, type GenelPack, type GenelReview } from '@/lib/genelImport'
import { manualToPack, sha256Hex, tableTemplate, tableToPack, type ManualEntry } from '@/lib/genelTablo'
import { parseCsv, toCsv } from '@/lib/aktarim'

export type GenelSource = { kind: 'pdf'; pack: GenelPack } | { kind: 'tablo' } | { kind: 'manuel' }
const SURE = 0.8 // bu güvenin altındaki tanıma önerilmez, kullanıcı seçer
const GENEL_GRADES = [5, 6, 7, 9, 10, 11, 12]
const pct = (c: number) => `%${Math.round(c * 100)}`

interface Meta {
  grade: number | null
  examType: ExamType | null
  yksPart: YksPart | null
  publisherId: string
  templateId: string
  name: string
  date: string
  code: string
  targets: string[]
  status: 'taslak' | 'yayinda'
  notify: boolean
  allowMismatch: boolean
}

export function GenelSihirbaz({ source, onCancel }: { source: GenelSource; onCancel: () => void }) {
  const tpls = useExamTemplates(), pubs = usePublishers(), defs = useTypeDefaults(), classes = useClasses(), students = useStudents()
  const toast = useToast(), refresh = useRefresh()
  const det = source.kind === 'pdf' ? source.pack.detection : null
  const [meta, setMeta] = useState<Meta>(() => ({
    grade: det?.grade && det.grade.confidence >= SURE ? det.grade.value : null,
    examType: det?.examType && det.examType.confidence >= SURE ? det.examType.value : null,
    yksPart: det?.examType && det.examType.confidence >= SURE ? det.examType.yksPart : null,
    publisherId: '',
    templateId: '',
    name: det?.exam?.title ?? '',
    date: todayISO(),
    code: det?.exam?.code ?? '',
    targets: [],
    status: 'taslak',
    notify: true,
    allowMismatch: false,
  }))
  const [pack, setPack] = useState<GenelPack | null>(source.kind === 'pdf' ? source.pack : null)
  const [rv, setRv] = useState<GenelReview | null>(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<{ exam_id: string; results: number; items: number; resolved: number; unresolved: number; duplicate: boolean } | null>(null)
  const set = (p: Partial<Meta>) => setMeta((m) => ({ ...m, ...p }))

  // Yayın: tanınan ad yayın listesinde varsa ve güven yeterliyse önerilir
  const detPub = det?.publisher && det.publisher.confidence >= SURE ? pubs.data?.find((p) => p.name === det.publisher!.value) : undefined
  const publisherId = meta.publisherId || detPub?.id || ''
  // Sınav türü: tanınmadıysa sınıfın varsayılanı
  const def = meta.grade ? defaultExamType(meta.grade, defs.data ?? []) : null
  const examType = meta.examType ?? def?.exam_type ?? null
  const yksPart = examType === 'YKS' ? (meta.yksPart ?? def?.yks_part ?? null) : null
  const cands = useMemo(
    () => (tpls.data ?? []).filter((t) => t.grade === meta.grade && t.status === 'hazir' && examType && t.exam_types.includes(examType) && (examType !== 'YKS' || (yksPart && t.exam_types.includes(yksPart)))),
    [tpls.data, meta.grade, examType, yksPart],
  )
  const tpl: TemplateRow | undefined = cands.find((t) => t.id === meta.templateId) ?? (cands.length === 1 ? cands[0] : undefined)
  const gradeClasses = (classes.data ?? []).filter((c) => c.grade === meta.grade)
  const roster = useMemo(() => (students.data ?? []).filter((s) => meta.allowMismatch || s.grade === meta.grade), [students.data, meta.grade, meta.allowMismatch])
  const metaOk = !!(meta.grade && examType && (examType !== 'YKS' || yksPart) && tpl && meta.name.trim() && meta.date)

  function review(p: GenelPack) {
    if (!tpl) return
    setRv(buildGenelReview(p, tpl, roster))
  }

  async function doImport() {
    if (!rv || !tpl || !meta.grade || !examType) return
    setBusy(true)
    const payload = toImportPayload(rv, {
      name: meta.name.trim(), exam_date: meta.date, grade: meta.grade, exam_type: examType, yks_part: yksPart, exam_code: meta.code.trim() || null, publisher_id: publisherId || null,
      template_id: tpl.id, target_class_ids: meta.targets, status: meta.status, notify: meta.notify, allow_grade_mismatch: meta.allowMismatch,
    })
    const { data, error } = await supabase.rpc('import_exam', { p: payload })
    setBusy(false)
    if (error) return toast(error.message || 'İçe aktarılamadı.', 'warn')
    setDone(data)
    if (data.duplicate) toast('Bu dosya daha önce içe aktarılmış; yeni kayıt açılmadı.', 'warn')
    else toast(`${meta.name.trim()} ${meta.status === 'yayinda' ? 'yayınlandı' : 'taslak olarak kaydedildi'}`)
    refresh('dataset', 'exams-list', 'exams-admin', 'students', 'exam_imports', 'unresolved_outcomes')
  }

  async function publishNow() {
    if (!done) return
    const { error } = await supabase.rpc('set_exam_status', { p_exam: done.exam_id, p_status: 'yayinda', p_notify: meta.notify })
    if (error) return toast('Yayınlanamadı.', 'warn')
    toast('Yayınlandı')
    set({ status: 'yayinda' })
    refresh('dataset', 'exams-list', 'exams-admin')
  }

  if (done)
    return (
      <section className="card a" style={{ padding: 30, display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 700 }} data-testid="genel-sonuc">
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 500 }}>{done.duplicate ? 'Bu dosya zaten içe aktarılmış' : `${meta.name.trim()} kaydedildi`}</h2>
        {!done.duplicate && (
          <p className="m" style={{ fontSize: 15 }}>
            {done.results} öğrencinin sonucu {meta.status === 'yayinda' ? 'yayınlandı' : <><b>taslak</b> olarak kaydedildi; veliler ve öğrenciler yayınlayana kadar görmez</>}.
            {done.items > 0 && ` ${done.items} sorunun ${done.resolved} tanesi kazanımla eşleşti${done.unresolved ? `; ${done.unresolved} soru Yönetim → Deneme Tanıma Merkezi → Eşleşmeyen kazanımlar'da bekliyor` : ''}.`}
          </p>
        )}
        <div className="btns">
          {!done.duplicate && meta.status === 'taslak' && <button className="btn pri" onClick={publishNow}>Şimdi yayınla</button>}
          <button className="btn" onClick={onCancel}>Denemelere dön</button>
        </div>
      </section>
    )

  return (
    <div className="cols" style={{ ['--side' as string]: '340px' }}>
      <div className="stack">
        {det && <TanimaKarti pack={source.kind === 'pdf' ? source.pack : null} />}

        {!rv && source.kind === 'tablo' && tpl && <TabloYukle tpl={tpl} onPack={(p) => (setPack(p), review(p))} />}
        {!rv && source.kind === 'manuel' && tpl && (
          <ElleGiris tpl={tpl} students={roster.filter((s) => !meta.targets.length || meta.targets.includes(s.class_id ?? ''))} onPack={(p) => (setPack(p), review(p))} />
        )}
        {!rv && source.kind !== 'pdf' && !tpl && <div className="empty a">Önce sağdan sınıf, sınav türü ve şablonu seç.</div>}
        {!rv && source.kind === 'pdf' && (
          <button className="btn pri a" disabled={!metaOk || !students.data} onClick={() => pack && review(pack)} style={{ alignSelf: 'flex-start' }}>
            {metaOk ? 'Sonuçları kontrol et' : 'Önce sağdaki bilgileri tamamla'}
          </button>
        )}
        {rv && <Kontrol rv={rv} setRv={setRv} roster={roster} gradeClasses={gradeClasses} onBack={() => setRv(null)} />}
      </div>

      <aside className="stack">
        <section className="card a" style={{ padding: 16, display: 'grid', gap: 10 }} aria-label="Deneme bilgileri">
          <b>Deneme bilgileri</b>
          <label className="field" htmlFor="gGrade">
            Sınıf {det?.grade && <Guven c={det.grade.confidence} />}
            <select id="gGrade" value={meta.grade ?? ''} disabled={!!rv} onChange={(e) => set({ grade: e.target.value ? Number(e.target.value) : null, templateId: '', targets: [], examType: meta.examType && det?.examType && det.examType.confidence >= SURE ? meta.examType : null })}>
              <option value="">Seç</option>
              {GENEL_GRADES.map((g) => <option key={g} value={g}>{g}. sınıf</option>)}
            </select>
          </label>
          <label className="field" htmlFor="gType">
            Sınav türü {det?.examType?.value && <Guven c={det.examType.confidence} />}
            <select id="gType" value={examType ?? ''} disabled={!!rv || !meta.grade} onChange={(e) => set({ examType: (e.target.value || null) as ExamType | null, templateId: '' })}>
              <option value="">Seç</option>
              {(['GENEL', 'KURUMSAL', 'TYT', 'AYT', 'YKS', 'BRANS', 'DIGER'] as ExamType[]).map((t) => <option key={t} value={t}>{EXAM_TYPE_TR[t]}{def?.exam_type === t ? ' (sınıfın varsayılanı)' : ''}</option>)}
            </select>
          </label>
          {examType === 'YKS' && (
            <label className="field" htmlFor="gPart">
              YKS oturumu
              <select id="gPart" value={yksPart ?? ''} disabled={!!rv} onChange={(e) => set({ yksPart: (e.target.value || null) as YksPart | null, templateId: '' })}>
                <option value="">Seç</option>
                <option value="TYT">TYT</option>
                <option value="AYT">AYT</option>
              </select>
            </label>
          )}
          <label className="field" htmlFor="gTpl">
            Şablon
            <select id="gTpl" value={tpl?.id ?? ''} disabled={!!rv || !cands.length} onChange={(e) => set({ templateId: e.target.value })}>
              <option value="">{cands.length ? 'Seç' : 'Bu sınıf/tür için şablon yok'}</option>
              {cands.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </label>
          {tpl && <span className="m" style={{ fontSize: 12 }}>{tpl.sections.map((s) => `${s.label} ${s.question_count}`).join(' · ')} · {tpl.wrong_per_correct ? `${tpl.wrong_per_correct} yanlış 1 doğruyu götürür` : 'yanlış götürmez'}</span>}
          <label className="field" htmlFor="gPub">
            Yayın {det?.publisher && <Guven c={det.publisher.confidence} />}
            <select id="gPub" value={publisherId} onChange={(e) => set({ publisherId: e.target.value })}>
              <option value="">Belirtilmedi</option>
              {(pubs.data ?? []).filter((p) => p.active).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <label className="field" htmlFor="gName">Deneme adı<input id="gName" value={meta.name} onChange={(e) => set({ name: e.target.value })} maxLength={120} /></label>
          <div className="grid2">
            <label className="field" htmlFor="gDate">Tarih<input id="gDate" type="date" value={meta.date} max={todayISO()} onChange={(e) => set({ date: e.target.value })} /></label>
            <label className="field" htmlFor="gCode">Deneme kodu<input id="gCode" value={meta.code} onChange={(e) => set({ code: e.target.value })} placeholder="ör. GD-6" maxLength={40} /></label>
          </div>
          {gradeClasses.length > 0 && (
            <fieldset className="field" style={{ border: 0, padding: 0 }}>
              <legend style={{ fontSize: 13 }}>Hedef sınıflar (seçilmezse tüm {meta.grade}. sınıflar)</legend>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {gradeClasses.map((c) => (
                  <label key={c.id} style={{ display: 'flex', gap: 4, fontSize: 14 }}>
                    <input type="checkbox" checked={meta.targets.includes(c.id)} disabled={!!rv} onChange={(e) => set({ targets: e.target.checked ? [...meta.targets, c.id] : meta.targets.filter((x) => x !== c.id) })} />
                    {c.name}
                  </label>
                ))}
              </div>
            </fieldset>
          )}
          <label style={{ display: 'flex', gap: 8, fontSize: 13 }}>
            <input type="checkbox" checked={meta.allowMismatch} disabled={!!rv} onChange={(e) => set({ allowMismatch: e.target.checked })} />
            Başka sınıf düzeyindeki öğrencileri de eşleştir (ör. sınıf atlatma; sunucu ayrıca kaydeder)
          </label>
        </section>
        <div className="card a" style={{ padding: '6px 16px' }}>
          <Toggle on={meta.status === 'yayinda'} onClick={() => set({ status: meta.status === 'yayinda' ? 'taslak' : 'yayinda' })} title="Hemen yayınla" sub="Kapalıysa taslak kaydedilir; veliler ve öğrenciler görmez" />
          {meta.status === 'yayinda' && <Toggle on={meta.notify} onClick={() => set({ notify: !meta.notify })} title="Veli ve öğrencilere haber ver" sub="Onaylı hesaplara bildirim gider" />}
        </div>
        {rv && (
          <button className="btn pri" style={{ minHeight: 50, fontSize: 16 }} disabled={!!genelPending(rv) || busy || !metaOk || !rv.rows.some((r) => r.choice && r.choice.kind !== 'skip' && !r.errors.length)} onClick={doImport} data-testid="genel-ice-aktar">
            {genelPending(rv) ? `${genelPending(rv)} kontrol bekliyor` : meta.status === 'yayinda' ? 'İçe aktar ve yayınla' : 'Taslak olarak içe aktar'}
          </button>
        )}
        <button className="btn ghost" onClick={onCancel}>Vazgeç</button>
      </aside>
    </div>
  )
}

function Guven({ c }: { c: number }) {
  return <span className={`chip ${c >= SURE ? 'up' : 'gold'}`} style={{ marginLeft: 4 }} title="Tanıma güveni">{c >= SURE ? `tanındı ${pct(c)}` : `emin değil ${pct(c)} — seç`}</span>
}

function TanimaKarti({ pack }: { pack: GenelPack | null }) {
  if (!pack) return null
  const d = pack.detection
  return (
    <section className="card a" style={{ padding: 16, display: 'grid', gap: 6 }} aria-label="Tanıma sonucu" data-testid="tanima-karti">
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <Icon name="spark" size={20} />
        <b>{pack.filename}</b>
        <span className="chip up">{d.format}</span>
        <span className="m" style={{ fontSize: 13 }}>{pack.records.length} öğrenci{pack.failedPages.length ? ` · ${pack.failedPages.length} sayfa okunamadı` : ''}</span>
      </div>
      {d.exam?.title && <span className="m" style={{ fontSize: 13 }}>Başlık: {d.exam.title}</span>}
      <details>
        <summary className="m" style={{ fontSize: 13 }}>Neye göre tanındı?</summary>
        <ul style={{ fontSize: 13, margin: '6px 0 0 18px' }}>
          {[...(d.grade?.evidence ?? []).map((e) => `Sınıf: ${e}`), ...(d.examType?.evidence ?? []).map((e) => `Tür: ${e}`), ...(d.publisher?.evidence ?? []).map((e) => `Yayın: ${e}`), ...d.evidence].map((e, i) => <li key={i}>{e}</li>)}
        </ul>
      </details>
    </section>
  )
}

function TabloYukle({ tpl, onPack }: { tpl: TemplateRow; onPack: (p: GenelPack) => void }) {
  const [errs, setErrs] = useState<string[]>([])
  function download() {
    const url = URL.createObjectURL(new Blob([toCsv(tableTemplate(tpl))], { type: 'text/csv;charset=utf-8' }))
    const a = Object.assign(document.createElement('a'), { href: url, download: `${tpl.name.replace(/[^\p{L}\p{N}]+/gu, '-')}-sablon.csv` })
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  async function read(f: File | undefined) {
    if (!f) return
    setErrs([])
    try {
      if (f.size > 5 * 1024 * 1024) throw new Error('Dosya en fazla 5 MB olabilir.')
      const buf = await f.arrayBuffer()
      let rows: unknown[][]
      if (/\.xlsx$/i.test(f.name)) {
        const { default: readXlsxFile } = await import('read-excel-file')
        rows = (await readXlsxFile(f)) as unknown[][]
      } else if (/\.(csv|txt)$/i.test(f.name)) rows = parseCsv(new TextDecoder().decode(buf))
      else throw new Error('Yalnız .xlsx ya da .csv dosyası yüklenebilir.')
      const r = tableToPack(tpl, rows, f.name, await sha256Hex(buf))
      if (r.errors.length) return setErrs(r.errors)
      onPack(r.pack!)
    } catch (e) {
      setErrs([(e as Error).message])
    }
  }
  return (
    <section className="card a" style={{ padding: 16, display: 'grid', gap: 10 }} aria-label="Excel ya da CSV yükle">
      <b>Excel / CSV ile sonuç yükle</b>
      <span className="m" style={{ fontSize: 13 }}>
        Her satır bir öğrenci: Ad soyad, Okul no, Sınıf ve her bölüm için doğru (D) ve yanlış (Y) sütunları. Boş sayısı soru sayısından hesaplanır; boş bırakılan bölüm "girilmedi"
        sayılır. Net, şablonun kuralıyla hesaplanır.
      </span>
      <div className="btns">
        <button className="btn sm" onClick={download}>Bu şablonun tablosunu indir</button>
      </div>
      <label className="field" htmlFor="gTable">
        Dosya (.xlsx, .csv)
        <input id="gTable" type="file" accept=".xlsx,.csv,.txt" onChange={(e) => (read(e.target.files?.[0]), (e.target.value = ''))} />
      </label>
      {errs.length > 0 && (
        <div className="card issue" role="alert">
          <span className="t">TABLO OKUNAMADI</span>
          {errs.map((x) => <span key={x} style={{ fontSize: 14 }}>{x}</span>)}
        </div>
      )}
    </section>
  )
}

function ElleGiris({ tpl, students, onPack }: { tpl: TemplateRow; students: { id: string; full_name: string; class_name: string; school_no: string | null }[]; onPack: (p: GenelPack) => void }) {
  const [vals, setVals] = useState<Record<string, Record<string, { d: string; y: string }>>>({})
  const put = (sid: string, key: string, k: 'd' | 'y', v: string) => setVals((x) => ({ ...x, [sid]: { ...x[sid], [key]: { d: '', y: '', ...x[sid]?.[key], [k]: v.replace(/\D/g, '').slice(0, 3) } } }))
  function next() {
    const entries: ManualEntry[] = students
      .filter((s) => Object.values(vals[s.id] ?? {}).some((v) => v.d !== '' || v.y !== ''))
      .map((s) => ({ name: s.full_name, number: s.school_no, class: s.class_name, values: Object.fromEntries(Object.entries(vals[s.id]!).filter(([, v]) => v.d !== '' || v.y !== '')) }))
    if (entries.length) onPack(manualToPack(tpl, entries))
  }
  const filled = students.filter((s) => Object.values(vals[s.id] ?? {}).some((v) => v.d !== '' || v.y !== '')).length
  return (
    <section className="card a" style={{ overflow: 'hidden' }} aria-label="Elle sonuç girişi">
      <div style={{ padding: '12px 16px' }}>
        <b>Elle giriş</b> <span className="m" style={{ fontSize: 13 }}>Her bölüm için doğru ve yanlış sayısını yaz; boş sayısı ve net hesaplanır. Satırı boş bırakılan öğrenci içe aktarılmaz.</span>
      </div>
      <div className="tbl" tabIndex={0} role="region" aria-label="Tablo (yana kaydırılabilir)">
        <table>
          <thead>
            <tr>
              <th>Öğrenci</th>
              {tpl.sections.map((s) => <th key={s.key} className="num" title={`${s.label} · ${s.question_count} soru`}>{s.key}<div className="m" style={{ fontSize: 11 }}>D / Y · {s.question_count}</div></th>)}
            </tr>
          </thead>
          <tbody>
            {students.map((s) => (
              <tr key={s.id} data-testid="elle-satir">
                <td style={{ whiteSpace: 'nowrap' }}>{s.full_name}<div className="m" style={{ fontSize: 12 }}>{s.class_name}</div></td>
                {tpl.sections.map((sec) => (
                  <td key={sec.key} className="num" style={{ whiteSpace: 'nowrap' }}>
                    <input aria-label={`${s.full_name} ${sec.label} doğru`} inputMode="numeric" value={vals[s.id]?.[sec.key]?.d ?? ''} onChange={(e) => put(s.id, sec.key, 'd', e.target.value)} style={{ width: 38 }} />
                    <input aria-label={`${s.full_name} ${sec.label} yanlış`} inputMode="numeric" value={vals[s.id]?.[sec.key]?.y ?? ''} onChange={(e) => put(s.id, sec.key, 'y', e.target.value)} style={{ width: 38, marginLeft: 2 }} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!students.length && <div className="empty" style={{ margin: 16 }}>Bu sınıf düzeyinde öğrenci yok.</div>}
      <div style={{ padding: 16 }}>
        <button className="btn pri" disabled={!filled} onClick={next}>{filled ? `${filled} öğrenciyi kontrol et` : 'Önce sonuç gir'}</button>
      </div>
    </section>
  )
}

function Kontrol({ rv, setRv, roster, gradeClasses, onBack }: { rv: GenelReview; setRv: (r: GenelReview) => void; roster: { id: string; full_name: string; class_name: string }[]; gradeClasses: { id: string; name: string }[]; onBack: () => void }) {
  const choose = (key: string, c: Choice) => setRv({ ...rv, rows: rv.rows.map((r) => (r.key === key ? { ...r, choice: c } : r)) })
  const stu = (id: string) => roster.find((s) => s.id === id)
  const left = genelPending(rv)
  const decide = rv.rows.filter((r) => r.match.kind === 'unknown' || r.errors.length)
  return (
    <>
      <div className="dark a" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <span className="big">
          {rv.rows.filter((r) => r.choice && r.choice.kind !== 'skip' && !r.errors.length).length}
          <span className="m" style={{ fontSize: 18 }}> / {rv.rows.length} hazır</span>
        </span>
        <span className={`chip ${left ? 'gold' : 'up'}`} data-testid="genel-bekleyen">{left ? `${left} kontrol bekliyor` : 'Hepsi tamam'}</span>
        <button className="btn sm" onClick={onBack} style={{ marginLeft: 'auto' }}>Bilgileri değiştir</button>
      </div>
      {rv.mapErrors.length > 0 && (
        <article className="card issue a" role="alert">
          <span className="t">BÖLÜMLER ŞABLONA UYMUYOR</span>
          {rv.mapErrors.map((e) => <b key={e} style={{ fontSize: 14 }}>{e}</b>)}
          <span className="m" style={{ fontSize: 14 }}>Doğru şablonu seç ya da Yönetim → Deneme Tanıma Merkezi'nden bu deneme için şablon oluştur. Bölümler tahminle eşlenmez.</span>
        </article>
      )}
      {decide.map((r) => {
        const cands = r.match.kind === 'unknown' ? r.match.candidates : []
        const ok = r.errors.length ? r.choice?.kind === 'skip' : !!r.choice
        return (
          <article key={r.key} className={`card issue a ${ok ? 'ok' : ''}`} data-testid="genel-karar">
            <div className="kv">
              <span className="t">{ok ? '✓ ' : ''}{r.errors.length ? 'KURALA UYMUYOR' : 'LİSTEDE YOK'}</span>
              <span className="mono m" style={{ fontSize: 13 }}>{r.read.name} {r.read.class ? `· ${r.read.class}` : ''} {r.read.number ? `· No ${r.read.number}` : ''} · {rv.detection.family === 'TABLO' ? `satır ${r.page}` : rv.detection.family === 'MANUEL' ? '' : `s.${r.page}`}</span>
            </div>
            {r.errors.length ? (
              <>
                {r.errors.map((e) => <b key={e} style={{ fontSize: 14 }}>{e}</b>)}
                <span className="m" style={{ fontSize: 14 }}>Bu satır olduğu gibi kaydedilemez; kaynağı düzeltip yeniden yükle ya da satırı atla.</span>
              </>
            ) : (
              <b>{r.notes.find((n) => n.startsWith('Aynı öğrenci')) ?? 'Bu isim listede bulunamadı; güvenli bir eşleşme yok.'}</b>
            )}
            <div className="btns">
              {!r.errors.length && cands.map((id) => (
                <button key={id} type="button" className={`btn sm ${r.choice?.kind === 'student' && r.choice.id === id ? 'soft' : ''}`} aria-pressed={r.choice?.kind === 'student' && r.choice.id === id} onClick={() => choose(r.key, { kind: 'student', id })}>
                  {stu(id)?.full_name} ({stu(id)?.class_name})
                </button>
              ))}
              {!r.errors.length && gradeClasses.length > 0 && (
                <button type="button" className={`btn sm ${r.choice?.kind === 'new' ? 'soft' : ''}`} aria-pressed={r.choice?.kind === 'new'} onClick={() => choose(r.key, { kind: 'new', class_id: gradeClasses.find((c) => c.name.replace(/\s/g, '') === (r.read.class ?? '').toLocaleUpperCase('tr').replace(/\s/g, ''))?.id ?? gradeClasses[0]!.id })}>
                  Yeni öğrenci olarak ekle
                </button>
              )}
              <button type="button" className={`btn sm ${r.choice?.kind === 'skip' ? 'soft' : ''}`} aria-pressed={r.choice?.kind === 'skip'} onClick={() => choose(r.key, { kind: 'skip' })}>Bu satırı atla</button>
            </div>
            {!r.errors.length && r.choice?.kind === 'new' && (
              <label className="field" style={{ maxWidth: 260 }}>
                Yeni öğrencinin sınıfı
                <select value={r.choice.class_id} onChange={(e) => choose(r.key, { kind: 'new', class_id: e.target.value })}>
                  {gradeClasses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </label>
            )}
            {!r.errors.length && (
              <label className="field" style={{ maxWidth: 360 }}>
                Listeden öğrenci seç
                <select value={r.choice?.kind === 'student' && !cands.includes(r.choice.id) ? r.choice.id : ''} onChange={(e) => e.target.value && choose(r.key, { kind: 'student', id: e.target.value })}>
                  <option value="">Seç</option>
                  {roster.map((s) => <option key={s.id} value={s.id}>{s.full_name} · {s.class_name}</option>)}
                </select>
              </label>
            )}
          </article>
        )
      })}
      {rv.failedPages.map((f, k) => (
        <article key={`p${f.page}`} className={`card issue a ${f.skip ? 'ok' : ''}`}>
          <div className="kv"><span className="t">{f.skip ? '✓ ' : ''}SAYFA OKUNAMADI</span><span className="mono m">s.{f.page}</span></div>
          <b>{f.error}</b>
          <div className="btns">
            <button type="button" className={`btn sm ${f.skip ? 'soft' : ''}`} aria-pressed={f.skip} onClick={() => setRv({ ...rv, failedPages: rv.failedPages.map((x, j) => (j === k ? { ...x, skip: true } : x)) })}>Bu sayfayı atla</button>
          </div>
        </article>
      ))}
      <section className="card a" style={{ overflow: 'hidden' }} aria-label="Okunan sonuçlar">
        <div className="tbl" tabIndex={0} role="region" aria-label="Tablo (yana kaydırılabilir)">
          <table>
            <thead>
              <tr><th>Okunan</th><th>Eşleşen öğrenci</th><th className="num">Net</th><th className="num">Başarı</th><th>Not</th></tr>
            </thead>
            <tbody>
              {rv.rows.map((r) => {
                const t = totals(rv.template, r.sections)
                return (
                  <tr key={r.key} data-testid="genel-satir">
                    <td>{r.read.name ?? '—'}<div className="m" style={{ fontSize: 12 }}>{r.read.class ?? ''}</div></td>
                    <td>{r.choice?.kind === 'student' ? `${stu(r.choice.id)?.full_name ?? ''} · ${stu(r.choice.id)?.class_name ?? ''}` : r.choice?.kind === 'new' ? 'Yeni öğrenci' : r.choice?.kind === 'skip' ? <span className="chip n">Atlanacak</span> : '—'}</td>
                    <td className="num">{Object.values(r.sections).some(isScore) ? t.totalNet.toLocaleString('tr-TR') : '—'}</td>
                    <td className="num">{t.successPct === null ? '—' : `%${t.successPct.toLocaleString('tr-TR')}`}</td>
                    <td className="m" style={{ fontSize: 12 }}>{[...r.notes, ...r.record.warnings.filter((w) => !/^ITEM_/.test(w))].join(' ')}{r.gradeMismatch ? ' Sınıf düzeyi farklı.' : ''}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>
    </>
  )
}
