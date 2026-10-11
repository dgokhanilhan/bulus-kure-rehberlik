import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/auth/AuthProvider'
import { useSettings } from '@/lib/data'
import { useToast } from '@/components/Toast'
import type { Profile } from '@/lib/types'

const PERMISSIONS = {
  overview: 'Okul özeti',
  students: 'Öğrenci listesi (ad, sınıf, okul no)',
  exams: 'Okulun deneme listesi',
  attendance: 'Son 30 günün toplu yoklama özeti',
  calendar: 'Okulun yaklaşan etkinlikleri',
}
type Permission = keyof typeof PERMISSIONS
type SchoolRole = { id: string; name: string; permissions: Permission[] }
export function useSchoolRoles() {
  const { profile, role } = useAuth()
  return useQuery({
    queryKey: ['school-roles', profile?.id, role],
    enabled: !!profile && role !== 'veli' && role !== 'ogrenci',
    queryFn: async () => {
      const { data, error } = await supabase.from('school_roles').select('id,name,permissions').order('name')
      if (error) throw error
      return data as SchoolRole[]
    },
  })
}
export function SchoolRoleAdmin({ profiles }: { profiles: Profile[] }) {
  const { profile } = useAuth()
  const roles = useSchoolRoles(),
    qc = useQueryClient(),
    toast = useToast()
  const [id, setId] = useState<string | null>(null),
    [name, setName] = useState(''),
    [permissions, setPermissions] = useState<Permission[]>([]),
    [members, setMembers] = useState<string[]>([]),
    [busy, setBusy] = useState(false),
    [memberSearch, setMemberSearch] = useState('')
  const assigned = useQuery({
    queryKey: ['school-role-members', profile?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('school_role_members').select('role_id,profile_id')
      if (error) throw error
      return data
    },
  })
  const eligible = profiles.filter(
    (p) => p.status === 'approved' && (p.role === 'admin' || p.roles?.includes('ogretmen') || p.role === 'ogretmen')
  )
  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v])
  function edit(r: SchoolRole) {
    setId(r.id)
    setName(r.name)
    setPermissions(r.permissions)
    setMembers((assigned.data ?? []).filter((m) => m.role_id === r.id).map((m) => m.profile_id))
  }
  async function save() {
    setBusy(true)
    const { data: savedId, error } = await supabase.rpc('manage_school_role', {
      p_id: id,
      p_name: name,
      p_permissions: permissions,
      p_members: members,
    })
    setBusy(false)
    if (error) return toast(error.message, 'warn')
    setId(savedId as string)
    toast('Okul rolü ve yetkileri kaydedildi')
    qc.invalidateQueries({ queryKey: ['school-roles'] })
    qc.invalidateQueries({ queryKey: ['school-role-members'] })
    qc.invalidateQueries({ queryKey: ['school-role-overview'] })
  }
  return (
    <section className="card stack" style={{ padding: 18 }} aria-label="Özel okul rolleri">
      <h3>Kurucu, müdür ve özel okul rolleri</h3>
      <p className="m">
        Bu roller seçtiğin okul bilgilerini Okul yönetimi ekranında görüntüler. Mevcut öğretmen/veli rolünü değiştirmez; rehberlik
        notlarına, mesajlara veya kayıt değiştirme yetkisine erişim vermez. Hesabı önce Öğretmenler bölümünden davet edebilirsin.
      </p>
      {roles.isError || assigned.isError ? (
        <p role="alert">Rol bilgileri yüklenemedi. Veritabanı güncellemesini kontrol et.</p>
      ) : (
        <div className="btns">
          {roles.data?.map((r) => (
            <button className="btn" key={r.id} disabled={assigned.isLoading} onClick={() => edit(r)}>
              {r.name} düzenle
            </button>
          ))}
          <button
            className="btn"
            onClick={() => {
              setId(null)
              setName('')
              setPermissions([])
              setMembers([])
            }}
          >
            Yeni rol
          </button>
          <button
            className="btn"
            onClick={() => {
              setId(null)
              setName('Okul kurucusu')
              setPermissions(['overview', 'exams', 'calendar'])
              setMembers([])
            }}
          >
            Kurucu şablonu
          </button>
          <button
            className="btn"
            onClick={() => {
              setId(null)
              setName('Okul müdürü')
              setPermissions(Object.keys(PERMISSIONS) as Permission[])
              setMembers([])
            }}
          >
            Müdür şablonu
          </button>
        </div>
      )}
      <label className="field">
        Rol adı
        <input maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <fieldset className="stack">
        <legend>Görebileceği bilgiler</legend>
        {(Object.entries(PERMISSIONS) as [Permission, string][]).map(([k, label]) => (
          <label key={k}>
            <input type="checkbox" checked={permissions.includes(k)} onChange={() => setPermissions(toggle(permissions, k))} /> {label}
          </label>
        ))}
      </fieldset>
      <label className="field">
        Kullanıcı ara
        <input value={memberSearch} onChange={(e) => setMemberSearch(e.target.value)} placeholder="Ad soyad" />
      </label>
      <fieldset className="stack" style={{ maxHeight: 320, overflowY: 'auto' }}>
        <legend>Bu rolün kullanıcıları</legend>
        {eligible
          .filter((p) => p.full_name.toLocaleLowerCase('tr').includes(memberSearch.toLocaleLowerCase('tr')))
          .map((p) => (
            <label key={p.id}>
              <input type="checkbox" checked={members.includes(p.id)} onChange={() => setMembers(toggle(members, p.id))} /> {p.full_name}
            </label>
          ))}
      </fieldset>
      <p className="m">
        Bir yetkiyi kaldırmak veya kullanıcı seçimini kaldırmak, özel rolün erişimini kapatır. Başka rollerde verilen yetkiler korunur.
      </p>
      <button
        className="btn pri"
        disabled={busy || name.trim().length < 2 || roles.isLoading || assigned.isLoading || roles.isError || assigned.isError}
        onClick={save}
      >
        Rolü kaydet
      </button>
    </section>
  )
}

