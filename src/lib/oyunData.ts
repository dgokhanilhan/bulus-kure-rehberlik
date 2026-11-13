// Öğretmenler Odası oyunları (0069): sunucu çağrıları. Günlük bulmacalar sunucuda üretilir/doğrulanır; skor tablosu RPC ile.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from './supabase'
import { useAuth } from '@/auth/AuthProvider'
import type { Istatistik, OyunId } from './oyunlar'

async function rpc<T>(ad: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(ad, args)
  if (error) throw new Error(error.message)
  return data as T
}

export interface SudokuDurum {
  gun: string
  ipucu: number[]
  basladi: string
  bitti: string | null
  puan: number | null
  cozum: number[] | null
}
/** Bugünkü sudokuyu açar (ilk açılışta süre başlar) */
export function useSudoku(acik: boolean) {
  const { profile } = useAuth()
  return useQuery({
    queryKey: ['oyun', 'sudoku', profile?.id],
    enabled: acik && !!profile,
    staleTime: Infinity,
    queryFn: () => rpc<SudokuDurum>('oda_sudoku_ac'),
  })
}
export function useSudokuBitir() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (p: number[]) => rpc<{ dogru: boolean; puan?: number }>('oda_sudoku_bitir', { p }),
    onSuccess: (r) => {
      if (r.dogru) void qc.invalidateQueries({ queryKey: ['oyun'] })
    },
  })
}

export interface KelimeDurum {
  gun: string
  bitti: string | null
  puan: number | null
  tahminler: { t: string; r: number[] }[]
  cevap: string | null
}
export function useKelime(acik: boolean) {
  const { profile } = useAuth()
  return useQuery({
    queryKey: ['oyun', 'kelime', profile?.id],
    enabled: acik && !!profile,
    staleTime: Infinity,
    queryFn: () => rpc<KelimeDurum>('oda_kelime_ac'),
  })
}
export function useKelimeTahmin() {
  const qc = useQueryClient()
  const { profile } = useAuth()
  return useMutation({
    mutationFn: (p: string) => rpc<KelimeDurum>('oda_kelime_tahmin', { p }),
    onSuccess: (d) => {
      qc.setQueryData(['oyun', 'kelime', profile?.id], d)
      if (d.bitti) void qc.invalidateQueries({ queryKey: ['oyun', 'tablo'] })
    },
  })
}

export function useSkorKaydet() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (s: { oyun: OyunId; puan: number; sure_ms: number }) => rpc<null>('oda_skor_kaydet', { p_oyun: s.oyun, p_puan: s.puan, p_sure_ms: s.sure_ms }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['oyun', 'tablo'] }),
  })
}

export interface SkorSatiri {
  sira: number
  user_id: string
  ad: string
  puan: number
  ben: boolean
}
export function useSkorTablosu(oyun: OyunId, donem: 'gun' | 'hafta') {
  return useQuery({
    queryKey: ['oyun', 'tablo', oyun, donem],
    refetchInterval: 60_000,
    queryFn: () => rpc<SkorSatiri[]>('oda_skor_tablosu', { p_oyun: oyun, p_donem: donem }),
  })
}
export interface LigSatiri extends SkorSatiri {
  oyun_sayisi: number
}
export function useLig() {
  return useQuery({
    queryKey: ['oyun', 'tablo', 'lig'],
    refetchInterval: 60_000,
    queryFn: () => rpc<LigSatiri[]>('oda_lig'),
  })
}
export function useOyunIstatistik() {
  return useQuery({
    queryKey: ['oyun', 'tablo', 'istatistik'],
    queryFn: () => rpc<Istatistik | null>('oda_oyun_istatistik'),
  })
}

/** Skor tablosunda gizlenme tercihi */
export function useOyunGizli() {
  const { profile } = useAuth()
  const qc = useQueryClient()
  const q = useQuery({
    queryKey: ['oyun', 'gizli', profile?.id],
    enabled: !!profile,
    queryFn: async () => {
      const { data, error } = await supabase.from('oda_oyun_tercih').select('gizli').eq('user_id', profile!.id).maybeSingle()
      if (error) throw new Error(error.message)
      return data?.gizli ?? false
    },
  })
  const m = useMutation({
    mutationFn: async (gizli: boolean) => {
      const { error } = await supabase.from('oda_oyun_tercih').upsert({ user_id: profile!.id, gizli })
      if (error) throw new Error(error.message)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['oyun'] }),
  })
  return { gizli: q.data ?? false, yukleniyor: q.isLoading, ayarla: m.mutate, kaydediliyor: m.isPending }
}
