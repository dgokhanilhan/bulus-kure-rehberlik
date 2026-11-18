// 0077: görüşme kararları (yalnız rehberlik/yönetim). Veli haftalık özeti 0081 ile kaldırıldı.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { service, signIn, ELIF, inDays, REHBER_ID } from './helpers'

let rehber: SupabaseClient, mat: SupabaseClient, veli: SupabaseClient, elif: SupabaseClient
beforeAll(async () => {
  ;[rehber, mat, veli, elif] = await Promise.all([signIn('rehber'), signIn('matematik'), signIn('veliElif'), signIn('elif')])
})
afterAll(async () => {
  await service().from('gorusme_karar').delete().eq('student_id', ELIF)
  await service().from('veli_ozet').delete().eq('student_id', ELIF)
})

const icerik = {
  bas: '2026-11-09',
  bit: '2026-11-15',
  denemeler: [],
  gorev: { tamamlanan: ['Paragraf'], tamamSayi: 1, yeni: 0, geciken: 0, acik: 0 },
  devamsizlik: null,
}

describe('Görüşme kararları', () => {
  it('rehber yazar; damga alanları sunucuda; veli, öğrenci ve branş öğretmeni göremez', async () => {
    const { data, error } = await rehber
      .from('gorusme_karar')
      .insert({ student_id: ELIF, metin: '  Her akşam 20 paragraf  ', durum: 'yapildi', created_by: '00000000-0000-4000-8003-000000000003' })
      .select('metin, durum, created_by, kontrol_at')
      .single()
    expect(error).toBeNull()
    expect(data).toEqual({ metin: 'Her akşam 20 paragraf', durum: 'acik', created_by: REHBER_ID, kontrol_at: null })
    for (const c of [veli, elif, mat]) {
      const r = await c.from('gorusme_karar').select('id').eq('student_id', ELIF)
      expect(r.data ?? []).toHaveLength(0)
    }
    const yaz = await veli.from('gorusme_karar').insert({ student_id: ELIF, metin: 'veli yazamaz' })
    expect(yaz.error).not.toBeNull()
  })

  it('durum değişince kontrol zamanı yazılır; başka öğrencinin görevi bağlanamaz', async () => {
    const { data: k } = await rehber.from('gorusme_karar').insert({ student_id: ELIF, metin: 'Kontrol edilecek' }).select('id').single()
    const u = await rehber.from('gorusme_karar').update({ durum: 'yapildi' }).eq('id', k!.id).select('durum, kontrol_at, kontrol_eden').single()
    expect(u.data!.durum).toBe('yapildi')
    expect(u.data!.kontrol_at).not.toBeNull()
    expect(u.data!.kontrol_eden).toBe(REHBER_ID)
    const g = await rehber.from('gorusme_karar').update({ durum: 'acik' }).eq('id', k!.id).select('kontrol_at').single()
    expect(g.data!.kontrol_at).toBeNull()
    const { data: baska } = await service().from('tasks').select('id').neq('student_id', ELIF).limit(1).single()
    const bag = await rehber.from('gorusme_karar').update({ task_id: baska!.id }).eq('id', k!.id)
    expect(bag.error?.message).toBe('Görev bu öğrenciye ait değil.')
    const { data: t } = await rehber
      .from('tasks')
      .insert({ student_id: ELIF, subject: 'TUR', topic: 'Karar görevi', question_count: 5, due_date: inDays(3), created_by: REHBER_ID })
      .select('id')
      .single()
    const bag2 = await rehber.from('gorusme_karar').update({ task_id: t!.id }).eq('id', k!.id)
    expect(bag2.error).toBeNull()
    await rehber.from('tasks').delete().eq('id', t!.id)
  })
})

describe('Veli haftalık özeti (0081 ile kaldırıldı)', () => {
  it('kimse yeni özet gönderemez; ayar listede yok', async () => {
    for (const c of [rehber, mat, veli]) {
      const r = await c.rpc('veli_ozet_gonder', { p_student: ELIF, p_icerik: icerik, p_not: null })
      expect(r.error).not.toBeNull()
    }
    expect((await service().from('veli_ozet').select('id').eq('student_id', ELIF)).data ?? []).toHaveLength(0)
    const { data: spec } = await rehber.rpc('setting_spec_public')
    expect(Object.keys(spec as object)).not.toContain('aile.haftalik_ozet')
  })
})
