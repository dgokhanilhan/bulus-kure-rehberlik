import {useCallback,useState} from 'react'
import {useQueryClient} from '@tanstack/react-query'
import {supabase} from '@/lib/supabase'
import type {UnresolvedRow} from '@/lib/denemeData'
import {pdfOutcomeGrade,pdfOutcomeKey} from '@/lib/pdfOutcomes'
import {Modal} from './Modal'

type Kind='KAZANIM'|'OGRENME_CIKTISI'
type Result={key:string;status:'created'|'reused'|'skipped'|'error';message?:string}
export function PdfHedefEkle({rows,onClose}:{rows:UnresolvedRow[];onClose:()=>void}) {
  const qc=useQueryClient()
  const [selected,setSelected]=useState(new Set(rows.filter(r=>(r.raw_text?.trim().length??0)>=3).map(pdfOutcomeKey)))
  const [grades,setGrades]=useState(Object.fromEntries(rows.map(r=>[pdfOutcomeKey(r),pdfOutcomeGrade(r)])))
  const [types,setTypes]=useState<Record<string,Kind>>(Object.fromEntries(rows.map(r=>[pdfOutcomeKey(r),'KAZANIM'])))
  const [kind,setKind]=useState<Kind>('KAZANIM'),[busy,setBusy]=useState(false),[confirmed,setConfirmed]=useState(false)
  const [results,setResults]=useState<Record<string,Result>>({}),[message,setMessage]=useState('')
  const close=useCallback(()=>{if(!busy)onClose()},[busy,onClose])
  const pending=rows.filter(r=>selected.has(pdfOutcomeKey(r)) && (!results[pdfOutcomeKey(r)] || results[pdfOutcomeKey(r)]!.status==='error'))
  async function save() {
    if(busy||!confirmed||!pending.length)return
    setBusy(true);setMessage('')
    try {
      for(let start=0;start<pending.length;start+=100) {
        setMessage(`${Math.min(start+100,pending.length)} / ${pending.length} soru işleniyor…`)
        const {data,error}=await supabase.rpc('add_pdf_outcomes',{p_items:pending.slice(start,start+100).map(r=>({exam_id:r.exam_id,section_key:r.section_key,q_no:r.q_no,grade:grades[pdfOutcomeKey(r)],outcome_type:types[pdfOutcomeKey(r)]}))})
        if(error)throw new Error(error.message)
        setResults(old=>({...old,...Object.fromEntries((data as Result[]).map(r=>[r.key,r]))}))
      }
      setMessage('İşlem tamamlandı. Eklenen hedefler sorulara bağlandı; başarısız satırlar aşağıda açıklanır.')
    }catch(e){setMessage(e instanceof Error ? e.message : 'Bağlantı kurulamadı. Başarılı kayıtlar korunur; kalanları yeniden deneyebilirsin.')}
    finally {
      await Promise.all(['unresolved_outcomes','exam_items','genel-dataset','genel-items','dataset','curriculum_versions','outcomes','bulk-outcome-proposals'].map(key=>qc.invalidateQueries({queryKey:[key]})))
      setBusy(false);setConfirmed(false)
    }
  }
  const saved=Object.values(results).filter(r=>r.status==='created'||r.status==='reused').length
  return <Modal title={rows.length===1 ? 'PDF hedefini ekle' : 'PDF hedeflerini toplu ekle'} width={940} onClose={close} footer={<><button className="btn" disabled={busy} onClick={close}>Kapat</button><button className="btn pri" disabled={busy||!confirmed||!pending.length} onClick={save}>Seçilen {pending.length} soruya hedef ekle</button></>}>
    <p>PDF'teki metin ve kod okuluna ait yayın hedefi olarak kaydedilir ve soruya bağlanır. Resmî MEB kataloğu, sonuç, net ve puan değişmez. Aynı yayın/sınıf/ders içindeki aynı hedef yeniden oluşturulmaz.</p>
    <label className="field">Eklenecek hedef türü<select disabled={busy} value={kind} onChange={e=>{setKind(e.target.value as Kind);setTypes(Object.fromEntries(rows.map(r=>[pdfOutcomeKey(r),e.target.value as Kind])));setConfirmed(false)}}><option value="KAZANIM">Kazanım</option><option value="OGRENME_CIKTISI">Öğrenme çıktısı</option></select></label>
    <p>{rows.length} soru · {pending.length} seçili · {saved} soruya hedef bağlandı</p>
    <div className="btns"><button className="btn sm" disabled={busy} onClick={()=>{setSelected(new Set(rows.filter(r=>(r.raw_text?.trim().length??0)>=3).map(pdfOutcomeKey)));setConfirmed(false)}}>Metni olan tümünü seç</button><button className="btn sm" disabled={busy} onClick={()=>{setSelected(new Set());setConfirmed(false)}}>Seçimi temizle</button></div>
    <div className="tbl" style={{maxHeight:420,overflow:'auto'}}><table><thead><tr><th>Seç</th><th>Soru / PDF metni</th><th>Konu sınıfı</th><th>Tür</th><th>Durum</th></tr></thead><tbody>{rows.map(r=>{
      const key=pdfOutcomeKey(r),result=results[key],hasText=(r.raw_text?.trim().length??0)>=3,done=result&&result.status!=='error'
      return <tr key={key}><td><input type="checkbox" aria-label={`${r.exam_name} ${r.section_key} ${r.q_no}. soruya hedef ekle`} checked={selected.has(key)} disabled={busy||!hasText||!!done} onChange={e=>{const checked=e.target.checked;setSelected(old=>{const next=new Set(old);if(checked)next.add(key);else next.delete(key);return next});setConfirmed(false)}} /></td><td><b>{r.exam_name} · {r.section_key} {r.q_no}</b><div className="mono">{r.raw_code??'Kod yok'}</div><div>{r.raw_text??'PDF metni yok'}</div></td><td><select aria-label={`${r.section_key} ${r.q_no}. hedef sınıfı`} value={grades[key]} disabled={busy||!!done} onChange={e=>{setGrades(old=>({...old,[key]:Number(e.target.value)}));setConfirmed(false)}}>{(['TYT','AYT','YKS'].includes(r.exam_type)?[9,10,11,12]:[r.grade]).map(g=><option key={g} value={g}>{g}. sınıf</option>)}</select></td><td><select aria-label={`${r.section_key} ${r.q_no}. hedef türü`} value={types[key]} disabled={busy||!!done} onChange={e=>{setTypes(old=>({...old,[key]:e.target.value as Kind}));setConfirmed(false)}}><option value="KAZANIM">Kazanım</option><option value="OGRENME_CIKTISI">Öğrenme çıktısı</option></select></td><td>{!hasText?'Metin yok · eklenemez':result?.message??(result?.status==='created'?'Eklendi ve bağlandı':result?.status==='reused'?'Mevcut yayın hedefi kullanıldı':'Kontrol bekliyor')}</td></tr>
    })}</tbody></table></div>
    <label className="check"><input type="checkbox" checked={confirmed} disabled={busy||!pending.length} onChange={e=>setConfirmed(e.target.checked)} /> PDF metinlerini, konu sınıflarını ve hedef türünü kontrol ettim; seçilenleri ekle ve sorulara bağla</label>
    {message&&<p role="status">{message}</p>}
  </Modal>
}
