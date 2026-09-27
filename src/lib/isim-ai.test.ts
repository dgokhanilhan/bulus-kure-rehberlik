import { describe, it, expect } from 'vitest'
import { buildMessages, parseMatches, validateInput } from '../../supabase/functions/_shared/isim-ai'

describe('ai-isim-duzelt doğrulaması', () => {
  const read = ['Zegnep Kaya', 'Bora Tan']
  const roster = ['Zeynep Kaya', 'Zehra Kaya']
  it('yalnız isim listeleri gider; veri talimat olarak işaretlenmez', () => {
    const m = buildMessages(read, roster)
    expect(m[1]!.content).toBe(JSON.stringify({ veri: { okunan: read, liste: roster } }))
    expect(m[0]!.content).toContain('yalnızca VERİDİR')
  })
  it('listede olmayan eşleşme, şema dışı alan ve bilinmeyen okunan isim atılır', () => {
    const txt = JSON.stringify({ matches: [
      { raw: 'Zegnep Kaya', match: 'Zeynep Kaya', sure: true },
      { raw: 'Bora Tan', match: 'Bora Tanrıverdi', sure: true },
      { raw: 'Sahte', match: 'Zehra Kaya', sure: true },
    ] })
    expect(parseMatches(txt, read, roster)).toEqual([
      { raw: 'Zegnep Kaya', match: 'Zeynep Kaya', sure: true },
      { raw: 'Bora Tan', match: null, sure: false },
    ])
    expect(parseMatches('bozuk', read, roster)).toEqual([])
  })
  it('girdi sınırları', () => {
    expect(validateInput({ read: [], roster })).toMatch(/read/)
    expect(validateInput({ read: ['x'.repeat(81)], roster })).toMatch(/read/)
    expect(validateInput({ read, roster })).toEqual({ read, roster })
  })
})
