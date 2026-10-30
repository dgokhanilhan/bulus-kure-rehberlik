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

export type DateBand = { y0: number; y1: number; x0: number; x1: number; dark: number }
/**
 * Tarih satırları şablonda koyu gri şerittir. Satırların çoğu sayfa renginden belirgin koyuysa şerit sayılır; başlık gibi
 * kalın şeritler elenir. x0-x1 tablonun genişliğidir (solda Excel satır numarası sütunu olabilir).
 */
export function dateBands(gray: ArrayLike<number>, width: number, height: number): DateBand[] {
  if (!width || !height) return []
  const sample: number[] = []
  for (let i = 0; i < gray.length; i += 37) sample.push(gray[i]!)
  sample.sort((a, b) => a - b)
  const paper = sample[Math.floor(sample.length * 0.7)] ?? 255
  const dark = paper * 0.84
  const runs: { y0: number; y1: number }[] = []
  for (let y = 0; y < height; y++) {
    let n = 0
    for (let x = 0; x < width; x++) if (gray[y * width + x]! < dark) n++
    if (n / width < 0.5) continue
    const last = runs.at(-1)
    if (last && y - last.y1 <= 2) last.y1 = y
    else runs.push({ y0: y, y1: y })
  }
  const minHeight = Math.max(6, height * 0.008)
  const thick = runs.filter((r) => r.y1 - r.y0 + 1 >= minHeight)
  if (!thick.length) return []
  const heights = thick.map((r) => r.y1 - r.y0 + 1).sort((a, b) => a - b)
  const usual = heights[Math.floor(heights.length / 2)]!
  return thick
    .filter((r) => r.y1 - r.y0 + 1 <= usual * 1.6)
    .map((r) => {
      const dolu = (x: number) => {
        let n = 0
        for (let y = r.y0; y <= r.y1; y++) if (gray[y * width + x]! < dark) n++
        return n / (r.y1 - r.y0 + 1) >= 0.6
      }
      let x0 = 0
      while (x0 < width - 1 && !dolu(x0)) x0++
      let x1 = width - 1
      while (x1 > x0 && !dolu(x1)) x1--
      return { ...r, x0, x1, dark }
    })
}
/** Fotoğraf eğikse şeridin alt kenarı sütundan sütuna değişir: o sütundaki son koyu satır. */
export function bandBottom(gray: ArrayLike<number>, width: number, height: number, band: DateBand, xa: number, xb: number): number {
  const a = Math.max(0, Math.round(xa)), b = Math.min(width, Math.round(xb))
  for (let y = Math.min(height - 1, band.y1 + 12); y >= band.y0 - 12 && y >= 0; y--) {
    let n = 0
    for (let x = a; x < b; x++) if (gray[y * width + x]! < band.dark) n++
    if (n / Math.max(1, b - a) >= 0.6) return y
  }
  return band.y1
}
const weekOf = (day: string, first: string) => {
  const monday = (d: string) => addDays(d, 1 - isoDow(d))
  return Math.round((Date.parse(monday(day)) - Date.parse(monday(first))) / (7 * 86400000))
}
/** "2.11.2026", "2112026" gibi rakam okumasından ay içindeki gün; ay/yıl tutmuyorsa boş. Şeridin sütunundaki hafta günü de tutmalı. */
export function bandDay(text: string, month: string, col: number): string {
  const [yil, ay] = month.split('-')
  const t = text.replace(/[^0-9.]/g, '')
  const parts = t.split('.').filter(Boolean)
  const ayNo = String(Number(ay))
  const adaylar = parts.length >= 2 ? [parts[0]!] : []
  const bitis = `${ayNo}${yil}`
  const bitis0 = `${ay}${yil}`
  const duz = t.replace(/\./g, '')
  for (const e of [bitis, bitis0]) if (duz.endsWith(e) && duz.length > e.length) adaylar.push(duz.slice(0, -e.length))
  if (parts.length >= 2 && Number(parts[1]) !== Number(ay) && !adaylar.slice(1).length) return ''
  for (const a of adaylar) {
    const gun = `${month}-${a.padStart(2, '0')}`
    if (a.length <= 2 && monthDays(month).includes(gun) && isoDow(gun) - 1 === col) return gun
  }
  return ''
}
/**
 * Şerit satırı = takvim haftası. Okunan tarihler şerit-hafta farkını oylar; en az iki tarih aynı farkı veriyorsa okunamayan
 * hücrelerin tarihi takvimden gelir (yalnız tarih; menü okunmazsa gün eklenmez). Okunan hiç tarih yoksa hiçbir şey üretilmez.
 */
