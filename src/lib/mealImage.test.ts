import {expect,it} from 'vitest'
import {bandDay,dateBands,gridDates,mealReadings,monthDays,type MealWord} from './mealImage'
const word=(text:string,x:number,y:number,confidence=90):MealWord=>({text,confidence,bbox:{x0:x,y0:y,x1:x+50,y1:y+15}})
it('ay günlerini hafta içi ve artık yıl sınırlarıyla üretir',()=>{
 expect(monthDays('2026-10')).toHaveLength(22)
 expect(monthDays('2024-02')).toContain('2024-02-29')
 expect(monthDays('2026-13')).toEqual([])
})
it('aynı satırdaki farklı sütunları ve sonraki haftanın menüsünü karıştırmaz',()=>{
 const rows=mealReadings([word('1.10.2026',650,100),word('2.10.2026',850,100),word('Mercimek',620,125),word('çorbası',680,125),word('Kapuska',640,155),word('Sebze',850,125),word('çorbası',910,125),word('8.10.2026',650,240),word('Nohut',650,270)],'2026-10',1000,400)
 expect(rows.map(r=>[r.day,r.items])).toEqual([['2026-10-01','Mercimek çorbası\nKapuska'],['2026-10-02','Sebze çorbası'],['2026-10-08','Nohut']])
})
it('başka ay, geçersiz tarih ve hafta sonunu eklemez; düşük güvenli tarihi tahmin etmez',()=>{
 expect(mealReadings([word('31.9.2026',20,10),word('3.10.2026',30,10),word('1.10.2026',50,10,10)],'2026-10',1000,400)).toEqual([])
})
it('tatil bilgisini korur; okunmayan menü boş ve kontrol gerektirir',()=>{
 const r=mealReadings([word('29.10.2026',650,10),word('RESMİ',650,35),word('TATİL',650,60),word('30.10.2026',850,10)],'2026-10',1000,200)
 expect(r[0]!.items).toBe('RESMİ\nTATİL');expect(r[1]!.review).toBe(true)
})
it('tekrar eden tarih sessizce üzerine yazılmaz',()=>{
 expect(()=>mealReadings([word('1.10.2026',650,10),word('1.10.2026',650,100)],'2026-10',1000,200)).toThrow(/tekrar/)
})
it('gri tarih şeritlerini bulur; kalın başlık şeridi ve yazı satırları şerit sayılmaz',()=>{
 const w=200,h=200,g=new Array(w*h).fill(230)
 const boya=(y0:number,y1:number,x0:number,x1:number,v:number)=>{for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++)g[y*w+x]=v}
 boya(5,45,10,190,150) // başlık
 boya(60,72,10,190,150);boya(120,132,10,190,150)
 boya(80,84,20,60,20) // menü yazısı
 expect(dateBands(g,w,h).map(b=>[b.y0,b.y1,b.x0,b.x1])).toEqual([[60,71,10,189],[120,131,10,189]])
})
it('şerit okuması: ayraç kaçsa da gün bulunur, hafta günü ve ay tutmazsa alınmaz',()=>{
 expect(bandDay('2.11.2026','2026-11',0)).toBe('2026-11-02')
 expect(bandDay('23.11.2026\n','2026-11',0)).toBe('2026-11-23')
 expect(bandDay('2112026','2026-11',0)).toBe('2026-11-02')
 expect(bandDay('3.11.2026','2026-11',0)).toBe('')
 expect(bandDay('2.10.2026','2026-11',0)).toBe('')
 expect(bandDay('','2026-11',0)).toBe('')
})
it('şerit = hafta: iki okunan tarih uyuşursa diğer günler takvimden gelir, tek tarih yetmez, ay dışına taşmaz',()=>{
 const reads=[{band:1,col:0,day:'2026-11-02'},{band:2,col:2,day:'2026-11-11'}]
 const r=gridDates(reads,6,'2026-11')
 expect(r).toHaveLength(21)
 expect(r.find(x=>x.day==='2026-11-30')).toEqual({band:5,col:0,day:'2026-11-30',read:false})
 expect(r.filter(x=>x.read).map(x=>x.day)).toEqual(['2026-11-02','2026-11-11'])
 expect(gridDates([reads[0]!],6,'2026-11')).toEqual([{...reads[0]!,read:true}])
 expect(gridDates([],6,'2026-11')).toEqual([])
})
