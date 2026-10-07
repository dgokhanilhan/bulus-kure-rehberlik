import { useCallback, useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/auth/AuthProvider'
import { useAssignments, useCourses, type Lesson } from '@/lib/data'
import { supabase } from '@/lib/supabase'
import { codeKey, emptyProgramColumns, programPeriod, matchProgramCourse, readProgramImage, rectifyProgram, validCorners, orderProgramCorners, type Point, type ProgramCell } from '@/lib/programImage'
import { GUN } from '@/lib/format'
import { Modal } from './Modal'
import { useToast } from './Toast'

type Mapping = { id: string; name: string }
export function ProgramImageImport({ classId, className, level, lessons, onClose }: { classId: string; className: string; level: string; lessons: Lesson[]; onClose: () => void }) {
  const courses = useCourses(), assignments = useAssignments(), qc = useQueryClient(), toast = useToast()
  const { profile } = useAuth()
  const storageKey = `bk-program-esleme:${profile?.school_id ?? ''}`
  const remembered = () => {
    try {
      const value: unknown = JSON.parse(localStorage.getItem(storageKey) ?? '{}')
      if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
      return Object.fromEntries(Object.entries(value).filter(([k,v]) => codeKey(k) === k && v && typeof v === 'object' && 'id' in v && typeof v.id === 'string').map(([k,v]) => [k,{id:(v as Mapping).id,name:''}]))
    } catch { return {} }
  }
  const opts = (courses.data ?? []).filter((c) => c.active && (!c.levels.length || c.levels.includes(level as never)))
  const [file, setFile] = useState<File | null>(null), [url, setUrl] = useState(''), [rotation, setRotation] = useState(0)
  const [points, setPoints] = useState<Point[]>([]), [days, setDays] = useState(5), [periods, setPeriods] = useState(10)
  const [cells, setCells] = useState<ProgramCell[]>([]), [map, setMap] = useState<Record<string, Mapping>>(remembered)
  const [remember, setRemember] = useState(false)
  const [busy, setBusy] = useState(false), [percent, setPercent] = useState(0), [error, setError] = useState('')
  const [overwrite, setOverwrite] = useState(false), [confirmed, setConfirmed] = useState(false)
  const [skipBlankColumns, setSkipBlankColumns] = useState(false)
  const imageRef = useRef<HTMLImageElement>(null), controller = useRef<AbortController | null>(null)
  const close = useCallback(() => { if (!busy) onClose() }, [busy, onClose])
  useEffect(() => () => controller.current?.abort(), [])
  useEffect(() => {
    if (!file) return
    let disposed = false
    const original = URL.createObjectURL(file), image = new Image()
    image.onload = () => {
      if (disposed) return
      const angle = rotation * Math.PI / 180, swap = rotation % 180 !== 0
      const w = swap ? image.naturalHeight : image.naturalWidth, h = swap ? image.naturalWidth : image.naturalHeight
      const scale = Math.min(1, 2400 / Math.max(w, h)), canvas = document.createElement('canvas')
      canvas.width = Math.round(w * scale); canvas.height = Math.round(h * scale)
      const ctx = canvas.getContext('2d')!; ctx.translate(canvas.width/2, canvas.height/2); ctx.rotate(angle)
      ctx.drawImage(image, -image.naturalWidth*scale/2, -image.naturalHeight*scale/2, image.naturalWidth*scale, image.naturalHeight*scale)
      setUrl(canvas.toDataURL('image/jpeg', 0.95)); setPoints([]); setCells([]); setConfirmed(false)
    }
    image.onerror = () => { if (!disposed) setError('Görsel açılamadı. JPG, PNG veya WebP olarak yükle.') }
    image.src = original
    return () => { disposed = true; URL.revokeObjectURL(original) }
  }, [file, rotation])
  const codes = [...new Set(cells.filter((c) => c.text.trim()).map((c) => codeKey(c.text)))].filter(Boolean)
  const choice = (text: string): Mapping => {
    const saved = map[codeKey(text)]
    return saved && (saved.id === 'new' || !saved.id || opts.some((c) => c.id === saved.id)) ? saved : { id: matchProgramCourse(text, opts), name: '' }
  }
  const unresolved = codes.filter((key) => { const m = choice(key); return !m.id || (m.id === 'new' && m.name.trim().length < 2) })
  const blankColumns = emptyProgramColumns(cells)
  const omitted = skipBlankColumns ? blankColumns : []
  const filled = cells.filter((c) => codeKey(c.text)).map((c) => ({...c,period:programPeriod(c.period,omitted)!}))
  const conflicts = filled.filter((c) => lessons.some((l) => l.weekday === c.weekday && l.period === c.period))
  async function recognize() {
    setError(''); setBusy(true); setPercent(0); setConfirmed(false); setSkipBlankColumns(false)
    const abort = new AbortController(); controller.current = abort
    try { setCells(await readProgramImage(rectifyProgram(imageRef.current!, points), periods, days, setPercent, abort.signal)); setMap(remembered()) }
    catch (e) { setError(abort.signal.aborted ? 'Okuma iptal edildi.' : e instanceof Error ? e.message : 'Görsel okunamadı.') }
    finally { setBusy(false); controller.current = null }
  }
  async function save() {
    if (busy || !confirmed || unresolved.length || !filled.length) return
    setBusy(true); setError('')
    const fresh = codes.filter((key) => choice(key).id === 'new').map((key) => ({ key, name: choice(key).name.trim() }))
    const rows = filled.map((c) => {
      const m = choice(c.text), old = lessons.find((l) => l.weekday === c.weekday && l.period === c.period)
      const teachers = [...new Set((assignments.data ?? []).filter((a) => a.class_id === classId && a.course_id === m.id).map((a) => a.teacher_id))]
      return { weekday: c.weekday, period: c.period, course_id: m.id === 'new' ? null : m.id, new_key: m.id === 'new' ? codeKey(c.text) : null, teacher_id: old?.course_id === m.id ? old.teacher_id : teachers.length === 1 ? teachers[0] : null }
    })
    const { data, error: e } = await supabase.rpc('import_timetable_image', { p_class: classId, p_cells: rows, p_courses: fresh, p_replace: overwrite })
    setBusy(false)
    if (e) return setError(e.message)
    await Promise.all(['timetable', 'courses', 'teaching_assignments'].map((key) => qc.invalidateQueries({ queryKey: [key] })))
    if (remember) {
      const updated = qc.getQueryData<{id:string;name:string}[]>(['courses']) ?? []
      const saved = { ...remembered() }
      for (const key of codes) {
        const m = choice(key), id = m.id === 'new' ? updated.find((c) => c.name === m.name.trim())?.id : m.id
        if (id) saved[key] = {id,name:''}
      }
      try { localStorage.setItem(storageKey, JSON.stringify(saved)) } catch { toast('Program kaydedildi; tarayıcı eşleştirmeleri saklayamadı.', 'warn') }
    }
    toast(`${className}: ${data} ders hücresi kaydedildi`); onClose()
  }
  return <Modal width={900} title={`${className} · Görselden ders programı yükle`} onClose={close} footer={<>
    <button className="btn" onClick={() => busy ? controller.current?.abort() : onClose()} disabled={busy && !controller.current}>{busy ? 'Okumayı iptal et' : 'Vazgeç'}</button>
    {cells.length > 0 && <button className="btn pri" disabled={busy || !confirmed || !!unresolved.length || !filled.length} onClick={save}>Programı kaydet</button>}
  </>}>
    <div className="stack" style={{ gap: 16 }}>
      <p className="m">Sınıf: <b>{className}</b>. Görseldeki sınıf adı kullanılmaz. Fotoğraf cihazında okunur. Boş hücreler mevcut dersleri silmez.</p>
      <label className="field">Program görseli<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={(e) => {
        const f = e.target.files?.[0]; if (!f) return
        if (f.size > 15 * 1024 * 1024) { setCells([]); setConfirmed(false); return setError('Görsel en fazla 15 MB olabilir.') }
        setError(''); setFile(f); setRotation(0)
      }} /></label>
      {url && <>
        <div className="btns"><button className="btn" disabled={busy} onClick={() => setRotation((r) => (r + 270) % 360)}>Sola döndür</button><button className="btn" disabled={busy} onClick={() => setRotation((r) => (r + 90) % 360)}>Sağa döndür</button><button className="btn" disabled={busy} onClick={() => { setPoints([]); setCells([]); setConfirmed(false) }}>Alanı yeniden seç</button></div>
        <p>Ders hücrelerinin dört dış köşesine dokun; seçim sırası önemli değil. <b>{points.length < 4 ? `${4-points.length} köşe kaldı` : 'Alan seçildi'}</b>. Gün adlarını ve saat başlıklarını dışarıda bırak.</p>
        <div style={{ position: 'relative', cursor: points.length < 4 && !busy ? 'crosshair' : 'default' }} onClick={(e) => {
          if (points.length === 4 || busy) return
          const b = e.currentTarget.getBoundingClientRect(); setPoints((p) => orderProgramCorners([...p, { x: (e.clientX-b.left)/b.width, y: (e.clientY-b.top)/b.height }]))
        }}><img ref={imageRef} src={url} alt="Ders hücrelerinin köşelerini seç" style={{ width: '100%', display: 'block' }} />
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
            {points.length === 4 && <polygon points={points.map((p) => `${p.x*100},${p.y*100}`).join(' ')} fill="rgba(45,150,140,.15)" stroke="var(--primary)" strokeWidth="0.4" />}
            {points.map((p, i) => <circle key={i} cx={p.x*100} cy={p.y*100} r="1" fill="var(--primary)" />)}
          </svg>
        </div>
        {points.length === 4 && !validCorners(points) && <p role="alert" className="err">Seçilen alan geçerli değil. “Alanı yeniden seç” ile tablonun dört farklı dış köşesini seç.</p>}
        <div className="btns"><label className="field">Gün sayısı<select value={days} disabled={busy} onChange={(e) => { setDays(+e.target.value); setCells([]) }}><option value={5}>Pazartesi–Cuma</option><option value={6}>Pazartesi–Cumartesi</option></select></label>
          <label className="field">Ders sütunu sayısı (boş saatler dahil)<input type="number" min={1} max={20} value={periods} disabled={busy} onChange={(e) => { setPeriods(+e.target.value); setCells([]) }} /></label>
          <button className="btn pri" disabled={busy || !validCorners(points) || periods < 1 || periods > 20 || !Number.isInteger(periods)} onClick={recognize}>Görseli tanı</button>
        </div>
      </>}
      {busy && <p role="status">{controller.current ? `Dersler okunuyor · %${percent}` : 'Program kaydediliyor…'}</p>}
      {error && <p role="alert" className="err">{error}</p>}
      {cells.length > 0 && <>
        <h3>Ders eşleştirmeleri</h3><p className="m">Bilinmeyen kısaltmayı mevcut derse eşleştir veya “Yeni ders oluştur” seç. Aynı kısaltma tüm hücrelerde birlikte eşleşir.</p>
        {codes.map((key) => { const m = choice(key); return <div className="btns" key={key}><b style={{ minWidth: 90 }}>{key}</b><label className="field">{key} karşılığı<select aria-label={`${key} karşılığı`} value={m.id} disabled={busy} onChange={(e) => { setMap((v) => ({ ...v, [key]: { ...m, id: e.target.value } })); setConfirmed(false) }}><option value="">Ders seç</option>{opts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}<option value="new">Yeni ders oluştur</option></select></label>{m.id === 'new' && <label className="field">Yeni ders adı<input maxLength={60} value={m.name} disabled={busy} onChange={(e) => { setMap((v) => ({ ...v, [key]: { ...m, name: e.target.value } })); setConfirmed(false) }} /></label>}</div> })}
        <h3>Program önizlemesi</h3><p className="m">Yanlış okunan metni hücrede düzeltebilirsin. Okunamayan bir hücreye ders adını yaz; öğle arası gibi boş saatleri boş bırak.</p>
        {blankColumns.length > 0 && <label className="check"><input type="checkbox" checked={skipBlankColumns} disabled={busy} onChange={(e) => { setSkipBlankColumns(e.target.checked); setConfirmed(false) }} /> Tamamen boş sütunları ({blankColumns.join(', ')}) öğle arası say ve ders saatlerini yeniden numaralandır</label>}
        <div className="tbl"><table><thead><tr><th>Gün / ders</th><th>Okunan metin</th><th>Eşleşen ders</th></tr></thead><tbody>{cells.map((c, i) => { const m = choice(c.text); return <tr key={i}><td>{GUN[c.weekday]} {programPeriod(c.period,omitted) === null ? 'Öğle arası' : (programPeriod(c.period,omitted) + '.')}{skipBlankColumns && <small className="m" style={{display:'block'}}>Görselde {c.period}. sütun</small>}</td><td><input aria-label={`${GUN[c.weekday]} ${c.period}. ders metni`} value={c.text} disabled={busy} onChange={(e) => { setCells((v) => v.map((x,j) => j === i ? { ...x, text: e.target.value } : x)); setConfirmed(false) }} />{c.text && c.confidence < 65 && <small className="m">Okumayı kontrol et</small>}</td><td>{m.id === 'new' ? `Yeni: ${m.name || 'ad bekleniyor'}` : opts.find((o) => o.id === m.id)?.name ?? (c.text ? 'Eşleştirme gerekli' : 'Boş · korunacak')}</td></tr> })}</tbody></table></div>
        <p>{filled.length} dolu hücre · {unresolved.length} eşleştirme bekliyor · {conflicts.length} mevcut dersle çakışma</p>
        <label className="check"><input type="checkbox" checked={remember} disabled={busy} onChange={(e) => setRemember(e.target.checked)} /> Eşleştirmeleri bu okul için bu tarayıcıda hatırla</label>
        <label className="check"><input type="checkbox" checked={overwrite} disabled={busy} onChange={(e) => { setOverwrite(e.target.checked); setConfirmed(false) }} /> Çakışan hücrelerde mevcut dersi değiştir (seçilmezse korunur)</label>
        <label className="check"><input type="checkbox" checked={confirmed} disabled={busy || !!unresolved.length} onChange={(e) => setConfirmed(e.target.checked)} /> Önizlemeyi kontrol ettim; {className} sınıfına kaydet</label>
      </>}
    </div>
  </Modal>
}
