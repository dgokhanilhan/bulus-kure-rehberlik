// Etkinlik günlüğü (0100): saf yardımcılar (etiketler, yol, cihaz, tarih). Veri ve kayıt tutucu etkinlik.ts'de.

export type Cihaz = 'telefon' | 'tablet' | 'bilgisayar'

/** Dokunmatik değilse bilgisayar; dokunmatikte kısa kenar 600px altıysa telefon, değilse tablet. */
export function cihazTuru(kisaKenar: number, dokunmatik: boolean): Cihaz {
  if (!dokunmatik) return 'bilgisayar'
  return kisaKenar < 600 ? 'telefon' : 'tablet'
}
export const CIHAZ_TR: Record<Cihaz, string> = { telefon: 'Telefon', tablet: 'Tablet', bilgisayar: 'Bilgisayar' }

/** Kayda girecek yol: sorgu ve # atılır; yalnız küçük harf, rakam, / ve - (sunucu da aynı kuralı uygular). Uymuyorsa null. */
export function kayitYolu(yol: string): string | null {
  const p = (yol.split(/[?#]/)[0] ?? '').toLowerCase().replace(/\/+$/, '') || '/'
  return /^\/[a-z0-9/-]{0,79}$/.test(p) ? p : null
}

const SAYFA_TR: Record<string, string> = {
  '/': 'Ana sayfa',
  '/bugun': 'Bugün',
  '/panel': 'Ana sayfa',
  '/ogrenciler': 'Öğrenciler',
  '/ogretmenler-odasi': 'Öğretmenler Odası',
  '/odevler': 'Ödevler',
  '/takvim': 'Takvim',
  '/nobet-takip': 'Nöbet Takip',
  '/galeri': 'Galeri',
  '/denemeler': 'Denemeler',
  '/siniflar': 'Sınıflar',
  '/etut': 'Etüt',
  '/duyurular': 'Duyurular',
  '/iletisim': 'İletişim',
  '/yonetim': 'Yönetim',
  '/gozetmen': 'Gözetmen Bul',
  '/onaylar': 'Onaylar',
  '/ozet': 'LGS özeti',
  '/okul': 'Okul',
  '/hedefim': 'Hedefim',
  '/gorevler': 'Görevler',
  '/raporlar': 'Raporlar',
  '/gorusmeler': 'Görüşmeler',
  '/bildirimler': 'Bildirimler',
  '/hesap-ayarlari': 'Hesap ayarları',
  '/ayarlar': 'Okul ayarları',
  '/etkinlik': 'Etkinlik günlüğü',
}
/** Sayfa yolunun Türkçe adı. Öğrenci dosyasında öğrencinin adı sunucudan gelir. */
export function sayfaAdi(yol: string | null, ogrenci?: string | null): string {
  if (!yol) return 'Sayfa'
  if (/^\/ogrenciler\/[0-9a-f-]{36}$/.test(yol)) return ogrenci ? `Öğrenci dosyası · ${ogrenci}` : 'Öğrenci dosyası'
  return SAYFA_TR[yol] ?? yol
}

export type IslemTuru =
  | 'gorev_verdi' | 'gorev_tamamladi' | 'gorusme' | 'not' | 'rapor_gonderdi' | 'odev_verdi' | 'odev_kontrol' | 'duyuru' | 'mesaj'
  | 'yoklama' | 'takvim' | 'deneme_yayin' | 'gunluk_kontrol' | 'soru_sordu' | 'soru_yanit' | 'galeri' | 'oda_mesaj' | 'calisma'
  | 'gor_rehber_notu' | 'gor_rapor' | 'etkinlik_gunlugu' | 'yonetim' | 'oyun'

const sayili = (n: number, tek: string, cok: (n: number) => string) => (n > 1 ? cok(n) : tek)
/** Yapılan işin metni. İçerik yok; yalnız türü ve sayısı. */
export function islemMetni(tur: string, adet: number): string {
  const n = Math.max(1, adet)
  switch (tur as IslemTuru) {
    case 'gorev_verdi': return sayili(n, 'Görev verdi', (k) => `${k} görev verdi`)
    case 'gorev_tamamladi': return sayili(n, 'Bir görevi tamamladı', (k) => `${k} görevi tamamladı`)
    case 'gorusme': return sayili(n, 'Görüşme kaydı ekledi', (k) => `${k} görüşme kaydı ekledi`)
    case 'not': return sayili(n, 'Not ekledi', (k) => `${k} not ekledi`)
    case 'rapor_gonderdi': return sayili(n, 'Rapor gönderdi', (k) => `${k} rapor gönderdi`)
    case 'odev_verdi': return sayili(n, 'Ödev verdi', (k) => `${k} ödev verdi`)
    case 'odev_kontrol': return sayili(n, 'Bir öğrencinin ödevini kontrol etti', (k) => `${k} öğrencinin ödevini kontrol etti`)
    case 'duyuru': return sayili(n, 'Duyuru yayınladı', (k) => `${k} duyuru yayınladı`)
    case 'mesaj': return sayili(n, 'Mesaj gönderdi', (k) => `${k} mesaj gönderdi`)
    case 'yoklama': return `Yoklama aldı (${n} öğrenci)`
    case 'takvim': return sayili(n, 'Takvime etkinlik ekledi', (k) => `Takvime ${k} etkinlik ekledi`)
    case 'deneme_yayin': return 'Deneme sonucunu yayınladı'
    case 'gunluk_kontrol': return sayili(n, 'Günlük kontrol kaydı girdi', (k) => `${k} günlük kontrol kaydı girdi`)
    case 'soru_sordu': return sayili(n, 'Soru sordu', (k) => `${k} soru sordu`)
    case 'soru_yanit': return sayili(n, 'Bir soruyu yanıtladı', (k) => `${k} soruyu yanıtladı`)
    case 'galeri': return sayili(n, 'Galeriye dosya yükledi', (k) => `Galeriye ${k} dosya yükledi`)
    case 'oda_mesaj': return sayili(n, 'Öğretmenler Odası’na yazdı', (k) => `Öğretmenler Odası’na ${k} mesaj yazdı`)
    case 'calisma': return 'Çalışma oturumu ekledi'
    case 'oyun': return sayili(n, 'Öğretmenler Odası’nda oyun oynadı', (k) => `Öğretmenler Odası’nda ${k} oyun oynadı`)
    case 'gor_rehber_notu': return 'Rehberlik notlarını görüntüledi'
    case 'gor_rapor': return 'Bir raporu görüntüledi'
    case 'etkinlik_gunlugu': return 'Etkinlik günlüğünü açtı'
    default: return sayili(n, 'Yönetim işlemi yaptı', (k) => `${k} yönetim işlemi yaptı`)
  }
}

/** Dökümde iş dışındaki satırlar: uygulama açılışı, şifreyle giriş, oturum yenilemesi. Diğerleri null. */
export function girisMetni(tur: string, cihaz: Cihaz | null): string | null {
  if (tur === 'giris') return `Uygulamayı açtı${cihaz ? ` (${CIHAZ_TR[cihaz].toLocaleLowerCase('tr-TR')})` : ''}`
  if (tur === 'sifre_giris') return 'Şifreyle giriş yaptı'
  if (tur === 'oturum') return 'Uygulama açıktı (oturum yenilendi)'
  return null
}
/** Son görülme metni: bugün/dün ise saatle, değilse tarih ve saatle; hiç yoksa "Hiç girmedi". */
export function sonGorulmeMetni(ts: string | null, now = new Date()): string {
  if (!ts) return 'Hiç girmedi'
  const g = bugunIst(new Date(ts))
  const b = bugunIst(now)
  const saat = saatIst(ts)
  if (g === b) return `Son görülme bugün ${saat}`
  if (g === gunKaydir(b, -1)) return `Son görülme dün ${saat}`
  const t = new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', day: 'numeric', month: 'short' }).format(new Date(ts))
  return `Son görülme ${t} ${saat}`
}

/** Ekrandaki rol adı ve süzme anahtarı: rehberlik branşlı öğretmen ayrı. */
export function rolAnahtari(rol: string): 'admin' | 'ogretmen' | 'veli' | 'ogrenci' {
  if (rol === 'admin') return 'admin'
  if (rol === 'ogretmen') return 'ogretmen'
  return rol === 'veli' ? 'veli' : 'ogrenci'
}
export function rolMetni(rol: string, brans: string | null): string {
  if (rol === 'admin') return 'Yönetici'
  if (rol === 'ogretmen') return brans === 'Rehberlik' ? 'Rehber öğretmen' : brans ? `Öğretmen · ${brans}` : 'Öğretmen'
  return rol === 'veli' ? 'Veli' : 'Öğrenci'
}

/** Seçili günün (İstanbul saati) bir önceki / sonraki günü, YYYY-MM-DD. */
export function gunKaydir(gun: string, fark: number): string {
  const d = new Date(`${gun}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + fark)
  return d.toISOString().slice(0, 10)
}
/** İstanbul saatiyle bugün. */
export function bugunIst(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}
/** İstanbul saatiyle SS:DD. */
export function saatIst(ts: string): string {
  return new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', hour: '2-digit', minute: '2-digit' }).format(new Date(ts))
}
