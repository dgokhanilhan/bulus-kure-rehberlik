// Cumartesi etütleri (0051): sorgular ve yazma çağrıları. Okuma RLS'ten geçer: rehber/yönetici her şeyi, öğretmen yayındaki
// programı ve kendi taleplerini, veli/öğrenci yalnız yayındaki kendi etüdünü görür. Yazma yalnız etut_* fonksiyonlarıyla.
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from './supabase'
import { pages } from './sayfali'
import type { Hucre, Kademe, Saat } from './etut'

export interface EtutGun {
  id: string
  tarih: string
  kademe: Kademe
  saatler: Saat[]
  durum: 'taslak' | 'yayinda'
  yayin_at: string | null
}
export interface EtutOgrenciSatir {
  student_id: string
  student_name: string
  class_name: string | null
  yoklama: 'geldi' | 'gelmedi' | null
}
export interface EtutHucreRow {
  id: string
  ders: number
  teacher_id: string | null
  teacher_name: string
  tur: 'etut' | 'mesgul'
  konu: string | null
  salon: string | null
  aciklama: string | null
  talep_id: string | null
  etut_ogrenciler: EtutOgrenciSatir[]
}
export interface EtutTalep {
  id: string
  teacher_id: string | null
  teacher_name: string
  konu: string
  aciklama: string | null
  ogrenciler: string[]
  istenen_tarih: string | null
  istenen_ders: number | null
  durum: 'bekliyor' | 'planlandi' | 'reddedildi' | 'iptal'
  karar_notu: string | null
  plan_tarih: string | null
  plan_ders: number | null
  created_at: string
}
/** Veli/öğrenci ve öğretmen için tek etüt satırı (gün + hücre + öğrenci). */
export interface EtutKayit {
  id: string
  ders: number
  student_id: string
  yoklama: 'geldi' | 'gelmedi' | null
  etut_hucreler: { teacher_name: string; konu: string | null; salon: string | null } | null
  etut_gunler: { tarih: string; saatler: Saat[]; kademe: Kademe } | null
}

const ok = <T>(r: { data: unknown; error: { message: string } | null }) => {
  if (r.error) throw new Error(r.error.message)
  return (r.data ?? []) as T
}

export function useEtutGunler(enabled = true) {
  return useQuery({
    queryKey: ['etut', 'gunler'],
    enabled,
    queryFn: async () => ok<EtutGun[]>(await supabase.from('etut_gunler').select('id, tarih, kademe, saatler, durum, yayin_at').order('tarih', { ascending: false }).limit(120)),
  })
}
export function useEtutHucreler(gunId: string | null | undefined) {
  return useQuery({
    queryKey: ['etut', 'hucreler', gunId ?? ''],
    enabled: !!gunId,
    queryFn: async () =>
      ok<EtutHucreRow[]>(
        await supabase
          .from('etut_hucreler')
          .select('id, ders, teacher_id, teacher_name, tur, konu, salon, aciklama, talep_id, etut_ogrenciler(student_id, student_name, class_name, yoklama)')
          .eq('gun_id', gunId!)
          .order('teacher_name')
          .order('ders'),
      ),
  })
}
export function useEtutTalepler(enabled = true) {
  return useQuery({
    queryKey: ['etut', 'talepler'],
    enabled,
    queryFn: async () => ok<EtutTalep[]>(await supabase.from('etut_talepler').select('*').order('created_at', { ascending: false }).limit(300)),
  })
}
/** Öğrencinin (veli: çocuğunun) yayınlanmış etütleri. */
export function useEtutOgrenci(studentId: string | null | undefined, enabled = true) {
  return useQuery({
    queryKey: ['etut', 'ogrenci', studentId ?? ''],
    enabled: enabled && !!studentId,
    queryFn: async () =>
      ok<EtutKayit[]>(
        await supabase
          .from('etut_ogrenciler')
          .select('id, ders, student_id, yoklama, etut_hucreler(teacher_name, konu, salon), etut_gunler(tarih, saatler, kademe)')
          .eq('student_id', studentId!),
      ).sort((a, b) => (a.etut_gunler?.tarih ?? '').localeCompare(b.etut_gunler?.tarih ?? '') || a.ders - b.ders),
  })
}
/** Öğretmenin yayınlanmış kendi etütleri (yoklama için). */
export function useEtutBenim(teacherId: string | null | undefined) {
  return useQuery({
    queryKey: ['etut', 'benim', teacherId ?? ''],
    enabled: !!teacherId,
    queryFn: async () =>
      ok<(EtutHucreRow & { etut_gunler: EtutGun | null })[]>(
        await supabase
          .from('etut_hucreler')
          .select(
            'id, ders, teacher_id, teacher_name, tur, konu, salon, aciklama, talep_id, etut_ogrenciler(student_id, student_name, class_name, yoklama), etut_gunler(id, tarih, kademe, saatler, durum, yayin_at)',
          )
          .eq('teacher_id', teacherId!)
          .eq('tur', 'etut'),
      ).filter((h) => h.etut_gunler?.durum === 'yayinda'),
  })
}

