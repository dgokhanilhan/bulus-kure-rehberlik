// Veli raporu: kural tabanlı taslak + yapay zekâ için anonim veri (docs/veli-raporu-kurallari.md).
// Regresyon kilidi: yalnız metin üretir; D/Y/B, net, puan ve eşleştirmeleri değiştirmez.
import { indexResults, repeats, studentExams, totalNet, wrongOutcomes, fmt, type Dataset, type Repeat, type Result, type Subject, type SubjectDef } from './analiz'
import { gen } from './format'
import { FORBIDDEN, findForbidden } from '../../supabase/functions/_shared/rapor-ai'

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
  TUR: 'Türkçede', MAT: 'Matematikte', FEN: 'Fen Bilimlerinde', INK: 'İnkılap Tarihinde', DIN: 'Din Kültüründe', ING: 'İngilizcede',
  TDE: 'Türk Dili ve Edebiyatında', SOS: 'Sosyal Bilgilerde', TAR: 'Tarihte', COG: 'Coğrafyada', FEL: 'Felsefede', FIZ: 'Fizikte', KIM: 'Kimyada', BIY: 'Biyolojide',
}
/** "Matematikte" gibi bulunma hâli: LGS ve genel dersler; bölüm anahtarı farklıysa (FEL2) ders kodundan, yoksa "X dersinde". */
const loc = (s: SubjectDef) => LOC_TR[s.code] ?? (s.base ? LOC_TR[s.base] : undefined) ?? `${s.ad} dersinde`
const lj = (a: string[]) => (a.length < 2 ? a.join('') : `${a.slice(0, -1).join(', ')} ve ${a.at(-1)}`)
const dz = (a: string[]) => lj(a) + (a.length > 1 ? ' derslerinde' : ' dersinde')
/** Konu adını cümle içine alır: ilk harf küçülür, "DNA" gibi kısaltmalar korunur. */
const lc = (t: string) => t.split(' ').map((w) => (w.length > 1 && w === w.toLocaleUpperCase('tr') ? w : w.toLocaleLowerCase('tr'))).join(' ')
const hash = (s: string) => [...s].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619), 2166136261) >>> 0

export interface ReportData {
  /** Veri setinin dersleri (LGS: 6 sabit ders; genel: şablon bölümleri). */
  subjects: SubjectDef[]
  exams: { name: string; date: string; result: Result }[] // bu denemeye kadar, eskiden yeniye
  cur: Result
  prev?: Result
  rep: Repeat[]
  lastWrong: { subject: Subject; title: string; code: string }[]
  kzMissing: boolean
}

export function reportData(ds: Dataset, sid: string, eid: string): ReportData | null {
  const idx = indexResults(ds.results)
  const target = ds.exams.find((e) => e.id === eid)
  if (!target) return null
  const ex = studentExams(ds, sid, idx).filter((x) => x.exam.exam_date <= target.exam_date)
  const cur = ex.at(-1)
  if (!cur || cur.exam.id !== eid) return null
  const w = wrongOutcomes(ds, cur.result)
  const qs = ds.questionsByExam.get(eid) ?? []
  const reliable =
    (!!cur.result.kazanim && Object.keys(cur.result.kazanim.g).length > 0) ||
    (cur.result.outcomes_ok && qs.some((q) => q.outcome_code && ['code_exact', 'code_inferred', 'text_exact', 'text_match'].includes(q.match)))
  return {
    subjects: ds.subjects,
    exams: ex.map((x) => ({ name: x.exam.name, date: x.exam.exam_date, result: x.result })),
    cur: cur.result,
    prev: ex.at(-2)?.result,
    rep: repeats(ds, sid, eid, idx),
    lastWrong: w.wrong.map((o) => ({ subject: o.subject, title: o.title, code: o.code })),
    kzMissing: !reliable,
  }
}

