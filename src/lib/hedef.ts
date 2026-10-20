// Hedef ve öneri: LGS liseleri ve YKS lisans programları (taban puan) ile öğrencinin deneme puanının karşılaştırılması.
// Saf fonksiyonlar (birim testli). Kurallar:
//  - Veri resmî kaynaktan: YKS = ÖSYM "Tablo-4 En Küçük ve En Büyük Puanlar" (lisans, genel kontenjan); LGS = okulun
//    e-Okul'daki MEB yerleştirme ekranından şablona aktardığı liste. Okunamayan satır atlanır, değer tahmin edilmez.
//  - Karşılaştırma deneme puanıyla yapılır ve her yerde "tahmini" diye yazılır: deneme puanı gerçek sınav puanı değildir.

export type Sinav = 'LGS' | 'YKS'
export type PuanTuru = 'SAY' | 'EA' | 'SOZ' | 'DIL'
export interface HedefProgram {
  id?: string
  sinav: Sinav
  yil: number
  kod: string
  kurum: string
  il: string | null
  ilce?: string | null
  birim: string | null // YKS: fakülte; LGS: okul türü (Fen Lisesi, Anadolu Lisesi…)
  program: string | null // YKS: program adı; LGS: alan/dil (varsa)
  puan_turu: PuanTuru | null
  taban_puan: number | null
  tavan_puan?: number | null
  yuzdelik: number | null
  kontenjan: number | null
  yerlesen?: number | null
}

export const ILLER = [
  'Adana', 'Adıyaman', 'Afyonkarahisar', 'Ağrı', 'Aksaray', 'Amasya', 'Ankara', 'Antalya', 'Ardahan', 'Artvin', 'Aydın', 'Balıkesir', 'Bartın', 'Batman',
  'Bayburt', 'Bilecik', 'Bingöl', 'Bitlis', 'Bolu', 'Burdur', 'Bursa', 'Çanakkale', 'Çankırı', 'Çorum', 'Denizli', 'Diyarbakır', 'Düzce', 'Edirne', 'Elazığ',
  'Erzincan', 'Erzurum', 'Eskişehir', 'Gaziantep', 'Giresun', 'Gümüşhane', 'Hakkari', 'Hatay', 'Iğdır', 'Isparta', 'İstanbul', 'İzmir', 'Kahramanmaraş',
  'Karabük', 'Karaman', 'Kars', 'Kastamonu', 'Kayseri', 'Kırıkkale', 'Kırklareli', 'Kırşehir', 'Kilis', 'Kocaeli', 'Konya', 'Kütahya', 'Malatya', 'Manisa',
  'Mardin', 'Mersin', 'Muğla', 'Muş', 'Nevşehir', 'Niğde', 'Ordu', 'Osmaniye', 'Rize', 'Sakarya', 'Samsun', 'Siirt', 'Sinop', 'Sivas', 'Şanlıurfa', 'Şırnak',
  'Tekirdağ', 'Tokat', 'Trabzon', 'Tunceli', 'Uşak', 'Van', 'Yalova', 'Yozgat', 'Zonguldak',
]
const up = (s: string) => s.toLocaleUpperCase('tr').replace(/\s+/g, ' ').trim()
const IL_UP = new Map(ILLER.map((i) => [up(i), i]))
/** Adında ili geçmeyen ve parantezle de verilmeyen üniversiteler (ÖSYM 2025 Tablo-4'te bir tane). */
const UNI_IL: Record<string, string> = { 'GEBZE TEKNİK ÜNİVERSİTESİ': 'Kocaeli' }

/** Üniversitenin ili: "(KAYSERİ)" parantezi, adın başındaki il ("BARTIN ÜNİVERSİTESİ") ya da bilinen istisna.
 *  KKTC / yurt dışı programları "KKTC" / "Yurt dışı" olur; bulunamazsa null (tahmin yok). */
export function uniIl(ad: string): string | null {
  const a = up(ad)
  if (UNI_IL[a]) return UNI_IL[a]!
  const p = a.match(/\(([^)]+)\)\s*$/)?.[1]?.trim()
  if (p) {
    if (IL_UP.has(p)) return IL_UP.get(p)!
    if (p.startsWith('KKTC')) return 'KKTC'
    return 'Yurt dışı'
  }
  for (const [k, v] of IL_UP) if (a.startsWith(k + ' ')) return v
  return null
}

