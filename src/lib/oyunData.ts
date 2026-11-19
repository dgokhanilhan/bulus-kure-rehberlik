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
  /** Alınan ipuçları (0084): hücre ve doğru rakam */
  ipuclari?: { i: number; v: number }[]
  ipucu_hak?: number
  lig_disi?: boolean
  neden?: 'sure' | 'ritim' | null
}
export interface SudokuSonuc {
  dogru: boolean
  puan?: number
  ham?: number
  ipucu?: number
  lig_disi?: boolean
  neden?: 'sure' | 'ritim' | null
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
    mutationFn: (a: { p: number[]; hamle: number[]; sekme: number }) => rpc<SudokuSonuc>('oda_sudoku_tamamla', { p: a.p, p_hamle: a.hamle, p_sekme: a.sekme }),
    onSuccess: (r) => {
      if (r.dogru) void qc.invalidateQueries({ queryKey: ['oyun'] })
    },
  })
}
/** İpucu al (günde 3; her biri bitiş süresine +30 sn). Çözüm tarayıcıya gitmez: sunucu tek hücre döner. */
export function useSudokuIpucu() {
  const qc = useQueryClient()
  const { profile } = useAuth()
  return useMutation({
    mutationFn: (a: { hucre: number | null; giris: number[] }) =>
      rpc<{ hucre: number; deger: number; ipucu_hak: number }>('oda_sudoku_ipucu', { p_hucre: a.hucre, p_giris: a.giris }),
    onSuccess: (r) =>
      qc.setQueryData<SudokuDurum>(['oyun', 'sudoku', profile?.id], (d) =>
        d ? { ...d, ipuclari: [...(d.ipuclari ?? []), { i: r.hucre, v: r.deger }], ipucu_hak: r.ipucu_hak } : d,
      ),
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
  /** Sudoku: en iyi çözümde alınan ipucu sayısı (her biri +30 sn, puana dahil) */
  ipucu?: number
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

// ---------- Günün Şehri, 5 Soruda Bugün, Mini Bulmaca (0073) ----------
export interface SehirDurum {
  gun: string
  bitti: string | null
  puan: number | null
  tahminler: { plaka: number; ad: string; km: number; yon: string | null }[]
  ipuclari: string[]
  /** 0085: o günün toplam ipucu sayısı (eski günler 3, yeni günler 6) */
  ipucu_toplam?: number
  cevap: string | null
  iller: { plaka: number; ad: string }[]
}
export function useSehir(acik: boolean) {
  const { profile } = useAuth()
  return useQuery({ queryKey: ['oyun', 'sehir', profile?.id], enabled: acik && !!profile, staleTime: Infinity, queryFn: () => rpc<SehirDurum>('oda_sehir_ac') })
}
export function useSehirTahmin() {
  const qc = useQueryClient()
  const { profile } = useAuth()
  return useMutation({
    mutationFn: (p: number) => rpc<SehirDurum>('oda_sehir_tahmin', { p }),
    onSuccess: (d) => {
      qc.setQueryData(['oyun', 'sehir', profile?.id], d)
      if (d.bitti) void qc.invalidateQueries({ queryKey: ['oyun', 'tablo'] })
    },
  })
}

export interface SoruDurum {
  gun: string
  bitti: string | null
  puan: number | null
  /** cevap: verdiğim cevap (1–4); dogru: cevaplanan soruda, oyun bitince hepsinde dolu */
  sorular: { soru: string; secenekler: string[]; cevap: number | null; dogru: number | null }[]
  /** Süreli günlerde (0087): toplam süre ve kalan saniye (sunucu ölçer) */
  sure?: number
  kalan?: number | null
  /** Süreli günde henüz "Başla"ya basılmadı (sorular boş) */
  baslamadi?: boolean
  /** Cevap süre dolduktan sonra geldi; kaydedilmedi */
  sure_doldu?: boolean
}
// Süreli günlerde oyunu başlatmadan bakar; süresiz günde (ya da 0087 yoksa) eskisi gibi doğrudan açar
async function soruYukle(): Promise<SoruDurum> {
  let d: SoruDurum
  try {
    d = await rpc<SoruDurum>('oda_soru_bak')
  } catch (e) {
    // Yalnız fonksiyon yoksa (0087 geri alınmışsa) eski yola dön; ağ hatasında süreyi kendiliğinden başlatma
    if (/could not find the function/i.test((e as Error).message)) return rpc<SoruDurum>('oda_soru_ac')
    throw e
  }
  if (d.baslamadi && !d.sure) return rpc<SoruDurum>('oda_soru_ac')
  return { ...d, sorular: d.sorular ?? [] }
}
export function useSoru(acik: boolean) {
  const { profile } = useAuth()
  return useQuery({ queryKey: ['oyun', 'soru', profile?.id], enabled: acik && !!profile, staleTime: Infinity, queryFn: soruYukle })
}
export function useSoruBasla() {
  const qc = useQueryClient()
  const { profile } = useAuth()
  return useMutation({
    mutationFn: () => rpc<SoruDurum>('oda_soru_ac'),
    onSuccess: (d) => qc.setQueryData(['oyun', 'soru', profile?.id], d),
  })
}
export function useSoruCevap() {
  const qc = useQueryClient()
  const { profile } = useAuth()
  return useMutation({
    mutationFn: (p: number) => rpc<SoruDurum>('oda_soru_cevap', { p }),
    onSuccess: (d) => {
      qc.setQueryData(['oyun', 'soru', profile?.id], d)
      if (d.bitti) void qc.invalidateQueries({ queryKey: ['oyun', 'tablo'] })
    },
  })
}

export interface BulmacaDurum {
  gun: string
  basladi: string
  bitti: string | null
  puan: number | null
  /** 0086: kafes boyu (5, 6, 7) ve kelime taşıyan satır/sütunlar (0 tabanlı); eski yanıtta yok → 5×5 */
  boyut?: number
  satirlar?: number[]
  sutunlar?: number[]
  yatay: string[]
  dusey: string[]
  cozum: string[] | null
}
export function useBulmaca(acik: boolean) {
  const { profile } = useAuth()
  return useQuery({
    queryKey: ['oyun', 'bulmaca', profile?.id],
    enabled: acik && !!profile,
    staleTime: Infinity,
    queryFn: () => rpc<BulmacaDurum>('oda_bulmaca_ac'),
  })
}
export function useBulmacaBitir() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (p: string[]) => rpc<{ dogru: boolean; puan?: number; yanlis?: number }>('oda_bulmaca_bitir', { p }),
    onSuccess: (r) => {
      if (r.dogru) void qc.invalidateQueries({ queryKey: ['oyun'] })
    },
  })
}
