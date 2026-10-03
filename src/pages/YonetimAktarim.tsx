// Yönetim Merkezi (Faz H · 0019): ana sayfa kart düzeni ve toplu aktarım (öğrenci / öğretmen, CSV ya da Excel).
// Düzen set_settings ile doğrulanır (bilinen kartlar, tekrar yok); öğrenci aktarımı import_students (önizleme + hepsi ya da hiçbiri),
// öğretmenler admin-davet 'bulk' ile satır satır açılır. Yetki veritabanında / Edge Function'da (yönetici + aal2).
import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useModules } from '@/lib/data'
import { BRANS } from '@/lib/roles'
import { fold } from '@/lib/format'
import { FIELDS, MAX_ROWS, TEMPLATE, parseCsv, toCsv, toRecords, type ImportKind } from '@/lib/aktarim'
import { Seg } from '@/components/Indicator'
import { Icon } from '@/components/Icon'
import { useToast } from '@/components/Toast'
import { CARD_TR, usePanelLayout, PANEL_DEFAULTS, type CardId, type PanelRole } from './PanelPage'

const ROLE_TABS = [['veli', 'Veli'], ['ogrenci', 'Öğrenci'], ['ogretmen', 'Öğretmen'], ['yonetim', 'Yönetim (Bugün)']] as const
const CARD_MOD: Partial<Record<CardId, string>> = { deneme: 'lgs', devamsizlik: 'yoklama', yoklama: 'yoklama', lgs: 'lgs', bursluluk: 'bursluluk', odev: 'odev', odev_kontrol: 'odev', takvim: 'takvim', yemek: 'yemek', mesaj: 'mesaj', duyuru: 'duyuru' }

// ---------------------------------------------------------------- Ana sayfa düzeni
export function AnaSayfaDuzeni() {
  const [role, setRole] = useState<PanelRole>('veli')
  return (
    <>
      <p className="m a" style={{ fontSize: 13 }}>
        Veli, öğrenci ve öğretmenin girişte gördüğü <b>Ana sayfa</b>daki kartları seç, sırala (sürükle bırak ya da ok düğmeleri) ve genişliğini belirle. <b>Yönetim (Bugün)</b> yöneticinin Bugün
        ekranındaki yan kartlardır (rehberliğin ekranı değişmez). Kapalı modülün kartı işaretli olsa da görünmez; LGS kartı yalnız 8. sınıflarda görünür, bu kural düzenle aşılamaz.
      </p>
      <Seg className="a" label="Kimin ana sayfası" value={role} onChange={setRole} options={ROLE_TABS} style={{ alignSelf: 'flex-start' }} />
      <LayoutEditor key={role} role={role} />
    </>
  )
}

