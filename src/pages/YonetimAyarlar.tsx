// Yönetim → Tüm ayarlar / Ayar geçmişi. Okulun bütün ayarları tek yerde: arama, gruplar, açıklama ve varsayılan, varsayılana dön
// (tek ayar ve grup), kaydetmeden önce değişiklik özeti, JSON dışa/içe aktarma. Yazma yalnız set_settings / reset_settings
// (yönetici + iki adımlı doğrulama); her değişiklik audit_log'a yazılır ve anında geçerli olur.
import { useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { usePeople, useSettings } from '@/lib/data'
import { AYARLAR, AYAR_GRUPLARI, type AyarTanim } from '@/lib/ayarAdlari'
import { fold } from '@/lib/format'
import { Modal } from '@/components/Modal'
import { Icon } from '@/components/Icon'
import { useToast } from '@/components/Toast'

type Spec = Record<string, { type: string; min?: number; max?: number; values?: string[]; default?: unknown; pattern?: string }>
const AD = new Map(AYARLAR.map((a) => [a.key, a]))
const goster = (v: unknown) =>
  v === true ? 'Açık' : v === false ? 'Kapalı' : v === '' || v === null || v === undefined ? '(boş)' : Array.isArray(v) ? 'Düzen' : String(v)
const esit = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)
/** Elle düzenlenmeyen (kendi ekranı olan) ayarlar */
const KENDI_EKRANI: Record<string, [string, string]> = {
  'genel.logo': ['Genel ayarlar', '/yonetim?sekme=genel'],
  'panel.ogrenci': ['Ana sayfa düzeni', '/yonetim?sekme=anasayfa'],
  'panel.ogretmen': ['Ana sayfa düzeni', '/yonetim?sekme=anasayfa'],
  'panel.veli': ['Ana sayfa düzeni', '/yonetim?sekme=anasayfa'],
  'panel.yonetim': ['Ana sayfa düzeni', '/yonetim?sekme=anasayfa'],
}

function useSpec() {
  return useQuery({
    queryKey: ['setting_spec'],
    staleTime: Infinity,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('setting_spec_public')
      if (error) throw error
      return data as Spec
    },
  })
}

