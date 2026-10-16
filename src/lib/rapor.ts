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
const bolum = (a: string[]) => `${lj(a)} ${a.length > 1 ? 'bölümlerinde' : 'bölümünde'}`
/** Konu adını cümle içine alır: ilk harf küçülür, "DNA" gibi kısaltmalar korunur. */
const lc = (t: string) =>
  t
    .split(' ')
    .map((w) => (w.length > 1 && w === w.toLocaleUpperCase('tr') ? w : w.toLocaleLowerCase('tr')))
    .join(' ')
const hash = (s: string) => [...s].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619), 2166136261) >>> 0

export interface ReportData {
  /** Veri setinin dersleri (LGS: 6 sabit ders; genel: şablon bölümleri). */
  subjects: SubjectDef[]
  exams: { name: string; date: string; result: Result }[] // bu denemeye kadar, eskiden yeniye
  cur: Result
  prev?: Result
  rep: Repeat[]
  lastWrong: { subject: Subject; title: string; rawTitle?: string; code: string; source?: 'official' | 'pdf'; outcomeType?: 'KAZANIM' | 'OGRENME_CIKTISI' }[]
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
  const qs = questionsFor(ds, cur.result)
  const reliable =
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
      title: o.title,
      rawTitle: o.rawTitle,
      code: outcomeCode(o),
      source: o.source,
      outcomeType: o.outcomeType,
    })),
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
  const dd = R.subjects
    .map((s) => {
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
    })
    .filter((d) => d.has)
  const rising = dd.filter((q) => q.hist.length >= 3 && q.hist[2]! > q.hist[1]! && q.hist[1]! > q.hist[0]!)
  const falling = dd.filter((q) => q.p != null && q.n - q.p <= -1.5).sort((a, b) => a.n - a.p! - (b.n - b.p!))
  const strong = dd.filter((q) => q.r >= 0.8 && !falling.includes(q))
  const blanks = dd.filter((q) => q.b >= 3)
  const relRep = R.kzMissing ? [] : R.rep.filter((r) => r.count >= 2)
  const kind: 'up' | 'down' | 'flat' = !R.prev ? 'flat' : dn >= 1.5 ? 'up' : dn <= -1.5 ? 'down' : 'flat'
  return { net, level, dn, dd, rising, falling, strong, blanks, relRep, kind }
}

/**
 * Kural tabanlı taslak (yapay zekâ yokken ya da başarısız olduğunda).
 * Öğrencinin adı metne yazılmaz; "öğrencimiz" denir. Ad parametresi geriye uyumluluk için durur.
 */
