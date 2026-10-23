// Cumartesi etüt programını görselden / Excel'den / PDF'ten içe aktarma (saf mantık). Okuma tarayıcıda yapılır (OCR, Excel,
// MuPDF); öğrenci adları hiçbir sunucuya ya da yapay zekâya gitmez. Belirsiz okuma uydurulmaz: önizlemede kullanıcıya sorulur.
import type { Saat } from './etut'

export interface Kelime {
  t: string
  x0: number
  y0: number
  x1: number
  y1: number
}
export interface HamTablo {
  saatler: Saat[] | null
  /** Excel'de tablonun üstündeki başlık (tarih, kademe) */
  baslik?: string
  satirlar: { ogretmen: string; hucreler: string[] }[] // 5 hücre
}

export const katla = (s: string) =>
  s
    .toLocaleLowerCase('tr')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ı/g, 'i')
    .trim()
const SAAT_ARALIK = /(\d{1,2})[.:,](\d{2})\s*[-–—]\s*(\d{1,2})[.:,](\d{2})/
const pad = (h: string, m: string) => `${h.padStart(2, '0')}:${m}`
export function saatAraligi(s: string): Saat | null {
  const m = s.match(SAAT_ARALIK)
  return m ? { bas: pad(m[1]!, m[2]!), bit: pad(m[3]!, m[4]!) } : null
}

// ---------- Kelimelerden (OCR / PDF) tablo ----------
interface Satir {
  y: number
  y0: number
  y1: number
  k: Kelime[]
}
function satirlar(ws: Kelime[]): Satir[] {
  const out: Satir[] = []
  for (const w of [...ws].sort((a, b) => (a.y0 + a.y1) / 2 - (b.y0 + b.y1) / 2)) {
    const cy = (w.y0 + w.y1) / 2
    const h = Math.max(4, w.y1 - w.y0)
    const s = out.find((r) => Math.abs(r.y - cy) < h * 0.6)
    if (s) {
      s.k.push(w)
      s.y0 = Math.min(s.y0, w.y0)
      s.y1 = Math.max(s.y1, w.y1)
    } else out.push({ y: cy, y0: w.y0, y1: w.y1, k: [w] })
  }
  for (const s of out) s.k.sort((a, b) => a.x0 - b.x0)
  return out.sort((a, b) => a.y - b.y)
}
const metin = (k: Kelime[]) => k.map((w) => w.t).join(' ')

/** Başlıktan 5 sütun: saat aralıkları (09:20-10:00) ya da "1. Ders" yazıları. */
function basliklar(ls: Satir[]): { merkez: number[]; saatler: Saat[] | null; altY: number } | null {
  for (const l of ls) {
    // Aynı satırdaki saat aralıklarını kelime kümelerinden bul
    const gruplar: { x: number; s: Saat }[] = []
    for (let i = 0; i < l.k.length; i++)
      for (let j = i; j < Math.min(l.k.length, i + 3); j++) {
        const parca = metin(l.k.slice(i, j + 1)).replace(/\s+/g, '')
        // Saat aralığı birleştirilen metnin başında olmalı ("ÖĞRETMEN09:20-10:00" sütun sayılmaz)
        const s = parca.match(SAAT_ARALIK)?.index === 0 ? saatAraligi(parca) : null
        if (s && !gruplar.some((g) => g.s.bas === s.bas)) {
          gruplar.push({ x: (l.k[i]!.x0 + l.k[j]!.x1) / 2, s })
          i = j
          break
        }
      }
    if (gruplar.length >= 5) {
      const g = gruplar.sort((a, b) => a.x - b.x).slice(0, 5)
      return { merkez: g.map((x) => x.x), saatler: g.map((x) => x.s), altY: l.y1 }
    }
    const ders = l.k.filter((w, i) => /^[1-5]\.?$/.test(w.t) && /^ders/i.test(katla(l.k[i + 1]?.t ?? '')))
    if (ders.length >= 5) {
      const merkez = ders.slice(0, 5).map((w) => (w.x0 + w.x1) / 2 + 12)
      // Saatler "1. Ders" satırının hemen altında olabilir; her saat en yakın sütuna yazılır (biri eksikse saat yok sayılır)
      const alt = ls.filter((x) => x.y > l.y && x.y - l.y < (l.y1 - l.y0) * 3)
      const saat: (Saat | null)[] = [null, null, null, null, null]
      let altY = l.y1
      for (const x of alt)
        for (const w of x.k) {
          const sa = saatAraligi(w.t.replace(/\s+/g, ''))
          if (!sa) continue
          const cx = (w.x0 + w.x1) / 2
          const i = merkez.reduce((bi, m, j) => (Math.abs(m - cx) < Math.abs(merkez[bi]! - cx) ? j : bi), 0)
          saat[i] = sa
          altY = Math.max(altY, x.y1)
        }
      return { merkez, saatler: saat.every(Boolean) ? (saat as Saat[]) : null, altY }
    }
  }
  return null
}

