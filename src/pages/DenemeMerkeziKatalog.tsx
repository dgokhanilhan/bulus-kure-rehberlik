// Deneme Tanıma Merkezi: şablonlar, kazanım kataloğu, eşleşmeyen kazanımlar, test laboratuvarı (kaydetmez).
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/auth/AuthProvider'
import { Modal } from '@/components/Modal'
import { PdfHedefEkle } from '@/components/PdfHedefEkle'
import { PdfHedefDuzenle } from '@/components/PdfHedefDuzenle'
import { pdfVersionsFor } from '@/lib/pdfOutcomes'
import { useToast } from '@/components/Toast'
import { EXAM_TYPE_TR, academicYear, cohortYear, outcomeTerm, type ExamType } from '@/lib/denemeGenel'
import { searchOutcomes, useCurriculumVersions, useExamProfiles, useExamTemplates, useSubjects, useUnresolved, versionFor, type OutcomeRow, type TemplateRow, type UnresolvedRow } from '@/lib/denemeData'
import { readGeneralFile } from '@/lib/genelEngine'
import { PDF_OKUMA } from '@/lib/platform'
import { mapSections, type GenelPack } from '@/lib/genelImport'
import { outcomeCode, proposeOutcome, type OutcomeProposal } from '@/lib/outcomeMatching'

const thisYear = () => Number(academicYear(new Date().toISOString().slice(0, 10)).slice(0, 4))
const GRADES = [5, 6, 7, 8, 9, 10, 11, 12]

// ---------------------------------------------------------------- şablonlar
export function SablonBolumu() {
  const { profile } = useAuth()
  const tpl = useExamTemplates()
  const qc = useQueryClient(), toast = useToast()
  const [grade, setGrade] = useState<number | 'all'>('all')
  const [edit, setEdit] = useState<TemplateRow | null>(null)
  const list = (tpl.data ?? []).filter((t) => grade === 'all' || t.grade === grade)

  async function copy(t: TemplateRow) {
    const { data, error } = await supabase.from('exam_templates').insert({
      school_id: profile!.school_id, name: `${t.name} (okul)`.slice(0, 100), grade: t.grade, exam_types: t.exam_types, publisher_id: t.publisher_id, format_id: t.format_id,
      wrong_per_correct: t.wrong_per_correct, strict_counts: t.strict_counts, status: 'hazir', source_note: `Kopya: ${t.name}`,
    }).select('id').single()
    if (error) return toast('Şablon kopyalanamadı (yönetici yetkisi gerekir).', 'warn')
    const { error: e2 } = await supabase.from('exam_template_sections').insert(t.sections.map((s) => ({ template_id: data.id, key: s.key, subject_code: s.subject_code, label: s.label, question_count: s.question_count, sort: s.sort, optional_group: s.optional_group, outcome_grades: s.outcome_grades, outcome_subject: s.outcome_subject ?? null })))
    if (e2) {
      await supabase.from('exam_templates').delete().eq('id', data.id) // yarım şablon kalmasın
      return toast('Şablon bölümleri kopyalanamadı.', 'warn')
    }
    qc.invalidateQueries({ queryKey: ['exam_templates'] })
    toast('Okul şablonu oluşturuldu; düzenleyebilirsin')
  }
  async function setStatus(t: TemplateRow, status: 'hazir' | 'pasif') {
    const { error } = await supabase.from('exam_templates').update({ status }).eq('id', t.id)
    if (error) return toast('Değiştirilemedi.', 'warn')
    qc.invalidateQueries({ queryKey: ['exam_templates'] })
  }

  return (
    <>
      <p className="m a" style={{ fontSize: 13 }}>
        Şablon, denemenin bölümlerini, soru sayılarını ve net kuralını tanımlar; içe aktarılan her sonuç bu kurallarla doğrulanır. Yerleşik şablonlar örnek karnelerden doğrulanmıştır ve
        değiştirilemez; farklı bir deneme için kopyalayıp düzenle.
      </p>
      <div className="a" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }} role="group" aria-label="Sınıf filtresi">
        {(['all', ...GRADES] as const).map((g) => (
          <button key={g} type="button" className={`btn sm ${grade === g ? 'pri' : ''}`} aria-pressed={grade === g} onClick={() => setGrade(g)}>
            {g === 'all' ? 'Tümü' : `${g}. sınıf`}
          </button>
        ))}
      </div>
      {list.map((t) => (
        <section key={t.id} className="card a" style={{ padding: 16 }} data-testid="sablon-karti" aria-label={t.name}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'baseline' }}>
            <div>
              <b>{t.name}</b>{' '}
              <span className="m" style={{ fontSize: 13 }}>
                {t.grade}. sınıf · {t.exam_types.map((x) => EXAM_TYPE_TR[x as ExamType] ?? x).join(', ')} · {t.wrong_per_correct ? `${t.wrong_per_correct} yanlış 1 doğruyu götürür` : 'yanlış doğruyu götürmez'} ·{' '}
                {t.sections.reduce((a, s) => a + (s.optional_group && t.sections.find((x) => x.optional_group === s.optional_group) !== s ? 0 : s.question_count), 0)} soru
              </span>
              {t.builtin && <span className="chip n" style={{ marginLeft: 6 }}>yerleşik</span>}
              {t.status !== 'hazir' && <span className="chip down" style={{ marginLeft: 6 }}>{t.status === 'pasif' ? 'Pasif' : 'Bekliyor'}</span>}
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="btn sm" onClick={() => copy(t)}>Kopyala</button>
              {!t.builtin && <button className="btn sm" onClick={() => setEdit(t)}>Düzenle</button>}
              {!t.builtin && <button className="btn sm" onClick={() => setStatus(t, t.status === 'pasif' ? 'hazir' : 'pasif')}>{t.status === 'pasif' ? 'Etkinleştir' : 'Pasif yap'}</button>}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
            {t.sections.map((s) => (
              <span key={s.key} className="chip n" title={s.optional_group ? `Seçmeli grup ${s.optional_group}: yalnız biri uygulanır` : undefined}>
                {s.label} {s.question_count}{s.optional_group ? ' ⇄' : ''}
              </span>
            ))}
          </div>
          {t.source_note && <p className="m" style={{ fontSize: 12, marginTop: 8 }}>{t.source_note}</p>}
        </section>
      ))}
      {!list.length && <div className="empty a">{tpl.isLoading ? 'Yükleniyor…' : 'Bu sınıf için şablon yok. Bir şablonu kopyalayıp düzenle.'}</div>}
      {edit && <SablonDuzenle t={edit} onClose={() => setEdit(null)} />}
    </>
  )
}

