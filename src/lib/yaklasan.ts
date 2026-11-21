// Yaklaşan deneme: yayınevinin önceden gönderdiği kazanım listesi (xlsx) → soru × kazanım planı.
// Kurallar: eşleşme yalnız kodla ve deneme motoruyla aynı kuralla yapılır (tam kod ya da üst kod; İngilizce'de yalnız tam kod;
// kod ile metin çelişirse eşleşme yok). Plan yalnız kazanım alanlarını tamamlar; D/Y/B/net/puan'a dokunmaz (CLAUDE.md §1–§2).
import { SUBJECT, konuStatus, questionsFor, studentExams, type Dataset, type LgsSubject, type MatchLevel } from './analiz'
import { outcomeText } from './outcomeMatching'

/** LGS dersleri + 4-7. sınıf Sosyal Bilgiler (8. sınıfta yerini T.C. İnkılap Tarihi alır). */
export type Subject = LgsSubject | 'SOS'
const DERS_SIRA: Subject[] = ['TUR', 'MAT', 'FEN', 'SOS', 'INK', 'DIN', 'ING']
// deneme.ts bu dosyayı içe aktardığı için QCOUNT buraya kopyalandı (döngüsel içe aktarmada modül başında tanımsız olabilir).
const SORU_SAYISI: Record<Subject, number> = { TUR: 20, MAT: 20, FEN: 20, SOS: 10, INK: 10, DIN: 10, ING: 10 }
export const dersAdi = (d: Subject) => (d === 'SOS' ? 'Sosyal Bilgiler' : SUBJECT[d].ad)

export const KITAPCIKLAR = ['A', 'B', 'C', 'D'] as const
export type Kitapcik = (typeof KITAPCIKLAR)[number]

export interface YaklasanSoru {
  subject: Subject
  q_no: number // A kitapçığı
  q_b: number | null
  q_c: number | null
  q_d: number | null
  konu: string | null
  raw_code: string | null
  raw_text: string | null
  outcome_code: string | null
  match: MatchLevel
}
export interface KazanimDosyasi {
  ad: string | null
  sinif: number | null
  sorular: YaklasanSoru[]
  /** Okunamayan ya da tanınmayan satırlar (bilgi amaçlı). */
  uyarilar: string[]
}

const DERS: [RegExp, Subject][] = [
  [/T[ÜU]RK[ÇC]E/, 'TUR'],
  [/MATEMAT/, 'MAT'],
  [/FEN/, 'FEN'],
  [/SOSYAL/, 'SOS'],
  [/[İI]NKILAP|TAR[İI]H/, 'INK'],
  [/D[İI]N/, 'DIN'],
  [/[İI]NG[İI]L[İI]ZCE|YABANCI/, 'ING'],
]
const buyuk = (s: string) => s.toLocaleUpperCase('tr').replace(/\s+/g, ' ').trim()
export function dersBul(s: string): Subject | null {
  const u = buyuk(s)
  return DERS.find(([re]) => re.test(u))?.[1] ?? null
}
const sayi = (s: string | undefined) => {
  const t = (s ?? '').trim()
  return /^\d{1,2}$/.test(t) ? Number(t) : null
}

/**
 * Fernus biçimli kazanım tablosu: üstte "Sınav Adı" ve "Sınıf"; her ders bir başlık satırıyla başlar
 * (ders adı | A KİTAPÇIĞI | B | C | D | ALT DERS | KAZANIM ID | KAZANIM KODU | KAZANIM KONU | KAZANIM).
 * Sütunlar başlıktaki adlarla bulunur; satır sırası değişse de okunur.
 */