// Türkçe harflerde \b çalışmaz: harf olmayan sınırla (ayrıca g bayraklı tek nesne .test'te satır atlatır)
const ETIKET = '(?<![\\p{L}])(hocam?|hocası|öğretmeni?|ogretmeni?)(?![\\p{L}])'
const etiketVar = (s: string) => new RegExp(ETIKET, 'iu').test(s)
export const ogretmenAdi = (s: string) => s.replace(new RegExp(ETIKET, 'giu'), '').replace(/\s+/g, ' ').trim()

export interface Iskelet {
  saatler: Saat[] | null
  /** 5 ders sütunu [x0, x1] */
  kolonlar: [number, number][]
  satirlar: { ogretmen: string; y0: number; y1: number }[]
}
/**
 * OCR / PDF kelimelerinden tablonun iskeleti: öğretmen satırları (sol sütundaki "HOCA/Öğretmen" ya da bilinen öğretmen adı)
 * ve 5 ders sütunu (başlıktaki saatlerden / "1. Ders"ten; okunamazsa öğretmen sütununun sağı 5 eşit parçaya bölünür).
 */
export function tabloIskeleti(ws: Kelime[], ogretmenIlkAdlar: Set<string>): Iskelet {
  const temiz = ws.filter((w) => w.t.trim() && /[\p{L}\d]/u.test(w.t))
  const ls = satirlar(temiz)
  const b = basliklar(ls)
  const etiketli = (t: string) => etiketVar(t) || ogretmenIlkAdlar.has(katla(ogretmenAdi(t).split(' ')[0] ?? ''))
  // Öğretmen sütununun sağ kenarı: başlık varsa ilk ders sütununun solu, yoksa öğretmen etiketlerinin sağı
  let solKenar: number
  let kolonlar: [number, number][]
  let altY: number
  if (b) {
    const m = b.merkez
    const sinir = m.slice(1).map((x, i) => (x + m[i]!) / 2)
    const genis = m[1]! - m[0]!
    solKenar = m[0]! - genis / 2
    kolonlar = m.map((_, i) => [i === 0 ? solKenar : sinir[i - 1]!, i === 4 ? m[4]! + genis / 2 : sinir[i]!])
    altY = b.altY
  } else {
    const etiket = temiz.filter((w) => new RegExp(ETIKET, 'iu').test(w.t))
    if (etiket.length < 2) throw new Error('Tablo okunamadı: ne ders başlıkları ne de öğretmen adları bulundu. Daha net bir görsel dene ya da Excel kullan.')
    solKenar = Math.max(...etiket.map((w) => w.x1)) + 8
    altY = Math.min(...etiket.map((w) => w.y0)) - 12
    const ust = Math.max(...etiket.map((w) => w.y1)) + 40
    const sag = Math.max(...temiz.filter((w) => w.y0 > altY && w.y1 < ust && w.x0 > solKenar).map((w) => w.x1), solKenar + 500)
    const g = (sag - solKenar) / 5
    kolonlar = [0, 1, 2, 3, 4].map((i) => [solKenar + i * g, solKenar + (i + 1) * g])
  }
  const sol = satirlar(temiz.filter((w) => (w.x0 + w.x1) / 2 < solKenar && (w.y0 + w.y1) / 2 > altY))
  const ogr = sol.filter((l) => etiketli(metin(l.k)))
  if (!ogr.length) throw new Error('Öğretmen adları okunamadı (ilk sütun).')
  const sinirY = ogr.map((l, i) => (i === 0 ? altY : (l.y + ogr[i - 1]!.y) / 2))
  const sonY = ogr.length > 1 ? ogr.at(-1)!.y + (ogr.at(-1)!.y - ogr.at(-2)!.y) / 2 : ogr[0]!.y1 + 40
  return {
    saatler: b?.saatler ?? null,
    kolonlar,
    satirlar: ogr.map((l, i) => ({ ogretmen: ogretmenAdi(metin(l.k)), y0: sinirY[i]!, y1: i + 1 < ogr.length ? sinirY[i + 1]! : sonY })),
  }
}

