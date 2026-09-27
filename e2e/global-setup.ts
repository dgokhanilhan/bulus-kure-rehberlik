import { cleanupTestData, serverNow } from '../tests/cleanup'
// @ts-expect-error — saf JS betik
import { start as startMock } from '../scripts/sahte-deepseek.mjs'

export default async function setup() {
  const since = await serverNow(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!)
  const mock = await startMock().catch(() => null)
  return async () => {
    await cleanupTestData(process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, since)
    mock?.close()
  }
}
