// Hazır profil avatarları (0083). Uygulamanın kendi listesi: hayvan ve nesne simgeleri (telifli çizgi film/film karakteri yok).
// Kimlik veritabanında saklanır; listede olmayan kimlik baş harflere döner.
export interface AvatarTanim {
  id: string
  simge: string
  ad: string
  renk: string
}
export const AVATARLAR: AvatarTanim[] = [
  { id: 'tilki', simge: '🦊', ad: 'Tilki', renk: '#ffd8b8' },
  { id: 'panda', simge: '🐼', ad: 'Panda', renk: '#e3e7ea' },
  { id: 'aslan', simge: '🦁', ad: 'Aslan', renk: '#ffe4a3' },
  { id: 'kaplan', simge: '🐯', ad: 'Kaplan', renk: '#ffd6a0' },
  { id: 'koala', simge: '🐨', ad: 'Koala', renk: '#d9e2ec' },
  { id: 'kurbaga', simge: '🐸', ad: 'Kurbağa', renk: '#cdeec3' },
  { id: 'baykus', simge: '🦉', ad: 'Baykuş', renk: '#e6d5c3' },
  { id: 'penguen', simge: '🐧', ad: 'Penguen', renk: '#cfe3f5' },
  { id: 'yunus', simge: '🐬', ad: 'Yunus', renk: '#c4e8f2' },
  { id: 'unikorn', simge: '🦄', ad: 'Tek boynuzlu at', renk: '#f1d4f0' },
  { id: 'ari', simge: '🐝', ad: 'Arı', renk: '#fff0a8' },
  { id: 'kaplumbaga', simge: '🐢', ad: 'Kaplumbağa', renk: '#d4ecc8' },
  { id: 'kedi', simge: '🐱', ad: 'Kedi', renk: '#ffe1c7' },
  { id: 'kopek', simge: '🐶', ad: 'Köpek', renk: '#ecdcc8' },
  { id: 'roket', simge: '🚀', ad: 'Roket', renk: '#d7dcf7' },
  { id: 'kitap', simge: '📚', ad: 'Kitaplar', renk: '#f6dccf' },
  { id: 'palet', simge: '🎨', ad: 'Palet', renk: '#f7d9e3' },
  { id: 'top', simge: '⚽', ad: 'Futbol topu', renk: '#dcefd9' },
  { id: 'gitar', simge: '🎸', ad: 'Gitar', renk: '#f3d6c6' },
  { id: 'aycicegi', simge: '🌻', ad: 'Ayçiçeği', renk: '#fff2b3' },
  { id: 'teleskop', simge: '🔭', ad: 'Teleskop', renk: '#d6def0' },
  { id: 'atom', simge: '⚛️', ad: 'Atom', renk: '#d3eef4' },
  { id: 'yildiz', simge: '⭐', ad: 'Yıldız', renk: '#fff0b8' },
  { id: 'kahve', simge: '☕', ad: 'Kahve', renk: '#ead9c9' },
]
export const avatarBul = (id: string | null | undefined) => (id ? (AVATARLAR.find((a) => a.id === id) ?? null) : null)