type Level = 'high' | 'mid' | 'low'
function analyse(R: ReportData) {
  const x = R.cur
  const net = totalNet(x)
  // Eşikler LGS'nin 90 sorusunda 78 / 55 net; genel denemede aynı oranlar o denemenin soru toplamına göre (LGS'de toplam 90: birebir aynı)
  const max = R.subjects.reduce((a, s) => a + s.q, 0) || 90
  const level: Level = net >= (78 / 90) * max - 1e-9 ? 'high' : net >= (55 / 90) * max - 1e-9 ? 'mid' : 'low'
  const dn = R.prev ? net - totalNet(R.prev) : 0
  const dd = R.subjects.map((s) => {
    const q = x.subjects[s.code]
    return {
      s,
      n: q?.net ?? 0,
      p: R.prev?.subjects[s.code]?.net,
      b: q?.b ?? 0,
      r: (q?.net ?? 0) / s.q,
      hist: R.exams.slice(-3).map((e) => e.result.subjects[s.code]?.net ?? 0),
      has: !!q,
    }
  }).filter((d) => d.has)
  const rising = dd.filter((q) => q.hist.length >= 3 && q.hist[2]! > q.hist[1]! && q.hist[1]! > q.hist[0]!)
  const falling = dd.filter((q) => q.p != null && q.n - q.p <= -1.5).sort((a, b) => a.n - a.p! - (b.n - b.p!))
  const strong = dd.filter((q) => q.r >= 0.8 && !falling.includes(q))
  const blanks = dd.filter((q) => q.b >= 3)
  const relRep = R.kzMissing ? [] : R.rep.filter((r) => r.count >= 2)
  const kind: 'up' | 'down' | 'flat' = !R.prev ? 'flat' : dn >= 1.5 ? 'up' : dn <= -1.5 ? 'down' : 'flat'
  return { net, level, dn, dd, rising, falling, strong, blanks, relRep, kind }
}

