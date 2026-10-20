// Yönetim → Hedef listeleri: LGS liseleri ve YKS lisans programlarının taban puan listeleri (öğrenci dosyası → Hedef).
// YKS: ÖSYM "En Küçük ve En Büyük Puanlar (TABLO-4)" Excel'i olduğu gibi yüklenir. LGS: e-Okul'daki MEB yerleştirme ekranından
// şablona aktarılan liste. Dosya tarayıcıda okunur; önizlemeden sonra yönetici onayıyla yüklenir (hedef_yukle, 0054).
import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { csvSatirlar } from '@/lib/etutOku'
import { LGS_SABLON, lgsTablo, osymTablo4, type OkumaSonucu, type Sinav } from '@/lib/hedef'
import { useAyar } from '@/lib/ayarlar'
import { fmt } from '@/lib/analiz'
import { useToast } from '@/components/Toast'

interface OzetSatir {
  sinav: Sinav
  yil: number
  yerlesik: boolean
  satir: number
  tabanli: number
  kaynak: string | null
}
const PARCA = 2000

export function useHedefOzet() {
  return useQuery({
    queryKey: ['hedef-ozet'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('hedef_ozet')
      if (error) throw new Error(error.message)
      return (data ?? []) as OzetSatir[]
    },
  })
}

async function satirlar(f: File): Promise<unknown[][]> {
  if (/\.xlsx$/i.test(f.name)) {
    const { default: readXlsxFile } = await import('read-excel-file')
    return (await readXlsxFile(f)) as unknown[][]
  }
  return csvSatirlar(await f.text())
}

