import { describe, expect, it } from 'vitest'
import { qrCanContinue, type BoardQrChallenge } from '../src/lib/akilliYoklamaQr'

const challenge: BoardQrChallenge = {
  challenge_id: 'sample-challenge',
  pairing_url: 'https://example.invalid/pair/sample-challenge',
  expires_at: '2026-11-17T09:05:00Z',
  state: 'approved',
}

describe('QR eşleştirme durum kontrolü', () => {
  it('yalnız süresi dolmamış onayı kabul eder', () => {
    expect(qrCanContinue(challenge, new Date('2026-11-17T09:04:59Z'))).toBe(true)
    expect(qrCanContinue(challenge, new Date('2026-11-17T09:05:00Z'))).toBe(false)
  })
  it('bekleyen ve reddedilen eşleştirmeyi kabul etmez', () => {
    expect(qrCanContinue({ ...challenge, state: 'waiting' }, new Date('2026-11-17T09:04:00Z'))).toBe(false)
    expect(qrCanContinue({ ...challenge, state: 'denied' }, new Date('2026-11-17T09:04:00Z'))).toBe(false)
  })
  it('geçersiz son kullanma tarihini kabul etmez', () => {
    expect(qrCanContinue({ ...challenge, expires_at: 'invalid' }, new Date())).toBe(false)
  })
})