function SablonDuzenle({ t, onClose }: { t: TemplateRow; onClose: () => void }) {
  const qc = useQueryClient(), toast = useToast()
  const subjects = useSubjects()
  const [name, setName] = useState(t.name)
  const [wpc, setWpc] = useState(t.wrong_per_correct === null ? '' : String(t.wrong_per_correct))
  const [rows, setRows] = useState(t.sections.map((s) => ({ ...s })))
  const [busy, setBusy] = useState(false)
  const upd = (i: number, patch: Partial<(typeof rows)[number]>) => setRows((r) => r.map((x, j) => (j === i ? { ...x, ...patch } : x)))
  async function save() {
    if (name.trim().length < 3) return toast('Ad en az 3 harf olmalı.', 'warn')
    const keys = rows.map((r) => r.key)
    if (rows.some((r) => !/^[A-Z][A-Z0-9_]{1,15}$/.test(r.key) || !r.label.trim() || !(r.question_count >= 1 && r.question_count <= 200)) || new Set(keys).size !== keys.length)
      return toast('Her bölümün benzersiz kodu (BÜYÜK harf), adı ve 1–200 soru sayısı olmalı.', 'warn')
    setBusy(true)
    const { error } = await supabase.from('exam_templates').update({ name: name.trim(), wrong_per_correct: wpc === '' ? null : Number(wpc) }).eq('id', t.id)
    // Bölümler: kaldırılanlar silinir, kalanlar upsert (şablon okulundur; RLS yerleşik şablona yazdırmaz)
    const removed = t.sections.filter((s) => !keys.includes(s.key)).map((s) => s.key)
    const e2 = removed.length ? (await supabase.from('exam_template_sections').delete().eq('template_id', t.id).in('key', removed)).error : null
    const e3 = (await supabase.from('exam_template_sections').upsert(rows.map((r, i) => ({ template_id: t.id, key: r.key, subject_code: r.subject_code, label: r.label.trim(), question_count: r.question_count, sort: i + 1, optional_group: r.optional_group || null, outcome_grades: r.outcome_grades, outcome_subject: r.outcome_subject ?? null })), { onConflict: 'template_id,key' })).error
    setBusy(false)
    if (error || e2 || e3) return toast('Kaydedilemedi (yönetici yetkisi gerekir; denemede kullanılan bölüm silinemez).', 'warn')
    qc.invalidateQueries({ queryKey: ['exam_templates'] })
    toast('Şablon kaydedildi')
    onClose()
  }
  return (
    <Modal title="Şablonu düzenle" sub="Soru sayıları ve net kuralı, bu şablonla içe aktarılacak denemelerde doğrulanır. Mevcut denemelerin sonuçları değişmez." onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Vazgeç</button><button className="btn pri" onClick={save} disabled={busy}>Kaydet</button></>}>
      <div className="grid2">
        <label className="field" htmlFor="tplName">Ad<input id="tplName" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} /></label>
        <label className="field" htmlFor="tplWpc">
          Kaç yanlış bir doğruyu götürür
          <select id="tplWpc" value={wpc} onChange={(e) => setWpc(e.target.value)}>
            <option value="">Götürmez</option>
            <option value="3">3 (ortaokul, LGS)</option>
            <option value="4">4 (lise, TYT/AYT)</option>
          </select>
        </label>
      </div>
      <div className="tbl" style={{ marginTop: 8 }} tabIndex={0} role="region" aria-label="Bölümler tablosu (yana kaydırılabilir)">
        <table>
          <thead><tr><th>Kod</th><th>Ders</th><th>Bölüm adı</th><th className="num">Soru</th><th>Seçmeli grup</th><th aria-label="Sil" /></tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td><input aria-label="Bölüm kodu" value={r.key} onChange={(e) => upd(i, { key: e.target.value.toUpperCase() })} style={{ width: 70 }} /></td>
                <td>
                  <select aria-label="Ders" value={r.subject_code} onChange={(e) => upd(i, { subject_code: e.target.value })}>
                    {(subjects.data ?? []).map((s) => <option key={s.code} value={s.code}>{s.short_name}</option>)}
                  </select>
                </td>
                <td><input aria-label="Bölüm adı" value={r.label} onChange={(e) => upd(i, { label: e.target.value })} /></td>
                <td className="num"><input aria-label="Soru sayısı" type="number" min={1} max={200} value={r.question_count} onChange={(e) => upd(i, { question_count: Number(e.target.value) })} style={{ width: 64 }} /></td>
                <td><input aria-label="Seçmeli grup" value={r.optional_group ?? ''} onChange={(e) => upd(i, { optional_group: e.target.value.toUpperCase() || null })} style={{ width: 50 }} /></td>
                <td><button className="btn sm" onClick={() => setRows((x) => x.filter((_, j) => j !== i))} aria-label={`${r.label} bölümünü kaldır`}>×</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button className="btn sm" style={{ marginTop: 8 }} onClick={() => setRows((x) => [...x, { key: '', subject_code: subjects.data?.[0]?.code ?? 'TUR', label: '', question_count: 10, sort: x.length + 1, optional_group: null, outcome_grades: null, outcome_subject: null }])}>
        Bölüm ekle
      </button>
    </Modal>
  )
}

