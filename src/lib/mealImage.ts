import { addDays, isoDow } from './format'
export type MealWord = { text: string; confidence: number; bbox: { x0: number; y0: number; x1: number; y1: number } }
export type MealReading = { day: string; items: string; review: boolean }
function abortable<T>(promise:Promise<T>,signal:AbortSignal):Promise<T>{
  if(signal.aborted)return Promise.reject(new Error('İşlem iptal edildi.'))
  return new Promise((resolve,reject)=>{
    const abort=()=>reject(new Error('İşlem iptal edildi.'))
    signal.addEventListener('abort',abort,{once:true})
    promise.then(resolve,reject).finally(()=>signal.removeEventListener('abort',abort))
  })
}
export function monthDays(month: string): string[] {
  if (!/^\d{4}-\d{2}$/.test(month)) return []
  const first = `${month}-01`
  if (Number(month.slice(5)) < 1 || Number(month.slice(5)) > 12) return []
  const days: string[] = []
  for (let d = first; d.startsWith(month); d = addDays(d, 1)) if (isoDow(d) <= 5) days.push(d)
  return days
}
/** Yalnız görselde açıkça okunan tam tarihler kullanılır; eksik tarih veya menü uydurulmaz. */
export function mealReadings(words: MealWord[], month: string, width: number, height: number): MealReading[] {
  const allowed = new Set(monthDays(month))
  const anchors = words.flatMap(w => {
    const m = w.text.replace(/\s/g, '').replace(/^[^0-9]+|[^0-9]+$/g,'').match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/)
    if (!m || w.confidence < 20) return []
    const day = `${m[3]}-${m[2]!.padStart(2,'0')}-${m[1]!.padStart(2,'0')}`
    return allowed.has(day) ? [{ day, word: w, col: isoDow(day) - 1 }] : []
  })
  // Şablonun beş sütunu tarihlerin merkezlerinden bulunur; kenar boşlukları tolere edilir.
  const centers = Array.from({length:5},(_,col) => {
    const xs=anchors.filter(a=>a.col===col).map(a=>(a.word.bbox.x0+a.word.bbox.x1)/2).sort((a,b)=>a-b)
    return xs.length ? xs[Math.floor(xs.length/2)]! : width*(col+.5)/5
  })
  if (centers.some((x,i)=>i>0 && x<=centers[i-1]!)) throw new Error('Gün sütunları ayırt edilemedi. Daha düz ve net bir görsel seç.')
  const bounds=[0,...centers.slice(1).map((x,i)=>(x+centers[i]!)/2),width]
  const seen = new Set<string>()
  return anchors.sort((a,b)=>a.day.localeCompare(b.day)).map(a => {
    if (seen.has(a.day)) throw new Error('Görselde aynı tarih tekrar okunmuş. Tarihleri kontrol et.')
    seen.add(a.day)
    const later=anchors.filter(b=>b.word.bbox.y0>a.word.bbox.y1+Math.max(20,a.word.bbox.y1-a.word.bbox.y0)).sort((x,y)=>x.word.bbox.y0-y.word.bbox.y0);const next=later[0]
    const rows: { y:number; words:MealWord[] }[]=[]
    const ws=words.filter(w=>{
      const x=(w.bbox.x0+w.bbox.x1)/2
      return x>=bounds[a.col]! && x<bounds[a.col+1]! && w.bbox.y0>a.word.bbox.y1 && w.bbox.y1<(next?.word.bbox.y0 ?? height) && /[A-Za-zÇĞİÖŞÜçğıöşü]/.test(w.text)
    }).sort((x,y)=>x.bbox.y0-y.bbox.y0 || x.bbox.x0-y.bbox.x0)
    for (const w of ws) {
      const y=(w.bbox.y0+w.bbox.y1)/2
      const row=rows.find(r=>Math.abs(r.y-y)<Math.max(8,(w.bbox.y1-w.bbox.y0)*.55))
      if(row) row.words.push(w); else rows.push({y,words:[w]})
    }
    const items=rows.map(r=>r.words.sort((x,y)=>x.bbox.x0-y.bbox.x0).map(w=>w.text).join(' ')).join('\n').trim()
    return {day:a.day,items,review:!items || ws.some(w=>w.confidence<70)}
  })
}

