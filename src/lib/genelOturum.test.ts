import { it, expect } from 'vitest'
import { buildGenelReview, genelPending, sessionGroups, toImportPayload, type GenelPack, type ImportMeta } from './genelImport'
import type { ExamTemplate } from './denemeGenel'
const keys = ['TUR','INK','DIN','ING','MAT','FEN']
const tpl: ExamTemplate = {id:'t',name:'LGS',grade:8,exam_types:['LGS'],strict_counts:true,wrong_per_correct:3,sections:keys.map((key,i)=>({key,subject_code:key,label:key,question_count:10,sort:i,optional_group:null,outcome_grades:null}))}
const row = (page:number, numeric:boolean) => ({
  page, pages:[page], student:{name:'Örnek Öğrenci',number:'1',class:'8/A',classGrade:8},
  exam:{title:'Örnek'}, score:300, items:[], warnings:[],
  sections:keys.map((label,i)=>{ const d = (i>=4)===numeric ? 8 : 0; return {label,n:10,d,y:0,b:10-d,net:d} }),
})
const meta: ImportMeta = {name:'Örnek',exam_date:'2026-11-17',grade:8,exam_type:'LGS',yks_part:null,exam_code:null,publisher_id:null,template_id:'t',target_class_ids:[],status:'taslak',notify:false,allow_grade_mismatch:false}
const review = (numeric:boolean) => {
 const pack: GenelPack = {engine:'test',sha256:'123',filename:'test.pdf',detection:{family:'AKBIM',format:null,confidence:1,evidence:[]},records:[row(2,false),row(3,numeric)],failedPages:[]}
 const rv = buildGenelReview(pack,tpl,[])
 for (const r of rv.rows) r.choice={kind:'student',id:'s'}
 return rv
}
it('birleştirme açık onay ister; tek sonuçta iki oturumun neti ve kaynak sayfaları korunur',()=>{
 const rv=review(true)
 expect(genelPending(rv)).toBe(1)
 expect(()=>toImportPayload(rv,meta)).toThrow()
 rv.approvedSessionPairs=[sessionGroups(rv)[0]!.key]
 expect(genelPending(rv)).toBe(0)
 const [r,...others]=toImportPayload(rv,meta).results
 expect(others).toEqual([])
 expect(r).toMatchObject({student_id:'s',score:null,source:{pages:[2,3],merged_sessions:true}})
 expect(Object.values(r!.sections).map(v=>v && 'net' in v && v.net)).toEqual([8,8,8,8,8,8])
})
it('aynı türden iki oturum birleştirilemez',()=>{
 const rv=review(false)
 rv.approvedSessionPairs=[sessionGroups(rv)[0]!.key]
 expect(genelPending(rv)).toBe(1)
 expect(()=>toImportPayload(rv,meta)).toThrow()
})
it('aynı isimli farklı okul kayıtlarını birleştirmez',()=>{
 const rv=review(true)
 rv.rows[1]!.choice={kind:'student',id:'other'}
 expect(sessionGroups(rv)).toEqual([])
 expect(toImportPayload(rv,meta).results).toHaveLength(2)
})
it('numarası ve ismi farklı iki form aynı öğrenciye seçilince önerilir',()=>{
 const rv=review(true)
 rv.rows[1]!.read={...rv.rows[1]!.read,name:'Örnek Ögrenci',number:'999'}
 expect(sessionGroups(rv)[0]!.merged).toBeDefined()
 expect(sessionGroups(rv)[0]!.approved).toBe(false)
})
it('çakışan ders cevabı varsa sayısal/sözel diye birleştirmez',()=>{
 const rv=review(true)
 rv.rows[0]!.record.items.push({label:'MAT',section:'MAT',booklet:'A',q:1,testQ:1,key:'A',answer:'A',mark:'+',rawCode:null,rawText:null})
 expect(sessionGroups(rv)[0]!.merged).toBeUndefined()
})
it('üç kayıt, farklı sınav ve tekrarlanan kaynak sayfasını reddeder',()=>{
 const three=review(true)
 three.rows.push({...three.rows[1]!,key:'third'})
 expect(sessionGroups(three)[0]!.merged).toBeUndefined()
 const exam=review(true)
 exam.rows[1]!.record.exam.title='Başka sınav'
 expect(sessionGroups(exam)[0]!.merged).toBeUndefined()
 const pages=review(true)
 pages.rows[1]!.record.pages=[2]
 expect(sessionGroups(pages)[0]!.merged).toBeUndefined()
})
it('başka öğrenciye geçildiğinde eski onay geçersizdir',()=>{
 const rv=review(true)
 rv.approvedSessionPairs=[sessionGroups(rv)[0]!.key]
 for(const r of rv.rows) r.choice={kind:'student',id:'other'}
 expect(sessionGroups(rv)[0]!.approved).toBe(false)
 expect(()=>toImportPayload(rv,meta)).toThrow()
})
it('tek normal kayıt puanıyla aynen aktarılır',()=>{
 const rv=review(true)
 rv.rows=rv.rows.slice(0,1)
 expect(toImportPayload(rv,meta).results[0]!.score).toBe(300)
 expect(toImportPayload(rv,meta).results[0]!.source).not.toHaveProperty('merged_sessions')
})
it('iki oturumun konu özetlerini korur; katılmadığı oturumun boşlarını taşımaz',()=>{
 const rv=review(true)
 for(const r of rv.rows) r.record.topics=keys.map(section=>{
  const s=r.sections[section] as {d:number;y:number;b:number}
  return {section,title:'Konu '+section,n:10,d:s.d,y:s.y,b:s.b}
 })
 rv.approvedSessionPairs=[sessionGroups(rv)[0]!.key]
 const p=toImportPayload(rv,meta)
 expect(p.results).toHaveLength(1)
 expect(p.results[0]!.source.topics).toHaveLength(6)
 expect(p.results[0]!.source.topics!.every(t=>t.d===8 && t.b===2)).toBe(true)
})
