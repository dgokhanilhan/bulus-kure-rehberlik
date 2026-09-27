import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { DEFAULT_TODAY } from '@/lib/analiz'
import { useSchoolSettings } from '@/lib/data'
import { ago } from '@/lib/format'
import { Icon } from '@/components/Icon'
import { Dropdown } from '@/components/Indicator'
import { useToast } from '@/components/Toast'

const ACTION_TR: Record<string, string> = {
  approve: 'Kayıt onayladı',
  reject: 'Kayıt reddetti',
  publish: 'Deneme yayınladı',
  unpublish: 'Denemeyi geri aldı',
  send_report: 'Rapor gönderdi',
  settings: 'Okul ayarlarını değiştirdi',
  view: 'Görüntüledi',
}
const ENTITY_TR: Record<string, string> = { profiles: 'kullanıcı', exams: 'deneme', reports: 'rapor', schools: 'okul', rehber_notlari: 'rehberlik notları', rapor: 'rapor' }

interface Audit {
  id: number
  created_at: string
  action: string
  entity: string
  entity_id: string | null
  meta: Record<string, unknown> | null
  user_name: string | null
}

/** Yalnız yönetici: Bugün kuralları, yapay zekâ kotaları, işlem kayıtları. */
export default function AyarlarPage() {
  const settings = useSchoolSettings()
  const qc = useQueryClient()
  const toast = useToast()
  const [f, setF] = useState({ netDrop: '3', netRise: '5', repeatMin: '3', dailyPerUser: '60', monthlyUsd: '10', dailyAlarmUsd: '1' })
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    const s = settings.data as { bugun?: Record<string, number>; ai?: Record<string, number> } | undefined
    if (!s) return
    const b = { ...DEFAULT_TODAY, ...(s.bugun ?? {}) }
    const a = { dailyPerUser: 60, monthlyUsd: 10, dailyAlarmUsd: 1, ...(s.ai ?? {}) }
    setF({ netDrop: String(b.netDrop), netRise: String(b.netRise), repeatMin: String(b.repeatMin), dailyPerUser: String(a.dailyPerUser), monthlyUsd: String(a.monthlyUsd), dailyAlarmUsd: String(a.dailyAlarmUsd) })
  }, [settings.data])
  const audit = useQuery({
    queryKey: ['audit'],
    queryFn: async () => {
      const { data, error } = await supabase.from('audit_view').select('*').order('created_at', { ascending: false }).limit(200)
      if (error) throw error
      return data as Audit[]
    },
  })
  const usage = useQuery({
    queryKey: ['ai-usage'],
    queryFn: async () => {
      const since = new Date()
      since.setDate(1)
      since.setHours(0, 0, 0, 0)
      const { data, error } = await supabase.from('ai_usage').select('cost_usd, ok, fn').gte('created_at', since.toISOString())
      if (error) throw error
      const rows = (data ?? []) as { cost_usd: number | null; ok: boolean; fn: string }[]
      return { count: rows.length, cost: rows.reduce((a, r) => a + Number(r.cost_usd ?? 0), 0), failed: rows.filter((r) => !r.ok).length }
    },
  })

  const num = (k: keyof typeof f) => Number(String(f[k]).replace(',', '.'))
  async function save() {
    setBusy(true)
    const { error } = await supabase.rpc('update_school_settings', {
      p: { bugun: { netDrop: num('netDrop'), netRise: num('netRise'), repeatMin: num('repeatMin') }, ai: { dailyPerUser: num('dailyPerUser'), monthlyUsd: num('monthlyUsd'), dailyAlarmUsd: num('dailyAlarmUsd') } },
    })
    setBusy(false)
    if (error) return toast(error.message || 'Kaydedilemedi.', 'warn')
    toast('Ayarlar kaydedildi')
    qc.invalidateQueries({ queryKey: ['school'] })
    qc.invalidateQueries({ queryKey: ['audit'] })
  }
  const field = (k: keyof typeof f, label: string, hint: string) => (
    <label className="field" htmlFor={`st-${k}`}>
      {label}
      <input id={`st-${k}`} inputMode="decimal" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
      <span className="m" style={{ fontWeight: 400, fontSize: 12 }}>
        {hint}
      </span>
    </label>
  )

  return (
    <>
      <h1 className="hd a">Okul ayarları</h1>
      <section className="card a" style={{ ['--d' as string]: 1, padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <h2 className="sec">Bugün kuralları</h2>
        <div className="grid2">
          {field('netDrop', 'Düşüş eşiği (net)', 'Son iki deneme arasında toplam net bu kadar düşerse "Düşüş".')}
          {field('netRise', 'Gelişim eşiği (net)', 'Toplam net bu kadar artarsa "Gelişim".')}
          {field('repeatMin', 'Kalıcı hata (deneme sayısı)', 'Aynı konu bu kadar denemede yanlışsa Bugün listesine girer.')}
        </div>
        <h2 className="sec">Yapay zekâ</h2>
        <div className="grid2">
          {field('dailyPerUser', 'Kişi başı günlük istek', 'Aşılınca o gün yapay zekâ kullanılamaz.')}
          {field('monthlyUsd', 'Okul aylık harcama tavanı ($)', 'Aşılınca ay sonuna kadar yapay zekâ kapanır.')}
          {field('dailyAlarmUsd', 'Günlük harcama uyarısı ($)', 'Aşılınca yöneticilere bildirim gider.')}
        </div>
        <div className="kv m" style={{ fontSize: 13 }}>
          <span>
            Bu ay: {usage.data?.count ?? 0} istek · {(usage.data?.cost ?? 0).toFixed(3).replace('.', ',')} $ {usage.data?.failed ? `· ${usage.data.failed} başarısız` : ''}
          </span>
        </div>
        <button className="btn pri" style={{ alignSelf: 'flex-start' }} disabled={busy} onClick={save}>
          <Icon name="check" size={16} stroke={2.4} />
          Kaydet
        </button>
      </section>
      <Dropdown title="İşlem kayıtları" sub={`Son ${audit.data?.length ?? 0} kayıt`} icon={<Icon name="shield" size={22} />} delay={2}>
        <div className="tbl">
          <table>
            <thead>
              <tr>
                <th>Kim</th>
                <th>İşlem</th>
                <th>Ne zaman</th>
              </tr>
            </thead>
            <tbody>
              {(audit.data ?? []).map((a) => (
                <tr key={a.id} data-testid="audit-row">
                  <td>
                    <b>{a.user_name ?? 'Sistem'}</b>
                  </td>
                  <td>
                    {ACTION_TR[a.action] ?? a.action} · {ENTITY_TR[a.entity] ?? a.entity}
                  </td>
                  <td className="m">{ago(a.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Dropdown>
    </>
  )
}
