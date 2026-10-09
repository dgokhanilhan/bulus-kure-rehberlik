// TYMM (Türkiye Yüzyılı Maarif Modeli) öğretim programları → öğrenme çıktıları.
// Her çıkarıcı resmî PDF'in kendi yapısını okur ve iki bağımsız doğrulama sunar: resmî sayı tablosu (gradeTotals/report)
// ve programın başka sayfalarında geçen "KOD. Başlık" satırlarıyla çapraz kontrol (crossCheck). Kod uydurulmaz.
import { lines, esc } from './okuyucu.mjs'

// Sol sütunun iki satırlı başlığını hedef metninden ayır; aynı PDF satırına yapışabilir.
export const cleanOutcomeText = (text) => text.replace(/(?:ÖĞRENME ÇIKTILARI\s+)?VE\s+SÜREÇ BİLEŞENLERİ/g, '').replace(/\s+/g, ' ').trim()

// Resmî kaynaktaki bilinen yazım hataları. Kod uydurulmaz: düzeltme yalnız doğru kod AYNI belgede geçiyorsa uygulanır.
export const ERRATA = [
  { prefix: 'İTA', wrong: 'TA.8.2.5.', code: 'İTA.8.2.5', require: '(İTA.8.2.5)', evidence: 'Tanım satırında "TA.8.2.5." yazıyor; aynı belgede "SBAB3. Tarihsel Empati (İTA.8.2.5)" ve "İTA.8.2.5." geçiyor.' },
]
export function extract(file, prefix) {
  const P = esc(prefix), raw = lines(file), all = raw.map((ls) => ls.map((l) => l.t).join(' ')).join(' ')
  const errata = ERRATA.filter((e) => e.prefix === prefix && all.includes(e.require))
  const pages = raw.map((ls) => ls.map((l) => { for (const e of errata) if (l.t.startsWith(e.wrong)) return { ...l, t: e.code + '.' + l.t.slice(e.wrong.length), errata: e.evidence }; return l }))
  // 1) Tema tablosu: "MAT.5.3. GEOMETRİK ŞEKİLLER" + aynı satırda öğrenme çıktısı sayısı
  const themes = new Map(), counts = new Map()
  pages.forEach((ls) => {
    for (const l of ls) {
      const m = l.t.match(new RegExp(`^(${P}\\.(\\d{1,2})\\.(\\d{1,2}))\\.\\s*(.+?)(\\s*\\(\\d\\))?$`))
      if (!m || /^\d/.test(m[4])) continue
      const row = ls.filter((z) => Math.abs(z.y - l.y) < 2 && z.x > l.x + 150 && /^\d+$/.test(z.t)).sort((a, b) => a.x - b.x)
      if (!row.length) continue
      themes.set(m[1], m[4].replace(/\s+/g, ' ').trim())
      counts.set(m[1], (counts.get(m[1]) || 0) + +row[0].t)
    }
  })
  // 2) Tanımlar: "MAT.5.1.1. Başlık..." satırı; başlık + süreç bileşenleri İÇERİK ÇERÇEVESİ'ne kadar
  const outs = new Map()
  pages.forEach((ls, pi) => {
    const sorted = [...ls].sort((a, b) => a.y - b.y || a.x - b.x)
    sorted.forEach((l, i) => {
      // Kod satır başında ya da soldaki etiket satıra yapışmış olabilir ("VE SÜREÇ BİLEŞENLERİ MAT.5.1.3. …")
      const m = l.t.match(new RegExp(`^(?:(?:ÖĞRENME ÇIKTILARI )?(?:VE )?SÜREÇ BİLEŞENLERİ )?(${P}\\.(\\d{1,2})\\.(\\d{1,2})\\.(\\d{1,2}))\\.(?!\\d)\\s*(\\S.*)$`))
      if (!m) return
      const stop = sorted.findIndex((z, j) => j > i && (/^İÇERİK ÇERÇEVESİ/.test(z.t) || new RegExp(`(^|BİLEŞENLERİ )${P}\\.\\d+\\.\\d+\\.\\d+\\.(?!\\d)\\s*\\S`).test(z.t)))
      const seg = sorted.slice(i + 1, stop < 0 ? undefined : stop)
      const colX = seg.length ? Math.min(...seg.filter((z) => !/^(ÖĞRENME ÇIKTILARI|VE|SÜREÇ BİLEŞENLERİ)$/.test(z.t)).map((z) => z.x)) : l.x
      const body = seg.filter((z) => z.x >= colX - 2 && !/^(ÖĞRENME ÇIKTILARI|VE|SÜREÇ BİLEŞENLERİ)$/.test(z.t))
      let text = cleanOutcomeText([m[5], ...body.map((z) => z.t)].join(' ').replace(/(\S)- (\S)/g, '$1$2'))
      const k = text.search(/\s[a-zçğıöşü]\)\s/)
      const title = (k < 0 ? text : text.slice(0, k)).trim()
      const comps = k < 0 ? [] : text.slice(k).split(/\s(?=[a-zçğıöşü]\)\s)/).map((s) => s.trim()).filter(Boolean)
      // Aynı kod birden çok yerde "KOD. metin" olarak geçebilir (programın yapısını anlatan örnek şema gibi).
      // Puan: tanım sayfası (İÇERİK ÇERÇEVESİ var) ve etiketli satır tercih edilir; "YAPISI" anlatım sayfası elenir.
      const pageText = ls.map((z) => z.t).join(' ')
      const score = (/İÇERİK ÇERÇEVESİ/.test(pageText) ? 2 : 0) + (/SÜREÇ BİLEŞENLERİ/.test(l.t) ? 1 : 0) - (/PROGRAMI['’]?NIN YAPISI|süreç bileşenleri\s*ni ifade eder/i.test(pageText) ? 3 : 0)
      const cand = { code: m[1] + '.', grade: +m[2], theme: m[1].split('.').slice(0, 3).join('.'), title, components: comps, page: pi + 1, score, ...(l.errata ? { errata: l.errata } : {}) }
      if (!outs.has(m[1]) || outs.get(m[1]).score < score) outs.set(m[1], cand)
    })
  })
  // İkinci geçiş: kaynakta kodun sonundaki nokta unutulmuşsa ("DKAB.12.3.3 Bağımlılıkla…"). Yalnız tanımı hiç bulunamayan
  // kodlar için ve yalnız tanım sayfasında (İÇERİK ÇERÇEVESİ var), "Uygulamaları" referans satırı olmayan yerde kabul edilir.
  pages.forEach((ls, pi) => {
    if (!/İÇERİK ÇERÇEVESİ/.test(ls.map((z) => z.t).join(' '))) return
    for (const l of ls) {
      const m = l.t.match(new RegExp(`^(?:(?:ÖĞRENME ÇIKTILARI )?(?:VE )?SÜREÇ BİLEŞENLERİ )?(${P}\\.(\\d{1,2})\\.(\\d{1,2})\\.(\\d{1,2}))\\s+([A-ZÇĞİÖŞÜ][a-zçğıöşü].*)$`))
      if (!m || outs.has(m[1]) || /Uygulamaları/.test(l.t)) continue
      outs.set(m[1], { code: m[1] + '.', grade: +m[2], theme: m[1].split('.').slice(0, 3).join('.'), title: m[5].trim(), components: [], page: pi + 1, score: 0, note: 'kaynakta kod sonu noktasız' })
    }
  })
  return { themes, counts, outs: [...outs.values()] }
}

