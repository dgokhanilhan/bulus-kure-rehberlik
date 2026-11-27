// Bildirim türleri (0015): simge ve ad; bildirime tıklanınca ilgili sayfayı açma.
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase } from './supabase'
import { useOpenReport } from '@/components/Report'
import { useToast } from '@/components/Toast'
import { useAuth } from '@/auth/AuthProvider'
import { useSayfaIzinli } from './izinliSayfalar'
import type { Notification } from './types'

type IconName = 'book' | 'chat' | 'doc' | 'cal' | 'warn' | 'task' | 'shield' | 'bell' | 'spark' | 'users' | 'image' | 'cup'
export const NTYPES: Record<string, { label: string; icon: IconName }> = {
  nobet: { label: 'Nöbet hatırlatması', icon: 'cal' },
  etut: { label: 'Etüt', icon: 'cal' },
  odev_yeni: { label: 'Yeni ödev', icon: 'book' },
  odev_kontrol: { label: 'Ödev kontrol edildi', icon: 'book' },
  odev_hatirlatma: { label: 'Ödev hatırlatması', icon: 'book' },
  mesaj: { label: 'Yeni mesaj', icon: 'chat' },
  duyuru: { label: 'Yeni duyuru', icon: 'chat' },
  sinav: { label: 'Sınav', icon: 'cal' },
  sinav_hatirlatma: { label: 'Yaklaşan sınav', icon: 'cal' },
  etkinlik: { label: 'Etkinlik', icon: 'cal' },
  devamsizlik: { label: 'Devamsızlık', icon: 'warn' },
  rapor: { label: 'Yeni rapor', icon: 'doc' },
  deneme: { label: 'Deneme sonucu', icon: 'spark' },
  gorev: { label: 'Görev', icon: 'task' },
  gorusme: { label: 'Görüşme', icon: 'cal' },
  not: { label: 'Rehberlik notu', icon: 'doc' },
  kayit: { label: 'Kayıt', icon: 'shield' },
  bursluluk: { label: 'Bursluluk', icon: 'users' },
  galeri: { label: 'Galeri', icon: 'image' },
  oda: { label: 'Öğretmenler Odası', icon: 'cup' },
  sistem: { label: 'Sistem', icon: 'warn' },
  diger: { label: 'Genel', icon: 'bell' },
}
export const ntype = (t?: string | null) => NTYPES[t ?? 'diger'] ?? NTYPES.diger!

/** Bildirimin bağlantısına göre ilgili ekranı açar. Hedef sayfa bu kişiye kapalıysa (modül kapatılmış vb.) ana sayfaya atmak yerine söyler. */
export function useOpenNotification() {
  const nav = useNavigate()
  const openReport = useOpenReport()
  const izinli = useSayfaIzinli()
  const toast = useToast()
  const { activeStudent, switchStudent } = useAuth()
  return (n: Notification) => {
    const L = n.link
    if (L.report) return openReport({ id: L.report })
    let to: string | null = null
    if (L.homework) to = `/odevler?odev=${L.homework}`
    else if (L.event) to = `/takvim?etkinlik=${L.event}`
    else if (L.album) to = `/galeri?album=${L.album}`
    else if (L.conversation) to = `/iletisim?c=${L.conversation}`
    else if (L.announcement) to = `/duyurular?d=${L.announcement}`
    else if (L.page === 'ogrenci' && L.sid) {
      to = `/ogrenciler/${L.sid}${L.tab ? `?sekme=${L.tab}` : ''}`
      // Aynı bildirim veliye de gider (ör. "görevini tamamladı"); veli öğrenci dosyasına giremez, kendi sayfasına yönlenir
      if (!izinli(to)) {
        const aile: Record<string, string> = { gorevler: '/gorevler', gorusmeler: '/gorusmeler', raporlar: '/raporlar', notlar: '/ozet', hedef: '/hedefim' }
        to = aile[L.tab ?? ''] ?? '/panel'
        if (L.sid !== activeStudent?.id) switchStudent(L.sid)
      }
    }
    else if (L.page === 'ogretmenler-odasi' && L.kanal) to = `/ogretmenler-odasi?sekme=sohbet&kanal=${encodeURIComponent(L.kanal)}`
    else if (L.page) to = L.tab ? `/${L.page}?sekme=${L.tab}` : `/${L.page}`
    if (!to) return
    if (!izinli(to)) return toast('Bu bildirimin sayfası şu anda kapalı.', 'warn')
    nav(to)
  }
}

/** Okunmamış bildirim sayısı (liste 40 ile sınırlı; sayaç tümünü sayar). Nöbet hatırlatması yalnız öğretmenlere. */
export function useOkunmamisSayisi(uid: string | undefined, role: string | null | undefined) {
  return useQuery({
    queryKey: ['notifications', uid, role, 'sayac'],
    enabled: !!uid,
    refetchInterval: 60_000,
    queryFn: async () => {
      let b = supabase.from('notifications').select('id', { count: 'exact', head: true }).is('read_at', null)
      if (role !== 'brans' && role !== 'rehber') b = b.or('type.is.null,type.neq.nobet')
      const { count, error } = await b
      if (error) throw error
      return count ?? 0
    },
  })
}

/** Okunmamış bildirimlerin hepsini okundu yapar (yalnız ekrandaki 40'ı değil). */
export async function hepsiniOkunduYap() {
  const { error } = await supabase.from('notifications').update({ read_at: new Date().toISOString() }).is('read_at', null)
  if (error) throw error
}
