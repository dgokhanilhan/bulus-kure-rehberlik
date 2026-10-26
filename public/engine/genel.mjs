// Genel deneme motoru (5–12): biçim ailesi kayıt defteri + tanıma (yayın / sınıf / biçim / sınav türü, güven + kanıt) + ayrıştırma.
// Çıktı yayıncıdan bağımsız ham kayıtlardır (bölüm etiketi → D/Y/B/net, soru → anahtar/cevap/kod/metin); şablona eşleme
// ve kural doğrulaması uygulama katmanında ve sunucuda (import_exam) yapılır. Tanınmayan düzen UNKNOWN döner: yanlış
// ayrıştırıcı çalıştırılmaz, değer tahmin edilmez. Mevcut LGS motoru (parser.mjs) bu dosyadan bağımsızdır ve değişmez.
import mupdf from './mupdf/mupdf.js'
import { sha256 } from './hashes/sha2.js'

export const ENGINE = 'genel-1.3.2'
const num = (s) => {
  const t = String(s ?? '')
    .trim()
    .replace(',', '.')
  if (!/^-?\d+(\.\d+)?$/.test(t)) return null
  return Number(t)
}
const clean = (t) =>
  t
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()

// Bazı karne yazılımları gömülü yazı tipine bozuk ToUnicode tablosu yazar: harf yerine glif numarası (gid) çıkar
// ("Puan" → "3XDQ", rakamlar okunamaz). Onarım modunda bilinmeyen karakterler gid olarak alınır ve yazı tipinin kendi
// cmap tablosuyla gerçek harfe çevrilir. Yalnız normal okumada tanınmayan PDF'te denenir (diğer biçimler etkilenmez).
const ONARIM_ADAY = (() => {
  const a = []
  for (let u = 0x20; u < 0x7f; u++) a.push(u)
  for (let u = 0xa0; u < 0x180; u++) a.push(u)
  for (const u of [0x2013, 0x2014, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2026, 0x2212]) a.push(u)
  return a
})()
function gidCevirici(f, cache) {
  const name = f.getName()
  let m = cache.get(name)
  if (!m) {
    const rev = new Map()
    for (const u of ONARIM_ADAY) {
      const g = f.encodeCharacter(u)
      if (g > 0 && !rev.has(g)) rev.set(g, String.fromCodePoint(u))
    }
    m = { rev, kontrol: 0 }
    cache.set(name, m)
  }
  return m
}

/** Sayfa: satırlar (konumlu) + karakterler (kutulu). onar: bozuk ToUnicode'lu yazı tiplerinde gid → harf. */
export function readPages(bytes, { onar = false } = {}) {
  const d = mupdf.Document.openDocument(bytes, 'application/pdf'),
    pages = [],
    fonts = new Map()
  try {
    if (d.needsPassword()) throw Error('Parolalı PDF. Önce parolasız bir kopyasını yükleyin.')
    if (d.countPages() > 1000) throw Error('PDF en fazla 1000 sayfa olabilir.')
    for (let i = 0; i < d.countPages(); i++) {
      const pg = d.loadPage(i),
        st = pg.toStructuredText(onar ? 'preserve-whitespace,use-cid-for-unknown-unicode' : 'preserve-whitespace'),
        lines = [],
        cs = [],
        ham = []
      let l
      st.walk({
        beginLine: (b) => {
          l = { x: b[0], y: b[1], t: '' }
          lines.push(l)
        },
        onChar: (c, o, f, s, q) => {
          if (onar) {
            const m = gidCevirici(f, fonts)
            const u = c.codePointAt(0)
            if (u < 0x20) m.kontrol++
            ham.push({ l, i: l.t.length, m, u })
          }
          l.t += c
          cs.push({
            c,
            x0: Math.min(q[0], q[2], q[4], q[6]),
            y0: Math.min(q[1], q[3], q[5], q[7]),
            x1: Math.max(q[0], q[2], q[4], q[6]),
            y1: Math.max(q[1], q[3], q[5], q[7]),
          })
        },
      })
      st.destroy()
      pg.destroy()
      if (onar) onarSayfa(lines, cs, ham)
      const ls = lines.map((z) => ({ ...z, t: clean(z.t) })).filter((z) => z.t)
      pages.push({ n: i + 1, lines: ls, cs, text: ls.map((z) => z.t).join('\n') })
    }
  } finally {
    d.destroy()
  }
  return pages
}
// Yazı tipi bozuksa karakterleri gid → harf çevir. Doğru eşlemeli yazı tipi kontrol karakteri (U+0000–001F) üretmez;
// bozuk olanda boşluk (gid 3), rakamlar ve noktalama bu aralığa düşer.
function onarSayfa(lines, cs, ham) {
  const bozuk = (m) => m.kontrol >= 3
  const yeni = new Map(lines.map((l) => [l, l.t.split('')]))
  ham.forEach((h, k) => {
    if (!bozuk(h.m)) return
    const c = h.m.rev.get(h.u)
    if (!c) return
    yeni.get(h.l)[h.i] = c
    cs[k].c = c
  })
  for (const l of lines) l.t = yeni.get(l).join('')
}

/** Bir satır bandında [x0, x1) aralığındaki karakterler (merkezlerine göre). */
const band = (p, x0, x1, yc, h = 6) =>
  p.cs
    .filter((z) => {
      const cx = (z.x0 + z.x1) / 2,
        cy = (z.y0 + z.y1) / 2
      return cx >= x0 && cx < x1 && Math.abs(cy - yc) < h / 2
    })
    .sort((a, b) => a.x0 - b.x0)
    .map((z) => z.c)
    .join('')
    .trim()
const lineMid = (p, l) => {
  const cs = p.cs.filter((z) => Math.abs(z.y0 - l.y) < 1.5 && z.x0 >= l.x - 1)
  return cs.length ? cs.reduce((a, z) => a + (z.y0 + z.y1) / 2, 0) / cs.length : l.y + 4
}