/** Kural tabanlı taslak (yapay zekâ yokken ya da başarısız olduğunda). */
export function genVeli(R: ReportData, fullName: string, seed: string): VeliBody {
  const first = fullName.trim().split(/\s+/)[0]!
  const A = analyse(R)
  const { level, dn, dd, rising, falling, strong, blanks, relRep, kind } = A
  const h = hash(seed)
  const pick = (arr: string[], o = 0) => arr[(h + o) % arr.length]!
  const openers = {
    up: ['Bu denemeyi önceki sınavla karşılaştırdığımızda', 'Son denemelerle birlikte değerlendirdiğimizde', 'Bu denemede genel tabloya baktığımızda'],
    down: ['Bu denemeyi önceki sınavla karşılaştırdığımızda', 'Bu denemede genel tabloya baktığımızda', 'Son dönemdeki gelişimine baktığımızda'],
    flat: ['Genel tabloya baktığımızda', 'Son denemelerle birlikte değerlendirdiğimizde', 'Bu denemeyi öncekiyle karşılaştırdığımızda'],
  }
  let genel: string
  if (!R.prev)
    genel = `${first} için elimizdeki ilk deneme bu. ${A.net >= 55 ? 'Başlangıç noktası olarak güçlü bir tablo var.' : 'Bu sonuç, önümüzdeki haftalar için iyi bir başlangıç noktası olacak.'} Bundan sonraki denemelerle birlikte gelişimini daha net izleyebileceğiz.`
  else if (kind === 'up')
    genel = `${pick(openers.up)} ${gen(first)} toplam netinde ${fmt(dn)} netlik bir yükseliş görüyoruz. ${
      rising.length
        ? `Özellikle ${lj(rising.map((q) => q.s.ad).slice(0, 2))} tarafında son üç denemedir süren düzenli bir ilerleme var.`
        : strong.length
          ? `${dz(strong.map((q) => q.s.ad).slice(0, 2))}ki istikrar bu yükselişe katkı sağlamış.`
          : 'Artış birkaç farklı dersteki küçük gelişmelerden geliyor.'
    }${falling.length ? ` ${loc(falling[0]!.s)} ise bir miktar gerileme var; bunu aşağıda ayrıca ele aldık.` : ''}`
  else if (kind === 'down')
    genel = `${pick(openers.down)} ${gen(first)} toplam netinde önceki sınava göre ${fmt(-dn)} netlik bir düşüş görülüyor. Ancak bu düşüş tüm derslere yayılmış değil; ${
      falling.length ? `özellikle ${dz(falling.slice(0, 2).map((q) => q.s.ad))} yoğunlaşıyor.` : 'birkaç dersteki küçük kayıpların toplamından oluşuyor.'
    } ${strong.length ? `${lj(strong.map((q) => q.s.ad).slice(0, 2))} tarafında performans korunuyor.` : ''} Tek bir denemeden kesin sonuç çıkarmak doğru olmaz; önümüzdeki denemede bu tabloyu birlikte izleyeceğiz.`
  else
    genel = `${pick(openers.flat)} ${gen(first)} toplam neti önceki denemeye çok yakın. ${strong.length ? `${lj(strong.map((q) => q.s.ad).slice(0, 2))} tarafında güçlü duruşunu koruyor.` : ''} ${
      relRep.length ? 'Burada büyük bir konu eksiğinden çok birkaç yanlışın neti etkilediği bir tablo var.' : 'Önümüzdeki süreçte hedef, mevcut seviyeyi koruyarak küçük ama istikrarlı artışlar yakalamak.'
    }`
  if (level === 'high') genel += ' Genel performans oldukça güçlü; bu aşamada büyük konu tekrarlarından çok, kalan birkaç yanlışın nedenini doğru belirlemek önemli.'
  if (level === 'low') genel += ' Şu aşamada bütün dersleri aynı anda yükseltmeye çalışmak yerine birkaç temel hedef belirlemek daha doğru olacak.'

  const bestDd = dd.slice().sort((a, b) => b.r - a.r)[0]
  const guclu = strong.length
    ? `${lj(strong.map((q) => q.s.ad))} tarafında performans ${level === 'high' ? 'çok güçlü' : 'dengeli'}. ${
        rising.length
          ? `${rising[0]!.s.ad} netleri son üç denemede ${rising[0]!.hist.map((v) => fmt(v, 2)).join(' → ')} şeklinde ilerlemiş; bu yükseliş yapılan çalışmanın karşılığını almaya başladığını gösteriyor.`
          : 'Bu derslerde mevcut çalışma düzeninin korunması yeterli görünüyor.'
      }`
    : rising.length
      ? `${lj(rising.map((q) => q.s.ad))} netlerinde son denemelerde düzenli bir artış var. Bu, doğru yolda olunduğunu gösteriyor.`
      : bestDd
        ? `Bu denemede belirgin bir öne çıkan ders olmasa da ${bestDd.s.ad} ${gen(first)} en rahat ettiği alan olarak görünüyor.`
        : ''

  let gelisim: string
  if (R.kzMissing) {
    const w = falling[0] ?? dd.slice().sort((a, b) => a.r - b.r)[0]
    gelisim = w
      ? `${loc(w.s)} yanlış sayısı dikkat çekiyor. Bu denemede konu bilgisi net okunamadığı için belirli bir konu hakkında kesin yorum yapmak yerine yanlış soruların ${first} ile birlikte yeniden incelenmesi daha doğru olacaktır.`
      : `Bu denemede konu bilgisi net okunamadığı için yanlış soruların ${first} ile birlikte yeniden incelenmesi daha doğru olacaktır.`
  } else if (relRep.length) {
    const byD = new Map<Subject, Repeat[]>()
    for (const r of relRep.slice(0, 4)) byD.set(r.outcome.subject, [...(byD.get(r.outcome.subject) ?? []), r])
    gelisim = [...byD.entries()]
      .map(([code, rs]) => {
        const f = falling.find((q) => q.s.code === code)
        const three = rs.filter((r) => r.count >= 3)
        const sd = R.subjects.find((x) => x.code === code) ?? { code, ad: code, short: code, q: 0 }
        return `${f ? `${loc(sd)} bu denemede önceki sınava göre bir miktar düşüş var ve` : loc(sd)} yanlışların ${lj(rs.slice(0, 2).map((r) => lc(r.outcome.title)))} çevresinde toplandığını görüyoruz. ${
          three.length ? `${rs.length > 1 ? 'Bu konular' : 'Bu konu'} artık tek bir sınava özgü bir hata gibi görünmüyor; farklı denemelerde tekrar ediyor.` : 'Hata iki farklı denemede tekrar etmiş; takip etmekte fayda var.'
        }`
      })
      .join(' ')
    // Genel değerlendirmede anılan gerileme burada da tek paragrafta ele alınır (§13).
    const f0 = falling[0]
    if (f0 && !byD.has(f0.s.code))
      gelisim += ` ${loc(f0.s)} bu denemede bir miktar gerileme var; yanlışlar belirli bir konuda toplanmıyor, bu yüzden benzer sorulardaki performansı takip etmek daha sağlıklı olacaktır.`
  } else if (falling.length)
    gelisim = `${loc(falling[0]!.s)} bu denemede bir miktar gerileme var. Yanlışlar belirli bir konuda toplanmıyor; tek sorudan hareketle konu eksiği demek doğru olmaz. Benzer sorulardaki performansı takip etmek daha sağlıklı olacaktır.`
  else
    gelisim =
      level === 'high'
        ? `Kalan yanlışlar farklı konulara dağılmış durumda. Bu, bir konu eksiğinden çok dikkat ve soru kontrolüyle ilgili olabilir; bunu ${first} ile birlikte değerlendireceğiz.`
        : 'Belirgin bir tekrar eden hata görünmüyor. Yanlış soruların düzenli olarak gözden geçirilmesi yeterli olacaktır.'
  if (blanks.length)
    gelisim += ` ${lj(blanks.map((q) => q.s.ad))} bölümünde boş bırakılan sorular bulunuyor. Bunun konu bilgisinden mi yoksa süre yönetiminden mi kaynaklandığını ${first} ile birlikte değerlendirmek faydalı olacaktır.`

  const oneriler: string[] = []
  relRep.slice(0, 2).forEach((r) => oneriler.push(`${r.outcome.title} ile ilgili yanlış sorular yeniden çözülmeli; ardından bu konudan kısa bir tarama testi uygulanabilir.`))
  if (R.kzMissing) oneriler.push('Bu denemedeki yanlış sorular öğretmenle birlikte tek tek incelenmeli; hangi soru türünde zorlanıldığı böylece netleşir.')
  if (blanks.length) oneriler.push(`${blanks[0]!.s.ad} için bu hafta süre tutarak kısa çalışmalar yapılabilir; boş bırakma nedenini anlamamıza yardım eder.`)
  if (rising.length) oneriler.push(`${loc(rising[0]!.s)} son denemelerdeki yükseliş korunuyor; çalışma düzenini değiştirmek yerine yanlış çıkan birkaç soruya kısa tekrar yeterli.`)
  if (level === 'high') oneriler.push('Soruyu bitirdikten sonra şıkları bir kez daha okuma alışkanlığı, kalan dikkat kaynaklı yanlışları azaltabilir.')
  if (level === 'low') oneriler.push('Önce en hızlı net artışı gelebilecek bir iki alana odaklanmak, ilerlemeyi görmeyi kolaylaştırır.')
  if (oneriler.length < 3) oneriler.push('Her denemeden sonra yanlış soruların bir deftere yazılıp hafta içinde tekrar çözülmesi faydalı olacaktır.')
  if (oneriler.length < 3) oneriler.push('Haftalık çalışma planında her güne kısa ve düzenli bir soru çözüm zamanı ayrılması yeterli.')

  const mentor = `${first} ile ${kind === 'down' ? 'bu denemenin sonuçlarını birlikte inceleyeceğiz' : 'çalışma düzenini birlikte gözden geçirdik'}. ${
    relRep.length ? `Önümüzdeki süreçte özellikle ${lc(relRep[0]!.outcome.title)} konusunu takip edeceğiz.` : 'Hedefimiz mevcut düzeni koruyarak küçük ama istikrarlı adımlarla ilerlemek.'
  }`
  const clean = (s: string) => s.replace(/\s+/g, ' ').trim()
  return { genel: clean(genel), guclu: clean(guclu), gelisim: clean(gelisim), oneriler: oneriler.slice(0, 5).join('\n'), mentor, rehber: '', ai: false }
}

/**
 * Yapay zekâya giden veri: KİŞİSEL VERİ YOK (ad, soyad, okul, okul no, şube, öğretmen/veli adı,
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
    gecmis: R.exams.map((e, i) => ({ deneme: `Deneme ${i + 1}`, toplamNet: r2(totalNet(e.result)), dersNetleri: Object.fromEntries(R.subjects.map((s) => [s.ad, e.result.subjects[s.code] ? r2(e.result.subjects[s.code]!.net) : null])) })),
    guvenilirTekrarEdenHatalar: R.kzMissing ? [] : R.rep.map((r) => ({ ders: (R.subjects.find((s) => s.code === r.outcome.subject)?.ad ?? r.outcome.subject), konu: r.outcome.title, kacDenemedeYanlis: r.count })),
    buDenemedeYanlisKonular: R.kzMissing ? [] : R.lastWrong.map((w) => ({ ders: (R.subjects.find((s) => s.code === w.subject)?.ad ?? w.subject), konu: w.title })),
    konuBilgisiOkunamadi: R.kzMissing,
  }
}
export type AiPayload = ReturnType<typeof aiPayload>
