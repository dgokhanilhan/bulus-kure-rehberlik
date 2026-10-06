// Galeri (0022): okulun özel fotoğraf/video albümleri. Kim neyi görür veritabanında (RLS + Storage); bu ekran yalnız arayüzdür.
// Dosyalar kısa süreli imzalı bağlantıyla açılır; herkese açık kalıcı bağlantı yok. Izgarada küçük önizleme tercih edilir; yoksa görüntüleme dosyası veya orijinal kullanılır.
import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/auth/AuthProvider'
import { useAcademicYears, useClasses, useSettings, useStudents } from '@/lib/data'
import { LEVEL_TR, LEVELS, type Level } from '@/lib/roles'
import { fold, trD } from '@/lib/format'
import {
  ACCEPT, AUDIENCE_TR, STATUS_TR, deleteAlbum, deleteMedia, signedDownload, uploadMany, useAlbum, useAlbums, useCategories, useMedia, useRecent, useSigned,
  type Album, type Audience, type Media, type UploadResult,
} from '@/lib/galeri'
import { Modal } from '@/components/Modal'
import { Icon } from '@/components/Icon'
import { useToast } from '@/components/Toast'

const errText = (e: { message?: string } | null) => (e ? (/row-level security/i.test(e.message ?? '') ? 'Bu işlem için yetkin yok.' : (e.message ?? 'İşlem yapılamadı.')) : null)

function useInvalidate() {
  const qc = useQueryClient()
  return () => ['gallery_albums', 'gallery_album', 'gallery_media', 'gallery_recent'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }))
}
/** Albüm açabilir mi (veritabanı da denetler): yönetici; ya da ayar açıksa öğretmen. */
function useCanCreate() {
  const { role, profile } = useAuth()
  const s = useSettings()
  return role === 'admin' || (!!profile && profile.role === 'ogretmen' && s.data?.['galeri.ogretmen_album'] === true)
}

export default function GaleriPage() {
  const [sp] = useSearchParams()
  const album = sp.get('album')
  return album ? <AlbumView id={album} /> : <GaleriHome />
}

