import type { Profile, Role } from './types'

export const BRANS = ['Türkçe', 'Matematik', 'Fen Bilimleri', 'T.C. İnkılap Tarihi', 'Din Kültürü', 'İngilizce', 'Rehberlik'] as const
export const SUBE = ['8/A', '8/B', '8/C'] as const
export const YAKINLIK = ['Anne', 'Baba', 'Vasi', 'Diğer'] as const

export function roleOf(p: Pick<Profile, 'role' | 'branch'>): Role {
  if (p.role === 'ogretmen') return p.branch === 'Rehberlik' ? 'rehber' : 'brans'
  return p.role
}

export const ROLE_TR: Record<Role, string> = {
  admin: 'Yönetici',
  rehber: 'Rehber öğretmen',
  brans: 'Branş öğretmeni',
  veli: 'Veli',
  ogrenci: 'Öğrenci',
}

export const isFullAccess = (r: Role) => r === 'admin' || r === 'rehber'

export type PageId =
  | 'bugun' | 'ogrenciler' | 'denemeler' | 'siniflar' | 'onaylar'
  | 'ozet' | 'gorevler' | 'raporlar' | 'gorusmeler'

export interface NavItem {
  id: PageId
  label: string
  icon: 'sun' | 'users' | 'doc' | 'grid' | 'shield' | 'home' | 'task' | 'cal'
}

const STAFF: NavItem[] = [
  { id: 'bugun', label: 'Bugün', icon: 'sun' },
  { id: 'ogrenciler', label: 'Öğrenciler', icon: 'users' },
  { id: 'denemeler', label: 'Denemeler', icon: 'doc' },
  { id: 'siniflar', label: 'Sınıflar', icon: 'grid' },
]
const FAMILY: NavItem[] = [
  { id: 'ozet', label: 'Özet', icon: 'home' },
  { id: 'gorevler', label: 'Görevler', icon: 'task' },
  { id: 'raporlar', label: 'Raporlar', icon: 'doc' },
  { id: 'gorusmeler', label: 'Görüşmeler', icon: 'cal' },
]

/** Rol bazlı menü — prototipteki navItems() ile aynı. Yetki ayrıca veritabanında (RLS) zorlanır. */
export function navItems(r: Role): NavItem[] {
  if (r === 'admin') return [...STAFF, { id: 'onaylar', label: 'Onaylar', icon: 'shield' }]
  if (r === 'rehber') return STAFF
  if (r === 'brans') return [STAFF[1]!]
  return FAMILY
}

export const ROLE_HINT: Record<Role, string> = {
  admin: 'Tam yetki ve kayıt onayları.',
  rehber: 'Tam yetki: görev, görüşme, rapor.',
  brans: 'Öğrencileri görüntüleyebilir ve not ekleyebilirsin.',
  veli: 'Yalnızca kendi bilgilerini görürsün.',
  ogrenci: 'Yalnızca kendi bilgilerini görürsün.',
}
