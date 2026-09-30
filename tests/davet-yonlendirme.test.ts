// admin-davet yönlendirme güvenliği: davet ve yeniden gönderme bağlantısı yalnız okulun alan adına gider.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { service, signInAdminAal2 } from './helpers'
import { SITE_ORIGIN, safeRedirect } from '../supabase/functions/admin-davet/redirect'

describe('safeRedirect', () => {
  const LOCAL = 'http://localhost:5173, http://127.0.0.1:4173/'
  it('verilmezse ya da geçersizse okulun adresi', () => {
    expect(safeRedirect(undefined)).toBe(SITE_ORIGIN)
    expect(safeRedirect(null)).toBe(SITE_ORIGIN)
    expect(safeRedirect(42)).toBe(SITE_ORIGIN)
    expect(safeRedirect('')).toBe(SITE_ORIGIN)
  })
  it('okulun adresi kabul edilir; sondaki / kaldırılır', () => {
    expect(safeRedirect('https://buluskurementor.com')).toBe('https://buluskurementor.com')
    expect(safeRedirect('https://buluskurementor.com/')).toBe('https://buluskurementor.com')
  })
  it('başka alan adı ve benzeri adresler kabul edilmez', () => {
    for (const bad of [
      'https://example.com',
      'http://example.com',
      'https://evil.example',
      'http://buluskurementor.com',
      'https://buluskurementor.com.evil.example',
      'https://evil.example/buluskurementor.com',
      'https://buluskurementor.com@evil.example',
      'https://www.buluskurementor.com',
      'https://buluskurementor.com/yol',
      '//evil.example',
      'javascript:alert(1)',
    ])
      expect(safeRedirect(bad, LOCAL), bad).toBe(SITE_ORIGIN)
  })
  it('yerel liste yalnız localhost / 127.0.0.1 ekleyebilir', () => {
    expect(safeRedirect('http://localhost:5173/', LOCAL)).toBe('http://localhost:5173')
    expect(safeRedirect('http://127.0.0.1:4173', LOCAL)).toBe('http://127.0.0.1:4173')
    expect(safeRedirect('http://localhost:9999', LOCAL)).toBe(SITE_ORIGIN) // listede yok
    expect(safeRedirect('http://localhost:5173')).toBe(SITE_ORIGIN) // yerel liste yok (canlı)
    expect(safeRedirect('https://example.com', 'https://example.com')).toBe(SITE_ORIGIN) // listeye yazılsa da yok sayılır
  })
})

// Uçtan uca: fonksiyonun gönderdiği e-postadaki bağlantının redirect_to değeri (Mailpit).
const svc = service()
let admin: SupabaseClient
const stamp = Date.now()
const MAIL = `http://127.0.0.1:${process.env.MAILPIT_PORT ?? 54324}`
const emails: string[] = []
const invite = (body: Record<string, unknown>) => admin.functions.invoke('admin-davet', { body })

async function redirectOf(to: string, n = 1): Promise<string> {
  for (let i = 0; i < 30; i++) {
    const s = await (await fetch(`${MAIL}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`)).json()
    if ((s.messages ?? []).length >= n) {
      const full = await (await fetch(`${MAIL}/api/v1/message/${s.messages[0].ID}`)).json()
      const href = /href="([^"]*\/verify\?[^"]*)"/.exec(full.HTML ?? '')![1]!.replace(/&amp;/g, '&')
      return new URL(href).searchParams.get('redirect_to') ?? ''
    }
    await new Promise((r) => setTimeout(r, 300))
  }
  throw new Error(`${to} için e-posta gelmedi`)
}
async function teacher(key: string, redirect_to?: string) {
  const email = `yonlendirme-${key}-${stamp}@ornek.com`
  emails.push(email)
  const { error } = await invite({ role: 'ogretmen', full_name: 'Yönlendirme Deneme', email, branch: 'Fizik', ...(redirect_to !== undefined ? { redirect_to } : {}) })
  expect(error).toBeNull()
  return email
}

beforeAll(async () => {
  admin = await signInAdminAal2()
})
afterAll(async () => {
  for (const e of emails) {
    const { data } = await svc.from('profiles').select('id').eq('email', e).maybeSingle()
    if (data) await svc.auth.admin.deleteUser(data.id)
  }
})

describe('Davet e-postasındaki yönlendirme', () => {
  it('verilmezse okulun adresi', async () => {
    expect(await redirectOf(await teacher('yok'))).toBe(SITE_ORIGIN)
  })
  it('okulun adresi (sonda / ile de) kabul edilir', async () => {
    expect(await redirectOf(await teacher('site', 'https://buluskurementor.com'))).toBe(SITE_ORIGIN)
    expect(await redirectOf(await teacher('site2', 'https://buluskurementor.com/'))).toBe(SITE_ORIGIN)
  })
  it('https://example.com ve http://example.com kabul edilmez', async () => {
    expect(await redirectOf(await teacher('https', 'https://example.com'))).toBe(SITE_ORIGIN)
    expect(await redirectOf(await teacher('http', 'http://example.com'))).toBe(SITE_ORIGIN)
  })
  it('daveti yeniden göndermede de aynı kural', async () => {
    const email = await teacher('tekrar', 'https://buluskurementor.com')
    await redirectOf(email)
    const { data: p } = await svc.from('profiles').select('id').eq('email', email).single()
    const { error } = await invite({ action: 'resend', user_id: p!.id, redirect_to: 'https://evil.example' })
    expect(error).toBeNull()
    expect(await redirectOf(email, 2)).toBe(SITE_ORIGIN)
  })
})