/** Ders programından: kademe → o kademede derse giren öğretmenler (hem ortaokul hem lisede dersi olan ikisinde de) */
export function useKademeOgretmenleri() {
  return useQuery({
    queryKey: ['etut', 'kademe-ogretmen'],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const [t, c] = await Promise.all([
        pages<{ teacher_id: string | null; class_id: string }>((a, b) => supabase.from('timetable').select('teacher_id, class_id').not('teacher_id', 'is', null).order('id').range(a, b)),
        supabase.from('classes').select('id, level'),
      ])
      if (c.error) throw new Error(c.error.message)
      const level = new Map((c.data ?? []).map((x) => [x.id as string, x.level as string]))
      const out: Record<Kademe, Set<string>> = { ortaokul: new Set(), lise: new Set() }
      for (const r of t) {
        const lv = level.get(r.class_id)
        if (r.teacher_id && (lv === 'ortaokul' || lv === 'lise')) out[lv].add(r.teacher_id)
      }
      return out
    },
  })
}

export function useEtutRefresh() {
  const qc = useQueryClient()
  return () => qc.invalidateQueries({ queryKey: ['etut'] })
}

export async function etutKaydet(gunId: string | null, data: { tarih: string; kademe: Kademe; saatler: Saat[]; hucreler: Hucre[] }) {
  const { data: id, error } = await supabase.rpc('etut_kaydet', { p_gun: gunId, p_data: data })
  if (error) throw new Error(error.message)
  return id as string
}
export async function etutRpc(fn: 'etut_yayinla' | 'etut_sil', gunId: string) {
  const { error } = await supabase.rpc(fn, { p_gun: gunId })
  if (error) throw new Error(error.message)
}
export async function etutYoklama(hucreId: string, studentId: string, durum: 'geldi' | 'gelmedi' | null) {
  const { error } = await supabase.rpc('etut_yoklama', { p_hucre: hucreId, p_ogrenci: studentId, p_durum: durum })
  if (error) throw new Error(error.message)
}
export async function etutTalepEkle(p: { konu: string; aciklama: string; ogrenciler: string[]; istenen_tarih: string | null; istenen_ders: number | null }) {
  const { error } = await supabase.rpc('etut_talep_ekle', { p })
  if (error) throw new Error(error.message)
}
export async function etutTalepIptal(id: string) {
  const { error } = await supabase.rpc('etut_talep_iptal', { p_id: id })
  if (error) throw new Error(error.message)
}
export async function etutTalepReddet(id: string, not: string) {
  const { error } = await supabase.rpc('etut_talep_reddet', { p_id: id, p_not: not })
  if (error) throw new Error(error.message)
}
