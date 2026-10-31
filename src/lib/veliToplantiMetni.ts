// Veli toplantısı: öğretmenin veliye okuyabileceği konuşma dilinde metinler (kural tabanlı; yapay zekâ yok, kişisel veri dışarı
// gitmez). Değerlendirme, veli raporunun kural tabanlı taslağından (genVeli) gelir; "öğrencimiz" yerine öğrencinin adı geçer.
// Ödevler: sistemdeki ödev kontrol sonuçlarından. Sınıf sıralaması yok; öğrenci kendisiyle kıyaslanır (CLAUDE.md §3).
import { genVeli, type ReportData } from './rapor'
import { trD } from './format'

const SESLI = 'aeıioöuü'
const sonSesli = (w: string) => [...w.toLocaleLowerCase('tr')].reverse().find((c) => SESLI.includes(c)) ?? 'e'
const sesliyleBiter = (w: string) => SESLI.includes(w.slice(-1).toLocaleLowerCase('tr'))
/** Özel ada ek: "Adar'ın", "Ece'nin", "Adar'a", "Ece'ye", "Adar'ı" (ünlü uyumu ve kaynaştırma harfi) */
export function adEk(ad: string, ek: 'in' | 'e' | 'i'): string {
  const v = sonSesli(ad)
  const kalin = 'aıou'.includes(v)
  const yuvarlak = 'oöuü'.includes(v)
  const s = sesliyleBiter(ad)
  if (ek === 'e') return `${ad}'${s ? 'y' : ''}${kalin ? 'a' : 'e'}`
  const dar = kalin ? (yuvarlak ? 'u' : 'ı') : yuvarlak ? 'ü' : 'i'
  if (ek === 'in') return `${ad}'${s ? 'n' : ''}${dar}n`
  return `${ad}'${s ? 'y' : ''}${dar}`
}

/** Rapor metnindeki "öğrencimiz" kalıplarını öğrencinin adıyla değiştirir (cümle başı büyük harf korunur). */
export function adla(metin: string, ad: string): string {
  return metin
    .replace(/[Öö]ğrencimizin/g, adEk(ad, 'in'))
    .replace(/[Öö]ğrencimizle/g, `${ad} ile`)
    .replace(/[Öö]ğrencimize/g, adEk(ad, 'e'))
    .replace(/[Öö]ğrencimizi/g, adEk(ad, 'i'))
    .replace(/[Öö]ğrencimiz/g, ad)
}

/**
 * Deneme değerlendirmesi: veliyle konuşur gibi, birkaç paragraf. Deneme yoksa kısa bir açıklama.
 * Paragraflar: giriş + genel tablo, güçlü yönler, üzerinde çalışılacaklar, evde birlikte yapılabilecekler, kapanış.
 */
export function degerlendirmeMetni(R: ReportData | null, ad: string, seed: string): string[] {
  if (!R)
    return [
      `${adEk(ad, 'in')} bu dönem henüz değerlendirebileceğimiz bir deneme sonucu yok. İlk denemeden sonra hangi derste rahat ettiğini, hangisinde desteğe ihtiyaç duyduğunu birlikte konuşacağız.`,
    ]
  const v = genVeli(R, ad, seed)
  const ilk = R.exams.length === 1
  const p: string[] = []
  p.push(
    ilk
      ? `${adEk(ad, 'in')} ilk deneme sonucu elimizde; size bu sonucu ve önümüzdeki dönemde birlikte neler yapabileceğimizi anlatmak istiyorum. ${adla(v.genel, ad)}`
      : `${adEk(ad, 'in')} son ${Math.min(R.exams.length, 5)} denemesine birlikte baktık. ${adla(v.genel, ad)}`,
  )
  if (v.guclu) p.push(`Önce güzel haberlerle başlayayım: ${lowerFirst(adla(v.guclu, ad))}`)
  if (v.gelisim) p.push(`Üzerinde birlikte durmamız gereken kısma gelince: ${lowerFirst(adla(v.gelisim, ad))}`)
  // Öneriler ayrı cümleler: "İlk olarak …. Bunun yanında …. Son olarak …."
  const oneriler = v.oneriler.split('\n').map((x) => x.trim().replace(/\.$/, '')).filter(Boolean).slice(0, 4)
  const bag = oneriler.length === 1 ? ['Bunun için'] : ['İlk olarak', 'Bunun yanında', 'Ayrıca', 'Son olarak'].filter((_, i, a) => i < oneriler.length - 1 || i === a.length - 1)
  if (oneriler.length)
    p.push(`Evde ve okulda birlikte şunlara dikkat edebiliriz. ${oneriler.map((x, i) => `${bag[i]}, ${lowerFirst(adla(x, ad))}.`).join(' ')}`)
  p.push(adla(v.mentor, ad))
  return p.map(tekrarsiz)
}
/** Paragrafta aynen tekrar eden cümleyi ikinci kez okutmaz ("Bu konu artık tek bir sınava özgü … tekrar ediyor.") */
function tekrarsiz(par: string): string {
  const gorulen = new Set<string>()
  return (par.match(/[^.!?]+[.!?]+\s*/g) ?? [par])
    .filter((c) => {
      const k = c.trim()
      if (k.length > 30 && gorulen.has(k)) return false
      gorulen.add(k)
      return true
    })
    .join('')
    .trim()
}
const lowerFirst = (s: string) => {
  const w = s.split(' ')[0] ?? ''
  // Özel ad ya da ders adı ("Matematik", "Adar") büyük kalır; yalnız sıradan cümle başı küçülür
  return /^(Bu|Bir|Son|Genel|Ders|Yanlış|Kalan|Belirgin|Her|Haftalık|Önce|Soruyu|Burada|Şu|Ancak|Özellikle|Tek)$/.test(w) ? s[0]!.toLocaleLowerCase('tr') + s.slice(1) : s
}

