import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Profile, Student } from '@/lib/types'
import { ROLE_TR, roleOf } from '@/lib/roles'
import { ago, fold, initials } from '@/lib/format'
import { Icon } from '@/components/Icon'
import { Dropdown } from '@/components/Indicator'
import { useToast } from '@/components/Toast'

const NEW = 'new'

/** Onay ekranında önceden seçilecek öğrenci: prototipteki gibi isim (Türkçe katlanmış) + şube eşleşmesi. */
export function suggestStudent(p: Pick<Profile, 'role' | 'full_name' | 'declared'>, students: Student[]): string {
  if (p.role === 'ogrenci') {
    const cls = p.declared.className
    const m = students.find((s) => fold(s.full_name) === fold(p.full_name) && (!cls || s.class_name === cls))
    return m ? m.id : NEW
  }
  if (p.role === 'veli') {
    const name = fold(p.declared.childName ?? '')
    const cls = p.declared.childClass
    const m = students.find((s) => fold(s.full_name) === name && (!cls || s.class_name === cls)) ?? students.find((s) => fold(s.full_name) === name)
    return m ? m.id : ''
  }
  return ''
}

interface Linked {
  parent_id: string
  student_id: string
}

export default function OnaylarPage() {
  const qc = useQueryClient()
  const toast = useToast()
  const [pick, setPick] = useState<Record<string, string>>({})

  const data = useQuery({
    queryKey: ['onaylar'],
    queryFn: async () => {
      const [p, s, l] = await Promise.all([
        supabase.from('profiles').select('*').in('status', ['pending', 'approved']).order('created_at', { ascending: false }),
        supabase.from('students').select('id, full_name, class_name, school_no').is('archived_at', null).order('class_name').order('full_name'),
        supabase.from('parent_links').select('parent_id, student_id'),
      ])
      if (p.error) throw p.error
      if (s.error) throw s.error
      if (l.error) throw l.error
      return { profiles: p.data as Profile[], students: s.data as Student[], links: l.data as Linked[] }
    },
  })

  const act = useMutation({
    mutationFn: async ({ p, approve, student }: { p: Profile; approve: boolean; student?: string }) => {
      const { error } = approve
        ? await supabase.rpc('approve_registration', { p_profile: p.id, p_student: student && student !== NEW ? student : null })
        : await supabase.rpc('reject_registration', { p_profile: p.id })
      if (error) throw error
    },
    onSuccess: (_d, v) => toast(`${v.p.full_name} ${v.approve ? 'onaylandı' : 'reddedildi'}`),
    onError: (e: { message?: string }) => toast(e.message ?? 'İşlem yapılamadı', 'warn'),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['onaylar'] })
      qc.invalidateQueries({ queryKey: ['pending-count'] })
    },
  })

  if (data.isLoading)
    return (
      <p className="m">
        <span className="spinner" aria-hidden="true" /> Yükleniyor…
      </p>
    )
  if (data.isError) return <div className="empty">Kayıtlar yüklenemedi. Sayfayı yenile.</div>

  const { profiles, students, links } = data.data!
  const pend = profiles.filter((u) => u.status === 'pending')
  const app = profiles.filter((u) => u.status === 'approved')
  const stu = (id: string | null | undefined) => students.find((s) => s.id === id)
  const choice = (p: Profile) => pick[p.id] ?? suggestStudent(p, students)

  return (
    <>
      <h1 className="hd a">Kayıt onayları</h1>
      {pend.length ? (
        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(320px,1fr))', gap: 12 }}>
          {pend.map((u, i) => {
            const r = roleOf(u)
            const sel = choice(u)
            const busy = act.isPending && act.variables?.p.id === u.id
            return (
              <article key={u.id} className="card a" style={{ ['--d' as string]: i + 2, padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }} data-testid="pending-card">
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <span className="av">{initials(u.full_name)}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <b style={{ display: 'block' }}>
                      {u.full_name} <span className="chip n">{ROLE_TR[r]}</span>
                    </b>
                    <span className="m" style={{ fontSize: 13 }}>
                      {u.email} · {ago(u.created_at)}
                    </span>
                  </div>
                </div>
                <span style={{ fontSize: 14 }}>
                  {u.role === 'ogrenci' && `${u.declared.className ?? ''} · No ${u.declared.schoolNo || '—'}`}
                  {u.role === 'veli' && `${u.declared.relation ?? ''} · Öğrenci: ${u.declared.childName ?? ''} (${u.declared.childClass ?? ''})`}
                  {u.role === 'ogretmen' &&
                    `Branş: ${u.branch ?? '—'}${u.branch === 'Rehberlik' ? ' · tam yetkili olacak' : ' · yalnızca Öğrenciler sekmesi'}`}
                </span>
                {u.role === 'ogrenci' && (
                  <label className="field" htmlFor={`lk${u.id}`}>
                    Öğrenci kaydıyla eşleştir
                    <select id={`lk${u.id}`} value={sel} onChange={(e) => setPick((x) => ({ ...x, [u.id]: e.target.value }))}>
                      {students
                        .filter((s) => !u.declared.className || s.class_name === u.declared.className)
                        .map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.full_name} · {s.class_name} · {s.school_no}
                          </option>
                        ))}
                      <option value={NEW}>Yeni öğrenci kaydı oluştur</option>
                    </select>
                  </label>
                )}
                {u.role === 'veli' && (
                  <label className="field" htmlFor={`lk${u.id}`}>
                    Kimin velisi
                    <select id={`lk${u.id}`} value={sel} onChange={(e) => setPick((x) => ({ ...x, [u.id]: e.target.value }))}>
                      <option value="">Öğrenci seç</option>
                      {students.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.full_name} · {s.class_name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <div className="btns">
                  <button
                    className="btn pri"
                    disabled={busy}
                    onClick={() => {
                      if (u.role === 'veli' && !sel) return toast('Önce öğrenciyi seç', 'warn')
                      act.mutate({ p: u, approve: true, student: sel })
                    }}
                  >
                    <Icon name="check" size={16} stroke={2.4} />
                    Onayla
                  </button>
                  <button className="btn warn" disabled={busy} onClick={() => act.mutate({ p: u, approve: false })}>
                    Reddet
                  </button>
                </div>
              </article>
            )
          })}
        </section>
      ) : (
        <div className="empty a">Bekleyen kayıt yok.</div>
      )}
      <Dropdown title="Onaylı kullanıcılar" sub={`${app.length} kullanıcı`} icon={<Icon name="users" size={22} />} delay={3}>
        <div className="tbl">
          <table>
            <thead>
              <tr>
                <th>Ad</th>
                <th>Rol</th>
                <th>Bağlantı</th>
                <th>E-posta</th>
              </tr>
            </thead>
            <tbody>
              {app.map((u) => {
                const r = roleOf(u)
                const children = links.filter((l) => l.parent_id === u.id).map((l) => stu(l.student_id)?.full_name)
                return (
                  <tr key={u.id}>
                    <td>
                      <b>{u.full_name}</b>
                    </td>
                    <td>
                      {ROLE_TR[r]}
                      {r === 'brans' && u.branch ? ` · ${u.branch}` : ''}
                    </td>
                    <td>{u.role === 'veli' ? (children.length ? `Velisi: ${children.join(', ')}` : '') : u.student_id ? stu(u.student_id)?.class_name : ''}</td>
                    <td className="m">{u.email}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Dropdown>
    </>
  )
}