const OPTIONS = {
  'gorunum.tema': { label: 'Varsayılan tema', values: { auto: 'Cihaz tercihine göre', light: 'Açık', dark: 'Koyu' } },
  'gorunum.vurgu': { label: 'Vurgu rengi', values: { yesil: 'Yeşil', mavi: 'Mavi', mor: 'Mor' } },
  'gorunum.yazi': { label: 'Yazı boyutu', values: { normal: 'Normal', buyuk: 'Büyük' } },
  'gorunum.yogunluk': { label: 'Kart aralığı', values: { normal: 'Normal', rahat: 'Rahat' } },
  'gorunum.baslik': { label: 'Ana sayfa kutu başlıkları', values: { renkli: 'Renkli ve kalın', kalin: 'Kalın' } },
  'gorunum.kose': { label: 'Kart köşeleri', values: { normal: 'Normal', yuvarlak: 'Daha yuvarlak', duz: 'Az yuvarlak' } },
}
const DEFAULTS: Record<string, string | boolean> = {
  'genel.alt_baslik': 'Rehberlik & Mentörlük',
  'okul.karsilama': '',
  'gorunum.tema': 'auto',
  'gorunum.vurgu': 'yesil',
  'gorunum.yazi': 'normal',
  'gorunum.yogunluk': 'normal',
  'gorunum.baslik': 'renkli',
  'gorunum.kose': 'normal',
  'gorunum.hareket': true,
}
export function AppearanceSettings() {
  const settings = useSettings(),
    qc = useQueryClient(),
    toast = useToast()
  const [form, setForm] = useState(DEFAULTS),
    [busy, setBusy] = useState(false)
  useEffect(() => {
    setForm(Object.fromEntries(Object.entries(DEFAULTS).map(([k, v]) => [k, settings.data?.[k] ?? v])) as typeof DEFAULTS)
  }, [settings.data])
  async function save() {
    setBusy(true)
    const { error } = await supabase.rpc('set_settings', { p: form })
    setBusy(false)
    if (error) return toast(error.message, 'warn')
    qc.invalidateQueries({ queryKey: ['school_settings'] })
    toast('Görünüm ve karşılama ayarları kaydedildi')
  }
  return (
    <section className="card stack" style={{ padding: 18 }} aria-label="Görünüm ve karşılama">
      <h3>Görünüm ve karşılama</h3>
      <p className="m">Seçimler okulun bütün kullanıcılarına uygulanır. Rapor PDF’sinin baskı renkleri korunur.</p>
      <div className="grid2">
        {Object.entries(OPTIONS).map(([k, opt]) => (
          <label className="field" key={k}>
            {opt.label}
            <select value={String(form[k])} onChange={(e) => setForm({ ...form, [k]: e.target.value })}>
              {Object.entries(opt.values).map(([v, label]) => (
                <option value={v} key={v}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
      <label className="field">
        Üst çubuk alt başlığı
        <input
          maxLength={120}
          value={String(form['genel.alt_baslik'])}
          onChange={(e) => setForm({ ...form, 'genel.alt_baslik': e.target.value })}
        />
      </label>
      <label className="field">
        Ana sayfa karşılama mesajı
        <textarea
          maxLength={250}
          value={String(form['okul.karsilama'])}
          onChange={(e) => setForm({ ...form, 'okul.karsilama': e.target.value })}
        />
      </label>
      <label>
        <input
          type="checkbox"
          checked={Boolean(form['gorunum.hareket'])}
          onChange={(e) => setForm({ ...form, 'gorunum.hareket': e.target.checked })}
        />{' '}
        Geçiş animasyonları (cihazın azaltılmış hareket tercihi önceliklidir)
      </label>
      <div className="btns">
        <button className="btn" disabled={busy} onClick={() => setForm({ ...DEFAULTS })}>
          Varsayılanları forma getir
        </button>
        <button className="btn pri" disabled={busy || settings.isLoading} onClick={save}>
          Görünümü kaydet
        </button>
      </div>
    </section>
  )
}
export function SchoolAppearance() {
  const settings = useSettings()
  useEffect(() => {
    const root = document.documentElement
    for (const [key, attr] of [
      ['gorunum.tema', 'theme'],
      ['gorunum.vurgu', 'accent'],
      ['gorunum.yazi', 'text-size'],
      ['gorunum.yogunluk', 'density'],
      ['gorunum.baslik', 'card-title'],
      ['gorunum.kose', 'corners'],
      ['gorunum.hareket', 'motion'],
    ] as const) {
      const value = settings.data?.[key] ?? DEFAULTS[key]
      if (key === 'gorunum.tema' && value === 'auto') root.removeAttribute(`data-${attr}`)
      else root.setAttribute(`data-${attr}`, String(value))
    }
    return () => {
      for (const attr of ['theme', 'accent', 'text-size', 'density', 'card-title', 'corners', 'motion'])
        root.removeAttribute(`data-${attr}`)
    }
  }, [settings.data])
  return null
}

export default function SchoolOverview() {
  const { profile, role } = useAuth()
  const roles = useSchoolRoles()
  const data = useQuery({
    queryKey: ['school-role-overview', profile?.id, role],
    enabled: !!profile && role !== 'veli' && role !== 'ogrenci',
    queryFn: async () => {
      const { data, error } = await supabase.rpc('school_role_overview')
      if (error) throw error
      return data as Record<string, unknown>
    },
  })
  return (
    <div className="stack">
      <h1>Okul yönetimi</h1>
      <p className="m">
        {role === 'admin' ? 'Yönetici' : roles.data?.map((r) => r.name).join(' · ')} — Yetkilerin kapsamındaki okul bilgileri. Kişisel
        rehberlik notları ve yazışmalar bu ekranda yer almaz.
      </p>
      {data.isLoading ? (
        <p>Yükleniyor…</p>
      ) : data.isError ? (
        <p role="alert">Bu ekran için yetki bulunamadı veya bilgiler yüklenemedi.</p>
      ) : (
        Object.entries(data.data ?? {}).map(([key, value]) => (
          <section className="card stack" style={{ padding: 18 }} key={key}>
            <h2>{PERMISSIONS[key as Permission]}</h2>
            {key === 'overview' ? (
              <div className="grid3">
                {Object.entries(value as Record<string, number>).map(([k, v]) => (
                  <p key={k}>
                    <b>{v}</b> {({ students: 'öğrenci', classes: 'sınıf', teachers: 'öğretmen' } as Record<string, string>)[k]}
                  </p>
                ))}
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table>
                  <thead>
                    <tr>
                      {Object.keys((value as Record<string, unknown>[])[0] ?? {}).map((k) => (
                        <th key={k}>
                          {(
                            {
                              name: 'Ad',
                              class: 'Sınıf',
                              schoolNo: 'Okul no',
                              date: 'Tarih',
                              day: 'Tarih',
                              status: 'Durum',
                              count: 'Adet',
                              title: 'Etkinlik',
                            } as Record<string, string>
                          )[k] ?? k}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(value as Record<string, unknown>[]).map((row, i) => (
                      <tr key={i}>
                        {Object.entries(row).map(([k, v]) => (
                          <td key={k}>{String(v ?? '—')}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!(value as unknown[]).length && <p>Kayıt yok.</p>}
              </div>
            )}
          </section>
        ))
      )}
    </div>
  )
}