// Sınıf başına resmî öğrenme çıktısı toplamı: "N. SINIF ..." başlığından sonraki ilk TOPLAM satırının
// "Öğrenme Çıktıları Sayısı" sütunundaki değer (sütun x'i başlıktan bulunur).
export function gradeTotals(file, singleGrade = null) {
  const pages = lines(file), out = new Map()
  // Tek sınıflı program (ör. İnkılap 8): sınıf başlığı yok; "Öğrenme Çıktıları Sayısı" sütunlu tablodaki TOPLAM
  if (singleGrade) for (const ls of pages) {
    const col = ls.find((l) => /^Öğrenme Çıktıları$|^Öğrenme$/.test(l.t)), t = ls.find((l) => /^TOPLAM$/.test(l.t))
    if (!col || !t) continue
    const v = ls.filter((z) => Math.abs(z.y - t.y) < 3 && /^\d+$/.test(z.t)).sort((a, b) => Math.abs(a.x - col.x) - Math.abs(b.x - col.x))[0]
    if (v) out.set(singleGrade, [+v.t])
  }
  for (const ls of pages) {
    const col = ls.find((l) => /^Öğrenme( Çıktıları)?$|^ÖĞRENME ÇIKTI|Öğrenme Çıktısı|^Kazanım( Sayısı)?$|^KAZANIM( SAYISI)?$/.test(l.t))
    const heads = ls.filter((l) => /(?:^|\s)(\d{1,2})\s*\.\s*(?:SINIF|Sınıf)/.test(l.t)).sort((a, b) => a.y - b.y)
    if (!heads.length) continue
    const tots = ls.filter((l) => /^TOPLAM\s*$/i.test(l.t)).sort((a, b) => a.y - b.y)
    heads.forEach((h, i) => {
      const g = +h.t.match(/(?:^|\s)(\d{1,2})\s*\.\s*(?:SINIF|Sınıf)/)[1]
      const next = heads[i + 1]?.y ?? Infinity
      const t = tots.find((z) => z.y > h.y && z.y < next)
      if (!t) return
      const nums = ls.filter((z) => Math.abs(z.y - t.y) < 3 && /^\d+$/.test(z.t) && z.x > t.x).sort((a, b) => a.x - b.x)
      const v = col ? nums.sort((a, b) => Math.abs(a.x - col.x) - Math.abs(b.x - col.x))[0] : nums[0]
      if (v) out.set(g, [...new Set([...(out.get(g) || []), +v.t])])  // aynı sınıfın birden çok programı olabilir (Coğrafya 2/4 saat)
    })
  }
  return out
}
export function report(file, prefix) {
  const { outs } = extract(file, prefix)
  const grades = [...new Set(outs.map((o) => o.grade))].sort((a, b) => a - b)
  const tot = gradeTotals(file, grades.length === 1 ? grades[0] : null)
  const { counts } = extract(file, prefix)
  return grades.map((g) => {
    const read = outs.filter((o) => o.grade === g).length, all = tot.get(g) || []
    // Tema satırlarının toplamı (resmî tablonun TOPLAM satırı kendi satırlarıyla tutmayabilir: Matematik 2024 12. sınıf)
    const rows = [...counts].filter(([t]) => +t.split('.')[1] === g).reduce((a, [, n]) => a + n, 0)
    const note = !all.includes(read) && rows === read ? `resmî tabloda TOPLAM ${all.join('/')} yazıyor, tema satırları toplamı ${rows} (okunanla aynı)` : null
    return { grade: g, read, official: all.includes(read) || note ? read : (all.length ? Math.max(...all) : null), totals: all, rows, note }
  })
}