export function TumAyarlar() {
  const toast = useToast()
  const qc = useQueryClient()
  const settings = useSettings()
  const spec = useSpec()
  const [q, setQ] = useState('')
  const [draft, setDraft] = useState<Record<string, unknown>>({})
  const [ozet, setOzet] = useState<Record<string, unknown> | null>(null)
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const kayitli = settings.data ?? {}
  const deger = (a: AyarTanim) => (a.key in draft ? draft[a.key] : a.key in kayitli ? kayitli[a.key] : a.varsayilan)
  const needle = fold(q.trim())
  const liste = useMemo(
    () => AYARLAR.filter((a) => !needle || fold(`${a.ad} ${a.aciklama} ${a.key} ${a.grup} ${a.ekranlar}`).includes(needle)),
    [needle],
  )
  const yenile = async () => {
    await qc.invalidateQueries({ queryKey: ['school_settings'] })
    await qc.invalidateQueries({ queryKey: ['school-info'] })
  }

  async function kaydet(degisen: Record<string, unknown>) {
    setBusy(true)
    const { error } = await supabase.rpc('set_settings', { p: degisen })
    setBusy(false)
    if (error) return toast(error.message || 'Kaydedilemedi.', 'warn')
    setDraft({})
    setOzet(null)
    await yenile()
    toast(`${Object.keys(degisen).length} ayar kaydedildi`)
  }
  async function varsayilana(keys: string[], ad: string) {
    const stored = keys.filter((k) => k in kayitli && k !== 'genel.okul_adi')
    if (!stored.length) {
      setDraft((d) => Object.fromEntries(Object.entries(d).filter(([k]) => !keys.includes(k))))
      return toast('Zaten varsayılan değerde')
    }
    if (!window.confirm(`${ad}: ${stored.length} ayar varsayılana dönsün mü?`)) return
    const { error } = await supabase.rpc('reset_settings', { p_keys: stored })
    if (error) return toast(error.message || 'Varsayılana dönülemedi.', 'warn')
    setDraft((d) => Object.fromEntries(Object.entries(d).filter(([k]) => !keys.includes(k))))
    await yenile()
    toast('Varsayılana dönüldü')
  }
  function disaAktar() {
    const blob = new Blob([JSON.stringify({ surum: 1, tarih: new Date().toISOString(), ayarlar: kayitli }, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `okul-ayarlari-${new Date().toISOString().slice(0, 10)}.json`
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000)
  }
  async function iceAktar(file: File) {
    try {
      const j = JSON.parse(await file.text()) as { ayarlar?: Record<string, unknown> }
      const src = j.ayarlar ?? (j as Record<string, unknown>)
      const bilinmeyen = Object.keys(src).filter((k) => !AD.has(k))
      const degisen = Object.fromEntries(Object.entries(src).filter(([k, v]) => AD.has(k) && k !== 'genel.logo' && !esit(v, k in kayitli ? kayitli[k] : AD.get(k)!.varsayilan)))
      if (bilinmeyen.length) toast(`Tanınmayan ${bilinmeyen.length} ayar atlandı`, 'warn')
      if (!Object.keys(degisen).length) return toast('Dosyadaki ayarlar mevcutla aynı')
      setOzet(degisen) // kaydetmeden önce özet; doğrulamayı veritabanı (setting_spec) yapar
    } catch {
      toast('Dosya okunamadı; geçerli bir ayar yedeği (JSON) seç.', 'warn')
    }
  }

  if (settings.isLoading || spec.isLoading) return <p className="m">Yükleniyor…</p>
  const S = spec.data ?? {}
  const degisenSayisi = Object.keys(draft).length

  return (
    <div className="stack" style={{ gap: 14 }}>
      <p className="m">
        Okulun bütün ayarları burada. Değişiklik kaydedilince hemen geçerli olur ve <Link to="/yonetim?sekme=ayar_gecmisi">Ayar geçmişi</Link>'ne yazılır.
        Görünürlük ve yetki ayarları yalnız kısıtlar; veri güvenliği kuralları ve KVKK metni ayarla değiştirilemez.
      </p>
      <div className="kv" style={{ flexWrap: 'wrap', gap: 8 }}>
        <label className="field" style={{ flex: '1 1 260px' }}>
          Ayar ara
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ör. menü, rapor, etüt, kayıt" />
        </label>
        <div className="btns">
          <button className="btn sm" onClick={disaAktar}>
            <Icon name="up" size={15} /> Dışa aktar (JSON)
          </button>
          <button className="btn sm" onClick={() => fileRef.current?.click()}>
            <Icon name="doc" size={15} /> İçe aktar
          </button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => e.target.files?.[0] && iceAktar(e.target.files[0])} />
        </div>
      </div>
      {AYAR_GRUPLARI.map((g) => {
        const items = liste.filter((a) => a.grup === g)
        if (!items.length) return null
        return (
          <section key={g} className="card" style={{ padding: 16 }} aria-label={g}>
            <div className="kv" style={{ marginBottom: 8 }}>
              <h3 className="sec" style={{ margin: 0 }}>
                {g}
              </h3>
              <button className="btn sm" onClick={() => varsayilana(items.map((a) => a.key), g)}>
                Grubu varsayılana döndür
              </button>
            </div>
            <div className="stack" style={{ gap: 10 }}>
              {items.map((a) => (
                <AyarSatir
                  key={a.key}
                  a={a}
                  s={S[a.key]}
                  deger={deger(a)}
                  kayitli={a.key in kayitli}
                  degisti={a.key in draft}
                  onChange={(v) =>
                    setDraft((d) => {
                      const n = { ...d }
                      if (esit(v, a.key in kayitli ? kayitli[a.key] : a.varsayilan)) delete n[a.key]
                      else n[a.key] = v
                      return n
                    })
                  }
                  onReset={() => varsayilana([a.key], a.ad)}
                />
              ))}
            </div>
          </section>
        )
      })}
      {!liste.length && <p className="m">Aramaya uyan ayar yok.</p>}
      {degisenSayisi > 0 && (
        <div className="card" style={{ position: 'sticky', bottom: 12, padding: 12, display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap', boxShadow: '0 8px 24px rgba(27,42,47,.14)' }}>
          <span className="m" style={{ alignSelf: 'center' }}>
            {degisenSayisi} kaydedilmemiş değişiklik
          </span>
          <button className="btn" onClick={() => setDraft({})}>
            Vazgeç
          </button>
          <button className="btn pri" onClick={() => setOzet(draft)}>
            <Icon name="check" size={16} /> Kaydet
          </button>
        </div>
      )}
      {ozet && (
        <Modal
          title="Değişiklik özeti"
          sub="Kaydetmeden önce kontrol et"
          onClose={() => setOzet(null)}
          footer={
            <>
              <button className="btn" onClick={() => setOzet(null)}>
                Geri dön
              </button>
              <button className="btn pri" disabled={busy} onClick={() => kaydet(ozet)}>
                Onayla ve kaydet
              </button>
            </>
          }
        >
          <ul className="stack" style={{ gap: 8, listStyle: 'none', margin: 0, padding: 0 }}>
            {Object.entries(ozet).map(([k, v]) => {
              const a = AD.get(k)!
              return (
                <li key={k}>
                  <b>{a.ad}</b> <span className="m">({a.grup})</span>
                  <div className="m" style={{ fontSize: 13 }}>
                    {goster(k in kayitli ? kayitli[k] : a.varsayilan)} → <b>{goster(v)}</b>
                  </div>
                </li>
              )
            })}
          </ul>
        </Modal>
      )}
    </div>
  )
}

function AyarSatir(p: {
  a: AyarTanim
  s: Spec[string] | undefined
  deger: unknown
  kayitli: boolean
  degisti: boolean
  onChange: (v: unknown) => void
  onReset: () => void
}) {
  const { a, s } = p
  const id = `ayar-${a.key.replace(/\./g, '-')}`
  const kendi = KENDI_EKRANI[a.key]
  let editor: JSX.Element
  if (kendi || a.tur === 'layout')
    editor = (
      <Link className="btn sm" to={kendi?.[1] ?? '/yonetim?sekme=anasayfa'}>
        {kendi?.[0] ?? 'Ana sayfa düzeni'} ekranında düzenle
      </Link>
    )
  else if (a.tur === 'bool')
    editor = (
      <label className="check" style={{ minHeight: 44 }}>
        <input id={id} type="checkbox" checked={p.deger !== false} onChange={(e) => p.onChange(e.target.checked)} aria-label={a.ad} /> {p.deger !== false ? 'Açık' : 'Kapalı'}
      </label>
    )
  else if (a.tur === 'enum')
    editor = (
      <select id={id} aria-label={a.ad} value={String(p.deger)} onChange={(e) => p.onChange(e.target.value)}>
        {(s?.values ?? []).map((v) => (
          <option key={v} value={v}>
            {v}
          </option>
        ))}
      </select>
    )
  else if (a.tur === 'int')
    editor = (
      <input
        id={id}
        aria-label={a.ad}
        type="number"
        min={s?.min}
        max={s?.max}
        value={String(p.deger ?? '')}
        onChange={(e) => e.target.value !== '' && p.onChange(Number(e.target.value))}
        style={{ maxWidth: 140 }}
      />
    )
  else
    editor =
      (s?.max ?? 0) > 250 ? (
        <textarea id={id} aria-label={a.ad} maxLength={s?.max} value={String(p.deger ?? '')} onChange={(e) => p.onChange(e.target.value)} />
      ) : (
        <input id={id} aria-label={a.ad} maxLength={s?.max} value={String(p.deger ?? '')} onChange={(e) => p.onChange(e.target.value)} />
      )
  return (
    <div className="field" style={{ borderTop: '1px solid var(--line)', paddingTop: 10 }}>
      <div className="kv" style={{ flexWrap: 'wrap', gap: 6 }}>
        <span>
          {a.ad} {p.degisti && <span className="chip gold">Değişti</span>} {p.kayitli && !p.degisti && <span className="chip n">Özel</span>}
        </span>
        {p.kayitli && a.key !== 'genel.okul_adi' && !kendi && (
          <button type="button" className="btn sm" onClick={p.onReset}>
            Varsayılana dön
          </button>
        )}
      </div>
      {a.aciklama && <span className="m" style={{ fontWeight: 400, fontSize: 13 }}>{a.aciklama}</span>}
      {editor}
      <span className="m" style={{ fontWeight: 400, fontSize: 12 }}>
        Varsayılan: {goster(a.varsayilan)} · Etkilediği ekranlar: {a.ekranlar}
        {s?.min !== undefined ? ` · ${s.min}–${s.max}` : ''}
      </span>
    </div>
  )
}

export function AyarGecmisi() {
  const people = usePeople()
  const q = useQuery({
    queryKey: ['ayar-gecmisi'],
    queryFn: async () => {
      const { data, error } = await supabase.from('audit_log').select('id, created_at, user_id, meta').eq('action', 'settings').order('created_at', { ascending: false }).limit(200)
      if (error) throw error
      return (data ?? []) as { id: string; created_at: string; user_id: string | null; meta: Record<string, { eski: unknown; yeni: unknown }> }[]
    },
  })
  const ad = (id: string | null) => people.data?.find((p) => p.id === id)?.full_name ?? 'Bilinmiyor'
  if (q.isLoading) return <p className="m">Yükleniyor…</p>
  if (q.error) return <p className="err">Ayar geçmişi okunamadı.</p>
  return (
    <div className="stack" style={{ gap: 10 }}>
      <p className="m">Son 200 ayar değişikliği: kim, ne zaman, eski → yeni değer.</p>
      {(q.data ?? []).map((r) => (
        <section key={r.id} className="card" style={{ padding: 14 }}>
          <div className="kv">
            <b>{ad(r.user_id)}</b>
            <span className="m">{new Date(r.created_at).toLocaleString('tr-TR', { dateStyle: 'medium', timeStyle: 'short' })}</span>
          </div>
          <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
            {Object.entries(r.meta ?? {}).map(([k, v]) => (
              <li key={k} style={{ fontSize: 14 }}>
                {AD.get(k)?.ad ?? k}: <span className="m">{goster(v?.eski)}</span> → <b>{goster(v?.yeni)}</b>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {!q.data?.length && <p className="m">Henüz ayar değişikliği yok.</p>}
    </div>
  )
}
