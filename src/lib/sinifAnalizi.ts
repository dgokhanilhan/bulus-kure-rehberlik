// Sınıf analizi: bir şubenin bütün denemeleri boyunca her öğrencinin süreci, sıralaması ve sınıfın ortak eksikleri.
// Saf fonksiyonlar (arayüzden bağımsız, birim testli). Kurallar (CLAUDE.md):
//  - Sonuç (D/Y/B/net/puan) exam_results'tan okunur; tahmin yok. Denemeye girmeyen öğrenci o denemede "—"dir, sıfır sayılmaz.
//  - Konu analizi yalnız güvenilir kazanım eşleşmesiyle (konuStatus / repeats aynı kuralı uygular).
//  - Sıralama yalnız öğretmen/yönetici ekranı içindir; veli ve öğrenci ekranına girmez (kural 3).
import { indexResults, konuStatus, questionsFor, repeats, totalNet, type Dataset, type Exam, type Outcome, type Result, type Subject } from './analiz'

export interface SinifOgrenci {
  id: string
  full_name: string
  school_no?: string | null
  target_score?: number | null
}
export interface SinifGorev {
  student_id: string
  due_date: string
  completed_at: string | null
}
export interface SinifGorusme {
  student_id: string
  starts_at: string
}
export interface SinifDevamsizlik {
  student_id: string
  day: string
  status: string
}
export interface SinifAyar {
  /** Bu kadar net düşüş "düşüşte" sayılır (Bugün ayarıyla aynı: analiz.bugun.net_dusus). */
  netDusus: number
  /** Son görüşmeden bu kadar gün geçtiyse "görüşme yok". */
  gorusmeGun: number
}
export const VARSAYILAN_AYAR: SinifAyar = { netDusus: 3, gorusmeGun: 60 }

export interface Hucre {
  /** Denemeye girmediyse null */
  score: number | null
  net: number | null
  rank: number | null
}
export interface OgrenciSatiri {
  student: SinifOgrenci
  hucreler: Hucre[] // denemeler sırasıyla
  son: Hucre | null
  onceki: Hucre | null
  /** Sıra değişimi: pozitif = yükseldi (ör. 7. → 4. = +3) */
  siraDegisim: number | null
  netDegisim: number | null
  ortalamaNet: number | null
  katildigi: number
  /** Son denemede başarı yüzdesi en düşük ders (net / soru) */
  zayifDers: { code: Subject; pct: number } | null
  dersYuzde: Partial<Record<Subject, number>>
  tekrarEden: number
  hedefFark: number | null
  acikGorev: number
  gecikenGorev: number
  sonGorusme: string | null
  devamsiz: number
  isaretler: Isaret[]
}
export type Isaret = 'dusus' | 'iki_dusus' | 'hedef_alti' | 'gorusme_yok' | 'yukselis'
export const ISARET_TR: Record<Isaret, string> = {
  dusus: 'Son denemede düşüş',
  iki_dusus: '2 denemedir düşüş',
  hedef_alti: 'Hedefin altında',
  gorusme_yok: 'Uzun süredir görüşme yok',
  yukselis: 'Yükselişte',
}
export interface KonuSatiri {
  outcome: Outcome
  yanlis: string[] // öğrenci kimlikleri (son denemede yanlış)
  soruldu: number // son denemede bu konuda sorusu olan öğrenci sayısı
}
export interface Bulgu {
  tur: 'up' | 'down' | 'n'
  metin: string
}
export interface SinifAnalizi {
  denemeler: Exam[]
  satirlar: OgrenciSatiri[]
  ozet: {
    ogrenci: number
    deneme: number
    katilim: number | null // 0–1
    sonOrtPuan: number | null
    sonOrtNet: number | null
    oncekiOrtNet: number | null
    dersOrt: { code: Subject; son: number | null; onceki: number | null }[]
  }
  konular: KonuSatiri[]
  bulgular: Bulgu[]
}

const ort = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null)
const gun = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a.slice(0, 10))) / 86_400_000)

/** Puan (yoksa toplam net) ile yarışma sıralaması: eşitler aynı sırayı alır (1, 2, 2, 4). Girmeyen sıralanmaz. */
export function siralama(rs: { id: string; score: number | null; net: number }[]): Map<string, number> {
  const key = (r: { score: number | null; net: number }) => r.score ?? r.net
  const s = [...rs].sort((a, b) => key(b) - key(a))
  const out = new Map<string, number>()
  s.forEach((r, i) => out.set(r.id, i > 0 && key(r) === key(s[i - 1]!) ? out.get(s[i - 1]!.id)! : i + 1))
  return out
}

