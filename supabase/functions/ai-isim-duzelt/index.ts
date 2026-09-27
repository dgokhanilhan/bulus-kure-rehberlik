// ai-isim-duzelt: PDF'ten okunan belirsiz isimleri okul listesiyle eşleştirir (DeepSeek).
// Güvenlik: JWT zorunlu; yalnız onaylı rehber/admin (aal2); kota; anahtar yalnız secret'ta.
// Veri: yalnız isim listeleri gider. Çıktı doğrulanır, hiçbir işlem tetiklemez.
import { buildMessages, parseMatches, validateInput } from '../_shared/isim-ai.ts'
import { chat, guard, json, logUsage } from '../_shared/ai.ts'

Deno.serve(async (req) => {
  const g = await guard(req, 'ai-isim-duzelt')
  if (g instanceof Response) return g
  const input = validateInput(await req.json().catch(() => null))
  if (typeof input === 'string') return json({ error: input }, 400)

  const t0 = Date.now()
  let r = await chat(buildMessages(input.read, input.roster), 0, 2000)
  if (r.text === null) r = await chat(buildMessages(input.read, input.roster), 0, 2000) // bir yeniden deneme
  await logUsage(g.svc, g.uid, 'ai-isim-duzelt', r.inTok, r.outTok, r.text !== null, Date.now() - t0)
  if (r.text === null) return json({ error: 'upstream' }, 502)
  return json({ matches: parseMatches(r.text, input.read, input.roster) })
})