// Kod + metin: "T.7.3.18. Metindeki…" · "T.S.5.3.5 Yardımcı…" · "MAT.9.1.1. Gerçek…" · "TDES.1.7.1. Sözcük…"
export function splitCode(s) {
  const m = clean(s).match(/^((?:[A-ZÇĞİÖŞÜ]{1,6}\.){1,2}\d{1,2}(?:\.\d{1,2}){1,4})(?:\.?\s+|\.(?=[A-Za-zÇĞİÖŞÜçğıöşü"“(]))(.*)$/)
  return m ? { code: m[1], text: m[2] || null } : { code: null, text: clean(s) || null }
}
const examCode = (title) => {
  const t = title || '',
    g = t.match(/GELİŞİM VE DEĞERLENDİRME[\s-]*(\d{1,2})\b/i)
  if (g) return `GD-${g[1]}`
  const m = t.match(/\b(TG|DENEME|DNM)[\s-]*(\d{1,2})\b/i)
  return m ? `${m[1].toUpperCase() === 'DNM' ? 'DENEME' : m[1].toUpperCase()}-${m[2]}` : null
}

// ---------------------------------------------------------------- Hız karne: ortak sonuç sayfası okuyucu
function resultSections(p) {
  const out = []
  for (const h of p.lines.filter((l) => /^Soru Say/i.test(l.t))) {
    const lab = p.lines
      .filter(
        (m) => Math.abs(m.y - h.y) < 32 && m.x < h.x && h.x - m.x < 60 && /[A-ZÇĞİÖŞÜ]{3}/.test(m.t) && !/Soru|Başarı|ORTALAMA|SÖZEL|SAYISAL|EŞİT/.test(m.t),
      )
      .sort((a, b) => Math.abs(a.y - h.y) - Math.abs(b.y - h.y))[0]
    const vals = p.lines
      .filter((m) => m.y > h.y + 4 && m.y < h.y + 22 && m.x > h.x - 10 && m.x < h.x + 220 && /^-?[\d.,]+$/.test(m.t))
      .sort((a, b) => a.x - b.x)
      .map((m) => num(m.t))
    if (!lab || vals.length < 5 || vals.slice(0, 5).some((v) => v === null)) continue
    const [n, d, y, b, net] = vals
    out.push({ label: clean(lab.t), n, d, y, b, net })
  }
  return out
}
function student(p) {
  const cl = p.lines.find((l) => /^(\d{1,2})\/([A-ZÇĞİÖŞÜ0-9]+)\s*-\s*(\d+)$/.test(l.t))
  if (!cl) return null
  const [, g, sec, no] = cl.t.match(/^(\d{1,2})\/([A-ZÇĞİÖŞÜ0-9]+)\s*-\s*(\d+)$/)
  const name = p.lines.filter((l) => Math.abs(l.x - cl.x) < 3 && l.y < cl.y && cl.y - l.y < 16).sort((a, b) => b.y - a.y)[0]
  return { name: name ? clean(name.t) : null, number: no, class: g === '0' ? null : `${g}/${sec}`, classGrade: g === '0' ? null : +g }
}
export function namedScores(p) {
  const scores = {}
  for (const l of p.lines) {
    const m = l.t.match(/^(Sayısal|SAYISAL|Eşit Ağır\.?|EŞİT AĞIRLIK|Sözel|SÖZEL|Dil|DİL)\s*:\s*(.*)$/)
    if (!m) continue
    const key = /^Sayısal|^SAYISAL/.test(m[1]) ? 'SAY' : /^Eşit|^EŞİT/.test(m[1]) ? 'EA' : /^Dil|^DİL/.test(m[1]) ? 'DIL' : 'SOZ'
    const nearby = p.lines.filter((z) => z.x > l.x + 25 && z.x < l.x + 100 && Math.abs(z.y - l.y) < 3 && /^\d+[.,]\d+$/.test(z.t))
    const value = num(m[2]) ?? (nearby.length === 1 ? num(nearby[0].t) : null)
    if (value !== null) scores[key] = value
  }
  // Önceki Hız düzeni: puan etiketi ve değer ayrı satırlarda, "... / puan".
  for (const [label, key] of [
    ['SAYISAL', 'SAY'],
    ['EŞİT AĞIRLIK', 'EA'],
    ['SÖZEL', 'SOZ'],
    ['DİL', 'DIL'],
  ]) {
    if (scores[key] !== undefined) continue
    const l = p.lines.find((z) => z.t === label)
    const v = l && p.lines.filter((z) => Math.abs(z.y - l.y) < 3 && /\/\s*[\d.,]+$/.test(z.t))
    if (v?.length === 1) {
      const value = num(v[0].t.split('/').at(-1))
      if (value !== null) scores[key] = value
    }
  }
  return scores
}
function score(p) {
  const h = p.lines.find((l) => l.t === 'PUAN')
  if (!h) return null
  const v = p.lines
    .filter((l) => /^\d+[.,]\d+$/.test(l.t) && Math.abs(l.x - h.x) < 60 && l.y >= h.y - 3 && l.y - h.y < 25)
    .sort((a, b) => a.y - b.y || a.x - b.x)[0]
  return v ? num(v.t) : null
}
const titleOf = (p) => {
  const t = p.lines.filter((l) => l.y < 70 && l.x > 280 && /[A-ZÇĞİÖŞÜ0-9]/.test(l.t) && !/^ÖĞRENCİ|^SONUÇ/.test(l.t)).sort((a, b) => a.y - b.y)[0]
  return t ? clean(t.t) : null
}

// ---------------------------------------------------------------- aileler
const ORTA_LABELS = ['TÜRKÇE', 'SOSYAL BİLGİLER', 'T.C. İNKILAP', 'DİN KÜLTÜRÜ', 'İNGİLİZCE', 'MATEMATİK', 'FEN BİLİMLERİ']
const LISE_LABELS = ['TÜRK DİLİ', 'TÜRKÇE', 'TARİH', 'COĞRAFYA', 'FELSEFE', 'DİN KÜLTÜR', 'MATEMATİK', 'FİZİK', 'KİMYA', 'BİYOLOJİ']

export const FAMILIES = {
  HIZ_ORTAOKUL: {
    format: 'HIZ_ORTAOKUL_KARNE_V1',
    publisher: 'Hız Yayınları',
    wrongPerCorrect: 3,
    detect(pages) {
      const ev = [],
        p0 = pages[0]
      if (!/ÖĞRENCİ SINAV/.test(p0.text) || !/SONUÇ BELGESİ/.test(p0.text)) return { score: 0, evidence: [] }
      ev.push('"ÖĞRENCİ SINAV / SONUÇ BELGESİ" başlığı')
      const kz = pages.filter((p) => /^KAZANIMLAR$/m.test(p.text)).length
      if (kz) ev.push(`${kz} sayfada "KAZANIMLAR" tablosu (sonuç + kazanım sayfa çifti)`)
      const labs = resultSections(p0).map((s) => s.label)
      const hit = labs.filter((l) => ORTA_LABELS.some((o) => l.startsWith(o))).length
      if (hit >= 4) ev.push(`ortaokul ders başlıkları (${labs.join(', ')})`)
      const st = student(p0)
      if (st?.classGrade >= 5 && st.classGrade <= 8) ev.push(`sınıf alanı ${st.class}`)
      const sc = (kz ? 0.35 : 0) + (hit >= 4 ? 0.35 : 0) + 0.15 + (st?.classGrade >= 5 && st.classGrade <= 8 ? 0.15 : 0)
      return { score: sc, evidence: ev }
    },
    parse(pages) {
      const recs = [],
        failed = []
      for (let i = 0; i < pages.length; i++) {
        const p = pages[i]
        if (!/ÖĞRENCİ SINAV/.test(p.text) || /^KAZANIMLAR$/m.test(p.text)) continue
        const st = student(p),
          secs = resultSections(p)
        if (!st || !secs.length) {
          failed.push({ page: p.n, error: 'Öğrenci veya ders tablosu okunamadı.' })
          continue
        }
        const kz = pages[i + 1] && /^KAZANIMLAR$/m.test(pages[i + 1].text) ? pages[i + 1] : null
        recs.push({
          page: p.n,
          pages: kz ? [p.n, kz.n] : [p.n],
          student: st,
          exam: { title: titleOf(p) },
          score: score(p),
          sections: secs,
          items: kz ? ortaItems(kz) : [],
          warnings: kz ? [] : ['KAZANIM_PAGE_MISSING'],
        })
      }
      return { recs, failed }
    },
  },
  AKBIM: {
    format: 'AKBIM_SONUC_BELGESI_V1',
    publisher: null,
    wrongPerCorrect: 3,
    inferWrongPerCorrect: true,
    title: (p) => akbimHeader(p)?.title ?? null,
    student: (p) => akbimHeader(p),
    detect(pages) {
      const p0 = pages[0],
        ev = []
      if (!akbimPage(p0)) return { score: 0, evidence: [] }
      ev.push('"SINAV SONUÇ BELGESİ" + DERSLER / SORU SAYISI / NET SAYISI tablosu')
      if (/AKBİM|Akbim ODS/.test(p0.text)) ev.push('Akbim ODS optik okuma yazılımı izi')
      const h = akbimHeader(p0)
      if (h) ev.push('MEB KODU · ŞUBE · SOYADI - ADI · SINAV ADI başlığı')
      const n = pages.filter(akbimPage).length
      ev.push(`${n}/${pages.length} sayfa aynı düzende (öğrenci başına tek sayfa)`)
      return { score: 0.5 + (/AKBİM|Akbim ODS/.test(p0.text) ? 0.25 : 0) + (h ? 0.15 : 0) + (n === pages.length ? 0.1 : 0), evidence: ev }
    },
    parse(pages) {
      const recs = [],
        failed = []
      for (const p of pages) {
        if (!akbimPage(p)) {
          failed.push({ page: p.n, error: 'Sayfa sonuç belgesi düzeninde değil.' })
          continue
        }
        const h = akbimHeader(p)
        const { secs } = akbimSections(p, h?.classGrade ?? null)
        if (!h || !secs.length) {
          failed.push({ page: p.n, error: 'Öğrenci veya ders tablosu okunamadı.' })
          continue
        }
        const nos = p.lines.find((l) => /\*+\s*-\s*\d+$/.test(l.t) || /^\d*\**\s*-\s*\d+$/.test(l.t))
        const number = nos ? String(+nos.t.split('-').at(-1).trim()) : null
        const pu = p.lines.find((l) => l.t === 'PUANI'),
          sc = pu ? p.lines.find((l) => Math.abs(l.y - pu.y) < 6 && l.x > pu.x + 40 && /^\d{2,3}[,.]\d+$/.test(l.t)) : null
        const date = (() => {
          const t = p.lines.find((l) => l.t === 'SINAV TARİHİ')
          const v = t && p.lines.find((l) => Math.abs(l.y - t.y) < 3 && /^\d{2}\.\d{2}\.\d{4}$/.test(l.t))
          return v ? v.t.split('.').reverse().join('-') : null
        })()
        recs.push({
          page: p.n,
          pages: [p.n],
          student: { name: h.name, number, class: h.class, classGrade: h.classGrade },
          exam: { title: h.title, date },
          score: sc ? num(sc.t) : null,
          sections: secs.map(({ raw, x, ...s }) => s),
          items: akbimItems(p, secs),
          warnings: [],
        })
      }
      return { recs, failed }
    },
  },
  DERS_ANALIZ: {
    format: 'DERS_ANALIZ_SONUC_BELGESI_V1',
    publisher: null,
    wrongPerCorrect: 3,
    inferWrongPerCorrect: true,
    title: (p) => daHeader(p)?.title ?? null,
    student: (p) => daHeader(p),
    ilkSayfa: (pages) => pages.find(daPage),
    detect(pages) {
      // İlk sayfa okul net listesi olabilir (ör. Kafa Dengi "OKUL NET LİSTESİ" + öğrenci sonuç belgeleri): ilk sonuç belgesine bakılır
      const p0 = pages.find(daPage),
        ev = []
      if (!p0) return { score: 0, evidence: [] }
      const ozet = pages.filter(daOzet).length
      ev.push('"SONUÇ BELGESİ" + Ders / Soru / Doğru / Yanlış / Net tablosu ve "Cevap Anh." satırları')
      if (/DERSLERE GÖRE ANALİZ/.test(p0.text)) ev.push('"DERSLERE GÖRE ANALİZ" kazanım tablosu')
      const h = daHeader(p0)
      if (h) ev.push('Öğrenci · Numara · Sınıf başlığı')
      const n = pages.filter(daPage).length
      ev.push(`${n}/${pages.length} sayfa aynı düzende (öğrenci başına tek sayfa)${ozet ? `; ${ozet} özet / net listesi sayfası atlanır` : ''}`)
      return { score: 0.5 + (/DERSLERE GÖRE ANALİZ/.test(p0.text) ? 0.2 : 0) + (h ? 0.15 : 0) + (n + ozet === pages.length ? 0.1 : 0), evidence: ev }
    },
    parse(pages) {
      const recs = [],
        failed = []
      for (const p of pages) {
        if (!daPage(p)) {
          // Okul net listesi / özet sayfası öğrenci karnesi değildir: atlanır (hata sayılmaz)
          if (!daOzet(p)) failed.push({ page: p.n, error: 'Sayfa sonuç belgesi düzeninde değil.' })
          continue
        }
        const h = daHeader(p)
        const secs = daSections(p, h?.classGrade ?? null)
        if (!h || !secs.length) {
          failed.push({ page: p.n, error: 'Öğrenci veya ders tablosu okunamadı.' })
          continue
        }
        recs.push({
          page: p.n,
          pages: [p.n],
          student: { name: h.name, number: h.number, class: h.class, classGrade: h.classGrade },
          exam: { title: h.title },
          score: daScore(p),
          sections: secs.map(({ raw, row, ...s }) => s),
          items: daItems(p, secs),
          warnings: [],
        })
      }
      return { recs, failed }
    },
    // Kazanım tablosu soru numarası vermez: soru → kazanım bağı öğrencilerin sonuçlarından çözülür (daKazanimBagla)
    finish: (recs, pages, det) => daKazanimBagla(recs, pages, det),
  },
  HIZ_LISE: {
    format: 'HIZ_LISE_KARNE_V1',
    publisher: 'Hız Yayınları',
    wrongPerCorrect: 4,
    detect(pages) {
      const ev = [],
        p0 = pages[0]
      if (!/ÖĞRENCİ SINAV/.test(p0.text) || !/SONUÇ BELGESİ/.test(p0.text)) return { score: 0, evidence: [] }
      ev.push('"ÖĞRENCİ SINAV / SONUÇ BELGESİ" başlığı')
      const graph = pages.some((p) => /Sınav Karşılaştırma Grafiği/.test(p.text))
      if (graph) ev.push('"Sınav Karşılaştırma Grafiği" ve soru-kazanım listesi sayfası')
      const labs = resultSections(p0).map((s) => s.label)
      const hit = labs.filter((l) => LISE_LABELS.some((o) => l.includes(o))).length
      const lise = labs.some((l) => /FİZİK|KİMYA|BİYOLOJİ|COĞRAFYA|TÜRK DİLİ/.test(l))
      if (lise) ev.push(`lise ders başlıkları (${labs.join(', ')})`)
      const sc = (graph ? 0.4 : 0) + (lise && hit >= 5 ? 0.45 : 0) + 0.15
      return { score: sc, evidence: ev }
    },
    parse(pages) {
      const recs = [],
        failed = []
      for (let i = 0; i < pages.length; i++) {
        const p = pages[i]
        if (!/ÖĞRENCİ SINAV/.test(p.text) || /Sınav Karşılaştırma Grafiği/.test(p.text)) continue
        const st = student(p),
          secs = resultSections(p)
        if (!st || !secs.length) {
          failed.push({ page: p.n, error: 'Öğrenci veya ders tablosu okunamadı.' })
          continue
        }
        const qs = []
        if (pages[i + 1] && /Sınav Karşılaştırma Grafiği/.test(pages[i + 1].text)) {
          for (let j = i + 1; j < pages.length; j++) {
            if (j > i + 1 && /ÖĞRENCİ SINAV/.test(pages[j].text) && !/Sınav Karşılaştırma Grafiği/.test(pages[j].text)) break
            qs.push(pages[j])
          }
        }
        const extra = namedScores(p)
        recs.push({
          page: p.n,
          pages: [p.n, ...qs.map((q) => q.n)],
          student: st,
          exam: { title: titleOf(p) },
          score: score(p) ?? (Object.keys(extra).length === 1 ? Object.values(extra)[0] : null),
          scores: Object.keys(extra).length ? extra : undefined,
          sections: secs,
          items: qs.length ? liseItems(qs) : [],
          warnings: qs.length ? [] : ['QUESTION_PAGE_MISSING'],
        })
      }
      return { recs, failed }
    },
  },
}

// ---------------------------------------------------------------- "Derslere göre analiz" sonuç belgesi (yazılım biçimi; ör. Mobese)
// Öğrenci başına tek sayfa: başlık (SONUÇ BELGESİ + sınav adı), Öğrenci · Numara · Sınıf, Puan, ders tablosu (Ders, Soru,
// Doğru, Yanlış, Net…), "Soru No" satırı, her ders için öğrenci cevabı (büyük harf doğru, küçük harf yanlış, boşluk boş) ve
// "Cevap Anh." satırı (kitapçıkla), sağda kazanım tablosu (soru kodu yok: kazanım soruya bağlanmaz).
const DA_LABEL = [
  [/^TÜRKÇE/, 'TÜRKÇE'],
  [/^MATEMAT/, 'MATEMATİK'],
  [/^DİN/, 'DİN KÜLTÜRÜ'],
  [/^FEN/, 'FEN BİLİMLERİ'],
  [/^(SOSYAL|T\.?C\.?|İNKILAP)/, 'SOS'],
  [/^(İNGİLİZCE|INGILIZCE)/, 'İNGİLİZCE'],
  [/^YABANCI/, 'YAB'],
]
const daPage = (p) => /SONUÇ BELGESİ/.test(p.text) && p.lines.some((l) => l.t === 'Ders') && p.lines.some((l) => /^Cevap Anh/.test(l.t))
// Aynı yazılımın okul özet sayfası ("OKUL NET LİSTESİ", "Genel Ortalama", "KATILIMLAR"): öğrenci karnesi değil
const daOzet = (p) => !daPage(p) && /NET LİSTESİ|SIRALI LİSTE|SONUÇ LİSTESİ/i.test(p.text) && /Ortalama/i.test(p.text)
function daHeader(p) {
  const L = (t) => p.lines.find((l) => l.t === t)
  const o = L('Öğrenci'),
    no = L('Numara'),
    sn = L('Sınıf')
  if (!o || !no || !sn) return null
  const row = p.lines.filter((l) => l.y > o.y + 6 && l.y < o.y + 22 && l.x < sn.x + 40)
  const at = (x0, x1) =>
    row
      .filter((l) => l.x >= x0 && l.x < x1)
      .map((l) => l.t)
      .join(' ')
      .trim()
  const name = at(o.x - 5, no.x - 30) || null
  const numRaw = at(no.x - 30, (no.x + sn.x) / 2)
  const clsRaw = at((no.x + sn.x) / 2, sn.x + 80).replace(/\s+/g, '')
  const m = clsRaw.match(/^(\d{1,2})[-/.]?([A-ZÇĞİÖŞÜ]{1,2})?$/i)
  const t = p.lines.find((l) => l.y < 35 && /DENEME|SINAV|SINIF/i.test(l.t) && l.t !== 'SONUÇ BELGESİ')
  return {
    title: t ? clean(t.t) : null,
    name,
    number: /^\d+$/.test(numRaw) && +numRaw > 0 ? String(+numRaw) : null,
    class: m ? (m[2] ? `${m[1]}/${m[2].toLocaleUpperCase('tr')}` : m[1]) : clsRaw || null,
    classGrade: m ? +m[1] : null,
  }
}
function daSections(p, grade) {
  const d = p.lines.find((l) => l.t === 'Ders'),
    top = p.lines.find((l) => /^Toplam/.test(l.t))
  if (!d || !top) return []
  const english = ENGLISH_TOPICS.test(p.text)
  const secs = []
  for (const r of p.lines.filter((l) => l.x <= d.x && l.y > d.y + 10 && l.y < top.y - 3).sort((a, b) => a.y - b.y)) {
    const v = p.lines
      .filter((l) => Math.abs(l.y - r.y) < 3 && l.x > r.x + 50 && l.x < 300)
      .sort((a, b) => a.x - b.x)
      .map((l) => num(l.t))
    if (v.length < 4 || v.slice(0, 4).some((x) => x === null)) continue
    const [n, dd, yy, net] = v
    const k = grade !== null && grade >= 9 ? null : DA_LABEL.find(([re]) => re.test(r.t.toLocaleUpperCase('tr')))
    const label = !k ? clean(r.t) : k[1] === 'SOS' ? (grade === 8 ? 'T.C. İNKILAP TARİHİ' : 'SOSYAL BİLGİLER') : k[1] === 'YAB' ? (english ? 'İNGİLİZCE' : 'YABANCI DİL') : k[1]
    secs.push({ label, raw: clean(r.t), row: r.y, n, d: dd, y: yy, b: n - dd - yy, net })
  }
  return secs
}
// "DERSLERE GÖRE ANALİZ" paneli: ders başına kazanım satırları; her satırda kazanım metni ve öğrencinin S (soru sayısı), D, Y'si.
export function daPanel(p) {
  const an = p.lines.find((l) => /DERSLERE GÖRE ANALİZ/.test(l.t))
  if (!an) return []
  const mid = (c) => (c.y0 + c.y1) / 2
  const heads = p.lines.filter((l) => l.t === 'S' && l.x > an.x).sort((a, b) => a.y - b.y)
  const out = []
  heads.forEach((h, i) => {
    const cx = [/^S$/, /^D$/, /^Y$/, /^B/].map((re) => p.lines.find((l) => Math.abs(l.y - h.y) < 2 && re.test(l.t) && l.x >= h.x - 1)?.x)
    if (cx.some((x) => x === undefined)) return out.push(null)
    const next = heads[i + 1]?.y ?? Infinity
    const col = (c) => cx.reduce((k, x, j) => (c.x0 >= x - 1.5 ? j : k), -1)
    // Panel sütunu: ders alt başlığının ("Türkçe", "Din K.ve A.B.") hizası; soldaki karne alanları dışarıda kalır
    const sx = Math.max(...p.lines.filter((l) => Math.abs(l.y - h.y) < 2 && l.x < h.x - 20).map((l) => l.x), an.x - 120) - 3
    const rows = []
    for (const l of p.lines.filter((l) => l.x >= sx && l.x < h.x - 20 && l.y > h.y + 2 && l.y < next).sort((a, b) => a.y - b.y)) {
      const ds = p.cs.filter((c) => Math.abs(mid(c) - (l.y + 4)) < 3 && c.x0 > h.x - 4 && /\d/.test(c.c))
      if (!ds.length) {
        // Satırı sayısız devam eden uzun kazanım metni; bir sonraki ders başlığı (sayısız, büyük harf) değilse eklenir
        if (rows.length && l.t !== l.t.toLocaleUpperCase('tr')) rows.at(-1).text += ' ' + l.t
        continue
      }
      const v = [0, 1, 2].map((j) => ds.filter((c) => col(c) === j).sort((a, b) => a.x0 - b.x0).map((c) => c.c).join(''))
      if (v.some((x) => !/^\d+$/.test(x))) return out.push(null)
      rows.push({ text: clean(l.t), s: +v[0], d: +v[1], y: +v[2] })
    }
    out.push(rows)
  })
  return out
}
// Soru → kazanım: aynı kitapçıktaki bütün öğrencilerde, her kazanımın D/Y'si o kazanıma bağlanan soruların doğru/yanlışıyla
// tutmalı. Bütün tutarlı atamalar sayılır; bir soru yalnız her çözümde aynı kazanıma düşüyorsa bağlanır (tahmin yok).
const KZ_MAX_SOL = 64,
  KZ_MAX_STEP = 3e6
export function kazanimCoz(K, M, T) {
  const nq = M[0]?.length ?? 0,
    ns = M.length
  if (!nq || K.reduce((a, k) => a + k.s, 0) !== nq) return null
  const cap = K.map((k) => k.s),
    asg = Array(nq).fill(-1),
    dc = M.map(() => K.map(() => 0)),
    yc = M.map(() => K.map(() => 0)),
    sols = []
  let step = 0
  const go = (q) => {
    if (sols.length > KZ_MAX_SOL || ++step > KZ_MAX_STEP) return
    if (q === nq) return void sols.push([...asg])
    for (let k = 0; k < K.length; k++) {
      if (!cap[k]) continue
      let ok = true
      for (let s = 0; s < ns && ok; s++) {
        const m = M[s][q],
          dd = dc[s][k] + (m === '+'),
          yy = yc[s][k] + (m === '-')
        if (dd > T[s][k].d || yy > T[s][k].y || (cap[k] === 1 && (dd !== T[s][k].d || yy !== T[s][k].y))) ok = false
      }
      if (!ok) continue
      cap[k]--
      asg[q] = k
      for (let s = 0; s < ns; s++) {
        if (M[s][q] === '+') dc[s][k]++
        if (M[s][q] === '-') yc[s][k]++
      }
      go(q + 1)
      for (let s = 0; s < ns; s++) {
        if (M[s][q] === '+') dc[s][k]--
        if (M[s][q] === '-') yc[s][k]--
      }
      cap[k]++
      asg[q] = -1
    }
  }
  go(0)
  if (!sols.length || sols.length > KZ_MAX_SOL || step > KZ_MAX_STEP) return null
  return Array.from({ length: nq }, (_, q) => (sols.every((x) => x[q] === sols[0][q]) ? sols[0][q] : null))
}
function daKazanimBagla(recs, pages, det) {
  const byPage = new Map(pages.map((p) => [p.n, p]))
  const panels = new Map(recs.map((r) => [r, daPanel(byPage.get(r.page))]))
  let bagli = 0,
    toplam = 0
  const labels = recs[0]?.sections.map((s) => s.label) ?? []
  labels.forEach((lab, si) => {
    const books = [...new Set(recs.map((r) => r.items.find((q) => q.section === lab)?.booklet ?? null))]
    for (const bk of books) {
      const rs = recs.filter((r) => r.sections[si]?.label === lab && (r.items.find((q) => q.section === lab)?.booklet ?? null) === bk)
      const T = rs.map((r) => panels.get(r)?.[si] ?? null)
      const K = T[0]
      const qs = (r) => r.items.filter((q) => q.section === lab).sort((a, b) => a.q - b.q)
      toplam += rs.length ? qs(rs[0]).length : 0
      // Bütün öğrencilerde aynı kazanım listesi (metin + soru sayısı) ve bütün sorular okunmuş olmalı
      if (!K || !K.length || T.some((t) => !t || t.length !== K.length || t.some((x, j) => x.text !== K[j].text || x.s !== K[j].s))) continue
      if (rs.some((r) => qs(r).length !== r.sections[si].n)) continue
      const fix = kazanimCoz(K, rs.map((r) => qs(r).map((q) => q.mark)), T)
      if (!fix) continue
      for (const r of rs)
        qs(r).forEach((q, i) => {
          if (fix[i] !== null) q.rawText = K[fix[i]].text
        })
      bagli += fix.filter((x) => x !== null).length
    }
  })
  if (toplam) det.evidence.push(`kazanımlar soru düzeyine öğrenci sonuçlarından bağlandı: ${bagli}/${toplam} soru kesin (belirsiz olan bağlanmadı)`)
}

function daScore(p) {
  const t = p.lines.find((l) => l.t === 'Türü')
  if (!t) return null
  const v = p.lines.filter((l) => l.y > t.y + 8 && l.y < t.y + 24 && /^\d{2,3}[,.]\d+$/.test(l.t)).sort((a, b) => a.x - b.x)[0]
  return v ? num(v.t) : null
}
function daItems(p, secs) {
  const sn = p.lines.find((l) => l.t === 'Soru No')
  if (!sn) return []
  const mid = (c) => (c.y0 + c.y1) / 2
  // Soru sütunları: "Soru No" satırındaki ardışık rakamlar (sağdaki kazanım tablosunun sayıları aynı hizada olabilir: aralık büyüyünce durulur)
  const all = p.cs.filter((c) => /\d/.test(c.c) && Math.abs(mid(c) - (sn.y + 4)) < 4 && c.x0 > sn.x + 40).sort((a, b) => a.x0 - b.x0)
  const cols = all.slice(0, 1)
  for (const c of all.slice(1)) {
    const gap = c.x0 - cols.at(-1).x0
    if (cols.length > 1 && gap > (cols[1].x0 - cols[0].x0) * 1.8) break
    cols.push(c)
  }
  if (cols.length < 2) return []
  const w = (cols.at(-1).x0 - cols[0].x0) / (cols.length - 1),
    x0 = cols[0].x0 - w / 2,
    x1 = cols.at(-1).x0 + w / 2 + w * 20 // en uzun ders (ör. 40 soru) satırı da sığar; sağ panel kendi hizasından ayrılır
  const keys = p.lines.filter((l) => /^Cevap Anh/.test(l.t)).sort((a, b) => a.y - b.y)
  // Sağdaki "DERSLERE GÖRE ANALİZ" paneli: başlığının bulunduğu sütundan (en soldaki satır başı) itibaren dışarıda kalır
  const an = p.lines.find((l) => /DERSLERE GÖRE ANALİZ/.test(l.t))
  const panel = an ? Math.min(...p.lines.filter((l) => l.x > cols.at(-1).x0 + w && l.y > an.y && l.y < an.y + 30).map((l) => l.x), an.x) - 2 : Infinity
  const rowChars = (y, re = /[A-Za-z]/) => p.cs.filter((c) => Math.abs(mid(c) - (y + 4)) < 4 && c.x0 >= x0 && c.x0 < Math.min(x1, panel) && re.test(c.c)).sort((a, b) => a.x0 - b.x0)
  const items = []
  // Cevap bölümünde dersler tablodaki sırayla gelir: i. ders = i. "Cevap Anh." satırı; öğrenci cevabı hemen üstündeki satır
  secs.forEach((s, i) => {
    const k = keys[i]
    if (!k) return
    const ansLine = p.lines.filter((l) => l.y < k.y - 4 && l.y > k.y - 20 && l.x < x0).sort((a, b) => b.y - a.y)[0]
    const key = rowChars(k.y),
      ans = ansLine ? rowChars(ansLine.y, /[A-Za-z*]/) : [] // "*": birden çok şık işaretli (yanlış sayılır)
    if (key.length !== s.n) return // sayı tutmazsa soru düzeyi bağlanmaz (check ITEM_COVERAGE uyarır)
    const bk = p.lines.find((l) => Math.abs(l.y - k.y) < 3 && l.x > k.x + 30 && l.x < x0 && /^[A-D]$/.test(l.t))
    key.forEach((kc, q) => {
      // En yakın karakter: ders adı cevap satırına yapışık basılabilir ("SOSYAL BİLGİLERbBDA…")
      const a = ans.filter((c) => Math.abs(c.x0 - kc.x0) < w / 2).sort((u, v) => Math.abs(u.x0 - kc.x0) - Math.abs(v.x0 - kc.x0))[0]
      const K = kc.c.toUpperCase(),
        cancelled = !/^[A-E]$/.test(K)
      items.push({
        label: s.label,
        section: s.label,
        booklet: bk ? bk.t : null,
        q: q + 1,
        testQ: q + 1,
        key: cancelled ? null : K,
        answer: a && a.c !== '*' ? a.c.toUpperCase() : null,
        mark: cancelled ? '+' : !a ? null : a.c === '*' ? '-' : a.c === a.c.toUpperCase() ? '+' : '-',
        rawCode: null,
        rawText: null,
      })
    })
  })
  return items
}

// ---------------------------------------------------------------- Akbim ODS sonuç belgesi (yazılım biçimi; yayından bağımsız)
// Öğrenci başına tek sayfa: üstte MEB KODU | ŞUBE | SOYADI - ADI | SINAV ADI, ders tablosu (SORU SAYISI, DOĞRU CEVAP, YANLIŞ CEVAP,
// NET SAYISI…), PUANI, ders başına "X CEV. ANAH." ve "ÖĞRENCİ CEVABI" satırları (büyük harf doğru, küçük harf yanlış, boşluk boş).
// TÖDER ve Sinan Kuzucu gibi farklı yayınların karneleri bu düzende basılır (kurumun optik okuma yazılımı).
const AKBIM_LABEL = [
  [/^TÜRKÇE/, 'TÜRKÇE'],
  [/^MATEMAT/, 'MATEMATİK'],
  [/^DİN/, 'DİN KÜLTÜRÜ'],
  [/^FEN/, 'FEN BİLİMLERİ'],
  [/^(SOS|T\.?C\.?|İNKILAP)/, 'SOS'],
  [/^(YAB|İNGİLİZCE|INGILIZCE)/, 'YAB'],
]
const ENGLISH_TOPICS = /ADVENTURES|CHORES|TEEN ?LIFE|ON THE PHONE|KITCHEN|COOKING|TOURIS|INTERNET|FRIENDSH|SCIENCE|ACCEPTING|REFUSING|CHART|NATURAL FORCES/i
const akbimPage = (p) => /SINAV SONUÇ BELGESİ/.test(p.text) && /^SORU SAYISI$/m.test(p.text) && /^NET SAYISI$/m.test(p.text) && /^DERSLER$/m.test(p.text)
function akbimHeader(p) {
  const L = (t) => p.lines.find((l) => l.t === t)
  const labs = ['MEB KODU', 'ŞUBE', 'SOYADI - ADI', 'SINAV ADI'].map((t) => ({ t, l: L(t) }))
  if (labs.some((x) => !x.l)) return null
  const y = labs[0].l.y,
    row = p.lines.filter((l) => l.y > y + 6 && l.y < y + 20)
  const cut = labs.slice(0, -1).map((x, i) => (x.l.x + labs[i + 1].l.x) / 2)
  const col = (x) => cut.filter((c) => x >= c).length
  const v = ['', '', '', '']
  for (const l of row.sort((a, b) => a.x - b.x)) v[col(l.x)] = (v[col(l.x)] + ' ' + l.t).trim()
  const cls = v[1].replace(/\s+/g, '').replace(/\/$/, '') || null
  const g = cls?.match(/^(\d{1,2})/)
  return { title: v[3] || null, name: v[2] || null, class: cls ? v[1].replace(/\s*\/\s*$/, '').trim() : null, classGrade: g ? +g[1] : null }
}
function akbimSections(p, grade) {
  const d = p.lines.find((l) => l.t === 'DERSLER'),
    tc = p.lines.find((l) => /^TC VE ÖĞRENCİ/.test(l.t))
  if (!d) return { secs: [], english: false }
  const right = tc ? tc.x - 5 : 400
  // Ders başlıkları: DERSLER satırının ±9 birim bandı; iki satıra bölünmüş başlık ("SOSYAL" / "BİLGİLER") aynı sütunda birleşir
  const heads = []
  for (const l of p.lines.filter((l) => Math.abs(l.y - d.y) < 9 && l.x > d.x + 30 && l.x < right).sort((a, b) => a.y - b.y)) {
    const h = heads.find((z) => Math.abs(z.x - l.x) < 14)
    if (h) h.t += ' ' + l.t
    else heads.push({ x: l.x, t: l.t })
  }
  heads.sort((a, b) => a.x - b.x)
  const rowOf = (label) => {
    const r = p.lines.find((l) => l.t === label)
    return r ? p.lines.filter((l) => Math.abs(l.y - r.y) < 3 && l.x > d.x + 30 && l.x < right).sort((a, b) => a.x - b.x) : []
  }
  const R = { n: rowOf('SORU SAYISI'), d: rowOf('DOĞRU CEVAP'), y: rowOf('YANLIŞ CEVAP'), net: rowOf('NET SAYISI') }
  const at = (row, x) => {
    const c = row.filter((l) => Math.abs(l.x + 8 - x) < 22).sort((a, b) => Math.abs(a.x + 8 - x) - Math.abs(b.x + 8 - x))[0]
    return c ? num(c.t) : null
  }
  const english = ENGLISH_TOPICS.test(p.text)
  const secs = []
  for (const h of heads) {
    if (/^TOPLAM/.test(h.t)) continue
    // Ortaokul başlıkları kısaltmalı basılır ("SOS BİL", "YAB. DİL"): sınıfa göre yorumlanır. Lisede (TYT/AYT) "FEN BİLİMLERİ",
    // "SOSYAL BİLİMLER" toplu testlerdir: başlık olduğu gibi kalır, şablona eşleme kontrol ekranında yapılır (tahmin yok).
    const k = grade !== null && grade >= 9 ? null : AKBIM_LABEL.find(([re]) => re.test(h.t.toLocaleUpperCase('tr')))
    const label = !k
      ? clean(h.t)
      : k[1] === 'SOS'
        ? grade === 8
          ? 'T.C. İNKILAP TARİHİ'
          : 'SOSYAL BİLGİLER'
        : k[1] === 'YAB'
          ? english
            ? 'İNGİLİZCE'
            : 'YABANCI DİL'
          : k[1]
    const cx = h.x + 10
    const n = at(R.n, cx),
      dd = at(R.d, cx),
      yy = at(R.y, cx),
      net = at(R.net, cx)
    secs.push({ label, raw: clean(h.t), x: cx, n, d: dd, y: yy, b: n !== null && dd !== null && yy !== null ? n - dd - yy : null, net })
  }
  return { secs, english }
}
function akbimItems(p, secs) {
  const items = []
  const ys = p.lines.filter((l) => /CEV\.?$|CEV\. ANAH\.$|ANAH\.$/.test(l.t) || /CEV\. ANAH\./.test(l.t))
  const students = p.lines.filter((l) => l.t === 'ÖĞRENCİ CEVABI')
  for (const lab of ys) {
    const raw = lab.t
      .replace(/\s*CEV\.?\s*ANAH\.?$/, '')
      .replace(/\s*CEV\.$/, '')
      .trim()
    const sec = secs.find((s) => nl(s.raw).startsWith(nl(raw)) || nl(raw).startsWith(nl(s.raw)))
    if (!sec) continue
    const st = students.filter((l) => Math.abs(l.x - lab.x) < 6 && l.y > lab.y + 4).sort((a, b) => a.y - b.y)[0]
    if (!st) continue
    const x0 = lab.x + 60,
      x1 = lab.x + 280
    const rowChars = (y) =>
      p.cs.filter((c) => Math.abs((c.y0 + c.y1) / 2 - (y + 4)) < 4.5 && c.x0 >= x0 && c.x1 <= x1 && /[A-Za-zİ]/.test(c.c)).sort((a, b) => a.x0 - b.x0)
    const key = rowChars(lab.y),
      ans = rowChars(st.y)
    if (key.length !== sec.n) continue // sayı tutmazsa soru düzeyi bağlanmaz (check ITEM_COVERAGE uyarır)
    key.forEach((k, i) => {
      const a = ans.find((c) => Math.abs(c.x0 - k.x0) < 2.5)
      const kc = k.c.toUpperCase(),
        cancelled = !/^[A-E]$/.test(kc)
      // İptal edilen soru (anahtarda A–E dışı harf, ör. "T"): karne herkese doğru sayar
      const mark = cancelled ? '+' : !a ? null : a.c === a.c.toUpperCase() ? '+' : '-'
      items.push({
        label: sec.label,
        section: sec.label,
        booklet: null,
        q: i + 1,
        testQ: i + 1,
        key: cancelled ? null : kc,
        answer: a ? a.c.toUpperCase() : null,
        mark,
        rawCode: null,
        rawText: null,
      })
    })
  }
  return items
}

// Ortaokul KAZANIMLAR sayfası: 3 sütun; satır = Sr | kod+metin (93 birim) | DC | ÖC | +-. Başlık "TÜRKÇE(B)".
function ortaItems(p) {
  const heads = p.lines
    .filter((l) => /^(.+?)\s*\(([AB])\)$/.test(l.t) && !/^Sr\b/.test(l.t))
    .map((l) => {
      const [, lab, bk] = l.t.match(/^(.+?)\s*\(([AB])\)$/)
      return { x: l.x, y: l.y, label: clean(lab), booklet: bk }
    })
  const out = []
  for (const l of p.lines) {
    if (!/^\d{1,2}$/.test(l.t)) continue
    const txt = p.lines.find((z) => Math.abs(z.y - l.y) < 1.5 && z.x > l.x + 8 && z.x < l.x + 30)
    if (!txt) continue
    const x0 = txt.x,
      yc = lineMid(p, txt)
    // Üstünde başlık yoksa blok bir önceki sütundan sürüyordur (ör. Matematik 2. sütunun altında başlayıp 3. sütunun üstünde biter)
    const colXs = [...new Set(heads.map((h) => Math.round(h.x)))].sort((a, b) => a - b)
    // başlık metni satır metninden birkaç birim içeride başlayabilir (3. sütun: başlık 425, satır 419)
    let head = heads.filter((h) => Math.abs(h.x - x0) < 10 && h.y < l.y).sort((a, b) => b.y - a.y)[0]
    if (!head) {
      const ci = colXs.findIndex((cx) => Math.abs(cx - x0) < 10)
      if (ci > 0) head = heads.filter((h) => Math.abs(h.x - colXs[ci - 1]) < 10).sort((a, b) => b.y - a.y)[0]
    }
    if (!head) continue
    const body = band(p, x0, x0 + 93.3, yc),
      key = band(p, x0 + 93.3, x0 + 101, yc),
      ans = band(p, x0 + 108, x0 + 124, yc),
      mark = band(p, x0 + 128, x0 + 142, yc)
    const { code, text } = splitCode(body)
    out.push({ label: head.label, booklet: head.booklet, q: +l.t, key: key || null, answer: ans || null, mark: mark || null, rawCode: code, rawText: text })
  }
  return out
}
// Lise soru listesi: 2 sütun; satır = N | D | Ö | +- | kod+metin. Başlık "… Net: 9.50 TÜRK DİLİ(A)".
export function liseItems(pages) {
  // PDF içerik sırası tablo bloklarını korur. Konuma göre bütün sayfadan karakter
  // toplamak, üst üste basılmış blokları birbirine karıştırır. Başlık ve her
  // soru satırı yalnız kendi içerik aralığından okunur; sonraki sayfa devam eder.
  const out = []
  let head = null,
    col = null
  for (const p of Array.isArray(pages) ? pages : [pages]) {
    const ls = p.lines
    for (let i = 0; i < ls.length; i++) {
      const l = ls[i]
      if (l.t === 'N') {
        col = l.x
        head = null
        for (let j = i + 1; j < ls.length && j < i + 20; j++) {
          if (ls[j].t === 'N') break
          const m = ls[j].t.match(/^(.+?)\s*\(([AB]?)\)$/)
          if (m) {
            head = { label: clean(m[1]), booklet: m[2] || null }
            break
          }
        }
        continue
      }
      if (!head || col === null || !/^\d{1,2}$/.test(l.t) || Math.abs(l.x - col) >= 4) continue
      const cells = []
      for (let j = i + 1; j < ls.length; j++) {
        const next = ls[j]
        if (next.t === 'N' || (/^\d{1,2}$/.test(next.t) && Math.abs(next.x - col) < 4)) break
        if (Math.abs(next.y - l.y) < 2) cells.push(next)
        else break
      }
      const cell = (lo, hi) =>
        cells
          .filter((z) => z.x - col >= lo && z.x - col < hi)
          .map((z) => z.t)
          .join(' ')
          .trim()
      const body = cell(40, 290),
        key = cell(7, 18),
        answer = cell(18, 30),
        mark = cell(30, 40)
      if (!body || !/^[ABCDE]$/.test(key) || (mark && !/^[+-]$/.test(mark))) continue
      const { code, text } = splitCode(body)
      out.push({ ...head, q: +l.t, key, answer: answer || null, mark: mark || null, rawCode: code, rawText: text })
    }
  }
  return out
}

// ---------------------------------------------------------------- soruları bölümlere bağlama
// Soru listesi test başlıklarına göre olabilir ("SOSYAL BİLİMLER" = Tarih + Coğrafya + Felsefe + Din): bileşik testin soruları,
// sonuç sayfasındaki ders sırası ve soru sayılarıyla sırayla bölüştürülür. Her soru bölüm içi numara alır (q), test numarası testQ.
const nl = (t) => (t || '').toLocaleUpperCase('tr').replace(/[^A-ZÇĞİÖŞÜ0-9]/g, '')
const sameLabel = (a, b) => {
  const x = nl(a),
    y = nl(b)
  return x === y || (x.length >= 5 && y.startsWith(x)) || (y.length >= 5 && x.startsWith(y))
}
const COMPOSITE = [
  [/^SOSYALBİLİMLER/, /^(TARİH|COĞRAFYA|FELSEFE|DİN)/],
  [/^FENBİLİMLERİ/, /^(FİZİK|KİMYA|BİYOLOJİ)/],
]
export function bindItems(sections, items) {
  const out = [],
    used = new Set()
  const groups = [...new Set(items.map((q) => q.label))]
  for (const g of groups) {
    const qs = items.filter((q) => q.label === g).sort((a, b) => a.q - b.q)
    const direct = sections.find((s) => sameLabel(s.label, g))
    if (direct) {
      qs.forEach((q, i) => out.push({ ...q, section: direct.label, testQ: q.q, q: i + 1 }))
      used.add(direct.label)
      continue
    }
    const comp = COMPOSITE.find(([re]) => re.test(nl(g)))
    const members = comp ? sections.filter((s) => comp[1].test(nl(s.label)) && !used.has(s.label)) : []
    if (!members.length || members.reduce((a, s) => a + s.n, 0) !== qs.length) {
      qs.forEach((q) => out.push({ ...q, section: null, testQ: q.q }))
      continue
    }
    let k = 0
    for (const m of members) {
      qs.slice(k, k + m.n).forEach((q, i) => out.push({ ...q, section: m.label, testQ: q.q, q: i + 1 }))
      k += m.n
      used.add(m.label)
    }
  }
  return out
}

// ---------------------------------------------------------------- tanıma
const GRADE_CODE = [
  [/\b(?:T|M|F|SB|D|E|İTA)\.(\d{1,2})\./g, 'eski program kodları'],
  [/\b(?:MAT|FB|SB|DKAB|ENG|BİY|FİZ|KİM|COĞ|TAR|FEL)\.(\d{1,2})\./g, 'TYMM kodları'],
  [/\bT\.[A-Z]\.(\d)\./g, 'yayıncı kodları'],
]
export function detect(pages, hints = {}) {
  const fam = Object.entries(FAMILIES)
    .map(([k, f]) => ({ key: k, ...f.detect(pages) }))
    .sort((a, b) => b.score - a.score)
  const best = fam[0]
  if (!best || best.score < 0.6)
    return { family: 'UNKNOWN', format: null, confidence: best?.score ?? 0, evidence: best?.evidence ?? [], message: 'Bu PDF biçimi henüz desteklenmiyor.' }
  const F = FAMILIES[best.key],
    // Başlık ve sınav türü biçimin ilk öğrenci sayfasından (özet / net listesi sayfası öndeyse atlanır)
    p0 = F.ilkSayfa?.(pages) ?? pages[0],
    who = F.student ?? student,
    title = (F.title ? F.title(p0) : titleOf(p0)) || ''
  // Sınıf: başlıktaki "N.SINIF", öğrenci sınıf alanı, kazanım kodlarındaki sınıf (ilk kayıtlardan)
  const gEv = [],
    votes = new Map()
  const vote = (g, w, why) => {
    if (!g || g < 1 || g > 12) return
    votes.set(g, (votes.get(g) || 0) + w)
    gEv.push(`${why}: ${g}`)
  }
  const tm = title.match(/(\d{1,2})\s*\.\s*SINIF/i)
  if (tm) vote(+tm[1], 0.5, 'başlıkta sınıf')
  const classGrades = pages
    .slice(0, 12)
    .map(who)
    .filter((s) => s?.classGrade)
    .map((s) => s.classGrade)
  if (classGrades.length) {
    const g = mode(classGrades),
      agree = classGrades.filter((x) => x === g).length
    vote(g, agree >= 3 && agree === classGrades.length ? 0.9 : 0.35, `öğrenci sınıf alanı (${agree}/${classGrades.length} kayıt)`)
  }
  // TYT/AYT soruları 9–12'nin kazanımlarını ölçer: kod sınıfı denemenin sınıfı için kanıt sayılmaz
  if (!/\b(TYT|AYT)\b/.test(title)) {
    const txt = pages
      .slice(0, 6)
      .map((p) => p.text)
      .join('\n')
    for (const [re, why] of GRADE_CODE) {
      const gs = [...txt.matchAll(re)].map((m) => +m[1])
      if (gs.length >= 5) vote(mode(gs), 0.15, `${why} (${gs.length})`)
    }
  }
  const ranked = [...votes].sort((a, b) => b[1] - a[1])
  let grade = ranked[0]?.[0] ?? null,
    gConf = Math.min(0.99, ranked[0]?.[1] ?? 0)
  if (ranked.length > 1 && ranked[1][1] >= 0.3) {
    gConf = Math.min(gConf, 0.5)
    gEv.push('çelişen sınıf işaretleri')
  }
  if (hints.grade && grade && hints.grade !== grade) gEv.push(`seçilen sınıf (${hints.grade}) PDF'te algılananla (${grade}) uyuşmuyor`)
  // Sınav türü
  const tEv = []
  let examType = null,
    yksPart = null,
    tConf = 0
  if (/\bTYT\b/.test(title)) {
    examType = grade === 12 ? 'YKS' : 'TYT'
    yksPart = grade === 12 ? 'TYT' : null
    tConf = 0.95
    tEv.push('başlıkta "TYT"')
  } else if (/\bAYT\b/.test(title)) {
    examType = grade === 12 ? 'YKS' : 'AYT'
    yksPart = grade === 12 ? 'AYT' : null
    tConf = 0.95
    tEv.push('başlıkta "AYT"')
  } else if (/\bLGS\b/.test(title)) {
    examType = 'LGS'
    tConf = 0.95
    tEv.push('başlıkta "LGS"')
  } else if (grade === 8 && p0.lines.some((l) => l.t === 'Türü') && p0.lines.some((l) => l.t === 'LGS')) {
    // Sonuç belgesinde "Puan Türü: LGS" (ör. Kafa Dengi): başlıkta LGS yazmasa da 8. sınıf LGS denemesi
    examType = 'LGS'
    tConf = 0.85
    tEv.push('puan türü "LGS"')
  }
  // Yayın: başlıkta yayın adı varsa o; yoksa biçimin varsayılan yayını (düşük güven)
  let publisher = F.publisher,
    pConf = F.publisher ? 0.6 : 0,
    pEv = F.publisher ? [`biçim varsayılanı (${F.publisher})`] : ['biçim birden çok yayında kullanılıyor; başlıkta yayın adı yok']
  const named = TITLE_PUBLISHERS.find(([re]) => re.test(title))
  if (named) {
    publisher = named[1]
    pConf = 0.95
    pEv = [`başlıkta "${title.match(named[0])[0]}"`]
  }
  return {
    family: best.key,
    format: F.format,
    confidence: Math.round(best.score * 100) / 100,
    evidence: best.evidence,
    others: fam
      .slice(1)
      .filter((f) => f.score > 0)
      .map((f) => ({ family: f.key, confidence: f.score })),
    grade: { value: grade, confidence: Math.round(gConf * 100) / 100, evidence: gEv },
    examType: { value: examType, yksPart, confidence: tConf, evidence: tEv },
    publisher: { value: publisher, confidence: pConf, evidence: pEv },
    exam: { title, code: examCode(title) },
    wrongPerCorrect: F.wrongPerCorrect,
  }
}
const TITLE_PUBLISHERS = [
  [/FREKANS/i, 'Frekans Yayınları'],
  [/MOBESE/i, 'Mobese'],
  [/\bHIZ\b/i, 'Hız Yayınları'],
  [/TÖDER/i, 'TÖDER'],
  [/SİNAN\s*KUZUCU/i, 'Sinan Kuzucu Yayınları'],
  [/BENİM\s*HOCAM/i, 'Benim Hocam Yayınları'],
  [/KAFA\s*DENGİ/i, 'Kafa Dengi Yayınları'],
  [/HİPER\s*ZEKA/i, 'Hiper Zeka Yayınları'],
  [/NARTEST/i, 'Nartest Yayınları'],
  [/ÇANTA/i, 'Çanta Yayınları'],
  [/\bATA\b/i, 'ATA Yayınları'],
  [/ANKARA/i, 'Ankara Yayıncılık'],
]
function mode(a) {
  const m = new Map()
  for (const x of a) m.set(x, (m.get(x) || 0) + 1)
  return [...m].sort((x, y) => y[1] - x[1])[0][0]
}

// ---------------------------------------------------------------- doğrulama (motor içi; kural doğrulaması sunucuda tekrarlanır)
export function check(rec, wrongPerCorrect) {
  const w = [...rec.warnings]
  for (const s of rec.sections) {
    if ([s.n, s.d, s.y, s.b, s.net].some((v) => v === null || !Number.isFinite(v))) {
      w.push(`NAN:${s.label}`)
      continue
    }
    if (s.d + s.y + s.b !== s.n || Math.min(s.d, s.y, s.b) < 0) w.push(`COUNTS:${s.label}`)
    if (Math.abs(s.net - (s.d - s.y / wrongPerCorrect)) > 0.011) w.push(`NET:${s.label}`)
    const qs = rec.items.filter((q) => q.section === s.label)
    if (!rec.items.length) continue
    if (!qs.length && s.d === 0 && s.y === 0) continue // teste girmemiş öğrenci: karne anahtarı da basmaz
    if (qs.length !== s.n) {
      w.push(`ITEM_COVERAGE:${s.label}:${qs.length}/${s.n}`)
      continue
    }
    const c = { d: qs.filter((q) => q.mark === '+').length, y: qs.filter((q) => q.mark === '-').length }
    if (c.d !== s.d || c.y !== s.y) w.push(`ITEM_COUNTS:${s.label}`)
  }
  return w
}

/** Net kuralı karneden: bütün derslerin neti hangi kurala (3 ya da 4 yanlış bir doğruyu götürür) uyuyorsa o; ikisi de uymuyorsa null. */
export function inferWrongPerCorrect(recs) {
  const secs = recs.flatMap((r) => r.sections).filter((s) => [s.d, s.y, s.net].every((v) => v !== null && Number.isFinite(v)))
  const fits = [3, 4].filter((w) => secs.length && secs.every((s) => Math.abs(s.net - (s.d - s.y / w)) <= 0.011))
  if (fits.length === 1) return fits[0]
  return fits.length > 1 ? (recs.some((r) => (r.student?.classGrade ?? 0) >= 9) ? 4 : 3) : null // hiç yanlış yoksa ikisi de uyar: sınıf belirler
}

export async function parseGeneral(bytes, name, hints = {}, onProgress = () => {}) {
  const sha = [...sha256(bytes)].map((x) => x.toString(16).padStart(2, '0')).join('')
  let pages = readPages(bytes)
  onProgress(pages.length, pages.length)
  if (!pages[0]?.text.trim())
    return {
      engine: ENGINE,
      sha256: sha,
      filename: name,
      detection: { family: 'UNKNOWN', confidence: 0, message: 'Taranmış veya metni okunamayan PDF; OCR gerekiyor.' },
      records: [],
      failedPages: [],
    }
  let det = detect(pages, hints)
  // Tanınmadıysa ve yazı tipi eşlemesi bozuksa (kontrol karakteri / okunamayan karakter) onarılmış metinle bir kez daha denenir
  if (det.family === 'UNKNOWN' && pages.some((p) => /�/.test(p.text) || p.cs.some((c) => c.c.charCodeAt(0) < 0x20))) {
    const onarili = readPages(bytes, { onar: true })
    const d2 = detect(onarili, hints)
    if (d2.family !== 'UNKNOWN') {
      d2.evidence.push('PDF yazı tipi eşlemesi bozuk: metin yazı tipinin kendi tablosundan onarıldı')
      pages = onarili
      det = d2
    }
  }
  if (det.family === 'UNKNOWN') return { engine: ENGINE, sha256: sha, filename: name, detection: det, records: [], failedPages: [] }
  const F = FAMILIES[det.family],
    { recs, failed } = F.parse(pages)
  const wpc = F.inferWrongPerCorrect ? inferWrongPerCorrect(recs) : F.wrongPerCorrect
  if (F.inferWrongPerCorrect) {
    det.wrongPerCorrect = wpc ?? undefined
    det.evidence.push(wpc ? `net kuralı karneden: ${wpc} yanlış 1 doğruyu götürür` : 'netler 3 ya da 4 yanlış kuralına uymuyor')
  }
  for (const r of recs) {
    r.items = bindItems(r.sections, r.items)
    const loose = r.items.filter((q) => !q.section).length
    r.warnings = check(r, wpc ?? F.wrongPerCorrect)
    if (!wpc && F.inferWrongPerCorrect) r.warnings.push('NET_RULE_UNKNOWN')
    if (loose) r.warnings.push(`ITEM_UNBOUND:${loose}`)
  }
  if (F.finish) F.finish(recs, pages, det)
  return { engine: ENGINE, sha256: sha, filename: name, pageCount: pages.length, detection: det, records: recs, failedPages: failed }
}
