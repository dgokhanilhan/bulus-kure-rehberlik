// 0061 etut_grup_ekle: Sınıflar / öğrenci dosyasından gruba etüt → Cumartesi etüt programı. Yetki, taslak gün açma, aynı
// öğretmen-ders etüdüne ekleme, çakışan öğrencinin atlanması, meşgul öğretmen, geçmiş tarih, yayındaki programda bildirim.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { AYSE_CELIK, ELIF, KEREM, anon, service, signIn } from './helpers'

const svc = service()
const SCHOOL = '00000000-0000-4000-8000-000000000001'
const sat = (y: number) => {
  const d = new Date(Date.UTC(y, 0, 1))
  while (d.getUTCDay() !== 6) d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}
const TARIH = sat(2091)
const SAAT = [
  { bas: '09:00', bit: '09:40' },
  { bas: '09:50', bit: '10:30' },
  { bas: '10:40', bit: '11:20' },
  { bas: '11:30', bit: '12:10' },
  { bas: '12:20', bit: '13:00' },
]
let rehber: SupabaseClient, mat: SupabaseClient, veliElif: SupabaseClient
let matId = '', fenId = ''
const temizle = async () => {
  await svc.from('etut_gunler').delete().eq('school_id', SCHOOL).eq('tarih', TARIH)
}
const grup = (c: SupabaseClient, p: Record<string, unknown>) =>
  c.rpc('etut_grup_ekle', { p: { tarih: TARIH, kademe: 'ortaokul', saatler: SAAT, konu: 'Tam sayılarla işlemler', ...p } })

beforeAll(async () => {
  await temizle()
  rehber = await signIn('rehber')
  mat = await signIn('matematik')
  veliElif = await signIn('veliElif')
  matId = (await mat.auth.getUser()).data.user!.id
  fenId = (await (await signIn('fen')).auth.getUser()).data.user!.id
})
afterAll(temizle)

describe('gruba etüt (etut_grup_ekle)', () => {
  it('yalnız rehber / yönetici ekler', async () => {
    for (const c of [anon(), mat, veliElif]) expect((await grup(c, { ders: 1, teacher_id: matId, ogrenciler: [ELIF] })).error).not.toBeNull()
    expect((await svc.from('etut_gunler').select('id').eq('tarih', TARIH)).data).toEqual([])
  })

  it('program yoksa taslak açılır; öğrenciler öğretmenin etüdüne yazılır', async () => {
    const r = await grup(rehber, { ders: 2, teacher_id: matId, ogrenciler: [ELIF, KEREM] })
    expect(r.error).toBeNull()
    expect(r.data).toMatchObject({ durum: 'taslak', eklenen: 2, zaten: 0, cakisan: [], birlesti: false })
    const g = (await svc.from('etut_gunler').select('id, durum, saatler, kademe').eq('tarih', TARIH).single()).data!
    expect(g).toMatchObject({ durum: 'taslak', kademe: 'ortaokul', saatler: SAAT })
    const h = (await svc.from('etut_hucreler').select('ders, teacher_id, teacher_name, tur, konu, etut_ogrenciler(student_id, class_name)').eq('gun_id', g.id)).data!
    expect(h).toHaveLength(1)
    expect(h[0]).toMatchObject({ ders: 2, teacher_id: matId, tur: 'etut', konu: 'Tam sayılarla işlemler' })
    expect(h[0]!.etut_ogrenciler.map((o) => o.student_id).sort()).toEqual([ELIF, KEREM].sort())
    expect((await svc.from('audit_log').select('meta').eq('action', 'etut_grup_ekle').eq('entity_id', g.id)).data).toHaveLength(1)
  })

  it('aynı öğretmen-ders: mevcut etüde eklenir (konu korunur), zaten olan sayılır', async () => {
    const r = await grup(rehber, { ders: 2, teacher_id: matId, konu: 'Başka konu', ogrenciler: [ELIF, AYSE_CELIK] })
    expect(r.data).toMatchObject({ eklenen: 1, zaten: 1, birlesti: true, cakisan: [] })
    const h = (await svc.from('etut_hucreler').select('konu, etut_ogrenciler(student_id)').eq('ders', 2).eq('teacher_id', matId)).data!
    expect(h).toHaveLength(1)
    expect(h[0]!.konu).toBe('Tam sayılarla işlemler')
    expect(h[0]!.etut_ogrenciler).toHaveLength(3)
  })

  it('aynı ders saatinde başka etüdü olan öğrenci eklenmez; hiç öğrenci kalmazsa boş etüt açılmaz', async () => {
    const r = await grup(rehber, { ders: 2, teacher_id: fenId, ogrenciler: [ELIF] })
    expect(r.error).toBeNull()
    expect(r.data).toMatchObject({ eklenen: 0, cakisan: ['Elif Yıldız'], hucre_id: null })
    expect((await svc.from('etut_hucreler').select('id').eq('ders', 2).eq('teacher_id', fenId)).data).toEqual([])
  })

  it('öğretmen o derste meşgulse eklenmez; geçmiş tarih, boş konu ve öğrencisiz istek reddedilir', async () => {
    const g = (await svc.from('etut_gunler').select('id').eq('tarih', TARIH).single()).data!
    await svc.from('etut_hucreler').insert({ gun_id: g.id, school_id: SCHOOL, ders: 3, teacher_id: fenId, teacher_name: 'Fen', tur: 'mesgul', aciklama: 'Sınav gözetmeni' })
    expect((await grup(rehber, { ders: 3, teacher_id: fenId, ogrenciler: [KEREM] })).error?.message).toMatch(/meşgul/)
    expect((await grup(rehber, { tarih: sat(2020), ders: 1, teacher_id: matId, ogrenciler: [KEREM] })).error?.message).toMatch(/Geçmiş/)
    expect((await grup(rehber, { ders: 1, teacher_id: matId, konu: '  ', ogrenciler: [KEREM] })).error?.message).toMatch(/konusu/)
    expect((await grup(rehber, { ders: 1, teacher_id: matId, ogrenciler: [] })).error?.message).toMatch(/öğrenci/)
  })

  it('program yayındaysa yeni eklenen öğrencinin velisine bildirim gider', async () => {
    const g = (await svc.from('etut_gunler').select('id').eq('tarih', TARIH).single()).data!
    expect((await rehber.rpc('etut_yayinla', { p_gun: g.id })).error).toBeNull()
    const once = new Date().toISOString()
    const r = await grup(rehber, { ders: 4, teacher_id: matId, konu: 'Kesirler', ogrenciler: [ELIF] })
    expect(r.data).toMatchObject({ durum: 'yayinda', eklenen: 1 })
    const n = (await veliElif.from('notifications').select('text, type').gte('created_at', once)).data ?? []
    expect(n.some((x) => x.type === 'etut' && /Etüt programı güncellendi/.test(x.text))).toBe(true)
  })
})
