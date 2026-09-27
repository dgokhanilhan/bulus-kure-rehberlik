import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from './Icon'
import { initials } from '@/lib/format'

/** Prototipteki modal: arka plan bulanık, alttan kayarak açılır; Esc ve arka plan tıklaması kapatır. */
export function Modal({
  title,
  sub,
  avatar,
  width = 560,
  onClose,
  children,
  footer,
}: {
  title: string
  sub?: string
  avatar?: string
  width?: number
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    const first = ref.current?.querySelector<HTMLElement>('input, select, textarea, button:not(.xbtn)')
    first?.focus()
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
      prev?.focus?.()
    }
  }, [onClose])
  return createPortal(
    <div className="mwrap" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} style={{ ['--mw' as string]: `${width}px` }} ref={ref}>
        <div className="modal-h">
          {avatar && <span className="av">{initials(avatar)}</span>}
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2>{title}</h2>
            {sub && (
              <span className="m" style={{ fontSize: 13 }}>
                {sub}
              </span>
            )}
          </div>
          <button type="button" className="xbtn" onClick={onClose} aria-label="Kapat">
            <Icon name="x" size={18} stroke={2.4} />
          </button>
        </div>
        <div className="modal-b">{children}</div>
        {footer && <div className="modal-f">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}