function LayoutEditor({ role }: { role: PanelRole }) {
  const saved = usePanelLayout(role)
  const mods = useModules() as unknown as Record<string, boolean>
  const [list, setList] = useState(saved)
  const [drag, setDrag] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const toast = useToast()
  const qc = useQueryClient()
  useEffect(() => setList(saved), [saved])
  const dirty = JSON.stringify(list) !== JSON.stringify(saved)
  const move = (from: number, to: number) =>
    setList((l) => {
      if (to < 0 || to >= l.length || from === to) return l
      const c = [...l]
      const [x] = c.splice(from, 1)
      c.splice(to, 0, x!)
      return c
    })
  async function save(value = list) {
    setBusy(true)
    const { error } = await supabase.rpc('set_settings', { p: { [`panel.${role}`]: value } })
    setBusy(false)
    if (error) return toast(error.message, 'warn')
    await qc.invalidateQueries({ queryKey: ['school_settings'] })
    toast('Ana sayfa düzeni kaydedildi')
  }
  return (
    <section className="card a" style={{ ['--d' as string]: 1, padding: 8 }} aria-label={`${ROLE_TABS.find((r) => r[0] === role)![1]} ana sayfa kartları`}>
      <ol className="lay" role="list">
        {list.map((c, i) => {
          const m = CARD_MOD[c.id]
          return (
            <li
              key={c.id}
              draggable
              onDragStart={() => setDrag(i)}
              onDragOver={(e) => {
                e.preventDefault()
                if (drag !== null && drag !== i) {
                  move(drag, i)
                  setDrag(i)
                }
              }}
              onDragEnd={() => setDrag(null)}
              className={drag === i ? 'dragging' : ''}
            >
              <span className="grip" aria-hidden="true">⋮⋮</span>
              <label className="check" style={{ flex: 1 }}>
                <input type="checkbox" checked={c.on} onChange={() => setList((l) => l.map((x) => (x.id === c.id ? { ...x, on: !x.on } : x)))} />
                <span>
                  {CARD_TR[c.id]}
                  {m && mods[m] === false && <span className="chip n" style={{ marginLeft: 6 }}>modül kapalı</span>}
                </span>
              </label>
              {role !== 'yonetim' && (
                <select
                  aria-label={`${CARD_TR[c.id]} genişliği`}
                  value={c.w ?? 'dar'}
                  onChange={(e) => setList((l) => l.map((x) => (x.id === c.id ? (e.target.value === 'genis' ? { ...x, w: 'genis' as const } : { id: x.id, on: x.on }) : x)))}
                  style={{ width: 'auto', padding: '4px 8px', fontSize: 13 }}
                >
                  <option value="dar">Dar</option>
                  <option value="genis">Geniş</option>
                </select>
              )}
              <button type="button" className="ib" aria-label={`${CARD_TR[c.id]} yukarı`} disabled={i === 0} onClick={() => move(i, i - 1)}>
                ↑
              </button>
              <button type="button" className="ib" aria-label={`${CARD_TR[c.id]} aşağı`} disabled={i === list.length - 1} onClick={() => move(i, i + 1)}>
                ↓
              </button>
            </li>
          )
        })}
      </ol>
      <div className="btns" style={{ padding: 8 }}>
        <button className="btn pri" disabled={!dirty || busy} onClick={() => save()}>
          Kaydet
        </button>
        <button className="btn" disabled={busy} onClick={() => setList(PANEL_DEFAULTS[role])}>
          Varsayılana dön
        </button>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------- Toplu aktarım
type Row = Record<string, string>
type Check = { row: number; error: string }
type Preview = { kind: ImportKind; file: string; records: Row[]; errors: Check[] }
type TeacherResult = { row: number; email: string; ok: boolean; error?: string }

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }))
  const a = Object.assign(document.createElement('a'), { href: url, download: name })
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

async function readFile(f: File): Promise<unknown[][]> {
  if (/\.xlsx$/i.test(f.name)) {
    const { default: readXlsxFile } = await import('read-excel-file')
    return (await readXlsxFile(f)) as unknown[][]
  }
  if (/\.(csv|txt)$/i.test(f.name)) return parseCsv(await f.text())
  throw new Error('Yalnız .xlsx ya da .csv dosyası yüklenebilir. Eski .xls dosyasını Excel’de “.xlsx olarak kaydet” ile dönüştür.')
}

