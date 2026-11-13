// Öğretmenler Odası (0068): veri erişimi. Yetki veritabanında (RLS); burada yalnız okuma/yazma ve canlı akış.
import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from './supabase'
import { useAuth } from '@/auth/AuthProvider'
import { kanalSirala, type KanalAyar } from './oda'

async function rows<T>(q: PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<T[]> {
  const { data, error } = await q
  if (error) throw new Error(error.message)
  return (data ?? []) as T[]
}

/** Erişilebilen kanallar (genel, kademeler, zümreler); öğretmen değilse boş */
export function useOdaKanallari(enabled = true) {
  const { profile } = useAuth()
  return useQuery({
    queryKey: ['oda', 'kanallar', profile?.id],
    enabled: enabled && !!profile,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('oda_kanallari')
      if (error) throw new Error(error.message)
      return kanalSirala(((data ?? []) as string[]).filter((x) => typeof x === 'string'))
    },
  })
}

/** Kanal başına okunmamış mesaj sayısı (menü rozeti ve kanal listesi) */
export function useOdaOkunmamis(enabled = true) {
  const { profile } = useAuth()
  return useQuery({
    queryKey: ['oda', 'okunmamis', profile?.id],
    enabled: enabled && !!profile,
    refetchInterval: 60_000,
    queryFn: async () => {
      const r = await rows<{ kanal: string; sayi: number }>(supabase.rpc('oda_okunmamis'))
      return Object.fromEntries(r.map((x) => [x.kanal, x.sayi])) as Record<string, number>
    },
  })
}

export interface OdaMesaj {
  id: string
  kanal: string
  yazan: string | null
  metin: string
  anilan: string[]
  created_at: string
  yazan_p: { full_name: string; branch: string | null } | null
  oda_tepki: { user_id: string; emoji: string }[]
}

/** Kanalın son 200 mesajı (eskiden yeniye) */
export function useOdaMesajlar(kanal: string | null) {
  return useQuery({
    queryKey: ['oda', 'mesaj', kanal],
    enabled: !!kanal,
    // Canlı akış kesilirse (ağ, güvenlik duvarı) yine de yarım dakikada bir tazelenir
    refetchInterval: 30_000,
    queryFn: async () =>
      (
        await rows<OdaMesaj>(
          supabase
            .from('oda_mesaj')
            .select('id, kanal, yazan, metin, anilan, created_at, yazan_p:profiles!oda_mesaj_yazan_fkey(full_name, branch), oda_tepki(user_id, emoji)')
            .eq('kanal', kanal!)
            .order('created_at', { ascending: false })
            .limit(200),
        )
      ).reverse(),
  })
}

