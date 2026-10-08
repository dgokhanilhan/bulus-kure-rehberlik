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
  // Yalnız RLS ile görülebilen katalog metinleri. İstemcinin serbest metni onaylanmış sayılmaz.
  const requested = ['guvenilirTekrarEdenHatalar','buDenemedeYanlisKonular'].flatMap(key => Array.isArray(body.payload?.[key]) ? body.payload[key].slice(0,80).map((r: {konu?: unknown})=>r?.konu).filter((t: unknown)=>typeof t==='string') : [])
  const [legacy,catalog,sections,subtests,subjects] = await Promise.all([
    g.user.from('outcomes').select('title').in('title',requested),
    g.user.from('learning_outcomes').select('title').in('title',requested),
    g.user.from('exam_template_sections').select('label').limit(1000),
    g.user.from('exam_subtests').select('display_name').limit(1000),
    g.user.from('subjects').select('name').limit(100),
  ])
  if([legacy,catalog,sections,subtests,subjects].some(r=>r.error)) return json({error:'catalog_unavailable'},503)
  const knownTopics = new Set([...legacy.data??[],...catalog.data??[]].map((o: {title:string})=>o.title))
  const knownSubjects = new Set(['Türkçe','Matematik','Fen Bilimleri','T.C. İnkılap Tarihi','Din Kültürü','İngilizce',...sections.data!.map((s:{label:string})=>s.label),...subtests.data!.map((s:{display_name:string})=>s.display_name),...subjects.data!.map((s:{name:string})=>s.name)])
  const err = validatePayload(body.payload, knownTopics, knownSubjects)
  if (err) return json({ error: `payload: ${err}` }, 400)

  const messages = [
    { role: 'system', content: RULES + '\nHedeflerde kaynak=pdf okulun deneme PDF’sinden eklediği çalışma hedefidir; resmî MEB kazanımı veya çıktısı olarak adlandırma. Resmî hedefler ile PDF hedeflerini karıştırma. Her iki kaynak da öğrencinin çalışma ihtiyacını gösterir; net ve puanı değiştirmez.' },
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
