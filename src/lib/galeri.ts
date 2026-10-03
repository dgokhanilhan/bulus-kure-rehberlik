// Galeri (0022): veri kancaları, imzalı bağlantılar ve yükleme hattı.
// Yükleme: içerik doğrulama (uzantı + dosya imzası) → önizleme üretimi (tarayıcıda) → hazırla → yükle → onayla.
// Hata olan dosyanın yarım kaydı ve dosyaları silinir; diğer dosyalar devam eder. Yetki ve sınırlar veritabanında yeniden denetlenir.
import { useQuery } from '@tanstack/react-query'
import { supabase } from './supabase'

export type AlbumStatus = 'taslak' | 'onay_bekliyor' | 'yayinda' | 'arsiv'
export type Audience = 'okul' | 'kademe' | 'sinif' | 'ogrenci' | 'ogretmen'
export interface Album {
  id: string
  school_id: string
  academic_year_id: string | null
  category_id: string | null
  title: string
  description: string | null
  event_date: string | null
  status: AlbumStatus
  audience: Audience
  level: string | null
  class_ids: string[]
  student_ids: string[]
  allow_download: boolean
  cover_media_id: string | null
  created_by: string | null
  published_at: string | null
  created_at: string
  media_count?: number
}
export interface Media {
  id: string
  album_id: string
  kind: 'foto' | 'video'
  mime: string
  size_bytes: number | null
  path: string
  view_path: string | null
  thumb_path: string | null
  width: number | null
  height: number | null
  duration_sec: number | null
  title: string | null
  description: string | null
  sort_order: number
  approved: boolean
  uploaded_by: string | null
  created_at: string
}
export interface Category {
  id: string
  name: string
  sort_order: number
  active: boolean
}
export const STATUS_TR: Record<AlbumStatus, string> = { taslak: 'Taslak', onay_bekliyor: 'Onay bekliyor', yayinda: 'Yayında', arsiv: 'Arşivde' }
export const AUDIENCE_TR: Record<Audience, string> = { okul: 'Tüm okul', kademe: 'Kademe', sinif: 'Sınıf', ogrenci: 'Belirli öğrenciler', ogretmen: 'Yalnız öğretmenler' }
export const PAGE = 60

export function useCategories() {
  return useQuery({
    queryKey: ['gallery_categories'],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from('gallery_categories').select('id, name, sort_order, active').order('sort_order').order('name')
      if (error) throw error
      return data as Category[]
    },
  })
}

export function useAlbums(archived: boolean) {
  return useQuery({
    queryKey: ['gallery_albums', archived],
    queryFn: async () => {
      let q = supabase.from('gallery_albums').select('*, gallery_media!gallery_media_album_id_fkey(count)').order('event_date', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false })
      q = archived ? q.eq('status', 'arsiv') : q.neq('status', 'arsiv')
      const { data, error } = await q
      if (error) throw error
      return (data as (Album & { gallery_media: { count: number }[] })[]).map(({ gallery_media, ...a }) => ({ ...a, media_count: gallery_media?.[0]?.count ?? 0 }))
    },
  })
}

export function useAlbum(id: string | null) {
  return useQuery({
    queryKey: ['gallery_album', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from('gallery_albums').select('*').eq('id', id!).maybeSingle()
      if (error) throw error
      return data as Album | null
    },
  })
}

/** Albümün medyası, sayfa sayfa (PAGE adet). Yalnız yüklenmesi tamamlananlar. */
export function useMedia(album: string | null, pages: number) {
  return useQuery({
    queryKey: ['gallery_media', album, pages],
    enabled: !!album,
    placeholderData: (prev) => prev,
    queryFn: async () => {
      const { data, error, count } = await supabase
        .from('gallery_media')
        .select('*', { count: 'exact' })
        .eq('album_id', album!)
        .eq('uploaded', true)
        .order('sort_order')
        .order('created_at')
        .range(0, pages * PAGE - 1)
      if (error) throw error
      return { items: data as Media[], total: count ?? 0 }
    },
  })
}

/** Son eklenenler: yayındaki albümlerden onaylı medya. */
export function useRecent() {
  return useQuery({
    queryKey: ['gallery_recent'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('gallery_media')
        .select('*, gallery_albums!gallery_media_album_id_fkey!inner(status, title)')
        .eq('uploaded', true)
        .eq('approved', true)
        .eq('gallery_albums.status', 'yayinda')
        .order('created_at', { ascending: false })
        .limit(12)
      if (error) throw error
      return data as (Media & { gallery_albums: { title: string } })[]
    },
  })
}

