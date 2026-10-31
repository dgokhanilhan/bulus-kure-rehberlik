// Cumartesi etütleri (0051): yetki (RLS + etut_* fonksiyonları), görünürlük, çakışma, yoklama, talep ve bildirim.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { ELIF, KEREM, anon, service, signIn, signInAdminAal2, snap, notesOf } from './helpers'

const svc = service()
const SCHOOL = '00000000-0000-4000-8000-000000000001'
const sat = (y: number) => {
  const d = new Date(Date.UTC(y, 0, 1))
  while (d.getUTCDay() !== 6) d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}
const GELECEK = sat(2090)
const GECMIS = sat(2020)
const SAAT = [
  { bas: '09:00', bit: '09:40' },
  { bas: '09:50', bit: '10:30' },
  { bas: '10:40', bit: '11:20' },
  { bas: '11:30', bit: '12:10' },
  { bas: '12:20', bit: '13:00' },
]
let rehber: SupabaseClient, mat: SupabaseClient, fen: SupabaseClient, veliElif: SupabaseClient, elif: SupabaseClient, veliKerem: SupabaseClient
let matId = '', fenId = ''
const temizle = async () => {
  await svc.from('etut_gunler').delete().eq('school_id', SCHOOL)
  await svc.from('etut_talepler').delete().eq('school_id', SCHOOL)
  await svc.from('school_settings').delete().eq('school_id', SCHOOL).eq('key', 'modul.etut')
}
const program = (tarih: string, ogr1: string[], extra: object[] = []) => ({
  tarih,
  kademe: 'ortaokul',
  saatler: SAAT,
  hucreler: [
    { ders: 1, teacher_id: matId, teacher_name: '', tur: 'etut', konu: 'Üslü ifadeler', salon: 'ETÜT-1', ogrenciler: ogr1 },
    { ders: 1, teacher_id: fenId, teacher_name: '', tur: 'mesgul', aciklama: '9/A sınav gözetmeni', ogrenciler: [] },
    { ders: 2, teacher_id: fenId, teacher_name: '', tur: 'etut', konu: 'Basit makineler', salon: 'ETÜT-2', ogrenciler: [ELIF] },
    ...extra,
  ],
})

beforeAll(async () => {
  await temizle()
  rehber = await signIn('rehber')
  mat = await signIn('matematik')
  fen = await signIn('fen')
  veliElif = await signIn('veliElif')
  elif = await signIn('elif')
  veliKerem = await signIn('veliKerem')
  matId = (await mat.auth.getUser()).data.user!.id
  fenId = (await fen.auth.getUser()).data.user!.id
})
afterAll(temizle)

