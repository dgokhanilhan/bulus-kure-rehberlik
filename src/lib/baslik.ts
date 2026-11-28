// Kazanım başlıklarının yarım kalması: eski katalogdaki kısa adlar ("Hz", "…") ve yayınevi PDF'inde sütun genişliğinde
// kesilen başlıklar ("Accepting and refusin"). Veri uydurma yok: başlık yalnız tam metin elimizdeyse ya da resmî listede
// tek bir başlık bu başlangıçla eşleşiyorsa tamamlanır; değilse "yarım" işaretlenir.

/** Eski `outcomes` kataloğu: kısa ad kesikse ("…" ile biten ya da "Hz" gibi) tam metin (sondaki nokta atılmış) kullanılır. */
export function katalogBaslik(title: string, fullText?: string | null): string {
  const tam = fullText?.trim().replace(/\.$/, '')
  if (!tam) return title
  const kisa = title.trim()
  if (kisa.endsWith('…') || kisa.endsWith('...') || kisa.replace(/\.$/, '').length < 6) return tam
  return title
}

const BAGLAC = new Set(['and', 'or', 'the', 'of', 'to', 'a', 'an', 'in', 'on', 'with', 'for', 've', 'ile', 'veya', 'ya', 'da', 'de', 'bir', 'için'])

/**
 * Yayınevi PDF'inden gelen başlıklardan yarım olanları bulur. Kurallar (birbirinden bağımsız):
 * 1) Çok kısa (6 karakterden az, "Hz" gibi) ya da bağlaçla biten başlık ("Expressing likes and").
 * 2) Aynı derste en az 3 başlık aynı uzunluk sınırına (en uzunun 2 karakter yakınına) dayanıyorsa ve bu sınır 30 karakteri
 *    geçmiyorsa, sınıra dayananlar sütun genişliğinde kesilmiştir.
 */
export function yarimBasliklar(items: { subject: string; title: string }[]): Set<string> {
  const out = new Set<string>()
  const bySubj = new Map<string, string[]>()
  for (const it of items) {
    const t = it.title.trim()
    const son = t.split(/\s+/).at(-1)?.toLocaleLowerCase('tr') ?? ''
    if (t.replace(/\.$/, '').length < 6 || BAGLAC.has(son)) out.add(it.title)
    bySubj.set(it.subject, [...new Set([...(bySubj.get(it.subject) ?? []), it.title])])
  }
  for (const ts of bySubj.values()) {
    const L = Math.max(...ts.map((t) => t.trim().length))
    if (L > 30) continue
    const sinir = ts.filter((t) => t.trim().length >= L - 2)
    if (sinir.length >= 3) sinir.forEach((t) => out.add(t))
  }
  return out
}

/** Resmî listedeki adaylardan yarım başlıkla başlayan tek bir başlık varsa onu döndürür (büyük/küçük harf ve boşluk farkı yok sayılır). */
export function tekTamamlama(yarim: string, adaylar: string[]): string | null {
  const n = (s: string) => s.toLocaleLowerCase('tr').replace(/\s+/g, ' ').trim()
  const p = n(yarim)
  if (p.length < 6) return null
  const es = [...new Set(adaylar.filter((a) => n(a).startsWith(p) && n(a).length > p.length).map((a) => a.trim().replace(/\.$/, '')))]
  return es.length === 1 ? es[0]! : null
}
