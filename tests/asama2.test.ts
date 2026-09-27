// Aşama 2: görev, görüşme, not ve bildirim kuralları veritabanında (trigger + RLS).
import { describe, it, expect, beforeAll } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { service, signIn, snap, ELIF, AYSE_CELIK, notesOf, inDays, REHBER_ID } from './helpers'

let rehber: SupabaseClient, mat: SupabaseClient, veli: SupabaseClient, elif: SupabaseClient
beforeAll(async () => {
  ;[rehber, mat, veli, elif] = await Promise.all([signIn('rehber'), signIn('matematik'), signIn('veliElif'), signIn('elif')])
})

describe('Görevler', () => {
  it('rehber görev atar → öğrenciye ve veliye bildirim; oluşturan zorla oturumdaki kullanıcı olur', async () => {
    const t0 = await snap()
    const { data, error } = await rehber
      .from('tasks')
      .insert({ student_id: ELIF, subject: 'MAT', topic: 'Test konusu A', question_count: 10, due_date: inDays(3), parent_visible: true, created_by: '00000000-0000-4000-8003-000000000003' })
      .select('created_by')
      .single()
    expect(error).toBeNull()
    expect(data!.created_by).toBe(REHBER_ID)
    expect(await notesOf(elif, t0)).toContainEqual(expect.stringMatching(/^Yeni görev: Test konusu A · 10 soru · son gün \d+ \S+$/))
    expect(await notesOf(veli, t0)).toContain('Elif için yeni görev: Test konusu A · 10 soru')
  })

  it('"veli görmesin" görevinde veliye bildirim gitmez', async () => {
    const t0 = await snap()
    await rehber.from('tasks').insert({ student_id: ELIF, subject: 'MAT', topic: 'Gizli görev', question_count: 5, due_date: inDays(2), parent_visible: false, created_by: REHBER_ID })
    expect(await notesOf(elif, t0)).toHaveLength(1)
    expect(await notesOf(veli, t0)).toHaveLength(0)
  })

  it('son gün geçmiş olamaz', async () => {
    const { error } = await rehber.from('tasks').insert({ student_id: ELIF, subject: 'MAT', topic: 'x', question_count: 5, due_date: inDays(-1), created_by: REHBER_ID })
    expect(error?.message).toBe('Son gün bugünden önce olamaz.')
  })

  it('öğrenci +5 ilerler, tamamlayınca rehbere ve veliye bildirim; haftalık görev 7 gün sonrasına kopyalanır', async () => {
    const { data: t } = await rehber
      .from('tasks')
      .insert({ student_id: ELIF, subject: 'FEN', topic: 'Haftalık test', question_count: 8, due_date: inDays(2), weekly: true, created_by: REHBER_ID })
      .select('id')
      .single()
    const t0 = await snap()
    const p = await elif.from('tasks').update({ solved: 5 }).eq('id', t!.id).select('solved, completed_at').single()
    expect(p.data).toEqual({ solved: 5, completed_at: null })
    const done = await elif.from('tasks').update({ solved: 99 }).eq('id', t!.id).select('solved, completed_at').single()
    expect(done.data!.solved).toBe(8) // soru sayısına kırpılır
    expect(done.data!.completed_at).not.toBeNull()

    expect(await notesOf(rehber, t0)).toContain('Elif Yıldız görevini tamamladı: Haftalık test')
    expect(await notesOf(veli, t0)).toContain('Elif Yıldız görevini tamamladı: Haftalık test')
    const { data: copies } = await elif.from('tasks').select('due_date, solved, weekly').eq('topic', 'Haftalık test').is('completed_at', null)
    expect(copies).toEqual([{ due_date: inDays(9), solved: 0, weekly: true }])
    const en = await notesOf(elif, t0)
    expect(en.some((x) => x.startsWith('Haftalık görevin yenilendi: Haftalık test · 8 soru'))).toBe(true)
    expect(en.some((x) => x.startsWith('Yeni görev: Haftalık test'))).toBe(false)
  })

  it('düzenleme ve silme öğrenciye bildirilir', async () => {
    const { data: t } = await rehber.from('tasks').insert({ student_id: ELIF, subject: 'TUR', topic: 'Düzenlenecek', question_count: 5, due_date: inDays(2), created_by: REHBER_ID }).select('id').single()
    const t0 = await snap()
    await rehber.from('tasks').update({ due_date: inDays(4) }).eq('id', t!.id)
    await rehber.from('tasks').delete().eq('id', t!.id)
    const en = await notesOf(elif, t0)
    expect(en[0]).toMatch(/^Görevin güncellendi: Düzenlenecek · son gün/)
    expect(en[1]).toBe('Görevin kaldırıldı: Düzenlenecek')
  })

  it('günlük iş: gecikmiş görev için adminlere bir kez "Görev aksadı"', async () => {
    const admin = await service().from('notifications').select('id').limit(0) // yalnız bağlantı
    expect(admin.error).toBeNull()
    const t0 = await snap()
    const r1 = await service().rpc('gunluk_isler')
    expect(r1.error).toBeNull()
    expect(r1.data.gecikme_bildirimi).toBeGreaterThanOrEqual(1)
    const r2 = await service().rpc('gunluk_isler')
    expect(r2.data.gecikme_bildirimi).toBe(0)
    const { data } = await service().from('notifications').select('id, text').eq('user_id', '00000000-0000-4000-8003-000000000001')
    const aksadi = data!.filter((n) => !t0.has((n as { id: string }).id) && n.text.startsWith('Görev aksadı: Ayşe Çelik · Paragrafta ana düşünce (22/40'))
    expect(aksadi).toHaveLength(1)
  })

  it('günlük iş istemciden çağrılamaz', async () => {
    expect((await rehber.rpc('gunluk_isler')).error).not.toBeNull()
  })
})

