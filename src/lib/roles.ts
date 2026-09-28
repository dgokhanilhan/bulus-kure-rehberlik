import type { Profile, Role } from './types'

// Veritabanındaki valid_branches() ile aynı liste (0008).
export const BRANS = [
  'Sınıf Öğretmeni', 'Okul Öncesi', 'Türkçe', 'Türk Dili ve Edebiyatı', 'Matematik', 'Fen Bilimleri', 'Fizik', 'Kimya',
  'Biyoloji', 'Sosyal Bilgiler', 'T.C. İnkılap Tarihi', 'Tarih', 'Coğrafya', 'Felsefe', 'Din Kültürü', 'İngilizce', 'Almanca',
  'Beden Eğitimi', 'Müzik', 'Görsel Sanatlar', 'Bilişim Teknolojileri', 'Rehberlik',
] as const
export type Level = 'ilkokul' | 'ortaokul' | 'lise'
export const LEVEL_TR: Record<Level, string> = { ilkokul: 'İlkokul', ortaokul: 'Ortaokul', lise: 'Lise' }
export const LEVELS: Level[] = ['ilkokul', 'ortaokul', 'lise']
/** LGS deneme analizi yalnız 8. sınıflar içindir. */
export const DENEME_GRADE = 8
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
  | 'bugun' | 'ogrenciler' | 'denemeler' | 'siniflar' | 'onaylar' | 'yonetim'
  | 'ozet' | 'gorevler' | 'raporlar' | 'gorusmeler'

export interface NavItem {
  id: PageId
  label: string
  icon: 'sun' | 'users' | 'doc' | 'grid' | 'shield' | 'home' | 'task' | 'cal' | 'pen'
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
  if (r === 'admin') return [...STAFF, { id: 'yonetim', label: 'Yönetim', icon: 'pen' }, { id: 'onaylar', label: 'Onaylar', icon: 'shield' }]
  if (r === 'rehber') return STAFF
  if (r === 'brans') return [STAFF[1]!]
  return FAMILY
}

export const ROLE_HINT: Record<Role, string> = {
  admin: 'Tam yetki: okul yönetimi ve kayıt onayları.',
  rehber: 'Tam yetki: görev, görüşme, rapor.',
  brans: 'Öğrencileri görüntüleyebilir ve not ekleyebilirsin.',
  veli: 'Yalnızca kendi bilgilerini görürsün.',
  ogrenci: 'Yalnızca kendi bilgilerini görürsün.',
}
