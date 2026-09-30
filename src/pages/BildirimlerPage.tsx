// Bildirim merkezi (Faz D): bütün bildirimler, türe ve okunmamışa göre süzme, hepsini okundu yapma.
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/auth/AuthProvider'
import { NTYPES, ntype, useOpenNotification } from '@/lib/notifications'
import { ago } from '@/lib/format'
import type { Notification } from '@/lib/types'
import { Seg } from '@/components/Indicator'
import { Icon } from '@/components/Icon'

export default function BildirimlerPage() {
  const { profile } = useAuth()
  const qc = useQueryClient()
  const openN = useOpenNotification()
  const [only, setOnly] = useState<'all' | 'unread'>('all')
  const [type, setType] = useState('all')
  const q = useQuery({
    queryKey: ['notifications', profile?.id, 'all'],
    queryFn: async () => {
      const { data, error } = await supabase.from('notifications').select('id, text, link, read_at, created_at, type').order('created_at', { ascending: false }).limit(300)
      if (error) throw error
      return data as Notification[]
    },
  })
  const mark = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase.from('notifications').update({ read_at: new Date().toISOString() }).in('id', ids)
      if (error) throw error
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  })
  const all = q.data ?? []
  const types = [...new Set(all.map((n) => n.type ?? 'diger'))]
  const list = all.filter((n) => (only === 'all' || !n.read_at) && (type === 'all' || (n.type ?? 'diger') === type))
  const unread = all.filter((n) => !n.read_at)

  return (
    <>
      <div className="head a">
        <h1 className="hd">Bildirimler</h1>
        <button className="btn" disabled={!unread.length} onClick={() => mark.mutate(unread.map((n) => n.id))}>
          <Icon name="check" size={16} /> Tümünü okundu işaretle
        </button>
      </div>
      <div className="btns a" style={{ ['--d' as string]: 1, alignItems: 'flex-end' }}>
        <Seg
          label="Okunma"
          value={only}
          onChange={setOnly}
          options={[
            ['all', 'Tümü'],
            ['unread', `Okunmamış (${unread.length})`],
          ]}
        />
        <label className="field" style={{ minWidth: 200 }}>
          <select aria-label="Bildirim türü" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="all">Bütün türler</option>
            {types.map((t) => (
              <option key={t} value={t}>
                {ntype(t).label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <section className="card a" style={{ ['--d' as string]: 2, overflow: 'hidden' }} aria-label="Bildirim listesi">
        {list.length ? (
          list.map((n) => (
            <button
              key={n.id}
              className={`nitem ${n.read_at ? '' : 'unread'}`}
              onClick={() => {
                if (!n.read_at) mark.mutate([n.id])
                openN(n)
              }}
              data-testid="notification"
            >
              <span style={{ color: 'var(--primary)', marginTop: 2 }}>
                <Icon name={ntype(n.type).icon} size={18} />
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 14 }}>{n.text}</span>
                <span className="m" style={{ fontSize: 12 }}>
                  {ntype(n.type).label} · {ago(n.created_at)}
                </span>
              </span>
            </button>
          ))
        ) : (
          <div className="empty" style={{ margin: 16 }}>
            {q.isLoading ? 'Yükleniyor…' : 'Bu süzgeçte bildirim yok.'}
          </div>
        )}
      </section>
    </>
  )
}
export { NTYPES }