describe('Görüşmeler', () => {
  const at = (days: number, hm: string) => `${inDays(days)}T${hm}:00+03:00`

  it('planla → veli ve öğrenciye; saat değişir → ikisine; veli katılacağım → rehbere; iptal → ikisine', async () => {
    const t0 = await snap()
    const { data: g, error } = await rehber.from('meetings').insert({ student_id: ELIF, with_whom: 'ikisi', starts_at: at(2, '14:00'), note: 'Deneme sonrası', created_by: REHBER_ID }).select('id').single()
    expect(error).toBeNull()
    expect((await notesOf(veli, t0))[0]).toMatch(/^Görüşme planlandı: .* 14:00 · Deneme sonrası$/)
    expect((await notesOf(elif, t0))[0]).toMatch(/^Görüşme planlandı:/)

    const t1 = await snap()
    await rehber.from('meetings').update({ starts_at: at(2, '15:30') }).eq('id', g!.id)
    expect((await notesOf(veli, t1))[0]).toMatch(/^Görüşme saati değişti: .* 14:00 → .* 15:30$/)
    expect((await notesOf(elif, t1))[0]).toMatch(/^Görüşme saati değişti:/)

    // veli yalnız yanıt verebilir, saati değiştiremez
    expect((await veli.from('meetings').update({ starts_at: at(3, '10:00') }).eq('id', g!.id)).error?.code).toBe('42501')
    const t2 = await snap()
    const rep = await veli.from('meetings').update({ reply: 'ok' }).eq('id', g!.id).select('reply, replied_by').single()
    expect(rep.data!.reply).toBe('ok')
    expect(await notesOf(rehber, t2)).toContainEqual(expect.stringMatching(/^Ayşe Yıldız görüşmeye katılacağını bildirdi: Elif Yıldız · /))

    const t3 = await snap()
    await rehber.from('meetings').update({ canceled_at: new Date().toISOString() }).eq('id', g!.id)
    expect((await notesOf(elif, t3))[0]).toMatch(/^Görüşme iptal edildi:/)
    // iptal edilmiş görüşmeye yanıt verilemez
    const late = await elif.from('meetings').update({ reply: 'no' }).eq('id', g!.id).select('id')
    expect(late.data).toEqual([])
  })

  it('geçmiş gün seçilemez; branş öğretmeni görüşme göremez', async () => {
    const { error } = await rehber.from('meetings').insert({ student_id: ELIF, with_whom: 'veli', starts_at: at(-1, '10:00'), created_by: REHBER_ID })
    expect(error?.message).toBe('Geçmiş bir gün seçilemez.')
    expect((await mat.from('meetings').select('id')).data).toEqual([])
  })

  it('"Veli görüşmesi" öğrenciye bildirilmez', async () => {
    const t0 = await snap()
    await rehber.from('meetings').insert({ student_id: ELIF, with_whom: 'veli', starts_at: at(1, '09:00'), created_by: REHBER_ID })
    expect(await notesOf(elif, t0)).toHaveLength(0)
    expect(await notesOf(veli, t0)).toHaveLength(1)
  })
})

