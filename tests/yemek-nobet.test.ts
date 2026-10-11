import {beforeAll,afterAll,it,expect} from 'vitest'
import type {SupabaseClient} from '@supabase/supabase-js'
import {anon,service,signIn,signInAdminAal2} from './helpers'

const svc=service(),SCHOOL='00000000-0000-4000-8000-000000000001'
let admin:SupabaseClient,teacher:SupabaseClient,other:SupabaseClient,teacherId='',rid=''
const args=()=>({p_id:null,p_weekday:1,p_period:'before_noon',p_location:'kantin',p_delete:false})
beforeAll(async()=>{admin=await signInAdminAal2();teacher=await signIn('matematik');other=await signIn('fen');teacherId=(await teacher.auth.getUser()).data.user!.id;await svc.from('teacher_duties').delete().eq('teacher_id',teacherId)})
afterAll(async()=>{await svc.from('teacher_duties').delete().eq('teacher_id',teacherId);await svc.from('notifications').delete().eq('user_id',teacherId).eq('type','nobet');await svc.from('school_settings').delete().eq('school_id',SCHOOL).eq('key','bildirim.nobet');await svc.from('meals').delete().eq('school_id',SCHOOL).gte('day','2090-01-01').lte('day','2090-01-31')})
it('anonim/veli/öğrenci/onaysız hesap nöbet oluşturamaz; doğrudan yazım kapalı',async()=>{
 for(const c of [anon(),await signIn('veliElif'),await signIn('elif'),await signIn('bekleyenMert')])expect((await c.rpc('save_teacher_duty',args())).error).not.toBeNull()
 expect((await teacher.from('teacher_duties').insert({school_id:SCHOOL,teacher_id:teacherId,weekday:1,period:'before_noon',location:'kantin'})).error).not.toBeNull()
})
it('öğretmen kendi nöbetini kaydeder; diğer öğretmen ve veli okuyamaz/değiştiremez',async()=>{
 const r=await teacher.rpc('save_teacher_duty',args());expect(r.error).toBeNull();rid=r.data!
 expect((await teacher.from('teacher_duties').select('id')).data).toContainEqual({id:rid})
 for(const c of [other,await signIn('veliElif')]){expect((await c.from('teacher_duties').select('id').eq('id',rid)).data).toEqual([]);expect((await c.rpc('save_teacher_duty',{...args(),p_id:rid})).error).not.toBeNull()}
})
it('hafta sonu, geçersiz yer/zaman ve çakışan gün-zaman reddedilir',async()=>{
 for(const x of [{p_weekday:6},{p_location:'bilinmeyen'},{p_period:'gece'},{}])expect((await teacher.rpc('save_teacher_duty',{...args(),...x})).error).not.toBeNull()
})
it('hatırlatma kullanıcı RPC erişimine kapalı; gününde yalnız bir kez bildirim oluşur',async()=>{
 expect((await teacher.rpc('teacher_duty_reminders')).error).not.toBeNull();expect((await anon().rpc('teacher_duty_reminders')).error).not.toBeNull()
 expect((await teacher.rpc('teacher_duty_reminders_on',{today:'2090-01-02'})).error).not.toBeNull()
 expect((await svc.rpc('teacher_duty_reminders_on',{today:'2090-01-02'})).error).toBeNull();expect((await svc.rpc('teacher_duty_reminders_on',{today:'2090-01-02'})).error).toBeNull()
 const rows=await svc.from('notifications').select('text,link').eq('user_id',teacherId).eq('type','nobet');expect(rows.data).toHaveLength(1);expect(rows.data![0]!.link.page).toBe('nobet-takip');expect(rows.data![0]!.text).toContain('Kantin')
})
it('öğretmen nöbetini kaldırır ve sonradan göremez',async()=>{expect((await teacher.rpc('save_teacher_duty',{...args(),p_id:rid,p_delete:true})).error).toBeNull();expect((await teacher.from('teacher_duties').select('id').eq('id',rid)).data).toEqual([])})
it('nöbet bildirimi okul ayarından kapatılabilir; nöbet dışındaki gün bildirim oluşmaz',async()=>{
 await svc.from('notifications').delete().eq('user_id',teacherId).eq('type','nobet')
 expect((await teacher.rpc('save_teacher_duty',{...args(),p_weekday:2})).error).toBeNull()
 expect((await svc.rpc('teacher_duty_reminders_on',{today:'2090-01-02'})).error).toBeNull()
 expect((await svc.from('notifications').select('id').eq('user_id',teacherId).eq('type','nobet')).data).toEqual([])
 expect((await svc.from('school_settings').upsert({school_id:SCHOOL,key:'bildirim.nobet',value:false},{onConflict:'school_id,key'})).error).toBeNull()
 expect((await svc.rpc('teacher_duty_reminders_on',{today:'2090-01-03'})).error).toBeNull()
 expect((await svc.from('notifications').select('id').eq('user_id',teacherId).eq('type','nobet')).data).toEqual([])
})
it('aylık menüyü yalnız MFA yönetici kaydeder; tarih ve tekrar sınırları denetlenir',async()=>{
 const p={p_month:'2090-01-01',p_days:[{day:'2090-01-02',items:'Mercimek çorbası\nPilav'}]}
 for(const c of [anon(),teacher,await signIn('veliElif'),await signIn('admin')])expect((await c.rpc('save_monthly_lunch',p)).error).not.toBeNull()
 expect((await admin.rpc('save_monthly_lunch',p)).error).toBeNull()
 for(const p_days of [[{day:'2090-02-01',items:'a'}],[{day:'2090-01-07',items:'a'}],[...p.p_days,...p.p_days]])expect((await admin.rpc('save_monthly_lunch',{...p,p_days})).error).not.toBeNull()
})
it('hatalı ikinci gün ilk günü de kaydetmez; eski kahvaltı korunur; boş öğle silinir',async()=>{
 await svc.from('meals').insert({school_id:SCHOOL,day:'2090-01-02',meal:'kahvalti',items:'Eski kayıt'})
 expect((await admin.rpc('save_monthly_lunch',{p_month:'2090-01-01',p_days:[{day:'2090-01-03',items:'Yeni'},{day:'2090-02-01',items:'Hatalı'}]})).error).not.toBeNull()
 expect((await svc.from('meals').select('id').eq('day','2090-01-03').eq('school_id',SCHOOL)).data).toEqual([])
 expect((await admin.rpc('save_monthly_lunch',{p_month:'2090-01-01',p_days:[{day:'2090-01-02',items:''}]})).error).toBeNull()
 expect((await svc.from('meals').select('meal,items').eq('day','2090-01-02').eq('school_id',SCHOOL)).data).toEqual([{meal:'kahvalti',items:'Eski kayıt'}])
})