const sayi = (v: unknown): number | null => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  const t = String(v ?? '')
    .trim()
    .replace(/\s/g, '')
  if (!t || t === '--' || t === '-') return null
  // "438,212" / "438.212" (tek ayraç ondalık) · "1.234,5" (binlik + ondalık)
  const n = Number(/,/.test(t) ? t.replace(/\./g, '').replace(',', '.') : t)
  return Number.isFinite(n) ? n : null
}
const metin = (v: unknown) => {
  const t = String(v ?? '').replace(/\s+/g, ' ').trim()
  return t && t !== '--' ? t : null
}
const katla = (s: unknown) =>
  String(s ?? '')
    .toLocaleLowerCase('tr')
    .replace(/[ıİ]/g, 'i')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

export interface OkumaSonucu {
  programlar: HedefProgram[]
  atlanan: number
  hata: string | null
}

/** ÖSYM Tablo-4 (lisans). Başlık satırı "Program Kodu … Puan Türü, Kontenjan, Yerleşen, En Küçük Puan, En Büyük Puan" (genel kontenjan). */
export function osymTablo4(rows: unknown[][], yil: number): OkumaSonucu {
  const hi = rows.findIndex((r) => katla(r[0]) === 'program kodu' && r.some((c) => katla(c) === 'puan turu'))
  if (hi < 0) return { programlar: [], atlanan: 0, hata: 'ÖSYM Tablo-4 başlığı ("Program Kodu", "Puan Türü") bulunamadı.' }
  const h = rows[hi]!.map(katla)
  const col = (ad: string, from = 0) => h.findIndex((c, i) => i >= from && c === ad)
  const iKod = 0,
    iUni = col('universite adi'),
    iFak = col('fakulte yuksekokul adi'),
    iProg = col('program adi'),
    iTur = col('puan turu'),
    iKont = col('kontenjan', iTur),
    iYer = col('yerlesen', iTur),
    iMin = col('en kucuk puan', iTur),
    iMax = col('en buyuk puan', iTur)
  if ([iUni, iProg, iTur, iKont, iMin].some((i) => i < 0)) return { programlar: [], atlanan: 0, hata: 'ÖSYM Tablo-4 sütunları eksik.' }
  const TUR: Record<string, PuanTuru> = { SAY: 'SAY', EA: 'EA', SOZ: 'SOZ', SÖZ: 'SOZ', DIL: 'DIL', DİL: 'DIL' }
  const out: HedefProgram[] = []
  let atlanan = 0
  for (const r of rows.slice(hi + 1)) {
    const kod = metin(r[iKod]),
      kurum = metin(r[iUni]),
      tur = TUR[up(String(r[iTur] ?? ''))]
    if (!kod || !/^\d{6,12}$/.test(kod) || !kurum || !tur) {
      if (r.some((c) => c !== null && c !== '')) atlanan++
      continue
    }
    out.push({
      sinav: 'YKS',
      yil,
      kod,
      kurum,
      // Başka ildeki kampüs fakülte adında yazar ("ODTÜ Kuzey Kıbrıs Kampusu (KKTC-Güzelyurt)")
      il: /\(KKTC/i.test(String(r[iFak] ?? '')) ? 'KKTC' : uniIl(kurum),
      birim: metin(r[iFak]),
      program: metin(r[iProg]),
      puan_turu: tur,
      taban_puan: sayi(r[iMin]),
      tavan_puan: iMax >= 0 ? sayi(r[iMax]) : null,
      yuzdelik: null,
      kontenjan: sayi(r[iKont]),
      yerlesen: iYer >= 0 ? sayi(r[iYer]) : null,
    })
  }
  return { programlar: out, atlanan, hata: out.length ? null : 'Tabloda program okunamadı.' }
}

/** LGS şablonu: Okul | İl | İlçe | Okul türü | Alan / dil | Taban puan | Yüzdelik | Kontenjan (başlık adına göre; sıra serbest). */
export const LGS_SABLON = ['Okul', 'İl', 'İlçe', 'Okul türü', 'Alan / dil', 'Taban puan', 'Yüzdelik', 'Kontenjan']
export function lgsTablo(rows: unknown[][], yil: number): OkumaSonucu {
  const hi = rows.findIndex((r) => r.some((c) => katla(c) === 'okul') && r.some((c) => katla(c).startsWith('taban')))
  if (hi < 0) return { programlar: [], atlanan: 0, hata: 'Başlık satırı bulunamadı ("Okul" ve "Taban puan" sütunları gerekli). Şablonu kullan.' }
  const h = rows[hi]!.map(katla)
  const col = (...ads: string[]) => h.findIndex((c) => ads.some((a) => c === a || c.startsWith(a)))
  const iOkul = col('okul adi', 'okul'),
    iIl = col('il'),
    iIlce = col('ilce'),
    iTur = col('okul turu', 'tur'),
    iAlan = col('alan', 'dil'),
    iTaban = col('taban'),
    iYuz = col('yuzdelik'),
    iKont = col('kontenjan')
  const out: HedefProgram[] = []
  let atlanan = 0
  rows.slice(hi + 1).forEach((r, n) => {
    const kurum = metin(r[iOkul]),
      taban = sayi(r[iTaban]),
      yuz = iYuz >= 0 ? sayi(r[iYuz]) : null
    const il = iIl >= 0 ? (IL_UP.get(up(String(r[iIl] ?? ''))) ?? metin(r[iIl])) : null
    if (!kurum || (taban === null && yuz === null) || (taban !== null && (taban < 0 || taban > 500)) || (yuz !== null && (yuz < 0 || yuz > 100))) {
      if (r.some((c) => c !== null && c !== '')) atlanan++
      return
    }
    out.push({
      sinav: 'LGS',
      yil,
      kod: `${katla(il ?? '')}|${katla(kurum)}|${katla(iAlan >= 0 ? r[iAlan] : '')}|${n}`.slice(0, 200),
      kurum,
      il,
      ilce: iIlce >= 0 ? metin(r[iIlce]) : null,
      birim: iTur >= 0 ? metin(r[iTur]) : null,
      program: iAlan >= 0 ? metin(r[iAlan]) : null,
      puan_turu: null,
      taban_puan: taban,
      yuzdelik: yuz,
      kontenjan: iKont >= 0 ? sayi(r[iKont]) : null,
    })
  })
  return { programlar: out, atlanan, hata: out.length ? null : 'Tabloda okul okunamadı.' }
}

/** Öğrenci puanına göre durum. Eşik: taban puanın en çok bu kadar üstündeyse "yakın" (sınırda), altındaysa "zorlayıcı". */
export type Durum = 'ulasilabilir' | 'yakin' | 'zorlayici'
export const DURUM_TR: Record<Durum, string> = { ulasilabilir: 'Ulaşılabilir', yakin: 'Hedefe yakın', zorlayici: 'Zorlayıcı' }
export function durum(puan: number, taban: number, yakinlik = 15): Durum {
  const fark = puan - taban
  if (fark >= yakinlik) return 'ulasilabilir'
  if (fark >= -yakinlik) return 'yakin'
  return 'zorlayici'
}

/** Programları öğrencinin (deneme) puanına göre gruplar; her grupta tabanı yüksekten düşüğe. Tabanı olmayan program dışarıda kalır. */
export function oneriler(ps: HedefProgram[], puan: number, yakinlik = 15) {
  const g: Record<Durum, (HedefProgram & { fark: number })[]> = { ulasilabilir: [], yakin: [], zorlayici: [] }
  for (const p of ps) {
    if (p.taban_puan === null) continue
    g[durum(puan, p.taban_puan, yakinlik)].push({ ...p, fark: puan - p.taban_puan })
  }
  for (const k of Object.keys(g) as Durum[]) g[k].sort((a, b) => b.taban_puan! - a.taban_puan!)
  // Ulaşılabilirlerden yalnız en iddialıları (taban puanı en yüksek olanlar) anlamlı; zorlayıcılardan en yakın olanlar
  g.zorlayici.sort((a, b) => a.taban_puan! - b.taban_puan!)
  return g
}

/** Öğrencinin karşılaştırma puanı: son denemelerin ortalaması (en çok 3), tek tek dalgalanmayı yumuşatır. */
export function referansPuan(puanlar: (number | null | undefined)[], son = 3): number | null {
  const v = puanlar.filter((p): p is number => typeof p === 'number' && Number.isFinite(p)).slice(-son)
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null
}
