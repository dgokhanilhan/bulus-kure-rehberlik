// 0077: görüşme kararları (yalnız rehberlik/yönetim) ve veli haftalık özeti (onaylanan anlık kopya, okundu bilgisi).
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { service, signIn, snap, ELIF, notesOf, inDays, REHBER_ID } from './helpers'

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

describe('Veli haftalık özeti', () => {
  it('yalnız rehber/yönetim gönderir; veliye bildirim gider, veli okur, öğrenci okuyamaz', async () => {
    const m = await mat.rpc('veli_ozet_gonder', { p_student: ELIF, p_icerik: icerik, p_not: null })
    expect(m.error).not.toBeNull()
    const v = await veli.rpc('veli_ozet_gonder', { p_student: ELIF, p_icerik: icerik, p_not: null })
    expect(v.error).not.toBeNull()

    const t0 = await snap()
    const r = await rehber.rpc('veli_ozet_gonder', { p_student: ELIF, p_icerik: icerik, p_not: 'Emek verdi.' })
    expect(r.error).toBeNull()
    expect(await notesOf(veli, t0)).toContain('Haftalık özet hazır: Elif Yıldız')

    const vo = await veli.from('veli_ozet').select('id, icerik, notu, okundu_at').eq('student_id', ELIF)
    expect(vo.data).toHaveLength(1)
    expect(vo.data![0]!.notu).toBe('Emek verdi.')
    expect(vo.data![0]!.okundu_at).toBeNull()
    expect((await elif.from('veli_ozet').select('id').eq('student_id', ELIF)).data ?? []).toHaveLength(0)

    // Veli doğrudan yazamaz; okundu yalnız işlevle
    const yaz = await veli.from('veli_ozet').update({ notu: 'x' }).eq('id', vo.data![0]!.id).select('id')
    expect(yaz.data ?? []).toHaveLength(0)
    await rehber.rpc('veli_ozet_okundu', { p_id: vo.data![0]!.id }) // rehber açınca okundu olmaz
    expect((await rehber.from('veli_ozet').select('okundu_at').eq('id', vo.data![0]!.id).single()).data!.okundu_at).toBeNull()
    await veli.rpc('veli_ozet_okundu', { p_id: vo.data![0]!.id })
    expect((await rehber.from('veli_ozet').select('okundu_at').eq('id', vo.data![0]!.id).single()).data!.okundu_at).not.toBeNull()

    // Aynı hafta yeniden gönderilince güncellenir, okundu sıfırlanır
    const t1 = await snap()
    await rehber.rpc('veli_ozet_gonder', { p_student: ELIF, p_icerik: icerik, p_not: null })
    const son = await rehber.from('veli_ozet').select('notu, okundu_at').eq('student_id', ELIF)
    expect(son.data).toEqual([{ notu: null, okundu_at: null }])
    expect(await notesOf(veli, t1)).toContain('Haftalık özet güncellendi: Elif Yıldız')
  })

  it('ayar kapalıyken gönderilemez ve veli göremez', async () => {
    const { data: s } = await service().from('students').select('school_id').eq('id', ELIF).single()
    await service().from('school_settings').upsert({ school_id: s!.school_id, key: 'aile.haftalik_ozet', value: false })
    try {
      const r = await rehber.rpc('veli_ozet_gonder', { p_student: ELIF, p_icerik: icerik, p_not: null })
      expect(r.error?.message).toBe('Haftalık özet okulda kapalı.')
      expect((await veli.from('veli_ozet').select('id').eq('student_id', ELIF)).data ?? []).toHaveLength(0)
    } finally {
      await service().from('school_settings').delete().match({ school_id: s!.school_id, key: 'aile.haftalik_ozet' })
    }
  })
})
