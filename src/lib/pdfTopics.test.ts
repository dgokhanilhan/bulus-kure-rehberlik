import {it,expect} from 'vitest'
import {validPdfTopics,pdfTopicKey} from './pdfTopics'
import {withCatalogItems} from './genelVeriSeti'
import {konuStatus,wrongOutcomes,SUBJECTS} from './analiz'
import {reportData} from './rapor'
const topics=[{section:'MAT',title:'Üslü ifadeler',n:10,d:6,y:1,b:3},{section:'MAT',title:'Karekök',n:10,d:6,y:1,b:3}]
const subjects={MAT:{d:12,y:2,b:6,net:11.33}}
it('ders toplamıyla uyuşmayan, mükerrer ve eksik konu tablolarını reddeder',()=>{
 expect(validPdfTopics(topics,subjects)).toEqual(topics)
 expect(validPdfTopics(topics.slice(0,1),subjects)).toEqual([])
 expect(validPdfTopics([topics[0],topics[0]],subjects)).toEqual([])
 expect(validPdfTopics([{...topics[0],b:-1},topics[1]],subjects)).toEqual([])
})
it('konuları soru eşlemesi uydurmadan LGS detayına ve rapora taşır; puan/net değişmez',()=>{
 const r={exam_id:'e',student_id:'s',score:403.075,subjects,answers:{MAT:'ABC'},outcomes_ok:false,source:{topics}}
 const ds=withCatalogItems({subjects:SUBJECTS,exams:[{id:'e',name:'Test',exam_date:'2026-11-17',publisher:null}],outcomes:[],questionsByExam:new Map(),results:[r]},[])
 expect(ds.results[0]!.subjects).toEqual(subjects)
 expect(ds.results[0]!.score).toBe(403.075)
 expect(ds.questionsByExam.size).toBe(0)
 expect(wrongOutcomes(ds,ds.results[0]!).wrong).toHaveLength(2)
 expect(ds.outcomes.every(o=>o.isTopic && o.source==='pdf')).toBe(true)
 expect(reportData(ds,'s','e')!.kzMissing).toBe(false)
 expect(reportData(ds,'s','e')!.lastWrong.map(t=>t.title)).toEqual(['Üslü ifadeler','Karekök'])
})
it('yalnız boş konusu yanlış diye raporlanmaz; diğer öğrenciye sızmaz',()=>{
 const t={...topics[0]!,y:0,b:4}
 const r={exam_id:'e',student_id:'s',score:null,subjects,answers:null,outcomes_ok:false,topics:[t]}
 expect(konuStatus(r,[],'MAT',pdfTopicKey(t))).toBe('b')
 expect(konuStatus({...r,topics:[]},[],'MAT',pdfTopicKey(t))).toBe('n')
})
it('Akbim konu sütunlarını okur, tutarsız bir dersi aktarmaz',async()=>{
 // @ts-expect-error motor JS
 const {akbimTopics}=await import('../../public/engine/genel.mjs')
 const p={lines:[{x:120,y:390,t:'KONU ADI'},...['SS','D','Y','%'].map((t,i)=>({x:250+i*12,y:390,t})),{x:30,y:400,t:'MATEMATİK'},
 {x:22,y:410,t:'ÜSLÜ İFADELER'},...['20','12','2','60'].map((t,i)=>({x:252+i*12,y:410,t}))]}
 const sections=[{raw:'MATEMATİK',label:'MATEMATİK',n:20,d:12,y:2,b:6}]
 expect(akbimTopics(p,sections)).toEqual([{section:'MATEMATİK',title:'ÜSLÜ İFADELER',n:20,d:12,y:2,b:6}])
 expect(akbimTopics(p,[{...sections[0],y:3}])).toEqual([])
})