/** OCR / PDF kelimelerinden tablo (hücre metni = hücre alanına düşen kelimeler). */
export function tabloKelimelerden(ws: Kelime[], ogretmenIlkAdlar: Set<string>): HamTablo {
  const isk = tabloIskeleti(ws, ogretmenIlkAdlar)
  const icinde = (w: Kelime, x0: number, x1: number, y0: number, y1: number) => {
    const cx = (w.x0 + w.x1) / 2, cy = (w.y0 + w.y1) / 2
    return cx >= x0 && cx < x1 && cy >= y0 && cy < y1
  }
  return {
    saatler: isk.saatler,
    satirlar: isk.satirlar.map((r) => ({
      ogretmen: r.ogretmen,
      hucreler: isk.kolonlar.map(([x0, x1]) =>
        satirlar(ws.filter((w) => icinde(w, x0, x1, r.y0, r.y1)))
          .map((x) => metin(x.k))
          .join(' ')
          .trim(),
      ),
    })),
  }
}

/** Excel / CSV satırlarından tablo: "Öğretmen" başlıklı satır, ardından 5 ders sütunu. */
export function tabloSatirlardan(rows: (string | number | null | undefined)[][]): HamTablo {
  const str = (v: unknown) => (v === null || v === undefined ? '' : String(v)).replace(/\s+/g, ' ').trim()
  // Hücre metninde satır sonları korunur (öğrenci ayırıcısı); satır içi boşluklar sadeleşir
  const hucre = (v: unknown) =>
    (v === null || v === undefined ? '' : String(v))
      .replace(/\r/g, '')
      .split('\n')
      .map((x) => x.replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .join('\n')
  const bi = rows.findIndex((r) => r.some((c) => /^(ogretmen|öğretmen)/.test(katla(str(c)))))
  if (bi < 0) throw new Error('"Öğretmen" başlıklı satır bulunamadı.')
  const head = rows[bi]!.map(str)
  const oc = head.findIndex((c) => /^ogretmen/.test(katla(c)))
  const cols = head.map((c, i) => ({ c, i })).filter((x) => x.i > oc && x.c).slice(0, 5)
  if (cols.length < 5) throw new Error('5 ders sütunu bulunamadı.')
  const saat = cols.map((x) => saatAraligi(x.c))
  // Başlık ("TARİH: 24 EKİM C.TESİ", "LİSE DERS TELAFİSİ PROGRAMI"): tarih ve kademe denetimi için
  const baslik = [...new Set(rows.slice(0, bi).flatMap((r) => r.map(str)).filter(Boolean))].join(' · ')
  return {
    saatler: saat.every(Boolean) ? (saat as Saat[]) : null,
    baslik: baslik || undefined,
    satirlar: rows
      .slice(bi + 1)
      .filter((r) => str(r[oc]))
      .map((r) => ({ ogretmen: ogretmenAdi(str(r[oc])), hucreler: cols.map((x) => hucre(r[x.i])) })),
  }
}

// ---------- Hücre ----------
export interface SinifIpucu {
  grade: number
  sube: string | null
  /** Lise alanı: "12-SAY", "11-EA", "12 SAY A" (sınıf adı "12/A · SAY") */
  alan?: string
}
const ALAN = (s: string) => {
  const k = katla(s).toUpperCase()
  return k === 'SOZ' ? 'SOZ' : k === 'DIL' ? 'DIL' : k
}
export interface HucreOkuma {
  tur: 'etut' | 'mesgul' | 'bos'
  konu: string
  salon: string | null
  aciklama: string | null
  adlar: string[]
  sinif: SinifIpucu[]
  ham: string
}
const MESGUL = /^(d|izinli|raporlu|voleybol|toplanti|nobet|ders|dolu|ortaokul|ilkokul|lise|anaokulu)$/
// Okul etkinliği (öğretmen o saatte başka işte): tiyatro, seminer, gezi, toplantı, dershane
const ETKINLIK = /(?<![\p{L}])(tiyatro|seminer|seminerı|semineri|gezi|gezisi|gezisinde|toplantisi|dershanesi|sok)(?![\p{L}])/u
const BUYUK = /^[A-ZÇĞİÖŞÜ]/
export function hucreCoz(ham: string): HucreOkuma {
  let t = ham
    .replace(/\r/g, '')
    .replace(/[✓✔√|{}\[\]_~«»]/g, ' ')
    // OCR'ın sınıf adında karıştırdığı rakamlar: "GA" → 6A, "SA" → 5A, "TA" → 7A, "BA" → 8A (yalnız 2 harflik bağımsız parça)
    .replace(/(?<![\p{L}\d])([GSTB])([ABC])(?![\p{L}\d])/gu, (_, d: string, sb: string) => ({ G: '6', S: '5', T: '7', B: '8' })[d]! + sb)
    // Excel hücresindeki satır sonları korunur (aşağıda ayırıcı olur: "Doruk↵Berat" iki öğrencidir)
    // "Çınar D.Toprak" → "Çınar D. Toprak" (baş harften sonra boşluk unutulmuş)
    .replace(/(?<=\p{Lu})\.(?=\p{Lu}\p{Ll})/gu, '. ')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n+/g, '\n')
    .trim()
  const bos: HucreOkuma = { tur: 'bos', konu: '', salon: null, aciklama: null, adlar: [], sinif: [], ham }
  // Boş ya da anlamsız kısa gürültü ("rf", "—") boş sayılır; tek "D" ders/dolu demektir
  // Yalnız sınıf adı ("9-A", "8B", "9/A") kısa olsa da boş değildir: o sınıfın tamamına etüt
  const tekSinif = /^\d{1,2}\s*[-/.]?\s*[A-HÇ]$/i.test(t)
  if (!t || /^[-–—.]+$/.test(t) || (t.replace(/[^\p{L}\d]/gu, '').length <= 2 && !/^d$/i.test(t) && !tekSinif)) return bos
  const k = katla(t)
  if (MESGUL.test(k) || ETKINLIK.test(k) || /gozetmen|gozetim/.test(k) || (/sinav/.test(k) && !/[a-zçğıöşü]{3,},/.test(t)))
    return { ...bos, tur: 'mesgul', aciklama: t }
  // OCR gürültüsüyle gelen meşgul sözcüğü ("voleybol aa ıı", "izinli ———"): yalnız sözcüğün kendisi alınır
  const ms = k.match(/(?<![\p{L}])(izinli|raporlu|voleybol|toplanti|nobet)(?![\p{L}])/u)
  if (ms && !/[A-ZÇĞİÖŞÜ][a-zçğıöşü]{2,}/.test(t.replace(/^\S+/, ''))) return { ...bos, tur: 'mesgul', aciklama: t.split(/\s+/).find((x) => katla(x) === ms[1]) ?? ms[1]! }
  let salon: string | null = null
  t = t.replace(/ET[ÜUİI]T\s*[-–]?\s*(\d{1,2})/gi, (_, n: string) => {
    salon = `ETÜT-${n}`
    return ' '
  })
  const konu: string[] = []
  // Parantez içi konudur (satırlara bölünmüş olabilir: "(Son Ünite Genel Tekrar-↵Soru Çözümü)")
  t = t.replace(/\(([^)]*)\)?/g, (_, x: string) => {
    const k = x.replace(/\s+/g, ' ').trim()
    if (k) konu.push(k)
    return ' , '
  })
  // Satır sonu ayırıcıdır; "Sınıfı / Sınıf" sözcüğü atılır ("11-A Sınıfı")
  t = t
    .replace(/\n/g, ' , ')
    .replace(/(?<![\p{L}])s[ıi]n[ıi]f[ıi]?(?![\p{L}])/giu, ' ')
    .replace(/\s+/g, ' ')
  const sinif: SinifIpucu[] = []
  // Sınıf: "11-A", "9A", "12/B", lise alanı "12-SAY", "11-EA", "12 SAY A", "11 A EA" (alan + şube sırası serbest)
  t = t.replace(
    /(?<!\d)(\d{1,2})\s*[-/.]?\s*(?:(SAY|SÖZ|SOZ|EA|DİL|DIL)(?:\s*[-/]?\s*([A-H]))?|([A-HÇ][A-ZÇĞİÖŞÜ]?)(?:\s*[-/·]?\s*(SAY|SÖZ|SOZ|EA|DİL|DIL))?)(?![\p{L}])/gu,
    (m, g: string, alan1?: string, sube1?: string, sube2?: string, alan2?: string) => {
      const grade = Number(g)
      if (grade < 1 || grade > 12) return m
      const sube = sube1 ?? sube2 ?? null
      const alan = alan1 ?? alan2
      sinif.push({ grade, sube: sube && sube.length === 1 ? sube : null, ...(alan ? { alan: ALAN(alan) } : {}) })
      return ' , '
    },
  )
  const adlar: string[] = []
  for (const parca of t.split(/[,;/]|\s[-–]\s?|[-–](?=\s*[A-ZÇĞİÖŞÜ])/)) {
    const w = parca.trim().split(/\s+/).filter(Boolean)
    if (!w.length) continue
    let n: string[] = []
    let bitti = false
    while (n.length < 3 && w.length && BUYUK.test(w[0]!) && w[0]!.replace(/\./g, '').length >= 1) {
      n.push(w.shift()!)
      // Soyadın baş harfi ("Çınar D.") adı bitirir: ardından gelen büyük harfli sözcük yeni öğrencidir ("Çınar D. Toprak")
      if (n.length > 1 && /^\p{Lu}\.$/u.test(n.at(-1)!) && w.length && BUYUK.test(w[0]!)) {
        adlar.push(n.join(' '))
        n = []
        bitti = true
      }
    }
    if (n.length) adlar.push(n.join(' '))
    else if (bitti && !w.length) continue
    if (w.length) konu.push(w.join(' '))
  }
  return { tur: 'etut', konu: konu.join(', ').replace(/\s+/g, ' ').trim(), salon, aciklama: null, adlar, sinif, ham }
}