export function gridDates(reads: { band: number; col: number; day: string }[], bandCount: number, month: string): { band: number; col: number; day: string; read: boolean }[] {
  const days = monthDays(month)
  const first = days[0]
  if (!first) return []
  const oy = new Map<number, number>()
  for (const r of reads) {
    const k = r.band - weekOf(r.day, first)
    oy.set(k, (oy.get(k) ?? 0) + 1)
  }
  const best = [...oy].sort((a, b) => b[1] - a[1])[0]
  if (!best || best[1] < 2) return reads.map((r) => ({ ...r, read: true }))
  const out: { band: number; col: number; day: string; read: boolean }[] = []
  for (const day of days) {
    const band = weekOf(day, first) + best[0]
    if (band < 0 || band >= bandCount) continue
    const col = isoDow(day) - 1
    out.push({ band, col, day, read: reads.some((r) => r.day === day && r.band === band) })
  }
  return out
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
    // Küçük görsel büyütülür: aşağıdaki piksel ölçüleri ve OCR bu yazı boyutunda çalışır
    const scale=image.width<1900?Math.min(2000/image.width,3200/Math.max(image.width,image.height)):Math.min(1,3200/Math.max(image.width,image.height))
    const canvas=document.createElement('canvas'); canvas.width=Math.round(image.width*scale); canvas.height=Math.round(image.height*scale)
    const ctx=canvas.getContext('2d')!; ctx.imageSmoothingQuality='high'; ctx.fillStyle='white'; ctx.fillRect(0,0,canvas.width,canvas.height); ctx.drawImage(image,0,0,canvas.width,canvas.height)
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
    // Gri şeritteki tarihler ilk okumada kaçabilir: şeritler ayrı, kontrastı açılarak yalnız rakam olarak okunur
    const expected=monthDays(month)
    if(expected.some(d=>!words.some(w=>w.text.includes(`.${Number(d.slice(5,7))}.${d.slice(0,4)}`)&&w.text.startsWith(String(Number(d.slice(8))))))){
      const full=ctx.getImageData(0,0,canvas.width,canvas.height).data
      const gray=new Uint8ClampedArray(canvas.width*canvas.height)
      for(let i=0;i<gray.length;i++)gray[i]=(full[i*4]!*299+full[i*4+1]!*587+full[i*4+2]!*114)/1000
      const bands=dateBands(gray,canvas.width,canvas.height)
      if(bands.length){
        const left=[...bands.map(b=>b.x0)].sort((a,b)=>a-b)[Math.floor(bands.length/2)]!,right=[...bands.map(b=>b.x1)].sort((a,b)=>a-b)[Math.floor(bands.length/2)]!
        const cw=(right-left)/5,reads:{band:number;col:number;day:string}[]=[]
        await worker.setParameters({tessedit_pageseg_mode:PSM.SINGLE_LINE,tessedit_char_whitelist:'0123456789.'})
        for(let b=0;b<bands.length;b++)for(let col=0;col<5;col++){
          if(signal.aborted)throw new Error('İşlem iptal edildi.')
          const band=bands[b]!,pad=3,x=Math.round(left+cw*col)+4,w=Math.round(cw)-8,y=Math.max(0,band.y0-pad),h=Math.min(canvas.height-y,band.y1-band.y0+1+pad*2)
          const cell=document.createElement('canvas');cell.width=w*3;cell.height=h*3
          const g=cell.getContext('2d',{willReadFrequently:true})!;g.imageSmoothingQuality='high';g.drawImage(canvas,x,y,w,h,0,0,cell.width,cell.height)
          const img=g.getImageData(0,0,cell.width,cell.height),px=img.data
          let lo=255,hi=0
          for(let i=0;i<px.length;i+=4){const v=(px[i]!+px[i+1]!+px[i+2]!)/3;if(v<lo)lo=v;if(v>hi)hi=v}
          // Rakam koyu, şerit gri: şerit rengi beyaza çekilir
          const sort=new Float32Array(px.length/4);for(let i=0;i<sort.length;i++)sort[i]=(px[i*4]!+px[i*4+1]!+px[i*4+2]!)/3
          sort.sort();const bg=sort[Math.floor(sort.length*.6)]!
          for(let i=0;i<px.length;i+=4){const v=(px[i]!+px[i+1]!+px[i+2]!)/3,n=Math.max(0,Math.min(255,(v-lo)/Math.max(1,bg-lo-8)*255));px[i]=px[i+1]=px[i+2]=n}
          g.putImageData(img,0,0)
          const r=await abortable(worker.recognize(cell),signal)
          const day=bandDay(r.data.text,month,col)
          if(day&&r.data.confidence>=20&&!reads.some(x=>x.day===day))reads.push({band:b,col,day})
          progress(20+Math.round((b*5+col+1)/(bands.length*5)*10))
        }
        await worker.setParameters({tessedit_char_whitelist:''})
        for(const g of gridDates(reads,bands.length,month)){
          const text=`${Number(g.day.slice(8))}.${Number(g.day.slice(5,7))}.${g.day.slice(0,4)}`
          if(words.some(w=>w.text.replace(/\s/g,'').replace(/^[^0-9]+|[^0-9]+$/g,'')===text))continue
          const band=bands[g.band]!,x=left+cw*g.col,alt=bandBottom(gray,canvas.width,canvas.height,band,x+cw*.1,x+cw*.9)
          // Tarih kelimesi şeridin altına oturur: menü okuması şeritten hemen sonra başlar (y0+16). Bu yoldan gelen gün kontrol ister.
          words.push({text,confidence:g.read?60:40,bbox:{x0:x+cw*.25,x1:x+cw*.75,y0:alt-14,y1:alt}})
        }
      }
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
      const foodLines=(d:typeof result.data,min=60)=>(d.blocks??[]).flatMap(b=>b.paragraphs.flatMap(p=>p.lines))
        .map(l=>l.words.filter(w=>w.confidence>=min&&(/[A-Za-zÇĞİÖŞÜçğıöşü]{3}/.test(w.text)||w.text.toUpperCase()==='ET')).map(w=>w.text).join(' ')).filter(Boolean)
      if(result.data.confidence<80||foodLines(result.data).length!==4){
        await worker.setParameters({tessedit_pageseg_mode:PSM.SINGLE_BLOCK})
        const alternative=await abortable(worker.recognize(cell,{}, {blocks:true}),signal)
        const quality=(d:typeof result.data)=>d.confidence-15*Math.abs(foodLines(d).length-4)
        if(foodLines(alternative.data).length===4&&alternative.data.confidence>70&&quality(alternative.data)>quality(result.data))result=alternative
      }
      // Şeritten gelen gün zaten kontrol ister: eksik kalan satır düşük güvenle de gösterilir, öğretmen düzeltir
      const food=anchor.confidence<70&&foodLines(result.data).length<4?foodLines(result.data,30):foodLines(result.data)
      const day=dateOf(anchor.text),fallback=initial.find(r=>r.day===day)
      if(food.length!==4&&fallback&&!fallback.review&&fallback.items.split('\n').length===4&&fallback.items.split(/\s+/).every(w=>/[A-Za-zÇĞİÖŞÜçğıöşü]{2}/.test(w)))rows.push({...fallback,review:anchor.confidence<70})
      else rows.push({day,items:food.join('\n'),review:food.length!==4||result.data.confidence<80||anchor.confidence<70})
      progress(20+Math.round((row*5+col+1)/(tops.length*5)*80))
    }
    rows.sort((a,b)=>a.day.localeCompare(b.day))
    if(new Set(rows.map(r=>r.day)).size!==rows.length)throw new Error('Aynı tarih tekrar okundu. Daha net bir görsel seçip tarihleri kontrol et.')
    if(!rows.length)throw new Error('Seçilen aya ait tarihler okunamadı. Ayı kontrol et veya daha net bir görsel seç.')
    return rows
  } finally {signal.removeEventListener('abort',abort);await worker?.terminate().catch(()=>{});URL.revokeObjectURL(url)}
}
