import {test,expect} from '@playwright/test'
import {DEMO,login,loginAdmin,resetAdminMfa,menu,service,shot} from './helpers'

test('gerçek aylık görsel düzenlenebilir önizlemeye gelir; aktarım veritabanına yazmaz',async({page})=>{
 test.setTimeout(180_000)

 await resetAdminMfa();await loginAdmin(page)
 await page.goto('/yonetim?sekme=yemek')
 await page.getByLabel('Menü ayı').fill('2026-10')
 const before=await service().from('meals').select('id,day,items').gte('day','2026-10-01').lte('day','2026-10-31').order('id')
 await page.getByRole('button',{name:'Görselden yükle'}).click()
 const dlg=page.getByRole('dialog',{name:'Aylık yemek listesini görselden yükle'})
 await dlg.getByLabel('Yemek listesi görseli').setInputFiles('e2e/fixtures/yemek/ekim-2026.jpeg')
 await dlg.getByRole('button',{name:'Görseli tanı'}).click()
 await expect(dlg.getByText(/gün okundu/)).toBeVisible({timeout:120_000})
 const boxes=dlg.getByRole('textbox')
 expect(await boxes.count()).toBeGreaterThanOrEqual(21)
 await expect(boxes.first()).toHaveValue(/MERCİMEK|MERCIMEK/i)
 await expect(dlg.getByRole('textbox',{name:/29 Ekim/})).toHaveValue(/TATİL|TATIL/i)
 await shot(page,'aylik-yemek-onizleme')
 await dlg.getByRole('button',{name:'Kontrol ettiğim menüyü forma aktar'}).click()
 await expect(page.getByRole('button',{name:'Ayı kaydet'})).toBeEnabled()
 const after=await service().from('meals').select('id,day,items').gte('day','2026-10-01').lte('day','2026-10-31').order('id')
 expect(after.data).toEqual(before.data)
})

test('öğretmen nöbet ekler, düzenler ve kaldırır; veli menüsünde nöbet yok',async({page})=>{
 const svc=service();const p=await svc.from('profiles').select('id').eq('email',DEMO.matematik[0]).single()
 await svc.from('teacher_duties').delete().eq('teacher_id',p.data!.id)
 try{
 await login(page,...DEMO.matematik)
 await menu(page).filter({hasText:'Nöbet Takip'}).click()
 await page.getByLabel('Nöbet günü').selectOption('3')
 await page.getByLabel('Nöbet zamanı').selectOption('after_noon')
 await page.getByLabel('Nöbet yeri').selectOption('orta_78')
 await page.getByRole('button',{name:'Nöbeti kaydet'}).click()
 await expect(page.getByText('Çarşamba · Öğleden sonra')).toBeVisible()
 await page.getByRole('button',{name:'Düzenle',exact:true}).click()
 await page.getByLabel('Nöbet yeri').selectOption('arka_bahce')
 await page.getByRole('button',{name:'Nöbeti kaydet'}).click()
 await expect(page.getByRole('paragraph').filter({hasText:/^Arka bahçe$/})).toBeVisible()
 await page.setViewportSize({width:390,height:844});await shot(page,'nobet-mobil')
 page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Nöbeti kaldır'}).click()
 await expect(page.getByText('Henüz nöbet kaydın yok.')).toBeVisible()
 }finally{await svc.from('teacher_duties').delete().eq('teacher_id',p.data!.id)}
})

test('veli için nöbet sekmesi kapalı',async({page})=>{
 await login(page,...DEMO.veli)
 await expect(menu(page).filter({hasText:'Nöbet Takip'})).toHaveCount(0)
 await page.goto('/nobet-takip')
 await expect(page.getByRole('heading',{name:'Nöbet Takip',exact:true})).toHaveCount(0)
})
