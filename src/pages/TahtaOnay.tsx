// Tahta yoklamasını telefondan onaylama (0102): tahtadaki QR /t/<kod> adresini açar.
// Yalnız okulun öğretmeni ya da (iki adımlı doğrulamalı) yöneticisi görür ve onaylar; yetki veritabanında.
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

type Durum = 'geldi' | 'devamsiz' | 'gec' | 'izinli' | 'raporlu'
const ETIKET: Record<Durum, string> = { geldi: 'Geldi', devamsiz: 'Gelmedi', gec: 'Geç geldi', izinli: 'İzinli', raporlu: 'Raporlu' }
interface Onay {
  durum: 'bekliyor' | 'onaylandi' | 'suresi_doldu'
  sinif: string
  tahta: string
  olustu: string
  onaylayan: string | null
  onay_at: string | null
  sayilar: Record<Durum, number>
  liste: { ad: string; durum: Durum }[]
  bildirim_saati: string
  bekliyor: boolean
}
interface Sonuc {
  sinif: string
  saat: string
  bildirilecek: number
  bildirim_saati: string
  bekliyor: boolean
}
const saat = (t: string) => new Date(t).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Istanbul' })

function bildirim(saatMetni: string, bekliyor: boolean, kisi: number, onaylandi = true) {
  if (kisi === 0) return 'Bugün velilere yoklama bildirimi gitmeyecek.'
  if (bekliyor) return `${kisi} öğrencinin velisine ${saatMetni}'da bildirim gidecek.`
  return onaylandi ? `${kisi} öğrencinin velisine bildirim gönderildi.` : `Onaylayınca ${kisi} öğrencinin velisine hemen bildirim gider.`
}

export default function TahtaOnay() {
  const { kod = '' } = useParams()
  const [sonuc, setSonuc] = useState<Sonuc | null>(null)
  const q = useQuery({
    queryKey: ['tahta_onay', kod],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('tahta_onay_goster', { p_kod: kod })
      if (error) throw error
      return data as Onay
    },
    retry: false,
    refetchOnWindowFocus: false,
  })
  const onayla = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('tahta_onay_onayla', { p_kod: kod })
      if (error) throw error
      return data as Sonuc
    },
    onSuccess: setSonuc,
  })

  if (q.isLoading)
    return (
      <p className="m" style={{ padding: 20 }}>
        <span className="spinner" aria-hidden="true" /> Yükleniyor…
      </p>
    )
  if (q.error)
    return (
      <div className="stack tahta-onay">
        <h1 className="hd">Tahta yoklaması</h1>
        <section className="card stack" style={{ padding: 20 }} role="alert">
          <p>{(q.error as { message?: string }).message ?? 'Kod açılamadı.'}</p>
          <Link className="btn" to="/">
            Ana sayfaya dön
          </Link>
        </section>
      </div>
    )
  const o = q.data!

  if (sonuc)
    return (
      <div className="stack tahta-onay">
        <section className="card stack" style={{ padding: 20 }} role="status">
          <span className="tahta-onay-tik" aria-hidden="true">
            ✓
          </span>
          <h1 className="hd">{sonuc.sinif} yoklaması gönderildi</h1>
          <p>
            {sonuc.saat} · Tahtada da “kaydedildi” yazacak. {bildirim(sonuc.bildirim_saati, sonuc.bekliyor, sonuc.bildirilecek)}
          </p>
          <p className="m">Düzeltmen gerekirse tahtada “Düzelt”e bas.</p>
          <Link className="btn" to="/">
            Tamam
          </Link>
        </section>
      </div>
    )

  const gelmeyen = (o.sayilar.devamsiz ?? 0) + (o.sayilar.gec ?? 0)
  const hata = onayla.error as { message?: string } | null
  return (
    <div className="stack tahta-onay">
      <p className="m">
        {o.tahta} · {saat(o.olustu)}
      </p>
      <h1 className="hd">{o.sinif} yoklamasını onaylıyor musun?</h1>
      <section className="card stack" style={{ padding: 16 }} aria-label="Yoklama özeti">
        <div className="tahta-onay-sayi">
          {(['geldi', 'devamsiz', 'gec', 'izinli', 'raporlu'] as Durum[])
            .filter((d) => d === 'geldi' || d === 'devamsiz' || d === 'gec' || o.sayilar[d])
            .map((d) => (
              <div key={d}>
                <b>{o.sayilar[d] ?? 0}</b>
                <span>{ETIKET[d].toLocaleLowerCase('tr-TR')}</span>
              </div>
            ))}
        </div>
        {o.liste.length > 0 ? (
          <ul className="tahta-onay-liste">
            {o.liste.map((x, i) => (
              <li key={i}>
                <span>{x.ad}</span>
                <span className={`chip ${x.durum === 'devamsiz' ? 'down' : x.durum === 'gec' ? 'gold' : 'n'}`}>{ETIKET[x.durum]}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="m">Herkes geldi olarak işaretli.</p>
        )}
        <p className="m">{bildirim(o.bildirim_saati, o.bekliyor, gelmeyen, false)}</p>
      </section>

      {o.durum === 'bekliyor' ? (
        <>
          {hata && (
            <p role="alert" className="err">
              {hata.message ?? 'Onaylanamadı.'}
            </p>
          )}
          <button className="btn pri tahta-onay-btn" disabled={onayla.isPending} onClick={() => onayla.mutate()}>
            {onayla.isPending ? 'Gönderiliyor…' : 'Onayla ve gönder'}
          </button>
          <Link className="btn" to="/">
            Vazgeç
          </Link>
          <p className="m" style={{ textAlign: 'center' }}>
            Onaylayan olarak senin adın kaydedilir. Kod tek kullanımlık, 2 dakika geçerli.
          </p>
        </>
      ) : (
        <section className="card stack" style={{ padding: 16 }} role="alert">
          <p>
            {o.durum === 'onaylandi'
              ? `Bu yoklama ${o.onay_at ? saat(o.onay_at) : ''} saatinde ${o.onaylayan ?? 'bir öğretmen'} tarafından onaylandı.`
              : 'Bu kodun süresi doldu. Tahtadaki güncel kodu okut.'}
          </p>
          <Link className="btn" to="/">
            Ana sayfaya dön
          </Link>
        </section>
      )}
    </div>
  )
}
