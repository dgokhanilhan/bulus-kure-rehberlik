// Günlük kontrol kayıtlarını okuma (0067); saf hesaplar gunlukKontrol.ts'te (birim testi tarayıcısız çalışsın diye ayrı)
import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from './supabase'
import { useAyar } from './ayarlar'
import { VARSAYILAN_MADDELER, type Kayit, type MaddeTanim } from './gunlukKontrol'

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

/** Okulun günlük kontrol maddeleri (0071) ve veli uyarı aralığı. Liste yüklenene kadar varsayılan maddeler. */
export function useGunlukMaddeler() {
  const ayar = useAyar()
  const q = useQuery({
    queryKey: ['gunluk-kontrol', 'maddeler'],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from('gunluk_kontrol_madde').select('kod, ad, cumle, sira, aktif').order('sira').order('ad')
      if (error) throw new Error(error.message)
      return (data ?? []) as MaddeTanim[]
    },
  })
  const liste = q.data?.length ? q.data : VARSAYILAN_MADDELER
  const aralik = Math.max(0, Math.min(10, ayar.num('gunluk_kontrol.uyari_araligi')))
  return useMemo(() => {
    const m = new Map(liste.map((x) => [x.kod, x]))
    return {
      yukleniyor: q.isLoading,
      /** Bütün maddeler (kapalılar dahil; geçmiş kayıtlar adıyla görünsün) */
      liste,
      /** İşaretlemede gösterilenler */
      aktif: liste.filter((x) => x.aktif),
      ad: (k: string) => m.get(k)?.ad ?? k,
      cumle: (k: string) => m.get(k)?.cumle ?? m.get(k)?.ad ?? k,
      aralik,
    }
  }, [liste, aralik, q.isLoading])
}
