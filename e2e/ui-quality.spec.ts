import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { createClient } from '@supabase/supabase-js'
import { DEMO, login, service } from './helpers'

// Sentetik veriler; canlı öğrenci veya PDF içeriği kullanılmaz.
const svc = service(), school = '00000000-0000-4000-8000-000000000001'
const stamp = Date.now(), pass = 'UiDeneme123!'
const accounts = ['veli','ogrenci'] as const
const users: Record<string,string> = {}
let sid = '', cls = '', eid = ''
test.beforeAll(async () => {
  if (!/^http:\/\/(127\.0\.0\.1|localhost)/.test(process.env.VITE_SUPABASE_URL!)) throw new Error('Yalnız yerel test')
  const c = await svc.from('classes').insert({school_id:school,grade:12,section:'U',track:'SAY'}).select('id').single()
  if(c.error) throw c.error
  cls=c.data.id
  const s=await svc.from('students').insert({school_id:school,class_id:cls,full_name:'Deniz Tasarım',school_no:'UI-01'}).select('id').single()
  if(s.error) throw s.error
  sid=s.data.id
  for(const role of accounts){
    const u=await svc.auth.admin.createUser({email:`e2e-ui-${role}-${stamp}@ornek.com`,password:pass,email_confirm:true,user_metadata:{school:'bulus-kure',consent_version:'v1',full_name:role==='veli'?'Örnek Veli':'Deniz Tasarım',role,declared:{childName:'Deniz Tasarım',childClass:'12/U · SAY',className:'12/U · SAY',relation:'Anne'}}})
    if(u.error) throw u.error
    users[role]=u.data.user.id
    const p=await svc.from('profiles').update({status:'approved',...(role==='ogrenci'?{student_id:sid}:{})}).eq('id',u.data.user.id)
    if(p.error) throw p.error
    if(role==='veli') {const l=await svc.from('parent_links').insert({parent_id:u.data.user.id,student_id:sid,relation:'Anne'});if(l.error)throw l.error}
  }
  const tpl=await svc.from('exam_templates').select('id').eq('builtin',true).like('name','%AYT%').single()
  const client=createClient(process.env.VITE_SUPABASE_URL!,process.env.VITE_SUPABASE_ANON_KEY!,{auth:{persistSession:false,autoRefreshToken:false}})
  const auth=await client.auth.signInWithPassword({email:DEMO.rehber[0],password:DEMO.rehber[1]});if(auth.error)throw auth.error
  const data=await client.rpc('import_exam',{p:{name:'Tasarım Denemesi · Uzun Başlıklı Gelişim ve Değerlendirme',grade:12,exam_type:'YKS',yks_part:'AYT',exam_date:'2026-10-14',template_id:tpl.data!.id,status:'yayinda',notify:false,
    items:Array.from({length:40},(_,i)=>({section_key:'MAT',q_no:i+1,correct_answer:'A',raw_code:null,raw_text:'Örnek hedef'})),
    results:[{student_id:sid,score:null,sections:{MAT:{d:10,y:20,b:10,net:5}},answers:{MAT:'A'.repeat(10)+'b'.repeat(20)+'_'.repeat(10)},source:{scores:{SAY:312.985,EA:263.056,SOZ:327.917,DIL:245.125}}}]}})
  if(data.error)throw data.error
  eid=data.data.exam_id
  const targets=await svc.from('learning_outcomes').select('id').eq('subject_code','MAT').limit(40)
  if(targets.error||targets.data.length<40)throw new Error('Örnek katalog bulunamadı')
  for(let i=0;i<40;i++){const q=await svc.from('exam_items').update({learning_outcome_id:targets.data[i]!.id,match_method:'MANUAL'}).eq('exam_id',eid).eq('q_no',i+1);if(q.error)throw q.error}
})
test.afterAll(async()=>{
  for(const id of Object.values(users))await svc.auth.admin.deleteUser(id)
  if(eid)await svc.from('exams').delete().eq('id',eid)
  if(sid)await svc.from('students').delete().eq('id',sid)
  if(cls)await svc.from('classes').delete().eq('id',cls)
})
async function fits(page:Page){
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBe(true)
}
for(const size of [{name:'desktop',width:1440,height:1000},{name:'ipad',width:820,height:1180},{name:'mobile',width:390,height:844},{name:'ipad-landscape-dark',width:1180,height:820}]){
  test(`${size.name}: veli AYT puanları, uzun hedefler, filtreler ve öğrenci görünümü`,async({page}, testInfo)=>{
    if(size.name.endsWith('dark')) await page.addInitScript(uid=>{
      localStorage.setItem('bk-theme:'+uid,'dark')
      localStorage.setItem('bk-text:'+uid,'buyuk')
    },users.veli)
    await page.setViewportSize(size)
    await page.emulateMedia({reducedMotion:'reduce'})
    await login(page,`e2e-ui-veli-${stamp}@ornek.com`,pass)
    await expect(page.getByRole('navigation',{name:'Ana menü'})).toBeVisible()
    await page.goto('/ozet')
    await page.getByRole('button',{name:'AYT',exact:true}).click()
    await expect(page.locator('.score-cards')).toContainText('312,985')
    await expect(page.locator('.score-card')).toHaveCount(4)
    await fits(page)
    const analysis=page.getByTestId('kazanim-analizi')
    await expect(analysis).toBeVisible()
    await page.evaluate(async()=>{await document.fonts.ready})
    await page.screenshot({path:`e2e-artifacts/ui-${testInfo.project.name}-${size.name}-summary.png`,fullPage:true})
    await analysis.locator('summary').click()
    await expect(analysis.getByRole('row')).toHaveCount(31)
    await analysis.getByLabel('Hedeflerde ara').fill('bulunmayanhedef')
    await expect(analysis.getByRole('row')).toHaveCount(1)
    await analysis.getByLabel('Hedeflerde ara').fill('')
    await analysis.getByLabel('Yalnız yanlış veya boş yapılan hedefler').uncheck()
    await expect(analysis.getByRole('row')).toHaveCount(41)
    if(size.name==='mobile') {
      expect(await analysis.locator('.outcome-table').evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true)
      expect(await page.locator('.result-table').evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true)
    }
    await fits(page)
    await page.screenshot({path:`e2e-artifacts/ui-${testInfo.project.name}-${size.name}-analysis.png`,fullPage:true})
    const ax=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa']).analyze()
    expect(ax.violations.filter(v=>v.impact==='critical'||v.impact==='serious').map(v=>v.id)).toEqual([])
  })
  test(`${size.name}: öğretmen ayrıntısı uzun konularda tabloyu sıkıştırmaz`,async({page}, testInfo)=>{
    if(size.name.endsWith('dark')) await page.emulateMedia({colorScheme:'dark'})
    await page.setViewportSize(size);await page.emulateMedia({reducedMotion:'reduce'})
    await login(page,...DEMO.rehber)
    await expect(page.getByRole('navigation',{name:'Ana menü'})).toBeVisible()
    await page.goto(`/ogrenciler/${sid}`)
    await page.getByRole('button',{name:'AYT',exact:true}).click()
    await expect(page.locator('.score-cards')).toContainText('312,985')
    await page.getByRole('button',{name:'Tasarım Denemesi · Uzun Başlıklı Gelişim ve Değerlendirme detayı'}).click()
    const modal=page.getByRole('dialog')
    await expect(modal.getByRole('cell',{name:'20',exact:true})).toBeVisible()
    const height=await modal.locator('.result-table').evaluate(el=>el.getBoundingClientRect().height)
    await modal.locator('.analysis-disclosure>summary').click()
    await modal.locator('.outcome-group>summary').click()
    expect(await modal.locator('.result-table').evaluate(el=>el.getBoundingClientRect().height)).toBe(height)
    expect(await modal.locator('.modal-b').evaluate(el=>el.scrollHeight>el.clientHeight)).toBe(true)
    await fits(page)
    await page.screenshot({path:`e2e-artifacts/ui-${testInfo.project.name}-${size.name}-detail.png`,fullPage:false})
    await page.keyboard.press('Escape');await expect(modal).toHaveCount(0)
  })
}
test('öğrenci özetinde aynı alan puanları ve sonuçlar görünür',async({page})=>{
  await login(page,`e2e-ui-ogrenci-${stamp}@ornek.com`,pass)
  await expect(page.getByRole('navigation',{name:'Ana menü'})).toBeVisible()
  await page.goto('/ozet');await page.getByRole('button',{name:'AYT',exact:true}).click()
  await expect(page.locator('.score-cards')).toContainText('327,917')
  await expect(page.getByTestId('bolum-satiri').filter({hasText:'AYT Matematik'})).toContainText('20')
})




