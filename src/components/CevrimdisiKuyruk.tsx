// Bağlantısız kayıt kuyruğu: gönderici, sıraya alma yardımcısı ve kabuktaki uyarı şeridi.
import { useCallback, useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/auth/AuthProvider'
import { hataliTemizle, KUYRUK_OLAY, kuyrugaEkle, kuyrukOku, kuyruguGonder, type Depo, type KuyrukIs } from '@/lib/cevrimdisi'
import { useToast } from './Toast'

const yedek = new Map<string, string>()
/** localStorage (gizli pencerede/kapalıysa bellek): hiçbir okuma/yazma hata fırlatmaz */
export const depo: Depo = {
  getItem: (k) => {
    try {
      return window.localStorage.getItem(k)
    } catch {
      return yedek.get(k) ?? null
    }
  },
  setItem: (k, v) => {
    try {
      window.localStorage.setItem(k, v)
    } catch {
      yedek.set(k, v)
    }
  },
  removeItem: (k) => {
    try {
      window.localStorage.removeItem(k)
    } catch {
      /* yok */
    }
    yedek.delete(k)
  },
}

const firlat = (e: { message?: string } | null) => {
  if (e) throw new Error(e.message ?? 'Kaydedilemedi.')
}

/** Sıradaki işi sunucuya yazar. Günlük kontrol eklemesi tekrar gönderilirse çift kayıt oluşmaz (benzersiz anahtar). */
export async function isiGonder(is: KuyrukIs) {
  if (is.tur === 'yoklama') {
    if (is.up.length) firlat((await supabase.from('attendance').upsert(is.up, { onConflict: 'student_id,day' })).error)
    if (is.del.length) firlat((await supabase.from('attendance').delete().in('id', is.del)).error)
  } else {
    if (is.ekle.length) firlat((await supabase.from('gunluk_kontrol').upsert(is.ekle, { onConflict: 'student_id,tarih,madde', ignoreDuplicates: true })).error)
    if (is.sil.length) firlat((await supabase.from('gunluk_kontrol').delete().in('id', is.sil)).error)
    for (const g of is.guncelle) firlat((await supabase.from('gunluk_kontrol').update({ detay: g.detay }).eq('id', g.id)).error)
  }
}

/** Bağlantı yokken kaydı sıraya alır; alınamazsa false */
export function siraya(uid: string, is: Parameters<typeof kuyrugaEkle>[1]) {
  return kuyrugaEkle(uid, is, depo)
}

/** Kabukta: bekleyen/gönderilemeyen kayıt şeridi; bağlantı gelince ve 30 sn'de bir sırayı gönderir */
export function CevrimdisiKuyruk() {
  const { profile } = useAuth()
  const uid = profile?.id
  const qc = useQueryClient()
  const toast = useToast()
  const [k, setK] = useState(() => (uid ? kuyrukOku(uid, depo) : { bekleyen: [], hatali: [] }))
  const calisiyor = useRef(false)

  const yenile = useCallback(() => uid && setK(kuyrukOku(uid, depo)), [uid])
  const gonder = useCallback(async () => {
    if (!uid || calisiyor.current || !kuyrukOku(uid, depo).bekleyen.length) return
    if (typeof navigator !== 'undefined' && !navigator.onLine) return
    calisiyor.current = true
    try {
      const r = await kuyruguGonder(uid, isiGonder, depo)
      if (r.gonderilen) {
        toast(`Bekleyen ${r.gonderilen} kayıt gönderildi.`)
        qc.invalidateQueries({ queryKey: ['attendance'] })
        qc.invalidateQueries({ queryKey: ['gunluk-kontrol'] })
      }
      if (r.reddedilen) toast(`${r.reddedilen} kayıt gönderilemedi; ayrıntı sayfanın üstünde.`, 'warn')
    } finally {
      calisiyor.current = false
      yenile()
    }
  }, [uid, qc, toast, yenile])

  useEffect(() => {
    yenile()
    gonder()
    const olay = () => {
      yenile()
      gonder()
    }
    window.addEventListener('online', olay)
    window.addEventListener(KUYRUK_OLAY, yenile)
    const t = window.setInterval(gonder, 30_000)
    return () => {
      window.removeEventListener('online', olay)
      window.removeEventListener(KUYRUK_OLAY, yenile)
      window.clearInterval(t)
    }
  }, [yenile, gonder])

  if (!uid || (!k.bekleyen.length && !k.hatali.length)) return null
  return (
    <div className="cd-serit" role="status" data-testid="cevrimdisi-serit">
      {k.bekleyen.length > 0 && (
        <div className="cd-satir">
          <span>
            <b>{k.bekleyen.length} kayıt bu cihazda bekliyor</b> ({k.bekleyen.map((x) => x.etiket).join(', ')}). Bağlantı gelince kendiliğinden gönderilir; o
            zamana kadar çıkış yapma.
          </span>
          <button type="button" className="btn sm" onClick={gonder}>
            Şimdi gönder
          </button>
        </div>
      )}
      {k.hatali.length > 0 && (
        <div className="cd-satir hata">
          <span>
            <b>{k.hatali.length} kayıt gönderilemedi:</b> {k.hatali.map((x) => `${x.etiket} — ${x.hata}`).join(' · ')}. Sayfayı yenileyip yeniden işaretle.
          </span>
          <button type="button" className="btn sm" onClick={() => hataliTemizle(uid, depo)}>
            Anladım
          </button>
        </div>
      )}
    </div>
  )
}
