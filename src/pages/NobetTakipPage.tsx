import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/auth/AuthProvider'
import { supabase } from '@/lib/supabase'
import { GUN, isoDow, todayISO } from '@/lib/format'
import { useToast } from '@/components/Toast'

const PERIODS={before_noon:'Öğleden önce',after_noon:'Öğleden sonra'}
const LOCATIONS={kantin:'Kantin',arka_bahce:'Arka bahçe',lise_1:'1. kat lise',orta_56:'2. kat 5/6',orta_78:'2. kat 7/8'}
type Duty={id:string;weekday:number;period:keyof typeof PERIODS;location:keyof typeof LOCATIONS}
export default function NobetTakipPage(){
 const {profile,role}=useAuth(),qc=useQueryClient(),toast=useToast()
 const teacher=role==='brans'||role==='rehber'
 const duties=useQuery({queryKey:['teacher_duties',profile?.id,role],enabled:teacher,queryFn:async()=>{const {data,error}=await supabase.from('teacher_duties').select('id,weekday,period,location').eq('teacher_id',profile!.id).order('weekday').order('period');if(error)throw error;return data as Duty[]}})
 const [id,setId]=useState<string|null>(null),[day,setDay]=useState(1),[period,setPeriod]=useState<Duty['period']>('before_noon'),[location,setLocation]=useState<Duty['location']>('kantin'),[busy,setBusy]=useState(false)
 async function save(remove=false,removeId?:string){setBusy(true);const {error}=await supabase.rpc('save_teacher_duty',{p_id:removeId??id,p_weekday:day,p_period:period,p_location:location,p_delete:remove});setBusy(false);if(error){toast(error.code==='23505'?'Bu gün ve zaman için bir nöbetin zaten var. Mevcut kaydı düzenle.':error.message,'warn');return}setId(null);await qc.invalidateQueries({queryKey:['teacher_duties']});toast(remove?'Nöbet kaldırıldı':'Nöbet kaydedildi')}
 if(!teacher)return null
 return <div className="duty-page">
  <header className="page-intro"><span className="label">Öğretmen çalışma alanı</span><h1 className="hd">Nöbet Takip</h1><p className="m">Haftalık nöbet gününü, zamanını ve yerini seç. Nöbet gününde uygulama içi bildirim gelir. Yalnız kendi kayıtlarını görür ve düzenlersin.</p></header>
  {duties.error&&<p role="alert" className="err">Nöbet kayıtları yüklenemedi. Tekrar dene.</p>}
  <section className="card duty-editor"><h2 className="sec">{id?'Nöbeti düzenle':'Nöbet ekle'}</h2><div className="duty-fields">
   <label className="field">Nöbet günü<select value={day} onChange={e=>setDay(Number(e.target.value))}>{[1,2,3,4,5].map(d=><option key={d} value={d}>{GUN[d]}</option>)}</select></label>
   <label className="field">Nöbet zamanı<select value={period} onChange={e=>setPeriod(e.target.value as Duty['period'])}>{Object.entries(PERIODS).map(([v,n])=><option value={v} key={v}>{n}</option>)}</select></label>
   <label className="field">Nöbet yeri<select value={location} onChange={e=>setLocation(e.target.value as Duty['location'])}>{Object.entries(LOCATIONS).map(([v,n])=><option value={v} key={v}>{n}</option>)}</select></label>
  </div><div className="btns" style={{marginTop:16}}>{id&&<button className="btn" onClick={()=>setId(null)}>Düzenlemeyi iptal et</button>}<button className="btn pri" disabled={busy||duties.isLoading||!!duties.error} onClick={()=>save()}>Nöbeti kaydet</button></div></section>
  <div className="section-heading"><h2 className="sec">Haftalık nöbetlerim</h2><span className="chip n">{duties.data?.length ?? 0} kayıt</span></div>{duties.isLoading?<p role="status">Yükleniyor…</p>:<div className="duty-list">{duties.data?.length?duties.data.map(d=><section key={d.id} className={`card duty-card${d.weekday===isoDow(todayISO())?' is-today':''}`}><div className="kv"><b>{GUN[d.weekday]} · {PERIODS[d.period]}</b>{d.weekday===isoDow(todayISO())&&<span className="chip">Bugün nöbetin var</span>}</div><p>{LOCATIONS[d.location]}</p><div className="btns"><button className="btn" disabled={busy} onClick={()=>{setId(d.id);setDay(d.weekday);setPeriod(d.period);setLocation(d.location)}}>Düzenle</button><button className="btn" disabled={busy} onClick={()=>{if(window.confirm('Bu haftalık nöbet kaydı kaldırılsın mı?'))void save(true,d.id)}}>Nöbeti kaldır</button></div></section>):<div className="empty"><p>Henüz nöbet kaydın yok.</p><p className="m">Yukarıdan gün, zaman ve yer seçerek haftalık planını oluşturabilirsin.</p></div>}</div>}
 </div>
}