// ---------------------------------------------------------------- kazanım kataloğu
export function KatalogBolumu() {
  const {role}=useAuth()
  const [edit,setEdit]=useState<OutcomeRow|null>(null),[onlyPdf,setOnlyPdf]=useState(false)
  const cv = useCurriculumVersions(), subjects = useSubjects()
  const [grade, setGrade] = useState(7)
  const [year, setYear] = useState(thisYear())
  const [subject, setSubject] = useState('TUR')
  const [q, setQ] = useState('')
  const [dq, setDq] = useState('')
  useEffect(() => {
    const id = setTimeout(() => setDq(q), 250)
    return () => clearTimeout(id)
  }, [q])
  const subjOfGrade = useMemo(() => [...new Set((cv.data ?? []).filter((v) => v.grade === grade && v.active).map((v) => v.subject_code))], [cv.data, grade])
  useEffect(() => {
    if (subjOfGrade.length && !subjOfGrade.includes(subject)) setSubject(subjOfGrade[0]!)
  }, [subjOfGrade, subject])
  const v = versionFor(cv.data ?? [], grade, subject, year)
  const pdfIds=pdfVersionsFor(cv.data??[],[grade],subject)
  const vids=[...(!onlyPdf&&v ? [v.id] : []),...pdfIds]
  const res = useQuery({ queryKey: ['outcomes', vids.join(), dq], enabled: !!vids.length, queryFn: () => searchOutcomes({ versionIds: vids, q: dq }) })
  const sname = (c: string) => subjects.data?.find((s) => s.code === c)?.name ?? c
  return (
    <>
      <section className="card a" style={{ padding: 16, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }} aria-label="Katalog filtresi">
        <label className="field" htmlFor="katYear">
          Eğitim yılı
          <select id="katYear" value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {[thisYear() - 1, thisYear(), thisYear() + 1].map((y) => <option key={y} value={y}>{y}–{y + 1}</option>)}
          </select>
        </label>
        <label className="field" htmlFor="katGrade">
          Sınıf
          <select id="katGrade" value={grade} onChange={(e) => setGrade(Number(e.target.value))}>
            {GRADES.map((g) => <option key={g} value={g}>{g}. sınıf</option>)}
          </select>
        </label>
        <label className="field" htmlFor="katSubj">
          Ders
          <select id="katSubj" value={subject} onChange={(e) => setSubject(e.target.value)}>
            {subjOfGrade.map((s) => <option key={s} value={s}>{sname(s)}</option>)}
          </select>
        </label>
        <label className="field" htmlFor="katQ" style={{ flex: 1, minWidth: 200 }}>
          Kod ya da metin
          <input id="katQ" value={q} onChange={(e) => setQ(e.target.value)} placeholder="ör. T.7.3 ya da oran" />
        </label>
      </section>
      <label className="check"><input type="checkbox" checked={onlyPdf} onChange={e=>setOnlyPdf(e.target.checked)}/>Yalnız okulun PDF’den eklediği hedefleri göster</label>
      {vids.length ? (
        <section className="card a" style={{ overflow: 'hidden' }} aria-label="Kazanımlar">
          <div style={{ padding: '12px 16px', fontSize: 13 }}>
            <b>{onlyPdf ? 'Okulun PDF yayın hedefleri' : v?.name ?? 'Okulun PDF yayın hedefleri'}</b> <span className={`chip ${!onlyPdf && v?.curriculum_type === 'TYMM' ? 'up' : 'n'}`}>{!onlyPdf && v ? v.curriculum_type === 'TYMM' ? 'Türkiye Yüzyılı Maarif Modeli' : 'Önceki program' : 'PDF yayın hedefleri'}</span>
            <div className="m">
              Kaynak: {!onlyPdf && v?.source_url ? <a href={v.source_url} target="_blank" rel="noreferrer noopener">{v.source_title}</a> : 'Yönetici tarafından PDF metninden eklendi'}
              {!onlyPdf && v?.notes ? ` · ${v.notes}` : ''}
            </div>
          </div>
          <div className="tbl" tabIndex={0} role="region" aria-label="Tablo (yana kaydırılabilir)">
            <table>
              <thead><tr><th>Kod</th><th>Kazanım / öğrenme çıktısı</th><th>Ünite / tema</th><th>Kaynak / işlem</th></tr></thead>
              <tbody>
                {(res.data ?? []).map((o) => (
                  <tr key={o.id} data-testid="kazanim-satiri">
                    <td className="mono" style={{ whiteSpace: 'nowrap' }}>{o.code ?? '—'}</td>
                    <td>{o.title}{o.source_note && <div className="m" style={{ fontSize: 12 }}>{o.source_note}</div>}</td>
                    <td className="m" style={{ fontSize: 13 }}>{o.theme ?? o.unit ?? ''}</td>
                    <td>{pdfIds.includes(o.curriculum_version_id)?<><span className="chip n">Okulun PDF hedefi</span>{role==='admin'&&<button className="btn sm" onClick={()=>setEdit(o)}>Düzenle</button>}</>:<span className="chip up">Resmî program</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {res.data?.length === 200 && <p className="m" style={{ fontSize: 12, padding: '0 16px 12px' }}>İlk 200 kayıt gösteriliyor; aramayı daralt.</p>}
          {res.data && !res.data.length && <div className="empty" style={{ margin: 16 }}>Eşleşen kazanım yok.</div>}
        </section>
      ) : (
        <div className="empty a">
          {cv.isLoading ? 'Yükleniyor…' : `${grade}. sınıf ${sname(subject)} için ${year}–${year + 1} yılında geçerli resmî program katalogda yok. Bu ders için kazanım eşlemesi yapılmaz (uydurulmaz).`}
        </div>
      )}
      {edit&&<PdfHedefDuzenle row={edit} onClose={()=>setEdit(null)}/>}
    </>
  )
}

// ---------------------------------------------------------------- eşleşmeyen kazanımlar
export function EslesmeyenBolumu() {
  const {role}=useAuth()
  const un = useUnresolved()
  const [pick, setPick] = useState<UnresolvedRow | null>(null)
  const [bulk, setBulk] = useState<UnresolvedRow[] | null>(null)
  const [adding,setAdding]=useState<UnresolvedRow[] | null>(null)
  const groups = useMemo(() => {
    const m = new Map<string, UnresolvedRow[]>()
    for (const r of un.data ?? []) m.set(r.exam_id, [...(m.get(r.exam_id) ?? []), r])
    return [...m.values()]
  }, [un.data])
  return (
    <>
      <p className="m a" style={{ fontSize: 13 }}>
        PDF'teki kazanım kodu ya da metni katalogla güvenle eşleşmediyse soru burada bekler; kazanım analizi bu sorular olmadan yapılır (sonuç ve net etkilenmez). Doğru kazanımı seçip eşle;
        yönetici "takma ad olarak kaydet" derse aynı yayının sonraki denemelerinde bu kod kendiliğinden eşleşir.
      </p>
      {!!un.data?.length && <div className="btns a"><button className="btn pri" onClick={() => setBulk(un.data!)}>Tümünü otomatik eşle</button>{role==='admin'&&<button className="btn" onClick={()=>setAdding(un.data!)}>Tümünü ekle</button>}</div>}
      {un.isError && <div className="err" role="alert">Eşleşmeyen hedefler yüklenemedi. Sayfayı yenileyip tekrar dene.</div>}
      {groups.map((g) => (
        <section key={g[0]!.exam_id} className="card a" style={{ overflow: 'hidden' }} aria-label={g[0]!.exam_name}>
          <div style={{ padding: '12px 16px' }}>
            <b>{g[0]!.exam_name}</b> <span className="m" style={{ fontSize: 13 }}>{g[0]!.grade}. sınıf · {g[0]!.exam_type} · {g.length} soru</span>
            <button className="btn sm" style={{ marginLeft: 12 }} onClick={() => setBulk(g)}>Bu denemeyi otomatik eşle</button>
            {role==='admin'&&<button className="btn sm" style={{marginLeft:8}} onClick={()=>setAdding(g)}>Bu denemede tümünü ekle</button>}
          </div>
          <div className="tbl" tabIndex={0} role="region" aria-label="Tablo (yana kaydırılabilir)">
            <table>
              <thead><tr><th>Bölüm</th><th className="num">Soru</th><th>PDF'teki kod</th><th>PDF'teki metin</th><th aria-label="İşlem" /></tr></thead>
              <tbody>
                {g.map((r) => (
                  <tr key={`${r.section_key}-${r.q_no}`} data-testid="eslesmeyen-satiri">
                    <td>{r.section_key}</td>
                    <td className="num">{r.q_no}</td>
                    <td className="mono">{r.raw_code ?? '—'}</td>
                    <td style={{ fontSize: 13 }}>{r.raw_text ?? '—'}</td>
                    <td><div className="btns"><button className="btn sm" onClick={() => setPick(r)} aria-label={`${r.section_key} ${r.q_no}. soruyu eşle`}>Eşle</button>{role==='admin'&&<button className="btn sm" disabled={!r.raw_text?.trim()} onClick={()=>setAdding([r])} aria-label={`${r.section_key} ${r.q_no}. hedefi ekle`}>Ekle</button>}</div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
      {!groups.length && <div className="empty a">{un.isLoading ? 'Yükleniyor…' : 'Eşleşmeyen kazanım yok.'}</div>}
      {pick && <Esle row={pick} onClose={() => setPick(null)} />}
      {bulk && <TopluEsle rows={bulk} onClose={() => setBulk(null)} onAdd={role==='admin' ? ()=>{setAdding(bulk);setBulk(null)} : undefined} />}
      {adding&&<PdfHedefEkle rows={adding} onClose={()=>setAdding(null)} />}
    </>
  )
}


/** Katalog/sürüm sınırlaması sunucudaki set_item_outcome kuralıyla aynıdır. */
function TopluEsle({ rows, onClose, onAdd }: { rows: UnresolvedRow[]; onClose: () => void; onAdd?:()=>void }) {
  const qc = useQueryClient()
  const [selected, setSelected] = useState<Set<string> | null>(null)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState('')
  const [saved, setSaved] = useState<Set<string>>(new Set())
  const [errors, setErrors] = useState<Record<string, string>>({})
  const key = (r: UnresolvedRow) => `${r.exam_id}:${r.section_key}:${r.q_no}`
  const proposals = useQuery({
    queryKey: ['bulk-outcome-proposals', rows.map(key).join('|')],
    queryFn: async () => {
      const versions = await supabase.from('curriculum_versions').select('id, name, curriculum_type, publisher_id, grade, subject_code, year_from, year_to, active, source_title, source_url, notes').eq('active', true)
      if (versions.error) throw versions.error
      const result: { row: UnresolvedRow; proposal: OutcomeProposal }[] = []
      const catalogs = new Map<string, OutcomeRow[]>()
      for (const examId of [...new Set(rows.map((r) => r.exam_id))]) {
        const exam = await supabase.from('exams').select('exam_date, exam_template_id, publisher_id').eq('id', examId).single()
        if (exam.error) throw exam.error
        const sections = exam.data.exam_template_id ? await supabase.from('exam_template_sections').select('key, outcome_grades').eq('template_id', exam.data.exam_template_id) : { data: [], error: null }
        if (sections.error) throw sections.error
        const year = Number(academicYear(exam.data.exam_date).slice(0, 4))
        for (const row of rows.filter((r) => r.exam_id === examId)) {
          const grades: number[] = sections.data?.find((s) => s.key === row.section_key)?.outcome_grades ?? [row.grade]
          const ids = grades.map((g) => versionFor(versions.data, g, row.subject_code, cohortYear(year, row.grade, g))?.id).filter((id): id is string => !!id)
          ids.push(...pdfVersionsFor(versions.data,grades,row.subject_code,exam.data.publisher_id))
          const catalogKey = [...ids].sort().join(',')
          if (!catalogs.has(catalogKey)) {
            const catalog: OutcomeRow[] = []
            if (ids.length) for (let start = 0; ; start += 1000) {
              const part = await supabase.from('learning_outcomes').select('id, code, title, grade, subject_code, curriculum_version_id, theme, unit, source_note, outcome_type').in('curriculum_version_id', ids).order('id').range(start, start + 999)
              if (part.error) throw part.error
              catalog.push(...part.data as OutcomeRow[])
              if (part.data.length < 1000) break
            }
            catalogs.set(catalogKey, catalog)
          }
          result.push({ row, proposal: proposeOutcome(row, catalogs.get(catalogKey)!) })
        }
      }
      return result
    },
    staleTime: 0,
    refetchOnWindowFocus: false,
  })
  const close = useCallback(() => { if (!busy) onClose() }, [busy, onClose])
  const chosen = selected ?? new Set((proposals.data ?? []).filter((r) => r.proposal.certain).map((r) => key(r.row)))
  const ready = (proposals.data ?? []).filter((r) => r.proposal.outcome && chosen.has(key(r.row)) && !saved.has(key(r.row)))
  async function save() {
    if (busy || !ready.length) return
    setBusy(true)
    const failures: Record<string, string> = {}
    try {
      for (let i = 0; i < ready.length; i++) {
        const item = ready[i]!
        const id = key(item.row)
        setProgress(`${i + 1} / ${ready.length} soru işleniyor…`)
        try {
          const { error } = await supabase.rpc('set_item_outcome', { p_exam: item.row.exam_id, p_section: item.row.section_key, p_q: item.row.q_no, p_outcome: item.proposal.outcome!.id, p_alias: false })
          if (error) failures[id] = error.message
          else setSaved((s) => new Set([...s, id]))
        } catch { failures[id] = 'Bağlantı kurulamadı; tekrar dene.' }
      }
      setErrors(failures)
      setProgress(Object.keys(failures).length ? `${Object.keys(failures).length} soru kaydedilemedi. Başarılı eşlemeler korundu; kalanları tekrar deneyebilirsin.` : 'Seçilen eşlemeler kaydedildi.')
      qc.invalidateQueries({ queryKey: ['unresolved_outcomes'] })
      qc.invalidateQueries({ queryKey: ['exam_items'] })
      qc.invalidateQueries({ queryKey: ['genel-dataset'] })
    } finally { setBusy(false) }
  }
  return (
    <Modal title="Toplu otomatik eşleme" width={940} onClose={close}
      footer={<><button className="btn" disabled={busy} onClick={onClose}>Kapat</button>{onAdd&&<button className="btn" disabled={busy} onClick={onAdd}>Tümünü ekle</button>}<button className="btn pri" disabled={busy || !ready.length || proposals.isFetching} onClick={save}>Seçilen {ready.length} soruyu eşle</button></>}>
      <p className="m">Tam kod/metin eşleşmeleri seçili gelir. Eksik kod önerilerini kontrol ederek seçebilirsin. Belirsiz hedefler bekler; sonuç, net ve puan değişmez.</p>
      {proposals.isFetching && <p role="status"><span className="spinner" /> {rows.length} soru için uygun müfredat taranıyor…</p>}
      {proposals.isError && <div className="err" role="alert">Katalog taranamadı. Kayıt yapılmadı. <button className="btn sm" onClick={() => proposals.refetch()}>Tekrar dene</button></div>}
      {proposals.data && <>
        <p>{proposals.data.filter((r) => r.proposal.certain).length} kesin eşleşme · {proposals.data.filter((r) => r.proposal.outcome && !r.proposal.certain).length} kontrol edilecek öneri · {proposals.data.filter((r) => !r.proposal.outcome).length} eşleşmeyen soru</p>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <button className="btn sm" disabled={busy || proposals.isFetching} onClick={() => setSelected(new Set(proposals.data!.filter((r) => r.proposal.outcome).map((r) => key(r.row))))}>Eşlenebilir tümünü seç</button>
          <button className="btn sm" disabled={busy} onClick={() => setSelected(new Set())}>Seçimi temizle</button>
        </div>
        <div className="tbl" tabIndex={0} role="region" aria-label="Toplu eşleme önerileri" style={{ maxHeight: 420, overflow: 'auto' }}>
          <table><thead><tr><th>Seç</th><th>Soru / PDF</th><th>Önerilen hedef</th><th>Durum</th></tr></thead><tbody>
            {proposals.data.map(({ row, proposal }) => {
              const id = key(row)
              return <tr key={id} data-testid="toplu-esleme-satiri">
                <td><input type="checkbox" aria-label={`${row.exam_name} ${row.section_key} ${row.q_no}. soruyu seç`} disabled={busy || !proposal.outcome || saved.has(id)} checked={chosen.has(id)} onChange={(e) => {
                  const checked = e.target.checked
                  setSelected((s) => { const next = new Set(s ?? chosen); if (checked) next.add(id); else next.delete(id); return next })
                }} /></td>
                <td><b>{row.exam_name} · {row.section_key} {row.q_no}</b><div className="mono">{row.raw_code}</div><div>{row.raw_text}</div></td>
                <td>{proposal.outcome ? <><span className="mono">{proposal.outcome.code}</span> · {proposal.outcome.grade}. sınıf<div>{proposal.outcome.title}</div></> : '—'}</td>
                <td>{saved.has(id) ? 'Kaydedildi' : errors[id] ?? proposal.reason}</td>
              </tr>
            })}
          </tbody></table>
        </div>
      </>}
      {!!progress && <p role="status">{progress}</p>}
    </Modal>
  )
}

function Esle({ row, onClose }: { row: UnresolvedRow; onClose: () => void }) {
  const { role } = useAuth()
  const cv = useCurriculumVersions()
  const qc = useQueryClient(), toast = useToast()
  const exam = useQuery({ queryKey: ['exam-date', row.exam_id], queryFn: async () => (await supabase.from('exams').select('exam_date,publisher_id').eq('id', row.exam_id).single()).data as { exam_date: string;publisher_id:string|null } })
  const [q, setQ] = useState((row.raw_code && outcomeCode(row.raw_code, row.subject_code)) || row.raw_text?.slice(0, 30) || '')
  const [alias, setAlias] = useState(false)
  const [sel, setSel] = useState<OutcomeRow | null>(null)
  // TYT/AYT soruları 9–12 kataloğunda aranır; diğerleri denemenin sınıfında
  const grades = ['TYT', 'AYT', 'YKS'].includes(row.exam_type) ? [9, 10, 11, 12] : [row.grade]
  const year = exam.data ? Number(academicYear(exam.data.exam_date).slice(0, 4)) : null
  // Öğrenci grubu kuralı: konu sınıfının programı, öğrencilerin o sınıfı okuduğu yılınki (sunucu da aynı kuralla denetler)
  const vids = year === null ? [] : [...grades.map((g) => versionFor(cv.data ?? [], g, row.subject_code, cohortYear(year, row.grade, g))?.id).filter((x): x is string => !!x),...pdfVersionsFor(cv.data??[],grades,row.subject_code,exam.data!.publisher_id)]
  const res = useQuery({ queryKey: ['outcomes', vids.join(), q], enabled: vids.length > 0, queryFn: () => searchOutcomes({ versionIds: vids, q, limit: 50 }) })
  async function save() {
    if (!sel) return
    const { error } = await supabase.rpc('set_item_outcome', { p_exam: row.exam_id, p_section: row.section_key, p_q: row.q_no, p_outcome: sel.id, p_alias: alias })
    if (error) return toast(error.message.includes('Takma') ? 'Takma adı yalnız yönetici kaydedebilir.' : 'Eşlenemedi.', 'warn')
    qc.invalidateQueries({ queryKey: ['unresolved_outcomes'] })
    toast(`${row.section_key} ${row.q_no}. soru eşlendi`)
    onClose()
  }
  return (
    <Modal title={`${row.section_key} · ${row.q_no}. soru`} sub={`PDF: ${row.raw_code ?? ''} ${row.raw_text ?? ''}`.trim()} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Vazgeç</button><button className="btn pri" onClick={save} disabled={!sel}>Eşle</button></>}>
      <label className="field" htmlFor="esleQ">Katalogda ara<input id="esleQ" value={q} onChange={(e) => setQ(e.target.value)} /></label>
      {!vids.length && !cv.isLoading && <div className="empty">Bu ders ve yıl için katalogda program yok; eşleme yapılamaz.</div>}
      <div role="radiogroup" aria-label="Kazanım seç" style={{ maxHeight: 320, overflowY: 'auto', display: 'grid', gap: 4 }}>
        {(res.data ?? []).map((o) => (
          <label key={o.id} className="card" style={{ padding: 8, fontSize: 13, cursor: 'pointer', display: 'flex', gap: 8, outline: sel?.id === o.id ? '2px solid var(--acc)' : undefined }}>
            <input type="radio" name="esle" checked={sel?.id === o.id} onChange={() => setSel(o)} />
            <span><span className="mono">{o.code ?? '—'}</span> <span className="m">({o.grade}. sınıf)</span> {o.title}</span>
          </label>
        ))}
      </div>
      {role === 'admin' && (
        <label style={{ display: 'flex', gap: 8, fontSize: 13, marginTop: 8 }}>
          <input type="checkbox" checked={alias} onChange={(e) => setAlias(e.target.checked)} />
          Takma ad olarak kaydet (bu yayının aynı kod/metni sonraki denemelerde de bu kazanıma eşlensin)
        </label>
      )}
    </Modal>
  )
}

// ---------------------------------------------------------------- test laboratuvarı (kaydetmez)
export function TestLaboratuvari() {
  const tpl = useExamTemplates()
  const [pack, setPack] = useState<GenelPack | null>(null)
  const [err, setErr] = useState('')
  const [prog, setProg] = useState<string>('')
  async function run(f: File | undefined) {
    if (!f) return
    setPack(null); setErr(''); setProg('Okunuyor…')
    try {
      setPack(await readGeneralFile(f, {}, (p, t) => setProg(`Sayfa ${p}/${t}`)))
    } catch (e) {
      setErr((e as Error).message)
    }
    setProg('')
  }
  const d = pack?.detection
  const grade = d?.grade?.value ?? null
  const cands = (tpl.data ?? []).filter((t) => t.grade === grade && t.status === 'hazir' && (!d?.examType?.yksPart || t.name.includes(d.examType.yksPart)))
  const labels = pack ? [...new Set(pack.records.flatMap((r) => r.sections.map((s) => s.label)))] : []
  const warned = pack?.records.filter((r) => r.warnings.length) ?? []
  const items = pack?.records.reduce((a, r) => a + r.items.length, 0) ?? 0, coded = pack?.records.reduce((a, r) => a + r.items.filter((q) => q.rawCode).length, 0) ?? 0
  const pct = (c: number) => `%${Math.round(c * 100)}`
  if (!PDF_OKUMA)
    return (
      <p className="m a" data-testid="mobil-pdf-yok" style={{ fontSize: 14 }}>
        Karne PDF'i okuma bilgisayardan, buluskurementor.com adresinde yapılır.
      </p>
    )
  return (
    <>
      <p className="m a" style={{ fontSize: 13 }}>
        Örnek bir karneyi yükle: tanıma sonucu, kanıtlar, bölüm eşlemesi ve doğrulama gösterilir. <b>Hiçbir şey kaydedilmez</b>; PDF tarayıcıdan çıkmaz.
      </p>
      <section className="card a" style={{ padding: 16 }}>
        <label className="field" htmlFor="labFile">
          Karne PDF'i
          <input id="labFile" type="file" accept="application/pdf,.pdf" onChange={(e) => run(e.target.files?.[0])} />
        </label>
        {prog && <p className="m" role="status"><span className="spinner" aria-hidden="true" /> {prog}</p>}
        {err && <p className="err" role="alert">{err}</p>}
      </section>
      {d && pack && (
        <section className="card a" style={{ padding: 16, display: 'grid', gap: 10 }} aria-label="Tanıma sonucu" data-testid="lab-sonuc">
          <div>
            <b>Biçim:</b> {d.family === 'UNKNOWN' ? <span className="chip down">Tanınmadı</span> : <span className="chip up">{d.format}</span>} <span className="m">güven {pct(d.confidence)}</span>
            {d.message && <div className="m" style={{ fontSize: 13 }}>{d.message}</div>}
          </div>
          {d.family !== 'UNKNOWN' && (
            <>
              <div><b>Sınıf:</b> {grade ?? '—'} <span className="m">güven {pct(d.grade?.confidence ?? 0)} · {d.grade?.evidence.join('; ')}</span></div>
              <div><b>Sınav türü:</b> {d.examType?.value ?? 'sınıfın varsayılanı'}{d.examType?.yksPart ? ` / ${d.examType.yksPart}` : ''} <span className="m">{d.examType?.evidence.join('; ')}</span></div>
              <div><b>Yayın:</b> {d.publisher?.value ?? '—'} <span className="m">güven {pct(d.publisher?.confidence ?? 0)} · {d.publisher?.evidence.join('; ')}</span></div>
              <div><b>Deneme:</b> {d.exam?.title ?? '—'} {d.exam?.code && <span className="chip n">{d.exam.code}</span>}</div>
              <div><b>Kayıt:</b> {pack.records.length} öğrenci · {items} soru, {items ? pct(coded / items) : '%0'} kazanım kodlu · {pack.failedPages.length} okunamayan sayfa · {warned.length} uyarılı kayıt</div>
              {grade === 8 || d.examType?.value === 'LGS' ? (
                <div className="chip n">8. sınıf / LGS: içe aktarmada mevcut LGS motoru kullanılır.</div>
              ) : (
                cands.map((t) => {
                  const m = mapSections(t, labels)
                  return (
                    <div key={t.id} style={{ fontSize: 13 }}>
                      <b>{t.name}</b> ile bölüm eşlemesi:{' '}
                      {m.unmapped.length || m.ambiguous.length ? <span className="chip down">sorunlu</span> : <span className="chip up">tam</span>}{' '}
                      <span className="m">{Object.entries(m.map).map(([l, k]) => `${l} → ${k}`).join(', ')}{m.unmapped.length ? ` · eşlenemeyen: ${m.unmapped.join(', ')}` : ''}{m.ambiguous.length ? ` · belirsiz: ${m.ambiguous.join(', ')}` : ''}</span>
                    </div>
                  )
                })
              )}
              {warned.length > 0 && <div className="m" style={{ fontSize: 13 }}>Uyarılar: {[...new Set(warned.flatMap((r) => r.warnings))].join(', ')}</div>}
            </>
          )}
          <details>
            <summary className="m" style={{ fontSize: 13 }}>Tüm kanıtlar</summary>
            <ul style={{ fontSize: 13 }}>{d.evidence.map((e, i) => <li key={i}>{e}</li>)}</ul>
          </details>
        </section>
      )}
    </>
  )
}

// ---------------------------------------------------------------- deneme profilleri (0030): okulun analiz ettiği alt testler
const STAGE_TR: Record<string, string> = { SCHOOL: 'Okul', LGS: 'LGS', TYT: 'TYT', AYT: 'AYT' }
export function ProfilBolumu() {
  const ps = useExamProfiles()
  return (
    <>
      <p className="m a" style={{ fontSize: 13 }}>
        Profil, her sınıfta hangi alt testlerin hangi adla ve sırayla analiz edileceğini belirler; soru sayısı ve net kuralı şablondadır. Denemede olmayan alt test
        öğrenciye "ölçülmedi" görünür (başarısız sayılmaz); TYT ve AYT ayrı tutulur. TYMM profillerinde "Öğrenme Çıktısı Analizi", eski programda "Kazanım Analizi" yazar.
      </p>
      {(ps.data ?? []).map((p) => (
        <section key={p.id} className="card a" style={{ padding: 16 }} data-testid="profil-karti" aria-label={`${p.student_grade}. sınıf profili`}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'baseline' }}>
            <b>{p.student_grade}. sınıf</b>
            <span className="m" style={{ fontSize: 13 }}>{p.academic_year}–{p.academic_year + 1} · {p.school_type === 'ANADOLU_LISESI' ? 'Anadolu lisesi' : p.school_type === 'ORTAOKUL' ? 'Ortaokul' : p.school_type} · {p.program_family === 'TYMM' ? 'TYMM' : 'Önceki program'}</span>
            <span className={`chip ${p.outcome_term === 'KAZANIM' ? 'n' : 'up'}`}>{outcomeTerm(p)}</span>
            {!p.school_id && <span className="chip n">yerleşik</span>}
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
            {p.subtests.map((s) => (
              <span key={s.sort} className="chip n" title={`${STAGE_TR[s.exam_stage]} · ${s.canonical_subject}${s.language_code ? ` · ${s.language_code}` : ''}`}>{s.sort}. {s.display_name}</span>
            ))}
          </div>
        </section>
      ))}
      {!ps.data?.length && <div className="empty a">{ps.isLoading ? 'Yükleniyor…' : 'Profil yok.'}</div>}
    </>
  )
}
