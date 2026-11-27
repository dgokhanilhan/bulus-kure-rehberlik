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
  let p = (yol.split(/[?#]/)[0] ?? '').toLowerCase().replace(/\/+$/, '') || '/'
  // Tahta onay ve veli davet bağlantılarındaki kod kayda geçmez
  if (/^\/(t|v)\//.test(p)) p = p.slice(0, 2)
  return /^\/[a-z0-9/-]{0,79}$/.test(p) ? p : null
}

const SAYFA_TR: Record<string, string> = {
  '/': 'Ana sayfa',
  '/bugun': 'Bugün',
  '/t': 'Tahta yoklaması onayı',
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
    default: return tur.startsWith('y:') ? kayitIslemMetni(tur.slice(2), n) : sayili(n, 'Yönetim işlemi yaptı', (k) => `${k} yönetim işlemi yaptı`)
  }
}

// İşlem kaydındaki (audit_log, 0104) işlerin metni: 'action/entity' → [tek, çok]. İçerik yok; yalnız tür ve sayı.
type Kalip = [string, (k: number) => string]
const sabit = (m: string): Kalip => [m, (k) => `${m} (${k})`]
const KAYIT_ISLEM: Record<string, Kalip> = {
  'insert/timetable': ['Ders programına ders ekledi', (k) => `Ders programına ${k} ders ekledi`],
  'update/timetable': ['Ders programında değişiklik yaptı', (k) => `Ders programında ${k} değişiklik yaptı`],
  'delete/timetable': ['Ders programından ders sildi', (k) => `Ders programından ${k} ders sildi`],
  'outcome_match/exams': sabit('Denemede kazanım eşleştirmesi yaptı'),
  'pdf_outcome_add/exams': sabit('Deneme PDF’inden kazanım ekledi'),
  'import/exams': ['Deneme sonucu yükledi', (k) => `${k} deneme sonucu yükledi`],
  'publish/exams': sabit('Deneme sonucunu yayınladı'),
  'delete/exams': ['Bir denemeyi sildi', (k) => `${k} denemeyi sildi`],
  'repair_pdf/exams': sabit('Deneme PDF’ini onardı'),
  'lgs_unresolved_items/exams': sabit('Denemede okunamayan soruları düzeltti'),
  'hide_topics/exams': sabit('Denemede konuları gizledi'),
  'show_topics/exams': sabit('Denemede konuları gösterdi'),
  'insert/yaklasan_denemeler': sabit('Yaklaşan deneme ekledi'),
  'update/yaklasan_denemeler': sabit('Yaklaşan denemeyi düzenledi'),
  'delete/yaklasan_denemeler': sabit('Yaklaşan denemeyi sildi'),
  'insert/students': ['Öğrenci ekledi', (k) => `${k} öğrenci ekledi`],
  'update/students': ['Öğrenci bilgisini güncelledi', (k) => `${k} öğrenci bilgisini güncelledi`],
  'delete/students': ['Öğrenci kaydını kaldırdı', (k) => `${k} öğrenci kaydını kaldırdı`],
  'merge/students': sabit('İki öğrenci kaydını birleştirdi'),
  'insert/teaching_assignments': ['Ders–öğretmen ataması ekledi', (k) => `${k} ders–öğretmen ataması ekledi`],
  'delete/teaching_assignments': ['Ders–öğretmen atamasını kaldırdı', (k) => `${k} ders–öğretmen atamasını kaldırdı`],
  'insert/classes': sabit('Sınıf ekledi'),
  'update/classes': sabit('Sınıf bilgisini düzenledi'),
  'delete/classes': sabit('Sınıf sildi'),
  'insert/courses': ['Ders ekledi', (k) => `${k} ders ekledi`],
  'update/courses': sabit('Ders bilgisini düzenledi'),
  'approve/profiles': ['Bir hesabı onayladı', (k) => `${k} hesabı onayladı`],
  'reject/profiles': ['Bir kaydı reddetti', (k) => `${k} kaydı reddetti`],
  'rejected_signup_removed/profiles': sabit('Reddedilen kaydı kaldırdı'),
  'update/profiles': sabit('Hesap bilgisini düzenledi'),
  'deactivate/profiles': sabit('Bir hesabı pasifleştirdi'),
  'activate/profiles': sabit('Bir hesabı yeniden açtı'),
  'role_add/profiles': sabit('Bir hesaba rol ekledi'),
  'role_remove/profiles': sabit('Bir hesaptan rol kaldırdı'),
  'account_delete/profiles': sabit('Bir hesabı sildi'),
  'email_change/profiles': sabit('E-posta adresini değiştirdi'),
  'acik_riza/profiles': sabit('Açık rıza metnini onayladı'),
  'parent_link_add/parent_links': ['Veli bağladı', (k) => `${k} veli bağladı`],
  'parent_link_remove/parent_links': sabit('Veli bağlantısını kaldırdı'),
  'veli_davet/veli_davet': sabit('Veli davet kodu hazırladı'),
  'send_report/reports': ['Rapor gönderdi', (k) => `${k} rapor gönderdi`],
  'media_upload/gallery_media': ['Galeriye dosya yükledi', (k) => `Galeriye ${k} dosya yükledi`],
  'media_delete/gallery_media': ['Galeriden dosya sildi', (k) => `Galeriden ${k} dosya sildi`],
  'album_create/gallery_albums': sabit('Galeride albüm açtı'),
  'album_update/gallery_albums': sabit('Galeride albümü düzenledi'),
  'album_delete/gallery_albums': sabit('Galeride albüm sildi'),
  'album_publish/gallery_albums': sabit('Galeride albüm yayınladı'),
  'album_archive/gallery_albums': sabit('Galeride albümü arşivledi'),
  'insert/calendar_events': ['Takvime etkinlik ekledi', (k) => `Takvime ${k} etkinlik ekledi`],
  'update/calendar_events': sabit('Takvimde etkinliği düzenledi'),
  'delete/calendar_events': sabit('Takvimden etkinlik sildi'),
  'insert/announcements': sabit('Duyuru yayınladı'),
  'delete/announcements': sabit('Duyuru sildi'),
  'insert/homework': ['Ödev verdi', (k) => `${k} ödev verdi`],
  'update/homework': sabit('Ödevi düzenledi'),
  'delete/homework': sabit('Ödev sildi'),
  'insert/attachments': ['Dosya ekledi', (k) => `${k} dosya ekledi`],
  'delete/attachments': ['Dosya sildi', (k) => `${k} dosya sildi`],
  'settings/school_settings': sabit('Okul ayarlarını değiştirdi'),
  'settings/schools': sabit('Okul bilgisini değiştirdi'),
  'module_toggle/school_settings': sabit('Bir modülü açıp kapattı'),
  'update/teacher_duties': sabit('Nöbet çizelgesini düzenledi'),
  'insert/teacher_duties': sabit('Nöbet çizelgesine ekleme yaptı'),
  'update/bell_times': sabit('Zil saatlerini düzenledi'),
  'insert/bell_times': sabit('Zil saati ekledi'),
  'list_export/school_list_documents': sabit('Liste belgesi indirdi'),
  'insert/acilis_pencereleri': sabit('Açılış penceresi ekledi'),
  'update/acilis_pencereleri': sabit('Açılış penceresini düzenledi'),
  'insert/scholarship_session_quotas': sabit('Bursluluk kontenjanı girdi'),
  'update/scholarship_applications': sabit('Bursluluk başvurusunu düzenledi'),
  'delete/scholarship_applications': sabit('Bursluluk başvurusunu sildi'),
  'insert/scholarship_exams': sabit('Bursluluk sınavı ekledi'),
  'update/scholarship_exams': sabit('Bursluluk sınavını düzenledi'),
  'delete/scholarship_exams': sabit('Bursluluk sınavını sildi'),
  'insert/scholarship_sessions': sabit('Bursluluk oturumu ekledi'),
  'update/scholarship_sessions': sabit('Bursluluk oturumunu düzenledi'),
  'etut_grup_ekle/etut_gunler': sabit('Etüt grubu ekledi'),
  'hedef_yukle/hedef_programlar': sabit('Hedef program listesi yükledi'),
  'update/school_roles': sabit('Okul görevlerini düzenledi'),
  'insert/academic_years': sabit('Yeni eğitim yılı açtı'),
  'update/ad_duzeltme': sabit('Ad düzeltmesi yaptı'),
}
/** İşlem kaydı türünün metni. Listede olmayan türde genel ama anlaşılır metin. */
function kayitIslemMetni(anahtar: string, n: number): string {
  const k = KAYIT_ISLEM[anahtar]
  if (k) return n > 1 ? k[1](n) : k[0]
  const islem = anahtar.split('/')[0]
  const genel = islem === 'insert' ? 'Kayıt ekledi' : islem === 'update' ? 'Kayıt düzenledi' : islem === 'delete' ? 'Kayıt sildi' : 'Yönetim işlemi yaptı'
  return n > 1 ? `${genel} (${n})` : genel
}

/** Dökümde iş dışındaki satırlar: uygulama açılışı, şifreyle giriş, oturum yenilemesi. Diğerleri null. */
export function girisMetni(tur: string, cihaz: Cihaz | null): string | null {
  if (tur === 'giris') return `Uygulamayı açtı${cihaz ? ` (${CIHAZ_TR[cihaz].toLocaleLowerCase('tr-TR')})` : ''}`
  if (tur === 'sifre_giris') return 'Şifreyle giriş yaptı'
  if (tur === 'oturum') return 'Uygulama açıktı'
  return null
}
/** Dökümde "Uygulama açıktı" (oturum yenilemesi) satırı, 10 dakika içinde kayıtlı bir açılış ya da sayfa varsa tekrar sayılır ve gizlenir. */
export function akisSadelestir<T extends { at: string; tur: string }>(olaylar: T[]): T[] {
  const kayitli = olaylar.filter((o) => o.tur === 'giris' || o.tur === 'sayfa').map((o) => new Date(o.at).getTime())
  return olaylar.filter((o) => o.tur !== 'oturum' || !kayitli.some((t) => Math.abs(t - new Date(o.at).getTime()) <= 10 * 60_000))
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