/** Canlı akış: yeni/silinen mesaj ve tepkide ilgili sorgular tazelenir (satır içeriğine güvenilmez, RLS'li sorgu yeniden çalışır) */
export function useOdaCanli(enabled: boolean) {
  const qc = useQueryClient()
  const { profile } = useAuth()
  useEffect(() => {
    if (!enabled || !profile) return
    let t: ReturnType<typeof setTimeout> | null = null
    const tazele = () => {
      if (t) return
      t = setTimeout(() => {
        t = null
        void qc.invalidateQueries({ queryKey: ['oda'] })
      }, 250)
    }
    const ch = supabase
      .channel(`oda-${profile.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'oda_mesaj' }, tazele)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'oda_tepki' }, tazele)
      .subscribe()
    return () => {
      if (t) clearTimeout(t)
      void supabase.removeChannel(ch)
    }
  }, [enabled, profile, qc])
}

export function useOdaYaz() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (m: { kanal: string; metin: string; anilan: string[] }) => {
      const { error } = await supabase.from('oda_mesaj').insert(m)
      if (error) throw new Error(error.message)
    },
    onSuccess: (_d, m) => qc.invalidateQueries({ queryKey: ['oda', 'mesaj', m.kanal] }),
  })
}

export function useOdaSil() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('oda_mesaj').delete().eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['oda', 'mesaj'] }),
  })
}

export function useOdaTepki() {
  const qc = useQueryClient()
  const { profile } = useAuth()
  return useMutation({
    mutationFn: async (t: { mesaj_id: string; emoji: string; var: boolean }) => {
      const { error } = t.var
        ? await supabase.from('oda_tepki').delete().match({ mesaj_id: t.mesaj_id, emoji: t.emoji, user_id: profile!.id })
        : await supabase.from('oda_tepki').insert({ mesaj_id: t.mesaj_id, emoji: t.emoji, user_id: profile!.id })
      if (error && error.code !== '23505') throw new Error(error.message)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['oda', 'mesaj'] }),
  })
}

/** Kanal okundu: o ana kadarki mesajlar okunmuş sayılır */
export function useOdaOkundu() {
  const qc = useQueryClient()
  const { profile } = useAuth()
  return useMutation({
    mutationFn: async (kanal: string) => {
      const { error } = await supabase.from('oda_okundu').upsert({ user_id: profile!.id, kanal, zaman: new Date().toISOString() })
      if (error) throw new Error(error.message)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['oda', 'okunmamis'] }),
  })
}

// ---------- Öğrenci Takip ----------
export interface OdaDevamsizlik {
  student_id: string
  level: 'normal' | 'sari' | 'turuncu' | 'kirmizi'
  used: number
  lim: number
  label: string
}
export function useOdaDevamsizlik(ids: string[]) {
  return useQuery({
    queryKey: ['oda', 'devamsizlik', ids.join(',')],
    enabled: ids.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const out: OdaDevamsizlik[] = []
      for (let i = 0; i < ids.length; i += 300) {
        const r = await rows<OdaDevamsizlik>(supabase.rpc('oda_devamsizlik', { p_ogrenciler: ids.slice(i, i + 300) }))
        out.push(...r.map((x) => ({ ...x, used: Number(x.used) })))
      }
      return new Map(out.map((x) => [x.student_id, x]))
    },
  })
}

export interface OdaNot {
  id: string
  student_id: string
  visibility: 'ogretmen' | 'rehber' | 'veli'
  body: string | null
  created_at: string
}
/** Seçili öğrencilerin görebildiğim notları (notes_view: görünürlük kuralları veritabanında) */
export function useOdaNotlar(ids: string[]) {
  return useQuery({
    queryKey: ['notes', 'oda', ids.join(',')],
    enabled: ids.length > 0,
    queryFn: async () => {
      const out: OdaNot[] = []
      for (let i = 0; i < ids.length; i += 150)
        out.push(
          ...(await rows<OdaNot>(
            supabase
              .from('notes_view')
              .select('id, student_id, visibility, body, created_at')
              .in('student_id', ids.slice(i, i + 150))
              .order('created_at', { ascending: false })
              .limit(3000),
          )),
        )
      return out
    },
  })
}

/** Bugün kendi nöbetim (teacher_duties yalnız sahibine açık) */
export function useBugunNobet(gun: number) {
  const { profile } = useAuth()
  return useQuery({
    queryKey: ['oda', 'nobet', profile?.id, gun],
    enabled: !!profile && gun >= 1 && gun <= 5,
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from('teacher_duties').select('period, location').eq('teacher_id', profile!.id).eq('weekday', gun).order('period', { ascending: false })
      if (error) throw new Error(error.message)
      return (data ?? []) as { period: 'before_noon' | 'after_noon'; location: string }[]
    },
  })
}

/** Yönetimin kanal düzenlemeleri (0071): ad, açıklama, sıra, gizleme, özel kanallar */
export function useOdaKanalAyar(enabled = true) {
  const { profile } = useAuth()
  return useQuery({
    queryKey: ['oda', 'kanal-ayar', profile?.school_id],
    enabled: enabled && !!profile,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const r = await rows<KanalAyar>(supabase.from('oda_kanal').select('kanal, ad, aciklama, gizli, sira, uyeler'))
      return new Map(r.map((x) => [x.kanal, x]))
    },
  })
}
