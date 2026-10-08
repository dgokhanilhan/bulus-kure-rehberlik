import { expect, it } from 'vitest'
import { passwordLinkUser } from './authLink'
it('yalnız tam kurtarma/davet bağlantısını hedef hesap kimliğine bağlar', () => {
  const sub = '00000000-0000-4000-8000-000000000001'
  const token = `x.${btoa(JSON.stringify({ sub }))}.x`
  const link = `#type=recovery&access_token=${token}&refresh_token=x`
  expect(passwordLinkUser(link)).toBe(sub)
  expect(passwordLinkUser(link.replace('recovery', 'recovery-fake'))).toBeNull()
  expect(passwordLinkUser(link + '&error_code=otp_expired')).toBeNull()
  expect(passwordLinkUser('#type=recovery')).toBeNull()
})