// Ortaokul Türkçe: yatay tablo. Satır = başlık + süreç bileşenleri; her sınıfın kodu ayrı sütunda (T.D.5.1. … T.D.8.1.).
// Sayfadaki başlık blokları ile kod grupları sırayla eşleştirilir; sayılar tutmayan sayfa okunmaz, raporlanır.
// Konuşma tablosundaki açıklama cümlesi ve işaret kutusu metinleri (başlık değildir)
const stripBox = (t) => t.replace(/^.*?kutucuklara onay işareti \(✔\) eklenmiştir\.\s*/, '').replace(/^Öğrenme çıktısı sözlü üretim.*$/, '')
  .replace(/Sözlü Üretim( ✔)?/g, '').replace(/Sözlü Etkileşim( ✔|\s*\.\.\.)?/g, '').replace(/^[\s.…]+/, '').trim()
const SKILL = { D: 'Dinleme/İzleme', O: 'Okuma', K: 'Konuşma', Y: 'Yazma' }
export function extractTurkce(file, from = 30) {
  const pages = lines(file), outs = [], problems = []
  pages.forEach((ls, pi) => {
    if (pi + 1 < from) return
    const codes = ls.filter((l) => /^T\.[DOKY]\.\d\.\d+\.?$/.test(l.t))
    if (!codes.length) return
    // kod grupları: aynı satır (x) etrafında toplanan kodlar
    const groups = []
    for (const c of [...codes].sort((a, b) => a.x - b.x)) {
      const g = groups.find((z) => Math.abs(z.x - c.x) < 4)
      g ? g.codes.push(c.t.replace(/\.?$/, '.')) : groups.push({ x: c.x, codes: [c.t.replace(/\.?$/, '.')] })
    }
    // başlık sütunu: sayfanın sağ kısmı (kod sütunlarının en büyük y'sinden büyük)
    // başlık sütununun sol kenarı: süreç bileşeni satırlarının ("a) …") konumu; açıklama sütunu bunun solunda kalır
    const compYs = ls.filter((l) => /^[a-zçğıöşü]\)\s/.test(l.t)).map((l) => l.y)
    const edge = compYs.length ? Math.min(...compYs) - 3 : Math.max(...codes.map((c) => c.y)) + 30
    const col = ls.filter((l) => l.y >= edge && !/^(ÖĞRENME ÇIKTISI|ALAN BECERİSİ|\d+\. Tablo)/.test(l.t)).sort((a, b) => a.x - b.x)
    // Blok = başlık + bileşenler. Blok i'nin başlığı, önceki kod grubunun (i-1) satırından sonra başlayan ilk
    // bileşen-olmayan satırdır (yarım kalmış bir bileşen cümlesinin devamı değilse).
    const blocks = []
    for (const l of col) {
      const comp = /^[a-zçğıöşü]\)\s/.test(l.t)
      const prev = blocks.at(-1), gi = blocks.length
      const open = prev && prev.comps.length && !/[.!?]\s*$/.test(prev.comps.at(-1))
      const box = /^Sözlü Üretim/.test(l.t) || /kutucuklara onay işareti|^Öğrenme çıktısı sözlü üretim/.test(l.t)
      const onlyBox = prev && !prev.comps.length && !stripBox(prev.title)
      // Konuşma: her satır işaret kutusu satırıyla başlar; kutudan hemen sonraki satır aynı bloğun başlığıdır.
      if (!comp && gi < groups.length && !open && !onlyBox && (box || gi === 0 || l.x > groups[gi - 1].x)) {
        blocks.push({ title: l.t, comps: [] })
        continue
      }
      if (!prev) continue
      if (comp) prev.comps.push(l.t)
      else if (prev.comps.length) prev.comps[prev.comps.length - 1] += ' ' + l.t
      else prev.title += ' ' + l.t
    }
    if (blocks.length !== groups.length) { problems.push(`s.${pi + 1}: ${blocks.length} başlık bloğu, ${groups.length} kod grubu`); return }
    groups.forEach((g, i) => {
      const b = blocks[i], fix = (s) => s.replace(/(\S)-\s+(\S)/g, '$1$2').replace(/\s+/g, ' ').trim()
      for (const code of g.codes) {
        const m = code.match(/^T\.([DOKY])\.(\d)\.(\d+)\.$/)
        // Konuşma tablosundaki işaret kutuları başlığa karışmasın: ayrı bilgi olarak tutulur
        let title = fix(b.title).replace(/^.*?kutucuklara onay işareti \(✔\) eklenmiştir\.\s*/, '')
        const flags = []
        if (/Sözlü Üretim ✔/.test(title)) flags.push('sözlü üretim')
        if (/Sözlü Etkileşim ✔/.test(title)) flags.push('sözlü etkileşim')
        title = stripBox(title)
        outs.push({ code, grade: +m[2], theme: SKILL[m[1]], title, components: b.comps.map(fix), flags, page: pi + 1 })
      }
    })
  })
  // bütünlük: her beceri+sınıf için 1..N boşluksuz, tekrar yok
  const seen = new Map()
  for (const o of outs) { if (seen.has(o.code)) problems.push(`tekrar ${o.code} (s.${seen.get(o.code)} ve s.${o.page})`); else seen.set(o.code, o.page) }
  const by = new Map()
  for (const c of seen.keys()) { const [, s, g, n] = c.match(/^T\.([DOKY])\.(\d)\.(\d+)\.$/); const k = `${s}.${g}`; by.set(k, [...(by.get(k) || []), +n]) }
  for (const [k, ns] of by) { ns.sort((a, b) => a - b); const gap = ns.findIndex((n, i) => n !== i + 1); if (gap >= 0) problems.push(`T.${k}: numara boşluğu (${ns.join(',')})`) }
  return { outs: [...new Map(outs.map((o) => [o.code, o])).values()], problems, counts: Object.fromEntries([...by].map(([k, v]) => [k, v.length]).sort()) }
}

