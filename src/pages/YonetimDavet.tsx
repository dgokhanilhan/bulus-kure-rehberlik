// Yönetim → Öğretmen ekle / Veli ekle (Faz F): Edge Function "admin-davet" hesabı açar ve davet e-postası gönderir.
// Yönetici şifre görmez ve belirlemez; kişi e-postadaki bağlantıyla şifresini kendisi belirler.
import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAssignments, useClasses, useCourses } from '@/lib/data'
import { BRANS, YAKINLIK } from '@/lib/roles'
import type { ClassRow } from '@/lib/types'
import { Modal } from '@/components/Modal'
import { Icon } from '@/components/Icon'
import { useToast } from '@/components/Toast'

async function callInvite(body: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> {
  const { data, error } = await supabase.functions.invoke('admin-davet', { body: { ...body, redirect_to: `${window.location.origin}/` } })
  if (error) {
    const ctx = (error as { context?: Response }).context
    const j = ctx ? await ctx.json().catch(() => null) : null
    return { ok: false, error: (j as { error?: string } | null)?.error ?? 'Davet gönderilemedi.' }
  }
  return { ok: !!(data as { ok?: boolean })?.ok, error: (data as { error?: string })?.error }
}

export interface UserState {
  id: string
  invited_at: string | null
  last_sign_in_at: string | null
  confirmed: boolean
}
/** Davet bekleyen hesaplar (davet edilmiş, hiç giriş yapmamış). */
export function useUserStates() {
  return useQuery({
    queryKey: ['user_states'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_user_states')
      if (error) throw error
      return new Map(((data ?? []) as UserState[]).map((x) => [x.id, x]))
    },
  })
}

export function InviteChip({ id }: { id: string }) {
  const st = useUserStates()
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const s = st.data?.get(id)
  if (!s?.invited_at || s.last_sign_in_at) return null
  return (
    <span className="btns" style={{ gap: 4 }}>
      <span className="chip gold">Davet bekliyor</span>
      <button
        className="btn sm"
        disabled={busy}
        onClick={async () => {
          setBusy(true)
          const r = await callInvite({ action: 'resend', user_id: id })
          setBusy(false)
          toast(r.ok ? 'Davet e-postası yeniden gönderildi' : r.error!, r.ok ? undefined : 'warn')
        }}
      >
        Daveti yeniden gönder
      </button>
    </span>
  )
}

function useReload() {
  const qc = useQueryClient()
  return () => ['yonetim', 'user_states', 'teaching_assignments', 'classes', 'people'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }))
}

export function InviteTeacherModal({ onClose }: { onClose: () => void }) {
  const classes = useClasses()
  const toast = useToast()
  const reload = useReload()
  const [f, setF] = useState({ full_name: '', email: '', phone: '', branch: 'Matematik', homeroom: '' })
  const [rows, setRows] = useState<{ class_id: string; course_id: string }[]>([])
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const cls = classes.data ?? []
  async function send() {
    if (f.full_name.trim().length < 3) return setErr('Ad soyad en az 3 harf olmalı.')
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(f.email.trim())) return setErr('E-posta geçersiz.')
    setBusy(true)
    const r = await callInvite({ role: 'ogretmen', full_name: f.full_name, email: f.email, phone: f.phone.trim() || null, branch: f.branch, assignments: rows.filter((x) => x.class_id && x.course_id), homeroom_class_id: f.homeroom || null })
    setBusy(false)
    if (!r.ok) return setErr(r.error ?? 'Davet gönderilemedi.')
    reload()
    toast(`${f.full_name.trim()} için hesap açıldı; davet e-postası gönderildi`)
    onClose()
  }
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF((x) => ({ ...x, [k]: e.target.value }))
  return (
    <Modal
      title="Öğretmen ekle"
      sub="Hesap onaylı açılır; öğretmene şifresini belirleyeceği bir davet e-postası gider."
      width={640}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Vazgeç
          </button>
          <button className="btn pri" onClick={send} disabled={busy}>
            {busy && <span className="spinner" aria-hidden="true" />} Davet gönder
          </button>
        </>
      }
    >
      <div className="grid2">
        <label className="field" htmlFor="iName">
          Ad soyad
          <input id="iName" value={f.full_name} onChange={set('full_name')} autoComplete="off" />
        </label>
        <label className="field" htmlFor="iMail">
          E-posta
          <input id="iMail" type="email" value={f.email} onChange={set('email')} autoComplete="off" />
        </label>
        <label className="field" htmlFor="iBranch">
          Branş / görev
          <select id="iBranch" value={f.branch} onChange={set('branch')}>
            {BRANS.map((b) => (
              <option key={b}>{b}</option>
            ))}
          </select>
        </label>
        <label className="field" htmlFor="iPhone">
          Telefon (isteğe bağlı)
          <input id="iPhone" inputMode="tel" value={f.phone} onChange={set('phone')} />
        </label>
      </div>
      <label className="field" htmlFor="iHome">
        Sınıf öğretmenliği (isteğe bağlı)
        <select id="iHome" value={f.homeroom} onChange={set('homeroom')}>
          <option value="">Yok</option>
          {cls.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <AssignmentPicker rows={rows} setRows={setRows} branch={f.branch} />
      {err && (
        <div className="err" role="alert">
          {err}
        </div>
      )}
    </Modal>
  )
}

