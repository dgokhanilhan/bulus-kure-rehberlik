// Sentetik Deneme Köprüsü 1.0.0 paketi: arayüz ve uçtan uca testler için (gerçek veri YOK; seed'deki uydurma isimler).
// Bilerek konmuş sorunlar: yazım hataları (Zegnep Kaya, Kerm Aydın), listede olmayan öğrenci (Bora Tan),
// Mert Demir Türkçe'de D+Y+B tutmuyor (15+3+1). Motorun importPack/enrich/validate akışından geçer.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { createHash } from 'node:crypto'

const cat = JSON.parse(readFileSync(new URL('../public/engine/catalog.json', import.meta.url), 'utf8')).outcomes
const SUB = ['TUR', 'INK', 'DIN', 'ING', 'MAT', 'FEN'], N = { TUR: 20, INK: 10, DIN: 10, ING: 10, MAT: 20, FEN: 20 }
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 } }
const hash = (s) => [...s].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619), 2166136261) >>> 0
const r2 = (x) => Math.round(x * 100) / 100

const students = [
  ['ELİF YILDIZ', '1184', '8/A'], ['AYŞE ÇELİK', '1185', '8/A'], ['DENİZ ARSLAN', '1186', '8/A'], ['ZEGNEP KAYA', '1187', '8/A'],
  ['KERM AYDIN', '', '8/B'], ['MERT DEMİR', '1202', '8/B'], ['SELİN KURT', '1203', '8/B'], ['İREM TEKİN', '1224', '8/C'], ['BORA TAN', '1299', '8/C'],
]
const R = rng(20260926)
const key = Object.fromEntries(SUB.map((s) => [s, Array.from({ length: N[s] }, () => 'ABCD'[Math.floor(R() * 4)])]))
const outs = Object.fromEntries(SUB.map((s) => [s, cat.filter((o) => o.subject === s)]))

const records = students.map(([name, no, cls], i) => {
  const r = rng(hash(name))
  const p = 0.55 + (hash(name) % 30) / 100
  const questions = [], subjects = []
  let tq = 0, td = 0, ty = 0, tb = 0, tnet = 0
  for (const s of SUB) {
    let d = 0, y = 0, b = 0
    for (let n = 1; n <= N[s]; n++) {
      const k = key[s][n - 1]
      const x = r()
      const status = x < p ? 'correct' : r() < 0.7 ? 'wrong' : 'blank'
      const ans = status === 'correct' ? k : status === 'blank' ? null : 'ABCD'[('ABCD'.indexOf(k) + 1 + (n % 3)) % 4]
      if (status === 'correct') d++; else if (status === 'wrong') y++; else b++
      const o = outs[s][(n - 1) % outs[s].length]
      questions.push({ subject: s, number: n, booklet: null, correctAnswer: k, studentAnswer: ans, status,
        sourceOutcomeCode: s === 'DIN' ? 'D.' + o.code : o.code, sourceOutcomeText: o.text,
        officialOutcomeCode: null, officialOutcomeText: null, outcomeMatchMethod: 'UNVERIFIED', questionOutcomeMethod: 'SOURCE_ROW' })
    }
    const net = r2(d - y / 3)
    subjects.push({ id: s, questionCount: N[s], correct: d, wrong: y, blank: b, net, blankOrigin: 'source', netOrigin: 'source' })
    tq += N[s]; td += d; ty += y; tb += b; tnet += net
  }
  if (name === 'MERT DEMİR') { const t = subjects.find((x) => x.id === 'TUR'); t.correct = 15; t.wrong = 3; t.blank = 1; t.net = 14; }
  const totals = { questionCount: subjects.reduce((a, s) => a + s.questionCount, 0), correct: subjects.reduce((a, s) => a + s.correct, 0), wrong: subjects.reduce((a, s) => a + s.wrong, 0), blank: subjects.reduce((a, s) => a + s.blank, 0) }
  const totalNet = r2(subjects.reduce((a, s) => a + s.net, 0))
  const w = { TUR: 4, MAT: 4, FEN: 4, INK: 1, DIN: 1, ING: 1 }
  const score = r2(100 + (subjects.reduce((a, s) => a + s.net * w[s.id], 0) / 270) * 400)
  return {
    schemaVersion: '1.0.0', recordId: `ornek-${String(i + 1).padStart(3, '0')}`,
    source: { filename: 'ornek-deneme.pdf', sha256: '', pages: [i + 1], adapter: 'hiz_cards_v1' },
    student: { name, number: no || null, class: cls },
    exam: { name: 'TG-6', date: null, dateStatus: 'not_in_source', sourceLabel: 'ornek', score, scoreOrigin: 'source', totalNet },
    totals, subjects, questions, outcomeGroups: [], validation: { errors: [], warnings: [] },
  }
})
const sha = createHash('sha256').update(JSON.stringify(records)).digest('hex')
for (const r of records) r.source.sha256 = sha
const pack = { schemaVersion: '1.0.0', catalogId: 'meb-8-2018-tr2019', records, sources: [{ filename: 'ornek-deneme.pdf', sha256: sha, pageCount: records.length + 1 }],
  failedPages: [{ filename: 'ornek-deneme.pdf', page: records.length + 1, error: 'Bu sayfa düzeni henüz tanınmıyor.' }] }
mkdirSync(new URL('../public/ornek/', import.meta.url), { recursive: true })
writeFileSync(new URL('../public/ornek/ornek-deneme.json', import.meta.url), JSON.stringify(pack))
console.log(`ornek-deneme.json: ${records.length} kayıt, sha ${sha.slice(0, 12)}`)