test('nöbet formu ve ana sayfa kartları masaüstü, iPad ve telefonda taşmaz',async({page},testInfo)=>{
  await page.emulateMedia({reducedMotion:'reduce'})
  await login(page,...DEMO.matematik)
  await expect(page.getByRole('navigation',{name:'Ana menü'})).toBeVisible()
  for(const size of [{name:'desktop',width:1440,height:1000},{name:'ipad',width:820,height:1180},{name:'mobile',width:390,height:844}]){
    await page.setViewportSize(size)
    await page.goto('/panel')
    await expect(page.locator('.pcard').first()).toBeVisible()
    await fits(page)
    await page.screenshot({path:`e2e-artifacts/ui-${testInfo.project.name}-${size.name}-home.png`,fullPage:true})
    await page.goto('/nobet-takip')
    await expect(page.getByRole('heading',{name:'Haftalık nöbetlerim'})).toBeVisible()
    await expect(page.getByLabel('Nöbet günü')).toBeVisible()
    await fits(page)
    await page.screenshot({path:`e2e-artifacts/ui-${testInfo.project.name}-${size.name}-duty.png`,fullPage:true})
    const ax=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa']).analyze()
    expect(ax.violations.filter(v=>v.impact==='critical'||v.impact==='serious').map(v=>v.id)).toEqual([])
  }
})
