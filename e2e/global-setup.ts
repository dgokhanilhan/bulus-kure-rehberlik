import { cleanupTestData, serverNow } from '../tests/cleanup'
import { readFileSync } from 'node:fs'
// @ts-expect-error — saf JS betik
import { start as startMock } from '../scripts/sahte-deepseek.mjs'

export default async function setup() {
  if (process.env.E2E_DIST === '1') {
    const headers = readFileSync('dist/_headers', 'utf8')
    const origin = new URL(process.env.VITE_SUPABASE_URL!).origin
    if (!headers.includes(`connect-src 'self' ${origin} `)) throw new Error('Derleme test veritabanına bağlı değil. Önce npm run build -- --mode development çalıştır.')
  }
  const since = await serverNow(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!)
  const mock = await startMock().catch(() => null)
  return async () => {
    await cleanupTestData(process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, since)
    mock?.close()
  }
}
