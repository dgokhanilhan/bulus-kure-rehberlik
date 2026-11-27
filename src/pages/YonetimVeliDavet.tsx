// Yönetim → Veli daveti (0103): sınıf bazlı veli kapsamı, öğrenciye özel davet kodu, QR kart (PDF) ve WhatsApp paylaşımı.
// Kod velinin kayıt sayfasını (/v/<kod>) açar; kodla gelen kayıt Onaylar'a öğrencisi seçili düşer. Yetki veritabanında (is_admin).
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Confirm } from '@/components/Confirm'
import { useToast } from '@/components/Toast'
import { dosyaIndir, useOkulAdi } from '@/components/GorevTakip'
import { davetAdresi, kodBicim, sonTarih, whatsappBaglanti, whatsappMetni } from '@/lib/veliDavetMetin'

interface SinifOzet {
  id: string
  ad: string
  kademe: number | null
  ogrenci: number
  bagli: number
  davetli: number
  kart: number
  whatsapp: number
  bekleyen: number
}
interface OgrDavet {
  id: string
  ad: string
  no: string | null
  bagli: number
  bekleyen: number
  kod: string | null
  son: string | null
  kullanim: number | null
  kart_at: string | null
  whatsapp_at: string | null
  gecerli: boolean
}
interface Hazir {
  id: string
  ad: string
  sinif: string
  kod: string
  son: string
}

const kok = () => window.location.origin
const kisaTarih = (t: string) => new Date(t).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', timeZone: 'Europe/Istanbul' })

async function hazirla(ids: string[], yenile = false): Promise<Hazir[]> {
  const { data, error } = await supabase.rpc('veli_davet_hazirla', { p_students: ids, p_yenile: yenile })
  if (error) throw error
  return data as Hazir[]
}
async function isaretle(ids: string[], tur: 'kart' | 'whatsapp') {
  const { error } = await supabase.rpc('veli_davet_isaretle', { p_students: ids, p_tur: tur })
  if (error) throw error
}
async function sinifOgrencileri(id: string) {
  const { data, error } = await supabase.rpc('veli_davet_sinif', { p_class: id })
  if (error) throw error
  return data as OgrDavet[]
}

