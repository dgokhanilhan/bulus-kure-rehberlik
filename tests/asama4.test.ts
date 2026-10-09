// Aşama 4 bitti şartı: 7 öğrenci tipinin raporları farklı; yapay zekâ isteğinde kişisel veri yok; kotada 429.
// Ayrıca: rehber yorumu şifreli, gönderme ve alıcı yetkileri.
import { describe, it, expect, beforeAll } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { service, signIn, snap, notesOf, sid, ELIF, REHBER_ID, loadDataset, mockLog, mockMode, mockReset } from './helpers'
import { aiPayload, findForbidden, genVeli, reportData } from '../src/lib/rapor'
import type { Dataset } from '../src/lib/analiz'

let ds: Dataset
let rehber: SupabaseClient
beforeAll(async () => {
  ds = await loadDataset()
  rehber = await signIn('rehber')
})
const lastExam = () => ds.exams.at(-1)!.id

const TYPES: [string, string, string][] = [
  ['1186', 'Deniz Arslan', 'çok yüksek netli'],
  ['1189', 'Ece Aydemir', 'orta'],
  ['1205', 'Ali Koç', 'düşük'],
  ['1202', 'Mert Demir', 'neti yükselen/düşen'],
  ['1184', 'Elif Yıldız', 'aynı kazanımı tekrar yanlış yapan'],
  ['1201', 'Kerem Aydın', 'neti düşen'],
  ['1220', 'Can Öztürk', 'kazanım verisi eksik'],
]

