// Öğretmenler Odası Pano (0070): yapışkan notlar, hızlı anket, teşekkür kartı, ders/nöbet değişimi, doğum günü.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from './supabase'
import { useAuth } from '@/auth/AuthProvider'

async function rows<T>(q: PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<T[]> {
  const { data, error } = await q
  if (error) throw new Error(error.message)
  return (data ?? []) as T[]
}
async function yap(q: PromiseLike<{ error: { message: string } | null }>) {
  const { error } = await q
  if (error) throw new Error(error.message)
}
function useYaz<A>(fn: (a: A) => Promise<void>, anahtar: string) {
  const qc = useQueryClient()
  return useMutation({ mutationFn: fn, onSuccess: () => qc.invalidateQueries({ queryKey: ['oda', anahtar] }) })
}

// ---------- Pano notları ----------
export type NotRenk = 'sari' | 'mavi' | 'yesil' | 'pembe'
export interface PanoNot {
  id: string
  yazan: string | null
  metin: string
  renk: NotRenk
  bitis: string
  created_at: string
  yazan_p: { full_name: string } | null
}
export const usePanoNotlar = () =>
  useQuery({
    queryKey: ['oda', 'pano'],
    queryFn: () =>
      rows<PanoNot>(supabase.from('oda_pano').select('id, yazan, metin, renk, bitis, created_at, yazan_p:profiles!oda_pano_yazan_fkey(full_name)').order('created_at', { ascending: false }).limit(60)),
  })
export const usePanoEkle = () => useYaz((n: { metin: string; renk: NotRenk; bitis: string }) => yap(supabase.from('oda_pano').insert(n)), 'pano')
export const usePanoSil = () => useYaz((id: string) => yap(supabase.from('oda_pano').delete().eq('id', id)), 'pano')

// ---------- Hızlı anket ----------
export interface Anket {
  id: string
  soran: string | null
  soru: string
  secenekler: string[]
  bitis: string
  created_at: string
  soran_p: { full_name: string } | null
}
export function useAnketler() {
  const { profile } = useAuth()
  return useQuery({
    queryKey: ['oda', 'anket', profile?.id],
    queryFn: async () => {
      const l = await rows<Anket>(
        supabase.from('oda_anket').select('id, soran, soru, secenekler, bitis, created_at, soran_p:profiles!oda_anket_soran_fkey(full_name)').order('created_at', { ascending: false }).limit(20),
      )
      const ids = l.map((a) => a.id)
      const [sonuc, oy] = ids.length
        ? await Promise.all([
            rows<{ anket_id: string; secim: number; sayi: number }>(supabase.rpc('oda_anket_sonuc', { p_anketler: ids })),
            rows<{ anket_id: string; secim: number }>(supabase.from('oda_anket_oy').select('anket_id, secim').in('anket_id', ids)),
          ])
        : [[], []]
      return l.map((a) => ({
        ...a,
        sayilar: a.secenekler.map((_, i) => sonuc.find((s) => s.anket_id === a.id && s.secim === i)?.sayi ?? 0),
        benim: oy.find((o) => o.anket_id === a.id)?.secim ?? null,
      }))
    },
  })
}
export const useAnketEkle = () => useYaz((a: { soru: string; secenekler: string[]; bitis: string }) => yap(supabase.from('oda_anket').insert(a)), 'anket')
export const useAnketOyla = () => useYaz((o: { anket: string; secim: number | null }) => yap(supabase.rpc('oda_anket_oyla', { p_anket: o.anket, p_secim: o.secim })), 'anket')
export const useAnketSil = () => useYaz((id: string) => yap(supabase.from('oda_anket').delete().eq('id', id)), 'anket')

// ---------- Teşekkür kartı ----------
export interface Tesekkur {
  id: string
  gonderen: string | null
  alan: string
  metin: string
  created_at: string
  gonderen_p: { full_name: string } | null
  alan_p: { full_name: string; branch: string | null } | null
  oda_tesekkur_alkis: { user_id: string }[]
}
export const useTesekkurler = () =>
  useQuery({
    queryKey: ['oda', 'tesekkur'],
    queryFn: () =>
      rows<Tesekkur>(
        supabase
          .from('oda_tesekkur')
          .select('id, gonderen, alan, metin, created_at, gonderen_p:profiles!oda_tesekkur_gonderen_fkey(full_name), alan_p:profiles!oda_tesekkur_alan_fkey(full_name, branch), oda_tesekkur_alkis(user_id)')
          .order('created_at', { ascending: false })
          .limit(40),
      ),
  })
export const useTesekkurEkle = () => useYaz((t: { alan: string; metin: string }) => yap(supabase.from('oda_tesekkur').insert(t)), 'tesekkur')
export const useTesekkurSil = () => useYaz((id: string) => yap(supabase.from('oda_tesekkur').delete().eq('id', id)), 'tesekkur')
export function useAlkis() {
  const { profile } = useAuth()
  return useYaz(
    (a: { id: string; var: boolean }) =>
      a.var
        ? yap(supabase.from('oda_tesekkur_alkis').delete().match({ tesekkur_id: a.id, user_id: profile!.id }))
        : yap(supabase.from('oda_tesekkur_alkis').insert({ tesekkur_id: a.id, user_id: profile!.id })),
    'tesekkur',
  )
}

// ---------- Ders / nöbet değişimi ----------
export interface Degisim {
  id: string
  isteyen: string | null
  tur: 'ders' | 'nobet'
  tarih: string
  saat: string
  sinif: string | null
  aciklama: string | null
  durum: 'acik' | 'alindi' | 'iptal'
  alan: string | null
  created_at: string
  isteyen_p: { full_name: string; branch: string | null } | null
  alan_p: { full_name: string } | null
}
export const useDegisimler = (bugun: string) =>
  useQuery({
    queryKey: ['oda', 'degisim', bugun],
    queryFn: () =>
      rows<Degisim>(
        supabase
          .from('oda_degisim')
          .select('id, isteyen, tur, tarih, saat, sinif, aciklama, durum, alan, created_at, isteyen_p:profiles!oda_degisim_isteyen_fkey(full_name, branch), alan_p:profiles!oda_degisim_alan_fkey(full_name)')
          .gte('tarih', bugun)
          .neq('durum', 'iptal')
          .order('tarih')
          .limit(50),
      ),
  })
export const useDegisimEkle = () =>
  useYaz((d: { tur: 'ders' | 'nobet'; tarih: string; saat: string; sinif: string | null; aciklama: string | null }) => yap(supabase.from('oda_degisim').insert(d)), 'degisim')
export const useDegisimAl = () => useYaz((id: string) => yap(supabase.rpc('oda_degisim_al', { p_id: id })), 'degisim')
export const useDegisimIptal = () => useYaz((id: string) => yap(supabase.rpc('oda_degisim_iptal', { p_id: id })), 'degisim')

// ---------- Doğum günü ----------
export interface DogumGunu {
  user_id: string
  ay: number
  gun: number
  goster: boolean
  p: { full_name: string } | null
}
export const useDogumGunleri = () =>
  useQuery({
    queryKey: ['oda', 'dogum'],
    staleTime: 10 * 60_000,
    queryFn: () => rows<DogumGunu>(supabase.from('oda_dogum_gunu').select('user_id, ay, gun, goster, p:profiles!oda_dogum_gunu_user_id_fkey(full_name)')),
  })
export function useDogumKaydet() {
  const { profile } = useAuth()
  return useYaz(
    (d: { ay: number; gun: number; goster: boolean } | null) =>
      d ? yap(supabase.from('oda_dogum_gunu').upsert({ user_id: profile!.id, ...d })) : yap(supabase.from('oda_dogum_gunu').delete().eq('user_id', profile!.id)),
    'dogum',
  )
}