// ---------- Etütler ----------
export interface EtutSatiri {
  tarih: string
  konu: string
  yoklama: 'geldi' | 'gelmedi' | null
}
/** Etüt katılımı: yoklaması alınan etütlerde geldi/gelmedi, kaçırılanlar ve yaklaşan etütler; konuşma dilinde. */
export function etutMetni(etutler: EtutSatiri[], ad: string, bugun: string): string[] {
  const gecmis = etutler.filter((e) => e.tarih <= bugun)
  const yaklasan = etutler.filter((e) => e.tarih > bugun).sort((a, b) => a.tarih.localeCompare(b.tarih))
  const girilen = gecmis.filter((e) => e.yoklama)
  const geldi = girilen.filter((e) => e.yoklama === 'geldi').length
  const gelmedi = girilen.filter((e) => e.yoklama === 'gelmedi').sort((a, b) => a.tarih.localeCompare(b.tarih))
  const p: string[] = []
  if (!gecmis.length && !yaklasan.length) return [`Bu dönem ${adEk(ad, 'in')} kayıtlı bir etüdü görünmüyor.`]
  if (gecmis.length && !girilen.length) p.push(`Bu dönem ${ad} ${gecmis.length} etüde yazıldı; yoklamaları henüz girilmediği için katılımını ilerleyen günlerde konuşacağız.`)
  if (girilen.length) {
    p.push(`Bu dönem ${ad} ${gecmis.length} etüde yazıldı; yoklaması alınan ${girilen.length} etüdün ${geldi} tanesine gelmiş${gelmedi.length ? `, ${gelmedi.length} tanesine gelmemiş` : ''}.`)
    if (!gelmedi.length) p.push('Etütlere düzenli katılıyor; bu güzel bir alışkanlık, devam etmesini destekleyelim.')
    else {
      const liste = gelmedi.slice(-3).map((e) => `${trD(e.tarih)} ${e.konu}`.trim()).join(', ')
      p.push(`Gelmediği ${gelmedi.length === 1 ? 'etüt' : gelmedi.length > 3 ? 'son etütler' : 'etütler'}: ${liste}. ${geldi / girilen.length >= 0.7 ? 'Bu konuları evde kısa bir tekrarla tamamlayabilir.' : 'Etütler eksikleri kapatmak için önemli bir fırsat; katılımını birlikte takip edelim.'}`)
    }
  }
  if (yaklasan.length) p.push(`Yaklaşan etüdü: ${trD(yaklasan[0]!.tarih)}${yaklasan[0]!.konu ? ` ${yaklasan[0]!.konu}` : ''}.`)
  return p
}

// ---------- Ödevler ----------
export type OdevDurum = 'bekliyor' | 'yapti' | 'yapmadi' | 'getirmedi' | 'eksik' | 'gelmedi' | 'izinli'
export interface OdevSatiri {
  baslik: string
  ders: string
  verilis: string // YYYY-MM-DD
  teslim: string | null
  durum: OdevDurum
}
/** Gözlem satırının altındaki tek satırlık istatistik: Ödevler sekmesindeki kontrol sonuçları. */
export function odevIstatistigi(odevler: OdevSatiri[]): string {
  const kontrol = odevler.filter((o) => o.durum !== 'bekliyor' && o.durum !== 'izinli' && o.durum !== 'gelmedi')
  if (!kontrol.length) return 'Sistemde kontrol edilmiş ödev yok.'
  const yapti = kontrol.filter((o) => o.durum === 'yapti').length
  const eksik = kontrol.filter((o) => o.durum === 'eksik').length
  const yok = kontrol.length - yapti - eksik
  return `Sistemde ${kontrol.length} ödev kontrol edildi: ${[`${yapti} tam`, eksik ? `${eksik} eksik` : '', yok ? `${yok} yapılmadı` : ''].filter(Boolean).join(', ')} (%${Math.round((yapti / kontrol.length) * 100)} tam)`
}

