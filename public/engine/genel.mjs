// Genel deneme motoru (5–12): biçim ailesi kayıt defteri + tanıma (yayın / sınıf / biçim / sınav türü, güven + kanıt) + ayrıştırma.
// Çıktı yayıncıdan bağımsız ham kayıtlardır (bölüm etiketi → D/Y/B/net, soru → anahtar/cevap/kod/metin); şablona eşleme
// ve kural doğrulaması uygulama katmanında ve sunucuda (import_exam) yapılır. Tanınmayan düzen UNKNOWN döner: yanlış
// ayrıştırıcı çalıştırılmaz, değer tahmin edilmez. Mevcut LGS motoru (parser.mjs) bu dosyadan bağımsızdır ve değişmez.
import mupdf from './mupdf/mupdf.js'
import { sha256 } from './hashes/sha2.js'

export const ENGINE = 'genel-1.1.0'
const num = (s) => { const t = String(s ?? '').trim().replace(',', '.'); if (!/^-?\d+(\.\d+)?$/.test(t)) return null; return Number(t) }
const clean = (t) => t.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim()

/** Sayfa: satırlar (konumlu) + karakterler (kutulu). */
export function readPages(bytes) {
  const d = mupdf.Document.openDocument(bytes, 'application/pdf'), pages = []
  try {
    if (d.needsPassword()) throw Error('Parolalı PDF. Önce parolasız bir kopyasını yükleyin.')
    if (d.countPages() > 1000) throw Error('PDF en fazla 1000 sayfa olabilir.')
    for (let i = 0; i < d.countPages(); i++) {
      const pg = d.loadPage(i), st = pg.toStructuredText('preserve-whitespace'), lines = [], cs = []
      let l
      st.walk({
        beginLine: (b) => { l = { x: b[0], y: b[1], t: '' }; lines.push(l) },
        onChar: (c, o, f, s, q) => { l.t += c; cs.push({ c, x0: Math.min(q[0], q[2], q[4], q[6]), y0: Math.min(q[1], q[3], q[5], q[7]), x1: Math.max(q[0], q[2], q[4], q[6]), y1: Math.max(q[1], q[3], q[5], q[7]) }) },
      })
      st.destroy(); pg.destroy()
      const ls = lines.map((z) => ({ ...z, t: clean(z.t) })).filter((z) => z.t)
      pages.push({ n: i + 1, lines: ls, cs, text: ls.map((z) => z.t).join('\n') })
    }
  } finally { d.destroy() }
  return pages
}
/** Bir satır bandında [x0, x1) aralığındaki karakterler (merkezlerine göre). */
const band = (p, x0, x1, yc, h = 6) => p.cs.filter((z) => { const cx = (z.x0 + z.x1) / 2, cy = (z.y0 + z.y1) / 2; return cx >= x0 && cx < x1 && Math.abs(cy - yc) < h / 2 }).sort((a, b) => a.x0 - b.x0).map((z) => z.c).join('').trim()
const lineMid = (p, l) => { const cs = p.cs.filter((z) => Math.abs(z.y0 - l.y) < 1.5 && z.x0 >= l.x - 1); return cs.length ? cs.reduce((a, z) => a + (z.y0 + z.y1) / 2, 0) / cs.length : l.y + 4 }

