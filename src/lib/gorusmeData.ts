// Görüşme kararları ve veli haftalık özeti (0077). Yetki veritabanında: kararları yalnız rehberlik servisi ve yönetim
// görür/yazar; özeti onlar onaylayıp gönderir, veli okur (açınca "okundu" yazılır).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from './supabase'
import type { Karar, KararDurum, OzetIcerik } from './haftalik'

// ---------- Görüşme kararları ----------
export function useKararlar(sid: string | undefined, acik = true) {
  return useQuery({
    queryKey: ['gorusme_karar', sid],
    enabled: !!sid && acik,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('gorusme_karar')
        .select('id, student_id, meeting_id, metin, durum, task_id, kontrol_at, created_at')
        .eq('student_id', sid!)
        .order('created_at', { ascending: false })
        .limit(100)
      if (error) throw new Error(error.message)
      return (data ?? []) as Karar[]
    },
  })
}
export function useKararEkle(sid: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (p: { metin: string; meeting_id: string | null }) => {
      const { error } = await supabase.from('gorusme_karar').insert({ student_id: sid!, metin: p.metin.trim(), meeting_id: p.meeting_id })
      if (error) throw new Error(error.message)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['gorusme_karar', sid] }),
  })
}
export function useKararGuncelle(sid: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (p: { id: string; durum?: KararDurum; task_id?: string | null }) => {
      const row: Record<string, unknown> = {}
      if (p.durum) row.durum = p.durum
      if (p.task_id !== undefined) row.task_id = p.task_id
      const { error } = await supabase.from('gorusme_karar').update(row).eq('id', p.id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['gorusme_karar', sid] }),
  })
}
export function useKararSil(sid: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('gorusme_karar').delete().eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['gorusme_karar', sid] }),
  })
}

// ---------- Veli haftalık özeti ----------
export interface VeliOzet {
  id: string
  student_id: string
  hafta: string
  icerik: OzetIcerik
  notu: string | null
  gonderen: string | null
  gonderildi_at: string
  okundu_at: string | null
}
const OZET_ALANLAR = 'id, student_id, hafta, icerik, notu, gonderen, gonderildi_at, okundu_at'

export function useVeliOzetler(sid: string | undefined, acik = true, limit = 8) {
  return useQuery({
    queryKey: ['veli_ozet', sid],
    enabled: !!sid && acik,
    queryFn: async () => {
      const { data, error } = await supabase.from('veli_ozet').select(OZET_ALANLAR).eq('student_id', sid!).order('hafta', { ascending: false }).limit(limit)
      if (error) throw new Error(error.message)
      return (data ?? []) as VeliOzet[]
    },
  })
}
export function useVeliOzetGonder(sid: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (p: { icerik: OzetIcerik; not: string }) => {
      const { error } = await supabase.rpc('veli_ozet_gonder', { p_student: sid!, p_icerik: p.icerik, p_not: p.not.trim() || null })
      if (error) throw new Error(error.message)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['veli_ozet', sid] }),
  })
}
export async function veliOzetOkundu(id: string) {
  await supabase.rpc('veli_ozet_okundu', { p_id: id })
}
