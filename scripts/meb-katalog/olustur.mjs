// MEB kazanım / öğrenme çıktısı kataloğu üretici (geliştirme aracı; üretimde çalışmaz).
//   node scripts/meb-katalog/olustur.mjs        → .cache/meb/ (yoksa indirir) → çıkar → doğrula → yaz
// Çıktılar: supabase/katalog/meb/<kaynak>.json, supabase/katalog/meb/manifest.json, docs/meb-katalog-raporu.md,
//           supabase/migrations/0026_meb_katalog.sql (deterministik kimlikler: tekrar üretmek aynı dosyayı verir).
// Doğrulama tutmazsa (belgelenmiş istisnalar dışında) hiçbir şey yazılmaz ve araç hata verir. Kod uydurulmaz.
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { SOURCES, OFFICIAL_COUNTS } from './kaynaklar.mjs'
import * as T from './tymm.mjs'
import * as E from './eski.mjs'
import { esc, norm } from './okuyucu.mjs'

const ROOT = new URL('../../', import.meta.url).pathname
const CACHE = ROOT + '.cache/meb/'
const OUT = ROOT + 'supabase/katalog/meb/'
const RETRIEVED = '2026-10-03'

// Belgelenmiş istisnalar: doğrulama uyarısı verir ama kaynak kusurudur (rapora açıklamasıyla yazılır, veri uydurulmaz).
const KNOWN = {
  crossCheck: {
    'İTA.8.1.1': 'Programın 12. sayfasındaki ünite şemasında "öğrenme çıktısı" kutusunda etkinlik metni var; tanım 14. sayfadaki ("…analiz edebilme").',
  },
  eng: {
    'ENG.7.5': 'ENG.7.5.W7 tanım metni kaynakta (s.826) kodsuz basılmış; kod yalnız s.841 etkinliğinde geçiyor. Metin koda bağlanmadı (çıkarım olurdu): bu kod katalogda yok.',
  },
}

const sha = (b) => createHash('sha256').update(b).digest('hex')
// Deterministik UUID (anahtarın SHA-256'sından, sürüm 5 biçiminde): aynı kaynak her üretimde aynı kimliği alır.
const uuid = (key) => { const h = sha(key); return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${((parseInt(h[16], 16) & 3) | 8).toString(16)}${h.slice(17, 20)}-${h.slice(20, 32)}` }
const q = (v) => (v === null || v === undefined ? 'null' : typeof v === 'number' || typeof v === 'boolean' ? String(v) : `'${String(v).replace(/'/g, "''")}'`)
const stripDot = (c) => (c ? c.replace(/\.$/, '') : c)

async function ensure(src) {
  mkdirSync(CACHE, { recursive: true })
  const file = `${CACHE}${src.pid}.pdf`
  if (!existsSync(file)) {
    process.stdout.write(`indiriliyor ${src.pid} … `)
    const r = await fetch(src.url)
    if (!r.ok) throw new Error(`${src.id}: indirilemedi (${r.status})`)
    writeFileSync(file, Buffer.from(await r.arrayBuffer()))
    console.log('tamam')
  }
  const b = readFileSync(file), h = sha(b)
  if (h !== src.sha256) throw new Error(`${src.id}: dosya değişmiş (beklenen ${src.sha256.slice(0, 12)}, bulunan ${h.slice(0, 12)}). Yeni program yeni sürüm olarak eklenmeli; eskinin üzerine yazılmaz.`)
  return { file, bytes: b.length }
}

