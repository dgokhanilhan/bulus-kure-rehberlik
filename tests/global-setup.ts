import { loadEnv } from 'vite'
import { cleanupTestData, serverNow } from './cleanup'
// @ts-expect-error — saf JS betik
import { start as startMock } from '../scripts/sahte-deepseek.mjs'

// RLS testleri yerel Supabase'e karşı çalışır. Çalışmıyorsa net bir mesajla dur.
export default async function setup() {
  const env = loadEnv('development', process.cwd(), '')
  const url = env.VITE_SUPABASE_URL
  if (!url || !env.VITE_SUPABASE_ANON_KEY || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('.env.local eksik. `supabase status -o env` değerlerini .env.example düzeninde .env.local dosyasına yaz.')
  }
  if (!/^http:\/\/(127\.0\.0\.1|localhost)/.test(url)) {
    throw new Error(`Testler yalnız yerel Supabase'e karşı çalışır (şu an: ${url}).`)
  }
  try {
    await fetch(`${url}/auth/v1/health`, { headers: { apikey: env.VITE_SUPABASE_ANON_KEY } })
  } catch {
    throw new Error('Yerel Supabase çalışmıyor. Önce `supabase start` ve `supabase db reset` çalıştır.')
  }
  const fn = await fetch(`${url}/functions/v1/ai-veli-raporu`, { method: 'OPTIONS' }).catch(() => null)
  if (!fn || fn.status === 404) throw new Error('Edge Function sunucusu çalışmıyor. Ayrı bir terminalde `npm run functions` çalıştır.')
  const since = await serverNow(url, env.VITE_SUPABASE_ANON_KEY)
  // Sahte DeepSeek (Edge Function'lar supabase/functions/.env ile buna bağlanır). Zaten çalışıyorsa onu kullan.
  const mock = await startMock().catch(() => null)
  return async () => {
    await cleanupTestData(url, env.SUPABASE_SERVICE_ROLE_KEY!, since)
    mock?.close()
  }
}