// Çapraz doğrulama: programda "KOD. Başlık" biçiminde geçen bütün satırlar (tema sayfaları vb.) ile okunan başlık örtüşmeli.
export function crossCheck(file, outs, codeRe) {
  const norm = (t) => t.toLocaleLowerCase('tr').replace(/[^a-zçğıöşü0-9]/g, '')
  const byCode = new Map(outs.map((o) => [o.code.replace(/\.$/, ''), norm(o.title)]))
  const bad = new Map(), seen = new Map()
  lines(file).forEach((ls, pi) => { if (/PROGRAMI['’]?NIN YAPISI|süreç bileşenleri\s*ni ifade eder/i.test(ls.map((z) => z.t).join(' '))) return; ls.forEach((l) => {
    const m = l.t.match(new RegExp(`^(?:.*?\\s)?(${codeRe})\\.\\s+([A-ZÇĞİÖŞÜ].{8,})$`))
    if (!m || !byCode.has(m[1])) return
    const got = norm(m[2].replace(/-$/, '')).slice(0, 30), want = byCode.get(m[1])
    seen.set(m[1], (seen.get(m[1]) || 0) + 1)
    if (got.length >= 12 && !want.startsWith(got.slice(0, Math.min(got.length, 30)))) bad.set(m[1], `s.${pi + 1}: "${m[2].slice(0, 60)}"`)
  }) })
  return { checked: seen.size, total: byCode.size, bad: [...bad].map(([k, v]) => `${k} ${v}`) }
}