export interface StuLite {
  id: string
  full_name: string
  class_name: string
}
export function InviteParentModal({ students, onClose }: { students: StuLite[]; onClose: () => void }) {
  const toast = useToast()
  const reload = useReload()
  const [f, setF] = useState({ full_name: '', email: '', phone: '' })
  const [kids, setKids] = useState<{ student_id: string; relation: string }[]>([{ student_id: '', relation: 'Anne' }])
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  async function send() {
    if (f.full_name.trim().length < 3) return setErr('Ad soyad en az 3 harf olmalı.')
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(f.email.trim())) return setErr('E-posta geçersiz.')
    const list = kids.filter((k) => k.student_id)
    if (!list.length) return setErr('En az bir öğrenci seç.')
    setBusy(true)
    const r = await callInvite({ role: 'veli', full_name: f.full_name, email: f.email, phone: f.phone.trim() || null, students: list })
    setBusy(false)
    if (!r.ok) return setErr(r.error ?? 'Davet gönderilemedi.')
    reload()
    toast(`${f.full_name.trim()} için veli hesabı açıldı; davet e-postası gönderildi`)
    onClose()
  }
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF((x) => ({ ...x, [k]: e.target.value }))
  return (
    <Modal
      title="Veli ekle"
      sub="Hesap onaylı açılır ve seçilen öğrencilere bağlanır; veliye şifresini belirleyeceği bir davet e-postası gider."
      width={620}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Vazgeç
          </button>
          <button className="btn pri" onClick={send} disabled={busy}>
            {busy && <span className="spinner" aria-hidden="true" />} Davet gönder
          </button>
        </>
      }
    >
      <div className="grid2">
        <label className="field" htmlFor="vName">
          Ad soyad
          <input id="vName" value={f.full_name} onChange={set('full_name')} autoComplete="off" />
        </label>
        <label className="field" htmlFor="vMail">
          E-posta
          <input id="vMail" type="email" value={f.email} onChange={set('email')} autoComplete="off" />
        </label>
      </div>
      <label className="field" htmlFor="vPhone" style={{ maxWidth: 280 }}>
        Telefon (isteğe bağlı)
        <input id="vPhone" inputMode="tel" value={f.phone} onChange={set('phone')} />
      </label>
      <StudentPicker students={students} kids={kids} setKids={setKids} />
      {err && (
        <div className="err" role="alert">
          {err}
        </div>
      )}
    </Modal>
  )
}

