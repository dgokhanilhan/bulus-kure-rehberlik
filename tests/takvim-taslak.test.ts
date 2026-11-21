// 0092: Takvim taslakları. Taslağı veli/öğretmen göremez, bildirim gitmez; toplu yayınlamada her kişiye tek bildirim;
// yayındaki etkinliğin tarihi değişince hedefe bildirilir ve hatırlatma yeniden kurulur; yetkisiz kişi yayınlayamaz.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { service, signIn } from './helpers'

const svc = service()
let rehber: SupabaseClient, mat: SupabaseClient, veliElif: SupabaseClient
let okul = '',
  rehberId = '',
  veliId = '',
  c8A = '',
  c8B = ''
const AD = 'Test Taslak'
const temizle = async () => {
  await svc.from('notifications').delete().like('text', `%${AD}%`)
  await svc
    .from('notifications')
    .delete()
    .like('text', 'Takvime % yeni etkinlik eklendi%')
    .gte('created_at', new Date(Date.now() - 3600_000).toISOString())
  await svc.from('calendar_events').delete().like('title', `${AD}%`)
}
const ekle = async (title: string, ek: Record<string, unknown> = {}) => {
  const r = await rehber
    .from('calendar_events')
    .insert({
      school_id: okul,
      created_by: rehberId,
      title,
      type: 'yazili',
      starts_on: '2026-12-10',
      ends_on: '2026-12-10',
      target: 'sinif',
      class_id: c8A,
      class_ids: [c8A],
      ...ek,
    })
    .select('id')
    .single()
  expect(r.error).toBeNull()
  return r.data!.id as string
}
const veliBildirim = async (desen: string) => (await svc.from('notifications').select('text').eq('user_id', veliId).like('text', desen)).data ?? []

beforeAll(async () => {
  ;[rehber, mat, veliElif] = await Promise.all([signIn('rehber'), signIn('matematik'), signIn('veliElif')])
  rehberId = (await rehber.auth.getUser()).data.user!.id
  veliId = (await veliElif.auth.getUser()).data.user!.id
  okul = (await svc.from('profiles').select('school_id').eq('id', rehberId).single()).data!.school_id
  c8A = (await svc.from('classes').select('id').eq('name', '8/A').single()).data!.id
  c8B = (await svc.from('classes').select('id').eq('name', '8/B').single()).data!.id
  await temizle()
})
afterAll(temizle)

describe('takvim taslakları', () => {
  it('mevcut etkinlikler yayında; taslak yalnız ekleyen ve yönetimce görülür, bildirim gitmez', async () => {
    expect((await svc.from('calendar_events').select('id').eq('taslak', true).not('title', 'like', `${AD}%`)).data).toEqual([])
    const id = await ekle(`${AD} gizli`, { taslak: true })
    expect((await rehber.from('calendar_events').select('id').eq('id', id)).data).toHaveLength(1)
    expect((await veliElif.from('calendar_events').select('id').eq('id', id)).data).toEqual([])
    expect((await mat.from('calendar_events').select('id').eq('id', id)).data).toEqual([])
    expect(await veliBildirim(`%${AD} gizli%`)).toEqual([])
  })

  it('yetkisiz kişi yayınlayamaz; toplu yayında veliye tek özet bildirim gider', async () => {
    const a = await ekle(`${AD} toplu 1`, { taslak: true })
    const b = await ekle(`${AD} toplu 2`, { taslak: true, type: 'deneme', starts_on: '2026-12-12', ends_on: '2026-12-12', class_ids: [c8A, c8B] })
    const red = await veliElif.rpc('takvim_yayinla', { p_ids: [a, b] })
    expect(red.error?.code).toBe('42501')
    expect((await svc.from('calendar_events').select('taslak').in('id', [a, b])).data!.every((x) => x.taslak)).toBe(true)
    const ok = await rehber.rpc('takvim_yayinla', { p_ids: [a, b] })
    expect(ok.error).toBeNull()
    expect(ok.data).toBe(2)
    expect((await veliElif.from('calendar_events').select('id').in('id', [a, b])).data).toHaveLength(2)
    expect(await veliBildirim(`%${AD} toplu%`)).toEqual([])
    const ozet = await veliBildirim('Takvime 2 yeni etkinlik eklendi%')
    expect(ozet).toHaveLength(1)
    expect(ozet[0]!.text).toContain('10.12.2026 – 12.12.2026')
    // ikinci çağrı bir şey yapmaz, yeni bildirim üretmez
    expect((await rehber.rpc('takvim_yayinla', { p_ids: [a, b] })).data).toBe(0)
    expect(await veliBildirim('Takvime 2 yeni etkinlik eklendi%')).toHaveLength(1)
  })

  it('tek taslak düzenlemeyle yayına alınınca normal bildirim; tarih değişince "Tarih değişti" ve hatırlatma sıfırlanır', async () => {
    const id = await ekle(`${AD} tek`, { taslak: true })
    expect((await rehber.from('calendar_events').update({ taslak: false }).eq('id', id)).error).toBeNull()
    expect(await veliBildirim(`Yazılı: ${AD} tek · 10.12.2026`)).toHaveLength(1)
    await svc.from('calendar_events').update({ reminded_on: '2026-12-09' }).eq('id', id)
    expect(await veliBildirim(`Tarih değişti: ${AD} tek%`)).toEqual([]) // reminded_on değişimi bildirim üretmez
    expect((await rehber.from('calendar_events').update({ starts_on: '2026-12-15', ends_on: '2026-12-15' }).eq('id', id)).error).toBeNull()
    const d = await veliBildirim(`Tarih değişti: ${AD} tek%`)
    expect(d).toHaveLength(1)
    expect(d[0]!.text).toBe(`Tarih değişti: ${AD} tek · 10.12.2026 → 15.12.2026`)
    expect((await svc.from('calendar_events').select('reminded_on').eq('id', id).single()).data!.reminded_on).toBeNull()
    // yalnız başlık değişirse bildirim yok
    await rehber
      .from('calendar_events')
      .update({ title: `${AD} tek yeni ad` })
      .eq('id', id)
    expect(await veliBildirim(`%${AD} tek yeni ad%`)).toEqual([])
  })

  it('taslak hatırlatılmaz', async () => {
    const yarin = new Date(Date.now() + 3 * 3600_000 + 86400_000).toISOString().slice(0, 10)
    const id = await ekle(`${AD} hatırlatma`, { taslak: true, starts_on: yarin, ends_on: yarin })
    await svc.rpc('takvim_hatirlatma')
    expect((await svc.from('calendar_events').select('reminded_on').eq('id', id).single()).data!.reminded_on).toBeNull()
    expect(await veliBildirim(`Yaklaşan yazılı: ${AD} hatırlatma%`)).toEqual([])
  })
})
