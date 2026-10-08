import {it,expect} from 'vitest'
import {genelDataset} from './genelVeriSeti'
import {repeats,wrongOutcomes} from './analiz'
import {reportData,aiPayload} from './rapor'
import {validatePayload} from '../../supabase/functions/_shared/rapor-ai'
const exam=(id:string)=>({id,name:id,exam_date:'2026-10-05',exam_type:'GENEL' as const,yks_part:null,publisher:null,exam_template_id:'t'})
const ds=genelDataset({exams:[exam('first'),exam('second')],templates:[{id:'t',sections:[{key:'SOS',subject_code:'SOS',label:'Sosyal Bilgiler',question_count:2,sort:1,optional_group:null,outcome_grades:[6]}]}],profile:null,
 results:['first','second'].map(exam_id=>({exam_id,student_id:'s',score:250,subjects:{SOS:{d:0,y:2,b:0,net:-0.67}},answers:{SOS:'BB'}})),
 items:[{exam_id:'first',section_key:'SOS',q_no:1,correct_answer:'A',learning_outcome_id:'official',match_method:'CODE_EXACT',learning_outcomes:{code:'S.6.1',title:'Resmî hedef',outcome_type:'KAZANIM',curriculum_versions:{curriculum_type:'TYMM'}}},{exam_id:'first',section_key:'SOS',q_no:2,correct_answer:'A',learning_outcome_id:'pdf',match_method:'MANUAL',learning_outcomes:{code:'S.6.1',title:'PDF hedefi',outcome_type:'OGRENME_CIKTISI',curriculum_versions:{curriculum_type:'PDF'}}}]})
it('aynı gün iki denemeden isteneni seçer; kaynakları aynı kodda karıştırmaz, puan/net korunur',()=>{
 const r=reportData(ds,'s','first')!
 expect(r).not.toBeNull();expect(r.cur.exam_id).toBe('first');expect(r.cur.score).toBe(250)
 expect(r.lastWrong.map(w=>w.source)).toEqual(['official','pdf'])
 expect(wrongOutcomes(ds,ds.results[0]!).wrong).toHaveLength(2)
 expect(repeats(ds,'s')).toHaveLength(0)
 expect(repeats(ds,'s',undefined,undefined,1)).toHaveLength(2)
 const payload=aiPayload(r)
 expect(validatePayload(payload,new Set(['Resmî hedef','PDF hedefi']),new Set(['Sosyal Bilgiler']))).toBeNull()
 expect(payload.buDenemedeYanlisKonular[1]?.kaynak).toBe('pdf')
 expect(validatePayload(payload,new Set(['Resmî hedef']),new Set(['Sosyal Bilgiler']))).toContain('bilinmeyen konu')
})