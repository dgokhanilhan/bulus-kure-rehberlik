// Bildirim türleri (0015): simge ve ad; bildirime tıklanınca ilgili sayfayı açma.
import { useNavigate } from 'react-router-dom'
import { useOpenReport } from '@/components/Report'
import type { Notification } from './types'

type IconName = 'book' | 'chat' | 'doc' | 'cal' | 'warn' | 'task' | 'shield' | 'bell' | 'spark' | 'users' | 'image'
export const NTYPES: Record<string, { label: string; icon: IconName }> = {
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
  sistem: { label: 'Sistem', icon: 'warn' },
  diger: { label: 'Genel', icon: 'bell' },
}
export const ntype = (t?: string | null) => NTYPES[t ?? 'diger'] ?? NTYPES.diger!

/** Bildirimin bağlantısına göre ilgili ekranı açar. */
export function useOpenNotification() {
  const nav = useNavigate()
  const openReport = useOpenReport()
  return (n: Notification) => {
    const L = n.link
    if (L.report) openReport({ id: L.report })
    else if (L.homework) nav(`/odevler?odev=${L.homework}`)
    else if (L.event) nav(`/takvim?etkinlik=${L.event}`)
    else if (L.album) nav(`/galeri?album=${L.album}`)
    else if (L.conversation) nav(`/iletisim?sekme=mesajlar&c=${L.conversation}`)
    else if (L.page === 'ogrenci' && L.sid) nav(`/ogrenciler/${L.sid}${L.tab ? `?sekme=${L.tab}` : ''}`)
    else if (L.page) nav(L.tab ? `/${L.page}?sekme=${L.tab}` : `/${L.page}`)
  }
}