// ---------------------------------------------------------------- Ana ekran
function GaleriHome() {
  const { role, profile, switchable } = useAuth()
  // İki rollü hesap veli modundayken yalnız öğretmenlere yönelik albümler listelenmez (yetki rollerin toplamı; ekran seçili role göre)
  const veliModu = switchable.length > 0 && profile?.role === 'veli'
  const [, setSp] = useSearchParams()
  const [arsiv, setArsiv] = useState(false)
  const albums = useAlbums(arsiv)
  const recent = useRecent()
  const cats = useCategories()
  const years = useAcademicYears()
  const classes = useClasses()
  const canCreate = useCanCreate()
  const [q, setQ] = useState('')
  const [year, setYear] = useState('')
  const [cat, setCat] = useState('')
  const [cls, setCls] = useState('')
  const [create, setCreate] = useState(false)
  const needle = fold(q)
  const level = classes.data?.find((c) => c.id === cls)?.level
  const list = (albums.data ?? []).filter(
    (a) =>
      !(veliModu && a.audience === 'ogretmen') &&
      (!needle || fold(`${a.title} ${a.description ?? ''}`).includes(needle)) &&
      (!year || a.academic_year_id === year) &&
      (!cat || a.category_id === cat) &&
      (!cls || a.audience === 'okul' || (a.audience === 'sinif' && a.class_ids.includes(cls)) || (a.audience === 'kademe' && a.level === level)),
  )
  const covers = useCoverThumbs(list)
  const signed = useSigned([...(recent.data ?? []).flatMap(previewPaths), ...Object.values(covers).flatMap(previewPaths)])
  const open = (id: string) => setSp({ album: id })

  return (
    <>
      <div className="head a">
        <div className="stack" style={{ gap: 4 }}>
          <h1 className="hd">Galeri</h1>
          <span className="m">Okulumuzun gezi, etkinlik ve çalışmalarından fotoğraf ve videolar. Yalnız okulumuzun yetkili kullanıcıları görür.</span>
        </div>
        {canCreate && (
          <button className="btn pri" onClick={() => setCreate(true)}>
            <Icon name="plus" size={18} stroke={2} /> Albüm oluştur
          </button>
        )}
      </div>
      <div className="btns a" style={{ alignItems: 'flex-end' }}>
        <label className="field" style={{ minWidth: 200, flex: 1 }}>
          <input aria-label="Albüm ara" placeholder="Albüm ara" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <label className="field" style={{ minWidth: 150 }}>
          <select aria-label="Eğitim yılı" value={year} onChange={(e) => setYear(e.target.value)}>
            <option value="">Bütün yıllar</option>
            {(years.data ?? []).map((y) => (
              <option key={y.id} value={y.id}>
                {y.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field" style={{ minWidth: 150 }}>
          <select aria-label="Kategori" value={cat} onChange={(e) => setCat(e.target.value)}>
            <option value="">Bütün kategoriler</option>
            {(cats.data ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field" style={{ minWidth: 120 }}>
          <select aria-label="Sınıf" value={cls} onChange={(e) => setCls(e.target.value)}>
            <option value="">Bütün sınıflar</option>
            {(classes.data ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        {role === 'admin' && (
          <button type="button" className={`btn ${arsiv ? 'pri' : ''}`} aria-pressed={arsiv} onClick={() => setArsiv((x) => !x)}>
            Arşiv
          </button>
        )}
      </div>

      {!arsiv && (recent.data ?? []).length > 0 && (
        <section className="stack a" style={{ gap: 8 }} aria-label="Son eklenenler">
          <h2 className="sec">Son eklenenler</h2>
          <div className="gstrip">
            {recent.data!.map((m) => (
              <button key={m.id} type="button" className="gthumb" onClick={() => open(m.album_id)} aria-label={`${m.gallery_albums.title} albümünü aç`}>
                <Thumb media={m} signed={signed.data} />
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="stack a" style={{ gap: 8 }} aria-label="Albümler">
        <h2 className="sec">{arsiv ? 'Arşivdeki albümler' : 'Tüm albümler'}</h2>
        {albums.isLoading ? (
          <p className="m">
            <span className="spinner" aria-hidden="true" /> Yükleniyor…
          </p>
        ) : list.length ? (
          <div className="galbums">
            {list.map((a) => (
              <button key={a.id} type="button" className="galbum card" onClick={() => open(a.id)} data-testid="album-card">
                <span className="gcover">
                  {covers[a.id] ? <Thumb media={covers[a.id]!} signed={signed.data} /> : <span className="gimg"><Icon name="image" size={28} /></span>}
                </span>
                <span className="stack" style={{ gap: 2, padding: '10px 12px', alignItems: 'flex-start' }}>
                  <b style={{ fontSize: 15, textAlign: 'left' }}>{a.title}</b>
                  <span className="m" style={{ fontSize: 12 }}>
                    {a.event_date ? trD(a.event_date) : ''}
                    {a.event_date ? ' · ' : ''}
                    {a.media_count} medya · {cats.data?.find((c) => c.id === a.category_id)?.name ?? 'Kategorisiz'}
                  </span>
                  {a.status !== 'yayinda' && <span className={`chip ${a.status === 'onay_bekliyor' ? 'gold' : 'n'}`}>{STATUS_TR[a.status]}</span>}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <div className="empty">{(albums.data ?? []).length ? 'Bu süzgeçte albüm yok.' : arsiv ? 'Arşivde albüm yok.' : 'Henüz albüm yok.'}</div>
        )}
      </section>
      {create && <AlbumModal a={null} onClose={() => setCreate(false)} onSaved={open} />}
    </>
  )
}

/** Albüm kapakları: seçilen kapak, yoksa albümün ilk fotoğrafının küçük önizlemesi. */
function useCoverThumbs(list: Album[]) {
  const [map, setMap] = useState<Record<string, PreviewMedia>>({})
  const key = list.map((a) => `${a.id}:${a.cover_media_id ?? ''}:${a.media_count ?? 0}`).join(',')
  useEffect(() => {
    if (!list.length) return
    let off = false
    ;(async () => {
      const ids = list.map((a) => a.id)
      const { data } = await supabase
        .from('gallery_media')
        .select('id, album_id, path, view_path, thumb_path, kind, sort_order')
        .in('album_id', ids)
        .eq('uploaded', true)
        .order('sort_order')
      const out: Record<string, PreviewMedia> = {}
      for (const a of list) {
        const rows = (data ?? []).filter((m) => m.album_id === a.id)
        const pick = rows.find((m) => m.id === a.cover_media_id) ?? rows.find((m) => m.kind === 'foto') ?? rows[0]
        if (pick) out[a.id] = pick
      }
      if (!off) setMap(out)
    })()
    return () => {
      off = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return map
}

type PreviewMedia = Pick<Media, 'path' | 'view_path' | 'thumb_path' | 'kind'>
function previewPaths(m: PreviewMedia) {
  return [...new Set([m.thumb_path, ...(m.kind === 'foto' ? [m.view_path] : []), m.path].filter(Boolean) as string[])]
}

/** Eski yüklemelerde önizleme yoksa veya bozuksa erişim kontrollü orijinale geç. */
function Thumb({ media, signed }: { media: PreviewMedia; signed?: Record<string, string> }) {
  const [failed, setFailed] = useState<Set<string>>(new Set())
  const paths = previewPaths(media)
  const path = paths.find((p) => signed?.[p] && !failed.has(signed[p]!))
  const url = path ? signed?.[path] : undefined
  const fail = () => { if (url) setFailed((s) => new Set([...s, url])) }
  return (
    <span className="gimg">
      {url ? media.kind === 'video' && path === media.path ? (
        <video src={`${url}#t=0.001`} muted playsInline preload="metadata" aria-hidden="true" onError={fail} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : <img src={url} alt="" loading="lazy" decoding="async" onError={fail} /> : <Icon name={media.kind === 'video' ? 'play' : 'image'} size={28} />}
      {media.kind === 'video' && url && (
        <span className="gplay" aria-hidden="true"><Icon name="play" size={18} /></span>
      )}
    </span>
  )
}

// ---------------------------------------------------------------- Albüm
function AlbumView({ id }: { id: string }) {
  const { role, profile } = useAuth()
  const [, setSp] = useSearchParams()
  const album = useAlbum(id)
  const [pages, setPages] = useState(1)
  const media = useMedia(id, pages)
  const cats = useCategories()
  const toast = useToast()
  const inv = useInvalidate()
  const s = useSettings()
  const a = album.data
  const items = media.data?.items ?? []
  const total = media.data?.total ?? 0
  const signed = useSigned(items.flatMap(previewPaths))
  const [light, setLight] = useState<{ i: number; show: boolean } | null>(null)
  const [edit, setEdit] = useState(false)
  const [pub, setPub] = useState(false)
  const [del, setDel] = useState(false)
  const [sorting, setSorting] = useState(false)
  const [order, setOrder] = useState<Media[]>([])
  const [drag, setDrag] = useState<number | null>(null)
  const [up, setUp] = useState<{ done: number; total: number } | null>(null)
  const [fails, setFails] = useState<UploadResult[]>([])
  const [over, setOver] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const more = useRef<HTMLDivElement>(null)
  const manage = !!a && (role === 'admin' || (a.created_by === profile?.id && profile?.role === 'ogretmen' && s.data?.['galeri.ogretmen_album'] === true))
  const canUpload = manage && (role === 'admin' || s.data?.['galeri.ogretmen_yukleme'] === true) && a?.status !== 'arsiv'

  // Sayfalama: listenin sonu görününce bir sonraki sayfa
  useEffect(() => {
    const el = more.current
    if (!el || items.length >= total) return
    const io = new IntersectionObserver((e) => e[0]?.isIntersecting && setPages((p) => p + 1), { rootMargin: '400px' })
    io.observe(el)
    return () => io.disconnect()
  }, [items.length, total])

  if (album.isLoading) return <p className="m">Yükleniyor…</p>
  if (!a)
    return (
      <div className="stack">
        <button className="btn ghost sm" style={{ alignSelf: 'flex-start' }} onClick={() => setSp({})}>
          <Icon name="back" size={16} /> Galeri
        </button>
        <div className="empty">Albüm bulunamadı ya da görme yetkin yok.</div>
      </div>
    )

  async function pick(files: FileList | File[] | null) {
    const list = Array.from(files ?? [])
    if (!list.length || !a) return
    setFails([])
    const res = await uploadMany(a.id, list, (done, total) => setUp({ done, total }))
    setUp(null)
    const bad = res.filter((r) => !r.ok)
    setFails(bad)
    const ok = res.length - bad.length
    if (ok) toast(`${ok} dosya yüklendi`)
    inv()
    if (fileRef.current) fileRef.current.value = ''
  }
  async function archive(on: boolean) {
    const { error } = await supabase.rpc('gallery_archive', { p_album: a!.id, p_archive: on })
    if (error) return toast(errText(error)!, 'warn')
    toast(on ? 'Albüm arşivlendi' : 'Albüm geri alındı')
    inv()
  }
  async function saveOrder() {
    const { error } = await supabase.rpc('gallery_reorder', { p_album: a!.id, p_ids: order.map((m) => m.id) })
    if (error) return toast(errText(error)!, 'warn')
    setSorting(false)
    toast('Sıralama kaydedildi')
    inv()
  }
  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setOver(false)
    if (canUpload) pick(e.dataTransfer.files)
  }
  const grid = sorting ? order : items
  const pending = items.filter((m) => !m.approved).length

  return (
    <div
      className="stack"
      onDragOver={(e) => {
        if (canUpload && e.dataTransfer.types.includes('Files')) {
          e.preventDefault()
          setOver(true)
        }
      }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
    >
      <button className="btn ghost sm a" style={{ alignSelf: 'flex-start' }} onClick={() => setSp({})}>
        <Icon name="back" size={16} /> Galeri
      </button>
      <div className="head a" style={{ alignItems: 'flex-start' }}>
        <div className="stack" style={{ gap: 4 }}>
          <span className="m" style={{ fontWeight: 500 }}>
            {[a.event_date && trD(a.event_date), cats.data?.find((c) => c.id === a.category_id)?.name, `${total} medya`].filter(Boolean).join(' · ')}
          </span>
          <h1 className="hd">{a.title}</h1>
          {a.description && <p style={{ margin: 0, whiteSpace: 'pre-line' }}>{a.description}</p>}
          {manage && (
            <div className="btns">
              <span className={`chip ${a.status === 'yayinda' ? 'up' : a.status === 'onay_bekliyor' ? 'gold' : 'n'}`}>{STATUS_TR[a.status]}</span>
              <span className="chip n">{AUDIENCE_TR[a.audience]}</span>
              {pending > 0 && <span className="chip gold">{pending} medya onay bekliyor</span>}
            </div>
          )}
        </div>
        <div className="btns">
          {items.length > 0 && (
            <button className="btn" onClick={() => setLight({ i: 0, show: true })}>
              <Icon name="play" size={16} /> Slayt gösterisi
            </button>
          )}
          {manage && a.status !== 'arsiv' && (
            <>
              <button className="btn" onClick={() => setEdit(true)}>
                <Icon name="pen" size={16} /> Düzenle
              </button>
              {a.status !== 'yayinda' && (role === 'admin' || a.status === 'taslak') && (
                <button className="btn pri" onClick={() => setPub(true)}>
                  {role === 'admin' ? 'Yayınla' : 'Onaya gönder'}
                </button>
              )}
              <button className="btn" onClick={() => archive(true)}>
                Arşivle
              </button>
            </>
          )}
          {role === 'admin' && a.status === 'arsiv' && (
            <button className="btn pri" onClick={() => archive(false)}>
              Geri al
            </button>
          )}
          {manage && (
            <button className="btn" onClick={() => setDel(true)} aria-label="Albümü kalıcı sil">
              <Icon name="trash" size={16} />
            </button>
          )}
        </div>
      </div>

      {canUpload && (
        <section className={`gdrop card a ${over ? 'on' : ''}`} aria-label="Fotoğraf / video ekle">
          <Icon name="image" size={22} />
          <span style={{ flex: 1, fontSize: 14 }}>
            Fotoğraf (JPG, PNG, WEBP) ve video (MP4, MOV, WEBM) sürükleyip bırakın ya da seçin. Birden çok dosya seçebilirsiniz.
          </span>
          <label className="btn pri" style={{ cursor: up ? 'wait' : 'pointer' }}>
            <Icon name="plus" size={16} stroke={2} /> Fotoğraf / Video ekle
            <input ref={fileRef} type="file" multiple accept={ACCEPT} className="sr-only" aria-label="Fotoğraf ya da video seç" disabled={!!up} onChange={(e) => pick(e.target.files)} />
          </label>
          {up && (
            <span role="status" className="m" style={{ width: '100%' }}>
              <span className="spinner" aria-hidden="true" /> Yükleniyor: {up.done} / {up.total}
              <progress value={up.done} max={up.total} style={{ width: '100%', marginTop: 6 }} />
            </span>
          )}
          {fails.length > 0 && (
            <div className="err" role="alert" style={{ width: '100%' }}>
              Yüklenemeyen dosyalar:
              <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                {fails.map((f, i) => (
                  <li key={i}>
                    {f.name}: {f.error}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {manage && items.length > 1 && a.status !== 'arsiv' && (
        <div className="btns a">
          {sorting ? (
            <>
              <span className="m" style={{ fontSize: 13 }}>
                Sürükleyerek sıralayın.
              </span>
              <button className="btn pri sm" onClick={saveOrder}>
                Sıralamayı kaydet
              </button>
              <button className="btn sm" onClick={() => setSorting(false)}>
                Vazgeç
              </button>
            </>
          ) : (
            <button className="btn sm" onClick={() => (setOrder(items), setSorting(true))}>
              Sırala
            </button>
          )}
        </div>
      )}

      {media.isLoading ? (
        <p className="m">Yükleniyor…</p>
      ) : grid.length ? (
        <div className="ggrid a" aria-label="Medya">
          {grid.map((m, i) => (
            <button
              key={m.id}
              type="button"
              className={`gthumb ${drag === i ? 'dragging' : ''}`}
              draggable={sorting}
              onDragStart={() => setDrag(i)}
              onDragOver={(e) => {
                if (!sorting || drag === null || drag === i) return
                e.preventDefault()
                setOrder((o) => {
                  const c = [...o]
                  const [x] = c.splice(drag, 1)
                  c.splice(i, 0, x!)
                  return c
                })
                setDrag(i)
              }}
              onDragEnd={() => setDrag(null)}
              onClick={() => !sorting && setLight({ i, show: false })}
              aria-label={`${m.title ?? (m.kind === 'video' ? 'Video' : 'Fotoğraf')} ${i + 1}`}
              data-testid="media"
            >
              <Thumb media={m} signed={signed.data} />
              {!m.approved && <span className="chip gold gbadge">Onay bekliyor</span>}
              {a.cover_media_id === m.id && <span className="chip up gbadge">Kapak</span>}
            </button>
          ))}
        </div>
      ) : (
        <div className="empty">{canUpload ? 'Albüm boş. Fotoğraf ya da video ekleyin.' : 'Bu albümde henüz medya yok.'}</div>
      )}
      {items.length < total && <div ref={more} className="m" style={{ textAlign: 'center' }}>Daha fazla yükleniyor…</div>}

      {light && items.length > 0 && <Lightbox album={a} items={items} start={light.i} slideshow={light.show} manage={manage} onClose={() => setLight(null)} onChanged={inv} />}
      {edit && <AlbumModal a={a} onClose={() => setEdit(false)} onSaved={() => inv()} />}
      {pub && <PublishModal a={a} onClose={() => setPub(false)} onDone={inv} />}
      {del && (
        <DeleteModal
          a={a}
          count={total}
          onClose={() => setDel(false)}
          onDone={() => {
            inv()
            setSp({})
          }}
        />
      )}
      {over && <div className="gover" aria-hidden="true" />}
    </div>
  )
}

// ---------------------------------------------------------------- Işık kutusu
function Lightbox({ album, items, start, slideshow, manage, onClose, onChanged }: { album: Album; items: Media[]; start: number; slideshow: boolean; manage: boolean; onClose: () => void; onChanged: () => void }) {
  const { role } = useAuth()
  const toast = useToast()
  const [i, setI] = useState(start)
  const [play, setPlay] = useState(slideshow)
  const [editing, setEditing] = useState(false)
  const m = items[i]!
  const full = useSigned([m.kind === 'foto' ? (m.view_path ?? m.path) : m.path, m.thumb_path])
  const touch = useRef<number | null>(null)
  const go = (d: number) => setI((x) => (x + d + items.length) % items.length)
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (editing) return
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight') go(1)
      if (e.key === 'ArrowLeft') go(-1)
    }
    document.addEventListener('keydown', k)
    return () => document.removeEventListener('keydown', k)
  })
  useEffect(() => {
    if (!play || m.kind === 'video') return
    const t = setTimeout(() => go(1), 4000)
    return () => clearTimeout(t)
  })
  const src = full.data?.[m.kind === 'foto' ? (m.view_path ?? m.path) : m.path]
  const poster = m.thumb_path ? full.data?.[m.thumb_path] : undefined

  async function action(fn: () => PromiseLike<{ error: { message?: string } | null }>, msg: string) {
    const { error } = await fn()
    if (error) return toast(errText(error)!, 'warn')
    toast(msg)
    onChanged()
  }
  async function download() {
    try {
      const ext = m.path.split('.').pop()
      window.location.href = await signedDownload(m.path, `${album.title}-${i + 1}.${ext}`)
    } catch (e) {
      toast((e as Error).message, 'warn')
    }
  }

  return (
    <div className="glight" role="dialog" aria-modal="true" aria-label={`${album.title} · ${i + 1} / ${items.length}`}>
      <div className="gltop">
        <span className="mono" aria-live="polite">
          {i + 1} / {items.length}
        </span>
        <div className="btns" style={{ flexWrap: 'nowrap' }}>
          <button className="gbtn" onClick={() => setPlay((p) => !p)} aria-pressed={play} aria-label={play ? 'Slayt gösterisini durdur' : 'Slayt gösterisi'}>
            <Icon name="play" size={18} />
          </button>
          {album.allow_download && (
            <button className="gbtn" onClick={download} aria-label="İndir">
              <Icon name="down" size={18} />
            </button>
          )}
          <button className="gbtn" onClick={onClose} aria-label="Kapat">
            <Icon name="x" size={20} />
          </button>
        </div>
      </div>
      <div
        className="glstage"
        onTouchStart={(e) => (touch.current = e.touches[0]!.clientX)}
        onTouchEnd={(e) => {
          if (touch.current == null) return
          const dx = e.changedTouches[0]!.clientX - touch.current
          if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1)
          touch.current = null
        }}
      >
        <button className="gbtn gnav" onClick={() => go(-1)} aria-label="Önceki">
          <Icon name="back" size={22} />
        </button>
        {m.kind === 'video' ? (
          // eslint-disable-next-line jsx-a11y/media-has-caption
          <video key={m.id} src={src} poster={poster} controls preload="metadata" playsInline className="glmedia" />
        ) : src ? (
          <img key={m.id} src={src} alt={m.title ?? `${album.title} fotoğraf ${i + 1}`} className="glmedia" />
        ) : (
          <span className="spinner" aria-hidden="true" />
        )}
        <button className="gbtn gnav" onClick={() => go(1)} aria-label="Sonraki">
          <Icon name="right" size={22} />
        </button>
      </div>
      <div className="glbottom">
        {(m.title || m.description) && !editing && (
          <div>
            {m.title && <b>{m.title}</b>}
            {m.description && <p style={{ margin: 0 }}>{m.description}</p>}
          </div>
        )}
        {m.kind === 'video' && (m.mime === 'video/quicktime') && <span className="m" style={{ fontSize: 12 }}>Video açılmazsa (iPhone .MOV) Safari'de ya da indirerek izleyin.</span>}
        {manage && !editing && (
          <div className="btns">
            {!m.approved && role === 'admin' && (
              <button className="btn sm pri" onClick={() => action(() => supabase.from('gallery_media').update({ approved: true }).eq('id', m.id), 'Medya onaylandı')}>
                Onayla
              </button>
            )}
            {m.kind === 'foto' && album.cover_media_id !== m.id && (
              <button className="btn sm" onClick={() => action(() => supabase.from('gallery_albums').update({ cover_media_id: m.id }).eq('id', album.id), 'Kapak fotoğrafı seçildi')}>
                Kapak fotoğrafı yap
              </button>
            )}
            <button className="btn sm" onClick={() => setEditing(true)}>
              Başlık / açıklama
            </button>
            <button
              className="btn sm warn"
              onClick={async () => {
                try {
                  await deleteMedia(m)
                  toast('Medya silindi')
                  onChanged()
                  if (items.length <= 1) onClose()
                  else setI((x) => Math.min(x, items.length - 2))
                } catch (e) {
                  toast((e as Error).message, 'warn')
                }
              }}
            >
              <Icon name="trash" size={14} /> Sil
            </button>
          </div>
        )}
        {editing && <MediaEdit m={m} onDone={() => (setEditing(false), onChanged())} />}
      </div>
    </div>
  )
}

function MediaEdit({ m, onDone }: { m: Media; onDone: () => void }) {
  const toast = useToast()
  const [t, setT] = useState(m.title ?? '')
  const [d, setD] = useState(m.description ?? '')
  return (
    <div className="stack" style={{ gap: 6, width: '100%', maxWidth: 520 }}>
      <input aria-label="Medya başlığı" value={t} maxLength={120} onChange={(e) => setT(e.target.value)} placeholder="Başlık (isteğe bağlı)" />
      <textarea aria-label="Medya açıklaması" value={d} maxLength={1000} rows={2} onChange={(e) => setD(e.target.value)} placeholder="Açıklama (isteğe bağlı)" />
      <div className="btns">
        <button
          className="btn sm pri"
          onClick={async () => {
            const { error } = await supabase.from('gallery_media').update({ title: t.trim() || null, description: d.trim() || null }).eq('id', m.id)
            if (error) return toast(errText(error)!, 'warn')
            onDone()
          }}
        >
          Kaydet
        </button>
        <button className="btn sm" onClick={onDone}>
          Vazgeç
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- Albüm formu, yayınlama, silme
function AlbumModal({ a, onClose, onSaved }: { a: Album | null; onClose: () => void; onSaved: (id: string) => void }) {
  const { role } = useAuth()
  const cats = useCategories()
  const classes = useClasses()
  const students = useStudents()
  const s = useSettings()
  const toast = useToast()
  const [f, setF] = useState({
    title: a?.title ?? '',
    description: a?.description ?? '',
    event_date: a?.event_date ?? new Date().toISOString().slice(0, 10),
    category_id: a?.category_id ?? '',
    audience: (a?.audience ?? (role === 'admin' ? 'okul' : 'sinif')) as Audience,
    level: (a?.level ?? 'ortaokul') as Level,
    class_ids: a?.class_ids ?? [],
    student_ids: a?.student_ids ?? [],
    allow_download: a?.allow_download ?? s.data?.['galeri.indirme'] === true,
  })
  const [find, setFind] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF((x) => ({ ...x, [k]: e.target.value }))
  const stuList = useMemo(() => (students.data ?? []).filter((x) => !find || fold(`${x.full_name} ${x.class_name}`).includes(fold(find))).slice(0, 50), [students.data, find])

  async function save() {
    setErr(null)
    if (f.title.trim().length < 3) return setErr('Albüm başlığını yazın.')
    if (f.audience === 'sinif' && !f.class_ids.length) return setErr('En az bir sınıf seçin.')
    if (f.audience === 'ogrenci' && !f.student_ids.length) return setErr('En az bir öğrenci seçin.')
    const row = {
      title: f.title.trim(),
      description: f.description.trim() || null,
      event_date: f.event_date || null,
      category_id: f.category_id || null,
      audience: f.audience,
      level: f.audience === 'kademe' ? f.level : null,
      class_ids: f.audience === 'sinif' ? f.class_ids : [],
      student_ids: f.audience === 'ogrenci' ? f.student_ids : [],
      allow_download: f.allow_download,
    }
    setBusy(true)
    const res = a ? await supabase.from('gallery_albums').update(row).eq('id', a.id).select('id').single() : await supabase.from('gallery_albums').insert(row).select('id').single()
    setBusy(false)
    if (res.error) return setErr(errText(res.error))
    toast(a ? 'Albüm güncellendi' : 'Albüm oluşturuldu (taslak)')
    onSaved(res.data.id as string)
    onClose()
  }

  return (
    <Modal
      title={a ? 'Albümü düzenle' : 'Albüm oluştur'}
      sub={a ? undefined : 'Albüm taslak olarak açılır; medyayı ekleyip yayınladığınızda hedef kitle görür.'}
      width={640}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Vazgeç
          </button>
          <button className="btn pri" onClick={save} disabled={busy}>
            {busy && <span className="spinner" aria-hidden="true" />} Kaydet
          </button>
        </>
      }
    >
      <label className="field" htmlFor="gTitle">
        Başlık
        <input id="gTitle" value={f.title} onChange={set('title')} maxLength={120} placeholder="ör. Çanakkale Gezisi" />
      </label>
      <div className="grid2">
        <label className="field" htmlFor="gDate">
          Tarih
          <input id="gDate" type="date" value={f.event_date} onChange={set('event_date')} />
        </label>
        <label className="field" htmlFor="gCat">
          Kategori
          <select id="gCat" value={f.category_id} onChange={set('category_id')}>
            <option value="">Kategorisiz</option>
            {(cats.data ?? [])
              .filter((c) => c.active || c.id === f.category_id)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </select>
        </label>
      </div>
      <label className="field" htmlFor="gDesc">
        Açıklama (isteğe bağlı)
        <textarea id="gDesc" rows={2} value={f.description} onChange={set('description')} maxLength={2000} />
      </label>
      <label className="field" htmlFor="gAud">
        Kimler görsün
        <select id="gAud" value={f.audience} onChange={set('audience')}>
          {(Object.keys(AUDIENCE_TR) as Audience[]).map((k) => (
            <option key={k} value={k}>
              {AUDIENCE_TR[k]}
            </option>
          ))}
        </select>
      </label>
      {f.audience === 'kademe' && (
        <label className="field" htmlFor="gLevel">
          Kademe
          <select id="gLevel" value={f.level} onChange={set('level')}>
            {LEVELS.map((l) => (
              <option key={l} value={l}>
                {LEVEL_TR[l]}
              </option>
            ))}
          </select>
        </label>
      )}
      {f.audience === 'sinif' && (
        <div className="btns" role="group" aria-label="Sınıflar">
          {(classes.data ?? []).map((c) => {
            const on = f.class_ids.includes(c.id)
            return (
              <button key={c.id} type="button" className={`btn sm ${on ? 'pri' : ''}`} aria-pressed={on} onClick={() => setF((x) => ({ ...x, class_ids: on ? x.class_ids.filter((y) => y !== c.id) : [...x.class_ids, c.id] }))}>
                {c.name}
              </button>
            )
          })}
        </div>
      )}
      {f.audience === 'ogrenci' && (
        <div className="stack" style={{ gap: 6 }}>
          <input aria-label="Öğrenci ara" placeholder="Öğrenci ara" value={find} onChange={(e) => setFind(e.target.value)} />
          <div className="btns" role="group" aria-label="Öğrenciler" style={{ maxHeight: 180, overflowY: 'auto' }}>
            {stuList.map((x) => {
              const on = f.student_ids.includes(x.id)
              return (
                <button key={x.id} type="button" className={`btn sm ${on ? 'pri' : ''}`} aria-pressed={on} onClick={() => setF((y) => ({ ...y, student_ids: on ? y.student_ids.filter((z) => z !== x.id) : [...y.student_ids, x.id] }))}>
                  {x.full_name} · {x.class_name}
                </button>
              )
            })}
          </div>
          <span className="m" style={{ fontSize: 12 }}>
            {f.student_ids.length} öğrenci seçildi
          </span>
        </div>
      )}
      <button type="button" className="check" role="switch" aria-checked={f.allow_download} onClick={() => setF((x) => ({ ...x, allow_download: !x.allow_download }))}>
        <span className={`box ${f.allow_download ? 'on' : ''}`}>{f.allow_download && <Icon name="check" size={13} stroke={3} />}</span>
        <span style={{ flex: 1, fontSize: 14 }}>
          İndirmeye izin ver
          <span className="m" style={{ display: 'block', fontSize: 12 }}>
            Kapalıyken indirme düğmesi gösterilmez (ekran görüntüsü alınması teknik olarak engellenemez).
          </span>
        </span>
      </button>
      {err && (
        <div className="err" role="alert">
          {err}
        </div>
      )}
    </Modal>
  )
}

function PublishModal({ a, onClose, onDone }: { a: Album; onClose: () => void; onDone: () => void }) {
  const { role } = useAuth()
  const toast = useToast()
  const [notify, setNotify] = useState(true)
  const [busy, setBusy] = useState(false)
  async function go() {
    setBusy(true)
    const { data, error } = await supabase.rpc('gallery_publish', { p_album: a.id, p_notify: notify })
    setBusy(false)
    if (error) return toast(errText(error)!, 'warn')
    toast(data === 'yayinda' ? 'Albüm yayınlandı' : 'Albüm yönetici onayına gönderildi')
    onDone()
    onClose()
  }
  return (
    <Modal
      title={role === 'admin' ? 'Albümü yayınla' : 'Onaya gönder'}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Vazgeç
          </button>
          <button className="btn pri" onClick={go} disabled={busy}>
            {role === 'admin' ? 'Yayınla' : 'Gönder'}
          </button>
        </>
      }
    >
      <p style={{ margin: 0, fontSize: 14 }}>
        <b>{a.title}</b> · {AUDIENCE_TR[a.audience]}. Yayınlanınca yalnız bu kitle görür.
      </p>
      <button type="button" className="check" role="checkbox" aria-checked={notify} onClick={() => setNotify((x) => !x)}>
        <span className={`box ${notify ? 'on' : ''}`}>{notify && <Icon name="check" size={13} stroke={3} />}</span>
        <span style={{ flex: 1, fontSize: 14 }}>Kullanıcılara bildirim gönder (yalnız bir kez, albüm için)</span>
      </button>
    </Modal>
  )
}

function DeleteModal({ a, count, onClose, onDone }: { a: Album; count: number; onClose: () => void; onDone: () => void }) {
  const toast = useToast()
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  return (
    <Modal
      title="Albümü kalıcı sil"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Vazgeç
          </button>
          <button
            className="btn warn"
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              try {
                await deleteAlbum(a.id)
                toast('Albüm ve dosyaları silindi')
                onClose()
                onDone()
              } catch (e) {
                setErr((e as Error).message)
              } finally {
                setBusy(false)
              }
            }}
          >
            <Icon name="trash" size={16} /> Kalıcı sil
          </button>
        </>
      }
    >
      <p style={{ margin: 0, fontSize: 14 }}>
        <b>Bu albümde {count} medya dosyası var.</b> Albüm, bütün fotoğraf ve videolar ve önizlemeleri kalıcı olarak silinir; geri alınamaz. Saklamak için silmek yerine <b>Arşivle</b>'yi kullanın.
      </p>
      {err && (
        <div className="err" role="alert">
          {err}
        </div>
      )}
    </Modal>
  )
}