export function TopluAktarim() {
  const [kind, setKind] = useState<ImportKind>('ogrenci')
  const [pv, setPv] = useState<Preview | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [done, setDone] = useState<{ kind: ImportKind; ok: number; results?: TeacherResult[] } | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const toast = useToast()
  const qc = useQueryClient()

  function reset(k = kind) {
    setKind(k)
    setPv(null)
    setErr(null)
    setDone(null)
    if (input.current) input.current.value = ''
  }

  async function onFile(f: File | undefined) {
    if (!f) return
    setErr(null)
    setDone(null)
    setPv(null)
    if (f.size > 5 * 1024 * 1024) return setErr('Dosya en çok 5 MB olabilir.')
    setBusy(true)
    try {
      const { records: raw, missing } = toRecords(kind, await readFile(f))
      // Branş yazımını listedekine eşitle ("matematik" → "Matematik")
      const records = kind === 'ogretmen' ? raw.map((r) => ({ ...r, branch: BRANS.find((b) => fold(b) === fold(r.branch ?? '')) ?? r.branch! })) : raw
      if (missing.length) throw new Error(`Başlık satırında şu sütun bulunamadı: ${missing.join(', ')}. Şablonu indirip ona göre doldur.`)
      if (!records.length) throw new Error('Dosyada aktarılacak satır yok.')
      if (records.length > MAX_ROWS[kind]) throw new Error(`Tek seferde en çok ${MAX_ROWS[kind]} satır aktarılabilir; dosyayı böl.`)
      let errors: Check[]
      if (kind === 'ogrenci') {
        const { data, error } = await supabase.rpc('import_students', { p: records, p_dry_run: true })
        if (error) throw new Error(error.message)
        errors = (data as { errors: Check[] }).errors
      } else {
        errors = checkTeachers(records)
      }
      setPv({ kind, file: f.name, records, errors })
    } catch (e) {
      setErr((e as Error).message || 'Dosya okunamadı.')
    } finally {
      setBusy(false)
    }
  }

  async function run() {
    if (!pv) return
    setBusy(true)
    setErr(null)
    if (pv.kind === 'ogrenci') {
      const { data, error } = await supabase.rpc('import_students', { p: pv.records })
      setBusy(false)
      if (error) return setErr(error.message)
      const ok = (data as { ok: number }).ok
      setDone({ kind: 'ogrenci', ok })
      toast(`${ok} öğrenci aktarıldı`)
      for (const k of ['yonetim', 'students', 'classes']) qc.invalidateQueries({ queryKey: [k] })
    } else {
      const bad = new Set(pv.errors.map((e) => e.row))
      const rows = pv.records.filter((_, i) => !bad.has(i + 1))
      const { data, error } = await supabase.functions.invoke('admin-davet', { body: { action: 'bulk', rows, redirect_to: `${window.location.origin}/` } })
      setBusy(false)
      if (error) return setErr('Davetler gönderilemedi. Bağlantını ve iki adımlı doğrulamayı kontrol edip tekrar dene.')
      const results = (data as { results: TeacherResult[] }).results
      setDone({ kind: 'ogretmen', ok: results.filter((r) => r.ok).length, results })
      toast(`${results.filter((r) => r.ok).length} öğretmene davet gönderildi`)
      for (const k of ['yonetim', 'user-states']) qc.invalidateQueries({ queryKey: [k] })
    }
    setPv(null)
    if (input.current) input.current.value = ''
  }

  const fields = FIELDS[kind]
  const badRows = new Map((pv?.errors ?? []).map((e) => [e.row, e.error]))
  const okCount = pv ? pv.records.length - new Set(pv.errors.map((e) => e.row)).size : 0

  return (
    <>
      <p className="m a" style={{ fontSize: 13 }}>
        Excel (.xlsx) ya da CSV dosyasındaki listeyi tek seferde ekle. Önce önizleme gösterilir, hiçbir şey onay vermeden yazılmaz. İlk satır başlık olmalı; sütun sırası önemli değil.
      </p>
      <Seg className="a" label="Ne aktarılacak" value={kind} onChange={(k) => reset(k)} options={[['ogrenci', 'Öğrenci listesi'], ['ogretmen', 'Öğretmen listesi']]} style={{ alignSelf: 'flex-start' }} />
      <section className="card a" style={{ ['--d' as string]: 1, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }} aria-label="Dosya seç">
        <div style={{ fontSize: 14 }}>
          Sütunlar: {fields.map((f, i) => (
            <span key={f.key}>
              {i > 0 && ', '}
              <b>{f.label}</b>
              {!f.required && ' (isteğe bağlı)'}
            </span>
          ))}
          .{' '}
          {kind === 'ogrenci' ? (
            <>Sınıf “5/A” gibi yazılır ve önce <b>Sınıflar</b>da açılmış olmalı. Öğrenci hesabı açılmaz; öğrenci ve veli kendi kaydıyla bağlanır.</>
          ) : (
            <>Her öğretmene şifre belirleme bağlantılı davet e-postası gider (en çok {MAX_ROWS.ogretmen} kişi). Ders atamaları sonra <b>Ders atamaları</b>ndan yapılır.</>
          )}
        </div>
        <div className="btns">
          <button className="btn" type="button" onClick={() => download(kind === 'ogrenci' ? 'ogrenci-sablonu.csv' : 'ogretmen-sablonu.csv', toCsv(TEMPLATE[kind]))}>
            <Icon name="doc" size={16} /> Şablonu indir (CSV)
          </button>
          <label className="btn pri" style={{ cursor: busy ? 'wait' : 'pointer' }}>
            <Icon name="plus" size={16} stroke={2} /> Dosya seç
            <input ref={input} type="file" accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="sr-only" aria-label="Aktarılacak dosya" disabled={busy} onChange={(e) => onFile(e.target.files?.[0])} />
          </label>
          {busy && (
            <span className="m">
              <span className="spinner" aria-hidden="true" /> İşleniyor…
            </span>
          )}
        </div>
        {kind === 'ogretmen' && (
          <details style={{ fontSize: 13 }}>
            <summary>Geçerli branş adları</summary>
            <p className="m">{BRANS.join(' · ')}</p>
          </details>
        )}
        {err && (
          <div className="err" role="alert">
            {err}
          </div>
        )}
      </section>

      {pv && (
        <section className="card a" style={{ ['--d' as string]: 2, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }} aria-label="Önizleme">
          <div className="kv">
            <h2 style={{ fontSize: 16 }}>Önizleme · {pv.file}</h2>
            <div className="btns">
              <span className="chip n">{pv.records.length} satır</span>
              <span className="chip up">{okCount} hazır</span>
              {pv.errors.length > 0 && <span className="chip down">{new Set(pv.errors.map((e) => e.row)).size} hatalı</span>}
            </div>
          </div>
          <div className="tbl" style={{ maxHeight: 420, overflowY: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th scope="col">#</th>
                  {fields.map((f) => (
                    <th key={f.key} scope="col">
                      {f.label}
                    </th>
                  ))}
                  <th scope="col">Durum</th>
                </tr>
              </thead>
              <tbody>
                {pv.records.map((r, i) => {
                  const e = badRows.get(i + 1)
                  return (
                    <tr key={i} className={e ? 'bad' : ''}>
                      <td className="mono">{i + 1}</td>
                      {fields.map((f) => (
                        <td key={f.key}>{r[f.key] || <span className="m">—</span>}</td>
                      ))}
                      <td style={{ color: e ? 'var(--signal-ink, var(--signal))' : 'var(--primary)', fontWeight: 600, fontSize: 13 }}>{e ?? 'Hazır'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {pv.kind === 'ogrenci' && pv.errors.length > 0 ? (
            <div className="err" role="alert">
              Hatalı satırlar varken öğrenci aktarımı yapılmaz (yarım liste oluşmasın diye). Dosyayı düzeltip yeniden yükle.
            </div>
          ) : (
            <div className="btns">
              <button className="btn pri" disabled={busy || okCount === 0} onClick={run}>
                {pv.kind === 'ogrenci' ? `${okCount} öğrenciyi aktar` : `${okCount} öğretmene davet gönder`}
              </button>
              <button className="btn" disabled={busy} onClick={() => reset()}>
                Vazgeç
              </button>
              {pv.kind === 'ogretmen' && pv.errors.length > 0 && <span className="m" style={{ fontSize: 13 }}>Hatalı satırlar atlanır.</span>}
            </div>
          )}
        </section>
      )}

      {done && (
        <section className="card a" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }} aria-label="Aktarım sonucu" role="status">
          <h2 style={{ fontSize: 16 }}>
            {done.kind === 'ogrenci' ? `${done.ok} öğrenci aktarıldı.` : `${done.ok} öğretmene davet gönderildi.`}
          </h2>
          {done.results?.some((r) => !r.ok) && (
            <>
              <span className="m" style={{ fontSize: 13 }}>
                Açılamayanlar:
              </span>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14 }}>
                {done.results
                  .filter((r) => !r.ok)
                  .map((r) => (
                    <li key={r.row}>
                      {r.email}: {r.error}
                    </li>
                  ))}
              </ul>
            </>
          )}
        </section>
      )}
    </>
  )
}

/** Öğretmen satırlarının ön denetimi (asıl denetim admin-davet'te). */
function checkTeachers(rows: Row[]): Check[] {
  const out: Check[] = []
  const seen = new Set<string>()
  rows.forEach((r, i) => {
    const n = i + 1
    if (r.full_name!.length < 3 || r.full_name!.length > 80) out.push({ row: n, error: 'Ad soyad geçersiz' })
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(r.email!)) out.push({ row: n, error: 'E-posta geçersiz' })
    else if (seen.has(r.email!)) out.push({ row: n, error: 'Bu e-posta listede iki kez var' })
    else if (!BRANS.includes(r.branch as (typeof BRANS)[number])) out.push({ row: n, error: `Branş geçersiz: ${r.branch || 'boş'}` })
    else if (r.phone && !/^[0-9 +()-]{7,20}$/.test(r.phone)) out.push({ row: n, error: 'Telefon geçersiz' })
    seen.add(r.email!)
  })
  return out
}