export async function readMealImage(file: File, month: string, progress: (n:number)=>void, signal:AbortSignal): Promise<MealReading[]> {
  if (!file.type.startsWith('image/') || file.size>10*1024*1024) throw new Error('En fazla 10 MB boyutunda JPG, PNG veya WEBP görseli seç.')
  const url=URL.createObjectURL(file)
  let worker: import('tesseract.js').Worker | undefined
  const abort=()=>{void worker?.terminate()}
  signal.addEventListener('abort',abort,{once:true})
  try {
    const image=new Image(); image.src=url; await image.decode().catch(()=>{throw new Error('Görsel açılamadı. JPG, PNG veya WEBP olarak tekrar seç.')})
    if(signal.aborted) throw new Error('İşlem iptal edildi.')
    const scale=Math.min(1,3200/Math.max(image.width,image.height))
    const canvas=document.createElement('canvas'); canvas.width=Math.round(image.width*scale); canvas.height=Math.round(image.height*scale)
    const ctx=canvas.getContext('2d')!; ctx.fillStyle='white'; ctx.fillRect(0,0,canvas.width,canvas.height); ctx.drawImage(image,0,0,canvas.width,canvas.height)
    const {createWorker,PSM}=await import('tesseract.js')
    const base=`${location.origin}/program-ocr`
    const starting=createWorker('tur+eng',1,{workerPath:`${base}/worker.min.js`,corePath:base,langPath:base,workerBlobURL:false,logger:()=>{}})
    starting.then(w=>{if(signal.aborted)void w.terminate()}).catch(()=>{})
    worker=await abortable(starting,signal)
    if(signal.aborted)throw new Error('İşlem iptal edildi.')
    await worker.setParameters({tessedit_pageseg_mode:PSM.SINGLE_BLOCK})
    const words:MealWord[]=[]
    for(let col=0;col<5;col++){
      if(signal.aborted)throw new Error('İşlem iptal edildi.')
      const x0=Math.round(canvas.width*col/5),x1=Math.round(canvas.width*(col+1)/5)
      const cell=document.createElement('canvas');cell.width=x1-x0;cell.height=canvas.height
      cell.getContext('2d')!.drawImage(canvas,x0,0,cell.width,cell.height,0,0,cell.width,cell.height)
      const result=await abortable(worker.recognize(cell,{}, {blocks:true}),signal)
      words.push(...(result.data.blocks??[]).flatMap(b=>b.paragraphs.flatMap(p=>p.lines.flatMap(l=>l.words))).map(w=>({...w,bbox:{...w.bbox,x0:w.bbox.x0+x0,x1:w.bbox.x1+x0}})))
      progress(Math.round((col+1)*4))
    }
    const dateOf=(text:string)=>{const m=text.replace(/\s/g,'').replace(/^[^0-9]+|[^0-9]+$/g,'').match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);return m?`${m[3]}-${m[2]!.padStart(2,'0')}-${m[1]!.padStart(2,'0')}`:''}
    const allowed=new Set(monthDays(month))
    const initial=mealReadings(words,month,canvas.width,canvas.height)
    const ys=words.filter(w=>allowed.has(dateOf(w.text))).map(w=>w.bbox.y0).sort((a,b)=>a-b)
    const bands:number[][]=[]
    for(const y of ys){const last=bands.at(-1);if(last&&y-last[0]!<45)last.push(y);else bands.push([y])}
    const tops=bands.map(b=>b[Math.floor(b.length/2)]!)
    const rows:MealReading[]=[]
    const anchors=words.filter(w=>allowed.has(dateOf(w.text)))
    const centers=Array.from({length:5},(_,col)=>{const xs=anchors.filter(w=>isoDow(dateOf(w.text))-1===col).map(w=>(w.bbox.x0+w.bbox.x1)/2).sort((a,b)=>a-b);return xs[Math.floor(xs.length/2)]??canvas.width*(col+.5)/5})
    const bounds=[0,...centers.slice(1).map((x,i)=>(x+centers[i]!)/2),canvas.width]
    for(let row=0;row<tops.length;row++)for(let col=0;col<5;col++){
      if(signal.aborted)throw new Error('İşlem iptal edildi.')
      const x0=Math.round(bounds[col]!)+2,x1=Math.round(bounds[col+1]!)-2
      let anchor=anchors.find(w=>isoDow(dateOf(w.text))-1===col&&Math.abs(w.bbox.y0-tops[row]!)<45)
      if(!anchor){
        const y=Math.max(0,tops[row]!-5),cell=document.createElement('canvas');cell.width=x1-x0;cell.height=45
        cell.getContext('2d')!.drawImage(canvas,x0,y,cell.width,cell.height,0,0,cell.width,cell.height)
        await worker.setParameters({tessedit_pageseg_mode:PSM.SINGLE_LINE})
        const dateResult=await abortable(worker.recognize(cell,{}, {blocks:true}),signal)
        const found=(dateResult.data.blocks??[]).flatMap(b=>b.paragraphs.flatMap(p=>p.lines.flatMap(l=>l.words))).find(w=>allowed.has(dateOf(w.text))&&isoDow(dateOf(w.text))-1===col)
        if(found)anchor={...found,bbox:{...found.bbox,y0:found.bbox.y0+y,y1:found.bbox.y1+y,x0:found.bbox.x0+x0,x1:found.bbox.x1+x0}}
        else if(allowed.has(dateOf(dateResult.data.text))&&isoDow(dateOf(dateResult.data.text))-1===col)anchor={text:dateResult.data.text,confidence:dateResult.data.confidence,bbox:{x0,y0:y,x1,y1:y+28}}
      }
      if(!anchor)continue
      const y0=anchor.bbox.y0+16,y1=Math.min(canvas.height,(tops[row+1]??canvas.height)-18)
      const cell=document.createElement('canvas');cell.width=x1-x0;cell.height=y1-y0
      cell.getContext('2d')!.drawImage(canvas,x0,y0,cell.width,cell.height,0,0,cell.width,cell.height)
      await worker.setParameters({tessedit_pageseg_mode:PSM.SPARSE_TEXT})
      let result=await abortable(worker.recognize(cell,{}, {blocks:true}),signal)
      const foodLines=(d:typeof result.data)=>(d.blocks??[]).flatMap(b=>b.paragraphs.flatMap(p=>p.lines))
        .map(l=>l.words.filter(w=>w.confidence>=60&&(/[A-Za-zÇĞİÖŞÜçğıöşü]{3}/.test(w.text)||w.text.toUpperCase()==='ET')).map(w=>w.text).join(' ')).filter(Boolean)
      if(result.data.confidence<80||foodLines(result.data).length!==4){
        await worker.setParameters({tessedit_pageseg_mode:PSM.SINGLE_BLOCK})
        const alternative=await abortable(worker.recognize(cell,{}, {blocks:true}),signal)
        const quality=(d:typeof result.data)=>d.confidence-15*Math.abs(foodLines(d).length-4)
        if(foodLines(alternative.data).length===4&&alternative.data.confidence>70&&quality(alternative.data)>quality(result.data))result=alternative
      }
      const food=foodLines(result.data)
      const day=dateOf(anchor.text),fallback=initial.find(r=>r.day===day)
      if(food.length!==4&&fallback&&!fallback.review&&fallback.items.split('\n').length===4&&fallback.items.split(/\s+/).every(w=>/[A-Za-zÇĞİÖŞÜçğıöşü]{2}/.test(w)))rows.push(fallback)
      else rows.push({day,items:food.join('\n'),review:food.length!==4||result.data.confidence<80})
      progress(20+Math.round((row*5+col+1)/(tops.length*5)*80))
    }
    rows.sort((a,b)=>a.day.localeCompare(b.day))
    if(!rows.length)throw new Error('Seçilen aya ait tarihler okunamadı. Ayı kontrol et veya daha net bir görsel seç.')
    return rows
  } finally {signal.removeEventListener('abort',abort);await worker?.terminate().catch(()=>{});URL.revokeObjectURL(url)}
}
