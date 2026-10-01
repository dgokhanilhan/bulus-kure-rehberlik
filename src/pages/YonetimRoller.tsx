// Yönetim → kişi düzenleme → Roller (0020): tek hesapta öğretmen + veli.
// Rol ekleme/kaldırma yalnız admin_add_role / admin_remove_role ile (yönetici + aal2, işlem kaydı); ilişkiler sessizce silinmez.
import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAssignments, useClasses, useCourses, useStudents } from '@/lib/data'
import { BRANS, rolesOf, SWITCH_TR, type SwitchRole } from '@/lib/roles'
import type { Profile } from '@/lib/types'
import { Modal } from '@/components/Modal'
import { Icon } from '@/components/Icon'
import { useToast } from '@/components/Toast'
import { AssignmentPicker, StudentPicker, type AssignRow, type KidRow } from './YonetimDavet'

const ROLE_NAME: Record<string, string> = { admin: 'Yönetici', ogretmen: 'Öğretmen', veli: 'Veli', ogrenci: 'Öğrenci' }

function useReload() {
  const qc = useQueryClient()
  return () => {
    for (const k of ['yonetim', 'people', 'teaching_assignments', 'classes', 'person-links', 'person-roles']) qc.invalidateQueries({ queryKey: [k] })
  }
}

function usePersonLinks(id: string) {
  return useQuery({
    queryKey: ['person-links', id],
    queryFn: async () => {
      const { data, error } = await supabase.from('parent_links').select('student_id, relation').eq('parent_id', id)
      if (error) throw error
      return data as { student_id: string; relation: string | null }[]
    },
  })
}

function usePersonRoles(p: Profile) {
  return useQuery({
    queryKey: ['person-roles', p.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('profile_roles').select('role').eq('profile_id', p.id)
      if (error) throw error
      return (data ?? []).map((r) => r.role as string)
    },
  })
}

/** Kişi düzenleme penceresindeki "Roller" bölümü. */
export function RolesSection({ p }: { p: Profile }) {
  const live = usePersonRoles(p)
  const roles = live.data?.length ? live.data : rolesOf(p)
  const toast = useToast()
  const reload = useReload()
  const links = usePersonLinks(p.id)
  const students = useStudents()
  const assigns = useAssignments()
  const classes = useClasses()
  const courses = useCourses()
  const [add, setAdd] = useState<SwitchRole | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const stu = (id: string) => students.data?.find((s) => s.id === id)
  const mine = (assigns.data ?? []).filter((a) => a.teacher_id === p.id)
  const missing: SwitchRole | null = p.role === 'ogretmen' && !roles.includes('veli') ? 'veli' : p.role === 'veli' && !roles.includes('ogretmen') ? 'ogretmen' : null

  async function remove(r: string) {
    setErr(null)
    setBusy(true)
    const { error } = await supabase.rpc('admin_remove_role', { p_profile: p.id, p_role: r })
    setBusy(false)
    if (error) return setErr(error.message)
    toast(`${p.full_name}: ${ROLE_NAME[r]} rolü kaldırıldı`)
    reload()
  }

  return (
    <section className="stack" style={{ gap: 8, borderTop: '1px solid var(--line)', paddingTop: 12 }} aria-label="Roller">
      <span className="label">Roller</span>
      <div className="btns">
        {roles.map((r) => (
          <span key={r} className="chip up" style={{ paddingRight: r === p.role ? undefined : 4 }}>
            ✓ {ROLE_NAME[r]}
            {r === p.role ? (
              <span className="m" style={{ fontSize: 11, marginLeft: 4 }}>
                (ana rol)
              </span>
            ) : (
              <button type="button" className="xbtn" style={{ width: 22, height: 22 }} disabled={busy} onClick={() => remove(r)} aria-label={`${ROLE_NAME[r]} rolünü kaldır`}>
                <Icon name="x" size={12} stroke={2.6} />
              </button>
            )}
          </span>
        ))}
        {missing && (
          <button type="button" className="btn sm" onClick={() => setAdd(missing)}>
            <Icon name="plus" size={15} /> {SWITCH_TR[missing]} rolü ekle
          </button>
        )}
      </div>
      {roles.includes('veli') && (
        <div style={{ fontSize: 14 }}>
          <span className="m" style={{ fontSize: 12 }}>
            Veli bağlantıları
          </span>
          {(links.data ?? []).length ? (
            <ul style={{ margin: '2px 0 0', paddingLeft: 18 }}>
              {links.data!.map((l) => (
                <li key={l.student_id}>
                  {stu(l.student_id)?.full_name ?? 'Öğrenci'} · {stu(l.student_id)?.class_name} · {l.relation ?? 'Veli'}
                </li>
              ))}
            </ul>
          ) : (
            <div className="m">Bağlı öğrenci yok</div>
          )}
        </div>
      )}
      {roles.includes('ogretmen') && (
        <div style={{ fontSize: 14 }}>
          <span className="m" style={{ fontSize: 12 }}>
            Öğretmen atamaları
          </span>
          {mine.length ? (
            <ul style={{ margin: '2px 0 0', paddingLeft: 18 }}>
              {mine.map((a) => (
                <li key={a.id}>
                  {classes.data?.find((c) => c.id === a.class_id)?.name} {courses.data?.find((c) => c.id === a.course_id)?.name}
                </li>
              ))}
            </ul>
          ) : (
            <div className="m">Ders ataması yok</div>
          )}
        </div>
      )}
      {err && (
        <div className="err" role="alert">
          {err}
        </div>
      )}
      {add && <AddRoleModal p={p} role={add} onClose={() => setAdd(null)} />}
    </section>
  )
}

