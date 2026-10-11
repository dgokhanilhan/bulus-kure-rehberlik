import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useMeals } from '@/lib/data'
import { todayISO, trDW } from '@/lib/format'
import { monthDays, readMealImage } from '@/lib/mealImage'
import { supabase } from '@/lib/supabase'
import { Modal } from '@/components/Modal'
import { useToast } from '@/components/Toast'

export default function YemekAdmin() {
  const [month,setMonth]=useState(todayISO().slice(0,7))
  const days=monthDays(month)
  const meals=useMeals(`${month}-01`,days.at(-1)??`${month}-01`)
  const [draft,setDraft]=useState<Record<string,string>>({})
  const [busy,setBusy]=useState(false)
  const [importing,setImporting]=useState(false)
  const [reading,setReading]=useState(false)
  const [progress,setProgress]=useState(0)
  const [error,setError]=useState('')
  const [file,setFile]=useState<File|null>(null)
  const [preview,setPreview]=useState('')
  const [rows,setRows]=useState<Record<string,string>|null>(null)
  const [reviewDays,setReviewDays]=useState<string[]>([])
  const abort=useRef<AbortController|null>(null)
  const qc=useQueryClient(),toast=useToast()
  useEffect(()=>{setDraft({})},[month])
  useEffect(()=>{if(!file){setPreview('');return}const u=URL.createObjectURL(file);setPreview(u);return()=>URL.revokeObjectURL(u)},[file])
  useEffect(()=>()=>abort.current?.abort(),[])
  const saved=(d:string)=>meals.data?.find(m=>m.day===d&&m.meal==='ogle')?.items??''
  function close(){abort.current?.abort();setImporting(false);setRows(null);setFile(null);setError('')}
  async function recognize(){
    if(!file)return
    const controller=new AbortController();abort.current=controller
    setReading(true);setError('');setProgress(0);setRows(null)
    try {const r=await readMealImage(file,month,setProgress,controller.signal);if(!controller.signal.aborted){setRows(Object.fromEntries(r.map(x=>[x.day,x.items])));setReviewDays(r.filter(x=>x.review).map(x=>x.day))}}
    catch(e){if(!controller.signal.aborted)setError(e instanceof Error?e.message:'Görsel okunamadı.')}
    finally {if(abort.current===controller){setReading(false);abort.current=null}}
  }
  async function save(){
    setBusy(true)
    const {error}=await supabase.rpc('save_monthly_lunch',{p_month:`${month}-01`,p_days:Object.entries(draft).filter(([d,v])=>v.trim()!==saved(d)).map(([day,items])=>({day,items:items.trim()}))})
    setBusy(false)
    if(error){toast(error.message,'warn');return}
    setDraft({});await qc.invalidateQueries({queryKey:['meals']});toast('Yemek listesi kaydedildi')
  }
  function changeMonth(next:string){if(Object.keys(draft).length && !window.confirm('Kaydedilmemiş menü değişiklikleri bırakılıp ay değiştirilsin mi?'))return;setMonth(next)}
  return <>
    <div className="kv a" style={{flexWrap:'wrap',gap:12}}>
      <label className="field">Menü ayı<input type="month" value={month} min="2020-01" max="2100-12" onChange={e=>e.target.value&&changeMonth(e.target.value)} disabled={busy||reading}/></label>
      <div className="btns"><button className="btn" onClick={()=>{setReading(false);setImporting(true)}} disabled={busy||meals.isLoading}>Görselden yükle</button><button className="btn pri" onClick={save} disabled={busy||meals.isLoading||!!meals.error||!Object.keys(draft).length}>{busy?'Kaydediliyor…':'Ayı kaydet'}</button></div>
    </div>
    <p className="m">Yalnız öğle yemeği. Görselden okunan menüler kontrolünden sonra forma aktarılır; “Ayı kaydet” ile veli ve öğrencilerde görünür.</p>
    {meals.error&&<p role="alert" className="err">Yemek listesi yüklenemedi. Sayfayı yenileyip tekrar dene.</p>}
    <div className="meal-month">{days.map(d=><section className="card" key={d}><label className="field"><b>{trDW(d)}</b><textarea aria-label={`${trDW(d)} Öğle yemeği`} rows={4} maxLength={2000} placeholder="Çorba, ana yemek, pilav…" disabled={busy||meals.isLoading||!!meals.error} value={draft[d]??saved(d)} onChange={e=>setDraft(x=>({...x,[d]:e.target.value}))}/></label></section>)}</div>
    {importing&&<Modal title="Aylık yemek listesini görselden yükle" width={900} onClose={close} footer={<><button className="btn" onClick={close}>Vazgeç</button>{rows?<button className="btn pri" onClick={()=>{setDraft(x=>({...x,...Object.fromEntries(Object.entries(rows).filter(([,v])=>v.trim()))}));close()}}>Kontrol ettiğim menüyü forma aktar</button>:<button className="btn pri" disabled={!file||reading} onClick={recognize}>{reading?`Görsel okunuyor · %${progress}`:'Görseli tanı'}</button>}</>}>
      <p>Beş gün sütunlu aylık şablon · {month}. Fotoğraf bu cihazda okunur; dış hizmete gönderilmez. Mevcut günlerin yerine gelecek metinleri kontrol et. Okunmayan günler değişmez; 29 Ekim gibi tatil bilgileri korunur.</p>
      <label className="field">Yemek listesi görseli<input type="file" accept="image/jpeg,image/png,image/webp" disabled={reading} onChange={e=>{setFile(e.target.files?.[0]??null);setRows(null);setError('')}}/></label>
      {preview&&<img src={preview} alt="Seçilen aylık yemek listesi" style={{width:'100%',maxHeight:360,objectFit:'contain'}}/>}
      {error&&<p className="err" role="alert">{error}</p>}
      {rows&&<><p><b>{Object.keys(rows).length} / {days.length} gün okundu.</b> Her tarihi ve menüyü görselle karşılaştır. Eksik ve boş okunan günler aktarılmaz; ana formda elle tamamlayabilirsin.</p><p className="m">{days.filter(d=>!(d in rows)).length>0&&`Okunmayan tarihler: ${days.filter(d=>!(d in rows)).map(trDW).join(", ")}`}</p><div className="meal-month">{Object.entries(rows).map(([d,v])=><label className="field" key={d}>{trDW(d)}{reviewDays.includes(d)&&<span className="chip">Okumayı kontrol et</span>}<textarea rows={4} maxLength={2000} value={v} onChange={e=>setRows(x=>({...x,[d]:e.target.value}))}/></label>)}</div></>}
    </Modal>}
  </>
}
