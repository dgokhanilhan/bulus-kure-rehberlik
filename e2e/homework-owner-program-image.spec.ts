import { test, expect } from '@playwright/test'
import { DEMO, login, loginAdmin, resetAdminMfa, service, shot } from './helpers'

const svc = service()
const ids: string[] = []
test.beforeAll(async () => {
  const cls = (await svc.from('classes').select('id,school_id').eq('name', '8/A').single()).data!
  const course = (await svc.from('courses').select('id').eq('name', 'Matematik').single()).data!
  const teacher = (await svc.from('profiles').select('id').eq('email', DEMO.matematik[0]).single()).data!
  const admin = (await svc.from('profiles').select('id').eq('email', DEMO.admin[0]).single()).data!
  for (const [teacher_id,title] of [[teacher.id,'OWNER Benim ödevim'],[admin.id,'OWNER Diğer öğretmenin ödevi']]) {
    const { data,error } = await svc.from('homework').insert({ school_id:cls.school_id, class_id:cls.id, course_id:course.id, teacher_id, title, due_on:'2099-01-01' }).select('id').single()
    expect(error).toBeNull(); ids.push(data!.id)
  }
  await resetAdminMfa()
})
test.afterAll(async () => { if (ids.length) await svc.from('homework').delete().in('id', ids) })

test('öğretmen kendi ödevini kontrol eder; aynı sınıf ve dersteki diğer ödev salt okunur', async ({ page }) => {
  await login(page, ...DEMO.matematik)
  await expect(page.getByRole('navigation',{name:'Ana menü'})).toBeVisible()
  await page.goto('/odevler')
  await expect(page.getByTestId('homework-card').filter({hasText:'OWNER Benim ödevim'})).toBeVisible()
  await expect(page.getByTestId('homework-card').filter({hasText:'OWNER Diğer öğretmenin ödevi'})).toHaveCount(0)
  await page.getByRole('button',{name:'Diğer verilen ödevler',exact:true}).click()
  await page.getByTestId('homework-card').filter({hasText:'OWNER Diğer öğretmenin ödevi'}).click()
  await expect(page.getByText('Bu ödevi yalnız görüntüleyebilirsin.',{exact:false})).toBeVisible()
  await expect(page.getByRole('button',{name:'Bekleyenlerin hepsi yaptı'})).toHaveCount(0)
  await expect(page.getByRole('button',{name:'Kaydet',exact:true})).toHaveCount(0)
  await expect(page.getByRole('button',{name:'Düzenle',exact:true})).toHaveCount(0)
  await expect(page.getByRole('textbox',{name:/notu$/})).toHaveCount(0)
  await page.reload()
  await expect(page.getByText('Bu ödevi yalnız görüntüleyebilirsin.',{exact:false})).toBeVisible()
  await shot(page,'odev-diger-salt-okunur')
  await page.goto(`/odevler?odev=${ids[0]}`)
  await expect(page.getByRole('button',{name:'Bekleyenlerin hepsi yaptı'})).toBeVisible()
})

