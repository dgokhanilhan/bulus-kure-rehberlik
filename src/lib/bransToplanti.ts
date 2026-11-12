// Branş veli toplantısı: öğretmenin kendi dersi için öğrenci özeti (ödev, deneme, etüt, devamsızlık) ve derse özel gözlem formu.
// Form toplantı sonunda veliye teslim edilir: dil "siz", etiketleyici ifade yok, sınıf sıralaması / sınıf ortalaması yok
// (CLAUDE.md kural 3 ve 8). Deneme az olan sınıf düzeylerinde (5., 9. …) ağırlık ders içi gözlem ve ödevdedir.
// Saf fonksiyonlar: sayılar mevcut kayıtlardan okunur, hiçbir şey tahmin edilmez (kural 1).
import { indexResults, repeats, type Dataset, type Subject } from './analiz'
import { bransUyar } from './etutGrup'

export type Soru =
  | { k: string; tur: 'uclu'; metin: string }
  | { k: string; tur: 'secim'; metin: string; secenekler: readonly (readonly [string, string])[] }
  | { k: string; tur: 'yazi'; metin: string; satir: number }

export const UCLU: readonly (readonly [string, string])[] = [
  ['evet', 'Evet'],
  ['kismen', 'Kısmen'],
  ['hayir', 'Henüz değil'],
]

const u = (k: string, metin: string): Soru => ({ k, tur: 'uclu', metin })
const s = (k: string, metin: string, secenekler: [string, string][]): Soru => ({ k, tur: 'secim', metin, secenekler })
const y = (k: string, metin: string, satir = 2): Soru => ({ k, tur: 'yazi', metin, satir })

const HATA: [string, string][] = [
  ['islem', 'İşlem / dikkat'],
  ['konu', 'Konu eksiği'],
  ['okuma', 'Soruyu yanlış okuma'],
  ['sure', 'Süre'],
]

/** Ders içi performans: bütün derslerde sorulur. Anahtarlar veritabanında saklanır; metin değişebilir, anahtar değişmemeli. */
export const DERS_ICI: Soru[] = [
  u('katilim', 'Derse etkin katılıyor (söz alıyor, soru soruyor)'),
  u('dikkat', 'Ders boyunca dikkatini sürdürüyor'),
  u('hazirlik', 'Derse hazırlıklı ve araç gereçleriyle geliyor'),
  u('odev', 'Ödevlerini zamanında ve özenle yapıyor'),
  u('defter', 'Defterini / ders notlarını düzenli tutuyor'),
  u('soru_sorma', 'Anlamadığı yeri sormaktan çekinmiyor'),
  u('tekrar', 'Evde tekrar yaptığı derse yansıyor'),
  s('tempo', 'Dersin temposuna uyumu', [
    ['rahat', 'Rahat takip ediyor'],
    ['destekle', 'Destekle takip ediyor'],
    ['ek', 'Ek çalışmayla güçlenecek'],
  ]),
  s('gidisat', 'Dönem içindeki gidişatı', [
    ['yukseliyor', 'Yükseliyor'],
    ['dengeli', 'Dengeli'],
    ['destek', 'Desteklenmeli'],
  ]),
]

export type DersGrubu = 'matematik' | 'turkce' | 'fen' | 'sosyal' | 'dil' | 'diger'
export const GRUP_BASLIK: Record<DersGrubu, string> = {
  matematik: 'Matematik',
  turkce: 'Türkçe',
  fen: 'Fen',
  sosyal: 'Sosyal alan',
  dil: 'Yabancı dil',
  diger: 'Derse özel',
}

