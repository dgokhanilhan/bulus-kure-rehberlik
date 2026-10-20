import {changeOwnPassword} from '../src/lib/accountSecurity'
import { beforeAll, afterAll, it, expect } from 'vitest'
import { service, signInAdminAal2, signIn, anon, ELIF } from './helpers'
import type { SupabaseClient } from '@supabase/supabase-js'
import { generateSync } from 'otplib'
const svc = service(),
  stamp = Date.now()
let admin: SupabaseClient,
  school = '',
  tpl = '',
  exam = '',
  cls = '',
  uid = '',
  publisher = ''
const sections = { MAT: { d: 1, y: 1, b: 0, net: 0.75 } }
const payload = () => ({
  sha256: 'fixture-hiz-' + stamp,
  template_id: tpl,
  items: [1, 2].map((q_no) => ({
    section_key: 'MAT',
    q_no,
    correct_answer: 'B',
    raw_code: 'MAT.11.1.1.' + q_no,
    raw_text: 'İki değişkenin ilişkisini inceler.',
  })),
  results: [
    {
      student_id: ELIF,
      sections,
      answers: { MAT: 'Bc' },
      source: { booklets: { MAT: 'A' }, scores: { SAY: 312.985, EA: 263.056, SOZ: 327.917 }, pages: [1, 2, 3] },
    },
  ],
})
beforeAll(async () => {
  admin = await signInAdminAal2()
  school = (await admin.rpc('my_school')).data!
  const pub=await svc.from('publishers').insert({school_id:school,name:'Hız test '+stamp}).select('id').single();expect(pub.error).toBeNull();publisher=pub.data!.id
  const t = await svc
    .from('exam_templates')
    .insert({ school_id: school, name: 'Hız düzeltme test ' + stamp, grade: 11, exam_types: ['AYT'], wrong_per_correct: 4 })
    .select('id')
    .single()
  expect(t.error).toBeNull()
  tpl = t.data!.id
  expect(
    (await svc.from('exam_template_sections').insert({ template_id: tpl, key: 'MAT', subject_code: 'MAT', label: 'Matematik', question_count: 2 })).error,
  ).toBeNull()
  const e = await svc
    .from('exams')
    .insert({
      school_id: school,
      name: 'Hız düzeltme test',
      publisher_id: publisher,
      grade: 11,
      exam_type: 'AYT',
      exam_date: '2026-10-14',
      exam_template_id: tpl,
      source_sha256: 'fixture-hiz-' + stamp,
    })
    .select('id')
    .single()
  expect(e.error).toBeNull()
  exam = e.data!.id
  expect(
    (await svc.from('exam_results').insert({ exam_id: exam, student_id: ELIF, score: null, subjects: sections, total_net: 0.75, success_pct: 37.5 })).error,
  ).toBeNull()
})
afterAll(async () => {
  if (exam) await svc.from('exams').delete().eq('id', exam)
  if (tpl) await svc.from('exam_templates').delete().eq('id', tpl)
  if(publisher){const versions=(await svc.from('curriculum_versions').select('id').eq('publisher_id',publisher)).data??[];if(versions.length){await svc.from('learning_outcomes').delete().in('curriculum_version_id',versions.map(v=>v.id));await svc.from('curriculum_versions').delete().in('id',versions.map(v=>v.id))};await svc.from('publishers').delete().eq('id',publisher)}
  if (cls) await svc.from('classes').delete().eq('id', cls)
  if (uid) await svc.auth.admin.deleteUser(uid)
})
it('yetkisiz ve farklı kaynak/sayısal sonuç istekleri kayıt değiştiremez', async () => {
  const before = (await svc.from('exam_results').select('*').eq('exam_id', exam)).data
  for (const c of [anon(), await signIn('matematik'), await signIn('veliElif'), await signIn('admin')])
    expect((await c.rpc('repair_exam_pdf', { p_exam: exam, p: payload() })).error).not.toBeNull()
  for (const change of [
    { sha256: 'başka-pdf' },
    { results: [{ ...payload().results[0], sections: { MAT: { d: 2, y: 0, b: 0, net: 2 } } }] },
    { results: [{ ...payload().results[0], answers: { MAT: 'BB' } }] },
  ])
    expect((await admin.rpc('repair_exam_pdf', { p_exam: exam, p: { ...payload(), ...change } })).error).not.toBeNull()
  expect((await svc.from('exam_results').select('*').eq('exam_id', exam)).data).toEqual(before)
  expect((await svc.from('exam_items').select('*').eq('exam_id', exam)).data).toEqual([])
})
it('eksik PDF bilgileri eklenir; puan/net/DYB ve sonuç kimliği aynı kalır; tekrar kayıt yok', async () => {
  expect((await svc.from('exam_items').insert({exam_id:exam,section_key:'MAT',q_no:1,subject_code:'MAT',correct_answer:null,match_method:'UNRESOLVED'})).error).toBeNull()
  const before = (await svc.from('exam_results').select('student_id,score,subjects,total_net,success_pct').eq('exam_id', exam)).data
  for (let i = 0; i < 2; i++) expect((await admin.rpc('repair_exam_pdf', { p_exam: exam, p: payload() })).error).toBeNull()
  expect((await svc.from('exam_results').select('student_id,score,subjects,total_net,success_pct').eq('exam_id', exam)).data).toEqual(before)
  expect((await svc.from('exam_items').select('*').eq('exam_id', exam)).data).toHaveLength(2)
  const r = (await svc.from('exam_results').select('source,answers').eq('exam_id', exam).single()).data!
  expect(r.source.scores).toEqual({ SAY: 312.985, EA: 263.056, SOZ: 327.917 })
  expect(r.answers).toEqual({ MAT: 'Bc' })
})
it('PDF çift/geçersiz işareti yanlış durumuna aktarılır; şık ve sayısal sonuç uydurulmaz', async () => {
  const before = (await svc.from('exam_results').select('score,subjects,total_net,success_pct').eq('exam_id', exam)).data
  const p = payload()
  p.results[0]!.answers.MAT = 'B*'
  expect((await admin.rpc('repair_exam_pdf', { p_exam: exam, p })).error).toBeNull()
  expect((await svc.from('exam_results').select('answers').eq('exam_id', exam).single()).data!.answers).toEqual({ MAT: 'Bx' })
  expect((await svc.from('exam_results').select('score,subjects,total_net,success_pct').eq('exam_id', exam)).data).toEqual(before)
  p.results[0]!.answers.MAT = 'B?'
  expect((await admin.rpc('repair_exam_pdf', { p_exam: exam, p })).error).not.toBeNull()
  expect((await anon().rpc('pdf_status_answers', { p: { MAT: 'B*' } })).error).not.toBeNull()
})
it('Alan yalnız 11–12 için geçerli; sınıf adı alanı içerir', async () => {
  const c = await admin.from('classes').insert({ school_id: school, grade: 11, section: 'Z', track: 'SAY' }).select('*').single()
  expect(c.error).toBeNull()
  cls = c.data!.id
  expect(c.data!.name).toBe('11/Z · SAY')
  expect((await admin.from('classes').update({ grade: 10 }).eq('id', cls)).error).not.toBeNull()
  expect((await admin.from('classes').update({ track: 'SOZ' }).eq('id', cls)).error).toBeNull()
  expect((await admin.from('classes').select('name').eq('id', cls).single()).data!.name).toBe('11/Z · SÖZ')
})
it('isteğe bağlı MFA normal öğretmende API erişimini de korur; aal2 ve kapatma çalışır', async () => {
  const email = 'mfa-optional-' + stamp + '@ornek.com',
    password = 'Deneme123!'
  const u = await svc.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { school: 'bulus-kure', consent_version: 'v1', acik_riza_version: 'ACIK-RIZA-1.0', full_name: 'MFA Test Öğretmeni', role: 'ogretmen', branch: 'Rehberlik' },
  })
  expect(u.error).toBeNull()
  uid = u.data.user!.id
  expect((await svc.from('profiles').update({ status: 'approved' }).eq('id', uid)).error).toBeNull()
  const c = anon()
  expect((await c.auth.signInWithPassword({ email, password })).error).toBeNull()
  expect((await c.rpc('my_school')).data).toBe(school)
  const f = await c.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'optional-test' })
  expect(f.error).toBeNull()
  expect((await c.rpc('my_school')).data).toBe(school)
  expect((await c.auth.mfa.challengeAndVerify({ factorId: f.data!.id, code: generateSync({ secret: f.data!.totp.secret }) })).error).toBeNull()
  const low = anon()
  expect((await low.auth.signInWithPassword({ email, password })).error).toBeNull()
  expect((await low.rpc('my_school')).data).toBeNull()
  expect((await low.from('students').select('id')).data).toEqual([])
  expect((await low.auth.mfa.unenroll({ factorId: f.data!.id })).error).not.toBeNull()
  expect((await c.rpc('my_school')).data).toBe(school)
  expect((await c.auth.mfa.unenroll({ factorId: f.data!.id })).error).toBeNull()
  expect((await low.rpc('my_school')).data).toBe(school)
})
it('aynı soru numarası için B hedefi A hedefini değiştirmez; PDF ekleme B satırını seçer', async () => {
  const p = payload()
  p.items = p.items.map((i) => ({ ...i, booklet: 'B', raw_code: 'YAYIN.11.' + i.q_no, raw_text: 'B kitapçığı farklı öğrenme hedefi.' }))
  p.results[0]!.source = { ...p.results[0]!.source, booklets: { MAT: 'B' } }
  expect((await admin.rpc('repair_exam_pdf', { p_exam: exam, p })).error).toBeNull()
  expect((await svc.from('exam_items').select('q_no').eq('exam_id', exam)).data).toHaveLength(4)
  const before = (await svc.from('exam_items').select('learning_outcome_id').eq('exam_id', exam).eq('booklet', 'A')).data
  const added = await admin.rpc('add_pdf_outcomes', {
    p_items: [{ exam_id: exam, section_key: 'MAT', q_no: 1, booklet: 'B', grade: 11, outcome_type: 'KAZANIM' }],
  })
  expect(added.error).toBeNull()
  expect(added.data[0].status).not.toBe('error')
  expect(added.data[0].key).toBe(exam + ':MAT:1:B')
  expect((await svc.from('exam_items').select('learning_outcome_id').eq('exam_id', exam).eq('booklet', 'A')).data).toEqual(before)
  expect(
    (await svc.from('exam_items').select('learning_outcome_id').eq('exam_id', exam).eq('booklet', 'B').eq('q_no', 1).single()).data!.learning_outcome_id,
  ).not.toBeNull()
})
it('şifre değişikliği mevcut şifreyi doğrular; e-posta onaylanana kadar eski adres korunur',async()=>{
 const email='credential-test-'+stamp+'@ornek.com',password='Deneme123!'
 const u=await svc.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{school:'bulus-kure',consent_version:'v1',acik_riza_version:'ACIK-RIZA-1.0',full_name:'Hesap İşlemi Testi',role:'ogretmen',branch:'Matematik'}});expect(u.error).toBeNull();const id=u.data.user!.id
 try{
  const c=anon();expect((await c.auth.signInWithPassword({email,password})).error).toBeNull()
  expect((await changeOwnPassword(c,anon(),'yanlis-sifre','YeniDemo123!')).error).not.toBeNull()
  expect((await changeOwnPassword(c,anon(),password,'YeniDemo123!')).error).toBeNull()
  expect((await anon().auth.signInWithPassword({email,password})).error).not.toBeNull()
  expect((await anon().auth.signInWithPassword({email,password:'YeniDemo123!'})).error).toBeNull()
  const next='changed-'+stamp+'@ornek.com'
  expect((await c.auth.updateUser({email:next})).error).toBeNull()
  expect((await svc.auth.admin.getUserById(id)).data.user!.email).toBe(email)
  expect((await svc.from('profiles').select('email').eq('id',id).single()).data!.email).toBe(email)
  expect((await svc.auth.admin.updateUserById(id,{email:next})).error).toBeNull()
  expect((await svc.from('profiles').select('email').eq('id',id).single()).data!.email).toBe(next)
 }finally{await svc.auth.admin.deleteUser(id)}
})
