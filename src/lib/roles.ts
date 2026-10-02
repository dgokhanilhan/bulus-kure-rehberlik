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
/** YKS yalnız 12. sınıflar içindir (YKS veri kaynağı henüz yok: ekranda hiçbir YKS verisi gösterilmez). */
export const YKS_GRADE = 12
export type ExamTrack = 'lgs' | 'yks' | null
/** Sınıf seviyesine göre sınav izi: 8 → LGS, 12 → YKS, diğerleri → yok. Sınıf adından değil classes.grade'den. */
export const examTrack = (grade: number | null | undefined): ExamTrack => (grade === DENEME_GRADE ? 'lgs' : grade === YKS_GRADE ? 'yks' : null)
export const YAKINLIK = ['Anne', 'Baba', 'Vasi', 'Diğer'] as const

export function roleOf(p: Pick<Profile, 'role' | 'branch'>): Role {
  if (p.role === 'ogretmen') return p.branch === 'Rehberlik' ? 'rehber' : 'brans'
  return p.role
}

/** Kişinin bütün rolleri (0020 profile_roles). Liste yüklenmemişse ana rol. */
export const rolesOf = (p: { role: string; roles?: string[] | null }) => (p.roles?.length ? p.roles : [p.role])
/** Öğretmen listelerinde görünür mü: yönetici ya da öğretmen rolü olan (ana rolü veli olsa da). */
export const isTeacherP = (p: { role: string; roles?: string[] | null }) => p.role === 'admin' || rolesOf(p).includes('ogretmen')
export const isParentP = (p: { role: string; roles?: string[] | null }) => rolesOf(p).includes('veli')
/** Tek hesapta geçiş yapılabilen roller (yalnız öğretmen + veli birlikteyse). */
export type SwitchRole = 'ogretmen' | 'veli'
export const SWITCH_TR: Record<SwitchRole, string> = { ogretmen: 'Öğretmen', veli: 'Veli' }

export const ROLE_TR: Record<Role, string> = {
  admin: 'Yönetici',
  rehber: 'Rehber öğretmen',
  brans: 'Branş öğretmeni',
  veli: 'Veli',
  ogrenci: 'Öğrenci',
}

export const isFullAccess = (r: Role) => r === 'admin' || r === 'rehber'

export type PageId =
  | 'bugun' | 'ogrenciler' | 'odevler' | 'takvim' | 'bildirimler' | 'denemeler' | 'siniflar' | 'onaylar' | 'yonetim'
  | 'panel' | 'ozet' | 'okul' | 'duyurular' | 'iletisim' | 'gorevler' | 'raporlar' | 'gorusmeler'

export interface NavItem {
  id: PageId
  label: string
  icon: 'sun' | 'users' | 'doc' | 'grid' | 'shield' | 'home' | 'task' | 'cal' | 'pen' | 'chat' | 'book' | 'spark' | 'mega'
}

const STAFF: NavItem[] = [
  { id: 'bugun', label: 'Bugün', icon: 'sun' },
  { id: 'ogrenciler', label: 'Öğrenciler', icon: 'users' },
  { id: 'odevler', label: 'Ödevler', icon: 'book' },
  { id: 'takvim', label: 'Takvim', icon: 'cal' },
  { id: 'denemeler', label: 'Denemeler', icon: 'doc' },
  { id: 'siniflar', label: 'Sınıflar', icon: 'grid' },
]
// Duyurular ve iletişim (mesajlaşma) ayrı sayfalar; eski /iletisim?sekme=duyurular bağlantıları /duyurular'a yönlenir.
const DUYURULAR: NavItem = { id: 'duyurular', label: 'Duyurular', icon: 'mega' }
const ILETISIM: NavItem = { id: 'iletisim', label: 'İletişim', icon: 'chat' }
const PANEL: NavItem = { id: 'panel', label: 'Ana sayfa', icon: 'home' }
const FAMILY: NavItem[] = [
  PANEL,
  { id: 'ozet', label: 'LGS özeti', icon: 'spark' },
  { id: 'okul', label: 'Okul', icon: 'grid' },
  { id: 'odevler', label: 'Ödevler', icon: 'book' },
  { id: 'takvim', label: 'Takvim', icon: 'cal' },
  DUYURULAR,
  ILETISIM,
  { id: 'gorevler', label: 'Görevler', icon: 'task' },
  { id: 'raporlar', label: 'Raporlar', icon: 'doc' },
  { id: 'gorusmeler', label: 'Görüşmeler', icon: 'cal' },
]

/** Rol bazlı menü — prototipteki navItems() ile aynı. Yetki ayrıca veritabanında (RLS) zorlanır. */
function navFor(r: Role): NavItem[] {
  if (r === 'admin') return [...STAFF, DUYURULAR, ILETISIM, { id: 'yonetim', label: 'Yönetim', icon: 'pen' }, { id: 'onaylar', label: 'Onaylar', icon: 'shield' }]
  if (r === 'rehber') return [...STAFF, DUYURULAR, ILETISIM]
  if (r === 'brans') return [PANEL, STAFF[1]!, STAFF[2]!, STAFF[3]!, DUYURULAR, ILETISIM]
  if (r === 'ogrenci') return FAMILY.filter((n) => n.id !== 'iletisim') // öğrenci mesajlaşmaz; duyuruları görür
  return FAMILY
}

/** Modüller (Yönetim → Modüller). Kapalı modülün sayfası menüden kalkar; veri erişimi veritabanında da kapanır (0011). */
export type ModuleId = 'lgs' | 'yoklama' | 'ders_programi' | 'yemek' | 'duyuru' | 'mesaj' | 'odev' | 'takvim' | 'bursluluk'
export type Modules = Record<ModuleId, boolean>
export const MODULE_DEFAULTS: Modules = { lgs: true, yoklama: true, ders_programi: true, yemek: true, duyuru: true, mesaj: true, odev: true, takvim: true, bursluluk: false }

/** Sayfanın bağlı olduğu modüller: hepsi kapalıysa sayfa menüden kalkar. */
const PAGE_MODULES: Partial<Record<PageId, ModuleId[]>> = {
  denemeler: ['lgs'],
  siniflar: ['lgs'],
  odevler: ['odev'],
  takvim: ['takvim'],
  raporlar: ['lgs'],
  okul: ['yoklama', 'ders_programi', 'yemek'],
  duyurular: ['duyuru'],
  iletisim: ['mesaj'],
}

/**
 * fam.lgs: veli/öğrenci için LGS'ye uygun (8. sınıf) çocuk var mı. Yoksa ya da LGS modülü kapalıysa sayfa "Özet" adını alır
 * ve LGS bölümü gösterilmez; görevler, görüşmeler, raporlar, öğretmen notları ve etütler herkes için kalır.
 */
export function navItems(r: Role, mods: Modules = MODULE_DEFAULTS, fam: { lgs: boolean } = { lgs: true }): NavItem[] {
  return navFor(r)
    .filter((n) => !PAGE_MODULES[n.id] || PAGE_MODULES[n.id]!.some((m) => mods[m]))
    .map((n) => (n.id === 'ozet' && !(fam.lgs && mods.lgs) ? { ...n, label: 'Özet' } : n))
}

export const ROLE_HINT: Record<Role, string> = {
  admin: 'Tam yetki: okul yönetimi ve kayıt onayları.',
  rehber: 'Tam yetki: görev, görüşme, rapor.',
  brans: 'Öğrencileri görüntüleyebilir ve not ekleyebilirsin.',
  veli: 'Yalnızca kendi bilgilerini görürsün.',
  ogrenci: 'Yalnızca kendi bilgilerini görürsün.',
}
