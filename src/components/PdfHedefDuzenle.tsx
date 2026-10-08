import {useState} from 'react'
import {useQueryClient} from '@tanstack/react-query'
import {supabase} from '@/lib/supabase'
import type {OutcomeRow} from '@/lib/denemeData'
import {Modal} from './Modal'
export function PdfHedefDuzenle({row,onClose}:{row:OutcomeRow;onClose:()=>void}) {
  const [title,setTitle]=useState(row.title),[code,setCode]=useState(row.code??''),[kind,setKind]=useState(row.outcome_type)
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),qc=useQueryClient()
  async function save(){
    if(busy)return
    setBusy(true);setError('')
    try {
      const {error}=await supabase.rpc('update_pdf_outcome',{p_id:row.id,p_code:code,p_title:title,p_kind:kind})
      if(error)throw new Error(error.code==='23505'?'Aynı kod bu yayın kataloğunda zaten var.':error.message)
      await Promise.all(['outcomes','genel-items','dataset','unresolved_outcomes','bulk-outcome-proposals'].map(key=>qc.invalidateQueries({queryKey:[key]})))
      onClose()
    }catch(e){setError(e instanceof Error?e.message:'Kaydedilemedi.')}finally{setBusy(false)}
  }
  return <Modal title="PDF hedefini düzenle" onClose={()=>{if(!busy)onClose()}} footer={<><button className="btn" disabled={busy} onClick={onClose}>Vazgeç</button><button className="btn pri" disabled={busy||title.trim().length<3} onClick={save}>Kaydet</button></>}>
    <p>Bu düzenleme aynı hedefe bağlı soruların, konu analizlerinin ve raporların hedef adını günceller. Ders, sınıf, yayıncı ve resmî MEB kayıtları korunur.</p>
    <label className="field">PDF hedef kodu<input value={code} maxLength={100} onChange={e=>setCode(e.target.value)}/></label>
    <label className="field">Hedef metni<textarea value={title} maxLength={3000} onChange={e=>setTitle(e.target.value)}/></label>
    <label className="field">Hedef türü<select value={kind} onChange={e=>setKind(e.target.value)}><option value="KAZANIM">Kazanım</option><option value="OGRENME_CIKTISI">Öğrenme çıktısı</option></select></label>
    {error&&<p role="alert">{error}</p>}
  </Modal>
}