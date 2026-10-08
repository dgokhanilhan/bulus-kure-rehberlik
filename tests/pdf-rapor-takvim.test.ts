import {beforeAll,afterAll,it,expect} from 'vitest'
import {service,signIn,signInAdminAal2,ELIF} from './helpers'
import type {SupabaseClient} from '@supabase/supabase-js'
const svc=service(),stamp=Date.now()
let admin:SupabaseClient,school='',a='',b='',six='',event='',version='',outcome=''
beforeAll(async()=>{
 admin=await signInAdminAal2();school=(await admin.rpc('my_school')).data!
 const cls=(await svc.from('classes').select('id,name').eq('school_id',school)).data!
 a=cls.find(c=>c.name==='8/A')!.id;b=cls.find(c=>c.name==='8/B')!.id;six=cls.find(c=>c.name==='6/A')!.id
 const v=await svc.from('curriculum_versions').insert({school_id:school,authority:'Yayıncı',name:'Yönetim PDF testi',curriculum_type:'PDF',grade:6,subject_code:'SOS',year_from:2000,outcome_kind:'KAZANIM',source_title:'PDF',source_url:'',retrieved_at:'2026-10-08'}).select('id').single();expect(v.error).toBeNull();version=v.data!.id
 outcome=(await svc.from('learning_outcomes').insert({curriculum_version_id:version,grade:6,subject_code:'SOS',code:`TEST.${stamp}`,title:'Özgün PDF hedefi',outcome_type:'KAZANIM'}).select('id').single()).data!.id
})
afterAll(async()=>{if(event)await svc.from('calendar_events').delete().eq('id',event);if(outcome)await svc.from('learning_outcomes').delete().eq('id',outcome);if(version)await svc.from('curriculum_versions').delete().eq('id',version)})
it('çoklu sınıf görünürlüğü ve bildirimler seçili sınıflarla sınırlı; öğretmen başka sınıf ekleyemez',async()=>{
 const user=(await admin.auth.getUser()).data.user!
 const row={school_id:school,created_by:user.id,title:`Takvim sınıf testi ${stamp}`,type:'deneme',starts_on:'2026-10-09',ends_on:'2026-10-09',target:'sinif',class_id:a,class_ids:[a],audience:['veli','ogrenci','ogretmen']}
 const insert=await admin.from('calendar_events').insert(row).select('id').single();expect(insert.error).toBeNull();event=insert.data!.id
 const parentA=await signIn('veliElif'),parentB=await signIn('veliKerem')
 expect((await parentA.from('calendar_events').select('id').eq('id',event)).data).toHaveLength(1)
 expect((await parentB.from('calendar_events').select('id').eq('id',event)).data).toEqual([])
 expect((await parentA.from('notifications').select('id').contains('link',{event})).data).toHaveLength(1)
 expect((await parentB.from('notifications').select('id').contains('link',{event})).data).toEqual([])
 expect((await admin.from('calendar_events').update({class_ids:[a,b]}).eq('id',event)).error).toBeNull()
 expect((await parentB.from('calendar_events').select('id').eq('id',event)).data).toHaveLength(1)
 const teacher=await signIn('matematik'),teacherId=(await teacher.auth.getUser()).data.user!.id
 expect((await teacher.from('calendar_events').insert({...row,created_by:teacherId,class_ids:[a,six]})).error).not.toBeNull()
})
it('PDF hedefini yalnız yönetici düzenler; resmî katalog korunur',async()=>{
 const args={p_id:outcome,p_code:`NEW.${stamp}`,p_title:'Düzenlenmiş okul hedefi',p_kind:'OGRENME_CIKTISI'}
 expect((await (await signIn('rehber')).rpc('update_pdf_outcome',args)).error?.code).toBe('42501')
 expect((await admin.rpc('update_pdf_outcome',args)).error).toBeNull()
 expect((await svc.from('learning_outcomes').select('title,outcome_type').eq('id',outcome).single()).data).toEqual({title:args.p_title,outcome_type:args.p_kind})
 const official=(await svc.from('learning_outcomes').select('id,curriculum_versions!inner(school_id)').is('curriculum_versions.school_id',null).limit(1).single()).data!.id
 expect((await admin.rpc('update_pdf_outcome',{...args,p_id:official})).error?.code).toBe('42501')
})
it('okul dersi ve PDF hedefiyle yapay zekâ raporu üretir; serbest/yabancı konu metni reddedilir',async()=>{
 const payload={denemeSayisi:1,sonDeneme:'Deneme 1',puan:null,toplamNet:0,dersler:[{ders:'Sosyal Bilgiler',soru:10,dogru:0,yanlis:0,bos:10,net:0,oncekiNet:null}],gecmis:[],guvenilirTekrarEdenHatalar:[],buDenemedeYanlisKonular:[{ders:'Sosyal Bilgiler',konu:'Düzenlenmiş okul hedefi',kaynak:'pdf'}],konuBilgisiOkunamadi:false}
 const result=await admin.functions.invoke('ai-veli-raporu',{body:{student_id:ELIF,payload}})
 expect(result.error).toBeNull();expect(result.data.report.genel).toBeTypeOf('string')
 const denied=await admin.functions.invoke('ai-veli-raporu',{body:{student_id:ELIF,payload:{...payload,buDenemedeYanlisKonular:[{ders:'Sosyal Bilgiler',konu:'Katalogda olmayan serbest kişisel metin',kaynak:'pdf'}]}}})
 expect((denied.error as {context:Response})?.context.status).toBe(400)
})