// Tema sayfalarındaki "KOD. Başlık" listesinden başlık: devam satırları aynı hizada (x ±2), sonraki koda kadar.
// Aynı kod birden çok temada geçer; en sık görülen biçim alınır.
export function listingTitles(file, codeRe) {
  const R = new RegExp(`^(${codeRe})\\.\\s+(\\S.*)$`), C = new RegExp(`^${codeRe}\\.`), seen = new Map()
  lines(file).forEach((ls) => {
    const sorted = [...ls].sort((a, b) => a.y - b.y || a.x - b.x)
    sorted.forEach((l, i) => {
      const m = l.t.match(R)
      if (!m) return
      const parts = [m[2]]
      for (const z of sorted.slice(i + 1)) {
        if (Math.abs(z.x - l.x) > 2 || C.test(z.t) || z.y - l.y > 15 * parts.length + 6) break
        parts.push(z.t)
      }
      const t = parts.join(' ').replace(/(\S)-\s+(\S)/g, '$1$2').replace(/\s+/g, ' ').trim()
      const k = m[1], v = seen.get(k) || new Map()
      v.set(t, (v.get(t) || 0) + 1); seen.set(k, v)
    })
  })
  // TYMM öğrenme çıktısı "-bilme" ile biter: tam biçimdeki varyant, sonra en sık görülen
  return new Map([...seen].map(([k, v]) => [k, [...v].sort((a, b) => (/bilme$/.test(b[0]) - /bilme$/.test(a[0])) || b[1] - a[1])[0][0]]))
}

