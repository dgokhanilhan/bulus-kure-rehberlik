/** Fotoğraf gölgesini ve tablo çizgilerini ders yazısından ayırır. Tamamen cihazda çalışır. */
export function prepareProgramCells(canvas: HTMLCanvasElement, periods: number, days: number) {
  const width=canvas.width, height=canvas.height
  const rgba=canvas.getContext('2d')!.getImageData(0,0,width,height).data
  const gray=new Uint8Array(width*height), integral=new Float64Array((width+1)*(height+1)), ink=new Uint8Array(width*height)
  for(let y=0;y<height;y++) {
    let sum=0
    for(let x=0;x<width;x++) {
      const i=y*width+x, j=i*4
      gray[i]=Math.round(rgba[j]!*0.299+rgba[j+1]!*0.587+rgba[j+2]!*0.114)
      sum+=gray[i]!
      integral[(y+1)*(width+1)+x+1]=integral[y*(width+1)+x+1]!+sum
    }
  }
  // Yerel eşik: gri kâğıt/gölge beyaz, çevresinden koyu harf siyah kalır.
  const radius=15
  for(let y=0;y<height;y++) for(let x=0;x<width;x++) {
    const l=Math.max(0,x-radius), r=Math.min(width,x+radius+1), t=Math.max(0,y-radius), b=Math.min(height,y+radius+1)
    const mean=(integral[b*(width+1)+r]!-integral[t*(width+1)+r]!-integral[b*(width+1)+l]!+integral[t*(width+1)+l]!)/((r-l)*(b-t))
    ink[y*width+x]=gray[y*width+x]! < mean-16 ? 1 : 0
  }
  function boundary(expected:number, step:number, limit:number, score:(n:number)=>number) {
    let best=Math.round(Math.min(limit-1,expected)), bestScore=0
    const lo=Math.max(0,Math.round(expected-step*.28)), hi=Math.min(limit-1,Math.round(expected+step*.28))
    for(let n=lo;n<=hi;n++) {
      const s=score(n)
      if(s>bestScore) {best=n;bestScore=s}
    }
    // Bir ders harfini çizgi sanma: alanın en az yarısı boyunca çizgi olmalı.
    return bestScore>.5 ? best : Math.round(Math.min(limit,expected))
  }
  const rows=Array.from({length:days+1},(_,i)=>i===0 ? 0 : i===days ? height : boundary(i*height/days,height/days,height,(y)=>{
    let n=0; for(let x=0;x<width;x++) if(ink[y*width+x])n++
    return n/width
  }))
  const columns=Array.from({length:days},(_,day)=>Array.from({length:periods+1},(_,p)=>boundary(p*width/periods,width/periods,width,(x)=>{
    let n=0; const top=rows[day]!, bottom=rows[day+1]!
    for(let y=top+4;y<bottom-4;y++) if(ink[y*width+x])n++
    return n/Math.max(1,bottom-top-8)
  })))
  return (day:number, period:number): {line:HTMLCanvasElement;block:HTMLCanvasElement} | null => {
    const left=columns[day]![period]!, right=columns[day]![period+1]!, top=rows[day]!, bottom=rows[day+1]!
    const mx=Math.max(4,Math.round((right-left)*.035)), my=Math.max(4,Math.round((bottom-top)*.035))
    const x0=left+mx, y0=top+my, w=right-left-2*mx, h=bottom-top-2*my
    if(w<8 || h<8) return null
    const mask=new Uint8Array(w*h)
    for(let y=0;y<h;y++)for(let x=0;x<w;x++)mask[y*w+x]=ink[(y0+y)*width+x0+x]!
    // Eğri dış çizgi harflere değse bile bağlantılı bileşene dönüşmesin.
    const eraseColumns:number[]=[]
    for(let x=0;x<w;x++)if(x<w*.12||x>w*.88) {
      let count=0;for(let y=0;y<h;y++)count+=mask[y*w+x]!
      if(count>h*.4)eraseColumns.push(x)
    }
    for(const x of eraseColumns)for(let y=0;y<h;y++)for(let dx=-2;dx<=2;dx++)if(x+dx>=0&&x+dx<w)mask[y*w+x+dx]=0
    for(let y=0;y<h;y++)if(y<h*.1||y>h*.9) {
      let count=0;for(let x=0;x<w;x++)count+=mask[y*w+x]!
      if(count>w*.5)for(let dy=-2;dy<=2;dy++)if(y+dy>=0&&y+dy<h)mask.fill(0,(y+dy)*w,(y+dy+1)*w)
    }
    const visited=new Uint8Array(w*h)
    type Component={pixels:number[];l:number;r:number;t:number;b:number}
    const components:Component[]=[], oversized:Component[]=[]
    for(let y=0;y<h;y++) for(let x=0;x<w;x++) {
      const first=y*w+x
      if(visited[first] || !mask[first])continue
      visited[first]=1
      const component:Component={pixels:[first],l:x,r:x,t:y,b:y}
      for(let cursor=0;cursor<component.pixels.length;cursor++) {
        const i=component.pixels[cursor]!, px=i%w, py=Math.floor(i/w)
        component.l=Math.min(component.l,px);component.r=Math.max(component.r,px);component.t=Math.min(component.t,py);component.b=Math.max(component.b,py)
        for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++) {
          const nx=px+dx,ny=py+dy,j=ny*w+nx
          if(nx<0||ny<0||nx>=w||ny>=h||visited[j]||!mask[j])continue
          visited[j]=1;component.pixels.push(j)
        }
      }
      // Çizgiler ve hücrenin altındaki küçük öğretmen isimleri kullanılmaz.
      const ch=component.b-component.t+1, cw=component.r-component.l+1
      if(ch<h*.3 && cw>=3 && ch>=Math.max(8,h*.09) && !(cw>w*.85&&ch<h*.12) && component.t<h*.85 && component.pixels.length>=6)components.push(component)
      else if(ch>=h*.3 && ch<h*.75 && cw/ch>.12 && component.t<h*.75 && component.pixels.length>=12)oversized.push(component)
    }
    // Farklı şablondaki büyük yazıyı sessizce boş hücre kabul etme.
    if(!components.length)components.push(...oversized)
    const maxHeight=Math.max(0,...components.map(c=>c.b-c.t+1))
    const letters=components.filter(c=>c.b-c.t+1>=Math.max(8,maxHeight*.48) && c.b<h*.97)
    if(!letters.length)return null
    // MATEM / ATİK, TÜRKÇ / E gibi satırları OCR'ye tek kelime olarak ver.
    const lines:{letters:Component[];l:number;r:number;t:number;b:number}[]=[]
    for(const c of [...letters].sort((a,b)=>a.t-b.t)) {
      const line=lines.find(line=>c.t<=line.b+maxHeight*.2 && c.b>=line.t)
      if(line){line.letters.push(c);line.l=Math.min(line.l,c.l);line.r=Math.max(line.r,c.r);line.t=Math.min(line.t,c.t);line.b=Math.max(line.b,c.b)}
      else lines.push({letters:[c],l:c.l,r:c.r,t:c.t,b:c.b})
    }
    const text=document.createElement('canvas'), padding=12
    const gap=Math.max(3,Math.round(maxHeight*.1))
    text.width=lines.reduce((sum,line)=>sum+line.r-line.l+1+gap,0)-gap+padding*2
    text.height=Math.max(...lines.map(line=>line.b-line.t+1))+padding*2
    const ctx=text.getContext('2d')!, data=ctx.createImageData(text.width,text.height)
    data.data.fill(255)
    let offset=padding
    for(const line of lines){
      for(const c of line.letters)for(const i of c.pixels){const j=((Math.floor(i/w)-line.b+text.height-padding-1)*text.width+(i%w)-line.l+offset)*4;data.data[j]=data.data[j+1]=data.data[j+2]=0}
      offset+=line.r-line.l+1+gap
    }
    ctx.putImageData(data,0,0)
    const l=Math.min(...letters.map(c=>c.l)),r=Math.max(...letters.map(c=>c.r)),t=Math.min(...letters.map(c=>c.t)),b=Math.max(...letters.map(c=>c.b))
    const block=document.createElement('canvas');block.width=r-l+1+padding*2;block.height=b-t+1+padding*2
    const blockCtx=block.getContext('2d')!,blockData=blockCtx.createImageData(block.width,block.height);blockData.data.fill(255)
    for(const c of letters)for(const i of c.pixels){const j=((Math.floor(i/w)-t+padding)*block.width+i%w-l+padding)*4;blockData.data[j]=blockData.data[j+1]=blockData.data[j+2]=0}
    blockCtx.putImageData(blockData,0,0)
    return {line:text,block}
  }
}
