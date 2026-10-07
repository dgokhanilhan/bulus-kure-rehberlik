import {test,expect} from '@playwright/test'
import {loginAdmin,resetAdminMfa} from './helpers'
test('PDF hedefi ekle: tek, deneme ve tümü; metinsiz satır ve açık onay',async({page})=>{
  await resetAdminMfa();await loginAdmin(page)
  const exam='11111111-1111-4111-8111-111111111111'
  const rows=[1,2].map(q_no=>({exam_id:exam,exam_name:'PDF hedef test',grade:12,exam_type:'AYT',section_key:'FEL1',subject_code:'FEL',q_no,raw_code:'AYT.PSKL.10.36',raw_text:q_no===1?'Öğrenmeyi etkileyen etkenleri irdeler.':null,outcome_grade:null}))
  let calls=0
  await page.route('**/rest/v1/**',async route=>{
    const path=new URL(route.request().url()).pathname
    const json=(data:unknown)=>route.fulfill({contentType:'application/json',body:JSON.stringify(data)})
    if(path.endsWith('/curriculum_versions'))return json([])
    if(path.endsWith('/unresolved_outcomes'))return json(rows)
    if(path.endsWith('/rpc/add_pdf_outcomes')){
      const body=route.request().postDataJSON();calls++
      expect(body.p_items).toHaveLength(1);expect(body.p_items[0]).toMatchObject({exam_id:exam,q_no:1,grade:10,outcome_type:'OGRENME_CIKTISI'})
      return json([{key:`${exam}:FEL1:1`,status:'created'}])
    }
    return route.continue()
  })
  await page.goto('/yonetim?sekme=denemeler')
  await page.getByRole('group',{name:'Deneme Tanıma Merkezi bölümü'}).getByRole('button',{name:'Eşleşmeyen hedefler',exact:true}).click()
  await page.getByRole('button',{name:'FEL1 1. hedefi ekle'}).click()
  await expect(page.getByRole('dialog',{name:'PDF hedefini ekle'})).toBeVisible()
  await page.getByRole('button',{name:'Kapat',exact:true}).last().click()
  await page.getByRole('button',{name:'Bu denemede tümünü ekle',exact:true}).click()
  await expect(page.getByRole('dialog',{name:'PDF hedeflerini toplu ekle'})).toBeVisible()
  await page.getByRole('button',{name:'Kapat',exact:true}).last().click()
  await page.getByRole('button',{name:'Tümünü ekle',exact:true}).click()
  const modal=page.getByRole('dialog',{name:'PDF hedeflerini toplu ekle'})
  await expect(modal.getByRole('checkbox',{name:'PDF hedef test FEL1 2. soruya hedef ekle'})).toBeDisabled()
  const save=modal.getByRole('button',{name:'Seçilen 1 soruya hedef ekle'})
  await expect(save).toBeDisabled();expect(calls).toBe(0)
  await modal.getByLabel('Eklenecek hedef türü').selectOption('OGRENME_CIKTISI')
  await modal.getByLabel('PDF metinlerini, konu sınıflarını ve hedef türünü kontrol ettim; seçilenleri ekle ve sorulara bağla').check()
  await save.click()
  await expect(modal.getByText('Eklendi ve bağlandı',{exact:true})).toBeVisible()
  expect(calls).toBe(1)
})
