import {expect,it} from 'vitest'
import {mealReadings,monthDays,type MealWord} from './mealImage'
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
