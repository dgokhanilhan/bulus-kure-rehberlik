// ai-veli-raporu: anonim deneme verisinden veli raporu metni üretir (docs/veli-raporu-kurallari.md).
// Modele KİŞİSEL VERİ GİTMEZ: ad yerine {AD} yazılır, gerçek ad cevaba sunucuda eklenir.
// Çıktı şemaya ve yasak ifade filtresine göre doğrulanır; başarısızsa 422 → istemci kural tabanlı taslakta kalır.
import { RULES, fillName, fixHint, validatePayload, validateReport } from '../_shared/rapor-ai.ts'
import { chat, guard, json, logUsage } from '../_shared/ai.ts'

Deno.serve(async (req) => {
  const g = await guard(req, 'ai-veli-raporu')
  if (g instanceof Response) return g
  const body = await req.json().catch(() => null)
  const sid = body?.student_id
  if (typeof sid !== 'string') return json({ error: 'student_id' }, 400)

  // Ad, çağıranın yetkisiyle (RLS) okunur ve yalnız cevaba eklenir.
  const { data: st } = await g.user.from('students').select('full_name').eq('id', sid).maybeSingle()
  if (!st) return json({ error: 'forbidden' }, 403)
  const { data: outs } = await g.svc.from('outcomes').select('title')
  const err = validatePayload(body.payload, new Set((outs ?? []).map((o: { title: string }) => o.title)))
  if (err) return json({ error: `payload: ${err}` }, 400)

  const messages = [
    { role: 'system', content: RULES },
    { role: 'user', content: JSON.stringify({ veri: body.payload }) },
  ]
  const t0 = Date.now()
  let inTok = 0, outTok = 0, errors: string[] = ['upstream']
  // En çok 3 deneme: kurala uymayan cevapta modele nedeni söylenir, düzeltip yeniden yazar.
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await chat(messages, 0.7, 3000)
    inTok += r.inTok
    outTok += r.outTok
    if (r.text === null) continue
    const v = validateReport(r.text)
    if (v.ok) {
      await logUsage(g.svc, g.uid, 'ai-veli-raporu', inTok, outTok, true, Date.now() - t0)
      return json({ report: fillName(v.report, st.full_name.trim().split(/\s+/)[0]) })
    }
    errors = v.errors
    console.warn('ai-veli-raporu reddedildi', attempt, errors.join(','))
    messages.push({ role: 'assistant', content: r.text }, { role: 'user', content: fixHint(errors) })
  }
  await logUsage(g.svc, g.uid, 'ai-veli-raporu', inTok, outTok, false, Date.now() - t0)
  return json({ error: errors.includes('upstream') ? 'upstream' : 'filtered', detail: errors }, errors.includes('upstream') ? 502 : 422)
})
