// Eski (2018/2019, Sosyal ve Tarih 2023) öğretim programları → kazanımlar. "KOD metin" satırları; kazanım tek cümledir.
// Doğrulama: 8. sınıfta mevcut katalogla (326 kazanım) birebir yeniden üretim + resmî kazanım sayısı tabloları.
import { lines } from './okuyucu.mjs'

export const LEGACY = {
  MAT: { re: '(M\\.(\\d{1,2})\\.\\d\\.\\d{1,2}\\.\\d{1,2})' },
  FEN: { re: '(F\\.(\\d{1,2})\\.\\d{1,2}\\.\\d{1,2}\\.\\d{1,2})' },
  TUR: { re: '(T\\.(\\d{1,2})\\.\\d\\.\\d{1,2})' },
  INK: { re: '(İTA\\.(\\d{1,2})\\.\\d{1,2}\\.\\d{1,2})' },
  DIN: { re: '((\\d{1,2})\\.\\d{1,2}\\.\\d{1,2})' },
  ING: { re: '(E(\\d{1,2})\\.\\d{1,2}\\.(?:L|SI|SP|R|W)\\d{1,2})' },
}
export function extractLegacy(file, re, grades, from = 1) {
  // Satır başındaki kodda nokta yerine virgül (kaynak yazım hatası, ör. "12,2.1."): noktalama normalleştirilir, not düşülür.
  const pages = lines(file).map((ls) => ls.map((l) => (/^\d{1,2},\d{1,2}\.\d/.test(l.t) ? { ...l, t: l.t.replace(/^(\d{1,2}),/, '$1.'), note: `kaynakta "${l.t.slice(0, 7)}" (virgül) yazıyor` } : l)))
  const outs = new Map()
  const R = new RegExp(`^${re}\\.?(?!\\d)\\s*(\\S.*)$`), NEXT = new RegExp(`^${re}\\.?(?!\\d)\\s*\\S`)
  pages.forEach((ls, pi) => {
    if (pi + 1 < from) return // içindekiler vb. ön sayfalar (aynı numara orada da geçer)
    const sorted = [...ls].sort((a, b) => a.y - b.y || a.x - b.x)
    sorted.forEach((l, i) => {
      const m = l.t.match(R)
      if (!m || (grades && !grades.includes(+m[2]))) return
      // Bölüm başlıkları ("3.2. ÜNİTE, KAZANIM VE AÇIKLAMALARI") kazanım değildir: harflerin tamamı büyükse atla
      const letters = m[3].replace(/[^A-Za-zÇĞİÖŞÜçğıöşü]/g, '')
      if (letters.length >= 3 && letters === letters.toLocaleUpperCase('tr')) return
      const parts = [m[3]]
      for (const z of sorted.slice(i + 1)) {
        if (/[.!?]["”’)]?\s*$/.test(parts.at(-1))) break // kazanım tek cümledir: cümle bitince açıklamalar başlar
        if (NEXT.test(z.t) || /^[a-zçğıöşü]\)\s|^[a-zçğıöşü]\.\s/.test(z.t) || z.x < l.x - 3 || z.y - (sorted[sorted.indexOf(z) - 1]?.y ?? z.y) > 26) break
        parts.push(z.t)
      }
      const text = parts.join(' ').replace(/(\S)-\s+(\S)/g, '$1$2').replace(/\s+/g, ' ').trim()
      if (!outs.has(m[1])) outs.set(m[1], { code: m[1], grade: +m[2], text, page: pi + 1, ...(l.note ? { note: l.note } : {}) })
    })
  })
  return [...outs.values()]
}

// Döndürülmüş kutular (İngilizce 2018): metin dikey (aşağıdan yukarı). Bir paragrafın satırları aynı başlangıç
// kenarını (alt sınır = bbox y2) paylaşır ve ~12 birim sağa doğru dizilir. Cümle (.) bitince durulur.
export function extractRotated(file, re, grades) {
  const pages = lines(file), outs = new Map(), R = new RegExp(`^${re}\\.?(?!\\d)\\s*(\\S.*)$`), CODE = new RegExp(`^${re}`)
  pages.forEach((ls, pi) => {
    for (const l of ls) {
      const m = l.t.match(R)
      if (!m || (grades && !grades.includes(+m[2]))) continue
      const parts = [m[3]]
      let cur = l
      while (!/[.!?]\s*$/.test(parts.at(-1))) {
        const nx = ls.filter((z) => z !== cur && z.vert === l.vert && z.x >= cur.x + 6 && z.x <= cur.x + 20 && Math.abs(z.y2 - l.y2) < 3 && !CODE.test(z.t)).sort((a, b) => a.x - b.x)[0]
        if (!nx) break
        parts.push(nx.t); cur = nx
      }
      const text = parts.join(' ').replace(/(\S)-\s+(\S)/g, '$1$2').replace(/\s+/g, ' ').trim()
      if (!outs.has(m[1])) outs.set(m[1], { code: m[1], grade: +m[2], text, page: pi + 1 })
    }
  })
  return [...outs.values()]
}

// Türk Dili ve Edebiyatı 2018: sınıftan bağımsız kazanım listesi. Resmî kod "A.1.12" (program kodu bir yerde bitişik
// yazar; diğerlerinde "A.1. 9." boşluklu basılmış: boşluk normalleştirilir). Okuma/Sözlü iletişim "A|C.k.n", Yazma "B.n".
export function extractTDE2018(file, from = 19, to = 29) {
  const outs = new Map()
  lines(file).forEach((ls, pi) => {
    if (pi + 1 < from || pi + 1 > to) return
    const s = [...ls].sort((a, b) => a.y - b.y || a.x - b.x)
    s.forEach((l, i) => {
      const m = l.t.match(/^([AC])\.(\d{1,2})\.\s*(\d{1,2})\.\s+(\S.*)$/) || l.t.match(/^(B)\.(\d{1,2})\.\s+()([A-ZÇĞİÖŞÜ].*)$/)
      if (!m) return
      const code = m[3] ? `${m[1]}.${m[2]}.${m[3]}` : `B.${m[2]}`
      const parts = [m[4]]
      for (const z of s.slice(i + 1)) { if (/[.!?]\s*$/.test(parts.at(-1)) || /^[a-zçğıöşü]\.\s|^[A-C]\.\d/.test(z.t)) break; parts.push(z.t) }
      if (!outs.has(code)) outs.set(code, { code, konu: m[3] ? `${m[1]}.${m[2]}` : 'B', text: parts.join(' ').replace(/(\S)-\s+(\S)/g, '$1$2').replace(/\s+/g, ' ').trim(), page: pi + 1 })
    })
  })
  return [...outs.values()]
}
