// Ek dosya bileşenleri: seçici, seçilenler, ek listesi (görsel küçük resimleri + PDF), duyuru kapak görseli.
import { useRef, useState } from 'react'
import { checkFiles, fmtSize, openFile, useBlobUrl, useFileRules, type Attachment } from '@/lib/files'
import { Icon } from './Icon'
import { useToast } from './Toast'

/** Dosya seç düğmesi; kurallara uymayanları bildirir. */
export function FilePick({ label, multiple = true, imagesOnly, onPick, disabled }: { label: string; multiple?: boolean; imagesOnly?: boolean; onPick: (f: File[]) => void; disabled?: boolean }) {
  const rules = useFileRules()
  const toast = useToast()
  const ref = useRef<HTMLInputElement>(null)
  const types = imagesOnly ? rules.types.filter((t) => t.startsWith('image/')) : rules.types
  if (!types.length) return null
  return (
    <>
      <input
        ref={ref}
        type="file"
        hidden
        multiple={multiple}
        accept={types.join(',')}
        aria-label={label}
        onChange={(e) => {
          const { ok, errors } = checkFiles([...(e.target.files ?? [])], { maxMb: rules.maxMb, types })
          errors.forEach((m) => toast(m, 'warn'))
          if (ok.length) onPick(ok)
          e.target.value = ''
        }}
      />
      <button type="button" className="btn sm" onClick={() => ref.current?.click()} disabled={disabled}>
        <Icon name="clip" size={16} /> {label}
      </button>
    </>
  )
}

/** Seçilmiş (henüz yüklenmemiş) dosyalar. */
export function PickedFiles({ files, onRemove }: { files: File[]; onRemove: (i: number) => void }) {
  if (!files.length) return null
  return (
    <div className="btns" style={{ gap: 6 }}>
      {files.map((f, i) => (
        <span key={`${f.name}-${i}`} className="chip n" style={{ paddingRight: 4 }}>
          {f.type === 'application/pdf' ? 'PDF' : 'Görsel'} · {f.name} · {fmtSize(f.size)}
          <button type="button" className="xbtn" style={{ width: 22, height: 22 }} onClick={() => onRemove(i)} aria-label={`${f.name} dosyasını çıkar`}>
            <Icon name="x" size={12} stroke={2.6} />
          </button>
        </span>
      ))}
    </div>
  )
}

function Thumb({ a }: { a: Attachment }) {
  const url = useBlobUrl(a)
  return url ? <img src={url} alt="" style={{ width: 88, height: 66, objectFit: 'cover', borderRadius: 8, display: 'block' }} /> : <span className="spinner" aria-hidden="true" />
}

/** Yüklenmiş ekler: görseller küçük resim, PDF'ler çip; tıklanınca yeni sekmede açılır. */
export function AttachmentList({ items, onDelete }: { items: Attachment[]; onDelete?: (a: Attachment) => void }) {
  const toast = useToast()
  const [busy, setBusy] = useState<string | null>(null)
  if (!items.length) return null
  const open = async (a: Attachment) => {
    setBusy(a.id)
    await openFile(a).catch(() => toast('Dosya açılamadı.', 'warn'))
    setBusy(null)
  }
  return (
    <div className="btns" style={{ gap: 8 }} data-testid="attachments">
      {items.map((a) => (
        <span key={a.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <button type="button" className={a.mime.startsWith('image/') ? 'thumb' : 'chip n'} onClick={() => open(a)} aria-label={`${a.file_name} dosyasını aç`} title={`${a.file_name} · ${fmtSize(a.size)}`} disabled={busy === a.id}>
            {a.mime.startsWith('image/') ? (
              <Thumb a={a} />
            ) : (
              <>
                <Icon name="doc" size={14} /> {a.file_name}
              </>
            )}
          </button>
          {onDelete && (
            <button type="button" className="xbtn" style={{ width: 24, height: 24 }} onClick={() => onDelete(a)} aria-label={`${a.file_name} dosyasını sil`}>
              <Icon name="x" size={12} stroke={2.6} />
            </button>
          )}
        </span>
      ))}
    </div>
  )
}

/** Duyuru kapak görseli (tam genişlik). */
export function Cover({ a }: { a: Attachment }) {
  const url = useBlobUrl(a)
  const [broken, setBroken] = useState(false)
  if (broken) return null
  return (
    <div style={{ margin: '-18px -18px 4px', aspectRatio: '16 / 7', maxHeight: 280, background: 'var(--surface-sunken)', overflow: 'hidden', borderRadius: '18px 18px 0 0' }}>
      {url && <img src={url} alt={`${a.file_name} kapak görseli`} onError={() => setBroken(true)} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />}
    </div>
  )
}