export default function YonetimHedefler() {
  const toast = useToast()
  const qc = useQueryClient()
  const ayar = useAyar()
  const ozet = useHedefOzet()
  const [sinav, setSinav] = useState<Sinav>('LGS')
  const [yil, setYil] = useState(new Date().getFullYear() - (new Date().getMonth() < 7 ? 1 : 0))
  const [kaynak, setKaynak] = useState('')
  const [okunan, setOkunan] = useState<(OkumaSonucu & { dosya: string }) | null>(null)
  const [busy, setBusy] = useState('')

  async function oku(f: File | undefined) {
    if (!f) return
    setOkunan(null)
    try {
      const rows = await satirlar(f)
      setOkunan({ ...(sinav === 'YKS' ? osymTablo4(rows, yil) : lgsTablo(rows, yil)), dosya: f.name })
      if (!kaynak) setKaynak(sinav === 'YKS' ? `ÖSYM ${yil} Tablo-4` : `MEB e-Okul ${yil} yerleştirme`)
    } catch {
      toast('Dosya okunamadı. Excel (.xlsx) ya da CSV yükle.', 'warn')
    }
  }

  async function yukle() {
    if (!okunan?.programlar.length) return
    if (!window.confirm(`${sinav} ${yil} listesi (${okunan.programlar.length} satır) yüklensin mi? Okulun bu yıla ait önceki ${sinav} listesi silinir.`)) return
    const ps = okunan.programlar.map(({ sinav: _s, yil: _y, id: _i, ...p }) => p)
    try {
      for (let i = 0; i < ps.length; i += PARCA) {
        setBusy(`Yükleniyor… ${Math.min(i + PARCA, ps.length)}/${ps.length}`)
        const { error } = await supabase.rpc('hedef_yukle', { p_sinav: sinav, p_yil: yil, p_kaynak: kaynak.trim() || null, p_satirlar: ps.slice(i, i + PARCA), p_bastan: i === 0 })
        if (error) throw error
      }
      toast(`${ps.length} satır yüklendi.`)
      setOkunan(null)
      await qc.invalidateQueries({ queryKey: ['hedef-ozet'] })
      await qc.invalidateQueries({ queryKey: ['hedef-programlar'] })
    } catch (e) {
      toast((e as Error).message || 'Yüklenemedi.', 'warn')
    }
    setBusy('')
  }

  async function sil(s: OzetSatir) {
    if (!window.confirm(`Okulun yüklediği ${s.sinav} ${s.yil} listesi (${s.satir} satır) kaldırılsın mı? Bu listeden seçilmiş öğrenci hedefleri de kalkar.`)) return
    const { error } = await supabase.rpc('hedef_sil', { p_sinav: s.sinav, p_yil: s.yil })
    if (error) return toast(error.message, 'warn')
    toast('Liste kaldırıldı.')
    await qc.invalidateQueries({ queryKey: ['hedef-ozet'] })
  }

  function sablon() {
    const csv = [LGS_SABLON.join(';'), 'Örnek Fen Lisesi;Bartın;Merkez;Fen Lisesi;İngilizce;438,212;4,86;150'].join('\r\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }))
    a.download = 'lgs-taban-puan-sablonu.csv'
    a.click()
  }

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <p className="m" style={{ fontSize: 14, margin: 0 }}>
        Öğrenci dosyasındaki <b>Hedef</b> sekmesi bu listelerle çalışır: öğrencinin deneme puanı liselerin (LGS) ve üniversite programlarının (YKS) taban puanlarıyla
        karşılaştırılır. Listelenen iller: <b>{ayar.list('hedef.iller').join(', ') || '—'}</b> (<Link to="/yonetim?sekme=tum_ayarlar">Tüm ayarlar</Link> → "hedef").
      </p>

      <section className="card" style={{ padding: 16 }} aria-label="Yüklü listeler">
        <b>Yüklü listeler</b>
        <div className="tbl" tabIndex={0} role="region" aria-label="Yüklü listeler tablosu" style={{ marginTop: 8 }}>
          <table data-testid="hedef-ozet">
            <thead>
              <tr>
                <th>Sınav</th>
                <th>Yıl</th>
                <th>Kaynak</th>
                <th className="num">Satır</th>
                <th className="num">Taban puanlı</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {(ozet.data ?? []).map((s) => (
                <tr key={`${s.sinav}${s.yil}${s.yerlesik}`}>
                  <td>{s.sinav}</td>
                  <td>{s.yil}</td>
                  <td>
                    {s.kaynak ?? '—'} {s.yerlesik && <span className="chip n">yerleşik</span>}
                  </td>
                  <td className="num">{s.satir}</td>
                  <td className="num">{s.tabanli}</td>
                  <td>
                    {!s.yerlesik && (
                      <button type="button" className="btn sm ghost" onClick={() => sil(s)}>
                        Kaldır
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {!ozet.data?.length && (
                <tr>
                  <td colSpan={6} className="m">
                    {ozet.isLoading ? 'Yükleniyor…' : 'Henüz liste yok.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card" style={{ padding: 16, display: 'grid', gap: 12 }} aria-label="Liste yükle">
        <b>Liste yükle</b>
        <div className="btns" style={{ alignItems: 'flex-end' }}>
          <div className="seg" role="group" aria-label="Sınav">
            {(['LGS', 'YKS'] as const).map((s) => (
              <button key={s} type="button" className={sinav === s ? 'on' : ''} aria-pressed={sinav === s} onClick={() => (setSinav(s), setOkunan(null))}>
                {s}
              </button>
            ))}
          </div>
          <label className="field" htmlFor="hdYil" style={{ maxWidth: 120 }}>
            <span className="label">Yıl</span>
            <input id="hdYil" type="number" min={2015} max={2100} value={yil} onChange={(e) => (setYil(Number(e.target.value)), setOkunan(null))} />
          </label>
          <label className="field" htmlFor="hdKaynak" style={{ flex: 1, minWidth: 220 }}>
            <span className="label">Kaynak</span>
            <input id="hdKaynak" maxLength={300} value={kaynak} placeholder={sinav === 'YKS' ? 'ÖSYM 2025 Tablo-4' : 'MEB e-Okul 2025 yerleştirme'} onChange={(e) => setKaynak(e.target.value)} />
          </label>
        </div>
        <p className="m" style={{ fontSize: 13, margin: 0 }}>
          {sinav === 'YKS' ? (
            <>
              ÖSYM'nin "YKS Yerleştirme Sonuçlarına İlişkin Sayısal Bilgiler" sayfasındaki <b>En Küçük ve En Büyük Puanlar (TABLO-4)</b> Excel'ini olduğu gibi yükle
              (lisans programları, genel kontenjan).
            </>
          ) : (
            <>
              e-Okul'daki LGS yerleştirme (taban puan / yüzdelik) ekranından okulları şablona aktar: {LGS_SABLON.join(', ')}.{' '}
              <button type="button" className="btn sm ghost" onClick={sablon}>
                Şablonu indir (CSV)
              </button>
            </>
          )}
        </p>
        <label className="field" htmlFor="hdDosya">
          <span className="label">Dosya (.xlsx ya da .csv)</span>
          <input id="hdDosya" type="file" accept=".xlsx,.csv,.txt" onChange={(e) => oku(e.target.files?.[0])} />
        </label>
        {okunan && (
          <div className={`card ${okunan.hata ? 'issue' : ''}`} style={{ padding: 12 }} data-testid="hedef-onizleme" role={okunan.hata ? 'alert' : 'status'}>
            {okunan.hata ? (
              <b>{okunan.hata}</b>
            ) : (
              <>
                <b>
                  {okunan.dosya}: {okunan.programlar.length} satır okundu
                  {okunan.atlanan ? `, ${okunan.atlanan} satır okunamadı (atlanır)` : ''}.
                </b>
                <div className="tbl" style={{ marginTop: 8 }}>
                  <table>
                    <tbody>
                      {okunan.programlar.slice(0, 5).map((p) => (
                        <tr key={p.kod}>
                          <td>{p.kurum}</td>
                          <td>{p.il ?? '—'}</td>
                          <td>{[p.birim, p.program].filter(Boolean).join(' · ')}</td>
                          <td>{p.puan_turu ?? ''}</td>
                          <td className="num">{p.taban_puan === null ? '—' : fmt(p.taban_puan, 3)}</td>
                          <td className="num">{p.yuzdelik === null ? '' : `%${fmt(p.yuzdelik, 2)}`}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="btns" style={{ marginTop: 8 }}>
                  <button type="button" className="btn pri" onClick={yukle} disabled={!!busy}>
                    {busy || 'Listeyi yükle'}
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </section>
    </div>
  )
}