describe('Kural tabanlı veli raporu (kabul testi)', () => {
  it('7 öğrenci tipinin raporları birbirinden gerçekten farklı; yasak ifade ve kazanım kodu yok', () => {
    const norm = (s: string) =>
      s.toLocaleLowerCase('tr').replace(/deniz|ece|ali|mert|elif|kerem|can/g, 'X').replace(/[\d,]+/g, '#').split(/[^\p{L}#]+/u).filter(Boolean)
    const texts = TYPES.map(([no, name]) => {
      const b = genVeli(reportData(ds, sid(no), lastExam())!, name, sid(no) + lastExam())
      const all = [b.genel, b.guclu, b.gelisim, b.oneriler, b.mentor].join('\n')
      expect(findForbidden(all), name).toEqual([])
      expect(b.oneriler.split('\n').length, name).toBeGreaterThanOrEqual(3)
      return { name, b, words: new Set(norm(all)) }
    })
    // İsim ve sayılar maskelenince bile iki rapor birbirinin kopyası olmamalı
    for (let i = 0; i < texts.length; i++)
      for (let j = i + 1; j < texts.length; j++) {
        const a = texts[i]!.words, b = texts[j]!.words
        const inter = [...a].filter((w) => b.has(w)).length
        const jac = inter / (a.size + b.size - inter)
        expect(jac, `${texts[i]!.name} ~ ${texts[j]!.name}`).toBeLessThan(0.8)
      }
    const by = (n: string) => texts.find((t) => t.name === n)!.b
    expect(by('Can Öztürk').gelisim).toContain('konu bilgisi net okunamadığı')
    expect(by('Can Öztürk').oneriler).not.toMatch(/tarama testi/) // kazanım yoksa konu uydurulmaz
    expect(by('Elif Yıldız').gelisim).toMatch(/tekrar ediyor/)
    expect(by('Deniz Arslan').genel).toMatch(/Genel performans oldukça güçlü/)
    expect(by('Ali Koç').genel).toMatch(/birkaç temel hedef/)
  })
})

describe('ai-veli-raporu', () => {
  const invoke = (c: SupabaseClient, body: Record<string, unknown>) => c.functions.invoke('ai-veli-raporu', { body })

  it('istekte doğrudan kimlik yok; analiz korunur ve metinde öğrencimiz kullanılır', async () => {
    await mockReset()
    const R = reportData(ds, ELIF, lastExam())!
    const { data, error } = await invoke(rehber, { student_id: ELIF, payload: aiPayload(R) })
    expect(error).toBeNull()
    expect(data.report.genel.startsWith('Öğrencimiz ')).toBe(true)
    expect(data.report.mentorOneri).toContain('Öğrencimiz ile')

    const log = await mockLog()
    expect(log).toHaveLength(1)
    expect(log[0]!.body.thinking).toEqual({ type: 'disabled' })
    const sent = JSON.stringify(log[0]!.body)
    const svc = service()
    const [{ data: st }, { data: people }, { data: notes }, { data: school }] = await Promise.all([
      svc.from('students').select('full_name, school_no, class_name'),
      svc.from('profiles').select('full_name, email').not('email', 'like', 'test-%').not('email', 'like', 'e2e-%'),
      svc.from('notes').select('body'),
      svc.from('schools').select('name'),
    ])
    const banned = [
      ...st!.flatMap((s) => [s.full_name, ...s.full_name.split(' '), s.school_no]),
      ...people!.flatMap((p) => [p.full_name, ...p.full_name.split(' '), p.email]),
      ...notes!.map((n) => n.body).filter(Boolean),
      ...school!.map((s) => s.name), 'Buluş', 'Küre', '8/A', '8/B', '8/C', 'TG-',
    ]
      // Diğer testlerin açtığı "Yeni Öğrenci" gibi hesapların genel kelimeleri kişisel veri değildir.
      .filter((x): x is string => !!x && x.length >= 3 && !['Öğrenci', 'Veli', 'Deneme', 'Yeni', 'Sahte', 'Onaylı', 'Yönetici', 'Rehber', 'Öğretmen', 'Kendini', 'Onaylayan', 'Onaylamasın', 'Reddedilecek'].includes(x))
    for (const b of banned) expect(sent.includes(b), `istekte "${b}" var`).toBe(false)
    expect(sent).toContain('toplamNet')
    expect(sent).toContain('guvenilirTekrarEdenHatalar')
    expect(sent).not.toContain(ELIF)
    expect(sent).toContain('{AD}') // talimat yer tutucuyu açıklar
    // anahtar istemciye/loga düşmez: sahte sunucu yalnız "Bearer ***" gördüğünü kaydeder
  })

  it('izinsiz alan ya da bilinmeyen konu içeren veri reddedilir', async () => {
    const p = aiPayload(reportData(ds, ELIF, lastExam())!)
    expect((await invoke(rehber, { student_id: ELIF, payload: { ...p, ogrenci: 'Elif Yıldız' } })).error).not.toBeNull()
    const bad = { ...p, buDenemedeYanlisKonular: [{ ders: 'Matematik', konu: 'Elif Yıldız özel notu' }] }
    expect((await invoke(rehber, { student_id: ELIF, payload: bad })).error).not.toBeNull()
  })

  it('yasak ifade içeren çıktı reddedilir (422), servis çökerse 502 — istemci kural tabanlı taslakta kalır', async () => {
    const p = aiPayload(reportData(ds, ELIF, lastExam())!)
    await mockMode('bad')
    const r1 = await invoke(rehber, { student_id: ELIF, payload: p })
    expect((r1.error as { context?: Response })?.context?.status).toBe(422)
    await mockMode('down')
    const r2 = await invoke(rehber, { student_id: ELIF, payload: p })
    expect((r2.error as { context?: Response })?.context?.status).toBe(502)
    await mockMode('ok')
  })

  it('branş öğretmeni, veli ve öğrenci çağıramaz', async () => {
    const p = aiPayload(reportData(ds, ELIF, lastExam())!)
    for (const who of ['matematik', 'veliElif', 'elif'] as const) {
      const r = await invoke(await signIn(who), { student_id: ELIF, payload: p })
      expect((r.error as { context?: Response })?.context?.status, who).toBe(403)
    }
  })

  it('kişi başı günlük kota ve okul aylık harcama tavanı aşılınca 429', async () => {
    const svc = service()
    const p = aiPayload(reportData(ds, ELIF, lastExam())!)
    const rows = Array.from({ length: 60 }, () => ({ user_id: REHBER_ID, fn: 'ai-veli-raporu', ok: true, cost_usd: 0 }))
    await svc.from('ai_usage').insert(rows)
    const r = await invoke(rehber, { student_id: ELIF, payload: p })
    expect((r.error as { context?: Response })?.context?.status).toBe(429)
    const iso = await svc.from('ai_usage').select('id').eq('user_id', REHBER_ID).eq('fn', 'ai-veli-raporu').order('id', { ascending: false }).limit(60)
    await svc.from('ai_usage').delete().in('id', iso.data!.map((x) => x.id))

    const { data: sc } = await svc.from('schools').select('id, settings').single()
    await svc.from('schools').update({ settings: { ...sc!.settings, ai: { monthlyUsd: 0 } } }).eq('id', sc!.id)
    const r2 = await invoke(rehber, { student_id: ELIF, payload: p })
    expect((r2.error as { context?: Response })?.context?.status).toBe(429)
    await svc.from('schools').update({ settings: sc!.settings }).eq('id', sc!.id)
  })

  it('günlük harcama eşiği aşılınca adminlere bir kez uyarı', async () => {
    const svc = service()
    const before = await snap()
    await svc.from('ai_usage').insert({ user_id: REHBER_ID, fn: 'ai-veli-raporu', ok: true, cost_usd: 0.7 })
    await svc.from('ai_usage').insert({ user_id: REHBER_ID, fn: 'ai-veli-raporu', ok: true, cost_usd: 0.7 })
    await svc.from('ai_usage').insert({ user_id: REHBER_ID, fn: 'ai-veli-raporu', ok: true, cost_usd: 0.7 })
    const { data } = await svc.from('notifications').select('id, text').eq('user_id', '00000000-0000-4000-8003-000000000001')
    const alarms = data!.filter((n) => !before.has(n.id) && n.text.startsWith('Yapay zekâ harcaması bugün'))
    expect(alarms).toHaveLength(1)
  })

  it('eski isim endpointi dış sağlayıcıya kişisel veri göndermez', async () => {
    await mockReset()
    const { error } = await rehber.functions.invoke('ai-isim-duzelt', { body: { read: ['Zegnep Kya'], roster: ['Zeynep Kaya', 'Zehra Kaya'] } })
    expect(error).not.toBeNull()
    expect(await mockLog()).toEqual([])
  })})

describe('Rapor kaydet / gönder', () => {
  it('rehber yorumu şifreli saklanır; yalnız rehber ve raporu alan veli okur', async () => {
    const eid = lastExam()
    const { data: r, error } = await rehber
      .from('reports')
      .insert({ type: 'veli', student_id: ELIF, exam_id: eid, body: { genel: 'x', guclu: 'y', gelisim: 'z', oneriler: 'a', mentor: 'm', rehber: 'Rehber gözlemi: planlı çalışıyor.' }, created_by: REHBER_ID })
      .select('id, body')
      .single()
    expect(error).toBeNull()
    expect(r!.body.rehber).toBeUndefined()
    const { data: raw } = await service().from('reports').select('rehber_enc').eq('id', r!.id).single()
    expect(String(raw!.rehber_enc)).not.toContain('planlı')
    expect((await rehber.from('reports_view').select('rehber').eq('id', r!.id).single()).data!.rehber).toBe('Rehber gözlemi: planlı çalışıyor.')

    const veli = await signIn('veliElif')
    const elif = await signIn('elif')
    expect((await veli.from('reports_view').select('id').eq('id', r!.id)).data).toEqual([]) // taslak görünmez

    const before = await snap()
    expect((await rehber.rpc('send_report', { p_report: r!.id, p_parent: true, p_student: false })).data).toBe(1)
    expect(await notesOf(veli, before)).toContainEqual(expect.stringMatching(/ gelişim raporu geldi: Elif Yıldız$/))
    expect((await veli.from('reports_view').select('rehber').eq('id', r!.id).single()).data!.rehber).toBe('Rehber gözlemi: planlı çalışıyor.')
    expect((await elif.from('reports_view').select('id').eq('id', r!.id)).data).toEqual([]) // öğrenciye gönderilmedi
    expect((await (await signIn('veliKerem')).from('reports_view').select('id').eq('id', r!.id)).data).toEqual([])
    expect((await rehber.rpc('send_report', { p_report: r!.id })).error?.message).toBe('En az bir alıcı seç.')
  })

  it('öğretmen raporu yalnız seçilen öğretmene gider; diğer öğretmen ve veli göremez', async () => {
    const mat = await signIn('matematik')
    const { data: m } = await mat.auth.getUser()
    const { data: r } = await rehber.from('reports').insert({ type: 'ogretmen', student_id: sid('1185'), exam_id: lastExam(), body: { toplanti: 'Gündem' }, created_by: REHBER_ID }).select('id').single()
    const before = await snap()
    expect((await rehber.rpc('send_report', { p_report: r!.id, p_users: [m.user!.id] })).data).toBe(1)
    expect(await notesOf(mat, before)).toEqual(['Selin Aksoy öğretmen raporu paylaştı: Ayşe Çelik · ' + ds.exams.at(-1)!.name])
    expect((await mat.from('reports_view').select('body').eq('id', r!.id).single()).data!.body).toEqual({ toplanti: 'Gündem' })
    expect((await (await signIn('fen')).from('reports_view').select('id').eq('id', r!.id)).data).toEqual([]) // alıcı değil
    expect((await (await signIn('veliElif')).from('reports_view').select('id').eq('id', r!.id)).data).toEqual([])
    expect((await mat.rpc('send_report', { p_report: r!.id, p_users: [m.user!.id] })).error?.code).toBe('42501')
  })
})
