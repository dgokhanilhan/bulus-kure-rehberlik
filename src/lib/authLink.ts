export function passwordLinkUser(hash: string): string | null {
  const p = new URLSearchParams(hash.replace(/^#/, ''))
  if (p.has('error') || p.has('error_code') || !['invite', 'recovery'].includes(p.get('type') ?? '') || !p.get('refresh_token')) return null
  try {
    const payload = p.get('access_token')!.split('.')[1]!
    const sub = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))).sub
    return typeof sub === 'string' && /^[0-9a-f-]{36}$/i.test(sub) ? sub : null
  } catch { return null }
}