// ---------- Öğrenci ve öğretmen eşleme ----------
export interface OgrenciLite {
  id: string
  full_name: string
  class_name: string
  grade?: number | null
}
export type Esleme = { durum: 'eslesti'; id: string } | { durum: 'belirsiz'; secenekler: string[] } | { durum: 'yok' }
/** Sınıf adı "12/A · SAY" → { grade: 12, sube: 'a', alan: 'SAY' } */
export function sinifParca(ad: string): { grade: number; sube: string; alan: string | null } {
  const [g, rest = ''] = ad.split('/')
  const [sb = '', al] = rest.split('·').map((x) => x.trim())
  return { grade: Number(g), sube: katla(sb), alan: al ? ALAN(al) : null }
}
/** Sınıf adı ipuçlarından birine uyuyor mu: sınıf düzeyi + (şube ve/veya alan) */
export const sinifIpucunaUyar = (className: string, ip: SinifIpucu[]) => {
  const c = sinifParca(className)
  return ip.some((x) => c.grade === x.grade && (!x.sube || c.sube.startsWith(katla(x.sube))) && (!x.alan || c.alan === x.alan))
}
const sinifUyar = (s: OgrenciLite, ip: SinifIpucu[]) => !ip.length || sinifIpucunaUyar(s.class_name, ip)
/** Ad (ör. "Elif", "Çınar Ç.", "Durdu Mert") → öğrenci. Önce sınıf ipucuyla, bulunamazsa kademede. */
/** İki sözcük arasında en fazla tek harf (değişme/ekleme/silme) farkı var mı */
function fark1(a: string, b: string): boolean {
  if (a === b) return true
  if (Math.abs(a.length - b.length) > 1) return false
  let i = 0
  while (i < a.length && i < b.length && a[i] === b[i]) i++
  return a.slice(i + 1) === b.slice(i + 1) || a.slice(i) === b.slice(i + 1) || a.slice(i + 1) === b.slice(i)
}
export function ogrenciEsle(ad: string, ipucu: SinifIpucu[], ogrenciler: OgrenciLite[]): Esleme {
  const p = ad.split(/\s+/).filter(Boolean)
  const ilk = katla(p[0] ?? '')
  const ikinci = p[1] ? katla(p[1].replace(/\./g, '')) : ''
  const bas = p[1]?.endsWith('.') || (p[1]?.length ?? 0) === 1
  // Kademeler: 'ilk' = ilk ad; 'ad' = ikinci / üçüncü ad ("Ayaz" → Batın Ayaz Dal; yalnız sınıf ipucu varken, sınıf içinde);
  // 'yakin' = tek harf farklı (OCR / yazım hatası; hiçbir zaman kendiliğinden seçilmez)
  type Kademe = 'ilk' | 'ad' | 'yakin'
  const uy = (s: OgrenciLite, k: Kademe) => {
    const w = katla(s.full_name).split(/\s+/)
    const adlar = w.length > 2 ? w.slice(0, -1) : w.slice(0, 1) // soyad hariç bütün adlar
    const ilkUyar = k === 'ilk' ? w[0] === ilk : k === 'ad' ? adlar.slice(1).includes(ilk) : ilk.length >= 4 && adlar.some((x) => fark1(x, ilk))
    if (!ilkUyar) return false
    if (!ikinci) return true
    if (bas) return w.slice(1).some((x) => x.startsWith(ikinci))
    return w.slice(1).includes(ikinci)
  }
  const sinifta = ogrenciler.filter((s) => sinifUyar(s, ipucu))
  // Sıra: önce yazılan sınıfın içinde (ilk ad, sonra diğer adlar), sonra bütün kademede; en son tek harf farklılar
  const adimlar: [Kademe, OgrenciLite[]][] = ipucu.length
    ? [['ilk', sinifta], ['ad', sinifta], ['ilk', ogrenciler], ['yakin', sinifta], ['yakin', ogrenciler]]
    : [['ilk', ogrenciler], ['yakin', ogrenciler]]
  for (const [k, havuz] of adimlar) {
    const m = havuz.filter((s) => uy(s, k))
    if (m.length === 1 && k !== 'yakin') return { durum: 'eslesti', id: m[0]!.id }
    if (m.length) return { durum: 'belirsiz', secenekler: m.map((s) => s.id) }
  }
  return { durum: 'yok' }
}

