// 0063 paylaşımlı etüt: öğrenci aynı ders saatinde iki etüde yazılabilir (okulun bilinçli kararı; sayfa "yine de" sorar);
// aynı etütte (hücrede) tekrar eden öğrenci bir kez yazılır.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { ELIF, KEREM, service, signIn } from './helpers'

const svc = service()
const SCHOOL = '00000000-0000-4000-8000-000000000001'
const sat = (y: number) => {
  const d = new Date(Date.UTC(y, 0, 1))
  while (d.getUTCDay() !== 6) d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}
const TARIH = sat(2092)
const SAAT = Array.from({ length: 5 }, (_, i) => ({ bas: `${String(9 + i).padStart(2, '0')}:00`, bit: `${String(9 + i).padStart(2, '0')}:40` }))
let rehber: SupabaseClient
let matId = '', fenId = ''
const temizle = () => svc.from('etut_gunler').delete().eq('school_id', SCHOOL).eq('tarih', TARIH)

beforeAll(async () => {
  await temizle()
  rehber = await signIn('rehber')
  matId = (await (await signIn('matematik')).auth.getUser()).data.user!.id
  fenId = (await (await signIn('fen')).auth.getUser()).data.user!.id
})
afterAll(temizle)

describe('paylaşımlı etüt (0063)', () => {
  it('aynı öğrenci aynı derste iki öğretmenin etüdüne kaydedilir; hücrede tekrar eden bir kez yazılır', async () => {
    const r = await rehber.rpc('etut_kaydet', {
      p_gun: null,
      p_data: {
        tarih: TARIH,
        kademe: 'ortaokul',
        saatler: SAAT,
        hucreler: [
          { ders: 3, teacher_id: matId, teacher_name: '', tur: 'etut', konu: 'İngilizce', ogrenciler: [ELIF, KEREM, ELIF] },
          { ders: 3, teacher_id: fenId, teacher_name: '', tur: 'etut', konu: 'Din Kültürü', ogrenciler: [ELIF, KEREM] },
        ],
      },
    })
    expect(r.error).toBeNull()
    const o = (await svc.from('etut_ogrenciler').select('student_id, hucre_id').eq('gun_id', r.data as string).eq('ders', 3)).data!
    expect(o).toHaveLength(4)
    expect(o.filter((x) => x.student_id === ELIF)).toHaveLength(2)
    expect(new Set(o.map((x) => x.hucre_id)).size).toBe(2)
  })
  it('aynı hücreye aynı öğrenci veritabanında iki kez eklenemez', async () => {
    const x = (await svc.from('etut_ogrenciler').select('hucre_id, gun_id, school_id, ders, student_id, student_name').eq('student_id', ELIF).eq('ders', 3).limit(1).single()).data!
    expect((await svc.from('etut_ogrenciler').insert(x)).error?.code).toBe('23505')
  })
})