describe('Cumartesi etütleri', () => {
  let gun = ''
  it('yalnız rehber/yönetici program kaydeder; doğrudan yazma kapalı', async () => {
    for (const c of [anon(), mat, veliElif, elif]) {
      const r = await c.rpc('etut_kaydet', { p_gun: null, p_data: program(GELECEK, [ELIF]) })
      expect(r.error).not.toBeNull()
    }
    expect((await rehber.from('etut_gunler').insert({ school_id: SCHOOL, tarih: GELECEK, kademe: 'ortaokul', saatler: SAAT })).error).not.toBeNull()
    const r = await rehber.rpc('etut_kaydet', { p_gun: null, p_data: program(GELECEK, [ELIF, KEREM]) })
    expect(r.error).toBeNull()
    gun = r.data as string
    const admin = await signInAdminAal2()
    expect((await admin.from('etut_hucreler').select('id').eq('gun_id', gun)).data).toHaveLength(3)
  })

  // Aynı öğrencinin aynı derste iki etüdü 0063'ten beri kabul edilir (paylaşımlı ders): tests/etut-paylasimli.test.ts
  it('Cumartesi dışı gün, geçersiz saat ve öğretmenin aynı derste iki kaydı reddedilir', async () => {
    const bad = [
      { ...program(GELECEK, [ELIF]), tarih: '2090-01-02' },
      { ...program(GELECEK, [ELIF]), saatler: SAAT.map((s, i) => (i === 2 ? { bas: '10:20', bit: '11:00' } : s)) },
      program(GELECEK, [ELIF], [{ ders: 1, teacher_id: matId, teacher_name: '', tur: 'mesgul', aciklama: 'İzinli', ogrenciler: [] }]),
    ]
    for (const d of bad) expect((await rehber.rpc('etut_kaydet', { p_gun: gun, p_data: d })).error).not.toBeNull()
    const dup = await rehber.rpc('etut_kaydet', { p_gun: null, p_data: program(GELECEK, [ELIF]) })
    expect(dup.error?.message).toMatch(/zaten var/)
  })

  it('taslak program öğretmen, veli ve öğrenciye görünmez', async () => {
    for (const c of [mat, veliElif, elif]) {
      expect((await c.from('etut_gunler').select('id').eq('id', gun)).data).toEqual([])
      expect((await c.from('etut_ogrenciler').select('id').eq('gun_id', gun)).data).toEqual([])
    }
  })

  it('yayınlanınca veli ve öğrenci yalnız kendi etüdünü görür; bildirim gider', async () => {
    const before = await snap()
    expect((await mat.rpc('etut_yayinla', { p_gun: gun })).error).not.toBeNull()
    expect((await rehber.rpc('etut_yayinla', { p_gun: gun })).error).toBeNull()
    const own = (await veliElif.from('etut_ogrenciler').select('student_id, ders, etut_hucreler(teacher_name, konu, salon), etut_gunler(tarih)').eq('gun_id', gun)).data!
    expect(own.map((x) => x.student_id)).toEqual([ELIF, ELIF])
    expect(own.map((x) => x.ders).sort()).toEqual([1, 2])
    expect((await elif.from('etut_ogrenciler').select('student_id').eq('gun_id', gun)).data!.every((x) => x.student_id === ELIF)).toBe(true)
    // Velisi Kerem'i görmez; Kerem'in velisi Elif'i görmez; meşgul hücre veliye görünmez
    expect((await veliElif.from('etut_ogrenciler').select('id').eq('student_id', KEREM)).data).toEqual([])
    expect((await veliKerem.from('etut_ogrenciler').select('student_id').eq('gun_id', gun)).data).toEqual([{ student_id: KEREM }])
    expect((await veliKerem.from('etut_hucreler').select('ders').eq('gun_id', gun)).data).toEqual([{ ders: 1 }])
    // Öğretmen yayındaki programı görür
    expect((await mat.from('etut_hucreler').select('id').eq('gun_id', gun)).data).toHaveLength(3)
    expect(await notesOf(veliElif, before)).toContain(`Cumartesi etüt programı yayınlandı: ${trDw(GELECEK)}`)
    expect(await notesOf(veliKerem, before)).toHaveLength(1)
  })

  it('yayındaki program değişince yalnız etüdü değişen öğrenciye bildirim gider; çıkarılana iptal', async () => {
    const before = await snap()
    expect((await rehber.rpc('etut_kaydet', { p_gun: gun, p_data: program(GELECEK, [ELIF]) })).error).toBeNull()
    expect(await notesOf(veliKerem, before)).toEqual([`Etüt iptal edildi: ${trDw(GELECEK)}`])
    expect(await notesOf(veliElif, before)).toEqual([])
  })

  it('yoklama: yalnız etüdün öğretmeni ya da rehber; gelecekteki etütte alınmaz; veli sonucu görür', async () => {
    const r = await rehber.rpc('etut_kaydet', { p_gun: null, p_data: program(GECMIS, [ELIF]) })
    expect(r.error).toBeNull()
    const past = r.data as string
    expect((await rehber.rpc('etut_yayinla', { p_gun: past })).error).toBeNull()
    const hucre = (await rehber.from('etut_hucreler').select('id').eq('gun_id', past).eq('ders', 1).eq('tur', 'etut').single()).data!.id
    const future = (await rehber.from('etut_hucreler').select('id').eq('gun_id', gun).eq('ders', 1).eq('tur', 'etut').single()).data!.id
    expect((await mat.rpc('etut_yoklama', { p_hucre: future, p_ogrenci: ELIF, p_durum: 'geldi' })).error?.message).toMatch(/etüt günü/)
    for (const c of [fen, veliElif, elif]) expect((await c.rpc('etut_yoklama', { p_hucre: hucre, p_ogrenci: ELIF, p_durum: 'geldi' })).error).not.toBeNull()
    // Öğretmen geçmiş etütü değiştiremez (yalnız etüt günü); rehber hatalı kaydı düzeltir
    expect((await mat.rpc('etut_yoklama', { p_hucre: hucre, p_ogrenci: ELIF, p_durum: 'gelmedi' })).error?.message).toMatch(/Geçmiş etüt/)
    expect((await rehber.rpc('etut_yoklama', { p_hucre: hucre, p_ogrenci: ELIF, p_durum: 'gelmedi' })).error).toBeNull()
    expect((await veliElif.from('etut_ogrenciler').select('yoklama').eq('hucre_id', hucre).single()).data!.yoklama).toBe('gelmedi')
    // Yeniden kaydetmek yoklamayı korur
    expect((await rehber.rpc('etut_kaydet', { p_gun: past, p_data: program(GECMIS, [ELIF]) })).error).toBeNull()
    expect((await elif.from('etut_ogrenciler').select('yoklama').eq('gun_id', past).eq('ders', 1).single()).data!.yoklama).toBe('gelmedi')
  })

  it('talep: öğretmen oluşturur, rehbere bildirim; sahibi iptal eder; rehber gerekçeyle reddeder ya da yerleştirir', async () => {
    const before = await snap()
    for (const c of [veliElif, elif, anon()]) expect((await c.rpc('etut_talep_ekle', { p: { konu: 'Kesirler', ogrenciler: [ELIF] } })).error).not.toBeNull()
    expect((await mat.rpc('etut_talep_ekle', { p: { konu: 'X', ogrenciler: [] } })).error).not.toBeNull()
    const a = await mat.rpc('etut_talep_ekle', { p: { konu: 'Kesirler', ogrenciler: [ELIF], istenen_tarih: GELECEK, istenen_ders: 3 } })
    expect(a.error).toBeNull()
    expect(await notesOf(rehber, before)).toContain(`Yeni etüt talebi: ${(await mat.from('profiles').select('full_name').eq('id', matId).single()).data!.full_name} · Kesirler`)
    expect((await fen.from('etut_talepler').select('id').eq('id', a.data)).data).toEqual([])
    expect((await fen.rpc('etut_talep_iptal', { p_id: a.data })).error).not.toBeNull()
    expect((await mat.rpc('etut_talep_iptal', { p_id: a.data })).error).toBeNull()

    const b = await mat.rpc('etut_talep_ekle', { p: { konu: 'Çarpanlar', ogrenciler: [ELIF] } })
    expect((await rehber.rpc('etut_talep_reddet', { p_id: b.data, p_not: '' })).error).not.toBeNull()
    expect((await mat.rpc('etut_talep_reddet', { p_id: b.data, p_not: 'Uygun saat yok' })).error).not.toBeNull()
    const b4 = await snap()
    expect((await rehber.rpc('etut_talep_reddet', { p_id: b.data, p_not: 'Bu hafta salon yok' })).error).toBeNull()
    expect(await notesOf(mat, b4)).toEqual(['Etüt talebin yanıtlandı: Çarpanlar — Bu hafta salon yok'])

    const c = await mat.rpc('etut_talep_ekle', { p: { konu: 'Kareköklü ifadeler', ogrenciler: [ELIF] } })
    const c4 = await snap()
    const d = program(GELECEK, [ELIF], [{ ders: 3, teacher_id: matId, teacher_name: '', tur: 'etut', konu: 'Kareköklü ifadeler', talep_id: c.data, ogrenciler: [ELIF] }])
    expect((await rehber.rpc('etut_kaydet', { p_gun: gun, p_data: d })).error).toBeNull()
    const t = (await mat.from('etut_talepler').select('durum, plan_tarih, plan_ders').eq('id', c.data).single()).data!
    expect(t).toEqual({ durum: 'planlandi', plan_tarih: GELECEK, plan_ders: 3 })
    expect((await notesOf(mat, c4))[0]).toMatch(/^Etüt talebin programa yerleştirildi: Kareköklü ifadeler/)
    // Programdan çıkarılan talep yeniden beklemeye döner
    expect((await rehber.rpc('etut_kaydet', { p_gun: gun, p_data: program(GELECEK, [ELIF]) })).error).toBeNull()
    expect((await mat.from('etut_talepler').select('durum').eq('id', c.data).single()).data!.durum).toBe('bekliyor')
  })

  it('modül kapatılınca yönetici dışında kimse okuyamaz ve yazamaz', async () => {
    expect((await svc.from('school_settings').upsert({ school_id: SCHOOL, key: 'modul.etut', value: false }, { onConflict: 'school_id,key' })).error).toBeNull()
    expect((await mat.from('etut_hucreler').select('id')).data).toEqual([])
    expect((await rehber.from('etut_gunler').select('id')).data).toEqual([])
    expect((await rehber.rpc('etut_kaydet', { p_gun: gun, p_data: program(GELECEK, [ELIF]) })).error?.message).toMatch(/kapatıldı/)
    expect((await mat.rpc('etut_talep_ekle', { p: { konu: 'Kesirler', ogrenciler: [ELIF] } })).error).not.toBeNull()
    await svc.from('school_settings').delete().eq('school_id', SCHOOL).eq('key', 'modul.etut')
    expect((await rehber.from('etut_gunler').select('id')).data!.length).toBeGreaterThan(0)
  })

  it('sil: yayındaki program silinince öğrenciye iptal bildirimi; yetkisiz silemez', async () => {
    expect((await mat.rpc('etut_sil', { p_gun: gun })).error).not.toBeNull()
    const before = await snap()
    expect((await rehber.rpc('etut_sil', { p_gun: gun })).error).toBeNull()
    expect(await notesOf(veliElif, before)).toEqual([`Etüt iptal edildi: ${trDw(GELECEK)}`])
    expect((await rehber.from('etut_gunler').select('id').eq('id', gun)).data).toEqual([])
  })
})

function trDw(iso: string) {
  const d = new Date(iso + 'T12:00:00Z')
  const ay = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'][d.getUTCMonth()]
  return `${d.getUTCDate()} ${ay} Cumartesi`
}
