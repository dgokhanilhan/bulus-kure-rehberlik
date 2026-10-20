import { describe, it, expect, vi } from 'vitest'
import { ZAMAN_ASIMI, sureSiniri, sureliFetch } from './sureliFetch'

// Sinyal iptal edilene kadar hiç dönmeyen istek (yanıtsız bağlantı)
const asili: typeof fetch = (_i, init) =>
  new Promise((_, rej) => init?.signal?.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError'))))

describe('süreli fetch', () => {
  it('yanıtsız istek süre dolunca açık bir hatayla düşer', async () => {
    vi.useFakeTimers()
    const p = sureliFetch(asili, () => 1000)('https://x.supabase.co/rest/v1/students')
    const beklenen = expect(p).rejects.toThrow(ZAMAN_ASIMI)
    await vi.advanceTimersByTimeAsync(1001)
    await beklenen
    vi.useRealTimers()
  })
  it('çağıranın iptali zaman aşımı sayılmaz; normal yanıt aynen döner', async () => {
    const ctl = new AbortController()
    const p = sureliFetch(asili, () => 60_000)('https://x/rest/v1/a', { signal: ctl.signal })
    ctl.abort()
    await expect(p).rejects.toThrow('aborted')
    const ok = sureliFetch(async () => new Response('tamam'), () => 1000)
    expect(await (await ok('https://x/rest/v1/a')).text()).toBe('tamam')
  })
  it('süreler: veri 30 sn, işlev 2 dk, dosya 5 dk', () => {
    expect(sureSiniri('https://x/rest/v1/exam_results')).toBe(30_000)
    expect(sureSiniri('https://x/auth/v1/token')).toBe(30_000)
    expect(sureSiniri('https://x/functions/v1/ai-veli-raporu')).toBe(120_000)
    expect(sureSiniri('https://x/storage/v1/object/dosyalar/a.pdf')).toBe(300_000)
  })
})