export function kazanimTablosuOku(rows: string[][]): KazanimDosyasi {
  const cell = (r: string[], i: number) => (i >= 0 ? (r[i] ?? '').toString().trim() : '')
  let ad: string | null = null
  let sinif: number | null = null
  const sorular: YaklasanSoru[] = []
  const uyarilar: string[] = []
  let blok: { subject: Subject; a: number; b: number; c: number; d: number; kod: number; konu: number; metin: number } | null = null
  rows.forEach((r, ri) => {
    const u = r.map((x) => buyuk(String(x ?? '')))
    const si = u.findIndex((x) => x.startsWith('SINAV ADI'))
    if (si >= 0 && !ad) ad = cell(rows[ri + 1] ?? [], si) || null
    const ci = u.findIndex((x) => /^SINIF:?$/.test(x))
    if (ci >= 0 && sinif === null) sinif = sayi(cell(r, ci + 1))
    const ai = u.findIndex((x) => /^A\s*K[İI]TAP/.test(x))
    if (ai >= 0) {
      const subject = dersBul(u[0] ?? '') ?? dersBul(u.slice(1).join(' '))
      const at = (re: RegExp) => u.findIndex((x) => re.test(x))
      blok = subject
        ? {
            subject,
            a: ai,
            b: at(/^B$/),
            c: at(/^C$/),
            d: at(/^D$/),
            kod: at(/KAZANIM KODU/),
            konu: at(/KAZANIM KONU/),
            metin: u.findIndex((x) => x === 'KAZANIM'),
          }
        : null
      if (!subject) uyarilar.push(`${ri + 1}. satırdaki ders tanınmadı: ${cell(r, 0)}`)
      return
    }
    if (!blok) return
    const b = blok
    const no = sayi(cell(r, b.a)) ?? sayi(cell(r, 0))
    if (no === null) return
    if (no > SORU_SAYISI[b.subject] || sorular.some((s) => s.subject === b.subject && s.q_no === no)) {
      uyarilar.push(`${ri + 1}. satır atlandı (soru numarası ${no})`)
      return
    }
    const rawText = cell(r, b.metin) || null
    sorular.push({
      subject: b.subject,
      q_no: no,
      q_b: sayi(cell(r, b.b)),
      q_c: sayi(cell(r, b.c)),
      q_d: sayi(cell(r, b.d)),
      konu: cell(r, b.konu) || null,
      raw_code: cell(r, b.kod).replace(/\s+/g, '') || null,
      raw_text: rawText,
      outcome_code: null,
      match: 'none',
    })
  })
  sorular.sort((x, y) => DERS_SIRA.indexOf(x.subject) - DERS_SIRA.indexOf(y.subject) || x.q_no - y.q_no)
  return { ad, sinif, sorular, uyarilar }
}

export interface KatalogKazanim {
  code: string
  subject: string
  title: string
  full_text?: string | null
}

/** Deneme motorunun kuralı (public/engine/parser.mjs · match): tam kod, yoksa üst kod (İngilizce hariç); metin çelişirse yok. */
export function kazanimEsle(
  s: Pick<YaklasanSoru, 'subject' | 'raw_code' | 'raw_text'>,
  katalog: KatalogKazanim[],
): { outcome_code: string | null; match: MatchLevel } {
  const yok = { outcome_code: null, match: 'none' as MatchLevel }
  if (!s.raw_code) return yok
  let code = s.raw_code.replace(/\s+/g, '').replace(/\.+$/, '')
  if (s.subject === 'DIN') code = code.replace(/^D\./, '')
  const cs = katalog.filter((o) => o.subject === s.subject)
  let c = cs.find((o) => o.code === code)
  let match: MatchLevel = 'code_exact'
  if (!c && s.subject !== 'ING') {
    c = cs.filter((o) => code.startsWith(o.code + '.')).sort((a, b) => b.code.length - a.code.length)[0]
    match = 'code_inferred'
  }
  if (!c) return yok
  // Metin, kodun önündeki kısım atılarak katalog metniyle karşılaştırılır (kısaltılmış başlıktaki "…" atılır).
  const tx = outcomeText((s.raw_text ?? '').replace(/^\S*\d\.?\s*/, ''))
  const ct = outcomeText((c.full_text || c.title).replace(/…$/, ''))
  if (tx.length > 8 && ct && !ct.startsWith(tx) && !tx.startsWith(ct)) return yok
  return { outcome_code: c.code, match }
}

export function kazanimlariEsle(sorular: YaklasanSoru[], katalog: KatalogKazanim[]): YaklasanSoru[] {
  return sorular.map((s) => ({ ...s, ...kazanimEsle(s, katalog) }))
}

/** Plan: ders|kitapçık|soru → güvenilir kazanım. */
export type Plan = Map<string, { code: string; match: MatchLevel }>
export const planAnahtar = (subject: string, kitapcik: string, no: number) => `${subject}|${kitapcik}|${no}`

export function planOlustur(sorular: Pick<YaklasanSoru, 'subject' | 'q_no' | 'q_b' | 'q_c' | 'q_d' | 'outcome_code' | 'match'>[]): Plan {
  const plan: Plan = new Map()
  for (const s of sorular) {
    if (!s.outcome_code || (s.match !== 'code_exact' && s.match !== 'code_inferred')) continue
    const v = { code: s.outcome_code, match: s.match }
    plan.set(planAnahtar(s.subject, 'A', s.q_no), v)
    if (s.q_b) plan.set(planAnahtar(s.subject, 'B', s.q_b), v)
    if (s.q_c) plan.set(planAnahtar(s.subject, 'C', s.q_c), v)
    if (s.q_d) plan.set(planAnahtar(s.subject, 'D', s.q_d), v)
  }
  return plan
}