// Türkçe 2024 açıklamalar bölümü: "T.D.5.1. / T.D.6.1. / T.D.7.1. / T.D.8.1. Başlık" (başlık gerekirse alt satıra taşar, "-bilme" ile biter).
export function slashTitles(file, from = 1) {
  const out = new Map()
  lines(file).forEach((ls, pi) => {
    if (pi + 1 < from) return
    const s = [...ls].sort((a, b) => a.y - b.y || a.x - b.x)
    s.forEach((l, j) => {
      const m = l.t.match(/^((?:T\.[DOKY]\.\d\.\d+\.?\s*\/?\s*)+)(.*)$/)
      if (!m || !/\//.test(m[1])) return
      const codes = [...m[1].matchAll(/T\.[DOKY]\.\d\.\d+/g)].map((x) => x[0])
      let t = m[2].trim()
      for (let k = 1; k <= 2 && !/bilme$/.test(t) && s[j + k] && Math.abs(s[j + k].x - l.x) < 3; k++) t += ' ' + s[j + k].t
      t = t.replace(/(\S)-\s+(\S)/g, '$1$2').replace(/\s+/g, ' ').trim()
      for (const c of codes) if (!out.has(c) || (/bilme$/.test(t) && !/bilme$/.test(out.get(c)))) out.set(c, t)
    })
  })
  return out
}

// Türk Dili ve Edebiyatı (TYMM): beceri temelli, kodda sınıf yok. Öğrenme çıktısı "TDE1.2. Başlık", süreç bileşeni
// "a) TDE1.2.3. Metin". Aynı çıktılar 9–12 için geçerlidir (sınıf farkı tema dağılımında).
export function extractTDE(file) {
  const outs = new Map(), comps = new Map(), problems = []
  lines(file).forEach((ls, pi) => {
    for (const l of [...ls].sort((a, b) => a.y - b.y || a.x - b.x)) {
      const t = l.t.replace(/^[a-zçğıöşü]\)\s*/, '')
      let m = t.match(/^TDE(\d)\.(\d+)\.\s+([A-ZÇĞİÖŞÜ].*)$/)
      if (m && !/^TDE\d\.\d+\.\d/.test(t)) { const k = `TDE${m[1]}.${m[2]}`; if (!outs.has(k)) outs.set(k, { code: k + '.', skill: +m[1], title: m[3].trim(), page: pi + 1 }) }
      m = t.match(/^TDE(\d)\.(\d+)\.(\d+)\.\s+(\S.*)$/)
      if (m) { const k = `TDE${m[1]}.${m[2]}`; const v = comps.get(k) || new Map(); if (!v.has(+m[3])) v.set(+m[3], m[4].trim()); comps.set(k, v) }
    }
  })
  for (const [k, o] of outs) { const v = comps.get(k) || new Map(); o.components = [...v].sort((a, b) => a[0] - b[0]).map(([n, x]) => `${k}.${n}. ${x}`)
    const ns = [...v.keys()].sort((a, b) => a - b); if (ns.some((n, i) => n !== i + 1)) problems.push(`${k}: bileşen numara boşluğu ${ns}`) }
  for (const k of comps.keys()) if (!outs.has(k)) problems.push(`${k}: bileşeni var, başlığı bulunamadı`)
  const bySkill = new Map(); for (const k of outs.keys()) { const [, s, n] = k.match(/TDE(\d)\.(\d+)/); bySkill.set(s, [...(bySkill.get(s) || []), +n]) }
  for (const [s, ns] of bySkill) { ns.sort((a, b) => a - b); if (ns.some((n, i) => n !== i + 1)) problems.push(`TDE${s}: çıktı numara boşluğu ${ns}`) }
  return { outs: [...outs.values()].sort((a, b) => a.code.localeCompare(b.code, 'tr', { numeric: true })), problems }
}

// İngilizce (TYMM): "ENG.9.1.L1. Students can …" + hizalı devam satırları; süreç bileşenleri "a) …".
// Doğrulama: bir sınıfın bütün ünitelerinde aynı beceri kod kümesi; tanım "Students can" ile başlar.
export function extractENG(file) {
  const outs = new Map(), problems = []
  // Kaynakta harf ile numara arasına boşluk girmiş olabilir ("ENG.5.8.R 4."): boşluk normalleştirilir, kod değişmez.
  const R = /^(ENG\.(\d{1,2})\.(\d{1,2})\.([A-Z]) ?(\d{1,2}))\.\s*(Students\b.*)$/
  lines(file).forEach((ls, pi) => {
    const s = [...ls].sort((a, b) => a.y - b.y || a.x - b.x)
    s.forEach((l, i) => {
      const m = l.t.match(R)
      if (m) m[1] = m[1].replace(' ', '')
      if (!m || outs.has(m[1])) return
      const title = [m[6]], comps = []
      for (const z of s.slice(i + 1)) {
        if (R.test(z.t) || /^ENG\.\d/.test(z.t) || z.x < l.x - 2) break
        if (/^[a-zçğıöşü]\)\s/.test(z.t)) comps.push(z.t)
        else if (comps.length) comps[comps.length - 1] += ' ' + z.t
        else title.push(z.t)
      }
      const fix = (t) => t.replace(/(\S)-\s+(\S)/g, '$1$2').replace(/\s+/g, ' ').trim()
      outs.set(m[1], { code: m[1] + '.', grade: +m[2], theme: `ENG.${m[2]}.${m[3]}`, title: fix(title.join(' ')), components: comps.map(fix), page: pi + 1 })
    })
  })
  const list = [...outs.values()], byGrade = new Map()
  for (const o of list) { const g = byGrade.get(o.grade) || new Map(); const u = o.theme; g.set(u, [...(g.get(u) || []), o.code.split('.').at(-2)]); byGrade.set(o.grade, g) }
  for (const [g, units] of byGrade) {
    const sets = [...units].map(([u, cs]) => [u, cs.sort().join(',')]), ref = sets[0][1]
    for (const [u, set] of sets) if (set !== ref) problems.push(`${u}: beceri kümesi farklı (${set} ≠ ${ref})`)
  }
  return { outs: list, problems, summary: [...byGrade].map(([g, u]) => `${g}:${u.size}ünite×${[...u.values()][0].length}`) }
}
