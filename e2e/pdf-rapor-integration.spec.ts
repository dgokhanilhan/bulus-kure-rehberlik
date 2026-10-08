import {test,expect} from '@playwright/test'
import {createClient} from '@supabase/supabase-js'
import {service,login,loginAdmin,resetAdminMfa,DEMO} from './helpers'
import {readFileSync} from 'node:fs'
const svc=service(),ids:Record<string,string>={},stamp=Date.now()
const password='PdfTest123!'
test.beforeAll(async()=>{
 const school=(await svc.from('schools').select('id').single()).data!.id
 const cls=(await svc.from('classes').select('id').eq('name','6/A').single()).data!.id
 ids.s=(await svc.from('students').insert({school_id:school,full_name:'PDF Rapor Test Öğrencisi',class_id:cls}).select('id').single()).data!.id
 ids.v=(await svc.from('curriculum_versions').insert({school_id:school,authority:'Yayıncı',name:'PDF rapor testi',curriculum_type:'PDF',grade:6,subject_code:'MAT',year_from:2000,outcome_kind:'KAZANIM',source_title:'PDF',source_url:'',retrieved_at:'2026-10-08'}).select('id').single()).data!.id
 ids.o=(await svc.from('learning_outcomes').insert({curriculum_version_id:ids.v,grade:6,subject_code:'MAT',code:`PDF.${stamp}`,title:'PDF’den eklenen özgün çalışma hedefi',outcome_type:'OGRENME_CIKTISI'}).select('id').single()).data!.id
 for(const role of ['veli','ogrenci'] as const){
  const result=await svc.auth.admin.createUser({email:`e2e-pdf-${role}-${stamp}@ornek.com`,password,email_confirm:true,user_metadata:{school:'bulus-kure',consent_version:'v1',role,full_name:`PDF ${role}`}})
  expect(result.error).toBeNull();ids[role]=result.data.user!.id
  expect((await svc.from('profiles').update({status:'approved',...(role==='ogrenci'?{student_id:ids.s}:{})}).eq('id',ids[role])).error).toBeNull()
 }
 expect((await svc.from('parent_links').insert({parent_id:ids.veli,student_id:ids.s,relation:'Anne'})).error).toBeNull()
 const tpl=(await svc.from('exam_templates').select('id').eq('builtin',true).like('name','6. Sınıf%').single()).data!.id
 const c=createClient(process.env.VITE_SUPABASE_URL!,process.env.VITE_SUPABASE_ANON_KEY!,{auth:{persistSession:false}})
 await c.auth.signInWithPassword({email:DEMO.rehber[0],password:DEMO.rehber[1]})
 for(const key of ['first','second']){
  const result=await c.rpc('import_exam',{p:{name:`PDF RAPOR ${key} ${stamp}`,exam_date:'2026-10-05',grade:6,exam_type:'GENEL',template_id:tpl,status:'yayinda',notify:false,items:Array.from({length:15},(_,i)=>({section_key:'MAT',q_no:i+1,correct_answer:i===0?null:'A',raw_code:null,raw_text:null})),results:[{student_id:ids.s,score:250,sections:{MAT:{d:1,y:1,b:13,net:0.67}},answers:{MAT:'bA'+'_'.repeat(13)},source:{}}]}})
  expect(result.error).toBeNull();ids[key]=result.data.exam_id
 }
 expect((await svc.from('exam_items').update({learning_outcome_id:ids.o,curriculum_version_id:ids.v,outcome_grade:6,match_method:'MANUAL',match_confidence:1}).eq('exam_id',ids.first).eq('q_no',1)).error).toBeNull()
})
test.afterAll(async()=>{
 for(const role of ['veli','ogrenci'])if(ids[role])await svc.auth.admin.deleteUser(ids[role])
 if(ids.s)await svc.from('tasks').delete().eq('student_id',ids.s)
 if(ids.first)await svc.from('exams').delete().in('id',[ids.first,ids.second])
 if(ids.s)await svc.from('students').delete().eq('id',ids.s)
 if(ids.o)await svc.from('learning_outcomes').delete().eq('id',ids.o)
 if(ids.v)await svc.from('curriculum_versions').delete().eq('id',ids.v)
})