/** Öğretmen satır adı: "ECEM HOCA", "Ecem Öğretmen", "Ecem Hanım", "Ecem Ö. (Tarih)", "ÖZVEREN HOCA" → öğretmen.
 *  Sıra: tam ad → ilk ad → başka bir ad / soyad → tek harf farklı (yalnız aday olarak sorulur). Kademede olan önce. */
export function ogretmenEsle(ad: string, ogretmenler: { id: string; name: string }[], kademede?: Set<string>): { id: string | null; secenekler: string[] } {
  const temiz = katla(
    ogretmenAdi(ad)
      .replace(/\([^)]*\)?/g, ' ')
      .replace(/(?<![\p{L}])(hanim|hanım|bey|bay|bayan|hn|öğr|ogr|hoca|öğt|ogt)\.?(?![\p{L}])/giu, ' '),
  )
    .replace(/[^\p{L}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!temiz) return { id: null, secenekler: [] }
  const ws = (t: { name: string }) => katla(t.name).replace(/[^\p{L}\s]/gu, ' ').split(/\s+/).filter(Boolean)
  const tam = ogretmenler.filter((t) => ws(t).join(' ') === temiz)
  if (tam.length === 1) return { id: tam[0]!.id, secenekler: [] }
  const [ilk, ...diger] = temiz.split(' ')
  const sec = (aday: typeof ogretmenler, kendiliginden = true) => {
    const kad = kademede ? aday.filter((t) => kademede.has(t.id)) : aday
    const s = kad.length ? kad : aday
    return s.length === 1 && kendiliginden ? { id: s[0]!.id, secenekler: [] } : { id: null, secenekler: s.map((t) => t.id) }
  }
  // İlk ad (ikinci sözcük de yazılmışsa onunla daraltılır: "Sıla B.")
  let aday = ogretmenler.filter((t) => ws(t)[0] === ilk)
  if (aday.length > 1 && diger[0]) {
    const d = diger[0].replace(/\.$/, '')
    const dar = aday.filter((t) => ws(t).slice(1).some((x) => x.startsWith(d)))
    if (dar.length) aday = dar
  }
  if (aday.length) return sec(aday)
  // Başka bir ad ya da soyad ("EREN HOCA" → Mustafa Eren Özhan, "ÖZVEREN HOCA" → Ecem Özveren Çetin)
  aday = ogretmenler.filter((t) => ws(t).slice(1).includes(ilk!))
  if (aday.length) return sec(aday)
  // Tek harf farklı (yazım hatası): yalnız aday olarak gösterilir
  aday = ilk!.length >= 4 ? ogretmenler.filter((t) => ws(t).some((x) => fark1(x, ilk!))) : []
  return aday.length ? sec(aday, false) : { id: null, secenekler: [] }
}