/** Kısa süreli imzalı bağlantılar (1 saat). Kalıcı/herkese açık bağlantı yok. */
export function useSigned(paths: (string | null | undefined)[]) {
  const list = [...new Set(paths.filter(Boolean) as string[])].sort()
  return useQuery({
    queryKey: ['gallery_signed', list.join('|')],
    enabled: list.length > 0,
    staleTime: 45 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.storage.from('galeri').createSignedUrls(list, 3600)
      if (error) throw error
      return Object.fromEntries((data ?? []).filter((x) => x.signedUrl).map((x) => [x.path!, x.signedUrl])) as Record<string, string>
    },
  })
}

export async function signedDownload(path: string, name: string) {
  const { data, error } = await supabase.storage.from('galeri').createSignedUrl(path, 300, { download: name })
  if (error) throw error
  return data.signedUrl
}

// ---------------------------------------------------------------- Yükleme
const TYPES: Record<string, { mime: string; kind: 'foto' | 'video' }> = {
  jpg: { mime: 'image/jpeg', kind: 'foto' },
  jpeg: { mime: 'image/jpeg', kind: 'foto' },
  png: { mime: 'image/png', kind: 'foto' },
  webp: { mime: 'image/webp', kind: 'foto' },
  mp4: { mime: 'video/mp4', kind: 'video' },
  mov: { mime: 'video/quicktime', kind: 'video' },
  webm: { mime: 'video/webm', kind: 'video' },
}
export const ACCEPT = '.jpg,.jpeg,.png,.webp,.mp4,.mov,.webm,image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm'

/** Dosyanın ilk baytları uzantısıyla uyuşuyor mu (sahte uzantı kabul edilmez). */
export async function sniff(file: File): Promise<{ mime: string; kind: 'foto' | 'video' } | string> {
  const ext = (file.name.split('.').pop() ?? '').toLowerCase()
  const t = TYPES[ext]
  if (!t) return 'Yalnız JPG, PNG, WEBP fotoğraf ve MP4, MOV, WEBM video yüklenebilir.'
  const b = new Uint8Array(await file.slice(0, 16).arrayBuffer())
  const asc = (i: number, n: number) => String.fromCharCode(...b.slice(i, i + n))
  const ok =
    (t.mime === 'image/jpeg' && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) ||
    (t.mime === 'image/png' && b[0] === 0x89 && asc(1, 3) === 'PNG') ||
    (t.mime === 'image/webp' && asc(0, 4) === 'RIFF' && asc(8, 4) === 'WEBP') ||
    ((t.mime === 'video/mp4' || t.mime === 'video/quicktime') && asc(4, 4) === 'ftyp') ||
    (t.mime === 'video/webm' && b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3)
  return ok ? t : 'Dosya içeriği uzantısıyla uyuşmuyor.'
}

const toWebp = (c: HTMLCanvasElement, q: number) => new Promise<Blob | null>((r) => c.toBlob(r, 'image/webp', q))
function scaled(w: number, h: number, max: number) {
  const k = Math.min(1, max / Math.max(w, h))
  return [Math.max(1, Math.round(w * k)), Math.max(1, Math.round(h * k))] as const
}
async function drawTo(src: CanvasImageSource, w: number, h: number, max: number, q: number) {
  const [cw, ch] = scaled(w, h, max)
  const c = document.createElement('canvas')
  c.width = cw
  c.height = ch
  c.getContext('2d')!.drawImage(src, 0, 0, cw, ch)
  const blob = await toWebp(c, q)
  return blob && blob.type === 'image/webp' ? blob : null
}

/** Önizlemeler: fotoğrafta küçük (480) + görüntüleme (1600, büyükse); videoda kapak karesi. Üretilemezse boş (dosya yine yüklenir). */
export async function previews(file: File, kind: 'foto' | 'video') {
  try {
    if (kind === 'foto') {
      const bmp = await createImageBitmap(file)
      const thumb = await drawTo(bmp, bmp.width, bmp.height, 480, 0.8)
      const view = Math.max(bmp.width, bmp.height) > 1600 || file.size > 1.5 * 1048576 ? await drawTo(bmp, bmp.width, bmp.height, 1600, 0.85) : null
      const r = { thumb, view, width: bmp.width, height: bmp.height, duration: null as number | null }
      bmp.close()
      return r
    }
    const url = URL.createObjectURL(file)
    try {
      const v = document.createElement('video')
      v.muted = true
      v.preload = 'metadata'
      v.src = url
      await new Promise<void>((ok, bad) => {
        v.onloadeddata = () => ok()
        v.onerror = () => bad(new Error('video'))
        setTimeout(() => bad(new Error('zaman aşımı')), 8000)
      })
      await new Promise<void>((ok) => {
        v.onseeked = () => ok()
        v.currentTime = Math.min(1, (v.duration || 2) / 2)
        setTimeout(ok, 3000)
      })
      const thumb = v.videoWidth ? await drawTo(v, v.videoWidth, v.videoHeight, 480, 0.8) : null
      return { thumb, view: null, width: v.videoWidth || null, height: v.videoHeight || null, duration: Number.isFinite(v.duration) ? Math.round(v.duration) : null }
    } finally {
      URL.revokeObjectURL(url)
    }
  } catch {
    return { thumb: null, view: null, width: null, height: null, duration: null }
  }
}

