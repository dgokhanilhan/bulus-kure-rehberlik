import { questionsFor } from './analiz'
// Veli raporu: kural tabanlı taslak + yapay zekâ için anonim veri (docs/veli-raporu-kurallari.md).
// Regresyon kilidi: yalnız metin üretir; D/Y/B, net, puan ve eşleştirmeleri değiştirmez.
import {
  indexResults,
  repeats,
  studentExams,
  totalNet,
  wrongOutcomes,
  fmt,
  outcomeCode,
  type Dataset,
  type Repeat,
  type Result,
  type Subject,
  type SubjectDef,
} from './analiz'
import { FORBIDDEN, findForbidden } from '../../supabase/functions/_shared/rapor-ai'
import { yarimBasliklar } from './baslik'

export { FORBIDDEN, findForbidden }

export interface VeliBody {
  genel: string
  guclu: string
  gelisim: string
  oneriler: string // her satır bir öneri
  mentor: string
  rehber: string
  ai: boolean
}
export interface OgretmenBody {
  toplanti: string
}

const LOC_TR: Record<string, string> = {
  TUR: 'Türkçede',
  MAT: 'Matematikte',
  FEN: 'Fen Bilimlerinde',
  INK: 'İnkılap Tarihinde',
  DIN: 'Din Kültüründe',
  ING: 'İngilizcede',
  TDE: 'Türk Dili ve Edebiyatında',
  SOS: 'Sosyal Bilgilerde',
  TAR: 'Tarihte',
  COG: 'Coğrafyada',
  FEL: 'Felsefede',
  FIZ: 'Fizikte',
  KIM: 'Kimyada',
  BIY: 'Biyolojide',
}
/** "Matematikte" gibi bulunma hâli: LGS ve genel dersler; bölüm anahtarı farklıysa (FEL2) ders kodundan, yoksa "X dersinde". */
const loc = (s: SubjectDef) => LOC_TR[s.code] ?? (s.base ? LOC_TR[s.base] : undefined) ?? `${s.ad} dersinde`
const lj = (a: string[]) => (a.length < 2 ? a.join('') : `${a.slice(0, -1).join(', ')} ve ${a.at(-1)}`)
const dz = (a: string[]) => lj(a) + (a.length > 1 ? ' derslerinde' : ' dersinde')
/** Cümle içinde de büyük harfle kalan özel adlar (kesme işaretinden önceki kök küçük harfle). */
const OZEL_AD = new Set(
  (
    'mustafa kemal atatürk türkiye türk türkçe ingilizce osmanlı anadolu rumeli trakya avrupa asya afrika amerika istanbul ankara izmir ' +
    'lozan sevr mondros mudanya erzurum sivas amasya samsun sakarya çanakkale selanik havza inönü dumlupınar kuva-yi milliye misak-ı ' +
    'tbmm hz. allah kur kerim kâbe mekke medine muhammed peygamber isa musa ibrahim nuh yusuf lokman ehlibeyt ' +
    'akdeniz karadeniz ege marmara dünya güneş ay'
  ).split(' '),
)
const ozelAd = (w: string) => OZEL_AD.has(w.split(/[’']/)[0]!.toLocaleLowerCase('tr'))
/** Konu adını cümle içine alır: ilk harf küçülür; "DNA" gibi kısaltmalar ve "Mustafa Kemal’in" gibi özel adlar korunur. */
export const lc = (t: string) =>
  t
    .split(' ')
    .map((w) => ((w.length > 1 && w === w.toLocaleUpperCase('tr')) || ozelAd(w) ? w : w.toLocaleLowerCase('tr')))
    .join(' ')
const hash = (s: string) => [...s].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619), 2166136261) >>> 0

export interface ReportData {
  /** Veri setinin dersleri (LGS: 6 sabit ders; genel: şablon bölümleri). */
  subjects: SubjectDef[]
  exams: { name: string; date: string; result: Result }[] // bu denemeye kadar, eskiden yeniye
  cur: Result
  prev?: Result
  rep: Repeat[]
  lastWrong: {
    subject: Subject
    title: string
    rawTitle?: string
    code: string
    source?: 'official' | 'pdf'
    outcomeType?: 'KAZANIM' | 'OGRENME_CIKTISI'
    /** Başlık kaynakta (yayınevi PDF'i) yarım kesilmiş; tamamlanamadıysa veliye tek tek yazılmaz. */
    eksik?: boolean
  }[]
  kzMissing: boolean
}

export function reportData(ds: Dataset, sid: string, eid: string): ReportData | null {
  const idx = indexResults(ds.results)
  const target = ds.exams.find((e) => e.id === eid)
  if (!target) return null
  const all = studentExams(ds, sid, idx)
  const targetIndex = all.findIndex((x) => x.exam.id === eid)
  if (targetIndex < 0) return null
  const ex = all.slice(0, targetIndex + 1)
  const cur = ex.at(-1)!
  const w = wrongOutcomes(ds, cur.result)
  const yarim = yarimBasliklar(ds.outcomes.filter((o) => o.source === 'pdf' && !o.isTopic))
  const qs = questionsFor(ds, cur.result)
  const reliable =
    !!cur.result.topics?.length ||
    (!!cur.result.kazanim && Object.keys(cur.result.kazanim.g).length > 0) ||
    (cur.result.outcomes_ok && qs.some((q) => q.outcome_code && ['code_exact', 'code_inferred', 'text_exact', 'text_match'].includes(q.match)))
  return {
    subjects: ds.subjects,
    exams: ex.map((x) => ({ name: x.exam.name, date: x.exam.exam_date, result: x.result })),
    cur: cur.result,
    prev: ex.at(-2)?.result,
    rep: repeats(ds, sid, eid, idx),
    lastWrong: w.wrong.map((o) => ({
      subject: o.subject,
      title: o.fullTitle ?? o.title,
      rawTitle: o.rawTitle,
      eksik: o.source === 'pdf' && !o.isTopic && yarim.has(o.title),
      code: outcomeCode(o),
      source: o.source,
      outcomeType: o.outcomeType,
    })),
    kzMissing: !reliable,
  }
}

type Level = 'high' | 'mid' | 'low'
/** Konunun raporda kullanılan adı: eski katalogda kısa adı kesikse tam metni. */
const adi = (o: { title: string; fullTitle?: string }) => o.fullTitle ?? o.title
/** Cümle içinde konu adı: uzun (cümle gibi) kazanım metni tırnak içinde aynen, kısa konu adı küçük harfle. */
const ka = (t: string) => (t.length > 35 ? `“${t.replace(/\.$/, '')}”` : lc(t))
/** Konu listesi: adlardan birinde zaten "ve" geçiyorsa son bağlaç "ile" olur ("çarpanlar ve katlar ile cebirsel ifadeler"). */
const kj = (a: string[]) => (a.length > 1 && a.some((x) => / ve /.test(x)) ? `${a.slice(0, -1).join(', ')} ile ${a.at(-1)}` : lj(a))
const cap = (t: string) => (t.startsWith('“') ? t : t.charAt(0).toLocaleUpperCase('tr') + t.slice(1))
function analyse(R: ReportData) {
  const x = R.cur
  const net = totalNet(x)
  // Eşikler LGS'nin 90 sorusunda 78 / 55 net; genel denemede aynı oranlar o denemenin soru toplamına göre (LGS'de toplam 90: birebir aynı)
  const max = R.subjects.reduce((a, s) => a + s.q, 0) || 90
  const level: Level = net >= (78 / 90) * max - 1e-9 ? 'high' : net >= (55 / 90) * max - 1e-9 ? 'mid' : 'low'
  const dn = R.prev ? net - totalNet(R.prev) : 0
  const son5 = R.exams.slice(-5)
  const dd = R.subjects
    .map((s) => {
      const q = x.subjects[s.code]
      // Yalnız dersin gerçekten okunduğu denemeler (olmayan ders 0 sayılmaz)
      const h5 = son5.map((e) => e.result.subjects[s.code]?.net).filter((v): v is number => typeof v === 'number')
      return {
        s,
        n: q?.net ?? 0,
        p: R.prev?.subjects[s.code]?.net,
        d: q?.d ?? 0,
        y: q?.y ?? 0,
        b: q?.b ?? 0,
        r: (q?.net ?? 0) / s.q,
        hist: h5.slice(-3),
        h5,
        has: !!q,
      }
    })
    .filter((d) => d.has)
  // Çok denemelik eğilim: en az 3 deneme, ilk ile son arasında en az 2 net fark ve eğim aynı yönde (en küçük kareler)
  const egim = (v: number[]) => {
    const n = v.length
    const mx = (n - 1) / 2
    const my = v.reduce((a, b) => a + b, 0) / n
    const num = v.reduce((a, y, i) => a + (i - mx) * (y - my), 0)
    const den = v.reduce((a, _, i) => a + (i - mx) ** 2, 0)
    return den ? num / den : 0
  }
  const yon = (q: { h5: number[] }): 'up' | 'down' | null => {
    if (q.h5.length < 3) return null
    const f = q.h5[0]!
    const l = q.h5.at(-1)!
    const e = egim(q.h5)
    return l - f >= 2 && e > 0 ? 'up' : l - f <= -2 && e < 0 ? 'down' : null
  }
  const upTrend = dd.filter((q) => yon(q) === 'up')
  const downTrend = dd.filter((q) => yon(q) === 'down').sort((a, b) => a.h5.at(-1)! - a.h5[0]! - (b.h5.at(-1)! - b.h5[0]!))
  const rising = dd.filter((q) => q.hist.length >= 3 && q.hist[2]! > q.hist[1]! && q.hist[1]! > q.hist[0]!)
  const falling = dd.filter((q) => q.p != null && q.n - q.p <= -1.5).sort((a, b) => a.n - a.p! - (b.n - b.p!))
  const relRep = R.kzMissing ? [] : R.rep.filter((r) => r.count >= 2)
  // Güçlü ders: yüksek oran, gerilemiyor ve birden çok denemede tekrar eden hatası yok (çelişkili cümle kurulmaz)
  const strong = dd.filter((q) => q.r >= 0.8 && !falling.includes(q) && !downTrend.includes(q) && !relRep.some((r) => r.outcome.subject === q.s.code))
  const blanks = dd.filter((q) => q.b >= 3)
  const kind: 'up' | 'down' | 'flat' = !R.prev ? 'flat' : dn >= 1.5 ? 'up' : dn <= -1.5 ? 'down' : 'flat'
  const tumNet = son5.map((e) => totalNet(e.result))
  const rekor = son5.length >= 3 && tumNet.slice(0, -1).every((v) => net > v + 1e-9)
  return { net, level, dn, dd, rising, falling, strong, blanks, relRep, kind, upTrend, downTrend, rekor, n5: son5.length }
}

/**
 * Kural tabanlı taslak (yapay zekâ olmadan varsayılan metin).
 * Öğrencinin adı metne yazılmaz; "öğrencimiz" denir. Ad parametresi geriye uyumluluk için durur.
 * Bu denemede yanlış çıkan bütün konular ya metinde ya da raporun konu tablosunda yer alır; eğilim son 3–5 denemeden okunur;
 * öneriler sayıyla somutlaştırılır. Tek yanlıştan konu eksiği sonucu çıkarılmaz (§8).
 */
export function genVeli(R: ReportData, _fullName: string, seed: string): VeliBody {
  const A = analyse(R)
  const { level, dn, dd, falling, strong, blanks, relRep, kind, upTrend, downTrend, rekor, n5 } = A
  const h = hash(seed)
  const pick = (arr: string[], o = 0) => arr[(h + o) % arr.length]!
  const f2 = (v: number) => fmt(v, 2)
  const best = dd.slice().sort((a, b) => b.r - a.r)[0]
  const weak = dd.slice().sort((a, b) => a.r - b.r)[0]
  const sd = (code: Subject) => R.subjects.find((x) => x.code === code) ?? { code, ad: code, short: code, q: 0 }
  // Belirgin biçimde geride kalan ders (yüksek seviyede ya da dersler birbirine yakınken "destek gerekiyor" denmez)
  const lag = weak && best && weak !== best && level !== 'high' && best.r - weak.r >= 0.15 ? weak : undefined
  const anaDusus = downTrend[0]

  // ---------- Konular: bu denemenin yanlışları + birden çok denemede tekrar edenler ----------
  const yanlis = R.kzMissing ? [] : R.lastWrong.filter((w) => !w.eksik)
  const repAd = (r: Repeat) => adi(r.outcome)
  const yanlisAd = new Set(yanlis.map((w) => w.title))
  // Metinde anılan tekrarlar: bu denemede de yanlış olanlar ya da en az 3 denemede yanlış çıkmış olanlar
  const anRep = relRep.filter((r) => yanlisAd.has(repAd(r)) || r.count >= 3)
  const dersler: Subject[] = []
  for (const s of R.subjects) if (yanlis.some((w) => w.subject === s.code) || anRep.some((r) => r.outcome.subject === s.code)) dersler.push(s.code)
  const grup = dersler.map((code) => {
    const reps = anRep.filter((r) => r.outcome.subject === code)
    const repSet = new Set(reps.map(repAd))
    const diger = yanlis.filter((w) => w.subject === code && !repSet.has(w.title)).map((w) => w.title)
    return { code, reps, diger: [...new Set(diger)] }
  })
  const coklu = grup.filter((g) => g.reps.length || g.diger.length >= 2)
  const tekli = grup.filter((g) => !g.reps.length && g.diger.length === 1)

  // ---------- Genel değerlendirme ----------
  let genel: string
  if (!R.prev)
    genel = `Bu deneme, öğrencimiz için elimizdeki ilk deneme; toplam neti ${f2(A.net)}. ${
      level === 'high'
        ? 'Başlangıç noktası olarak güçlü bir tablo var.'
        : level === 'mid'
          ? 'Ortaya çıkan tablo, üzerine rahatlıkla inşa edilebilecek bir başlangıç.'
          : 'Bu sonuç, önümüzdeki haftalar için iyi bir başlangıç noktası olacak.'
    } İlk denemelerde amaç bir hüküm vermek değil; öğrencimizin hangi derste rahat ettiğini, hangi derste daha çok desteğe ihtiyaç duyduğunu görmek. Bundan sonraki denemelerle birlikte gelişimini daha net izleyebileceğiz.`
  else {
    const pn = totalNet(R.prev)
    const fark = dd.filter((q) => q.p != null).map((q) => ({ q, df: q.n - q.p! }))
    if (kind === 'up') {
      const k = fark.slice().sort((a, b) => b.df - a.df)[0]
      genel = `${pick(['Bu denemede', 'Bu denemeyle birlikte'])} öğrencimizin toplam neti ${f2(A.net)} oldu; önceki denemeye göre ${fmt(dn)} net daha yüksek${
        rekor ? ` ve son ${n5} denemenin en yüksek sonucu` : ''
      }. ${k && k.df >= 1 ? `Artışın en büyük kısmı ${k.q.s.ad} bölümünden geliyor (${f2(k.q.p!)} → ${f2(k.q.n)}).` : 'Artış birkaç farklı dersteki küçük gelişmelerden geliyor.'}`
    } else if (kind === 'down') {
      const k = fark.slice().sort((a, b) => a.df - b.df)[0]
      genel = `${pick(['Bu denemede', 'Bu denemeyi öncekiyle karşılaştırdığımızda'])} öğrencimizin toplam neti ${f2(A.net)}; önceki denemeye göre ${fmt(-dn)} net daha düşük. ${
        k && k.df <= -1
          ? `Düşüşün en büyük kısmı ${k.q.s.ad} bölümünde (${f2(k.q.p!)} → ${f2(k.q.n)}); düşüş tüm derslere yayılmış değil.`
          : 'Bu düşüş birkaç dersteki küçük kayıpların toplamından oluşuyor.'
      } Tek bir denemeden kesin sonuç çıkarmak doğru olmaz; önümüzdeki denemede bu tabloyu birlikte izleyeceğiz.`
    } else
      genel = `${pick(['Genel tabloya baktığımızda', 'Bu denemeyi öncekiyle karşılaştırdığımızda', 'Son denemelerle birlikte değerlendirdiğimizde'])} öğrencimizin toplam neti önceki denemeye çok yakın (${f2(pn)} → ${f2(A.net)}). ${
        strong.length ? `${lj(strong.map((q) => q.s.ad).slice(0, 2))} tarafında güçlü duruşunu koruyor.` : ''
      } ${coklu.length ? 'Burada büyük bir konu eksiğinden çok birkaç konudaki yanlışların neti etkilediği bir tablo var.' : 'Önümüzdeki süreçte hedef, mevcut seviyeyi koruyarak küçük ama istikrarlı artışlar yakalamak.'}`
    const ust = upTrend.filter((q) => !genel.includes(q.s.ad))[0]
    if (anaDusus)
      genel += ` ${loc(anaDusus.s)} ise son ${anaDusus.h5.length} denemede net ${f2(anaDusus.h5[0]!)} → ${f2(anaDusus.h5.at(-1)!)} şeklinde aşağı yönlü; bu, önümüzdeki dönemin ana odağı olacak.`
    else if (ust && kind !== 'down')
      genel += ` ${loc(ust.s)} son ${ust.h5.length} denemedir yükselen bir çizgi var (${f2(ust.h5[0]!)} → ${f2(ust.h5.at(-1)!)}).`
  }
  if (lag && lag !== anaDusus) genel += ` Ders bazında bakıldığında ${lag.s.ad}, şu an en çok desteğe ihtiyaç duyduğu alan olarak öne çıkıyor.`
  if (level === 'high')
    genel += ' Genel performans oldukça güçlü; bu aşamada büyük konu tekrarlarından çok, kalan birkaç yanlışın nedenini doğru belirlemek önemli.'
  if (level === 'low') genel += ' Şu aşamada bütün dersleri aynı anda yükseltmeye çalışmak yerine birkaç temel hedef belirlemek daha doğru olacak.'

  // ---------- Güçlü yönler ----------
  const gp: string[] = []
  for (const q of strong.slice(0, 3))
    gp.push(q.y === 0 ? `${loc(q.s)} hiç yanlış yok (${q.d} doğru).` : `${loc(q.s)} ${q.s.q} sorudan ${q.d} doğru, net ${f2(q.n)}.`)
  for (const q of upTrend.filter((u) => !strong.slice(0, 3).includes(u)).slice(0, 2))
    gp.push(`${q.s.ad} netlerinde son ${q.h5.length} denemede belirgin bir artış var (${f2(q.h5[0]!)} → ${f2(q.h5.at(-1)!)}).`)
  const anilan = new Set([...strong.slice(0, 3), ...upTrend.slice(0, 2)])
  const upNow = dd.filter((q) => q.p != null && q.n - q.p >= 1 && !anilan.has(q))
  if (upNow.length) gp.push(`${dz(upNow.map((q) => q.s.ad).slice(0, 2))} de önceki denemeye göre artış var; bu küçük ilerlemeler de değerli.`)
  if (!gp.length && best) gp.push(`Bu denemede belirgin bir öne çıkan ders olmasa da ${best.s.ad} öğrencimizin en rahat ettiği alan olarak görünüyor (net ${f2(best.n)}).`)
  let guclu = gp.join(' ')
  if (guclu)
    guclu += pick([
      level === 'high'
        ? ' Bu dengeli tablo, kurduğu çalışma düzeninin işe yaradığını gösteriyor.'
        : ' Güçlü olduğu derslerdeki çalışma alışkanlığı, zorlandığı derslere de örnek olabilir.',
      ' Bu derslerdeki emeğinin kendisine hatırlatılması, diğer derslere de aynı özenle yaklaşmasını kolaylaştırır.',
    ])

  // ---------- Geliştirilecek alanlar ----------
  let gelisim: string
  if (R.kzMissing) {
    const w = falling[0] ?? lag
    const x = w && R.cur.subjects[w.s.code]
    gelisim = w
      ? `${loc(w.s)} yanlış sayısı dikkat çekiyor (${x ? `${x.d} doğru, ${x.y} yanlış${x.b ? `, ${x.b} boş` : ''}` : ''}). Bu denemede konu bilgisi net okunamadığı için belirli bir konu hakkında kesin yorum yapmak yerine yanlış soruların öğrencimizle birlikte yeniden incelenmesi daha doğru olacaktır.`
      : `${level === 'high' ? 'Yanlış sayısı az ve farklı derslere dağılmış durumda. ' : ''}Bu denemede konu bilgisi net okunamadığı için yanlış soruların öğrencimizle birlikte yeniden incelenmesi daha doğru olacaktır.`
  } else if (grup.length) {
    const par: string[] = []
    let tekrarDendi = false
    const tekrarCumle = (n: number, uc: boolean) => {
      if (!uc) return ` ${n > 1 ? 'Bu konular' : 'Bu konu'} iki farklı denemede yanlış çıktı; takip etmekte fayda var.`
      if (tekrarDendi) return ` ${n > 1 ? 'Bunlar da' : 'Bu da'} farklı denemelerde tekrar ediyor.`
      tekrarDendi = true
      return ` ${n > 1 ? 'Bu konular' : 'Bu konu'} artık tek bir sınava özgü bir hata gibi görünmüyor; farklı denemelerde tekrar ediyor.`
    }
    // Metinde en çok 4 ders ayrıntılı anılır; bütün konular aşağıdaki tabloda zaten listelenir.
    for (const g of coklu.slice(0, 4)) {
      const s = sd(g.code)
      const buKonular = new Set(yanlis.filter((w) => w.subject === g.code).map((w) => w.title))
      const simdi = g.reps.filter((r) => buKonular.has(repAd(r)))
      const once = g.reps.filter((r) => !buKonular.has(repAd(r)) && r.count >= 3)
      let t = ''
      let anildi = false
      if (simdi.length) {
        const l = kj(simdi.slice(0, 2).map((r) => ka(repAd(r))))
        t =
          buKonular.size === simdi.length
            ? `${loc(s)} bu denemede yanlış çıkan ${l} daha önceki denemelerde de yanlış çıkmıştı.`
            : `${loc(s)} bu denemede ${buKonular.size} konuda yanlış var; bunlardan ${l} daha önceki denemelerde de yanlış çıkmıştı.`
        t += tekrarCumle(simdi.length, simdi.some((r) => r.count >= 3))
        anildi = true
      }
      // Bu denemede yanlış olmayan ama en az 3 denemede yanlış çıkmış konular tek cümleyle anılır
      if (once.length) {
        t += ` ${anildi ? cap(kj(once.slice(0, 2).map((r) => ka(repAd(r))))) : `${loc(s)} ${kj(once.slice(0, 2).map((r) => ka(repAd(r))))}`} daha önceki denemelerde birden çok kez yanlış çıkmıştı; takibe devam ediyoruz.`
        anildi = true
      }
      if (g.diger.length) {
        const ilk = g.diger.slice(0, 3)
        const kalan = g.diger.length - ilk.length
        const liste = kj(ilk.map(ka))
        t += ` ${anildi ? cap(liste) : `${loc(s)} ${liste}`} ${ilk.length > 1 ? 'konularındaki' : 'konusundaki'} yanlışların tekrar edip etmediğini bir sonraki denemede izleyeceğiz${kalan > 0 ? `; ${kalan} konu daha aşağıdaki tabloda yer alıyor` : ''}.`
      }
      par.push(t.trim())
    }
    if (coklu.length > 4) par.push(`${dz(coklu.slice(4).map((g) => sd(g.code).ad))} yanlış çıkan konular aşağıdaki tabloda yer alıyor.`)
    if (tekli.length) {
      const ilk = tekli.slice(0, 4)
      const kalan = tekli.length - ilk.length
      par.push(
        `${ilk.map((g) => `${loc(sd(g.code))} ${ka(g.diger[0]!)}`).join(', ')} ${ilk.length > 1 ? 'konularında birer' : 'konusunda bir'} yanlış var${
          kalan > 0 ? ` (${kalan} derste daha birer yanlış tabloda)` : ''
        }; tek yanlıştan konu eksiği sonucu çıkarmıyoruz.`,
      )
    }
    const f0 = falling[0]
    if (f0 && !dersler.includes(f0.s.code))
      par.push(`${loc(f0.s)} bu denemede bir miktar gerileme var; yanlışlar belirli bir konuda toplanmıyor, bu yüzden benzer sorulardaki performansı takip etmek daha sağlıklı olacaktır.`)
    gelisim = par.join(' ')
  } else {
    const w = falling[0] ?? lag
    if (w)
      gelisim = `${loc(w.s)} ${falling[0] === w ? 'bu denemede bir miktar gerileme var' : 'netler diğer derslere göre daha geride'} (${w.d} doğru, ${w.y} yanlış${w.b ? `, ${w.b} boş` : ''}). Yanlışlar belirli bir konuda toplanmıyor; tek sorudan hareketle konu eksiği demek doğru olmaz. Benzer sorulardaki performansı takip etmek daha sağlıklı olacaktır.`
    else
      gelisim =
        level === 'high'
          ? 'Kalan yanlışlar farklı konulara dağılmış durumda. Bu, bir konu eksiğinden çok dikkat ve soru kontrolüyle ilgili olabilir; bunu öğrencimizle birlikte değerlendireceğiz.'
          : 'Belirgin bir tekrar eden hata görünmüyor. Yanlış soruların düzenli olarak gözden geçirilmesi yeterli olacaktır.'
  }
  if (blanks.length)
    gelisim += ` ${blanks.map((q) => `${loc(q.s)} ${q.b}`).join(', ')} boş soru var. Bunun konu bilgisinden mi yoksa süre yönetiminden mi kaynaklandığını öğrencimizle birlikte değerlendirmek faydalı olacaktır.`

  // ---------- Öneriler (somut: soru sayısı, gün, süre) ----------
  const oneriler: string[] = []
  for (const r of relRep.slice(0, 2))
    oneriler.push(`${repAd(r).replace(/\.$/, '')}: yanlış sorular yeniden çözülsün, ardından bu konudan 15 soruluk kısa bir tarama testi uygulansın.`)
  const cok = coklu.find((g) => g.diger.length >= 2)
  if (cok)
    oneriler.push(
      `${sd(cok.code).ad}: ${kj(cok.diger.slice(0, 3).map(ka))} konularından 10’ar soru çözülsün; ikinci kez yanlış çıkan konu öne alınır.`,
    )
  if (R.kzMissing) oneriler.push('Bu denemedeki yanlış sorular öğretmenle birlikte tek tek incelenmeli; hangi soru türünde zorlanıldığı böylece netleşir.')
  const odak = anaDusus ?? (!relRep.length && !cok ? lag : undefined)
  if (odak && !oneriler.some((o) => o.startsWith(odak.s.ad)))
    oneriler.push(`${odak.s.ad}: haftada üç gün, 20–30 dakikalık kısa tekrar ve ardından 10–15 soruluk küçük testlerle ilerlemek faydalı olur.`)
  for (const q of blanks.slice(0, 1))
    oneriler.push(
      `${q.s.ad}: haftada 3 gün süre tutarak ${q.s.code === 'TUR' ? '20 paragraf sorusu' : '15–20 soru'} çözülsün; boş bırakma nedenini anlamamıza yardım eder.`,
    )
  const guc = strong.find((q) => q.y > 0 && tekli.some((g) => g.code === q.s.code))
  if (guc) {
    const t = tekli.find((g) => g.code === guc.s.code)!.diger[0]!
    oneriler.push(`${guc.s.ad}: çalışma düzeni aynen korunsun; yanlış çıkan ${ka(t)} sorusuna kısa bir tekrar yeterli.`)
  } else if (upTrend[0])
    oneriler.push(`${upTrend[0].s.ad}: son denemelerdeki yükseliş korunuyor; çalışma düzenini değiştirmek yerine yanlış çıkan birkaç soruya kısa tekrar yeterli.`)
  if (level === 'high') oneriler.push('Soruyu bitirdikten sonra şıkları bir kez daha okuma alışkanlığı, kalan dikkat kaynaklı yanlışları azaltabilir.')
  if (level === 'low') oneriler.push('Önce en hızlı net artışı gelebilecek bir iki alana odaklanmak, ilerlemeyi görmeyi kolaylaştırır.')
  // Genel öneriler yalnız veri azsa
  if (oneriler.length < 3) oneriler.push('Her denemeden sonra yanlış soruların bir deftere yazılıp hafta içinde tekrar çözülmesi faydalı olacaktır.')
  if (oneriler.length < 3) oneriler.push('Haftalık çalışma planında her güne kısa ve düzenli bir soru çözüm zamanı ayrılması yeterli.')

  // ---------- Mentör ----------
  const oncelik = relRep[0] ? ka(repAd(relRep[0])) : null
  const mentor = `Öğrencimizle ${kind === 'down' ? 'bu denemenin sonuçlarını birlikte inceleyeceğiz' : 'çalışma düzenini birlikte gözden geçireceğiz'}. ${
    oncelik
      ? `Önümüzdeki süreçte özellikle ${oncelik} konusunu takip edeceğiz.`
      : (anaDusus ?? lag)
        ? `Önümüzdeki iki hafta önceliğimiz ${(anaDusus ?? lag)!.s.ad} olacak; kısa tekrarlar ve küçük testlerle ilerleyip bir sonraki denemede sonucu birlikte değerlendireceğiz.`
        : 'Hedefimiz mevcut düzeni koruyarak küçük ama istikrarlı adımlarla ilerlemek.'
  } ${pick(['Haftalık planına uyumunu düzenli olarak takip edeceğiz.', 'Her hafta kısa bir görüşmeyle çalışma planının nasıl gittiğine bakacağız.'], 3)}`
  const clean = (s: string) => s.replace(/\s+/g, ' ').trim()
  return {
    genel: clean(genel),
    guclu: clean(guclu),
    gelisim: clean(gelisim),
    oneriler: oneriler.slice(0, 6).join('\n'),
    mentor: clean(mentor),
    rehber: '', // rehber öğretmen yorumu her zaman boş başlar; rehber öğretmen kendisi yazar (§15)
    ai: false,
  }
}

/**
 * Yapay zekâya giden performans verisinde doğrudan kimlik bilgisi yok (ad, soyad, okul, okul no, şube, öğretmen/veli adı,
 * rehberlik notu, mentör/rehber yorumu yok). Deneme adları "Deneme 1…n" olarak gider.
 */
export function aiPayload(R: ReportData) {
  const r2 = (n: number) => Math.round(n * 100) / 100
  const n = R.exams.length
  return {
    denemeSayisi: n,
    sonDeneme: `Deneme ${n}`,
    puan: R.cur.score != null ? r2(R.cur.score) : null,
    toplamNet: r2(totalNet(R.cur)),
    dersler: R.subjects.map((s) => {
      const q = R.cur.subjects[s.code]
      const p = R.prev?.subjects[s.code]
      return { ders: s.ad, soru: s.q, dogru: q?.d ?? null, yanlis: q?.y ?? null, bos: q?.b ?? null, net: q ? r2(q.net) : null, oncekiNet: p ? r2(p.net) : null }
    }),
    gecmis: R.exams
      .slice(-60)
      .map((e, i) => ({
        deneme: `Deneme ${Math.max(0, n - 60) + i + 1}`,
        toplamNet: r2(totalNet(e.result)),
        dersNetleri: Object.fromEntries(R.subjects.map((s) => [s.ad, e.result.subjects[s.code] ? r2(e.result.subjects[s.code]!.net) : null])),
      })),
    guvenilirTekrarEdenHatalar: R.kzMissing
      ? []
      : R.rep
          .slice(0, 80)
          .map((r) => ({
            ders: R.subjects.find((s) => s.code === r.outcome.subject)?.ad ?? r.outcome.subject,
            konu: r.outcome.rawTitle ?? adi(r.outcome),
            kacDenemedeYanlis: r.count,
            kaynak: r.outcome.source ?? 'official',
          })),
    buDenemedeYanlisKonular: R.kzMissing
      ? []
      : R.lastWrong
          .slice(0, 80)
          .map((w) => ({ ders: R.subjects.find((s) => s.code === w.subject)?.ad ?? w.subject, konu: w.rawTitle ?? w.title, kaynak: w.source ?? 'official' })),
    konuBilgisiOkunamadi: R.kzMissing,
  }
}
export type AiPayload = ReturnType<typeof aiPayload>

// ---------- Rapor özeti: velide "Bir Bakışta" (siz), öğrencide "Öğrenci Sürümü" (sen) ----------
// Tam raporun üstünde gösterilir; aynı veriden ve aynı onaylı metinden üretilir (yeni bilgi eklenmez).
export interface OzetKart {
  baslik: string
  metin: string
}
export interface RaporOzet {
  toplamNet: string
  /** Önceki denemeye göre toplam net farkı (ilk denemede null) */
  fark: number | null
  rekor: boolean
  denemeSayisi: number
  dersler: { ad: string; net: number; soru: number; trend: 'up' | 'down' | null }[]
  /** Genel değerlendirmenin ilk iki cümlesi */
  kisaca: string
  /** İlk üç öneri */
  oncelikler: string[]
  /** Veliye: evde yapabilecekleri (siz dili) */
  evde: string[]
  /** Öğrenciye: öne çıkanlar ve hedefler (sen dili) */
  rozetler: OzetKart[]
  hedefler: OzetKart[]
}

const ilkCumleler = (t: string, n: number) => (t.match(/[^.!?]+[.!?]+/g) ?? [t]).slice(0, n).join('').trim()

export function raporOzet(R: ReportData, body: VeliBody): RaporOzet {
  const A = analyse(R)
  const f2 = (v: number) => fmt(v, 2)
  const best = A.dd.slice().sort((a, b) => b.r - a.r)[0]
  const weak = A.dd.slice().sort((a, b) => a.r - b.r)[0]
  const lag = weak && best && weak !== best && A.level !== 'high' && best.r - weak.r >= 0.15 ? weak : undefined
  const yanlis = R.kzMissing ? [] : R.lastWrong.filter((w) => !w.eksik)
  const yanlisAd = new Set(yanlis.map((w) => w.title))
  const reps = A.relRep.slice().sort((a, b) => Number(yanlisAd.has(adi(b.outcome))) - Number(yanlisAd.has(adi(a.outcome))) || b.count - a.count)
  const odak = A.downTrend[0] ?? (reps[0] ? A.dd.find((q) => q.s.code === reps[0]!.outcome.subject) : undefined) ?? lag
  const blank = A.blanks.slice().sort((a, b) => b.b - a.b)[0]

  const evde: string[] = []
  if (odak) evde.push(`Haftada 3 akşam, 20 dakikalık ${odak.s.ad} tekrarına zaman ayırmasına yardım edin.`)
  if (best && best.r >= 0.5) evde.push(`${loc(best.s)}ki emeğini fark ettiğinizi ona söyleyin.`)
  if (blank) evde.push(`${blank.s.ad} çalışırken süre tutmasına eşlik edin.`)
  if (R.kzMissing) evde.push('Yanlış sorularını size anlatmasını isteyin; zorlandığı yeri anlatması bile faydalıdır.')
  evde.push('Sonucu başkalarıyla değil, kendi önceki denemesiyle konuşun.')

  const rozetler: OzetKart[] = []
  if (A.rekor) rozetler.push({ baslik: 'Rekor', metin: `Son ${A.n5} denemenin en yüksek neti: ${f2(A.net)}` })
  else if (A.kind === 'up') rozetler.push({ baslik: 'Yükseliştesin', metin: `Toplam netin önceki denemeye göre ${fmt(A.dn)} arttı` })
  if (best && best.r >= 0.5) {
    const df = best.p != null ? best.n - best.p : 0
    rozetler.push({ baslik: `${best.s.ad} öne çıkıyor`, metin: `${best.d} doğru, ${best.y} yanlış${df >= 1 ? ` · ↑ ${fmt(df)} net` : ''}` })
  }
  const ust = A.upTrend.find((q) => q !== best)
  if (ust) rozetler.push({ baslik: `${ust.s.ad} yükselişte`, metin: `Son ${ust.h5.length} denemede ${f2(ust.h5[0]!)} → ${f2(ust.h5.at(-1)!)}` })
  if (!rozetler.length)
    rozetler.push({ baslik: 'Çıkış noktan', metin: 'Bu deneme senin başlangıç çizgin; bundan sonraki her denemede kendi gelişimini göreceksin.' })

  const hedefler: OzetKart[] = []
  if (R.kzMissing)
    hedefler.push({ baslik: 'Yanlışlarını incele', metin: 'Bu denemedeki yanlış sorularına öğretmeninle birlikte bak; hangi soru türünde zorlandığını birlikte bulalım.' })
  for (const r of reps.slice(0, 2))
    hedefler.push({
      baslik: adi(r.outcome).replace(/\.$/, ''),
      metin: 'Bu konu birkaç denemedir karşına çıkıyor. Yanlışlarını bir kez daha çöz, sonra 15 soruluk kısa bir test dene.',
    })
  if (odak && !hedefler.some((h) => h.baslik.includes(odak.s.ad)) && (A.downTrend[0] === odak || !reps.length))
    hedefler.push({ baslik: odak.s.ad, metin: 'Haftada 3 gün 20–30 dakika tekrar et, ardından 10–15 soruluk küçük bir test çöz.' })
  if (blank)
    hedefler.push({
      baslik: `${blank.s.ad} dersinde süre`,
      metin: `${blank.b} soruyu boş bıraktın. Haftada 3 gün süre tutarak ${blank.s.code === 'TUR' ? '20 paragraf sorusu' : '15–20 soru'} çöz; nerede vakit kaybettiğini göreceksin.`,
    })
  const guc = A.strong.find((q) => !hedefler.some((h) => h.baslik.startsWith(q.s.ad)))
  if (guc) hedefler.push({ baslik: `${guc.s.ad} dersinde devam`, metin: 'Çalışma düzenini koru; yanlış çıkan sorulara kısa bir göz atman yeterli.' })
  if (!hedefler.length) hedefler.push({ baslik: 'Düzenini koru', metin: 'Her denemeden sonra yanlış sorularını bir deftere yaz ve hafta içinde yeniden çöz.' })

  return {
    toplamNet: f2(A.net),
    fark: R.prev ? A.dn : null,
    rekor: A.rekor,
    denemeSayisi: R.exams.length,
    dersler: A.dd.map((q) => ({ ad: q.s.ad, net: q.n, soru: q.s.q, trend: q.p == null ? null : q.n - q.p > 1 ? 'up' : q.n - q.p < -1 ? 'down' : null })),
    kisaca: ilkCumleler(body.genel, 2),
    oncelikler: body.oneriler
      .split('\n')
      .map((o) => o.trim())
      .filter(Boolean)
      .slice(0, 3),
    evde: evde.slice(0, 4),
    rozetler: rozetler.slice(0, 3),
    hedefler: hedefler.slice(0, 4),
  }
}