export const DERSE_OZEL: Record<DersGrubu, Soru[]> = {
  matematik: [
    u('m_islem', 'İşlemlerde dikkatli; işlem hatası az'),
    u('m_problem', 'Problemi okuyup verilenleri ve isteneni ayırabiliyor'),
    u('m_adim', 'Çözümünü adım adım yazıyor'),
    u('m_yeni_nesil', 'Yorum gerektiren (yeni nesil) sorularda çözüm yolu kurabiliyor'),
    s('m_hata', 'Yanlışların kaynağı çoğunlukla', HATA),
    s('m_gunluk', 'Önerilen günlük soru sayısı', [
      ['10', '10–20'],
      ['20', '20–40'],
      ['40', '40 ve üzeri'],
    ]),
  ],
  turkce: [
    u('t_kitap', 'Düzenli kitap okuyor'),
    u('t_anlama', 'Okuduğunu anlama ve yorumlama sorularında rahat'),
    u('t_yazim', 'Yazım ve noktalama kurallarına dikkat ediyor'),
    u('t_ifade', 'Düşüncesini yazılı ve sözlü olarak açık ifade ediyor'),
    s('t_sure', 'Paragraf sorularında süre', [
      ['yetiyor', 'Yetiyor'],
      ['sinirda', 'Sınırda'],
      ['yetmiyor', 'Henüz yetmiyor'],
    ]),
    y('t_kitaplar', 'Okuduğu / önerilen kitaplar', 2),
  ],
  fen: [
    u('f_kavram', 'Kavramları günlük hayatla ilişkilendirebiliyor'),
    u('f_deney', 'Deney ve etkinliklere istekli katılıyor'),
    u('f_grafik', 'Grafik, tablo ve şekil yorumlayabiliyor'),
    u('f_islem', 'İşlem gerektiren sorularda birimlere ve bağıntıya dikkat ediyor'),
    s('f_hata', 'Yanlışların kaynağı çoğunlukla', HATA),
  ],
  sosyal: [
    u('s_neden', 'Olayları neden–sonuç ilişkisiyle açıklayabiliyor'),
    u('s_gorsel', 'Harita, görsel ve tablo yorumlayabiliyor'),
    u('s_kavram', 'Dersin kavramlarını yerinde kullanıyor'),
    u('s_ozet', 'Kendi özetini / notunu çıkarıyor'),
    s('s_tekrar', 'Bilgiyi kalıcı kılmak için tekrar düzeni', [
      ['duzenli', 'Düzenli'],
      ['sinav_oncesi', 'Sınav öncesinde'],
      ['kurulacak', 'Birlikte kuracağız'],
    ]),
  ],
  dil: [
    u('d_kelime', 'Kelime çalışmasını düzenli yapıyor'),
    u('d_konusma', 'Derste yabancı dilde konuşmaya istekli'),
    u('d_dinleme', 'Dinlediğini anlıyor'),
    u('d_okuma', 'Okuduğu metni anlıyor'),
    u('d_yazma', 'Kısa metin yazabiliyor'),
    s('d_disarida', 'Ders dışında dille karşılaşma (kitap, dizi, şarkı)', [
      ['duzenli', 'Düzenli'],
      ['ara_sira', 'Ara sıra'],
      ['baslanacak', 'Başlaması önerilir'],
    ]),
  ],
  diger: [
    u('g_istek', 'Etkinliklere istekli katılıyor'),
    u('g_kurallar', 'Dersin kurallarına ve arkadaşlarına özen gösteriyor'),
    u('g_beceri', 'Dersin gerektirdiği becerilerde ilerliyor'),
    y('g_ilgi', 'Öne çıkan ilgi / yeteneği', 2),
  ],
}

/** Veliye teslim edilen formun yazı alanları (her derste). */
export const YAZI: Soru[] = [
  y('guclu', 'Güçlü yönleri', 2),
  y('gelisim', 'Birlikte geliştireceğimiz alanlar', 2),
  y('evde', 'Evde yapmanızı önerdiklerimiz', 3),
  y('veli', 'Velinin görüşü / isteği', 2),
]

const fold = (x: string) => x.toLocaleLowerCase('tr')
/** Ders adından soru grubu (ör. "Fen Bilimleri", "Fizik" → fen; "T.C. İnkılap Tarihi" → sosyal). */
export function dersGrubu(ders: string): DersGrubu {
  const d = fold(ders)
  const var_ = (...k: string[]) => k.some((x) => d.includes(x))
  if (var_('matematik', 'geometri')) return 'matematik'
  if (var_('türkçe', 'edebiyat')) return 'turkce'
  if (var_('fen', 'fizik', 'kimya', 'biyoloji')) return 'fen'
  if (var_('ingilizce', 'almanca', 'fransızca', 'yabancı dil')) return 'dil'
  if (var_('sosyal', 'inkılap', 'tarih', 'coğrafya', 'felsefe', 'din', 'hayat bilgisi')) return 'sosyal'
  return 'diger'
}
/** Bir dersin bütün soruları: ders içi + derse özel + yazı alanları (sıra = formdaki sıra). */
export function bransSorulari(ders: string): { dersIci: Soru[]; ozel: Soru[]; yazi: Soru[]; grup: DersGrubu } {
  const grup = dersGrubu(ders)
  return { dersIci: DERS_ICI, ozel: DERSE_OZEL[grup], yazi: YAZI, grup }
}
export const tumSorular = (ders: string): Soru[] => {
  const b = bransSorulari(ders)
  return [...b.dersIci, ...b.ozel, ...b.yazi]
}
/** Geçerli cevap mı (bilinmeyen anahtar / seçenek kaydedilmez). */
export function cevapTemizle(ders: string, c: Record<string, string | undefined>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const q of tumSorular(ders)) {
    const v = c[q.k]?.trim()
    if (!v) continue
    if (q.tur === 'yazi') out[q.k] = v.slice(0, 600)
    else if ((q.tur === 'uclu' ? UCLU : q.secenekler).some(([k]) => k === v)) out[q.k] = v
  }
  return out
}
/** Formda en az bir alan dolu mu. */
export const formDolu = (c: Record<string, string | undefined> | null | undefined) => !!c && Object.values(c).some((v) => !!v?.trim())