/**
 * Ödevler: kontrol edilen ödevlerde yapma oranı, yapılmayan / eksik olanların dersleri, teslimi yaklaşan ödevler; konuşma dilinde.
 * Devamsızlık varsa tek cümleyle eklenir. Kontrol edilmemiş (bekliyor ve teslimi geçmiş) ödevler sayılmaz, ayrıca belirtilir.
 */
export function odevMetni(odevler: OdevSatiri[], ad: string, bugun: string, devamsiz = 0): string[] {
  const p: string[] = []
  const kontrol = odevler.filter((o) => o.durum !== 'bekliyor' && o.durum !== 'izinli' && o.durum !== 'gelmedi')
  const yapti = kontrol.filter((o) => o.durum === 'yapti')
  const eksik = kontrol.filter((o) => o.durum === 'eksik')
  const yok = kontrol.filter((o) => o.durum === 'yapmadi' || o.durum === 'getirmedi')
  const yaklasan = odevler.filter((o) => o.durum === 'bekliyor' && o.teslim && o.teslim >= bugun).sort((a, b) => a.teslim!.localeCompare(b.teslim!))
  const kontrolsuz = odevler.filter((o) => o.durum === 'bekliyor' && (!o.teslim || o.teslim < bugun)).length
  const dersler = (xs: OdevSatiri[]) => {
    const say = new Map<string, number>()
    for (const o of xs) say.set(o.ders, (say.get(o.ders) ?? 0) + 1)
    return [...say].sort((a, b) => b[1] - a[1]).map(([d, n]) => (n > 1 ? `${d} (${n})` : d))
  }
  const dersYeri = (xs: OdevSatiri[]) => {
    const d = dersler(xs)
    return `${d.length > 1 ? `${d.slice(0, -1).join(', ')} ve ${d.at(-1)}` : d[0]} ${d.length > 1 ? 'derslerinde' : 'dersinde'}`
  }
  if (!odevler.length) {
    p.push(`Bu dönem sistemde ${adEk(ad, 'e')} verilmiş bir ödev kaydı görünmüyor.`)
  } else if (!kontrol.length) {
    p.push(`Bu dönem ${adEk(ad, 'e')} ${odevler.length} ödev verildi; henüz kontrolü yapılmış bir ödev olmadığı için durumu ilerleyen haftalarda birlikte değerlendireceğiz.`)
  } else {
    const oran = yapti.length / kontrol.length
    p.push(
      `Bu dönem ${adEk(ad, 'e')} ${odevler.length} ödev verildi; öğretmenlerinin kontrol ettiği ${kontrol.length} ödevin ${yapti.length} tanesini tam yapmış${
        eksik.length ? `, ${eksik.length} tanesini eksik getirmiş` : ''
      }${yok.length ? `, ${yok.length} tanesini yapmamış` : ''}.`,
    )
    if (oran >= 0.9) p.push('Ödev düzeni çok iyi; bu alışkanlığın devam etmesi için evde de takdir edilmesi yeterli.')
    else if (oran >= 0.7)
      p.push(
        `Ödev düzeni genel olarak iyi.${yok.length || eksik.length ? ` Aksayan ödevler ${dersYeri([...yok, ...eksik])}; bu derslerin ödevlerine evde biraz daha dikkat edebiliriz.` : ''}`,
      )
    else
      p.push(
        `Ödevlerde aksama var${yok.length || eksik.length ? `; özellikle ${dersYeri([...yok, ...eksik])}` : ''}. Evde her gün aynı saatte kısa bir ödev zamanı belirlemek ve o gün verilen ödevlere birlikte göz atmak çok fayda sağlar.`,
      )
  }
  if (yaklasan.length)
    p.push(
      `Teslim tarihi yaklaşan ${yaklasan.length === 1 ? 'bir ödevi' : `${yaklasan.length} ödevi`} var: ${yaklasan
        .slice(0, 3)
        .map((o) => `${o.ders} – ${o.baslik} (${trD(o.teslim!)})`)
        .join('; ')}${yaklasan.length > 3 ? ' ve diğerleri' : ''}.`,
    )
  if (kontrolsuz) p.push(`${kontrolsuz} ödevin kontrolü henüz girilmemiş; bunlar yukarıdaki sayılara katılmadı.`)
  if (devamsiz > 0) p.push(`Bu yıl ${devamsiz} gün okula gelmediğini de not edelim; kaçırdığı derslerin ödevlerini takip etmesi önemli.`)
  return p
}