test('gerçek yerel metin tanıma: görsel, kısaltma eşleme, yeni ders ve önizleme', async ({ page }) => {
  test.setTimeout(180_000)
  await loginAdmin(page)
  await page.goto('/yonetim?sekme=program')
  await page.getByLabel('Sınıf').selectOption({label:'8/A'})
  await page.getByRole('button',{name:'Görselden yükle',exact:true}).click()
  const modal = page.getByRole('dialog',{name:'8/A · Görselden ders programı yükle'})
  const png = await page.evaluate(() => {
    const c = document.createElement('canvas'); c.width=900; c.height=600
    const ctx=c.getContext('2d')!; ctx.fillStyle='white'; ctx.fillRect(0,0,900,600)
    const labels=['M','','ENG','MU','','PSK','REH','','SD','TURKCE','','','MATEMATIK','','']
    ctx.fillStyle='black'; ctx.font='bold 28px Arial'; ctx.fillText('12/A',20,25)
    for(let i=0;i<15;i++){ const x=40+(i%3)*(820/3), y=40+Math.floor(i/3)*100; ctx.strokeRect(x,y,820/3,100);ctx.fillText(labels[i]!,x+35,y+45) }
    return c.toDataURL('image/png').split(',')[1]!
  })
  await modal.getByLabel('Program görseli').setInputFiles({name:'program.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')})
  const img=modal.getByRole('img',{name:'Ders hücrelerinin köşelerini seç'})
  await expect(img).toBeVisible()
  const box=(await img.boundingBox())!
  // Kullanıcı soldan aşağı doğru seçse de tanıma etkinleşmeli.
  for(const [x,y] of [[40,40],[40,540],[860,540],[860,40]]) await img.click({position:{x:x!*box.width/900,y:y!*box.height/600}})
  await expect(modal.getByRole('button',{name:'Görseli tanı',exact:true})).toBeEnabled()
  await modal.getByLabel('Ders sütunu sayısı (boş saatler dahil)').fill('3')
  let release!: () => void
  const gate = new Promise<void>((resolve) => { release = resolve })
  let handled!: () => void
  const completed = new Promise<void>((resolve) => { handled = resolve })
  await page.route('**/program-ocr/worker.min.js', async (route) => { await gate; await route.continue(); handled() })
  const requested = page.waitForRequest('**/program-ocr/worker.min.js')
  await modal.getByRole('button',{name:'Görseli tanı',exact:true}).click()
  await requested
  await modal.getByRole('button',{name:'Okumayı iptal et',exact:true}).click()
  await expect(modal.getByRole('alert')).toHaveText('Okuma iptal edildi.')
  release()
  await completed
  await page.unroute('**/program-ocr/worker.min.js')
  await modal.getByRole('button',{name:'Görseli tanı',exact:true}).click()
  await expect(modal.getByRole('heading',{name:'Program önizlemesi'})).toBeVisible({timeout:120_000})
  await expect(modal.getByLabel('M karşılığı',{exact:true})).not.toHaveValue('')
  await expect(modal.getByLabel('MU karşılığı',{exact:true})).toHaveValue(await modal.getByLabel('M karşılığı',{exact:true}).inputValue())
  // Fotoğraf çizgileri boş hücreye harf gibi okunabilir; kullanıcı önizlemede düzeltebilir.
  for(const day of ['Pazartesi','Salı','Çarşamba','Perşembe','Cuma']) await modal.getByLabel(`${day} 2. ders metni`,{exact:true}).fill('')
  for(const day of ['Perşembe','Cuma']) await modal.getByLabel(`${day} 3. ders metni`,{exact:true}).fill('')
  // SD bazen SO okunabilir: hücre düzeltmesi aynı kodun eşleşmesini yeniler.
  await modal.getByLabel('Çarşamba 3. ders metni',{exact:true}).fill('SD')
  await expect(modal.getByLabel('SD karşılığı',{exact:true})).not.toHaveValue('')
  await modal.getByLabel('PSK karşılığı',{exact:true}).selectOption('new')
  await modal.getByLabel('Yeni ders adı',{exact:true}).fill('Program Test Dersi')
  for(const select of await modal.getByRole('combobox').all()) {
    if(await select.inputValue()==='') await select.selectOption({label:'Matematik'})
  }
  const save=modal.getByRole('button',{name:'Programı kaydet',exact:true})
  await expect(save).toBeDisabled()
  await modal.getByLabel(/Tamamen boş sütunları/).check()
  await expect(modal.getByText('Öğle arası',{exact:false}).first()).toBeVisible()
  await modal.getByLabel('Önizlemeyi kontrol ettim; 8/A sınıfına kaydet').check()
  await expect(save).toBeEnabled()
  // Migration onayından bağımsız UI testi: canlı/yerel program yazılmaz.
  let payload: Record<string,unknown> = {}
  await page.route('**/rest/v1/rpc/import_timetable_image',async (route)=>{ payload=route.request().postDataJSON(); await route.fulfill({json:8}) })
  await shot(page,'program-gorsel-onizleme')
  await save.click()
  await expect(modal).not.toBeVisible()
  expect(payload.p_cells).toHaveLength(8)
  expect((payload.p_cells as {period:number}[]).every((c) => c.period <= 2)).toBe(true)
  expect(payload.p_courses).toEqual([{key:'PSK',name:'Program Test Dersi'}])
  expect(payload.p_replace).toBe(false)
})

test('fotoğraf dokusu ve eğri çizgiler ders adlarına karışmaz', async ({page}) => {
  test.setTimeout(180_000)
  await resetAdminMfa()
  await loginAdmin(page)
  await page.goto('/yonetim?sekme=program')
  await page.getByLabel('Sınıf').selectOption({label:'8/A'})
  await page.getByRole('button',{name:'Görselden yükle',exact:true}).click()
  const modal=page.getByRole('dialog',{name:'8/A · Görselden ders programı yükle'})
  await modal.getByLabel('Program görseli').setInputFiles('e2e/fixtures/program-photo-lessons.png')
  const img=modal.getByRole('img',{name:'Ders hücrelerinin köşelerini seç'})
  await expect(img).toBeVisible()
  const box=(await img.boundingBox())!
  for(const [x,y] of [[1,1],[box.width-1,1],[box.width-1,box.height-1],[1,box.height-1]])await img.click({position:{x:x!,y:y!}})
  await modal.getByRole('button',{name:'Görseli tanı',exact:true}).click()
  await expect(modal.getByRole('heading',{name:'Program önizlemesi'})).toBeVisible({timeout:120_000})
  const expected=[
    ['MATEMATIK','MATEMATIK','FEN','FEN','','SOSYAL','SOSYAL','M','M','ENG'],
    ['MATEMATIK','MATEMATIK','SOSYAL','SOSYAL','','TURKCE','TURKCE','ENG','FEN','SOSYAL'],
    ['FEN','FEN','TURKCE','TURKCE','','DIN','DIN','ENG','MU','PC'],
    ['MATEMATIK','MATEMATIK','ENG','ENG','','TURKCE','TURKCE','MU','MU','REH'],
    ['SOSYAL','PSK','FEN','FEN','','TURKCE','TURKCE','BEDEN','BEDEN',''],
  ]
  for(const [dayIndex,day] of ['Pazartesi','Salı','Çarşamba','Perşembe','Cuma'].entries())for(let p=0;p<10;p++) {
    await expect(modal.getByLabel(`${day} ${p+1}. ders metni`,{exact:true})).toHaveValue(expected[dayIndex]![p]!)
  }
  await expect(modal.getByLabel('DIN karşılığı',{exact:true})).not.toHaveValue('')
  await expect(modal.getByLabel('PC karşılığı',{exact:true})).toHaveValue('')
  await expect(modal.getByLabel('PSK karşılığı',{exact:true})).toHaveValue('')
  await expect(modal.getByRole('img',{name:'Salı 6. dersin görseldeki yazısı',exact:true})).toBeVisible()
  await expect(modal.getByRole('button',{name:'Programı kaydet',exact:true})).toBeDisabled()
  await shot(page,'program-gercek-fotograf')
})
