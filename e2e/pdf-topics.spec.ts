import {test,expect} from '@playwright/test'
import {DEMO,ELIF,login,openStudent,service} from './helpers'
const svc=service(),name=`Konu analizi test ${Date.now()}`
let eid=''
test.beforeAll(async()=>{
 const e=await svc.from('exams').insert({school_id:'00000000-0000-4000-8000-000000000001',name,exam_type:'LGS',grade:8,exam_date:'2026-11-17',status:'yayinda',published_at:new Date().toISOString()}).select('id').single()
 if(e.error)throw e.error;eid=e.data.id
 const r=await svc.from('exam_results').insert({exam_id:eid,student_id:ELIF,score:403.075,total_net:11.33,success_pct:56.65,subjects:{MAT:{d:12,y:2,b:6,net:11.33}},outcomes_ok:false,source:{topics:[{section:'MAT',title:'Üslü ifadeler',n:10,d:6,y:2,b:2},{section:'MAT',title:'Karekök',n:10,d:6,y:0,b:4}]}})
 if(r.error)throw r.error
})
test.afterAll(async()=>{if(eid)await svc.from('exams').delete().eq('id',eid)})
for(const size of [{width:1440,height:1000},{width:820,height:1180},{width:390,height:844}])test(`konu D/Y/B görünümü ${size.width}`,async({page})=>{
 await page.setViewportSize(size)
 await login(page,...DEMO.rehber)
 await openStudent(page,ELIF)
 await page.getByRole('button',{name:`${name} detayı`}).click()
 const dlg=page.getByRole('dialog').filter({hasText:name})
 await expect(dlg).toContainText('Yanlış ve boş yapılan konular')
 await dlg.getByText('Yanlış ve boş yapılan konular',{exact:true}).click()
 await dlg.locator('summary').filter({hasText:'Matematik'}).click()
 await expect(dlg).toContainText('Üslü ifadeler')
 await expect(dlg).toContainText('10 soru · 6 doğru · 2 yanlış · 2 boş')
 await expect(dlg).toContainText('10 soru · 6 doğru · 0 yanlış · 4 boş')
 await expect(dlg).not.toContainText('Güvenilir konu verisinde yanlış yok')
 await expect(dlg).toContainText('403,075')
 await page.screenshot({path:`test-results/topics-${size.width}.png`})
})

