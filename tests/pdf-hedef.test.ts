import {beforeAll,afterAll,it,expect} from 'vitest'
import type {SupabaseClient} from '@supabase/supabase-js'
import {service,signInAdminAal2,signIn,ELIF} from './helpers'
const svc=service(),stamp=Date.now()
let admin:SupabaseClient,school='',publisher='',exam='',otherSchool='',otherExam='',before:unknown
beforeAll(async()=>{
  admin=await signInAdminAal2()
  school=(await admin.rpc('my_school')).data!
  const pub=await svc.from('publishers').insert({school_id:school,name:`PDF test ${stamp}`}).select('id').single();expect(pub.error).toBeNull();publisher=pub.data!.id
  const e=await svc.from('exams').insert({school_id:school,name:`PDF test ${stamp}`,exam_date:'2026-10-07',grade:8,exam_type:'LGS',publisher_id:publisher}).select('id').single();expect(e.error).toBeNull();exam=e.data!.id
  expect((await svc.from('exam_items').insert([1,2,3,4].map(q_no=>({exam_id:exam,section_key:'MAT',q_no,subject_code:'MAT',correct_answer:'B',raw_code:q_no===4?'PDF.8.2':'PDF.8.1',raw_text:q_no===3?null:'Bir problemde gerekçeli çözüm oluşturur.'})))).error).toBeNull()
  const sample=(await svc.from('exam_results').select('subjects,score').limit(1).single()).data!
  expect((await svc.from('exam_results').insert({exam_id:exam,student_id:ELIF,subjects:sample.subjects,score:sample.score})).error).toBeNull()
  before=(await svc.from('exam_results').select('subjects,score,total_net,computed_score').eq('exam_id',exam)).data
  otherSchool=(await svc.from('schools').insert({name:`PDF other ${stamp}`}).select('id').single()).data!.id
  otherExam=(await svc.from('exams').insert({school_id:otherSchool,name:'Başka okul',exam_date:'2026-10-07'}).select('id').single()).data!.id
})
afterAll(async()=>{
  if(exam)await svc.from('exams').delete().eq('id',exam)
  const versions=(await svc.from('curriculum_versions').select('id').eq('publisher_id',publisher)).data??[]
  if(versions.length){await svc.from('learning_outcomes').delete().in('curriculum_version_id',versions.map(v=>v.id));await svc.from('curriculum_versions').delete().in('id',versions.map(v=>v.id))}
  if(publisher)await svc.from('publishers').delete().eq('id',publisher)
  if(otherExam)await svc.from('exams').delete().eq('id',otherExam)
  if(otherSchool){await svc.from('gallery_categories').delete().eq('school_id',otherSchool);await svc.from('courses').delete().eq('school_id',otherSchool);await svc.from('academic_years').delete().eq('school_id',otherSchool);expect((await svc.from('schools').delete().eq('id',otherSchool)).error).toBeNull()}
})
const item=(q_no:number,over:Record<string,unknown>={})=>({exam_id:exam,section_key:'MAT',q_no,grade:8,outcome_type:'KAZANIM',...over})
it('öğretmen, rehber ve veli yeni hedef oluşturamaz',async()=>{
  for(const role of ['matematik','rehber','veliElif'] as const)expect((await (await signIn(role)).rpc('add_pdf_outcomes',{p_items:[item(1)]})).error?.code).toBe('42501')
})
it('aynı yayın hedefini tek oluşturur, soruları bağlar, puan ve net değişmez',async()=>{
  const result=await admin.rpc('add_pdf_outcomes',{p_items:[item(1),item(2)]});expect(result.error).toBeNull()
  expect(result.data.map((r:{status:string})=>r.status)).toEqual(['created','reused'])
  const rows=(await svc.from('exam_items').select('learning_outcome_id,correct_answer').eq('exam_id',exam).in('q_no',[1,2])).data!
  expect(rows[0]!.learning_outcome_id).toBe(rows[1]!.learning_outcome_id);expect(rows.every(r=>r.correct_answer==='B')).toBe(true)
  expect((await svc.from('exam_results').select('subjects,score,total_net,computed_score').eq('exam_id',exam)).data).toEqual(before)
  expect((await admin.rpc('add_pdf_outcomes',{p_items:[item(1)]})).data[0].status).toBe('skipped')
  const v=(await svc.from('curriculum_versions').select('*').eq('publisher_id',publisher).single()).data!
  expect(v.curriculum_type).toBe('PDF');expect(v.school_id).toBe(school)
  const resolveArgs={p_subject:'MAT',p_vers:[v.id],p_code:'PDF.8.1',p_text:null,p_school:school,p_publisher:publisher}
  expect((await admin.rpc('resolve_outcome_in',resolveArgs)).data?.[0]?.learning_outcome_id).toBe(rows[0]!.learning_outcome_id)
  expect((await admin.rpc('resolve_outcome_in',{...resolveArgs,p_publisher:null})).data).toEqual([])
  expect((await admin.rpc('curriculum_for',{p_grade:8,p_subject:'MAT',p_year:2026})).data).not.toBe(v.id)
})
it('metinsiz, yanlış sınıf ve başka okul satırı eklenmez; başarısız satır yarım hedef bırakmaz',async()=>{
  const result=await admin.rpc('add_pdf_outcomes',{p_items:[item(3),item(4,{grade:9}),item(1,{exam_id:otherExam})]})
  expect(result.error).toBeNull();expect(result.data.every((r:{status:string})=>r.status==='error')).toBe(true)
  const versions=(await svc.from('curriculum_versions').select('id').eq('publisher_id',publisher)).data!
  expect((await svc.from('learning_outcomes').select('id').in('curriculum_version_id',versions.map(v=>v.id))).data).toHaveLength(1)
})
it('farklı okul PDF hedefi okuyamaz ve çözüm motoru verilen yabancı sürümü kullanamaz',async()=>{
  const foreign=(await svc.from('curriculum_versions').insert({school_id:otherSchool,authority:'Yayıncı',name:'Diğer PDF',curriculum_type:'PDF',grade:8,subject_code:'MAT',year_from:2000,outcome_kind:'KAZANIM',source_title:'PDF',source_url:'',retrieved_at:'2026-10-07'}).select('id').single()).data!
  const target=(await svc.from('learning_outcomes').insert({curriculum_version_id:foreign.id,grade:8,subject_code:'MAT',code:'FOREIGN.8.1',title:'Yabancı hedef',outcome_type:'KAZANIM'}).select('id').single()).data!
  try {
    expect((await admin.from('learning_outcomes').select('id').eq('id',target.id)).data).toEqual([])
    expect((await admin.rpc('resolve_outcome_in',{p_subject:'MAT',p_vers:[foreign.id],p_code:'FOREIGN.8.1',p_text:null,p_school:otherSchool})).data).toEqual([])
    expect((await admin.rpc('set_item_outcome',{p_exam:exam,p_section:'MAT',p_q:4,p_outcome:target.id,p_alias:false})).error).not.toBeNull()
  }finally{await svc.from('learning_outcomes').delete().eq('id',target.id);await svc.from('curriculum_versions').delete().eq('id',foreign.id)}
})