/** Ders başına soru sayısı (listede). */
export function dersSayilari(sorular: Pick<YaklasanSoru, 'subject'>[]) {
  const n: Partial<Record<Subject, number>> = {}
  for (const s of sorular) n[s.subject] = (n[s.subject] ?? 0) + 1
  return n
}

// ---------- Sonuç yüklemede öneri ----------
export interface YaklasanOzet {
  id: string
  name: string
  exam_date: string
  grade: number
  exam_id: string | null
}
const kelimeler = (s: string) =>
  new Set(
    outcomeText(s)
      .split(' ')
      .filter((w) => w.length > 1 || /\d/.test(w)),
  )
export function adBenzerligi(a: string, b: string) {
  const x = kelimeler(a)
  const y = kelimeler(b)
  if (!x.size || !y.size) return 0
  let ortak = 0
  for (const w of x) if (y.has(w)) ortak++
  return ortak / Math.max(x.size, y.size)
}

/**
 * Sonucu yüklenmemiş, tarihi geçmiş (ya da bugün) yaklaşan denemeler; en olası olan başta. Öneri yalnız ön seçimdir,
 * kullanıcı değiştirebilir ya da "Hiçbiri" diyebilir.
 */
export function yaklasanOner<T extends YaklasanOzet>(list: T[], o: { ad: string | null; bugun: string; tarih?: string | null }): T[] {
  const gun = (d: string) => Date.parse(d + 'T00:00:00Z') / 864e5
  const ref = o.tarih ?? o.bugun
  return list
    .filter((y) => !y.exam_id && y.grade === 8 && y.exam_date <= o.bugun && gun(o.bugun) - gun(y.exam_date) <= 120)
    .map((y) => ({ y, s: (o.ad ? adBenzerligi(o.ad, y.name) : 0) * 10 - Math.abs(gun(ref) - gun(y.exam_date)) / 30 }))
    .sort((a, b) => b.s - a.s)
    .map((x) => x.y)
}

// ---------- Veli / öğrenci: konu listesi ve tekrar önerisi ----------
export interface KonuSorusu {
  ders: Subject
  no: number
  konu: string | null
  kod: string | null
}
export interface KonuGrubu {
  ders: Subject
  toplam: number
  konular: { konu: string; sayi: number }[]
}
export function konuGruplari(sorular: KonuSorusu[], baslik: (kod: string) => string | undefined): KonuGrubu[] {
  return DERS_SIRA.flatMap((ders) => {
    const qs = sorular.filter((s) => s.ders === ders)
    if (!qs.length) return []
    const m = new Map<string, number>()
    for (const q of qs) {
      const k = q.konu?.trim() || (q.kod ? baslik(q.kod) : undefined) || 'Konusu belirtilmemiş'
      m.set(k, (m.get(k) ?? 0) + 1)
    }
    return [{ ders, toplam: qs.length, konular: [...m].map(([konu, sayi]) => ({ konu, sayi })).sort((a, b) => b.sayi - a.sayi) }]
  })
}

export interface TekrarKonusu {
  ders: Subject
  kod: string
  konu: string
  soru: number // bu denemede kaç soru
  girdigi: number // konudan soru gelen ve okunabilen deneme sayısı
  yanlis: number // bunların kaçında yanlış var
}
/**
 * Bu denemede çıkacak ve öğrencinin önceki denemelerinde yanlış yaptığı kazanımlar (yalnız güvenilir eşleşmeler; okunamayan
 * deneme sayılmaz). Sınıf sıralaması yok; öğrenci yalnız kendisiyle karşılaştırılır.
 */
export function tekrarKonulari(ds: Dataset, sid: string, sorular: KonuSorusu[], enCok = 5): TekrarKonusu[] {
  const ex = studentExams(ds, sid)
  const kodlar = new Map<string, { ders: Subject; konu: string; soru: number }>()
  for (const q of sorular) {
    if (!q.kod) continue
    const cur = kodlar.get(q.kod)
    if (cur) cur.soru++
    else kodlar.set(q.kod, { ders: q.ders, konu: q.konu?.trim() || ds.outcomes.find((o) => o.code === q.kod)?.title || 'Konu', soru: 1 })
  }
  const out: TekrarKonusu[] = []
  for (const [kod, v] of kodlar) {
    const hist = ex.map((x) => konuStatus(x.result, questionsFor(ds, x.result), v.ders, kod))
    const girdigi = hist.filter((h) => h === 'y' || h === 'd' || h === 'b').length
    const yanlis = hist.filter((h) => h === 'y').length
    if (yanlis > 0) out.push({ ders: v.ders, kod, konu: v.konu, soru: v.soru, girdigi, yanlis })
  }
  return out.sort((a, b) => b.yanlis - a.yanlis || b.yanlis / b.girdigi - a.yanlis / a.girdigi || b.soru - a.soru).slice(0, enCok)
}
