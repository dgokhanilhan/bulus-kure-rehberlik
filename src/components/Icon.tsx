// Prototipteki ikon seti: 24px ızgara, çizgili, yuvarlak uçlu, currentColor.
const PATHS = {
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5M16 4.5a3.5 3.5 0 010 7M18 14.8c2 .7 3.2 2.5 3.6 5.2"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4.4 4.2-6.5 8-6.5s7 2.1 8 6.5"/>',
  doc: '<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5M10 13h6M10 17h6"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  up: '<path d="M12 16V4M6 10l6-6 6 6M4 20h16"/>',
  check: '<path d="M5 12l5 5 9-10"/>',
  back: '<path d="M15 6l-6 6 6 6"/>',
  down: '<path d="M6 9l6 6 6-6"/>',
  right: '<path d="M9 6l6 6-6 6"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  home: '<path d="M4 11l8-7 8 7v9H4z"/>',
  chat: '<path d="M4 5h16v11H9l-5 4z"/>',
  warn: '<path d="M12 3l10 18H2zM12 10v5M12 18v.5"/>',
  bell: '<path d="M6 16V11a6 6 0 1112 0v5l1.5 2h-15zM10 20a2 2 0 004 0"/>',
  cal: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  book: '<path d="M5 4.5A1.5 1.5 0 016.5 3H19v15H6.5A1.5 1.5 0 005 19.5z"/><path d="M5 19.5A1.5 1.5 0 006.5 21H19v-3M9 7h6"/>',
  clip: '<path d="M20 11.5l-8.1 8.1a5 5 0 01-7.1-7.1l8.5-8.5a3.3 3.3 0 014.7 4.7l-8.5 8.5a1.7 1.7 0 01-2.4-2.4l7.8-7.8"/>',
  more: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
  task: '<path d="M9 11l3 3 8-8"/><path d="M20 12v7a1 1 0 01-1 1H5a1 1 0 01-1-1V5a1 1 0 011-1h11"/>',
  shield: '<path d="M12 3l8 3v6c0 4.5-3.4 8.4-8 9-4.6-.6-8-4.5-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
  spark: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 17l.8 2.2L22 20l-2.2.8L19 23l-.8-2.2L16 20l2.2-.8z"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 118 0v3"/>',
  out: '<path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h11"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
  pen: '<path d="M4 20l4-1 11-11-3-3L5 16z"/><path d="M14 6l3 3"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  repeat: '<path d="M4 12a8 8 0 0114-5.3L20 9M20 4v5h-5M20 12a8 8 0 01-14 5.3L4 15M4 20v-5h5"/>',
  flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
  mega: '<path d="M3 10v4h3l6 4V6L6 10zM16 9a4 4 0 010 6M18.5 6.5a7.5 7.5 0 010 11"/>',
} as const

export type IconName = keyof typeof PATHS

export function Icon({ name, size = 20, stroke = 1.8 }: { name: IconName; size?: number; stroke?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: PATHS[name] }}
    />
  )
}

export function Logo({ color = '#c9962e', size = 32 }: { color?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 34 34" fill="none" aria-hidden="true">
      <circle cx="17" cy="17" r="15" stroke={color} strokeWidth="2" />
      <path d="M17 2c-5 5-5 25 0 30M17 2c5 5 5 25 0 30M3 13h28M3 21h28" stroke={color} strokeWidth="1.4" />
    </svg>
  )
}

export function Globe({ size = 420, color = '#e7c57a' }: { size?: number; color?: string }) {
  return (
    <svg className="globe" width={size} height={size} viewBox="0 0 200 200" fill="none" aria-hidden="true">
      <circle cx="100" cy="100" r="92" stroke={color} strokeWidth="2.5" />
      <g className="spin">
        <ellipse cx="100" cy="100" rx="30" ry="92" stroke={color} strokeWidth="1.6" />
        <ellipse cx="100" cy="100" rx="62" ry="92" stroke={color} strokeWidth="1.2" opacity=".7" />
        <line x1="100" y1="8" x2="100" y2="192" stroke={color} strokeWidth="1.6" />
      </g>
      <path d="M12 70h176M8 100h184M12 130h176" stroke={color} strokeWidth="1.2" opacity=".8" />
      <circle cx="138" cy="62" r="6" fill={color} />
    </svg>
  )
}

export const Chev = () => (
  <span className="chev">
    <Icon name="down" size={20} stroke={2} />
  </span>
)

/** Okul logosu (Yönetim → Genel ayarlar'dan yüklenir); yoksa küre işareti. */
export function SchoolLogo({ url, size = 32 }: { url?: string | null; size?: number }) {
  return url ? <img src={url} alt="" width={size} height={size} style={{ objectFit: 'contain', borderRadius: 6 }} /> : <Logo size={size} />
}