export function genVeli(R: ReportData, _fullName: string, seed: string): VeliBody {
  const A = analyse(R)
  const { level, dn, dd, rising, falling, strong, blanks, relRep, kind } = A
  const h = hash(seed)
  const pick = (arr: string[], o = 0) => arr[(h + o) % arr.length]!
  const best = dd.slice().sort((a, b) => b.r - a.r)[0]
  const weak = dd.slice().sort((a, b) => a.r - b.r)[0]
  const dyb = (q: (typeof dd)[number]) => {
    const x = R.cur.subjects[q.s.code]
    if (!x) return ''
    return [`${x.d} doğru`, x.y ? `${x.y} yanlış` : 'hiç yanlış yok', x.b ? `${x.b} boş` : ''].filter(Boolean).join(', ')
  }
  // Belirgin biçimde geride kalan ders (yüksek seviyede ya da dersler birbirine yakınken "destek gerekiyor" denmez)
  const lag = weak && best && weak !== best && level !== 'high' && best.r - weak.r >= 0.15 ? weak : undefined
  const openers = {
    up: ['Bu denemeyi önceki sınavla karşılaştırdığımızda', 'Son denemelerle birlikte değerlendirdiğimizde', 'Bu denemede genel tabloya baktığımızda'],
    down: ['Bu denemeyi önceki sınavla karşılaştırdığımızda', 'Bu denemede genel tabloya baktığımızda', 'Son dönemdeki gelişimine baktığımızda'],
    flat: ['Genel tabloya baktığımızda', 'Son denemelerle birlikte değerlendirdiğimizde', 'Bu denemeyi öncekiyle karşılaştırdığımızda'],
  }

  // ---------- Genel değerlendirme ----------
  let genel: string
  if (!R.prev)
    genel = `Bu deneme, öğrencimiz için elimizdeki ilk deneme. ${
      level === 'high'
        ? 'Başlangıç noktası olarak güçlü bir tablo var.'
        : level === 'mid'
          ? 'Ortaya çıkan tablo, üzerine rahatlıkla inşa edilebilecek bir başlangıç.'
          : 'Bu sonuç, önümüzdeki haftalar için iyi bir başlangıç noktası olacak.'
    } İlk denemelerde amaç bir hüküm vermek değil; öğrencimizin hangi derste rahat ettiğini, hangi derste daha çok desteğe ihtiyaç duyduğunu görmek. Bundan sonraki denemelerle birlikte gelişimini daha net izleyebileceğiz.`
  else if (kind === 'up')
    genel = `${pick(openers.up)} öğrencimizin toplam netinde ${fmt(dn)} netlik bir yükseliş görüyoruz. ${
      rising.length
        ? `Özellikle ${lj(rising.map((q) => q.s.ad).slice(0, 2))} tarafında son üç denemedir süren düzenli bir ilerleme var.`
        : strong.length
          ? `${dz(strong.map((q) => q.s.ad).slice(0, 2))}ki istikrar bu yükselişe katkı sağlamış.`
          : 'Artış birkaç farklı dersteki küçük gelişmelerden geliyor.'
    }${falling.length ? ` ${loc(falling[0]!.s)} ise bir miktar gerileme var; bunu aşağıda ayrıca ele aldık.` : ''} Bu yükseliş, yapılan çalışmanın karşılığının alınmaya başladığını gösteriyor; şimdi önemli olan bu düzeni korumak.`
  else if (kind === 'down')
    genel = `${pick(openers.down)} öğrencimizin toplam netinde önceki sınava göre ${fmt(-dn)} netlik bir düşüş görülüyor. Ancak bu düşüş tüm derslere yayılmış değil; ${
      falling.length ? `özellikle ${dz(falling.slice(0, 2).map((q) => q.s.ad))} yoğunlaşıyor.` : 'birkaç dersteki küçük kayıpların toplamından oluşuyor.'
    } ${strong.length ? `${lj(strong.map((q) => q.s.ad).slice(0, 2))} tarafında performans korunuyor.` : ''} Tek bir denemeden kesin sonuç çıkarmak doğru olmaz; önümüzdeki denemede bu tabloyu birlikte izleyeceğiz.`
  else
    genel = `${pick(openers.flat)} öğrencimizin toplam neti önceki denemeye çok yakın. ${strong.length ? `${lj(strong.map((q) => q.s.ad).slice(0, 2))} tarafında güçlü duruşunu koruyor.` : ''} ${
      relRep.length
        ? 'Burada büyük bir konu eksiğinden çok birkaç yanlışın neti etkilediği bir tablo var.'
        : 'Önümüzdeki süreçte hedef, mevcut seviyeyi koruyarak küçük ama istikrarlı artışlar yakalamak.'
    }`
  if (lag) genel += ` Ders bazında bakıldığında ${lag.s.ad}, şu an en çok desteğe ihtiyaç duyduğu alan olarak öne çıkıyor.`
  if (level === 'high')
    genel += ' Genel performans oldukça güçlü; bu aşamada büyük konu tekrarlarından çok, kalan birkaç yanlışın nedenini doğru belirlemek önemli.'
  if (level === 'low') genel += ' Şu aşamada bütün dersleri aynı anda yükseltmeye çalışmak yerine birkaç temel hedef belirlemek daha doğru olacak.'

  // ---------- Güçlü yönler ----------
  let guclu = strong.length
    ? `${lj(strong.map((q) => q.s.ad))} tarafında performans ${level === 'high' ? 'çok güçlü' : 'dengeli'}. ${
        rising.length
          ? `${rising[0]!.s.ad} netleri son üç denemede ${rising[0]!.hist.map((v) => fmt(v, 2)).join(' → ')} şeklinde ilerlemiş; bu yükseliş yapılan çalışmanın karşılığını almaya başladığını gösteriyor.`
          : 'Bu derslerde mevcut çalışma düzeninin korunması yeterli görünüyor.'
      }`
    : rising.length
      ? `${lj(rising.map((q) => q.s.ad))} netlerinde son denemelerde düzenli bir artış var. Bu, doğru yolda olunduğunu gösteriyor.`
      : best
        ? `Bu denemede belirgin bir öne çıkan ders olmasa da ${best.s.ad} öğrencimizin en rahat ettiği alan olarak görünüyor.`
        : ''
  if (best && best.r >= 0.5 && R.cur.subjects[best.s.code])
    guclu += ` ${best.s.ad} bölümünde ${fmt(best.n, 2)} net (${dyb(best)}) yapması, bu dersteki soruların büyük kısmını doğru okuyup çözebildiğini gösteriyor.`
  const upNow = dd.filter((q) => q.p != null && q.n - q.p >= 1 && q !== best && !rising.includes(q))
  if (upNow.length) guclu += ` ${dz(upNow.map((q) => q.s.ad).slice(0, 2))} de önceki denemeye göre artış var; bu küçük ilerlemeler de değerli.`
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
    gelisim = w
      ? `${loc(w.s)} yanlış sayısı dikkat çekiyor (${dyb(w)}). Bu denemede konu bilgisi net okunamadığı için belirli bir konu hakkında kesin yorum yapmak yerine yanlış soruların öğrencimizle birlikte yeniden incelenmesi daha doğru olacaktır.`
      : `${level === 'high' ? 'Yanlış sayısı az ve farklı derslere dağılmış durumda. ' : ''}Bu denemede konu bilgisi net okunamadığı için yanlış soruların öğrencimizle birlikte yeniden incelenmesi daha doğru olacaktır.`
  } else if (relRep.length) {
    const byD = new Map<Subject, Repeat[]>()
    for (const r of relRep.slice(0, 4)) byD.set(r.outcome.subject, [...(byD.get(r.outcome.subject) ?? []), r])
    gelisim = [...byD.entries()]
      .map(([code, rs]) => {
        const f = falling.find((q) => q.s.code === code)
        const three = rs.filter((r) => r.count >= 3)
        const sd = R.subjects.find((x) => x.code === code) ?? { code, ad: code, short: code, q: 0 }
        return `${f ? `${loc(sd)} bu denemede önceki sınava göre bir miktar düşüş var ve` : loc(sd)} yanlışların ${lj(rs.slice(0, 2).map((r) => lc(r.outcome.title)))} çevresinde toplandığını görüyoruz. ${
          three.length
            ? `${rs.length > 1 ? 'Bu konular' : 'Bu konu'} artık tek bir sınava özgü bir hata gibi görünmüyor; farklı denemelerde tekrar ediyor.`
            : 'Hata iki farklı denemede tekrar etmiş; takip etmekte fayda var.'
        }`
      })
      .join(' ')
    // Genel değerlendirmede anılan gerileme burada da tek paragrafta ele alınır (§13).
    const f0 = falling[0]
    if (f0 && !byD.has(f0.s.code))
      gelisim += ` ${loc(f0.s)} bu denemede bir miktar gerileme var; yanlışlar belirli bir konuda toplanmıyor, bu yüzden benzer sorulardaki performansı takip etmek daha sağlıklı olacaktır.`
  } else {
    // Tekrar eden hata yoksa bu denemenin yanlış konuları anılır; tek denemeden kesin eksik denmez (§8).
    const w = falling[0] ?? lag
    const topics = w ? R.lastWrong.filter((x) => x.subject === w.s.code).slice(0, 2) : []
    if (w)
      gelisim = `${loc(w.s)} ${falling[0] === w ? 'bu denemede bir miktar gerileme var' : 'netler diğer derslere göre daha geride'} (${dyb(w)}). ${
        topics.length
          ? `Yanlışlar bu denemede ${lj(topics.map((t) => lc(t.title)))} gibi konularda görülüyor. Tek denemeden hareketle kesin konu eksiği demek doğru olmaz; bu konuları takip etmek daha sağlıklı olacaktır.`
          : 'Yanlışlar belirli bir konuda toplanmıyor; tek sorudan hareketle konu eksiği demek doğru olmaz. Benzer sorulardaki performansı takip etmek daha sağlıklı olacaktır.'
      }`
    else
      gelisim =
        level === 'high'
          ? 'Kalan yanlışlar farklı konulara dağılmış durumda. Bu, bir konu eksiğinden çok dikkat ve soru kontrolüyle ilgili olabilir; bunu öğrencimizle birlikte değerlendireceğiz.'
          : 'Belirgin bir tekrar eden hata görünmüyor. Yanlış soruların düzenli olarak gözden geçirilmesi yeterli olacaktır.'
  }
  if (blanks.length)
    gelisim += ` ${bolum(blanks.map((q) => q.s.ad))} boş bırakılan sorular bulunuyor. Bunun konu bilgisinden mi yoksa süre yönetiminden mi kaynaklandığını öğrencimizle birlikte değerlendirmek faydalı olacaktır.`

  // ---------- Öneriler ----------
  const oneriler: string[] = []
  relRep
    .slice(0, 2)
    .forEach((r) => oneriler.push(`${r.outcome.title} ile ilgili yanlış sorular yeniden çözülmeli; ardından bu konudan kısa bir tarama testi uygulanabilir.`))
  if (R.kzMissing) oneriler.push('Bu denemedeki yanlış sorular öğretmenle birlikte tek tek incelenmeli; hangi soru türünde zorlanıldığı böylece netleşir.')
  if (!relRep.length && !R.kzMissing && lag)
    oneriler.push(`${lag.s.ad} için haftada üç gün, 20–30 dakikalık kısa tekrar ve ardından 10–15 soruluk küçük testlerle ilerlemek faydalı olur.`)
  if (blanks.length) oneriler.push(`${blanks[0]!.s.ad} için bu hafta süre tutarak kısa çalışmalar yapılabilir; boş bırakma nedenini anlamamıza yardım eder.`)
  if (rising.length)
    oneriler.push(
      `${loc(rising[0]!.s)} son denemelerdeki yükseliş korunuyor; çalışma düzenini değiştirmek yerine yanlış çıkan birkaç soruya kısa tekrar yeterli.`,
    )
  if (level === 'high') oneriler.push('Soruyu bitirdikten sonra şıkları bir kez daha okuma alışkanlığı, kalan dikkat kaynaklı yanlışları azaltabilir.')
  if (level === 'low') oneriler.push('Önce en hızlı net artışı gelebilecek bir iki alana odaklanmak, ilerlemeyi görmeyi kolaylaştırır.')
  if (oneriler.length < 4) oneriler.push('Her denemeden sonra yanlış soruların bir deftere yazılıp hafta içinde tekrar çözülmesi faydalı olacaktır.')
  if (oneriler.length < 4) oneriler.push('Haftalık çalışma planında her güne kısa ve düzenli bir soru çözüm zamanı ayrılması yeterli.')

  // ---------- Mentör ----------
  const mentor = `Öğrencimizle ${kind === 'down' ? 'bu denemenin sonuçlarını birlikte inceleyeceğiz' : 'çalışma düzenini birlikte gözden geçireceğiz'}. ${
    relRep.length
      ? `Önümüzdeki süreçte özellikle ${lc(relRep[0]!.outcome.title)} konusunu takip edeceğiz.`
      : lag
        ? `Önümüzdeki iki hafta önceliğimiz ${lag.s.ad} olacak; kısa tekrarlar ve küçük testlerle ilerleyip bir sonraki denemede sonucu birlikte değerlendireceğiz.`
        : 'Hedefimiz mevcut düzeni koruyarak küçük ama istikrarlı adımlarla ilerlemek.'
  } ${pick(['Haftalık planına uyumunu düzenli olarak takip edeceğiz.', 'Her hafta kısa bir görüşmeyle çalışma planının nasıl gittiğine bakacağız.'], 3)}`
  const clean = (s: string) => s.replace(/\s+/g, ' ').trim()
  return {
    genel: clean(genel),
    guclu: clean(guclu),
    gelisim: clean(gelisim),
    oneriler: oneriler.slice(0, 5).join('\n'),
    mentor: clean(mentor),
    rehber: genRehber(R, seed),
    ai: false,
  }
}

