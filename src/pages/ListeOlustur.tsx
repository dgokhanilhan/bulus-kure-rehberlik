import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '@/auth/AuthProvider'
import { supabase } from '@/lib/supabase'
import { Modal } from '@/components/Modal'
import { useToast } from '@/components/Toast'
import {
  column,
  fields,
  listRows,
  newList,
  projectRows,
  templates,
  widths,
  type Field,
  type ListConfig,
  type ListDocument,
  type ListKind,
  type ListSources,
  type ParentContact,
} from '@/lib/schoolLists'
import './ListeOlustur.css'

const errorText = (e: unknown) =>
  e && typeof e === 'object' && 'message' in e ? String(e.message) : 'İşlem tamamlanamadı. Tekrar dene.'
export function ListeOlustur() {
  const { role, profile } = useAuth()
  const [sp] = useSearchParams()
  const toast = useToast()
  const [kind, setKind] = useState<ListKind>('students')
  const [config, setConfig] = useState<ListConfig>(() => ({
    ...newList('students'),
    classIds: sp.get('sinif') ? [sp.get('sinif')!] : [],
  }))
  const [opened, setOpened] = useState<ListDocument | null>(null)
  const [snapshot, setSnapshot] = useState<string[][] | null>(null)
  const [step, setStep] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [contact, setContact] = useState<ParentContact | null>(null)
  const [pdfUrl, setPdfUrl] = useState('')
  const pdfFrame = useRef<HTMLIFrameElement>(null)
  const [archive, setArchive] = useState<ListDocument | null>(null)
  const source = useQuery({
    queryKey: ['list-sources', profile?.id],
    enabled: role === 'admin',
    queryFn: async () => {
      const r = await supabase.rpc('school_list_sources')
      if (r.error) throw r.error
      return r.data as ListSources
    },
  })
  const library = useQuery({
    queryKey: ['list-library', profile?.id],
    enabled: role === 'admin',
    queryFn: async () => {
      const r = await supabase
        .from('school_list_documents')
        .select('*')
        .is('archived_at', null)
        .order('updated_at', { ascending: false })
      if (r.error) throw r.error
      return r.data as ListDocument[]
    },
  })
  useEffect(
    () => () => {
      if (pdfUrl) URL.revokeObjectURL(pdfUrl)
    },
    [pdfUrl],
  )
  const rows = useMemo(() => (source.data ? listRows(source.data, kind, config) : []), [source.data, kind, config])
  const projected = snapshot ?? projectRows(rows, config)
  const update = (patch: Partial<ListConfig>) => setConfig((c) => ({ ...c, ...patch }))
  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    setError('')
    try {
      await fn()
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(false)
    }
  }
  const reset = (k: ListKind, t = 0) => {
    setKind(k)
    setConfig(newList(k, t))
    setOpened(null)
    setSnapshot(null)
    setStep(0)
    setError('')
  }
  const open = (d: ListDocument) => {
    setKind(d.kind)
    setConfig(d.config)
    setOpened(d)
    setSnapshot(d.mode === 'snapshot' ? d.snapshot : null)
    setStep(d.mode === 'snapshot' ? 2 : 0)
  }
  const save = (mode: 'dynamic' | 'snapshot', copy = false) =>
    run(async () => {
      const r = await supabase.rpc('save_school_list', {
        p_id: copy || opened?.mode !== mode ? null : (opened?.id ?? null),
        p_name: config.title,
        p_kind: kind,
        p_mode: mode,
        p_config: config,
        p_snapshot: mode === 'snapshot' ? projected : null,
        p_revision: opened?.revision ?? null,
      })
      if (r.error) throw r.error
      const refreshed = await library.refetch()
      const d = refreshed.data?.find((x) => x.id === r.data)
      if (d) open(d)
      toast(mode === 'snapshot' ? 'Sabit liste kaydedildi.' : 'Şablon kaydedildi.')
    })
  const exportFile = (format: 'pdf' | 'xlsx' | 'print') =>
    run(async () => {
      const auth = await supabase.rpc('authorize_school_list_export', {
        p_format: format,
        p_columns: config.columns.map((c) => c.source),
        p_count: projected.length,
      })
      if (auth.error) throw auth.error
      const school = source.data?.school || 'Buluş Küre'
      const blob =
        format === 'xlsx'
          ? await (await import('@/lib/listExcel')).listExcel(config, projected, school)
          : await (await import('@/lib/listPdf')).listPdf(config, projected, school)
      const url = URL.createObjectURL(blob)
      if (format !== 'xlsx') {
        setPdfUrl(url)
        return
      }
      const a = document.createElement('a')
      a.href = url
      a.download = `${config.title.replace(/[<>:"/\\|?*]/g, '-').slice(0, 100)}.xlsx`
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
    })
  if (role !== 'admin') return <p role="alert">Bu bölüm yalnız yöneticiler içindir.</p>
  if (source.isPending) return <p role="status">Öğrenci ve veli bilgileri yükleniyor…</p>
  if (source.error)
    return (
      <div role="alert">
        <p>{errorText(source.error)}</p>
        <button className="btn" onClick={() => source.refetch()}>
          Tekrar dene
        </button>
      </div>
    )
  const ws = widths(config)
  return (
    <div className="list-center">
      <div className="list-intro">
        <div>
          <span className="list-eyebrow">OKUL YÖNETİMİ · LİSTELER</span>
          <h3>Bir kez düzenle, her ihtiyacında kullan.</h3>
          <p>Güncel kayıtlardan liste hazırla veya belirli bir güne ait sabit kopya sakla.</p>
        </div>
        <button className="btn" onClick={() => reset(kind)}>
          Yeni liste
        </button>
      </div>
      {error && (
        <p className="list-error" role="alert">
          {error}
        </p>
      )}
      <div className="list-actions" aria-label="Liste kategorisi">
        <button className="btn" aria-pressed={kind === 'students'} onClick={() => reset('students')}>
          Sınıf Listeleri
        </button>
        <button className="btn" aria-pressed={kind === 'parents'} onClick={() => reset('parents')}>
          Veli Listeleri
        </button>
        <span className="m">
          {snapshot ? 'Sabit kayıt · güncel veriden bağımsız' : 'Dinamik · güncel kayıtlarla hazırlanır'}
        </span>
      </div>
      <details className="list-library">
        <summary>Kaydedilen şablonlar ve sabit listeler ({library.data?.length ?? 0})</summary>
        {library.error && <p role="alert">{errorText(library.error)}</p>}
        {!library.data?.length && <p>Henüz kaydedilmiş liste yok. İlk listeni aşağıdan oluşturabilirsin.</p>}
        {library.data?.map((d) => (
          <div key={d.id} className="list-saved">
            <div>
              <strong>{d.name}</strong>
              <small>
                {d.kind === 'parents' ? 'Veli' : 'Sınıf'} · {d.mode === 'snapshot' ? 'Sabit liste' : 'Dinamik şablon'}
              </small>
            </div>
            <button className="btn" onClick={() => open(d)}>
              Aç
            </button>
            <button
              className="btn"
              onClick={() => {
                open(d)
                setOpened(null)
                update({ title: `${d.name.slice(0, 105)} (kopya)` })
              }}
            >
              Kopyala
            </button>
            <button className="btn" onClick={() => setArchive(d)}>
              Arşivle
            </button>
          </div>
        ))}
      </details>
      <div className="list-steps" aria-label="Liste hazırlama adımları">
        {['1. Kişiler ve şablon', '2. Sütunlar ve düzen', '3. Önizleme ve çıktı'].map((s, i) => (
          <button
            key={s}
            className="btn"
            aria-pressed={step === i}
            onClick={() => setStep(i)}
            disabled={snapshot !== null && i === 0}
          >
            {s}
          </button>
        ))}
      </div>
      {step === 0 && (
        <section className="list-panel">
          {kind === 'students' && (
            <div className="list-templates">
              {templates.map((t, i) => (
                <button
                  className="btn"
                  key={t.name}
                  onClick={() => {
                    const next = newList(kind, i)
                    update({ columns: next.columns, title: next.title })
                    setOpened(null)
                  }}
                >
                  {t.name}
                </button>
              ))}
            </div>
          )}
          <div className="list-form">
            <label>
              Ara
              <input
                value={config.search}
                onChange={(e) => update({ search: e.target.value })}
                placeholder="İsim, sınıf veya okul no"
              />
            </label>
            <label>
              Sıralama
              <select value={config.sort} onChange={(e) => update({ sort: e.target.value as ListConfig['sort'] })}>
                <option value="class">Sınıf, sonra ad soyad</option>
                <option value="name">Ad soyad</option>
                <option value="number">Okul numarası</option>
              </select>
            </label>
            {kind === 'parents' && (
              <label>
                Satır düzeni
                <select
                  value={config.grouping}
                  onChange={(e) => update({ grouping: e.target.value as ListConfig['grouping'] })}
                >
                  <option value="parent">Her veli bir kez</option>
                  <option value="child">Her çocuk için ayrı satır</option>
                </select>
              </label>
            )}
          </div>
          <fieldset>
            <legend>
              Sınıflar <span className="m">· seçim yoksa tümü</span>
            </legend>
            <div className="list-checks">
              {source.data?.classes.map((c) => (
                <label key={c.id}>
                  <input
                    type="checkbox"
                    checked={config.classIds.includes(c.id)}
                    onChange={(e) =>
                      update({
                        classIds: e.target.checked
                          ? [...config.classIds, c.id]
                          : config.classIds.filter((id) => id !== c.id),
                        excluded: [],
                      })
                    }
                  />
                  {c.name}
                  {!c.active && ' (pasif)'}
                </label>
              ))}
            </div>
          </fieldset>
          <details>
            <summary>Belirli öğrencileri seç ({config.studentIds.length || 'tümü'})</summary>
            <div className="list-checks list-people">
              {source.data?.students
                .filter((s) => !config.classIds.length || config.classIds.includes(s.classId ?? ''))
                .map((s) => (
                  <label key={s.id}>
                    <input
                      type="checkbox"
                      checked={config.studentIds.includes(s.id)}
                      onChange={(e) =>
                        update({
                          studentIds: e.target.checked
                            ? [...config.studentIds, s.id]
                            : config.studentIds.filter((id) => id !== s.id),
                        })
                      }
                    />
                    {s.name} · {s.className} · {s.schoolNo}
                  </label>
                ))}
            </div>
            <button className="btn" onClick={() => update({ studentIds: [] })}>
              Öğrenci seçimini temizle
            </button>
          </details>
          <label className="list-check">
            <input
              type="checkbox"
              checked={config.missingPhone}
              onChange={(e) => update({ missingPhone: e.target.checked })}
            />
            Yalnız telefon bilgisi eksik olanlar
          </label>
          <div className="list-actions">
            <strong>{rows.length} kişi / satır bulundu</strong>
            <button className="btn" onClick={() => update({ excluded: [] })}>
              Tüm satırları seç
            </button>
            <button className="btn" onClick={() => update({ excluded: rows.map((r) => r.id) })}>
              Seçimi temizle
            </button>
          </div>
          <div className="list-scroll">
            <table>
              <thead>
                <tr>
                  <th>Seç</th>
                  <th>{kind === 'parents' ? 'Veli' : 'Öğrenci'}</th>
                  <th>Sınıf / öğrenci</th>
                  <th>Veli iletişimi</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <label className="list-row-select">
                        <input
                          type="checkbox"
                          aria-label={`${r.values.studentName || r.values.parentName} seç`}
                          checked={!config.excluded.includes(r.id)}
                          onChange={(e) =>
                            update({
                              excluded: e.target.checked
                                ? config.excluded.filter((id) => id !== r.id)
                                : [...config.excluded, r.id],
                            })
                          }
                        />
                      </label>
                    </td>
                    <td>{kind === 'parents' ? r.values.parentName : r.values.studentName}</td>
                    <td>
                      {r.values.className}
                      {kind === 'parents' && <small>{r.values.studentName || 'Bağlı öğrenci yok'}</small>}
                    </td>
                    <td>
                      {r.parentIds.map((id) => {
                        const p = source.data!.parents.find((p) => p.id === id)!
                        return (
                          <button key={id} className="btn" onClick={() => setContact(p)}>
                            {p.name} · {p.phone || 'Telefon ekle'}
                          </button>
                        )
                      })}
                      {!r.parentIds.length && <span className="m">Veli bağlantısı yok</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {step === 1 && (
        <section className="list-panel">
          <div className="list-form">
            <label>
              Liste adı / başlık
              <input maxLength={120} value={config.title} onChange={(e) => update({ title: e.target.value })} />
            </label>
            <label>
              Tarih
              <input type="date" value={config.date} onChange={(e) => update({ date: e.target.value })} />
            </label>
            <label>
              Sayfa yönü
              <select
                value={config.orientation}
                onChange={(e) => update({ orientation: e.target.value as ListConfig['orientation'] })}
              >
                <option value="portrait">A4 · Dikey</option>
                <option value="landscape">A4 · Yatay</option>
              </select>
            </label>
            <label>
              Satır yüksekliği
              <input
                type="number"
                min={24}
                max={90}
                value={config.rowHeight}
                onChange={(e) => update({ rowHeight: Math.max(24, Math.min(90, Number(e.target.value))) })}
              />
            </label>
          </div>
          <label>
            Açıklama
            <textarea
              maxLength={300}
              value={config.description}
              onChange={(e) => update({ description: e.target.value })}
            />
          </label>
          <h4>Sütunlar</h4>
          <p className="m">
            Başlığı ve genişliği düzenle. Boş alanlara önizlemede yazabilirsin. Sabit listelerde sütun sırası korunur.
          </p>
          {config.columns.map((col, i) => (
            <div className="list-column" key={col.id}>
              <label>
                Sütun başlığı
                <input
                  maxLength={80}
                  value={col.title}
                  onChange={(e) =>
                    update({
                      columns: config.columns.map((x) => (x.id === col.id ? { ...x, title: e.target.value } : x)),
                    })
                  }
                />
              </label>
              <label>
                Genişlik
                <input
                  type="number"
                  min={3}
                  max={100}
                  value={col.width}
                  onChange={(e) =>
                    update({
                      columns: config.columns.map((x) =>
                        x.id === col.id ? { ...x, width: Math.max(3, Math.min(100, Number(e.target.value))) } : x,
                      ),
                    })
                  }
                />
              </label>
              <span className="m">{fields[col.source]}</span>
              <button
                className="btn"
                aria-label={`${col.title} yukarı`}
                disabled={i === 0 || snapshot !== null}
                onClick={() => {
                  const cols = [...config.columns]
                  ;[cols[i - 1], cols[i]] = [cols[i]!, cols[i - 1]!]
                  update({ columns: cols })
                }}
              >
                ↑
              </button>
              <button
                className="btn"
                aria-label={`${col.title} aşağı`}
                disabled={i === config.columns.length - 1 || snapshot !== null}
                onClick={() => {
                  const cols = [...config.columns]
                  ;[cols[i + 1], cols[i]] = [cols[i]!, cols[i + 1]!]
                  update({ columns: cols })
                }}
              >
                ↓
              </button>
              <button
                className="btn"
                disabled={config.columns.length === 1 || snapshot !== null}
                onClick={() => update({ columns: config.columns.filter((x) => x.id !== col.id) })}
              >
                Kaldır
              </button>
            </div>
          ))}
          {!snapshot && (
            <label>
              Sütun ekle
              <select
                value=""
                disabled={config.columns.length >= 16}
                onChange={(e) => update({ columns: [...config.columns, column(e.target.value as Field)] })}
              >
                <option value="" disabled>
                  Alan seç (en fazla 16 sütun)
                </option>
                {Object.entries(fields).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="list-form">
            <label>
              Alt not
              <textarea maxLength={300} value={config.footer} onChange={(e) => update({ footer: e.target.value })} />
            </label>
            <label>
              İmza / onay alanı
              <textarea
                maxLength={200}
                placeholder="Hazırlayan: …     Onaylayan: …"
                value={config.signatures}
                onChange={(e) => update({ signatures: e.target.value })}
              />
            </label>
          </div>
        </section>
      )}
      {step === 2 && (
        <section className="list-panel">
          <div className="list-actions">
            <div>
              <h3>{config.title}</h3>
              <p>{config.description}</p>
            </div>
            <span>
              {projected.length} satır · {config.columns.length} sütun · A4{' '}
              {config.orientation === 'portrait' ? 'dikey' : 'yatay'}
            </span>
          </div>
          <p className="m">Bu tablo içerik önizlemesidir. Sayfa bölünmelerini “PDF önizle” ile kontrol edebilirsin.</p>
          <div className="list-scroll list-preview">
            <table style={{ tableLayout: 'fixed', minWidth: config.orientation === 'landscape' ? 980 : 680 }}>
              <colgroup>
                {ws.map((w, i) => (
                  <col key={i} style={{ width: `${w}%` }} />
                ))}
              </colgroup>
              <thead>
                <tr>
                  {config.columns.map((c) => (
                    <th key={c.id}>{c.title}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {projected.map((row, i) => (
                  <tr key={i} style={{ height: config.rowHeight }}>
                    {row.map((v, j) => (
                      <td key={j}>
                        {config.columns[j]?.source === 'blank' && snapshot === null ? (
                          <input
                            aria-label={`${i + 1}. satır ${config.columns[j]!.title}`}
                            maxLength={300}
                            value={v}
                            onChange={(e) => {
                              const id = rows.filter((r) => !config.excluded.includes(r.id))[i]!.id
                              update({
                                entries: {
                                  ...config.entries,
                                  [id]: { ...config.entries[id], [config.columns[j]!.id]: e.target.value },
                                },
                              })
                            }}
                          />
                        ) : (
                          v
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!projected.length && <p>Seçili satır yok. Kişiler adımından seçim yap.</p>}
          <p>{config.footer}</p>
          <p>{config.signatures}</p>
        </section>
      )}
      <div className="list-bottom">
        <span>
          <strong>{projected.length}</strong> satır seçili
        </span>
        <div className="list-actions">
          {step < 2 && (
            <button className="btn primary" onClick={() => setStep(step + 1)}>
              Devam et →
            </button>
          )}
          <button
            className="btn"
            disabled={busy || !config.title.trim()}
            onClick={() => save(snapshot ? 'snapshot' : 'dynamic')}
          >
            {snapshot ? 'Sabit listeyi kaydet' : 'Şablonu kaydet'}
          </button>
          {!snapshot && (
            <button
              className="btn"
              disabled={busy || !projected.length || !config.title.trim()}
              onClick={() => save('snapshot', true)}
            >
              Sabit kopya kaydet
            </button>
          )}
          <button className="btn" disabled={busy || !projected.length} onClick={() => exportFile('pdf')}>
            PDF önizle
          </button>
          <button className="btn" disabled={busy || !projected.length} onClick={() => exportFile('print')}>
            Yazdır
          </button>
          <button className="btn primary" disabled={busy || !projected.length} onClick={() => exportFile('xlsx')}>
            Excel indir
          </button>
        </div>
        {busy && <span role="status">İşlem hazırlanıyor…</span>}
      </div>
      {contact && (
        <ContactEditor
          parent={contact}
          onClose={() => setContact(null)}
          onSaved={async () => {
            await source.refetch()
            setContact(null)
            toast('İletişim bilgileri güncellendi.')
          }}
        />
      )}
      {pdfUrl && (
        <Modal
          width={1000}
          title="PDF önizleme ve yazdırma"
          onClose={() => setPdfUrl('')}
          footer={
            <>
              <a className="btn" href={pdfUrl} download={`${config.title}.pdf`}>
                PDF indir
              </a>
              <button
                className="btn"
                onClick={() => {
                  try {
                    pdfFrame.current?.contentWindow?.focus()
                    pdfFrame.current?.contentWindow?.print()
                  } catch {
                    toast('PDF’yi açıp tarayıcının yazdırma seçeneğini kullan.')
                  }
                }}
              >
                Yazdır
              </button>
              <a className="btn primary" href={pdfUrl} target="_blank" rel="noreferrer">
                PDF’yi aç / yazdır
              </a>
            </>
          }
        >
          <p>
            Yazdırmak için PDF’yi açıp tarayıcının yazdırma seçeneğini kullan. iPad’de Paylaş → Yazdır yolunu
            kullanabilirsin.
          </p>
          <iframe
            ref={pdfFrame}
            title="Liste PDF önizleme"
            src={pdfUrl}
            style={{ width: '100%', height: '60vh', border: 0 }}
          />
        </Modal>
      )}
      {archive && (
        <Modal
          title="Listeyi arşivle"
          onClose={() => setArchive(null)}
          footer={
            <button
              className="btn"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  const r = await supabase.rpc('archive_school_list', { p_id: archive.id })
                  if (r.error) throw r.error
                  setArchive(null)
                  await library.refetch()
                  toast('Liste arşivlendi.')
                })
              }
            >
              Arşivle
            </button>
          }
        >
          <p>“{archive.name}” kayıtlı listelerden kaldırılacak. Öğrenci ve veli kayıtları etkilenmez.</p>
        </Modal>
      )}
    </div>
  )
}

function ContactEditor({
  parent,
  onClose,
  onSaved,
}: {
  parent: ParentContact
  onClose: () => void
  onSaved: () => Promise<void>
}) {
  const [phone, setPhone] = useState(parent.phone ?? '')
  const [email, setEmail] = useState(parent.contactEmail ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  return (
    <Modal
      title={`${parent.name} · iletişim`}
      onClose={onClose}
      footer={
        <button
          className="btn primary"
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            setError('')
            try {
              const r = await supabase.rpc('update_parent_contact', {
                p_parent: parent.id,
                p_phone: phone,
                p_email: email,
                p_expected: parent.updatedAt,
              })
              if (r.error) throw r.error
              await onSaved()
            } catch (e) {
              setError(errorText(e))
            } finally {
              setBusy(false)
            }
          }}
        >
          Kaydet
        </button>
      }
    >
      <div className="list-form">
        <label>
          Telefon
          <input
            type="tel"
            maxLength={30}
            placeholder="05xx xxx xx xx"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </label>
        <label>
          İletişim e-postası
          <input
            type="email"
            maxLength={254}
            value={email}
            placeholder={parent.loginEmail ?? 'E-posta'}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
      </div>
      <p className="m">
        Boş iletişim e-postasında mevcut hesap e-postası kullanılır. Bu işlem giriş e-postasını, şifreyi veya öğrenci
        bağlantılarını değiştirmez.
      </p>
      {error && <p role="alert">{error}</p>}
    </Modal>
  )
}
