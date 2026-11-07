import { describe, expect, it } from 'vitest'
import { TEMALAR, VARSAYILAN_TEMA, temaGecerli } from './tema'

describe('tema', () => {
  it('bilinmeyen ya da boş tema varsayılana (Buluş Küre) döner', () => {
    expect(VARSAYILAN_TEMA).toBe('buluskure')
    expect(temaGecerli(null)).toBe('buluskure')
    expect(temaGecerli('')).toBe('buluskure')
    expect(temaGecerli('silinmis-tema')).toBe('buluskure')
    expect(temaGecerli('gece')).toBe('gece')
  })
  it('kimlikler benzersiz ve veritabanı biçimine uyar; ilk tema varsayılan', () => {
    const ids = TEMALAR.map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(id).toMatch(/^[a-z]{2,20}$/)
    expect(ids[0]).toBe(VARSAYILAN_TEMA)
  })
  it('her tema için CSS tanımı var (varsayılan hariç)', async () => {
    const { readFileSync } = await import('node:fs')
    const css = readFileSync('src/styles/temalar.css', 'utf8')
    for (const t of TEMALAR.filter((t) => t.id !== VARSAYILAN_TEMA)) expect(css).toContain(`[data-skin="${t.id}"] {`)
  })
})
