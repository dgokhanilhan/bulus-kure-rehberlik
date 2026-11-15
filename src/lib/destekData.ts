// Öğrenci desteği (0076): Yanlış defteri ("çalıştım" işaretleri) ve Çözemedim (fotoğraflı soru talebi).
// Yetki veritabanında: işareti yalnız öğrenci yazar; soruyu öğrenci ya da velisi gönderir, o öğrenciyi görebilen öğretmen yanıtlar.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from './supabase'

// ---------- Yanlış defteri ----------
export function useKonuCalisma(sid: string | undefined, acik = true) {
  return useQuery({
    queryKey: ['konu_calisma', sid],
    enabled: !!sid && acik,
    queryFn: async () => {
      const { data, error } = await supabase.from('konu_calisma').select('konu, calisti_at').eq('student_id', sid!)
      if (error) throw new Error(error.message)
      return new Map((data ?? []).map((x) => [x.konu as string, x.calisti_at as string]))
    },
  })
}
export function useKonuIsaretle(sid: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (p: { konu: string; calisti: boolean }) => {
      const { error } = p.calisti
        ? await supabase.from('konu_calisma').upsert({ student_id: sid!, konu: p.konu })
        : await supabase.from('konu_calisma').delete().match({ student_id: sid!, konu: p.konu })
      if (error) throw new Error(error.message)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['konu_calisma', sid] }),
  })
}

// ---------- Çözemedim ----------
export interface SoruTalep {
  id: string
  student_id: string
  ders: string
  aciklama: string | null
  foto: string
  durum: 'yeni' | 'goruldu' | 'cozuldu'
  yanit: string | null
  yanit_at: string | null
  created_by: string | null
  created_at: string
  yanitlayan_p: { full_name: string } | null
}
const ALANLAR =
  'id, student_id, ders, aciklama, foto, durum, yanit, yanit_at, created_by, created_at, yanitlayan_p:profiles!soru_talep_yanitlayan_fkey(full_name)'

/** Bir öğrencinin soruları (öğrenci/veli) ya da görebildiğim bütün öğrencilerin açık soruları (öğretmen: sid boş) */
export function useSoruTalepler(sid?: string, acik = true) {
  return useQuery({
    queryKey: ['soru_talep', sid ?? 'hepsi'],
    enabled: acik,
    queryFn: async () => {
      let q = supabase.from('soru_talep').select(ALANLAR).order('created_at', { ascending: false }).limit(60)
      if (sid) q = q.eq('student_id', sid)
      const { data, error } = await q
      if (error) throw new Error(error.message)
      return (data ?? []) as unknown as SoruTalep[]
    },
  })
}

/** Fotoğrafı en çok 1600 px'e küçültüp JPEG'e çevirir (telefon fotoğrafları büyük olur); olmazsa dosyayı olduğu gibi döndürür */
export async function fotoKucult(f: File): Promise<{ blob: Blob; uzanti: 'jpg' | 'png' | 'webp' }> {
  const asil = { blob: f as Blob, uzanti: (f.type === 'image/png' ? 'png' : f.type === 'image/webp' ? 'webp' : 'jpg') as 'jpg' | 'png' | 'webp' }
  try {
    const bmp = await createImageBitmap(f)
    const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height))
    const c = document.createElement('canvas')
    c.width = Math.max(1, Math.round(bmp.width * k))
    c.height = Math.max(1, Math.round(bmp.height * k))
    c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height)
    bmp.close()
    const blob = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/jpeg', 0.85))
    return blob && blob.type === 'image/jpeg' ? { blob, uzanti: 'jpg' } : asil
  } catch {
    return asil
  }
}

export function useSoruGonder(schoolId: string | undefined, sid: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (p: { dosya: File; ders: string; aciklama: string }) => {
      if (!schoolId || !sid) throw new Error('Öğrenci bulunamadı.')
      if (!/^image\/(jpeg|png|webp)$/.test(p.dosya.type)) throw new Error('Yalnız fotoğraf (JPEG, PNG, WebP) gönderebilirsin.')
      const { blob, uzanti } = await fotoKucult(p.dosya)
      if (blob.size > 6 * 1024 * 1024) throw new Error('Fotoğraf çok büyük (en çok 6 MB).')
      const yol = `${schoolId}/${sid}/${crypto.randomUUID()}.${uzanti}`
      const up = await supabase.storage.from('soru').upload(yol, blob, { contentType: uzanti === 'jpg' ? 'image/jpeg' : `image/${uzanti}`, upsert: false })
      if (up.error) throw new Error('Fotoğraf yüklenemedi. Yeniden dene.')
      const { error } = await supabase.from('soru_talep').insert({ student_id: sid, ders: p.ders, aciklama: p.aciklama.trim() || null, foto: yol })
      if (error) {
        await supabase.storage.from('soru').remove([yol]) // kayıt oluşmadıysa dosya kalmasın
        throw new Error(error.message)
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['soru_talep'] }),
  })
}
export function useSoruSil() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (t: Pick<SoruTalep, 'id' | 'foto'>) => {
      await supabase.storage.from('soru').remove([t.foto])
      const { error } = await supabase.from('soru_talep').delete().eq('id', t.id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['soru_talep'] }),
  })
}
export function useSoruYanitla() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (p: { id: string; durum: 'goruldu' | 'cozuldu'; yanit?: string }) => {
      const { error } = await supabase.rpc('soru_talep_yanitla', { p_id: p.id, p_durum: p.durum, p_yanit: p.yanit ?? null })
      if (error) throw new Error(error.message)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['soru_talep'] }),
  })
}
/** Fotoğraf için kısa ömürlü bağlantı (depo özel) */
export function useSoruFoto(yol: string | null) {
  return useQuery({
    queryKey: ['soru_foto', yol],
    enabled: !!yol,
    staleTime: 8 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.storage.from('soru').createSignedUrl(yol!, 600)
      if (error) throw new Error(error.message)
      return data.signedUrl
    },
  })
}