export function sinifAnalizi(
  ds: Dataset,
  ogrenciler: SinifOgrenci[],
  ek: { gorevler?: SinifGorev[]; gorusmeler?: SinifGorusme[]; devamsizlik?: SinifDevamsizlik[]; bugun: string; ayar?: Partial<SinifAyar> },
): SinifAnalizi {
  const ayar = { ...VARSAYILAN_AYAR, ...ek.ayar }
  const idx = indexResults(ds.results)
  // Bu şubeden en az bir öğrencinin girdiği denemeler (tarih sırası)
  const denemeler = ds.exams.filter((e) => ogrenciler.some((s) => idx.has(`${e.id}|${s.id}`)))
  const sonuc = (e: Exam, sid: string): Result | undefined => idx.get(`${e.id}|${sid}`)
  const siralar = denemeler.map((e) =>
    siralama(
      ogrenciler.flatMap((s) => {
        const r = sonuc(e, s.id)
        return r ? [{ id: s.id, score: r.score, net: totalNet(r) }] : []
      }),
    ),
  )
  const sonE = denemeler.at(-1)
  const satirlar: OgrenciSatiri[] = ogrenciler.map((s) => {
    const hucreler: Hucre[] = denemeler.map((e, i) => {
      const r = sonuc(e, s.id)
      return r ? { score: r.score, net: totalNet(r), rank: siralar[i]!.get(s.id) ?? null } : { score: null, net: null, rank: null }
    })
    const girdi = hucreler.map((h, i) => ({ h, i })).filter((x) => x.h.net !== null)
    const son = girdi.at(-1)?.h ?? null
    const onceki = girdi.at(-2)?.h ?? null
    const ucuncu = girdi.at(-3)?.h ?? null
    const netDegisim = son && onceki ? son.net! - onceki.net! : null
    const siraDegisim = son?.rank && onceki?.rank ? onceki.rank - son.rank : null
    // Ders yüzdeleri: öğrencinin girdiği son deneme
    const sonR = girdi.length ? sonuc(denemeler[girdi.at(-1)!.i]!, s.id) : undefined
    const dersYuzde: Partial<Record<Subject, number>> = {}
    for (const d of ds.subjects) {
      const v = sonR?.subjects[d.code]
      if (v && d.q > 0) dersYuzde[d.code] = Math.max(0, Math.min(100, (v.net / d.q) * 100))
    }
    const zayif = Object.entries(dersYuzde).sort((a, b) => a[1]! - b[1]!)[0]
    const gorevler = (ek.gorevler ?? []).filter((t) => t.student_id === s.id && !t.completed_at)
    const sonGorusme = (ek.gorusmeler ?? [])
      .filter((m) => m.student_id === s.id && m.starts_at.slice(0, 10) <= ek.bugun)
      .map((m) => m.starts_at.slice(0, 10))
      .sort()
      .at(-1) ?? null
    const hedefFark = s.target_score != null && son?.score != null ? son.score - s.target_score : null
    const isaretler: Isaret[] = []
    if (netDegisim !== null && netDegisim <= -ayar.netDusus) isaretler.push('dusus')
    if (son && onceki && ucuncu && son.net! < onceki.net! && onceki.net! < ucuncu.net!) isaretler.push('iki_dusus')
    if (hedefFark !== null && hedefFark < 0) isaretler.push('hedef_alti')
    if (!sonGorusme || gun(sonGorusme, ek.bugun) > ayar.gorusmeGun) isaretler.push('gorusme_yok')
    if (netDegisim !== null && netDegisim >= ayar.netDusus) isaretler.push('yukselis')
    return {
      student: s,
      hucreler,
      son,
      onceki,
      siraDegisim,
      netDegisim,
      ortalamaNet: ort(girdi.map((x) => x.h.net!)),
      katildigi: girdi.length,
      zayifDers: zayif ? { code: zayif[0], pct: zayif[1]! } : null,
      dersYuzde,
      tekrarEden: girdi.length ? repeats(ds, s.id, undefined, idx).length : 0,
      hedefFark,
      acikGorev: gorevler.length,
      gecikenGorev: gorevler.filter((t) => t.due_date < ek.bugun).length,
      sonGorusme,
      devamsiz: (ek.devamsizlik ?? []).filter((a) => a.student_id === s.id && a.status === 'devamsiz').length,
      isaretler,
    }
  })

  // Özet
  const netler = (e: Exam | undefined) => (e ? ogrenciler.flatMap((s) => (sonuc(e, s.id) ? [totalNet(sonuc(e, s.id)!)] : [])) : [])
  const oncekiE = denemeler.at(-2)
  const girisSay = denemeler.reduce((a, e) => a + ogrenciler.filter((s) => sonuc(e, s.id)).length, 0)
  const dersOrt = ds.subjects.map((d) => {
    const o = (e: Exam | undefined) =>
      ort(e ? ogrenciler.flatMap((s) => (sonuc(e, s.id)?.subjects[d.code] ? [sonuc(e, s.id)!.subjects[d.code]!.net] : [])) : [])
    return { code: d.code, son: o(sonE), onceki: o(oncekiE) }
  })
  const ozet = {
    ogrenci: ogrenciler.length,
    deneme: denemeler.length,
    katilim: denemeler.length && ogrenciler.length ? girisSay / (denemeler.length * ogrenciler.length) : null,
    sonOrtPuan: ort(sonE ? ogrenciler.flatMap((s) => (sonuc(sonE, s.id)?.score != null ? [sonuc(sonE, s.id)!.score!] : [])) : []),
    sonOrtNet: ort(netler(sonE)),
    oncekiOrtNet: ort(netler(oncekiE)),
    dersOrt,
  }

  // Son denemede sınıfın ortak yanlış konuları (güvenilir eşleşme; konuStatus 'y' = yanlış)
  const konular: KonuSatiri[] = []
  if (sonE) {
    for (const o of ds.outcomes) {
      let soruldu = 0
      const yanlis: string[] = []
      for (const s of ogrenciler) {
        const r = sonuc(sonE, s.id)
        if (!r) continue
        const st = konuStatus(r, questionsFor(ds, r), o.subject, o.code)
        if (st === 'n' || st === 'x' || st === 'o') continue // sorulmadı / girmedi / okunamadı (güvenilir değil)
        soruldu++
        if (st === 'y') yanlis.push(s.id)
      }
      if (yanlis.length) konular.push({ outcome: o, yanlis, soruldu })
    }
    konular.sort((a, b) => b.yanlis.length / b.soruldu - a.yanlis.length / a.soruldu || b.yanlis.length - a.yanlis.length)
  }

  // Bulgular: yalnız veriden, sayıyla
  const bulgular: Bulgu[] = []
  const ad = (code: Subject) => ds.subjects.find((x) => x.code === code)?.ad ?? code
  if (ozet.sonOrtNet !== null && ozet.oncekiOrtNet !== null) {
    const d = ozet.sonOrtNet - ozet.oncekiOrtNet
    if (Math.abs(d) >= 1) bulgular.push({ tur: d > 0 ? 'up' : 'down', metin: `Sınıfın toplam net ortalaması son denemede ${d > 0 ? 'yükseldi' : 'düştü'}: ${fmt1(d)} net.` })
  }
  for (const d of dersOrt) {
    if (d.son === null || d.onceki === null) continue
    const x = d.son - d.onceki
    if (Math.abs(x) >= 1.5) bulgular.push({ tur: x > 0 ? 'up' : 'down', metin: `${ad(d.code)} ortalaması ${x > 0 ? 'yükseldi' : 'düştü'}: ${fmt1(x)} net.` })
  }
  const iki = satirlar.filter((r) => r.isaretler.includes('iki_dusus')).length
  if (iki) bulgular.push({ tur: 'down', metin: `${iki} öğrencinin toplam neti 2 denemedir düşüyor.` })
  const hedef = satirlar.filter((r) => r.isaretler.includes('hedef_alti')).length
  if (hedef) bulgular.push({ tur: 'n', metin: `${hedef} öğrenci son denemede hedef puanının altında.` })
  const gor = satirlar.filter((r) => r.isaretler.includes('gorusme_yok')).length
  if (gor) bulgular.push({ tur: 'n', metin: `${gor} öğrenciyle ${ayar.gorusmeGun} gündür görüşme yapılmamış.` })
  const k = konular.find((x) => x.soruldu >= 3 && x.yanlis.length / x.soruldu >= 0.5)
  if (k)
    bulgular.push({
      tur: 'down',
      metin: `Son denemede sınıfın yarısından fazlası (${k.yanlis.length}/${k.soruldu}) aynı konuda yanlış yaptı: ${k.outcome.display ?? k.outcome.code} ${k.outcome.title}.`,
    })
  return { denemeler, satirlar, ozet, konular: konular.slice(0, 12), bulgular }
}

const fmt1 = (n: number) => (n > 0 ? '+' : '') + (Math.round(n * 10) / 10).toFixed(1).replace('.', ',')
