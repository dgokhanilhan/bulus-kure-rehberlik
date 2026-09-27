import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'

/**
 * Segment kontrol / menü / sekme göstergesi: etkin öğenin altına kayan zemin
 * (prototipteki placeInds). prefers-reduced-motion'da CSS geçişleri kapanır.
 */
export function useIndicator<T extends HTMLElement>(active: string | undefined) {
  // Callback ref: kapsayıcı sonradan (ör. veri yüklenince) ekrana gelse de gösterge yerleşir.
  const [el, ref] = useState<T | null>(null)
  const ind = useRef<HTMLSpanElement>(null)
  useLayoutEffect(() => {
    const place = () => {
      const c = el
      const i = ind.current
      if (!c || !i) return
      const act = c.querySelector<HTMLElement>(':scope > [aria-pressed="true"], :scope > [aria-selected="true"], :scope > [aria-current="page"]')
      if (!act || c.offsetParent === null) {
        i.style.opacity = '0'
        return
      }
      i.style.opacity = '1'
      const vert = getComputedStyle(c).flexDirection === 'column'
      i.style.transform = vert ? `translateY(${act.offsetTop}px)` : `translateX(${act.offsetLeft}px)`
      i.style.width = vert ? '' : `${act.offsetWidth}px`
    }
    place()
    // Kapsayıcı ya da öğeler boyut değiştirince (kırılım, yazı tipi yüklenmesi) yeniden hizala.
    const ro = new ResizeObserver(place)
    if (el) {
      ro.observe(el)
      for (const child of Array.from(el.children)) ro.observe(child)
    }
    document.fonts?.ready.then(place).catch(() => {})
    return () => ro.disconnect()
  }, [active, el])
  return { ref, ind: <span className="ind" ref={ind} /> }
}

export function Seg<K extends string>({
  value,
  options,
  onChange,
  label,
  stretch,
  className = '',
  style,
}: {
  value: K
  options: readonly (readonly [K, string])[]
  onChange: (k: K) => void
  label: string
  stretch?: boolean
  className?: string
  style?: React.CSSProperties
}) {
  const { ref, ind } = useIndicator<HTMLDivElement>(value)
  return (
    <div className={`seg ${className}`} role="group" aria-label={label} ref={ref} style={{ ...(stretch ? { display: 'flex' } : {}), ...style }}>
      {ind}
      {options.map(([k, l]) => (
        <button type="button" key={k} aria-pressed={value === k} onClick={() => onChange(k)} style={stretch ? { flex: 1 } : undefined}>
          {l}
        </button>
      ))}
    </div>
  )
}

export function Dropdown({
  title,
  sub,
  icon,
  children,
  delay = 0,
  defaultOpen,
  right,
}: {
  title: string
  sub?: string
  icon?: ReactNode
  children: ReactNode
  delay?: number
  defaultOpen?: boolean
  right?: ReactNode
}) {
  return (
    <details className="dd a" style={{ ['--d' as string]: delay }} open={defaultOpen}>
      <summary>
        {icon && <span style={{ color: 'var(--primary)', display: 'inline-flex' }}>{icon}</span>}
        <span className="t">
          <b>{title}</b>
          {sub && <small>{sub}</small>}
        </span>
        {right}
        <span className="chev">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </span>
      </summary>
      <div className="dd-body">{children}</div>
    </details>
  )
}
