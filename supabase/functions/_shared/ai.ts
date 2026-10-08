// Edge Function ortak parçaları: CORS, kimlik/rol, kota, DeepSeek çağrısı, kullanım kaydı.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'

export const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
export const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

/** JWT + onaylı rehber/admin (admin için aal2) + kota. Başarısızsa Response döner. */
export async function guard(req: Request, fn: string): Promise<{ user: SupabaseClient; svc: SupabaseClient; uid: string } | Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'method' }, 405)
  const url = Deno.env.get('SUPABASE_URL')!
  const user = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    auth: { persistSession: false },
  })
  const { data: u } = await user.auth.getUser()
  if (!u.user) return json({ error: 'unauthorized' }, 401)
  const { data: staff } = await user.rpc('is_staff')
  if (staff !== true) return json({ error: 'forbidden' }, 403)
  const svc = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
  const { data: quota, error: quotaError } = await svc.rpc('ai_quota_check', { p_user: u.user.id, p_fn: fn })
  if (quotaError) return json({ error: 'quota_unavailable' }, 503)
  if (quota) return json({ error: 'quota', kind: quota }, 429)
  if (!Deno.env.get('DEEPSEEK_API_KEY')) return json({ error: 'not_configured' }, 503)
  return { user, svc, uid: u.user.id }
}

export interface ChatResult {
  text: string | null
  inTok: number
  outTok: number
}

/** DeepSeek (OpenAI uyumlu) çağrısı: 30 sn zaman aşımı. Anahtar yalnız secret'ta. */
export async function chat(messages: unknown[], temperature: number, maxTokens: number): Promise<ChatResult> {
  const base = Deno.env.get('DEEPSEEK_BASE_URL') ?? 'https://api.deepseek.com'
  try {
    const res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      signal: AbortSignal.timeout(30_000),
      headers: { Authorization: `Bearer ${Deno.env.get('DEEPSEEK_API_KEY')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: Deno.env.get('DEEPSEEK_MODEL') ?? 'deepseek-flash', messages, response_format: { type: 'json_object' }, temperature, max_tokens: maxTokens }),
    })
    if (!res.ok) return { text: null, inTok: 0, outTok: 0 }
    const b = await res.json()
    return { text: b.choices?.[0]?.message?.content ?? null, inTok: b.usage?.prompt_tokens ?? 0, outTok: b.usage?.completion_tokens ?? 0 }
  } catch {
    return { text: null, inTok: 0, outTok: 0 }
  }
}

// Fiyat (USD / 1M token) ortamdan değiştirilebilir.
const PRICE_IN = Number(Deno.env.get('AI_PRICE_IN') ?? 0.3)
const PRICE_OUT = Number(Deno.env.get('AI_PRICE_OUT') ?? 1.2)

export async function logUsage(svc: SupabaseClient, uid: string, fn: string, inTok: number, outTok: number, ok: boolean, ms: number) {
  await svc.from('ai_usage').insert({ user_id: uid, fn, input_tokens: inTok, output_tokens: outTok, cost_usd: (inTok * PRICE_IN + outTok * PRICE_OUT) / 1_000_000, ok, ms })
}