function AddRoleModal({ p, role, onClose }: { p: Profile; role: SwitchRole; onClose: () => void }) {
  const toast = useToast()
  const reload = useReload()
  const students = useStudents()
  const classes = useClasses()
  const [kids, setKids] = useState<KidRow[]>([{ student_id: '', relation: 'Anne' }])
  const [rows, setRows] = useState<AssignRow[]>([])
  const [branch, setBranch] = useState('Matematik')
  const [homeroom, setHomeroom] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function save() {
    setErr(null)
    const payload =
      role === 'veli'
        ? { students: kids.filter((k) => k.student_id) }
        : { branch, assignments: rows.filter((r) => r.class_id && r.course_id), homeroom_class_id: homeroom || null }
    if (role === 'veli' && !payload.students!.length) return setErr('En az bir öğrenci seç.')
    setBusy(true)
    const { error } = await supabase.rpc('admin_add_role', { p_profile: p.id, p_role: role, p: payload })
    setBusy(false)
    if (error) return setErr(error.message)
    toast(`${p.full_name}: ${SWITCH_TR[role]} rolü eklendi`)
    reload()
    onClose()
  }

  return (
    <Modal
      title={`${SWITCH_TR[role]} rolü ekle`}
      sub={`${p.full_name} aynı hesapla ${role === 'veli' ? 'veli' : 'öğretmen'} olarak da girebilir; girişte ve profil menüsünde rolünü seçer. Yeni hesap açılmaz.`}
      avatar={p.full_name}
      width={620}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Vazgeç
          </button>
          <button className="btn pri" onClick={save} disabled={busy}>
            {busy && <span className="spinner" aria-hidden="true" />} Rolü ekle
          </button>
        </>
      }
    >
      {role === 'veli' ? (
        <StudentPicker students={students.data ?? []} kids={kids} setKids={setKids} />
      ) : (
        <>
          <div className="grid2">
            <label className="field" htmlFor="rBranch">
              Branş / görev
              <select id="rBranch" value={branch} onChange={(e) => setBranch(e.target.value)}>
                {BRANS.map((b) => (
                  <option key={b}>{b}</option>
                ))}
              </select>
            </label>
            <label className="field" htmlFor="rHome">
              Sınıf öğretmenliği (isteğe bağlı)
              <select id="rHome" value={homeroom} onChange={(e) => setHomeroom(e.target.value)}>
                <option value="">Yok</option>
                {(classes.data ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <AssignmentPicker rows={rows} setRows={setRows} branch={branch} />
        </>
      )}
      {err && (
        <div className="err" role="alert">
          {err}
        </div>
      )}
    </Modal>
  )
}