/** Excel sayfa adı / başlık tarihi: "24 EKİM", "4KASIM", "TARİH: 24 EKİM C.TESİ" → { gun, ay } */
const AYLAR = ['ocak', 'subat', 'mart', 'nisan', 'mayis', 'haziran', 'temmuz', 'agustos', 'eylul', 'ekim', 'kasim', 'aralik']
export function sayfaTarihi(s: string): { gun: number; ay: number } | null {
  const m = katla(s).match(/(\d{1,2})\s*\.?\s*(ocak|subat|mart|nisan|mayis|haziran|temmuz|agustos|eylul|ekim|kasim|aralik)/)
  return m ? { gun: Number(m[1]), ay: AYLAR.indexOf(m[2]!) + 1 } : null
}
/** Programın tarihine (YYYY-MM-DD) uyan sayfa; yoksa en son sayfa */
export function sayfaSec(adlar: string[], tarih?: string): string | undefined {
  if (!adlar.length) return undefined
  if (tarih) {
    const [, a, g] = tarih.split('-').map(Number)
    const uy = adlar.filter((x) => {
      const t = sayfaTarihi(x)
      return t && t.gun === g && t.ay === a
    })
    if (uy.length) return uy.at(-1)
  }
  return adlar.at(-1)
}

// ---------- Önizleme hazırlığı (hücre → öğrenciler, konu) ----------
export interface AdSecim {
  ad: string
  secim: string // student id, '' = yok say
  secenekler: string[]
  durum: 'eslesti' | 'belirsiz' | 'yok'
}
export interface SinifGrubu {
  ad: string // sınıf adı ("12/A · SAY") ya da etüt grubu adı ("8'ler 1. Grup")
  ids: string[]
  on: boolean
  /** Etüt öğrenci grubu (0062); yoksa sınıf */
  grup?: boolean
}
export interface HucreHazir {
  konu: string
  adlar: AdSecim[]
  /** Hücrede yalnız sınıf yazıyorsa ("12-SAY", "9-A Sınıfı") o sınıfın bütün öğrencileri */
  siniflar: SinifGrubu[]
}
/**
 * Okunan hücreyi öğrencilere bağlar. Okulda öğrenci adı olmayan sözcükler ("Soru Çözümü", "Dünya", "Paragraf") konuya gider.
 * Sınıf yazılı ama ad yoksa (ya da bütün "adlar" konu çıktıysa) o sınıfın tamamı önerilir.
 */