// ---------- Öğrencinin bu dersteki özeti ----------
export type OdevDurumu = 'bekliyor' | 'yapti' | 'yapmadi' | 'getirmedi' | 'eksik' | 'gelmedi' | 'izinli'
export interface DersOdevi {
  baslik: string
  verilis: string
  teslim: string | null
  durum: OdevDurumu
}
export interface OdevOzeti {
  /** Kontrol edilen ödev sayısı (bekleyen, izinli ve o gün gelmediği ödevler sayılmaz) */
  kontrol: number
  tam: number
  eksik: number
  yapilmadi: number
  bekleyen: number
  /** Tam yapılanların kontrol edilenlere oranı (0–100); kontrol yoksa null */
  oran: number | null
  /** Son ödevler, yeni olan önce */
  son: DersOdevi[]
}
export const ODEV_TR: Record<OdevDurumu, string> = {
  bekliyor: 'Kontrol bekliyor',
  yapti: 'Tam',
  eksik: 'Eksik',
  yapmadi: 'Yapılmadı',
  getirmedi: 'Getirilmedi',
  gelmedi: 'Okulda değildi',
  izinli: 'İzinli',
}
export function odevOzeti(odevler: DersOdevi[], sonKac = 6): OdevOzeti {
  const kontrol = odevler.filter((o) => o.durum !== 'bekliyor' && o.durum !== 'izinli' && o.durum !== 'gelmedi')
  const tam = kontrol.filter((o) => o.durum === 'yapti').length
  const eksik = kontrol.filter((o) => o.durum === 'eksik').length
  return {
    kontrol: kontrol.length,
    tam,
    eksik,
    yapilmadi: kontrol.length - tam - eksik,
    bekleyen: odevler.filter((o) => o.durum === 'bekliyor').length,
    oran: kontrol.length ? Math.round((tam / kontrol.length) * 100) : null,
    son: [...odevler].sort((a, b) => b.verilis.localeCompare(a.verilis)).slice(0, sonKac),
  }
}
/** Ödev özeti tek cümle (veliye okunabilir). */
export function odevCumlesi(o: OdevOzeti): string {
  if (!o.kontrol) return o.bekleyen ? `Bu derste ${o.bekleyen} ödev verildi; henüz kontrol edilmedi.` : 'Bu derste sistemde kayıtlı ödev yok.'
  const parca = [`${o.tam} tam`, o.eksik ? `${o.eksik} eksik` : '', o.yapilmadi ? `${o.yapilmadi} yapılmadı` : ''].filter(Boolean).join(', ')
  return `Kontrol edilen ${o.kontrol} ödevin ${parca} (%${o.oran} tam).`
}

export interface DersDenemesi {
  ad: string
  tarih: string
  net: number
  /** Dersin soru sayısı (0 = bilinmiyor) */
  soru: number
  /** Bir önceki girdiği denemeye göre net farkı */
  degisim: number | null
}
export interface DenemeOzeti {
  denemeler: DersDenemesi[]
  /** İlk denemeden son denemeye net farkı (en az iki deneme) */
  egilim: number | null
  /** Birden çok denemede yanlış yapılan konular (yoksa boş) */
  konular: { baslik: string; kez: number }[]
}
/** Öğrencinin bu dersteki deneme sonuçları. Dersin denemede karşılığı yoksa ya da öğrenci hiç girmediyse denemeler boş. */
export function denemeOzeti(ds: Dataset | null | undefined, sid: string, codes: readonly Subject[], konuKac = 5): DenemeOzeti {
  if (!ds || !codes.length) return { denemeler: [], egilim: null, konular: [] }
  const idx = indexResults(ds.results)
  const soru = ds.subjects.filter((x) => codes.includes(x.code)).reduce((a, x) => a + x.q, 0)
  const denemeler: DersDenemesi[] = []
  for (const e of ds.exams) {
    const r = idx.get(`${e.id}|${sid}`)
    const ns = codes.flatMap((c) => (typeof r?.subjects[c]?.net === 'number' ? [r.subjects[c]!.net] : []))
    if (!ns.length) continue
    const net = ns.reduce((a, b) => a + b, 0)
    denemeler.push({ ad: e.name, tarih: e.exam_date, net, soru, degisim: denemeler.length ? net - denemeler.at(-1)!.net : null })
  }
  const set = new Set(codes)
  const konular = denemeler.length
    ? repeats(ds, sid, undefined, idx)
        .filter((x) => set.has(x.outcome.subject))
        .slice(0, konuKac)
        .map((x) => ({ baslik: x.outcome.title, kez: x.count }))
    : []
  return { denemeler, egilim: denemeler.length > 1 ? denemeler.at(-1)!.net - denemeler[0]!.net : null, konular }
}

/** Seçilebilir dersler: öğretmenin branşına uyanlar önce (ilk sıradaki varsayılan). */
export function dersSirala<T extends { name: string }>(dersler: T[], brans: string | null | undefined): T[] {
  const benim = dersler.filter((d) => bransUyar(d.name, brans))
  return [...benim, ...dersler.filter((d) => !benim.includes(d))]
}
