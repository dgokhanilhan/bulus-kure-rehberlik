// BK Akıllı Yoklama (0080): idare için tahta bağlama, öğretmen için tahta yoklama PIN'i.
// Pilot sınıf = tahtası bağlı sınıf. Veli bildirim saati yalnız bu sınıflarda geçerlidir.
import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useClasses, useSettings } from '@/lib/data'
import { useToast } from '@/components/Toast'

interface Tahta {
  id: string
  ad: string
  class_id: string
  sinif: string
  eslesti: boolean
  kod_son: string | null
  son_gorulme: string | null
  kilit: string | null
  bugun: { kim: string | null; saat: string; duzeltme: number } | null
}

const saat = (iso: string) => new Date(iso).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
const gunSaat = (iso: string) => {
  const d = new Date(iso)
  const bugun = new Date().toDateString() === d.toDateString()
  return bugun ? `bugün ${saat(iso)}` : d.toLocaleString('tr-TR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
}
const hata = (e: { message?: string } | null) => (e?.message && !/^[a-z_]+$/.test(e.message) ? e.message : 'İşlem yapılamadı.')

const SAATLER: [string, string][] = [
  ['09:30', '09:30'],
  ['09:40', '09:40'],
  ['10:00', '10:00'],
  ['10:30', '10:30'],
  ['11:00', '11:00'],
  ['12:00', '12:00'],
  ['anlik', 'Beklemeden (kayıt anında)'],
]

export function AkilliTahtalar() {
  const qc = useQueryClient()
  const toast = useToast()
  const classes = useClasses()
  const s = useSettings()
  const list = useQuery({
    queryKey: ['tahta_listesi'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('tahta_listesi')
      if (error) throw error
      return (data ?? []) as Tahta[]
    },
  })
  const [yeniSinif, setYeniSinif] = useState('')
  const [kod, setKod] = useState<{ tahta: string; kod: string; son: string } | null>(null)
  const [silinecek, setSilinecek] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const bildirim = (s.data?.['yoklama.bildirim_saati'] as string | undefined) ?? '10:00'
  const tahtalar = list.data ?? []
  const bos = (classes.data ?? []).filter((c) => c.active !== false && !tahtalar.some((t) => t.class_id === c.id))
  const yenile = () => qc.invalidateQueries({ queryKey: ['tahta_listesi'] })

  async function ekle() {
    if (!yeniSinif) return
    setBusy(true)
    const { data, error } = await supabase.rpc('tahta_ekle', { p_class: yeniSinif })
    setBusy(false)
    if (error) return toast(hata(error), 'warn')
    const c = classes.data?.find((x) => x.id === yeniSinif)
    setKod({ tahta: `${c?.name ?? ''} tahtası`, kod: data.kod, son: data.son })
    setYeniSinif('')
    yenile()
  }
  async function yeniKod(t: Tahta) {
    const { data, error } = await supabase.rpc('tahta_kod_yenile', { p_id: t.id })
    if (error) return toast(hata(error), 'warn')
    setKod({ tahta: t.ad, kod: data.kod, son: data.son })
    yenile()
  }
  async function kilitAc(t: Tahta) {
    const { error } = await supabase.rpc('tahta_kilit_ac', { p_id: t.id })
    if (error) return toast(hata(error), 'warn')
    toast(`${t.ad} kilidi açıldı`)
    yenile()
  }
  async function kaldir(t: Tahta) {
    const { error } = await supabase.rpc('tahta_kaldir', { p_id: t.id })
    setSilinecek(null)
    if (error) return toast(hata(error), 'warn')
    toast(`${t.ad} kaldırıldı · ${t.sinif} artık pilotta değil`)
    yenile()
  }
  async function saatKaydet(v: string) {
    const { error } = await supabase.rpc('set_settings', { p: { 'yoklama.bildirim_saati': v } })
    if (error) return toast(hata(error), 'warn')
    qc.invalidateQueries({ queryKey: ['school_settings'] })
    toast('Veli bildirim saati kaydedildi')
  }

  return (
    <section className="card a" style={{ ['--d' as string]: 3, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }} aria-labelledby="tahta-baslik">
      <h3 id="tahta-baslik" style={{ margin: 0 }}>Akıllı tahtalar · BK Akıllı Yoklama (pilot)</h3>
      <p className="m" style={{ fontSize: 13, margin: 0 }}>
        Tahtası bağlı sınıflar pilottadır: öğretmen sabah yoklamasını tahtadan kişisel PIN'iyle gönderir, “gelmedi / geç geldi” bildirimi seçilen saate kadar bekler ve o anki son duruma göre veliye gider. Diğer sınıflarda hiçbir şey değişmez.
      </p>

      <label className="field" htmlFor="tahtaBildirim" style={{ maxWidth: 360 }}>
        Pilot sınıflarda veli bildirimi saati
        <select id="tahtaBildirim" value={bildirim} onChange={(e) => saatKaydet(e.target.value)}>
          {SAATLER.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </label>

      {kod && (
        <div role="status" className="card" style={{ padding: 14, background: 'var(--primary-soft)', display: 'grid', gap: 6 }}>
          <b>{kod.tahta} için eşleştirme kodu</b>
          <span className="mono" style={{ fontSize: 28, letterSpacing: 4 }}>{kod.kod}</span>
          <span style={{ fontSize: 13 }}>
            Tahtada BK Akıllı Yoklama'yı ilk kez açınca bu kodu yaz. Tek kullanımlık, {saat(kod.son)}'e kadar geçerli.
          </span>
          <button className="btn" style={{ justifySelf: 'start' }} onClick={() => setKod(null)}>
            Tamam
          </button>
        </div>
      )}

      {list.isLoading ? (
        <p className="m">Yükleniyor…</p>
      ) : list.error ? (
        <p className="err" role="alert">
          Tahtalar yüklenemedi.
        </p>
      ) : tahtalar.length === 0 ? (
        <p className="m" style={{ margin: 0 }}>
          Henüz tahta bağlanmadı. Pilot için 8/A ve 8/B'yi aşağıdan ekle.
        </p>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
          {tahtalar.map((t) => (
            <li key={t.id} className="card" style={{ padding: 12, display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
              <div style={{ flex: '1 1 220px', minWidth: 0 }}>
                <b>{t.ad}</b>
                <div className="m" style={{ fontSize: 13 }}>
                  {t.eslesti ? (t.son_gorulme ? `son görülme ${gunSaat(t.son_gorulme)}` : 'bağlı') : t.kod_son ? `kod ${saat(t.kod_son)}'e kadar geçerli` : 'henüz bağlanmadı'}
                  {' · '}
                  {t.bugun ? `bugünkü yoklama ${t.bugun.saat} · ${t.bugun.kim ?? '—'}${t.bugun.duzeltme ? ` · ${t.bugun.duzeltme} düzeltme` : ''}` : 'bugün yoklama alınmadı'}
                </div>
              </div>
              {t.kilit ? (
                <span className="chip down">Kilitli{t.kilit === 'infinity' ? '' : ` · ${saat(t.kilit)}'e kadar`}</span>
              ) : (
                <span className={`chip ${t.eslesti ? 'up' : ''}`}>{t.eslesti ? 'Bağlı' : 'Kod bekliyor'}</span>
              )}
              {t.kilit && (
                <button className="btn" onClick={() => kilitAc(t)}>
                  Kilidi aç
                </button>
              )}
              <button className="btn" onClick={() => yeniKod(t)}>
                {t.eslesti ? 'Yeniden bağla' : 'Yeni kod'}
              </button>
              {silinecek === t.id ? (
                <>
                  <button className="btn warn" onClick={() => kaldir(t)}>
                    Evet, kaldır
                  </button>
                  <button className="btn" onClick={() => setSilinecek(null)}>
                    Vazgeç
                  </button>
                </>
              ) : (
                <button className="btn" onClick={() => setSilinecek(t.id)} aria-label={`${t.ad} kaldır`}>
                  Kaldır
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-end' }}>
        <label className="field" htmlFor="tahtaSinif" style={{ minWidth: 200 }}>
          Tahta ekle: sınıf
          <select id="tahtaSinif" value={yeniSinif} onChange={(e) => setYeniSinif(e.target.value)}>
            <option value="">Sınıf seç</option>
            {bos.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <button className="btn pri" disabled={!yeniSinif || busy} onClick={ekle}>
          Tahta ekle ve kod al
        </button>
      </div>
    </section>
  )
}

interface PinDurum {
  var: boolean
  olusturma: string | null
  son_kullanim: string | null
  son_tahta: string | null
  pilot: boolean
}

/** Hesap ayarları: öğretmenin tahta yoklama PIN'i. Okulda bağlı tahta yoksa görünmez. */
export function TahtaPinKarti() {
  const qc = useQueryClient()
  const d = useQuery({
    queryKey: ['tahta_pin_durum'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('tahta_pin_durum')
      if (error) throw error
      return data as PinDurum | null
    },
  })
  const [pin, setPin] = useState('')
  const [onay, setOnay] = useState(false)
  const [err, setErr] = useState('')
  if (!d.data?.pilot) return null

  async function al() {
    setErr('')
    const { data, error } = await supabase.rpc('tahta_pin_yenile')
    setOnay(false)
    if (error) return setErr(hata(error))
    setPin(data as string)
    qc.invalidateQueries({ queryKey: ['tahta_pin_durum'] })
  }

  return (
    <section className="card stack" style={{ padding: 20 }} aria-labelledby="pin-baslik">
      <h2 id="pin-baslik">Tahta yoklama PIN'in</h2>
      <p>Akıllı tahtadaki BK Akıllı Yoklama'dan yoklama gönderirken bu 4 haneli kodu girersin. Kodu sistem verir; kimseyle paylaşma.</p>
      {pin ? (
        <div role="status" className="card" style={{ padding: 14, background: 'var(--primary-soft)', display: 'grid', gap: 6 }}>
          <span>Yeni PIN'in:</span>
          <span className="mono" data-testid="tahta-pin" style={{ fontSize: 32, letterSpacing: 8 }}>{pin}</span>
          <span style={{ fontSize: 13 }}>Bu kod bir daha gösterilmez. Not al ya da ezberle; unutursan buradan yenisini alırsın.</span>
          <button className="btn" style={{ justifySelf: 'start' }} onClick={() => setPin('')}>
            Ezberledim, gizle
          </button>
        </div>
      ) : d.data.var ? (
        <>
          <b>PIN'in var</b>
          <p className="m" style={{ margin: 0 }}>
            {d.data.son_kullanim ? `Son kullanım: ${gunSaat(d.data.son_kullanim)}${d.data.son_tahta ? ` · ${d.data.son_tahta}` : ''}` : 'Henüz kullanılmadı.'}
          </p>
          <p className="m" style={{ margin: 0, fontSize: 13 }}>
            Sana ait olmayan bir yoklama gördüysen ya da PIN'ini biri öğrendiyse hemen yenisini al; eskisi geçersiz olur.
          </p>
          {onay ? (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="btn pri" onClick={al}>
                Evet, yeni PIN ver
              </button>
              <button className="btn" onClick={() => setOnay(false)}>
                Vazgeç
              </button>
            </div>
          ) : (
            <button className="btn" style={{ alignSelf: 'flex-start' }} onClick={() => setOnay(true)}>
              Yeni PIN al
            </button>
          )}
        </>
      ) : (
        <button className="btn pri" style={{ alignSelf: 'flex-start' }} onClick={al}>
          PIN al
        </button>
      )}
      {err && (
        <p role="alert" className="err">
          {err}
        </p>
      )}
    </section>
  )
}