export interface UploadResult {
  name: string
  ok: boolean
  error?: string
}

async function uploadOne(album: string, file: File): Promise<UploadResult> {
  const t = await sniff(file)
  if (typeof t === 'string') return { name: file.name, ok: false, error: t }
  const p = await previews(file, t.kind)
  const { data, error } = await supabase.rpc('gallery_prepare_upload', { p_album: album, p_name: file.name, p_mime: t.mime, p_size: file.size, p_view: !!p.view, p_thumb: !!p.thumb })
  if (error) return { name: file.name, ok: false, error: error.message }
  const d = data as { id: string; path: string; view_path: string | null; thumb_path: string | null }
  const done: string[] = []
  const put = async (path: string, body: Blob, type: string) => {
    const r = await supabase.storage.from('galeri').upload(path, body, { contentType: type, upsert: false })
    if (r.error) throw new Error(r.error.message)
    done.push(path)
  }
  try {
    await put(d.path, file, t.mime)
    if (d.view_path && p.view) await put(d.view_path, p.view, 'image/webp')
    if (d.thumb_path && p.thumb) await put(d.thumb_path, p.thumb, 'image/webp')
    const c = await supabase.rpc('gallery_confirm_upload', { p_id: d.id, p_width: p.width, p_height: p.height, p_duration: p.duration })
    if (c.error) throw new Error(c.error.message)
    return { name: file.name, ok: true }
  } catch (e) {
    // Yarım kalanı temizle: dosyalar ve kayıt (yetim bırakma)
    if (done.length) await supabase.storage.from('galeri').remove(done)
    await supabase.from('gallery_media').delete().eq('id', d.id)
    return { name: file.name, ok: false, error: /mime|type/i.test((e as Error).message) ? 'Dosya türü kabul edilmedi.' : (e as Error).message }
  }
}

/** Çoklu yükleme: aynı anda 3 dosya; biri başarısız olsa da diğerleri devam eder. */
export async function uploadMany(album: string, files: File[], onProgress: (done: number, total: number) => void): Promise<UploadResult[]> {
  const out: UploadResult[] = new Array(files.length)
  let next = 0
  let n = 0
  onProgress(0, files.length)
  const worker = async () => {
    while (next < files.length) {
      const i = next++
      out[i] = await uploadOne(album, files[i]!)
      onProgress(++n, files.length)
    }
  }
  await Promise.all([worker(), worker(), worker()])
  return out
}

/** Albümü kalıcı sil: önce bütün dosyalar (orijinal, görüntüleme, küçük), sonra kayıt. Dosya silinemezse kayıt silinmez. */
export async function deleteAlbum(album: string) {
  const { data, error } = await supabase.from('gallery_media').select('path, view_path, thumb_path').eq('album_id', album)
  if (error) throw error
  const paths = (data ?? []).flatMap((m) => [m.path, m.view_path, m.thumb_path]).filter(Boolean) as string[]
  for (let i = 0; i < paths.length; i += 100) {
    const r = await supabase.storage.from('galeri').remove(paths.slice(i, i + 100))
    if (r.error) throw new Error(`Dosyalar silinemedi: ${r.error.message}`)
  }
  const d = await supabase.from('gallery_albums').delete().eq('id', album)
  if (d.error) throw d.error
}

export async function deleteMedia(m: Pick<Media, 'id' | 'path' | 'view_path' | 'thumb_path'>) {
  const paths = [m.path, m.view_path, m.thumb_path].filter(Boolean) as string[]
  const r = await supabase.storage.from('galeri').remove(paths)
  if (r.error) throw new Error(`Dosya silinemedi: ${r.error.message}`)
  const d = await supabase.from('gallery_media').delete().eq('id', m.id)
  if (d.error) throw d.error
}
