// 0078: kullanım panosu ve KVKK dosyası yalnız yöneticiye; erişim kaydı günde bir; KVKK başvurusu akışı.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { service, signIn, signInAdminAal2, snap, ELIF, KEREM, notesOf, REHBER_ID } from './helpers'

let admin: SupabaseClient, rehber: SupabaseClient, mat: SupabaseClient, veli: SupabaseClient, elif: SupabaseClient
beforeAll(async () => {
  admin = await signInAdminAal2()
  ;[rehber, mat, veli, elif] = await Promise.all([signIn('rehber'), signIn('matematik'), signIn('veliElif'), signIn('elif')])
})
afterAll(async () => {
  await service().from('kvkk_talep').delete().not('id', 'is', null)
})

describe('Kullanım panosu', () => {
  it('yönetici rol ve bölüm sayılarını görür; diğerleri çağıramaz', async () => {
    const { data, error } = await admin.rpc('kullanim_ozeti')
    expect(error).toBeNull()
    expect(data.roller.map((r: { rol: string }) => r.rol)).toEqual(expect.arrayContaining(['admin', 'rehber', 'veli', 'ogrenci']))
    expect(data.moduller.map((m: { anahtar: string }) => m.anahtar)).toEqual(expect.arrayContaining(['gorev', 'gorusme', 'mesaj', 'veli_ozet']))
    for (const r of data.roller) expect(r.son30).toBeLessThanOrEqual(r.toplam)
    for (const c of [rehber, mat, veli, elif]) expect((await c.rpc('kullanim_ozeti')).error?.message).toBe('Yalnız yönetici')
  })
})

describe('Erişim kaydı ve KVKK dosyası', () => {
  it('öğretmenin öğrenci sayfası görüntülemesi günde bir kez yazılır; veli yazamaz; dosyada görünür', async () => {
    const say = async () =>
      (await service().from('audit_log').select('id', { count: 'exact', head: true }).eq('entity', 'ogrenci').eq('entity_id', ELIF).eq('user_id', REHBER_ID)).count ?? 0
    await service().from('audit_log').delete().eq('entity', 'ogrenci').eq('entity_id', ELIF)
    expect((await rehber.rpc('log_view', { p_entity: 'ogrenci', p_student: ELIF })).error).toBeNull()
    await rehber.rpc('log_view', { p_entity: 'ogrenci', p_student: ELIF })
    expect(await say()).toBe(1)
    await veli.rpc('log_view', { p_entity: 'ogrenci', p_student: ELIF })
    expect(
      (await service().from('audit_log').select('id', { count: 'exact', head: true }).eq('entity', 'ogrenci').eq('entity_id', ELIF)).count,
    ).toBe(1)
    // Görmediği öğrenci için kayıt düşmez
    await mat.rpc('log_view', { p_entity: 'ogrenci', p_student: KEREM })

    const { data, error } = await admin.rpc('kvkk_ogrenci_dosyasi', { p_student: ELIF })
    expect(error).toBeNull()
    expect(data.erisim.find((e: { ad: string }) => e.ad === 'Selin Aksoy')?.turler).toContain('ogrenci')
    expect(data.hesaplar.some((h: { tur: string }) => h.tur === 'veli')).toBe(true)
    for (const c of [rehber, mat, veli]) expect((await c.rpc('kvkk_ogrenci_dosyasi', { p_student: ELIF })).error).not.toBeNull()
  })
})

describe('KVKK başvurusu', () => {
  it('veli çocuğu için başvurur → yöneticiye bildirim; başkasının çocuğu için başvuramaz; yalnız kendi başvurusunu görür', async () => {
    const t0 = await snap()
    const { error } = await veli.from('kvkk_talep').insert({ tur: 'silme', student_id: ELIF, aciklama: 'Lütfen siliniz.', durum: 'tamamlandi' })
    expect(error).toBeNull()
    expect(await notesOf(admin, t0)).toContain('KVKK başvurusu (silme): Elif Yıldız')
    const baska = await veli.from('kvkk_talep').insert({ tur: 'bilgi', student_id: KEREM })
    expect(baska.error?.message).toBe('Yalnız velisi olduğunuz öğrenci için başvurabilirsiniz.')
    const benim = await veli.from('kvkk_talep').select('durum, basvuran')
    expect(benim.data).toHaveLength(1)
    expect(benim.data![0]!.durum).toBe('yeni') // istemcinin gönderdiği durum yok sayılır
    expect((await mat.from('kvkk_talep').select('id')).data ?? []).toHaveLength(0)
    expect((await rehber.from('kvkk_talep').select('id')).data ?? []).toHaveLength(0)
  })

  it('yönetici yanıtlar → başvurana bildirim; ret gerekçesiz olmaz; diğerleri yanıtlayamaz', async () => {
    const { data: t } = await admin.from('kvkk_talep').select('id').eq('student_id', ELIF).single()
    expect((await rehber.rpc('kvkk_talep_yanitla', { p_id: t!.id, p_durum: 'tamamlandi', p_yanit: null })).error?.message).toBe('Yalnız yönetici')
    expect((await admin.rpc('kvkk_talep_yanitla', { p_id: t!.id, p_durum: 'reddedildi', p_yanit: '' })).error?.message).toBe('Reddetmenin gerekçesini yazın.')
    const t0 = await snap()
    expect((await admin.rpc('kvkk_talep_yanitla', { p_id: t!.id, p_durum: 'tamamlandi', p_yanit: 'Veriler silindi.' })).error).toBeNull()
    expect(await notesOf(veli, t0)).toContain('KVKK başvurunuz sonuçlandı.')
    const v = await veli.from('kvkk_talep').select('durum, yanit').single()
    expect(v.data).toEqual({ durum: 'tamamlandi', yanit: 'Veriler silindi.' })
  })

  it('sonuçlanmamış en çok 3 başvuru', async () => {
    for (let i = 0; i < 3; i++) expect((await elif.from('kvkk_talep').insert({ tur: 'bilgi' })).error).toBeNull()
    expect((await elif.from('kvkk_talep').insert({ tur: 'bilgi' })).error?.message).toBe('Sonuçlanmamış 3 başvurunuz var; yanıtlanmalarını bekleyin.')
  })
})
