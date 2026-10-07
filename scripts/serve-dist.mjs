// dist/ klasörünü Cloudflare Pages gibi sunar: dist/_headers başlıkları + SPA yönlendirmesi.
// Yalnız test içindir (CSP'nin üretim derlemesini bozmadığını doğrulamak için: npm run e2e:dist).
import { createServer } from 'node:http'
import { readFileSync, existsSync, statSync } from 'node:fs'
import { extname, join, normalize } from 'node:path'
import { gzipSync } from 'node:zlib'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../dist/', import.meta.url))
const port = Number(process.env.PORT ?? 4173)
const rules = []
let cur = null
for (const line of readFileSync(join(root, '_headers'), 'utf8').split('\n')) {
  if (!line.trim() || line.trim().startsWith('#')) continue
  if (!line.startsWith(' ')) rules.push((cur = { pattern: line.trim(), headers: [] }))
  else if (cur) {
    const i = line.indexOf(':')
    cur.headers.push([line.slice(0, i).trim(), line.slice(i + 1).trim()])
  }
}
const match = (p, url) => new RegExp('^' + p.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$').test(url)
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm', '.svg': 'image/svg+xml', '.woff': 'font/woff', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.png': 'image/png' }

createServer((req, res) => {
  const url = decodeURIComponent((req.url ?? '/').split('?')[0])
  let file = normalize(join(root, url))
  if (!file.startsWith(root) || !existsSync(file) || statSync(file).isDirectory()) file = join(root, 'index.html')
  for (const r of rules) if (match(r.pattern, url)) for (const [k, v] of r.headers) res.setHeader(k, v)
  res.setHeader('Content-Type', TYPES[extname(file)] ?? 'application/octet-stream')
  // Cloudflare gibi sıkıştır (metin dosyaları)
  const body = readFileSync(file)
  if (/\.(html|js|mjs|css|json|svg|txt)$/.test(file) && /gzip/.test(req.headers['accept-encoding'] ?? '')) {
    res.setHeader('Content-Encoding', 'gzip')
    return res.end(gzipSync(body))
  }
  res.end(body)
}).listen(port, () => console.log(`dist: http://localhost:${port}`))
