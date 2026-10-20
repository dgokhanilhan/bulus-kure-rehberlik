// Açık rıza (0057): aydınlatmadan ayrı onay; kayıtta zorunlu, mevcut/davetli hesapta ilk girişte; işlem kaydına yazılır.
import { describe, expect, it } from 'vitest'
import { anon, service, signIn } from './helpers'

const svc = service()
const meta = (x: object) => ({ school: 'bulus-kure', full_name: 'Rıza Deneme', role: 'ogretmen', branch: 'Matematik', consent_version: 'KVKK-1.2', ...x })

describe('açık rıza', () => {
  it('kayıt açık rıza olmadan reddedilir; onaylı kayıtta sürüm ve zaman kaydedilir', async () => {
    const e1 = `e2e-riza-yok-${Date.now()}@ornek.com`
    const yok = await anon().auth.signUp({ email: e1, password: 'Deneme123!', options: { data: meta({}) } })
    expect(yok.error?.message ?? '').toMatch(/Açık rıza metni onaylanmalı|Database error/)
    const e2 = `e2e-riza-var-${Date.now()}@ornek.com`
    const var_ = await anon().auth.signUp({ email: e2, password: 'Deneme123!', options: { data: meta({ acik_riza_version: 'ACIK-RIZA-1.0' }) } })
    expect(var_.error).toBeNull()
    const id = var_.data.user!.id
    const p = (await svc.from('profiles').select('consent_version, acik_riza_version, acik_riza_at').eq('id', id).single()).data!
    expect(p).toMatchObject({ consent_version: 'KVKK-1.2', acik_riza_version: 'ACIK-RIZA-1.0' })
    expect(p.acik_riza_at).not.toBeNull()
    const log = (await svc.from('audit_log').select('meta').eq('action', 'acik_riza').eq('user_id', id)).data!
    expect(log[0]!.meta).toMatchObject({ version: 'ACIK-RIZA-1.0', kanal: 'kayit' })
    await svc.auth.admin.deleteUser(id)
  })

  it('mevcut hesap açık rızayı RPC ile onaylar; anonim çağıramaz', async () => {
    expect((await anon().rpc('accept_acik_riza', { p_version: 'ACIK-RIZA-1.0' })).error).not.toBeNull()
    const veli = await signIn('veliElif')
    const uid = (await veli.auth.getUser()).data.user!.id
    await svc.from('profiles').update({ acik_riza_version: null, acik_riza_at: null }).eq('id', uid)
    expect((await veli.rpc('accept_acik_riza', { p_version: 'ACIK-RIZA-1.0' })).error).toBeNull()
    const p = (await svc.from('profiles').select('acik_riza_version, acik_riza_at').eq('id', uid).single()).data!
    expect(p.acik_riza_version).toBe('ACIK-RIZA-1.0')
    expect((await svc.from('audit_log').select('id').eq('action', 'acik_riza').eq('user_id', uid)).data!.length).toBeGreaterThan(0)
  })
})
