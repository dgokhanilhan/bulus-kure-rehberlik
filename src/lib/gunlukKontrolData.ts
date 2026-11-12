// Günlük kontrol kayıtlarını okuma (0067); saf hesaplar gunlukKontrol.ts'te (birim testi tarayıcısız çalışsın diye ayrı)
import { useQuery } from '@tanstack/react-query'
import { supabase } from './supabase'
import type { Kayit } from './gunlukKontrol'

const ALANLAR = 'id, student_id, teacher_id, tarih, madde, detay, sira, veli_uyarildi, created_at'

async function hepsi(q: PromiseLike<{ data: unknown; error: { message: string } | null }>) {
  const { data, error } = await q
  if (error) throw new Error(error.message)
  return (data ?? []) as Kayit[]
}

/** Öğrencilerin verilen aralıktaki kayıtları (RLS: yalnız görülebilen öğrenciler) */
export function useGunlukKontrol(ids: string[] | null, from: string, to: string) {
  return useQuery({
    queryKey: ['gunluk-kontrol', ids ? ids.join(',') : 'hepsi', from, to],
    enabled: ids === null || ids.length > 0,
    queryFn: async () => {
      const out: Kayit[] = []
      // Uzun sınıf listesinde URL sınırı aşılmasın diye parça parça
      const parcalar = ids === null ? [null] : Array.from({ length: Math.ceil(ids.length / 150) }, (_, i) => ids.slice(i * 150, i * 150 + 150))
      for (const p of parcalar) {
        let q = supabase.from('gunluk_kontrol').select(ALANLAR).gte('tarih', from).lte('tarih', to).order('tarih', { ascending: false }).limit(5000)
        if (p) q = q.in('student_id', p)
        out.push(...(await hepsi(q)))
      }
      return out
    },
  })
}
