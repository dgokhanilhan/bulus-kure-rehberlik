// Etkinlik günlüğü (0100): uygulama açılışı ve açılan sayfaların kaydı + yalnız yetkili hesabın gördüğü günlük döküm.
// Kayda yalnız sayfa yolu, rol ve cihaz türü girer; içerik, IP ya da tarayıcı bilgisi girmez. Kayıtlar 90 gün saklanır.
import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from './supabase'
import type { Role } from './types'
import { cihazTuru, kayitYolu, type Cihaz } from './etkinlikMetin'

export * from './etkinlikMetin'

// ---------- Kayıt tutucu (AppShell) ----------
interface Olay { rol: Role; tur: 'giris' | 'sayfa'; sayfa?: string; cihaz: Cihaz; at: string }
// Bekleyen olaylar sekme belleğinde de tutulur: sayfa yenilense ya da adres yazılarak gidilse de gönderilmeden kaybolmaz.
const KUYRUK_ANAHTAR = 'bk-etk-kuyruk'
let kuyruk: Olay[] | null = null
let zamanlayici: ReturnType<typeof setTimeout> | null = null
let sonYol: string | null = null

function kuyrukAl(): Olay[] {
  if (kuyruk) return kuyruk
  try {
    const v = JSON.parse(sessionStorage.getItem(KUYRUK_ANAHTAR) ?? '[]') as Olay[]
    kuyruk = Array.isArray(v) ? v.slice(-60) : []
  } catch {
    kuyruk = []
  }
  return kuyruk
}
function kuyrukYaz() {
  try {
    sessionStorage.setItem(KUYRUK_ANAHTAR, JSON.stringify(kuyruk ?? []))
  } catch {
    /* gizli sekme: yalnız bellekte */
  }
}
let gonderiliyor = false
async function gonder() {
  if (zamanlayici) clearTimeout(zamanlayici)
  zamanlayici = null
  if (gonderiliyor) return
  const parca = kuyrukAl().slice(0, 30)
  if (!parca.length) return
  gonderiliyor = true
  // Olaylar yalnız sunucu kabul edince kuyruktan çıkar (sayfa kapanırken yarım kalan gönderim sonraki açılışta tekrarlanır;
  // aynı olay iki kez yazılmaz: sunucuda kişi+tür+sayfa+zaman tekil). Hata kullanıcıyı etkilemez.
  const { error } = await supabase.rpc('etkinlik_yaz', { p_olaylar: parca }).then((r) => r, () => ({ error: true }))
  gonderiliyor = false
  const k = kuyrukAl()
  if (!error || k.length > 50) k.splice(0, parca.length)
  kuyrukYaz()
  if (!error && k.length) await gonder()
}
function zamanla() {
  if (!zamanlayici && kuyrukAl().length) zamanlayici = setTimeout(() => void gonder(), 2500)
}
function ekle(o: Olay) {
  const k = kuyrukAl()
  k.push(o)
  if (k.length > 60) k.splice(0, k.length - 60)
  kuyrukYaz()
  zamanla()
}
function simdikiCihaz(): Cihaz {
  const kisa = Math.min(window.screen?.width ?? window.innerWidth, window.screen?.height ?? window.innerHeight)
  return cihazTuru(kisa, window.matchMedia?.('(pointer: coarse)').matches ?? false)
}

/** Uygulama açılışını (sekme başına günde bir) ve her sayfa değişimini kaydeder. */
export function useEtkinlikKaydi(uid: string | undefined, rol: Role | null, yol: string) {
  useEffect(() => {
    if (!uid || !rol) return
    const gun = new Date().toISOString().slice(0, 10)
    const anahtar = `bk-etk:${uid}:${rol}:${gun}`
    let yeni = true
    try {
      yeni = !sessionStorage.getItem(anahtar)
      sessionStorage.setItem(anahtar, '1')
    } catch {
      /* gizli sekme: her açılış giriş sayılır */
    }
    zamanla() // önceki yüklemeden kalan olaylar
    if (yeni) {
      sonYol = null
      ekle({ rol, tur: 'giris', cihaz: simdikiCihaz(), at: new Date().toISOString() })
    }
    const gizlenince = () => document.visibilityState === 'hidden' && void gonder()
    document.addEventListener('visibilitychange', gizlenince)
    return () => document.removeEventListener('visibilitychange', gizlenince)
  }, [uid, rol])
  useEffect(() => {
    if (!uid || !rol) return
    const p = kayitYolu(yol)
    if (!p || p === sonYol) return
    sonYol = p
    ekle({ rol, tur: 'sayfa', sayfa: p, cihaz: simdikiCihaz(), at: new Date().toISOString() })
  }, [uid, rol, yol])
}

// ---------- Okuma (yalnız yetkili hesap; yetki veritabanında) ----------
export function useEtkinlikYetki(enabled: boolean) {
  return useQuery({
    queryKey: ['etkinlik-yetki'],
    enabled,
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('etkinlik_yetkili')
      if (error) throw new Error(error.message)
      return data === true
    },
  })
}

export interface Giren {
  id: string
  ad: string
  rol: string
  brans: string | null
  ilk: string
  son: string
  sayfa: number
  islem: number
  cihaz: Cihaz | null
  kayitli: boolean
}
export interface Girmeyen { id: string; ad: string; rol: string; brans: string | null; son_giris: string | null }
export interface EtkinlikGun { gun: string; girenler: Giren[]; girmeyenler: Girmeyen[]; kayit_basi: string | null }

export function useEtkinlikGun(gun: string) {
  return useQuery({
    queryKey: ['etkinlik-gun', gun],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('etkinlik_gun', { p_gun: gun })
      if (error) throw new Error(error.message)
      return data as EtkinlikGun
    },
  })
}

export interface KisiOlay { at: string; tur: string; sayfa: string | null; cihaz: Cihaz | null; adet: number; ogrenci: string | null }
export function useEtkinlikKisi(kisi: string | null, gun: string) {
  return useQuery({
    queryKey: ['etkinlik-kisi', kisi, gun],
    enabled: !!kisi,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('etkinlik_kisi', { p_user: kisi, p_gun: gun })
      if (error) throw new Error(error.message)
      return ((data as { olaylar: KisiOlay[] }).olaylar ?? []) as KisiOlay[]
    },
  })
}

