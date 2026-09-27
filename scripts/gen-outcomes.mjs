// public/engine/catalog.json (resmî MEB kazanım kataloğu) → supabase/migrations/0004 içindeki outcomes verisi.
// title: velinin/öğretmenin göreceği kısa konu adı (ilk cümle, en çok 80 karakter); full_text: resmî metin.
import { readFileSync, writeFileSync } from 'node:fs'
const cat = JSON.parse(readFileSync(new URL('../public/engine/catalog.json', import.meta.url), 'utf8'))
const q = (s) => `'${String(s).replace(/'/g, "''")}'`
export function shortTitle(text) {
  let t = text.replace(/\s+/g, ' ').trim().replace(/\.$/, '')
  t = t.split(/\.\s/)[0]
  if (t.length > 80) t = t.slice(0, 77).replace(/[\s,;]+\S*$/, '') + '…'
  return t
}
const rows = cat.outcomes.map((o) => `(${q(o.code)}, '${o.subject}', ${q(shortTitle(o.text))}, ${q(o.text)})`)
// Migration'daki işaret satırından sonrasını yeniden yazar.
const mig = new URL('../supabase/migrations/0004_deneme_yayinla.sql', import.meta.url)
const MARK = '-- ---------- Resmî kazanım kataloğu (MEB 2018 / Türkçe 2019) ----------\n'
const head = readFileSync(mig, 'utf8').split(MARK)[0]
writeFileSync(
  mig,
  head + MARK + `-- OTOMATİK ÜRETİLDİ — scripts/gen-outcomes.mjs (${cat.catalogId}, ${rows.length} kazanım)\ninsert into outcomes (code, subject, title, full_text) values\n  ${rows.join(',\n  ')}\non conflict (code) do update set subject = excluded.subject, title = excluded.title, full_text = excluded.full_text;\n`,
)
console.log(`0004 kataloğu: ${rows.length} kazanım`)