// ---------------------------------------------------------------- çıkarma + doğrulama (kaynak türüne göre)
function run(src, file) {
  const x = src.extractor, grades = Object.keys(src.grades).map(Number)
  const v = { checks: [], warnings: [], notes: src.note ? [src.note] : [] }
  const fail = (m) => v.checks.push({ ok: false, m }), pass = (m) => v.checks.push({ ok: true, m })
  let outs = []

  if (x.kind === 'tymm') {
    const { outs: os, themes } = T.extract(file, x.prefix), rep = T.report(file, x.prefix)
    for (const r of rep.filter((r) => grades.includes(r.grade))) {
      if (r.official === null) fail(`${r.grade}. sınıf: resmî sayı okunamadı (okunan ${r.read})`)
      else if (r.official === r.read) pass(`${r.grade}. sınıf: ${r.read} = resmî ${r.totals.join('/') || r.rows}${r.note ? ` (${r.note})` : ''}`)
      else fail(`${r.grade}. sınıf: okunan ${r.read} ≠ resmî ${r.official}`)
      if (r.note) v.notes.push(`${r.grade}. sınıf: ${r.note}`)
    }
    const c = T.crossCheck(file, os, `${esc(x.prefix)}\\.\\d{1,2}\\.\\d{1,2}\\.\\d{1,2}`)
    const bad = c.bad.filter((b) => !KNOWN.crossCheck[b.split(' ')[0]])
    for (const b of c.bad.filter((b) => KNOWN.crossCheck[b.split(' ')[0]])) v.warnings.push(`${b.split(' ')[0]}: ${KNOWN.crossCheck[b.split(' ')[0]]}`)
    ;(bad.length ? fail : pass)(`çapraz başlık kontrolü: ${c.checked}/${c.total} kod başka sayfada da geçiyor, uyuşmayan ${bad.length}`)
    outs = os.filter((o) => grades.includes(o.grade)).map((o) => ({ grade: o.grade, code: stripDot(o.code), title: o.title, description: o.components.join('\n') || null, theme: themes.get(o.theme) || null, unit: o.theme, page: o.page, note: o.errata || o.note || null }))
  } else if (x.kind === 'turkce2026' || x.kind === 'turkce2024') {
    const r = T.extractTurkce(file, x.kind === 'turkce2026' ? 30 : 36)
    ;(r.problems.length ? fail : pass)(`kod dizileri boşluksuz, sayfa blokları tutarlı: ${r.problems.length ? r.problems.join('; ') : 'evet'} (${r.outs.length} kod)`)
    const L = T.listingTitles(file, 'T\\.[DOKY]\\.\\d\\.\\d+')
    let titles = new Map(r.outs.map((o) => [stripDot(o.code), o.title]))
    if (x.kind === 'turkce2024') {
      // 2024 sürümünün tablosu başlık için güvenilir değil (çapraz kontrol 168 farkı yakaladı): başlık açıklamalar bölümünden
      const S = T.slashTitles(file, 50)
      const missing = [...titles.keys()].filter((k) => !S.has(k))
      ;(missing.length ? fail : pass)(`açıklamalar bölümü başlıkları: ${S.size} kod, tabloda olup açıklamada olmayan ${missing.length}`)
      titles = new Map([...titles.keys()].map((k) => [k, S.get(k) ?? titles.get(k)]))
    }
    // Tema listesiyle karşılaştırma: aynı · liste okuması fazla satır almış (liste, tanımla başlıyor) · resmî belgenin kendi
    // içinde yazım farkı (biri ötekini kapsar ya da kendini/kendine) → tanım bölümündeki biçim alınır, öteki not edilir · aksi: hata.
    let same = 0, over = 0
    const variants = new Map(), major = []
    for (const [k, t] of titles) {
      if (!L.has(k)) continue
      const a = norm(t), b = norm(L.get(k))
      if (a === b) same++
      else if (b.startsWith(a)) over++
      else if (a.includes(b) || b.includes(a) || a.replace(/kendini|kendine/g, '') === b.replace(/kendini|kendine/g, '')) variants.set(k, L.get(k))
      else major.push(`${k}: "${t}" ↔ "${L.get(k)}"`)
    }
    ;(major.length ? fail : pass)(`tema listesiyle başlık karşılaştırması: aynı ${same}, liste okuması fazla satır ${over}, resmî metin içi yazım farkı ${variants.size}, açıklanamayan fark ${major.length}${major.length ? ': ' + major.join('; ') : ''}`)
    if (variants.size) v.notes.push(`Resmî metin kendi içinde aynı çıktıyı iki biçimde yazıyor (${variants.size} kod): tanım bölümündeki biçim alındı, öteki biçim çıktının kaynak notunda.`)
    const TH = { D: 'Dinleme/İzleme', O: 'Okuma', K: 'Konuşma', Y: 'Yazma' }
    outs = r.outs.filter((o) => grades.includes(o.grade)).map((o) => {
      const k = stripDot(o.code)
      return { grade: o.grade, code: k, title: titles.get(k), description: [...o.components, ...(o.flags?.length ? [`(${o.flags.join(', ')})`] : [])].join('\n') || null, theme: TH[k.split('.')[1]], unit: null, page: o.page,
        note: variants.has(k) ? `Aynı resmî belgenin tema listesinde "${variants.get(k)}" biçiminde de geçiyor.` : null }
    })
  } else if (x.kind === 'tde') {
    const r = T.extractTDE(file)
    ;(r.problems.length ? fail : pass)(`TDE: ${r.outs.length} öğrenme çıktısı, numara/bileşen bütünlüğü ${r.problems.length ? r.problems.join('; ') : 'tam'}`)
    v.notes.push('Program beceri temelli; kodda sınıf yok. Aynı öğrenme çıktıları programın kapsadığı her sınıf için ayrı kimlikle kaydedildi (sürüm + sınıf + kod).')
    const TH = { 1: 'Dinleme/İzleme', 2: 'Okuma', 3: 'Konuşma', 4: 'Yazma' }
    outs = grades.flatMap((g) => r.outs.map((o) => ({ grade: g, code: stripDot(o.code), title: o.title, description: o.components.join('\n') || null, theme: TH[o.skill], unit: null, page: o.page, note: null })))
  } else if (x.kind === 'eng') {
    const r = T.extractENG(file)
    const unknown = r.problems.filter((p) => !KNOWN.eng[p.split(':')[0]])
    for (const p of r.problems.filter((p) => KNOWN.eng[p.split(':')[0]])) v.warnings.push(KNOWN.eng[p.split(':')[0]])
    ;(unknown.length ? fail : pass)(`İngilizce yapı kontrolü (her ünitede aynı beceri kümesi): ${r.summary.join(' ')}; açıklanamayan sapma ${unknown.length}`)
    outs = r.outs.filter((o) => grades.includes(o.grade)).map((o) => ({ grade: o.grade, code: stripDot(o.code), title: o.title, description: o.components.join('\n') || null, theme: null, unit: o.theme, page: o.page, note: null }))
  } else if (x.kind === 'legacy' || x.kind === 'rotated') {
    const fn = x.kind === 'rotated' ? E.extractRotated : E.extractLegacy
    const os = fn(file, x.re, x.fixedGrade ? null : [...grades, ...(src.verify8 ? [8] : [])], x.from || 1).map((o) => (x.fixedGrade ? { ...o, grade: x.fixedGrade } : o))
    const tot = T.gradeTotals(file)
    for (const g of grades) {
      const n = os.filter((o) => o.grade === g).length, off = (OFFICIAL_COUNTS[src.id] || {})[g] ? [OFFICIAL_COUNTS[src.id][g]] : tot.get(g) || []
      if (off.length) (off.includes(n) ? pass : fail)(`${g}. sınıf: ${n} ${off.includes(n) ? '=' : '≠'} resmî ${off.join('/')}`)
      else v.checks.push({ ok: true, m: `${g}. sınıf: ${n} (resmî sayı tablosu yok/görsel; numara bütünlüğüyle doğrulandı)` })
    }
    // numara bütünlüğü: aynı üst koddaki son haneler 1..N
    const by = new Map()
    for (const o of os.filter((o) => grades.includes(o.grade))) { const p = o.code.split('.'); const k = p.slice(0, -1).join('.') + (x.kind === 'rotated' ? p.at(-1).replace(/\d+$/, '') : ''); by.set(k, [...(by.get(k) || []), +p.at(-1).replace(/\D/g, '')]) }
    const gaps = [...by].filter(([, ns]) => { ns.sort((a, b) => a - b); return ns.some((n, i) => n !== i + 1) }).map(([k]) => k)
    ;(gaps.length ? fail : pass)(`numara bütünlüğü: ${by.size} ünite/konu, boşluk ${gaps.length ? gaps.join(',') : 'yok'}`)
    const open = os.filter((o) => grades.includes(o.grade) && !/[.!?:)]["”’]?$/.test(o.text))
    if (open.length) v.warnings.push(`Cümlesi noktayla bitmeyen ${open.length} kazanım (kaynak biçimi; metin olduğu gibi alındı): ${open.map((o) => o.code).join(', ')}`)
    if (src.verify8) {
      const cat = JSON.parse(readFileSync(ROOT + 'public/engine/catalog.json', 'utf8')).outcomes.filter((o) => o.subject === src.verify8)
      const g8 = new Map(os.filter((o) => o.grade === 8).map((o) => [o.code, o.text]))
      const bad = cat.filter((o) => !g8.has(o.code) || norm(g8.get(o.code)) !== norm(o.text))
      ;(bad.length || g8.size !== cat.length ? fail : pass)(`8. sınıf mevcut katalogla birebir: ${cat.length - bad.length}/${cat.length} (okunan ${g8.size})`)
    }
    for (const o of os.filter((o) => o.note)) v.notes.push(`${o.code}: ${o.note}`)
    outs = os.filter((o) => grades.includes(o.grade)).map((o) => ({ grade: o.grade, code: o.code, title: o.text, description: null, theme: null, unit: o.code.split('.').slice(0, -1).join('.'), page: o.page, note: o.note || null }))
  } else if (x.kind === 'tde2018') {
    const os = E.extractTDE2018(file), want = OFFICIAL_COUNTS[src.id]
    const by = new Map(); for (const o of os) by.set(o.konu, (by.get(o.konu) || 0) + 1)
    for (const [k, n] of Object.entries(want)) ((by.get(k) || 0) === n ? pass : fail)(`${k}: ${by.get(k) || 0} ${(by.get(k) || 0) === n ? '=' : '≠'} resmî ${n}`)
    v.notes.push('Kazanımlar sınıftan bağımsız (A Okuma, B Yazma, C Sözlü iletişim). Resmî kod "A.1.12" biçiminde (programda bir yerde bitişik, diğerlerinde "A.1. 9." boşluklu basılmış: boşluk normalleştirildi). Her sınıf için ayrı kimlikle kaydedildi.')
    const TH = { A: 'Okuma (metni anlama ve çözümleme)', B: 'Yazma', C: 'Sözlü iletişim' }
    outs = grades.flatMap((g) => os.map((o) => ({ grade: g, code: o.code, title: o.text, description: null, theme: TH[o.code[0]], unit: o.konu, page: o.page, note: null })))
  } else throw new Error(`${src.id}: bilinmeyen çıkarıcı ${x.kind}`)

  for (const g of grades) if (!outs.some((o) => o.grade === g)) fail(`${g}. sınıf için hiç çıktı yok`)
  const empty = outs.filter((o) => !o.title || o.title.length < 3)
  if (empty.length) fail(`boş başlık: ${empty.map((o) => o.code).join(', ')}`)
  // Tamamı büyük harf başlık = bölüm başlığı yakalanmış demektir (kazanım/öğrenme çıktısı cümle biçimindedir)
  const caps = outs.filter((o) => { const L = (o.title || '').replace(/[^A-Za-zÇĞİÖŞÜçğıöşü]/g, ''); return L.length >= 6 && L === L.toLocaleUpperCase('tr') })
  if (caps.length) fail(`başlık yerine bölüm başlığı okunmuş olabilir (tamamı büyük harf): ${caps.map((o) => `${o.grade}:${o.code}`).join(', ')}`)
  // aynı bağlamda tekrar kod olmamalı
  const seen = new Set(), dup = []
  for (const o of outs) { const k = `${o.grade}|${o.code}|${o.theme ?? ''}|${o.unit ?? ''}`; if (seen.has(k)) dup.push(o.code); seen.add(k) }
  if (dup.length) fail(`aynı bağlamda tekrar: ${dup.join(', ')}`)
  return { outs, v }
}

// ---------------------------------------------------------------- yazma
const results = []
for (const src of SOURCES) {
  const { file, bytes } = await ensure(src)
  const { outs, v } = run(src, file)
  results.push({ src, bytes, outs, v })
  const bad = v.checks.filter((c) => !c.ok)
  console.log(`${bad.length ? '✗' : '✓'} ${src.id.padEnd(36)} ${String(outs.length).padStart(5)} çıktı  ${bad.length ? bad.map((c) => c.m).join(' | ') : ''}`)
}
const failed = results.filter((r) => r.v.checks.some((c) => !c.ok))
if (failed.length) { console.error(`\n${failed.length} kaynakta doğrulama tutmadı; hiçbir şey yazılmadı.`); process.exit(1) }

mkdirSync(OUT, { recursive: true })
const versions = [], rows = []
for (const { src, bytes, outs, v } of results) {
  const vs = Object.entries(src.grades).map(([g, gv]) => {
    const grade = +g, key = `${src.type}|${grade}|${src.subject}|${gv.from}`
    return { id: uuid(key), key, name: `${src.title} · ${grade}. sınıf`, curriculum_type: src.type, grade, subject_code: src.subject, year_from: gv.from, year_to: gv.to, active: gv.active,
      outcome_kind: src.type === 'TYMM' ? 'OGRENME_CIKTISI' : 'KAZANIM', source_title: src.title, source_url: src.url, source_sha256: src.sha256, retrieved_at: RETRIEVED,
      notes: [...v.notes, ...v.warnings].join(' ') || null }
  })
  const os = outs.map((o, i) => {
    const ver = vs.find((x) => x.grade === o.grade)
    return { id: uuid(`${ver.key}|${o.code}|${o.theme ?? ''}|${o.unit ?? ''}`), curriculum_version_id: ver.id, grade: o.grade, subject_code: src.subject, code: o.code, title: o.title, description: o.description, theme: o.theme, unit: o.unit,
      outcome_type: ver.outcome_kind, sort_order: i + 1, source_page: o.page, source_note: o.note }
  })
  versions.push(...vs); rows.push(...os)
  writeFileSync(`${OUT}${src.id}.json`, JSON.stringify({ source: { id: src.id, authority: 'Millî Eğitim Bakanlığı (Talim ve Terbiye Kurulu Başkanlığı)', title: src.title, pid: src.pid, url: src.url, sha256: src.sha256, bytes, retrieved_at: RETRIEVED, curriculum_type: src.type, subject: src.subject },
    validation: v, versions: vs.map(({ key, ...x }) => x), outcomes: os }, null, 1) + '\n')
}

const manifest = { generated_by: 'scripts/meb-katalog/olustur.mjs', retrieved_at: RETRIEVED, authority: 'Millî Eğitim Bakanlığı (Talim ve Terbiye Kurulu Başkanlığı), mufredat.meb.gov.tr',
  totals: { sources: results.length, versions: versions.length, active_versions: versions.filter((v) => v.active).length, outcomes: rows.length },
  sources: results.map(({ src, bytes, outs, v }) => ({ id: src.id, pid: src.pid, title: src.title, url: src.url, sha256: src.sha256, bytes, curriculum_type: src.type, subject: src.subject, grades: src.grades, outcomes: outs.length,
    checks: v.checks.map((c) => c.m), warnings: v.warnings, notes: v.notes })) }
writeFileSync(`${OUT}manifest.json`, JSON.stringify(manifest, null, 1) + '\n')

// ---------------------------------------------------------------- migration
const vcols = ['id', 'name', 'curriculum_type', 'grade', 'subject_code', 'year_from', 'year_to', 'active', 'outcome_kind', 'source_title', 'source_url', 'source_sha256', 'retrieved_at', 'notes']
const ocols = ['id', 'curriculum_version_id', 'grade', 'subject_code', 'code', 'title', 'description', 'theme', 'unit', 'outcome_type', 'sort_order', 'source_page', 'source_note']
let sql = `-- MEB kazanım / öğrenme çıktısı kataloğu (5–12; 2025–2026 ve 2026–2027).
-- OTOMATİK ÜRETİLDİ — scripts/meb-katalog/olustur.mjs. Elle değiştirmeyin; kaynak ve doğrulama: supabase/katalog/meb/manifest.json,
-- docs/meb-katalog-raporu.md. Kaynak: mufredat.meb.gov.tr resmî program PDF'leri (SHA-256 manifestte). ${RETRIEVED} tarihinde alındı.
-- YALNIZ EKLEME, tekrar çalıştırılabilir (deterministik kimlikler, on conflict do nothing). Mevcut 8. sınıf kataloğuna dokunmaz.
-- Toplam: ${results.length} kaynak, ${versions.length} müfredat sürümü (${versions.filter((v) => v.active).length} etkin), ${rows.length} kazanım / öğrenme çıktısı.

alter table curriculum_versions add column if not exists notes text;
alter table learning_outcomes add column if not exists source_note text;

`
for (const { src } of results) {
  const vs = versions.filter((v) => v.source_title === src.title && v.source_sha256 === src.sha256)
  const os = rows.filter((r) => vs.some((v) => v.id === r.curriculum_version_id))
  if (src.verify8) sql += `-- 8. sınıf eski kataloğu (0025) bu dosyadan birebir üretildi (araç doğruladı): kaynak hash'i tamamlanır\nupdate curriculum_versions set source_sha256 = ${q(src.sha256)} where curriculum_type = 'LEGACY' and grade = 8 and subject_code = ${q(src.verify8)} and year_from = 2018 and source_sha256 is null;\n`
  if (!vs.length) { sql += `-- ${src.id}: yalnız doğrulama kaynağı (8. sınıf kataloğu 0025'te), sürüm eklenmez\n\n`; continue }
  sql += `-- ${src.id} · ${src.title} (PID ${src.pid}) · ${os.length} çıktı\n`
  sql += `insert into curriculum_versions (${vcols.join(', ')}) values\n  ${vs.map((v) => `(${vcols.map((c) => q(v[c])).join(', ')})`).join(',\n  ')}\non conflict do nothing;\n`
  if (os.length) sql += `insert into learning_outcomes (${ocols.join(', ')}) values\n  ${os.map((o) => `(${ocols.map((c) => q(o[c])).join(', ')})`).join(',\n  ')}\non conflict do nothing;\n\n`
}
writeFileSync(ROOT + 'supabase/migrations/0026_meb_katalog.sql', sql)

// ---------------------------------------------------------------- rapor
const SUBJ = { TUR: 'Türkçe', TDE: 'Türk Dili ve Edebiyatı', SOS: 'Sosyal Bilgiler', INK: 'İnkılap Tarihi', TAR: 'Tarih', COG: 'Coğrafya', FEL: 'Felsefe', DIN: 'Din Kültürü', ING: 'İngilizce', MAT: 'Matematik', FEN: 'Fen Bilimleri', FIZ: 'Fizik', KIM: 'Kimya', BIY: 'Biyoloji' }
const LEGACY8 = { TUR: 76, MAT: 52, FEN: 61, INK: 39, DIN: 28, ING: 70 }
const cell = (g, s, y) => {
  const v = versions.find((v) => v.grade === g && v.subject_code === s && v.active && v.year_from <= y && (v.year_to === null || v.year_to >= y))
  if (v) return `${v.curriculum_type === 'TYMM' ? 'TYMM' : 'Eski'} ✓ ${rows.filter((r) => r.curriculum_version_id === v.id).length}`
  if (g === 8 && LEGACY8[s]) return `Eski ✓ ${LEGACY8[s]} (0025)`
  return null
}
const plan = { 5: ['TUR', 'MAT', 'FEN', 'SOS', 'DIN', 'ING'], 6: ['TUR', 'MAT', 'FEN', 'SOS', 'DIN', 'ING'], 7: ['TUR', 'MAT', 'FEN', 'SOS', 'DIN', 'ING'], 8: ['TUR', 'MAT', 'FEN', 'INK', 'DIN', 'ING'],
  9: ['TDE', 'MAT', 'FIZ', 'KIM', 'BIY', 'TAR', 'COG', 'DIN', 'ING'], 10: ['TDE', 'MAT', 'FIZ', 'KIM', 'BIY', 'TAR', 'COG', 'FEL', 'DIN', 'ING'], 11: ['TDE', 'MAT', 'FIZ', 'KIM', 'BIY', 'TAR', 'COG', 'FEL', 'DIN', 'ING'], 12: ['TDE', 'MAT', 'FIZ', 'KIM', 'BIY', 'COG', 'DIN', 'INK', 'ING'] }
let md = `# MEB kazanım / öğrenme çıktısı kataloğu — kapsam ve doğrulama raporu

Otomatik üretildi (\`scripts/meb-katalog/olustur.mjs\`, ${RETRIEVED}). Kaynak yalnız **mufredat.meb.gov.tr** resmî öğretim programı PDF'leri; üçüncü taraf site kullanılmadı.
Her dosyanın SHA-256'sı \`supabase/katalog/meb/manifest.json\`'da. Program değişirse araç durur; yeni program **yeni sürüm** olarak eklenir, eski sürümün üzerine yazılmaz.

**Toplam:** ${results.length} kaynak · ${versions.length} müfredat sürümü (${versions.filter((v) => v.active).length} etkin, ${versions.filter((v) => !v.active).length} pasif: 8 ve 12'nin TYMM bölümleri) · **${rows.length}** kazanım / öğrenme çıktısı (+ 0025'teki 8. sınıf eski kataloğu 326).

## Kapsam (deneme dersleri)

"Eksik" = o yıl için resmî kaynak bulunamadı; katalog **uydurulmadı**, deneme sorusu eşleşmeyenler kuyruğuna düşer.

| Sınıf | Ders | 2025–2026 | 2026–2027 |
|---|---|---|---|
`
for (const [g, ss] of Object.entries(plan)) for (const s of ss) md += `| ${g} | ${SUBJ[s]} | ${cell(+g, s, 2025) ?? '**Eksik**'} | ${cell(+g, s, 2026) ?? '**Eksik**'} |\n`
md += `
Eksiklerin nedeni: ortaokul Matematik, Fen Bilimleri, Sosyal Bilgiler ve Din Kültürü TYMM programlarının **2024 sürümü** sitede yayında değil (yalnız 2026 sürümü var). 2026 sürümü 2025–2026 denemelerine kendiliğinden uygulanmadı; yönetim karar verirse \`year_from\` tek satırla değiştirilebilir. İngilizce TYMM 2025 sürümüyle başlıyor. 11–12 İngilizce (eski lise programı) bu pakette içe aktarılmadı: okulun 11–12 denemelerinde (TYT/AYT) İngilizce bölümü yok; gerekirse aynı araçla eklenir. 12. sınıf TYMM İngilizce pasif (12 eski programda).

## Kaynak bazında doğrulama
`
for (const { src, outs, v } of results) {
  md += `\n### ${src.title}\nPID ${src.pid} · ${src.type === 'TYMM' ? 'TYMM' : 'Eski program'} · ${outs.length} çıktı · SHA-256 \`${src.sha256.slice(0, 16)}…\`\n\n`
  for (const c of v.checks) md += `- ${c.ok ? '✓' : '✗'} ${c.m}\n`
  for (const w of v.warnings) md += `- ⚠︎ ${w}\n`
  for (const n of v.notes) md += `- Not: ${n}\n`
}
writeFileSync(ROOT + 'docs/meb-katalog-raporu.md', md)
console.log(`\nyazıldı: ${results.length} kaynak, ${versions.length} sürüm, ${rows.length} çıktı → supabase/katalog/meb/, 0026_meb_katalog.sql, docs/meb-katalog-raporu.md`)