/**
 * Rehber öğretmen yorumu için başlangıç taslağı (§15): çalışma alışkanlığı, günlük düzen, motivasyon ve evdeki destek.
 * Yalnız deneme verisine dayanır; gözlem olmadan kaygı vb. psikolojik çıkarım yapmaz. Rehber öğretmen dilediği gibi düzenler.
 */
export function genRehber(R: ReportData, seed: string): string {
  const { level, rising, falling, strong, blanks, kind } = analyse(R)
  const h = hash(seed + 'rehber')
  const pick = (arr: string[], o = 0) => arr[(h + o) % arr.length]!
  const parts: string[] = []

  if (!R.prev)
    parts.push(
      pick([
        `Öğrencimiz bu denemeyle sınav ortamını ve soru düzenini tanımaya başladı. İlk denemelerde asıl kazanç, oturup sınavı baştan sona tamamlama alışkanlığıdır.`,
        `İlk denemeler, öğrencimizin hem kendini hem de sınavın temposunu tanıdığı bir dönem. Bu sonuç bir başlangıç fotoğrafı; asıl önemli olan buradan sonraki adımlar.`,
      ]),
    )
  else if (kind === 'up')
    parts.push(
      pick([
        `Öğrencimizin son dönemde emek verdiği görülüyor; netlerdeki artış bunun karşılığı. Bu çabayı fark edip kendisine söylemeniz, motivasyonunu korumasına çok yardımcı olur.`,
        `Bu denemedeki yükseliş, öğrencimizin düzenli çalışmasının sonuç vermeye başladığını gösteriyor. Evde sonuçtan çok bu emeği takdir etmek, devam etme isteğini güçlendirir.`,
      ]),
    )
  else if (kind === 'down')
    parts.push(
      pick([
        `Her deneme aynı geçmeyebilir; bir denemedeki düşüş öğrencimizin çalışmasının boşa gittiği anlamına gelmez. Evde sonucu konuşurken suçlayıcı olmaktan çok "Bir dahakine neyi farklı yapabiliriz?" sorusu üzerinden ilerlemek daha faydalı olur.`,
        `Bu denemede netler bir miktar geriledi. Bu tür dalgalanmalar süreçte sık görülür; öğrencimizle sonucu sakin bir dille konuşup bir sonraki denemeye küçük ve net hedeflerle hazırlanmak en sağlıklısı.`,
      ]),
    )
  else
    parts.push(
      pick([
        `Öğrencimiz genel olarak düzenini koruyor. Bu dönemde büyük değişiklikler yerine mevcut çalışma alışkanlığını istikrarlı biçimde sürdürmesi önemli.`,
        `Netlerin önceki denemeye yakın olması, öğrencimizin belli bir düzen oturttuğunu gösteriyor. Şimdi bu düzeni küçük adımlarla bir üst seviyeye taşımanın zamanı.`,
      ]),
    )

  if (strong.length || rising.length) {
    const ds = (strong.length ? strong : rising).map((q) => q.s.ad).slice(0, 2)
    parts.push(`${lj(ds)} tarafındaki emeğini kendisine hatırlatmak, diğer derslere de aynı özenle yaklaşmasını kolaylaştırır.`)
  }

  if (blanks.length)
    parts.push(
      `${bolum(blanks.map((q) => q.s.ad).slice(0, 2))} boş bırakılan sorular var. Evde soru çözerken süreyi birlikte tutmak, hangi soruda takıldığını ve zamanı nasıl kullandığını görmemize yardımcı olur.`,
    )

  if (level === 'low')
    parts.push(
      `Bu aşamada her gün kısa ama düzenli bir çalışma zamanı belirlemek, uzun ve yorucu çalışmalardan daha etkili olur. Küçük hedeflere ulaştıkça kendine olan güveni de artacaktır.`,
    )
  else if (level === 'high')
    parts.push(
      `Performansı güçlü olduğu için çalışma ile dinlenme arasındaki dengeyi korumak önemli; dinlenmeye, spora ve sevdiği etkinliklere de zaman ayırması, sınav gününde zihnini açık tutmasına yardım eder.`,
    )
  else if (falling.length)
    parts.push(`${loc(falling[0]!.s)} kısa ve sık tekrarlar yapmak, konuları uzun aralıklarla toplu çalışmaktan daha kalıcı olur.`)

  parts.push(
    pick(
      [
        'Günlük hayatta ders çalışırken telefonun başka bir odada durması, belli saatlerde çalışıp ara vermesi ve hafta sonu da kısa bir tekrar saati ayırması bu düzeni destekler.',
        'Her gün aynı saatlerde çalışmaya oturmak, çalışma sırasında telefonu uzak tutmak ve günün sonunda ne yaptığını kısaca konuşmak, düzenli bir alışkanlık kazanmasına yardım eder.',
        'Akşamları sabit bir çalışma saati, yeterli uyku ve çalışırken dikkat dağıtan ekranlardan uzak durmak, bu dönemde en çok fark yaratacak alışkanlıklar.',
      ],
      1,
    ),
  )
  parts.push(
    pick(
      [
        'Rehberlik servisi olarak süreci birlikte takip ediyoruz; aklınıza takılan her konuda bizimle görüşebilirsiniz.',
        'Süreci birlikte izlemeye devam edeceğiz; dilediğiniz zaman rehberlik servisimizle görüşebilirsiniz.',
      ],
      2,
    ),
  )
  return parts.join(' ').replace(/\s+/g, ' ').trim()
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
            konu: r.outcome.rawTitle ?? r.outcome.title,
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