test('veli ve öğrenci kendi PDF hedefini ayrı kaynak etiketiyle ve yanlış sayısıyla görür',async({page})=>{
 for(const role of ['veli','ogrenci']){
  await page.context().clearCookies();await page.goto('/');await page.evaluate(()=>localStorage.clear())
  await login(page,`e2e-pdf-${role}-${stamp}@ornek.com`,password)
  await expect(page.getByRole('navigation',{name:'Ana menü'})).toBeVisible()
  await page.goto('/ozet')
  await page.getByRole('button',{name:`PDF RAPOR first ${stamp} detayı`,exact:true}).click()
  const row=page.getByTestId('kazanim-analizi').getByRole('row').filter({hasText:`PDF.${stamp}`})
  await expect(row).toContainText('Okulun PDF’den eklediği hedef')
  await expect(row.getByRole('cell').nth(3)).toHaveText('1')
 }
})
test('tek denemelik PDF eksiği görev, veli/öğretmen raporu ve PDF’de gösterilir; aynı gün raporu açılır',async({page})=>{
 await login(page,...DEMO.rehber);await expect(page.getByRole('navigation',{name:'Ana menü'})).toBeVisible();await page.goto(`/ogrenciler/${ids.s}`)
 await page.getByRole('tab',{name:'Konular',exact:true}).click()
 const row=page.getByRole('row').filter({hasText:'PDF’den eklenen özgün çalışma hedefi'})
 await expect(row).toContainText('1 denemede yanlış');await expect(row).toContainText('Okulun PDF’den eklediği hedef')
 await row.getByRole('button',{name:'Görev ata',exact:true}).click();await page.getByRole('button',{name:'Görevi ata',exact:true}).click()
 await expect(page.getByText('Görev atandı',{exact:true})).toBeVisible()
 expect((await svc.from('tasks').select('learning_outcome_id').eq('student_id',ids.s).single()).data?.learning_outcome_id).toBe(ids.o)
 await page.getByRole('tab',{name:'Denemeler',exact:true}).click()
 const first=page.getByRole('row').filter({hasText:`PDF RAPOR first ${stamp}`})
 await first.getByRole('button',{name:'Veli raporu',exact:true}).click()
 const report=page.getByRole('dialog',{name:'Rapor',exact:true})
 await expect(report.getByRole('heading',{name:'Okulun PDF’den eklediği çalışma hedefleri',exact:true})).toBeVisible()
 await expect(report.locator('[data-testid="report-paper"]')).toContainText('PDF’den eklenen özgün çalışma hedefi')
 const download=page.waitForEvent('download');await report.getByRole('button',{name:'PDF indir',exact:true}).click();const file=await download;expect(file.suggestedFilename()).toContain('Veli-Raporu')
 const path='e2e-artifacts/pdf-hedef-veli-raporu.pdf';await file.saveAs(path)
 // @ts-expect-error — mevcut saf JS PDF motoru
 const {default:mupdf}=await import('../public/engine/mupdf/mupdf.js')
 const doc=mupdf.Document.openDocument(new Uint8Array(readFileSync(path)),'application/pdf')
 const text=Array.from({length:doc.countPages()},(_,i)=>doc.loadPage(i).toStructuredText().asText()).join('\n')
 expect(text).toContain('PDF’den eklenen özgün çalışma hedefi');expect(text).toContain('OKULUN PDF’DEN EKLEDİĞİ ÇALIŞMA HEDEFLERİ')
 await report.getByRole('button',{name:'Kapat',exact:true}).click()
 await first.getByRole('button',{name:'Öğretmen raporu',exact:true}).click()
 await expect(report.locator('[data-testid="report-paper"]')).toContainText('PDF’den eklenen özgün çalışma hedefi')
 await report.getByRole('button',{name:'Kapat',exact:true}).click()
})

test('yönetici PDF hedefini panelden düzenler ve takvimde tüm 8. sınıfları seçer',async({page})=>{
 await resetAdminMfa();await loginAdmin(page)
 await page.goto('/yonetim?sekme=denemeler')
 await page.getByRole('group',{name:'Deneme Tanıma Merkezi bölümü'}).getByRole('button',{name:'Öğrenme hedefleri',exact:true}).click()
 await page.locator('#katGrade').selectOption('6')
 await page.locator('#katSubj').selectOption('MAT')
 await page.getByLabel('Yalnız okulun PDF’den eklediği hedefleri göster').check()
 await page.getByLabel('Kod ya da metin').fill(`PDF.${stamp}`)
 const row=page.getByTestId('kazanim-satiri').filter({hasText:`PDF.${stamp}`})
 await row.getByRole('button',{name:'Düzenle',exact:true}).click()
 const edit=page.getByRole('dialog',{name:'PDF hedefini düzenle'})
 await edit.getByLabel('Hedef metni').fill('Panelden düzenlenen okul PDF hedefi')
 await edit.getByRole('button',{name:'Kaydet',exact:true}).click()
 await expect(edit).not.toBeVisible();await expect(row).toContainText('Panelden düzenlenen okul PDF hedefi')
 expect((await svc.from('learning_outcomes').select('title').eq('id',ids.o).single()).data?.title).toBe('Panelden düzenlenen okul PDF hedefi')
 await page.goto('/takvim');await page.getByRole('button',{name:'Etkinlik ekle',exact:true}).click()
 const event=page.getByRole('dialog',{name:'Etkinlik ekle',exact:true})
 await event.getByLabel('Kimin için').selectOption('sinif')
 await event.getByRole('button',{name:'8. sınıfları seç',exact:true}).click()
 await expect(event.getByRole('checkbox',{name:'8/A',exact:true})).toBeChecked()
 await expect(event.getByRole('checkbox',{name:'8/B',exact:true})).toBeChecked()
 await expect(event.getByRole('checkbox',{name:'6/A',exact:true})).not.toBeChecked()
 await event.getByRole('button',{name:'Vazgeç',exact:true}).click()
})
