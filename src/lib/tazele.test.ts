import { describe, expect, it } from 'vitest'
import { QueryClient, QueryObserver } from '@tanstack/react-query'
import { tazele } from './tazele'

describe('tazele', () => {
  it('ilk yükleme sürerken yapılan değişiklik listeye yansır (eski isteğe katılmaz)', async () => {
    const qc = new QueryClient()
    let db = ['TG-1']
    const queryFn = () => {
      const snap = [...db]
      return new Promise<string[]>((r) => setTimeout(() => r(snap), 30))
    }
    const obs = new QueryObserver(qc, { queryKey: ['exams-list'], queryFn })
    const unsub = obs.subscribe(() => {})
    db = [...db, 'Elle'] // ilk istek sürerken yeni kayıt
    await tazele(qc, ['exams-list'])
    expect(qc.getQueryData(['exams-list'])).toEqual(['TG-1', 'Elle'])
    unsub()
  })

  it('düz invalidate bu durumda eski veriyi bırakır (düzeltmenin nedeni)', async () => {
    const qc = new QueryClient()
    let db = ['TG-1']
    const queryFn = () => {
      const snap = [...db]
      return new Promise<string[]>((r) => setTimeout(() => r(snap), 30))
    }
    const obs = new QueryObserver(qc, { queryKey: ['exams-list'], queryFn })
    const unsub = obs.subscribe(() => {})
    db = [...db, 'Elle']
    await qc.invalidateQueries({ queryKey: ['exams-list'] })
    expect(qc.getQueryData(['exams-list'])).toEqual(['TG-1'])
    unsub()
  })
})