describe('Notlar', () => {
  it('rehber notu veritabanında şifreli; rehber çözer, branş öğretmeni ve veli görmez', async () => {
    const { data: n } = await rehber.from('notes').insert({ student_id: ELIF, author_id: REHBER_ID, visibility: 'rehber', body: 'Gizli test notu' }).select('id, body').single()
    expect(n!.body).toBeNull()
    const { data: raw } = await service().from('notes').select('body_enc').eq('id', n!.id).single()
    expect(String(raw!.body_enc)).not.toContain('Gizli')

    const { data: r } = await rehber.from('notes_view').select('body').eq('id', n!.id).single()
    expect(r!.body).toBe('Gizli test notu')
    expect((await mat.from('notes_view').select('id').eq('id', n!.id)).data).toEqual([])
    expect((await veli.from('notes_view').select('id').eq('id', n!.id)).data).toEqual([])
    expect((await elif.from('notes_view').select('id')).data).toEqual([])
  })

  it('"veli görsün" notu veliye bildirilir; branş öğretmeninin notu rehbere bildirilir', async () => {
    const t0 = await snap()
    await rehber.from('notes').insert({ student_id: ELIF, author_id: REHBER_ID, visibility: 'veli', body: 'Veli için test notu' })
    expect(await notesOf(veli, t0)).toEqual(['Öğretmen notu: Veli için test notu'])
    const { data: v } = await veli.from('notes_view').select('body').eq('body', 'Veli için test notu')
    expect(v).toHaveLength(1)

    const t1 = await snap()
    const { data: me } = await mat.auth.getUser()
    await mat.from('notes').insert({ student_id: AYSE_CELIK, author_id: me.user!.id, visibility: 'ogretmen', body: 'Branş notu' })
    expect(await notesOf(rehber, t1)).toEqual(['Murat Kaya not ekledi: Ayşe Çelik'])
    expect(await notesOf(veli, t1)).toEqual([])
  })

  it('boş not kaydedilemez', async () => {
    const { error } = await rehber.from('notes').insert({ student_id: ELIF, author_id: REHBER_ID, visibility: 'ogretmen', body: '   ' })
    expect(error?.message).toBe('Not boş olamaz.')
  })
})

describe('Bildirimler', () => {
  it('kullanıcı yalnız okundu bilgisini değiştirebilir, bildirim ekleyemez', async () => {
    const { data: n } = await veli.from('notifications').select('id').limit(1).single()
    expect((await veli.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', n!.id).select('id')).data).toHaveLength(1)
    expect((await veli.from('notifications').update({ text: 'x' }).eq('id', n!.id)).error?.code).toBe('42501')
    const { data: me } = await veli.auth.getUser()
    expect((await veli.from('notifications').insert({ user_id: me.user!.id, text: 'sahte' })).error).not.toBeNull()
  })
})
