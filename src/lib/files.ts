// Ek dosyalar (Faz C · 0014). Yükleme: prepare_upload (izin/tür/boyut) → Storage'a yükle → confirm_upload.
// İndirme oturumla yapılır ve tarayıcıda geçici bir blob adresinden açılır; paylaşılabilir kalıcı bağlantı üretilmez.
import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase, SCHOOL_SLUG } from './supabase'
import { useSettings } from './data'

export type AttKind = 'message' | 'announcement' | 'homework' | 'submission'
export interface Attachment {
  id: string
  path: string
  kind: AttKind
  message_id: string | null
  announcement_id: string | null
  homework_id: string | null
  student_id: string | null
  is_cover: boolean
  file_name: string
  mime: string
  size: number
  uploaded_by: string | null
}
const COLS = 'id, path, kind, message_id, announcement_id, homework_id, student_id, is_cover, file_name, mime, size, uploaded_by'

export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']
export const fmtSize = (b: number) => (b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1048576).toFixed(1).replace('.', ',')} MB`)

/** Dosya ayarları (Yönetim Merkezi → Dosya ve duyuru ayarları); yüklenirken varsayılanlar. */
export function useFileRules() {
  const s = useSettings()
  const g = <T,>(k: string, d: T) => ((s.data?.[k] as T | undefined) ?? d)
  const images = g('dosya.gorsel', true)
  const pdf = g('dosya.pdf', true)
  const types = [...(images ? IMAGE_TYPES : []), ...(pdf ? ['application/pdf'] : [])]
  return {
    maxMb: g('dosya.max_mb', 10),
    types,
    accept: types.join(','),
    images,
    message: g('mesaj.dosya', true),
    announcement: g('duyuru.dosya', true),
    teacherHomework: g('odev.ogretmen_dosya', true),
    studentHomework: g('odev.ogrenci_dosya', false),
  }
}

/** Seçilen dosyaları kurallara göre süzer; uygun olmayanlar için açıklama döner. */
export function checkFiles(files: File[], rules: { maxMb: number; types: string[] }): { ok: File[]; errors: string[] } {
  const ok: File[] = []
  const errors: string[] = []
  for (const f of files) {
    if (!rules.types.includes(f.type)) errors.push(`${f.name}: bu tür yüklenemez (JPG, PNG, WEBP${rules.types.includes('application/pdf') ? ', PDF' : ''}).`)
    else if (f.size > rules.maxMb * 1048576) errors.push(`${f.name}: en fazla ${rules.maxMb} MB olabilir.`)
    else ok.push(f)
  }
  return { ok, errors }
}

/** Dosyaları sırayla yükler. İlk hatada durur ve hatayı döner. */
export async function uploadFiles(kind: AttKind, parent: string, files: File[], opts: { cover?: File | null; student?: string } = {}): Promise<string | null> {
  const all = [...(opts.cover ? [{ f: opts.cover, cover: true }] : []), ...files.map((f) => ({ f, cover: false }))]
  for (const { f, cover } of all) {
    const prep = await supabase.rpc('prepare_upload', { p_kind: kind, p_parent: parent, p_file_name: f.name, p_mime: f.type, p_size: f.size, p_cover: cover, p_student: opts.student ?? null })
    if (prep.error) return `${f.name}: ${prep.error.message}`
    const { path, id } = prep.data as { path: string; id: string }
    const up = await supabase.storage.from('ekler').upload(path, f, { contentType: f.type })
    if (up.error) return `${f.name}: yüklenemedi (${up.error.message}).`
    const conf = await supabase.rpc('confirm_upload', { p_id: id })
    if (conf.error) return `${f.name}: ${conf.error.message}`
  }
  return null
}

/** Eklerin listesi (RLS: yalnız görebildiklerin). */
export function useAttachments(f: { kind: AttKind; ids: string[] }) {
  const key = [...f.ids].sort().join(',')
  return useQuery({
    queryKey: ['attachments', f.kind, key],
    enabled: f.ids.length > 0,
    queryFn: async () => {
      const col = f.kind === 'message' ? 'message_id' : f.kind === 'announcement' ? 'announcement_id' : 'homework_id'
      const { data, error } = await supabase.from('attachments').select(COLS).in(col, f.ids).eq('kind', f.kind).eq('uploaded', true).order('created_at')
      if (error) throw error
      return (data ?? []) as Attachment[]
    },
  })
}

const cache = new Map<string, string>()
/** Dosyayı oturumla indirip geçici blob adresi verir (aynı dosya bir kez indirilir). */
export async function blobUrl(a: Pick<Attachment, 'path'>): Promise<string> {
  const hit = cache.get(a.path)
  if (hit) return hit
  const { data, error } = await supabase.storage.from('ekler').download(a.path)
  if (error || !data) throw new Error('Dosya açılamadı.')
  const url = URL.createObjectURL(data)
  cache.set(a.path, url)
  return url
}

export async function openFile(a: Attachment) {
  const url = await blobUrl(a)
  const link = document.createElement('a')
  link.href = url
  link.target = '_blank'
  link.rel = 'noopener'
  if (!a.mime.startsWith('image/') && a.mime !== 'application/pdf') link.download = a.file_name
  link.click()
}

/** Görsel önizleme için blob adresi. */
export function useBlobUrl(a: Pick<Attachment, 'path'> | null) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    if (a) blobUrl(a).then((u) => alive && setUrl(u), () => alive && setUrl(null))
    return () => {
      alive = false
    }
  }, [a?.path]) // eslint-disable-line react-hooks/exhaustive-deps
  return url
}

/** Okul adı ve logosu (giriş ekranında da; girişsiz). Logo herkese açık "okul" bucket'ından blob olarak alınır. */
export function useSchoolInfo() {
  return useQuery({
    queryKey: ['school-info'],
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data } = await supabase.rpc('public_school_info', { p_slug: SCHOOL_SLUG })
      const info = (data ?? {}) as { name?: string; logo?: string | null }
      let logo: string | null = null
      if (info.logo) {
        const { data: pub } = supabase.storage.from('okul').getPublicUrl(info.logo)
        const res = await fetch(pub.publicUrl).catch(() => null)
        if (res?.ok) logo = URL.createObjectURL(await res.blob())
      }
      return { name: info.name ?? 'Buluş Küre Koleji', logo }
    },
  })
}
