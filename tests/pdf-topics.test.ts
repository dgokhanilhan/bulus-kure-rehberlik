import {beforeAll,afterAll,it,expect} from 'vitest'
import {service,signInAdminAal2,signIn,anon,ELIF} from './helpers'
import type {SupabaseClient} from '@supabase/supabase-js'
const svc=service(),stamp=Date.now(),subjects={MAT:{d:12,y:2,b:6,net:11.33}}
let admin:SupabaseClient,exam='',tpl=''
const topics=[{section:'MAT',title:'Üslü ifadeler',n:20,d:12,y:2,b:6}]
const payload=()=>({sha256:`topic-test-${stamp}`,template_id:tpl,results:[{student_id:ELIF,sections:subjects,source:{topics}}]})
beforeAll(async()=>{
 admin=await signInAdminAal2()
 const school=(await admin.rpc('my_school')).data
 const t=await svc.from('exam_templates').insert({school_id:school,name:`Konu test ${stamp}`,grade:8,exam_types:['LGS'],wrong_per_correct:3}).select('id').single()
 expect(t.error).toBeNull();tpl=t.data!.id
 const e=await svc.from('exams').insert({school_id:school,name:`Konu test ${stamp}`,grade:8,exam_type:'LGS',exam_date:'2026-11-17',exam_template_id:tpl,source_sha256:`topic-test-${stamp}`}).select('id').single()
 expect(e.error).toBeNull();exam=e.data!.id
 expect((await svc.from('exam_results').insert({exam_id:exam,student_id:ELIF,score:403.075,subjects,total_net:11.33,success_pct:56.65,answers:{MAT:'ABC'},source:{booklets:{MAT:'A'}}})).error).toBeNull()
})
afterAll(async()=>{if(exam)await svc.from('exams').delete().eq('id',exam);if(tpl)await svc.from('exam_templates').delete().eq('id',tpl)})
it('veli/öğretmen/anon ve MFA doğrulanmamış yönetici değiştiremez',async()=>{
 for(const c of [anon(),await signIn('veliElif'),await signIn('matematik'),await signIn('admin')])expect((await c.rpc('repair_exam_topics',{p_exam:exam,p:payload()})).error).not.toBeNull()
})
it('yanlış PDF, toplam ve mükerrer öğrenci reddedilir; işlem atomiktir',async()=>{
 const before=(await svc.from('exam_results').select('*').eq('exam_id',exam)).data
 for(const p of [{...payload(),sha256:'other'},{...payload(),results:[{...payload().results[0],source:{topics:[{...topics[0],d:11,b:7}]}}]},{...payload(),results:[payload().results[0],payload().results[0]]}])expect((await admin.rpc('repair_exam_topics',{p_exam:exam,p})).error).not.toBeNull()
 expect((await svc.from('exam_results').select('*').eq('exam_id',exam)).data).toEqual(before)
})
it('yalnız konu kaynağı güncellenir; puan/net/cevaplar ve kimlik aynı kalır',async()=>{
 const before=(await svc.from('exam_results').select('*').eq('exam_id',exam).single()).data!
 const fixed=await admin.rpc('repair_exam_topics',{p_exam:exam,p:payload()})
 expect(fixed.error).toBeNull();expect(fixed.data.topics).toBe(1)
 const after=(await svc.from('exam_results').select('*').eq('exam_id',exam).single()).data!
 for(const key of ['exam_id','student_id','score','total_net','subjects','answers','outcomes_ok'])expect(after[key]).toEqual(before[key])
 expect(after.source).toMatchObject({booklets:{MAT:'A'},topics})
 expect((await admin.rpc('repair_exam_topics',{p_exam:exam,p:payload()})).error).toBeNull()
})