export function hucreHazirla(okuma: HucreOkuma, ogrenciler: OgrenciLite[]): HucreHazir {
  const adSozleri = new Set(
    ogrenciler.flatMap((s) => {
      const w = katla(s.full_name).split(/\s+/)
      return w.length > 2 ? w.slice(0, -1) : w.slice(0, 1)
    }),
  )
  const konuAdlar: string[] = []
  const adlar: AdSecim[] = []
  for (const ad of okuma.adlar) {
    const e = ogrenciEsle(ad, okuma.sinif, ogrenciler)
    if (e.durum === 'yok' && !adSozleri.has(katla(ad).split(' ')[0]!)) {
      konuAdlar.push(ad) // yazıldığı sırayla
      continue
    }
    adlar.push({ ad, durum: e.durum, secim: e.durum === 'eslesti' ? e.id : '', secenekler: e.durum === 'belirsiz' ? e.secenekler : [] })
  }
  const konu = [...konuAdlar, okuma.konu].filter(Boolean).join(' ').replace(/\s+,/g, ',').replace(/\s+/g, ' ').trim()
  const siniflar: SinifGrubu[] = []
  if (okuma.tur === 'etut' && !adlar.length && okuma.sinif.length) {
    const by = new Map<string, string[]>()
    for (const s of ogrenciler) if (sinifIpucunaUyar(s.class_name, okuma.sinif)) by.set(s.class_name, [...(by.get(s.class_name) ?? []), s.id])
    for (const [ad, ids] of [...by].sort((a, b) => a[0].localeCompare(b[0], 'tr'))) siniflar.push({ ad, ids, on: true })
  }
  return { konu, adlar, siniflar }
}
