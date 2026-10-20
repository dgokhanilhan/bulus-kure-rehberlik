// Hata kayıtları (0058): yalnız oturumlu kullanıcı yazar (hata_kaydet), yalnız yönetici okur; kimlik maskelenir; saatlik sınır.
import { describe, expect, it } from 'vitest'
import { anon, service, signIn, signInAdminAal2 } from './helpers'

const svc = service()

describe('hata kayıtları', () => {
  it('anonim yazamaz; kullanıcı yazar ama okuyamaz; yönetici okur; sayfadaki kimlik ve sorgu dizesi maskelenir', async () => {
    const etiket = `test-hata-${Date.now()}`
    await anon().rpc('hata_kaydet', { p: { tur: 'veri', mesaj: etiket + '-anon' } })
    expect((await svc.from('hata_kayitlari').select('id').eq('mesaj', etiket + '-anon')).data).toEqual([])

    const rehber = await signIn('rehber')
    const r = await rehber.rpc('hata_kaydet', { p: { tur: 'cokme', mesaj: etiket, sayfa: '/ogrenciler/00000000-0000-4000-8001-000000001184?sekme=konular', rol: 'rehber' } })
    expect(r.error).toBeNull()
    const k = (await svc.from('hata_kayitlari').select('tur, sayfa, rol, school_id').eq('mesaj', etiket).single()).data!
    expect(k).toMatchObject({ tur: 'cokme', sayfa: '/ogrenciler/:id', rol: 'rehber' })
    expect(k.school_id).not.toBeNull()
    expect((await rehber.from('hata_kayitlari').select('id')).data ?? []).toEqual([])
    expect((await rehber.from('hata_kayitlari').insert({ tur: 'js', mesaj: 'x' })).error).not.toBeNull()

    const admin = await signInAdminAal2()
    expect((await admin.from('hata_kayitlari').select('mesaj').eq('mesaj', etiket)).data).toHaveLength(1)
    await svc.from('hata_kayitlari').delete().like('mesaj', 'test-hata-%')
  })

  it('kişi başı saatte en çok 30 kayıt', async () => {
    const veli = await signIn('veliElif')
    const uid = (await veli.auth.getUser()).data.user!.id
    await svc.from('hata_kayitlari').delete().eq('user_id', uid)
    for (let i = 0; i < 32; i++) await veli.rpc('hata_kaydet', { p: { tur: 'js', mesaj: `test-hata-sinir-${i}` } })
    expect((await svc.from('hata_kayitlari').select('id').eq('user_id', uid)).data).toHaveLength(30)
    await svc.from('hata_kayitlari').delete().eq('user_id', uid)
  })
})
