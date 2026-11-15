// Kullanım panosu ve KVKK dosyası (0078). Yetki veritabanında: pano ve dosya yalnız yönetici (iki adımlı doğrulamalı);
// başvuruyu herkes kendisi için, veli çocuğu için yapar ve yalnız kendi başvurusunu görür.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from './supabase'

export interface KullanimOzeti {
  roller: { rol: string; toplam: number; son7: number; son30: number; hic: number }[]
  pasif: { id: string; ad: string; rol: string; brans: string | null; son: string | null }[]
  moduller: { anahtar: string; son30: number; onceki30: number }[]
}
export function useKullanimOzeti() {
  return useQuery({
    queryKey: ['kullanim_ozeti'],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('kullanim_ozeti')
      if (error) throw new Error(error.message)
      return data as KullanimOzeti
    },
  })
}

export type KvkkTur = 'silme' | 'bilgi' | 'duzeltme'
export type KvkkDurum = 'yeni' | 'inceleniyor' | 'tamamlandi' | 'reddedildi'
export interface KvkkTalep {
  id: string
  student_id: string | null
  basvuran: string | null
  tur: KvkkTur
  aciklama: string | null
  durum: KvkkDurum
  yanit: string | null
  yanit_at: string | null
  created_at: string
  basvuran_p?: { full_name: string } | null
  ogrenci?: { full_name: string; class_name: string } | null
}
export const KVKK_TUR_TR: Record<KvkkTur, string> = {
  silme: 'Verilerin silinmesi',
  bilgi: 'Hangi verilerin işlendiğini öğrenme',
  duzeltme: 'Yanlış verinin düzeltilmesi',
}
export const KVKK_DURUM_TR: Record<KvkkDurum, string> = {
  yeni: 'Alındı',
  inceleniyor: 'İnceleniyor',
  tamamlandi: 'Sonuçlandı',
  reddedildi: 'Yanıtlandı (reddedildi)',
}
/** KVKK m.13: başvuru en geç 30 gün içinde sonuçlandırılır */
export const KVKK_SURE_GUN = 30

const ALANLAR =
  'id, student_id, basvuran, tur, aciklama, durum, yanit, yanit_at, created_at, basvuran_p:profiles!kvkk_talep_basvuran_fkey(full_name), ogrenci:students(full_name, class_name)'

/** Yönetici: okulun bütün başvuruları; diğerleri: yalnız kendi başvuruları (RLS) */
export function useKvkkTalepler(acik = true) {
  return useQuery({
    queryKey: ['kvkk_talep'],
    enabled: acik,
    queryFn: async () => {
      const { data, error } = await supabase.from('kvkk_talep').select(ALANLAR).order('created_at', { ascending: false }).limit(200)
      if (error) throw new Error(error.message)
      return (data ?? []) as unknown as KvkkTalep[]
    },
  })
}
export function useKvkkBasvur() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (p: { tur: KvkkTur; student_id: string | null; aciklama: string }) => {
      const { error } = await supabase.from('kvkk_talep').insert({ tur: p.tur, student_id: p.student_id, aciklama: p.aciklama.trim() || null })
      if (error) throw new Error(error.message)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['kvkk_talep'] }),
  })
}
export function useKvkkYanitla() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (p: { id: string; durum: Exclude<KvkkDurum, 'yeni'>; yanit: string }) => {
      const { error } = await supabase.rpc('kvkk_talep_yanitla', { p_id: p.id, p_durum: p.durum, p_yanit: p.yanit.trim() || null })
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['kvkk_talep'] })
      qc.invalidateQueries({ queryKey: ['kvkk_dosya'] })
    },
  })
}

export interface KvkkDosya {
  hesaplar: {
    ad: string
    tur: 'veli' | 'ogrenci'
    yakinlik: string | null
    aydinlatma: string | null
    aydinlatma_at: string | null
    riza: string | null
    riza_at: string | null
    son_giris: string | null
  }[]
  erisim: { ad: string; rol: string; brans: string | null; turler: string[]; sayi: number; son: string }[]
  talepler: {
    id: string
    tur: KvkkTur
    durum: KvkkDurum
    aciklama: string | null
    yanit: string | null
    created_at: string
    yanit_at: string | null
    basvuran: string | null
  }[]
}
export function useKvkkDosya(sid: string) {
  return useQuery({
    queryKey: ['kvkk_dosya', sid],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('kvkk_ogrenci_dosyasi', { p_student: sid })
      if (error) throw new Error(error.message)
      return data as KvkkDosya
    },
  })
}

/** Öğrenci sayfası görüntülemesini işlem kaydına yazar (sunucu kişi/öğrenci/gün başına bir kez yazar) */
export function ogrenciGoruntulendi(sid: string) {
  supabase.rpc('log_view', { p_entity: 'ogrenci', p_student: sid }).then(
    () => {},
    () => {},
  )
}

/** Başvurunun yasal süresinden kalan gün (sonuçlanmışsa null) */
export function kalanGun(t: { durum: KvkkDurum; created_at: string }, simdi = Date.now()) {
  if (t.durum === 'tamamlandi' || t.durum === 'reddedildi') return null
  return KVKK_SURE_GUN - Math.floor((simdi - new Date(t.created_at).getTime()) / 86_400_000)
}
