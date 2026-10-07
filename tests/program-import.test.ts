import { beforeAll, afterAll, describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { service, signIn, signInAdminAal2 } from './helpers'
const svc = service()
let admin: SupabaseClient, cls = '', mat = '', tur = '', school = ''
const stamp = Date.now(), newName = `Test program ${stamp}`, rollbackName = `Test program geri ${stamp}`
beforeAll(async () => {
  admin = await signInAdminAal2()
  school = (await svc.from('schools').select('id').single()).data!.id
  const c = await svc.from('classes').insert({school_id:school,grade:7,section:'Z'}).select('id').single()
  expect(c.error).toBeNull(); cls=c.data!.id
  mat=(await svc.from('courses').select('id').eq('name','Matematik').single()).data!.id
  tur=(await svc.from('courses').select('id').eq('name','Türkçe').single()).data!.id
})
afterAll(async () => {
  if(cls) await svc.from('classes').delete().eq('id',cls)
  await svc.from('courses').delete().in('name',[newName,rollbackName])
})
const cell = (period:number,course_id:string|null=mat,new_key:string|null=null) => ({weekday:1,period,course_id,new_key,teacher_id:null})
describe('Program görseli: atomik kayıt ve yetki', () => {
  it('öğretmen ve veli programa yazamaz',async()=>{
    for(const who of ['matematik','veliElif'] as const) expect((await (await signIn(who)).rpc('import_timetable_image',{p_class:cls,p_cells:[cell(1)]})).error?.code).toBe('42501')
  })
  it('yeni ders ve hücre tek işlemde eklenir; aynı ders adı iki farklı kısaltmada çoğalmaz',async()=>{
    const r=await admin.rpc('import_timetable_image',{p_class:cls,p_cells:[cell(1,null,'AA'),cell(2,null,'BB')],p_courses:[{key:'AA',name:newName},{key:'BB',name:newName}]})
    expect(r.error).toBeNull(); expect(r.data).toBe(2)
    const co=(await svc.from('courses').select('id').eq('name',newName)).data!
    expect(co).toHaveLength(1)
    const rows=(await svc.from('timetable').select('course_id,subject').eq('class_id',cls)).data!
    expect(rows).toHaveLength(2); expect(rows.every(r=>r.course_id===co[0]!.id && r.subject===newName)).toBe(true)
  })
  it('koruma varsayılandır; yalnız açık onayla çakışan hücre değişir; diğer saatler korunur',async()=>{
    expect((await admin.rpc('import_timetable_image',{p_class:cls,p_cells:[cell(1,mat)]})).data).toBe(0)
    const r=await admin.rpc('import_timetable_image',{p_class:cls,p_cells:[cell(1,tur)],p_replace:true})
    expect(r.error).toBeNull(); expect(r.data).toBe(1)
    const rows=(await svc.from('timetable').select('period,course_id').eq('class_id',cls).order('period')).data!
    expect(rows).toHaveLength(2); expect(rows[0]!.course_id).toBe(tur); expect(rows[1]!.course_id).not.toBe(tur)
  })
  it('son hücre hatalıysa yeni ders dahil tüm işlem geri alınır',async()=>{
    const r=await admin.rpc('import_timetable_image',{p_class:cls,p_cells:[cell(3,null,'ZZ'),cell(4,'00000000-0000-4000-8000-999999999999')],p_courses:[{key:'ZZ',name:rollbackName}]})
    expect(r.error).not.toBeNull()
    expect((await svc.from('courses').select('id').eq('name',rollbackName)).data).toEqual([])
    expect((await svc.from('timetable').select('id').eq('class_id',cls).eq('period',3)).data).toEqual([])
  })
  it('tekrar eden hücre ve geçersiz gün reddedilir',async()=>{
    expect((await admin.rpc('import_timetable_image',{p_class:cls,p_cells:[cell(5),cell(5)]})).error).not.toBeNull()
    expect((await admin.rpc('import_timetable_image',{p_class:cls,p_cells:[{...cell(5),weekday:7}]})).error).not.toBeNull()
  })
})