export function VeliDavet() {
  const qc = useQueryClient()
  const toast = useToast()
  const okul = useOkulAdi()
  const [acik, setAcik] = useState<string | null>(null)
  const [kapsam, setKapsam] = useState('')
  const [yalnizBagsiz, setYalnizBagsiz] = useState(true)
  const [mesgul, setMesgul] = useState<string | null>(null)
  const [yenileSor, setYenileSor] = useState<OgrDavet | null>(null)

  const ozet = useQuery({
    queryKey: ['veli_davet_ozet'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('veli_davet_ozet')
      if (error) throw error
      return data as SinifOzet[]
    },
  })
  const detay = useQuery({ queryKey: ['veli_davet_sinif', acik], queryFn: () => sinifOgrencileri(acik!), enabled: !!acik })
  const yenile = () => {
    void qc.invalidateQueries({ queryKey: ['veli_davet_ozet'] })
    void qc.invalidateQueries({ queryKey: ['veli_davet_sinif'] })
  }

  async function kartIndir(ids: string[], dosya: string) {
    if (!ids.length) return toast('Kart basılacak öğrenci yok.', 'warn')
    const h = await hazirla(ids)
    const { veliDavetPdf } = await import('@/lib/veliDavetPdf')
    const blob = await veliDavetPdf({ okul, logo: true, kartlar: h.map((x) => ({ ...x, adres: davetAdresi(kok(), x.kod) })) })
    dosyaIndir(blob, dosya)
    await isaretle(ids, 'kart')
    toast(`${h.length} kart hazırlandı`)
    yenile()
  }

  async function topluKart() {
    if (!ozet.data || !kapsam) return
    setMesgul('toplu')
    try {
      const siniflar = kapsam.startsWith('k:') ? ozet.data.filter((c) => String(c.kademe) === kapsam.slice(2)) : ozet.data.filter((c) => c.id === kapsam)
      const ids: string[] = []
      for (const c of siniflar) for (const o of await sinifOgrencileri(c.id)) if (!yalnizBagsiz || (o.bagli === 0 && o.bekleyen === 0)) ids.push(o.id)
      const ad = kapsam.startsWith('k:') ? `${kapsam.slice(2)}-siniflar` : (siniflar[0]?.ad ?? 'sinif').replace(/\W+/g, '-')
      await kartIndir(ids, `veli-davet-kartlari-${ad}.pdf`)
    } catch (e) {
      toast((e as Error).message || 'Kartlar hazırlanamadı.', 'warn')
    } finally {
      setMesgul(null)
    }
  }

  async function whatsapp(o: OgrDavet) {
    // Açılır pencere engellenmesin diye pencere tıklama anında açılır, adres kod hazır olunca verilir
    const w = window.open('', '_blank')
    setMesgul(o.id)
    try {
      const h = o.gecerli && o.kod && o.son ? { kod: o.kod, son: o.son } : (await hazirla([o.id]))[0]!
      const metin = whatsappMetni({ okul, cocuk: o.ad, adres: davetAdresi(kok(), h.kod), son: h.son })
      if (w) w.location.href = whatsappBaglanti(metin)
      else window.location.href = whatsappBaglanti(metin)
      await isaretle([o.id], 'whatsapp')
      yenile()
    } catch (e) {
      w?.close()
      toast((e as Error).message || 'Bağlantı hazırlanamadı.', 'warn')
    } finally {
      setMesgul(null)
    }
  }

  async function kopyala(o: OgrDavet) {
    setMesgul(o.id)
    try {
      const h = o.gecerli && o.kod ? { kod: o.kod } : (await hazirla([o.id]))[0]!
      await navigator.clipboard.writeText(davetAdresi(kok(), h.kod))
      toast('Davet bağlantısı kopyalandı')
      yenile()
    } catch {
      toast('Kopyalanamadı.', 'warn')
    } finally {
      setMesgul(null)
    }
  }

  if (ozet.isLoading)
    return (
      <p className="m">
        <span className="spinner" aria-hidden="true" /> Yükleniyor…
      </p>
    )
  if (ozet.isError) return <div className="empty">{(ozet.error as Error).message || 'Yüklenemedi.'}</div>
  const s = ozet.data!
  const top = s.reduce((a, c) => ({ ogrenci: a.ogrenci + c.ogrenci, bagli: a.bagli + c.bagli, davetli: a.davetli + c.davetli, bekleyen: a.bekleyen + c.bekleyen }), {
    ogrenci: 0,
    bagli: 0,
    davetli: 0,
    bekleyen: 0,
  })
  const kademeler = [...new Set(s.map((c) => c.kademe).filter((k): k is number => k != null))]

  return (
    <div className="stack">
      <p className="m">
        Her öğrenciye özel bir davet kodu hazırlanır. Kod kâğıt kartla çocukla eve gider ya da WhatsApp'tan veliye gönderilir. Kodla kayıt olan veli{' '}
        <Link to="/onaylar">Onaylar</Link>'a öğrencisi seçili düşer; tek tıkla onaylarsın. Kod 14 gün geçerli, anne ve baba için 2 kez kullanılır.
      </p>
      <div className="vd-ozet">
        <div>
          <b>{top.ogrenci}</b>
          <span>öğrenci</span>
        </div>
        <div>
          <b>{top.bagli}</b>
          <span>velisi bağlı</span>
        </div>
        <div>
          <b>{top.davetli}</b>
          <span>davet hazırlandı</span>
        </div>
        <div>
          <b>{top.bekleyen}</b>
          <span>onay bekliyor</span>
        </div>
      </div>

      <section className="card stack" style={{ padding: 16 }} aria-label="Toplu kart bas">
        <h3 style={{ fontSize: 16 }}>Kart bas</h3>
        <div className="vd-toplu">
          <label className="field" htmlFor="vdKapsam">
            Kimler için
            <select id="vdKapsam" value={kapsam} onChange={(e) => setKapsam(e.target.value)}>
              <option value="">Seç</option>
              {kademeler.map((k) => (
                <option key={`k${k}`} value={`k:${k}`}>
                  Tüm {k}. sınıflar
                </option>
              ))}
              {s.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.ad}
                </option>
              ))}
            </select>
          </label>
          <label className="vd-kutu">
            <input type="checkbox" checked={yalnizBagsiz} onChange={(e) => setYalnizBagsiz(e.target.checked)} />
            Yalnız velisi bağlı olmayanlar
          </label>
          <button className="btn pri" disabled={!kapsam || mesgul === 'toplu'} onClick={topluKart}>
            {mesgul === 'toplu' ? 'Hazırlanıyor…' : 'Kartları indir (PDF)'}
          </button>
        </div>
        <p className="m" style={{ fontSize: 13 }}>
          A4 sayfaya 8 kart sığar. Geçerli kodu olan öğrencinin kodu değişmez.
        </p>
      </section>

      <div className="tbl card">
        <table>
          <thead>
            <tr>
              <th>Sınıf</th>
              <th className="num">Öğrenci</th>
              <th>Davet</th>
              <th>Velisi bağlı</th>
            </tr>
          </thead>
          <tbody>
            {s.map((c) => {
              const oran = c.ogrenci ? c.bagli / c.ogrenci : 0
              return [
                <tr key={c.id} className={acik === c.id ? 'vd-acik' : ''}>
                  <td>
                    <button className="linkbtn" aria-expanded={acik === c.id} onClick={() => setAcik(acik === c.id ? null : c.id)}>
                      <b>{c.ad}</b> {acik === c.id ? '▴' : '▾'}
                    </button>
                  </td>
                  <td className="num">{c.ogrenci}</td>
                  <td>
                    {c.davetli ? (
                      <span className="chip up">
                        {c.kart} kart · {c.whatsapp} WhatsApp
                      </span>
                    ) : (
                      <span className="chip n">Davet yok</span>
                    )}{' '}
                    {c.bekleyen > 0 && (
                      <Link className="chip gold" to="/onaylar">
                        {c.bekleyen} onay bekliyor
                      </Link>
                    )}
                  </td>
                  <td>
                    <span className="vd-cubuk" aria-hidden="true">
                      <i style={{ width: `${Math.round(oran * 100)}%` }} />
                    </span>{' '}
                    <span className="sayi">
                      {c.bagli}/{c.ogrenci}
                    </span>
                  </td>
                </tr>,
                acik === c.id && (
                  <tr key={`${c.id}-d`} className="vd-acik">
                    <td colSpan={4} style={{ padding: 0 }}>
                      {detay.isLoading ? (
                        <p className="m" style={{ padding: 12 }}>
                          Yükleniyor…
                        </p>
                      ) : (
                        <ul className="vd-liste" aria-label={`${c.ad} öğrencileri`}>
                          {(detay.data ?? []).map((o) => (
                            <li key={o.id}>
                              <span className="vd-ad">
                                <b>{o.ad}</b>
                                <span className="m">
                                  {o.bagli > 0
                                    ? `${o.bagli} veli bağlı`
                                    : o.bekleyen > 0
                                      ? 'Veli kaydoldu, onayın bekleniyor'
                                      : o.gecerli && o.kod
                                        ? `Kod ${kodBicim(o.kod)} · ${sonTarih(o.son!)} tarihine kadar${o.kart_at ? ` · kart ${kisaTarih(o.kart_at)}` : ''}${o.whatsapp_at ? ` · WhatsApp ${kisaTarih(o.whatsapp_at)}` : ''}`
                                        : o.kod
                                          ? 'Kodun süresi doldu ya da hakkı bitti'
                                          : 'Davet hazırlanmadı'}
                                </span>
                              </span>
                              {o.bagli > 0 ? (
                                <span className="chip up">Bağlı ↑</span>
                              ) : o.bekleyen > 0 ? (
                                <Link className="btn sm pri" to="/onaylar">
                                  Onaylara git
                                </Link>
                              ) : null}
                              <span className="btns vd-btns">
                                <button className="btn sm vd-wa" disabled={mesgul === o.id} onClick={() => whatsapp(o)} aria-label={`${o.ad} için WhatsApp'ta paylaş`}>
                                  WhatsApp
                                </button>
                                <button
                                  className="btn sm"
                                  disabled={mesgul === o.id}
                                  aria-label={`${o.ad} için kart indir`}
                                  onClick={async () => {
                                    setMesgul(o.id)
                                    try {
                                      await kartIndir([o.id], `veli-davet-karti-${o.ad.replace(/\s+/g, '-')}.pdf`)
                                    } catch (e) {
                                      toast((e as Error).message || 'Kart hazırlanamadı.', 'warn')
                                    } finally {
                                      setMesgul(null)
                                    }
                                  }}
                                >
                                  Kart
                                </button>
                                <button className="btn sm" disabled={mesgul === o.id} onClick={() => kopyala(o)} aria-label={`${o.ad} için bağlantıyı kopyala`}>
                                  Bağlantı
                                </button>
                                {o.kod && (
                                  <button className="btn sm" onClick={() => setYenileSor(o)} aria-label={`${o.ad} için kodu yenile`}>
                                    Yenile
                                  </button>
                                )}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                  </tr>
                ),
              ]
            })}
          </tbody>
        </table>
      </div>
      <p className="m" style={{ fontSize: 13 }}>
        WhatsApp düğmesi mesajı hazır yazar; kişiyi sen seçip gönderirsin. Mesajda öğrencinin yalnız ilk adı ve bağlantı bulunur.
      </p>

      {yenileSor && (
        <Confirm
          title="Davet kodu yenilensin mi?"
          action="Evet, yenile"
          onClose={() => setYenileSor(null)}
          onConfirm={async () => {
            try {
              await hazirla([yenileSor.id], true)
              toast(`${yenileSor.ad} için yeni kod hazırlandı`)
              yenile()
              setYenileSor(null)
            } catch (e) {
              return (e as Error).message || 'Yenilenemedi.'
            }
          }}
        >
          {yenileSor.ad} için eski kod ve bağlantı geçersiz olur; daha önce dağıtılan kart artık çalışmaz. Kart kaybolduysa ya da yanlış kişiye gittiyse yenile.
        </Confirm>
      )}
    </div>
  )
}