export type AssignRow = { class_id: string; course_id: string }
/** Ders ataması seçicisi (davet ve rol ekleme ortak). */
export function AssignmentPicker({ rows, setRows, branch }: { rows: AssignRow[]; setRows: React.Dispatch<React.SetStateAction<AssignRow[]>>; branch: string }) {
  const classes = useClasses()
  const courses = useCourses()
  const cls = classes.data ?? []
  const act = (courses.data ?? []).filter((c) => c.active)
  const fits = (cl: ClassRow | undefined, lv: string[]) => !cl || !lv.length || lv.includes(cl.level)
  const f = { branch }
  return (
  <div className="stack" style={{ gap: 6 }}>
    <span className="label">Ders atamaları (isteğe bağlı; sonra Ders atamaları'ndan da yapılır)</span>
    {rows.map((r, i) => {
      const cl = cls.find((c) => c.id === r.class_id)
      return (
        <div key={i} className="btns" style={{ alignItems: 'flex-end' }}>
          <label className="field" style={{ minWidth: 110 }}>
            <select aria-label={`${i + 1}. atama sınıf`} value={r.class_id} onChange={(e) => setRows((x) => x.map((y, j) => (j === i ? { ...y, class_id: e.target.value } : y)))}>
              <option value="">Sınıf</option>
              {cls.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field" style={{ minWidth: 180 }}>
            <select aria-label={`${i + 1}. atama ders`} value={r.course_id} onChange={(e) => setRows((x) => x.map((y, j) => (j === i ? { ...y, course_id: e.target.value } : y)))}>
              <option value="">Ders</option>
              {act
                .filter((c) => fits(cl, c.levels))
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </select>
          </label>
          <button type="button" className="xbtn" onClick={() => setRows((x) => x.filter((_, j) => j !== i))} aria-label={`${i + 1}. atamayı kaldır`}>
            <Icon name="x" size={14} stroke={2.4} />
          </button>
        </div>
      )
    })}
    <button type="button" className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => setRows((x) => [...x, { class_id: '', course_id: act.find((c) => c.name === f.branch)?.id ?? '' }])}>
      <Icon name="plus" size={15} /> Ders ataması ekle
    </button>
  </div>
  )
}

export type KidRow = { student_id: string; relation: string }
/** Öğrenci + yakınlık seçicisi (veli daveti ve veli rolü ekleme ortak). */
export function StudentPicker({ students, kids, setKids }: { students: StuLite[]; kids: KidRow[]; setKids: React.Dispatch<React.SetStateAction<KidRow[]>> }) {
  return (
  <div className="stack" style={{ gap: 6 }}>
    <span className="label">Öğrenci(ler)i</span>
    {kids.map((k, i) => (
      <div key={i} className="btns" style={{ alignItems: 'flex-end' }}>
        <label className="field" style={{ minWidth: 240 }}>
          <select aria-label={`${i + 1}. öğrenci`} value={k.student_id} onChange={(e) => setKids((x) => x.map((y, j) => (j === i ? { ...y, student_id: e.target.value } : y)))}>
            <option value="">Öğrenci seç</option>
            {students
              .filter((s) => s.id === k.student_id || !kids.some((y) => y.student_id === s.id))
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.full_name} · {s.class_name}
                </option>
              ))}
          </select>
        </label>
        <label className="field" style={{ minWidth: 110 }}>
          <select aria-label={`${i + 1}. öğrenci yakınlık`} value={k.relation} onChange={(e) => setKids((x) => x.map((y, j) => (j === i ? { ...y, relation: e.target.value } : y)))}>
            {YAKINLIK.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </label>
        {kids.length > 1 && (
          <button type="button" className="xbtn" onClick={() => setKids((x) => x.filter((_, j) => j !== i))} aria-label={`${i + 1}. öğrenciyi kaldır`}>
            <Icon name="x" size={14} stroke={2.4} />
          </button>
        )}
      </div>
    ))}
    <button type="button" className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => setKids((x) => [...x, { student_id: '', relation: x[0]?.relation ?? 'Anne' }])}>
      <Icon name="plus" size={15} /> Öğrenci ekle
    </button>
  </div>
  )
}

export { useAssignments }