// Kod + metin: "T.7.3.18. Metindeki…" · "T.S.5.3.5 Yardımcı…" · "MAT.9.1.1. Gerçek…" · "TDES.1.7.1. Sözcük…"
export function splitCode(s) {
  const m = clean(s).match(/^((?:[A-ZÇĞİÖŞÜ]{1,6}\.){1,2}\d{1,2}(?:\.\d{1,2}){1,4})(?:\.?\s+|\.(?=[A-Za-zÇĞİÖŞÜçğıöşü"“(]))(.*)$/)
  return m ? { code: m[1], text: m[2] || null } : { code: null, text: clean(s) || null }
}
const examCode = (title) => {
  const t = title || '', g = t.match(/GELİŞİM VE DEĞERLENDİRME[\s-]*(\d{1,2})\b/i)
  if (g) return `GD-${g[1]}`
  const m = t.match(/\b(TG|DENEME|DNM)[\s-]*(\d{1,2})\b/i)
  return m ? `${m[1].toUpperCase() === 'DNM' ? 'DENEME' : m[1].toUpperCase()}-${m[2]}` : null
}

// ---------------------------------------------------------------- Hız karne: ortak sonuç sayfası okuyucu
function resultSections(p) {
  const out = []
  for (const h of p.lines.filter((l) => /^Soru Say/i.test(l.t))) {
    const lab = p.lines.filter((m) => Math.abs(m.y - h.y) < 32 && m.x < h.x && h.x - m.x < 60 && /[A-ZÇĞİÖŞÜ]{3}/.test(m.t) && !/Soru|Başarı|ORTALAMA|SÖZEL|SAYISAL|EŞİT/.test(m.t)).sort((a, b) => Math.abs(a.y - h.y) - Math.abs(b.y - h.y))[0]
    const vals = p.lines.filter((m) => m.y > h.y + 4 && m.y < h.y + 22 && m.x > h.x - 10 && m.x < h.x + 220 && /^-?[\d.,]+$/.test(m.t)).sort((a, b) => a.x - b.x).map((m) => num(m.t))
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
function score(p) {
  const h = p.lines.find((l) => l.t === 'PUAN')
  if (!h) return null
  const v = p.lines.filter((l) => /^\d+[.,]\d+$/.test(l.t) && Math.abs(l.x - h.x) < 60 && l.y >= h.y - 3 && l.y - h.y < 25).sort((a, b) => (a.y - b.y) || (a.x - b.x))[0]
  return v ? num(v.t) : null
}
const titleOf = (p) => { const t = p.lines.filter((l) => l.y < 50 && l.x > 280 && /[A-ZÇĞİÖŞÜ0-9]/.test(l.t) && !/^ÖĞRENCİ|^SONUÇ/.test(l.t)).sort((a, b) => a.y - b.y)[0]; return t ? clean(t.t) : null }

// ---------------------------------------------------------------- aileler
const ORTA_LABELS = ['TÜRKÇE', 'SOSYAL BİLGİLER', 'T.C. İNKILAP', 'DİN KÜLTÜRÜ', 'İNGİLİZCE', 'MATEMATİK', 'FEN BİLİMLERİ']
const LISE_LABELS = ['TÜRK DİLİ', 'TÜRKÇE', 'TARİH', 'COĞRAFYA', 'FELSEFE', 'DİN KÜLTÜR', 'MATEMATİK', 'FİZİK', 'KİMYA', 'BİYOLOJİ']

export const FAMILIES = {
  HIZ_ORTAOKUL: {
    format: 'HIZ_ORTAOKUL_KARNE_V1', publisher: 'Hız Yayınları', wrongPerCorrect: 3,
    detect(pages) {
      const ev = [], p0 = pages[0]
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
      const recs = [], failed = []
      for (let i = 0; i < pages.length; i++) {
        const p = pages[i]
        if (!/ÖĞRENCİ SINAV/.test(p.text) || /^KAZANIMLAR$/m.test(p.text)) continue
        const st = student(p), secs = resultSections(p)
        if (!st || !secs.length) { failed.push({ page: p.n, error: 'Öğrenci veya ders tablosu okunamadı.' }); continue }
        const kz = pages[i + 1] && /^KAZANIMLAR$/m.test(pages[i + 1].text) ? pages[i + 1] : null
        recs.push({ page: p.n, pages: kz ? [p.n, kz.n] : [p.n], student: st, exam: { title: titleOf(p) }, score: score(p), sections: secs, items: kz ? ortaItems(kz) : [], warnings: kz ? [] : ['KAZANIM_PAGE_MISSING'] })
      }
      return { recs, failed }
    },
  },
  AKBIM: {
    format: 'AKBIM_SONUC_BELGESI_V1', publisher: null, wrongPerCorrect: 3, inferWrongPerCorrect: true,
    title: (p) => akbimHeader(p)?.title ?? null,
    student: (p) => akbimHeader(p),
    detect(pages) {
      const p0 = pages[0], ev = []
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
      const recs = [], failed = []
      for (const p of pages) {
        if (!akbimPage(p)) { failed.push({ page: p.n, error: 'Sayfa sonuç belgesi düzeninde değil.' }); continue }
        const h = akbimHeader(p)
        const { secs } = akbimSections(p, h?.classGrade ?? null)
        if (!h || !secs.length) { failed.push({ page: p.n, error: 'Öğrenci veya ders tablosu okunamadı.' }); continue }
        const nos = p.lines.find((l) => /\*+\s*-\s*\d+$/.test(l.t) || /^\d*\**\s*-\s*\d+$/.test(l.t))
        const number = nos ? String(+nos.t.split('-').at(-1).trim()) : null
        const pu = p.lines.find((l) => l.t === 'PUANI'), sc = pu ? p.lines.find((l) => Math.abs(l.y - pu.y) < 6 && l.x > pu.x + 40 && /^\d{2,3}[,.]\d+$/.test(l.t)) : null
        const date = (() => { const t = p.lines.find((l) => l.t === 'SINAV TARİHİ'); const v = t && p.lines.find((l) => Math.abs(l.y - t.y) < 3 && /^\d{2}\.\d{2}\.\d{4}$/.test(l.t)); return v ? v.t.split('.').reverse().join('-') : null })()
        recs.push({ page: p.n, pages: [p.n], student: { name: h.name, number, class: h.class, classGrade: h.classGrade }, exam: { title: h.title, date },
          score: sc ? num(sc.t) : null, sections: secs.map(({ raw, x, ...s }) => s), items: akbimItems(p, secs), warnings: [] })
      }
      return { recs, failed }
    },
  },
  HIZ_LISE: {
    format: 'HIZ_LISE_KARNE_V1', publisher: 'Hız Yayınları', wrongPerCorrect: 4,
    detect(pages) {
      const ev = [], p0 = pages[0]
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
      const recs = [], failed = []
      for (let i = 0; i < pages.length; i++) {
        const p = pages[i]
        if (!/ÖĞRENCİ SINAV/.test(p.text) || /Sınav Karşılaştırma Grafiği/.test(p.text)) continue
        const st = student(p), secs = resultSections(p)
        if (!st || !secs.length) { failed.push({ page: p.n, error: 'Öğrenci veya ders tablosu okunamadı.' }); continue }
        const q = pages[i + 1] && /Sınav Karşılaştırma Grafiği/.test(pages[i + 1].text) ? pages[i + 1] : null
        const extra = {}
        for (const k of ['SAYISAL', 'EŞİT AĞIRLIK', 'SÖZEL']) { const l = p.lines.find((z) => z.t === k); if (l) { const v = p.lines.find((z) => Math.abs(z.y - l.y) < 3 && /\/\s*[\d.]+$/.test(z.t)); if (v) extra[k] = num(v.t.split('/').at(-1)) } }
        recs.push({ page: p.n, pages: q ? [p.n, q.n] : [p.n], student: st, exam: { title: titleOf(p) }, score: score(p), scores: Object.keys(extra).length ? extra : undefined, sections: secs, items: q ? liseItems(q) : [], warnings: q ? [] : ['QUESTION_PAGE_MISSING'] })
      }
      return { recs, failed }
    },
  },
}

// ---------------------------------------------------------------- Akbim ODS sonuç belgesi (yazılım biçimi; yayından bağımsız)
// Öğrenci başına tek sayfa: üstte MEB KODU | ŞUBE | SOYADI - ADI | SINAV ADI, ders tablosu (SORU SAYISI, DOĞRU CEVAP, YANLIŞ CEVAP,
// NET SAYISI…), PUANI, ders başına "X CEV. ANAH." ve "ÖĞRENCİ CEVABI" satırları (büyük harf doğru, küçük harf yanlış, boşluk boş).
// TÖDER ve Sinan Kuzucu gibi farklı yayınların karneleri bu düzende basılır (kurumun optik okuma yazılımı).
const AKBIM_LABEL = [[/^TÜRKÇE/, 'TÜRKÇE'], [/^MATEMAT/, 'MATEMATİK'], [/^DİN/, 'DİN KÜLTÜRÜ'], [/^FEN/, 'FEN BİLİMLERİ'], [/^(SOS|T\.?C\.?|İNKILAP)/, 'SOS'], [/^(YAB|İNGİLİZCE|INGILIZCE)/, 'YAB']]
const ENGLISH_TOPICS = /ADVENTURES|CHORES|TEEN ?LIFE|ON THE PHONE|KITCHEN|COOKING|TOURIS|INTERNET|FRIENDSH|SCIENCE|ACCEPTING|REFUSING|CHART|NATURAL FORCES/i
const akbimPage = (p) => /SINAV SONUÇ BELGESİ/.test(p.text) && /^SORU SAYISI$/m.test(p.text) && /^NET SAYISI$/m.test(p.text) && /^DERSLER$/m.test(p.text)
function akbimHeader(p) {
  const L = (t) => p.lines.find((l) => l.t === t)
  const labs = ['MEB KODU', 'ŞUBE', 'SOYADI - ADI', 'SINAV ADI'].map((t) => ({ t, l: L(t) }))
  if (labs.some((x) => !x.l)) return null
  const y = labs[0].l.y, row = p.lines.filter((l) => l.y > y + 6 && l.y < y + 20)
  const cut = labs.slice(0, -1).map((x, i) => (x.l.x + labs[i + 1].l.x) / 2)
  const col = (x) => cut.filter((c) => x >= c).length
  const v = ['', '', '', '']
  for (const l of row.sort((a, b) => a.x - b.x)) v[col(l.x)] = (v[col(l.x)] + ' ' + l.t).trim()
  const cls = v[1].replace(/\s+/g, '').replace(/\/$/, '') || null
  const g = cls?.match(/^(\d{1,2})/)
  return { title: v[3] || null, name: v[2] || null, class: cls ? v[1].replace(/\s*\/\s*$/, '').trim() : null, classGrade: g ? +g[1] : null }
}
function akbimSections(p, grade) {
  const d = p.lines.find((l) => l.t === 'DERSLER'), tc = p.lines.find((l) => /^TC VE ÖĞRENCİ/.test(l.t))
  if (!d) return { secs: [], english: false }
  const right = tc ? tc.x - 5 : 400
  // Ders başlıkları: DERSLER satırının ±9 birim bandı; iki satıra bölünmüş başlık ("SOSYAL" / "BİLGİLER") aynı sütunda birleşir
  const heads = []
  for (const l of p.lines.filter((l) => Math.abs(l.y - d.y) < 9 && l.x > d.x + 30 && l.x < right).sort((a, b) => a.y - b.y)) {
    const h = heads.find((z) => Math.abs(z.x - l.x) < 14)
    if (h) h.t += ' ' + l.t; else heads.push({ x: l.x, t: l.t })
  }
  heads.sort((a, b) => a.x - b.x)
  const rowOf = (label) => { const r = p.lines.find((l) => l.t === label); return r ? p.lines.filter((l) => Math.abs(l.y - r.y) < 3 && l.x > d.x + 30 && l.x < right).sort((a, b) => a.x - b.x) : [] }
  const R = { n: rowOf('SORU SAYISI'), d: rowOf('DOĞRU CEVAP'), y: rowOf('YANLIŞ CEVAP'), net: rowOf('NET SAYISI') }
  const at = (row, x) => { const c = row.filter((l) => Math.abs(l.x + 8 - x) < 22).sort((a, b) => Math.abs(a.x + 8 - x) - Math.abs(b.x + 8 - x))[0]; return c ? num(c.t) : null }
  const english = ENGLISH_TOPICS.test(p.text)
  const secs = []
  for (const h of heads) {
    if (/^TOPLAM/.test(h.t)) continue
    // Ortaokul başlıkları kısaltmalı basılır ("SOS BİL", "YAB. DİL"): sınıfa göre yorumlanır. Lisede (TYT/AYT) "FEN BİLİMLERİ",
    // "SOSYAL BİLİMLER" toplu testlerdir: başlık olduğu gibi kalır, şablona eşleme kontrol ekranında yapılır (tahmin yok).
    const k = grade !== null && grade >= 9 ? null : AKBIM_LABEL.find(([re]) => re.test(h.t.toLocaleUpperCase('tr')))
    const label = !k ? clean(h.t) : k[1] === 'SOS' ? (grade === 8 ? 'T.C. İNKILAP TARİHİ' : 'SOSYAL BİLGİLER') : k[1] === 'YAB' ? (english ? 'İNGİLİZCE' : 'YABANCI DİL') : k[1]
    const cx = h.x + 10
    const n = at(R.n, cx), dd = at(R.d, cx), yy = at(R.y, cx), net = at(R.net, cx)
    secs.push({ label, raw: clean(h.t), x: cx, n, d: dd, y: yy, b: n !== null && dd !== null && yy !== null ? n - dd - yy : null, net })
  }
  return { secs, english }
}
function akbimItems(p, secs) {
  const items = []
  const ys = p.lines.filter((l) => /CEV\.?$|CEV\. ANAH\.$|ANAH\.$/.test(l.t) || /CEV\. ANAH\./.test(l.t))
  const students = p.lines.filter((l) => l.t === 'ÖĞRENCİ CEVABI')
  for (const lab of ys) {
    const raw = lab.t.replace(/\s*CEV\.?\s*ANAH\.?$/, '').replace(/\s*CEV\.$/, '').trim()
    const sec = secs.find((s) => nl(s.raw).startsWith(nl(raw)) || nl(raw).startsWith(nl(s.raw)))
    if (!sec) continue
    const st = students.filter((l) => Math.abs(l.x - lab.x) < 6 && l.y > lab.y + 4).sort((a, b) => a.y - b.y)[0]
    if (!st) continue
    const x0 = lab.x + 60, x1 = lab.x + 280
    const rowChars = (y) => p.cs.filter((c) => Math.abs((c.y0 + c.y1) / 2 - (y + 4)) < 4.5 && c.x0 >= x0 && c.x1 <= x1 && /[A-Za-zİ]/.test(c.c)).sort((a, b) => a.x0 - b.x0)
    const key = rowChars(lab.y), ans = rowChars(st.y)
    if (key.length !== sec.n) continue // sayı tutmazsa soru düzeyi bağlanmaz (check ITEM_COVERAGE uyarır)
    key.forEach((k, i) => {
      const a = ans.find((c) => Math.abs(c.x0 - k.x0) < 2.5)
      const kc = k.c.toUpperCase(), cancelled = !/^[A-E]$/.test(kc)
      // İptal edilen soru (anahtarda A–E dışı harf, ör. "T"): karne herkese doğru sayar
      const mark = cancelled ? '+' : !a ? null : a.c === a.c.toUpperCase() ? '+' : '-'
      items.push({ label: sec.label, section: sec.label, booklet: null, q: i + 1, testQ: i + 1, key: cancelled ? null : kc, answer: a ? a.c.toUpperCase() : null, mark, rawCode: null, rawText: null })
    })
  }
  return items
}

// Ortaokul KAZANIMLAR sayfası: 3 sütun; satır = Sr | kod+metin (93 birim) | DC | ÖC | +-. Başlık "TÜRKÇE(B)".
function ortaItems(p) {
  const heads = p.lines.filter((l) => /^(.+?)\s*\(([AB])\)$/.test(l.t) && !/^Sr\b/.test(l.t)).map((l) => { const [, lab, bk] = l.t.match(/^(.+?)\s*\(([AB])\)$/); return { x: l.x, y: l.y, label: clean(lab), booklet: bk } })
  const out = []
  for (const l of p.lines) {
    if (!/^\d{1,2}$/.test(l.t)) continue
    const txt = p.lines.find((z) => Math.abs(z.y - l.y) < 1.5 && z.x > l.x + 8 && z.x < l.x + 30)
    if (!txt) continue
    const x0 = txt.x, yc = lineMid(p, txt)
    // Üstünde başlık yoksa blok bir önceki sütundan sürüyordur (ör. Matematik 2. sütunun altında başlayıp 3. sütunun üstünde biter)
    const colXs = [...new Set(heads.map((h) => Math.round(h.x)))].sort((a, b) => a - b)
    // başlık metni satır metninden birkaç birim içeride başlayabilir (3. sütun: başlık 425, satır 419)
    let head = heads.filter((h) => Math.abs(h.x - x0) < 10 && h.y < l.y).sort((a, b) => b.y - a.y)[0]
    if (!head) { const ci = colXs.findIndex((cx) => Math.abs(cx - x0) < 10); if (ci > 0) head = heads.filter((h) => Math.abs(h.x - colXs[ci - 1]) < 10).sort((a, b) => b.y - a.y)[0] }
    if (!head) continue
    const body = band(p, x0, x0 + 93.3, yc), key = band(p, x0 + 93.3, x0 + 101, yc), ans = band(p, x0 + 108, x0 + 124, yc), mark = band(p, x0 + 128, x0 + 142, yc)
    const { code, text } = splitCode(body)
    out.push({ label: head.label, booklet: head.booklet, q: +l.t, key: key || null, answer: ans || null, mark: mark || null, rawCode: code, rawText: text })
  }
  return out
}
// Lise soru listesi: 2 sütun; satır = N | D | Ö | +- | kod+metin. Başlık "… Net: 9.50 TÜRK DİLİ(A)".
function liseItems(p) {
  const cols = [...new Set(p.lines.filter((l) => l.t === 'N').map((l) => Math.round(l.x)))].sort((a, b) => a - b)
  // Blok başlığı: "Doğru: … Net: … ETİKET(A)" satırı; etiket aynı satırda, o sütundaki parantezli metin (kitapçık boş olabilir: "TÜRK DİLİ()")
  const heads = []
  for (const d of p.lines.filter((l) => /^Doğru:/.test(l.t))) {
    const c = [...cols].reverse().find((cx) => cx <= d.x) ?? cols[0], right = cols.find((cx) => cx > c + 50) ?? 600
    const lab = p.lines.find((l) => Math.abs(l.y - d.y) < 3 && l.x > d.x + 100 && l.x < right + (right === 600 ? 0 : 0) && /^(.+?)\s*\(([AB]?)\)$/.test(l.t))
    if (!lab) continue
    const [, label, bk] = lab.t.match(/^(.+?)\s*\(([AB]?)\)$/)
    heads.push({ x: lab.x, y: d.y, col: c, label: clean(label), booklet: bk || null })
  }
  const out = []
  for (const l of p.lines) {
    if (!/^\d{1,2}$/.test(l.t)) continue
    const c = cols.find((cx) => Math.abs(cx - l.x) < 4)
    if (c === undefined) continue
    const yc = lineMid(p, l), right = cols.find((cx) => cx > c + 50) ?? 600
    const head = heads.filter((h) => h.col === c && h.y < l.y + 2).sort((a, b) => b.y - a.y)[0]
    if (!head) continue
    const key = band(p, c + 8, c + 18, yc), ans = band(p, c + 19, c + 30, yc), mark = band(p, c + 31, c + 41, yc), body = band(p, c + 42, right - 2, yc, 5)
    const { code, text } = splitCode(body)
    out.push({ label: head.label, booklet: head.booklet, q: +l.t, key: key || null, answer: ans || null, mark: mark || null, rawCode: code, rawText: text })
  }
  return out
}

// ---------------------------------------------------------------- soruları bölümlere bağlama
// Soru listesi test başlıklarına göre olabilir ("SOSYAL BİLİMLER" = Tarih + Coğrafya + Felsefe + Din): bileşik testin soruları,
// sonuç sayfasındaki ders sırası ve soru sayılarıyla sırayla bölüştürülür. Her soru bölüm içi numara alır (q), test numarası testQ.
const nl = (t) => (t || '').toLocaleUpperCase('tr').replace(/[^A-ZÇĞİÖŞÜ0-9]/g, '')
const sameLabel = (a, b) => { const x = nl(a), y = nl(b); return x === y || (x.length >= 5 && y.startsWith(x)) || (y.length >= 5 && x.startsWith(y)) }
const COMPOSITE = [[/^SOSYALBİLİMLER/, /^(TARİH|COĞRAFYA|FELSEFE|DİN)/], [/^FENBİLİMLERİ/, /^(FİZİK|KİMYA|BİYOLOJİ)/]]
export function bindItems(sections, items) {
  const out = [], used = new Set()
  const groups = [...new Set(items.map((q) => q.label))]
  for (const g of groups) {
    const qs = items.filter((q) => q.label === g).sort((a, b) => a.q - b.q)
    const direct = sections.find((s) => sameLabel(s.label, g))
    if (direct) { qs.forEach((q, i) => out.push({ ...q, section: direct.label, testQ: q.q, q: i + 1 })); used.add(direct.label); continue }
    const comp = COMPOSITE.find(([re]) => re.test(nl(g)))
    const members = comp ? sections.filter((s) => comp[1].test(nl(s.label)) && !used.has(s.label)) : []
    if (!members.length || members.reduce((a, s) => a + s.n, 0) !== qs.length) { qs.forEach((q) => out.push({ ...q, section: null, testQ: q.q })); continue }
    let k = 0
    for (const m of members) { qs.slice(k, k + m.n).forEach((q, i) => out.push({ ...q, section: m.label, testQ: q.q, q: i + 1 })); k += m.n; used.add(m.label) }
  }
  return out
}

// ---------------------------------------------------------------- tanıma
const GRADE_CODE = [[/\b(?:T|M|F|SB|D|E|İTA)\.(\d{1,2})\./g, 'eski program kodları'], [/\b(?:MAT|FB|SB|DKAB|ENG|BİY|FİZ|KİM|COĞ|TAR|FEL)\.(\d{1,2})\./g, 'TYMM kodları'], [/\bT\.[A-Z]\.(\d)\./g, 'yayıncı kodları']]
export function detect(pages, hints = {}) {
  const fam = Object.entries(FAMILIES).map(([k, f]) => ({ key: k, ...f.detect(pages) })).sort((a, b) => b.score - a.score)
  const best = fam[0]
  if (!best || best.score < 0.6) return { family: 'UNKNOWN', format: null, confidence: best?.score ?? 0, evidence: best?.evidence ?? [], message: 'Bu PDF biçimi henüz desteklenmiyor.' }
  const F = FAMILIES[best.key], p0 = pages[0], who = F.student ?? student, title = (F.title ? F.title(p0) : titleOf(p0)) || ''
  // Sınıf: başlıktaki "N.SINIF", öğrenci sınıf alanı, kazanım kodlarındaki sınıf (ilk kayıtlardan)
  const gEv = [], votes = new Map()
  const vote = (g, w, why) => { if (!g || g < 1 || g > 12) return; votes.set(g, (votes.get(g) || 0) + w); gEv.push(`${why}: ${g}`) }
  const tm = title.match(/(\d{1,2})\s*\.\s*SINIF/i); if (tm) vote(+tm[1], 0.5, 'başlıkta sınıf')
  const classGrades = pages.slice(0, 12).map(who).filter((s) => s?.classGrade).map((s) => s.classGrade)
  if (classGrades.length) { const g = mode(classGrades), agree = classGrades.filter((x) => x === g).length; vote(g, agree >= 3 && agree === classGrades.length ? 0.9 : 0.35, `öğrenci sınıf alanı (${agree}/${classGrades.length} kayıt)`) }
  // TYT/AYT soruları 9–12'nin kazanımlarını ölçer: kod sınıfı denemenin sınıfı için kanıt sayılmaz
  if (!/\b(TYT|AYT)\b/.test(title)) {
    const txt = pages.slice(0, 6).map((p) => p.text).join('\n')
    for (const [re, why] of GRADE_CODE) { const gs = [...txt.matchAll(re)].map((m) => +m[1]); if (gs.length >= 5) vote(mode(gs), 0.15, `${why} (${gs.length})`) }
  }
  const ranked = [...votes].sort((a, b) => b[1] - a[1])
  let grade = ranked[0]?.[0] ?? null, gConf = Math.min(0.99, ranked[0]?.[1] ?? 0)
  if (ranked.length > 1 && ranked[1][1] >= 0.3) { gConf = Math.min(gConf, 0.5); gEv.push('çelişen sınıf işaretleri') }
  if (hints.grade && grade && hints.grade !== grade) gEv.push(`seçilen sınıf (${hints.grade}) PDF'te algılananla (${grade}) uyuşmuyor`)
  // Sınav türü
  const tEv = []
  let examType = null, yksPart = null, tConf = 0
  if (/\bTYT\b/.test(title)) { examType = grade === 12 ? 'YKS' : 'TYT'; yksPart = grade === 12 ? 'TYT' : null; tConf = 0.95; tEv.push('başlıkta "TYT"') }
  else if (/\bAYT\b/.test(title)) { examType = grade === 12 ? 'YKS' : 'AYT'; yksPart = grade === 12 ? 'AYT' : null; tConf = 0.95; tEv.push('başlıkta "AYT"') }
  else if (/\bLGS\b/.test(title)) { examType = 'LGS'; tConf = 0.95; tEv.push('başlıkta "LGS"') }
  // Yayın: başlıkta yayın adı varsa o; yoksa biçimin varsayılan yayını (düşük güven)
  let publisher = F.publisher, pConf = F.publisher ? 0.6 : 0, pEv = F.publisher ? [`biçim varsayılanı (${F.publisher})`] : ['biçim birden çok yayında kullanılıyor; başlıkta yayın adı yok']
  const named = TITLE_PUBLISHERS.find(([re]) => re.test(title))
  if (named) { publisher = named[1]; pConf = 0.95; pEv = [`başlıkta "${title.match(named[0])[0]}"`] }
  return {
    family: best.key, format: F.format, confidence: Math.round(best.score * 100) / 100, evidence: best.evidence,
    others: fam.slice(1).filter((f) => f.score > 0).map((f) => ({ family: f.key, confidence: f.score })),
    grade: { value: grade, confidence: Math.round(gConf * 100) / 100, evidence: gEv },
    examType: { value: examType, yksPart, confidence: tConf, evidence: tEv },
    publisher: { value: publisher, confidence: pConf, evidence: pEv },
    exam: { title, code: examCode(title) },
    wrongPerCorrect: F.wrongPerCorrect,
  }
}
const TITLE_PUBLISHERS = [[/FREKANS/i, 'Frekans Yayınları'], [/\bHIZ\b/i, 'Hız Yayınları'], [/TÖDER/i, 'TÖDER'], [/SİNAN\s*KUZUCU/i, 'Sinan Kuzucu Yayınları'],
  [/BENİM\s*HOCAM/i, 'Benim Hocam Yayınları'], [/KAFA\s*DENGİ/i, 'Kafa Dengi Yayınları'], [/HİPER\s*ZEKA/i, 'Hiper Zeka Yayınları'], [/NARTEST/i, 'Nartest Yayınları'], [/ÇANTA/i, 'Çanta Yayınları'], [/\bATA\b/i, 'ATA Yayınları'], [/ANKARA/i, 'Ankara Yayıncılık']]
function mode(a) { const m = new Map(); for (const x of a) m.set(x, (m.get(x) || 0) + 1); return [...m].sort((x, y) => y[1] - x[1])[0][0] }

// ---------------------------------------------------------------- doğrulama (motor içi; kural doğrulaması sunucuda tekrarlanır)
export function check(rec, wrongPerCorrect) {
  const w = [...rec.warnings]
  for (const s of rec.sections) {
    if ([s.n, s.d, s.y, s.b, s.net].some((v) => v === null || !Number.isFinite(v))) { w.push(`NAN:${s.label}`); continue }
    if (s.d + s.y + s.b !== s.n || Math.min(s.d, s.y, s.b) < 0) w.push(`COUNTS:${s.label}`)
    if (Math.abs(s.net - (s.d - s.y / wrongPerCorrect)) > 0.011) w.push(`NET:${s.label}`)
    const qs = rec.items.filter((q) => q.section === s.label)
    if (!rec.items.length) continue
    if (!qs.length && s.d === 0 && s.y === 0) continue // teste girmemiş öğrenci: karne anahtarı da basmaz
    if (qs.length !== s.n) { w.push(`ITEM_COVERAGE:${s.label}:${qs.length}/${s.n}`); continue }
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
  const pages = readPages(bytes)
  onProgress(pages.length, pages.length)
  if (!pages[0]?.text.trim()) return { engine: ENGINE, sha256: sha, filename: name, detection: { family: 'UNKNOWN', confidence: 0, message: 'Taranmış veya metni okunamayan PDF; OCR gerekiyor.' }, records: [], failedPages: [] }
  const det = detect(pages, hints)
  if (det.family === 'UNKNOWN') return { engine: ENGINE, sha256: sha, filename: name, detection: det, records: [], failedPages: [] }
  const F = FAMILIES[det.family], { recs, failed } = F.parse(pages)
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
  return { engine: ENGINE, sha256: sha, filename: name, pageCount: pages.length, detection: det, records: recs, failedPages: failed }
}
