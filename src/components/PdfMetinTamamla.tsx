import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { searchOutcomes, type OutcomeRow, type CurriculumVersion } from '@/lib/denemeData'
import { completionFor } from '@/lib/outcomeCompletion'
import { supabase } from '@/lib/supabase'
import { Modal } from './Modal'

export function PdfMetinTamamla({ rows, version, onClose }: { rows: OutcomeRow[]; version: CurriculumVersion; onClose: () => void }) {
  const qc = useQueryClient()
  const official = useQuery({ queryKey: ['completion-catalog', version.id], queryFn: () => searchOutcomes({ versionIds: [version.id], limit: 1000 }) })
  const [selected, setSelected] = useState<string[]>([])
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [done, setDone] = useState<string[]>([])
  const proposals = rows.flatMap(row => { const match = completionFor(row, official.data ?? []); return match && !done.includes(row.id) ? [{ row, match }] : [] })
  async function save() {
    if (busy) return
    setBusy(true); setError('')
    const saved: string[] = []
    try {
      for (const { row, match } of proposals.filter(p => selected.includes(p.row.id))) {
        const { error: err } = await supabase.rpc('update_pdf_outcome', { p_id: row.id, p_code: row.code, p_title: match.title, p_kind: row.outcome_type })
        if (err) throw err
        saved.push(row.id)
      }
      setSelected([])
    } catch { setError('Bazı metinler kaydedilemedi. Başarıyla kaydedilenler listeden kaldırıldı; kalanları tekrar deneyebilirsin.') }
    finally {
      setDone(old => [...old, ...saved])
      await Promise.all(['outcomes', 'exam_items', 'genel-items', 'dataset'].map(key => qc.invalidateQueries({ queryKey: [key] })))
      setBusy(false)
    }
  }
  return <Modal title="PDF hedef metinlerini tamamla" onClose={() => { if (!busy) onClose() }} footer={<><button className="btn" disabled={busy} onClick={onClose}>Kapat</button><button className="btn pri" disabled={busy || !selected.length} onClick={save}>Seçilen {selected.length} metni tamamla</button></>}>
    <p>Yalnız seçilen yılın resmî programında tek bir metin başlangıcıyla eşleşen hedefler önerilir. Kod, PDF kaynak etiketi ve soru bağlantıları değişmez. Belirsiz metinler tamamlanmaz.</p>
    <p>Kaynak: <a href={version.source_url} target="_blank" rel="noopener noreferrer">{version.source_title}</a></p>
    {official.isLoading ? <p>Resmî katalog kontrol ediliyor…</p> : official.isError ? <p role="alert">Kaynak kataloğu okunamadı.</p> : <>
      <p>{proposals.length} güvenilir öneri · {done.length} metin kaydedildi. Bu işlem mevcut filtredeki en çok 200 PDF hedefini inceler.</p>
      <button className="btn sm" disabled={busy || !proposals.length} onClick={() => setSelected(proposals.map(p => p.row.id))}>Önerilerin tümünü seç</button>
      {proposals.map(({ row, match }) => <label className="card" key={row.id} style={{ display: 'block', padding: 12, marginTop: 10 }}><input type="checkbox" disabled={busy} checked={selected.includes(row.id)} onChange={e => setSelected(old => e.target.checked ? [...old, row.id] : old.filter(id => id !== row.id))}/><b> {row.code}</b><div>Mevcut: {row.title}</div><div>Öneri: {match.title}</div></label>)}
    </>}
    {error && <p role="alert">{error}</p>}
  </Modal>
}
