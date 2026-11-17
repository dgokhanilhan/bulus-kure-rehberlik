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
