// Derleme çıktısı bütünlük kontrolü (deploy/dist-kontrol.ts): eksik asset, eksik _headers, yanlış önbellek kuralı yakalanır.
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { checkDist, chunkRefs, headerRule, htmlRefs } from '../deploy/dist-kontrol'

const HTML = `<!doctype html><html><head>
<script type="module" crossorigin src="/assets/index-AAA.js"></script>
<link rel="modulepreload" crossorigin href="/assets/react-BBB.js">
<link rel="stylesheet" crossorigin href="/assets/index-CCC.css">
</head><body><script src="/boot-check.js"></script></body></html>`
const HEADERS = readFileSync('deploy/_headers.template', 'utf8').replaceAll('%SUPABASE_ORIGIN%', 'https://x.supabase.co').replaceAll('%SUPABASE_WS%', 'wss://x.supabase.co')

let dist = ''
const put = (p: string, body: string) => {
  mkdirSync(join(dist, p, '..'), { recursive: true })
  writeFileSync(join(dist, p), body)
}
beforeEach(() => {
  dist = mkdtempSync(join(tmpdir(), 'bk-dist-'))
  put('index.html', HTML)
  put('assets/index-AAA.js', 'import "./react-BBB.js"; const p = () => import("./sayfa-DDD.js")')
  put('assets/react-BBB.js', 'export default 1')
  put('assets/sayfa-DDD.js', 'export default 2')
  put('assets/index-CCC.css', 'body{}')
  put('boot-check.js', '')
  put('_headers', HEADERS)
})
afterEach(() => rmSync(dist, { recursive: true, force: true }))

describe('dist bütünlük kontrolü', () => {
  it('ayrıştırıcılar: betik, modulepreload, stil ve parça içe aktarımları', () => {
    expect(htmlRefs(HTML).sort()).toEqual(['/assets/index-AAA.js', '/assets/index-CCC.css', '/assets/react-BBB.js', '/boot-check.js'])
    expect(chunkRefs('import "./a-1.js";import("./b-2.js");x("./c.css")')).toEqual(['a-1.js', 'b-2.js', 'c.css'])
    expect(headerRule(HEADERS, '/assets/*')?.['cache-control']).toBe('public, max-age=0, must-revalidate')
    expect(headerRule(HEADERS, '/')?.['cache-control']).toMatch(/no-store/)
  })

  it('sağlam çıktı: sorun yok', () => {
    expect(checkDist(dist)).toEqual([])
  })

  it('index.html\'in istediği JS dist\'te yoksa yakalanır (yayın sonrası açılış ekranında kalma)', () => {
    rmSync(join(dist, 'assets/index-AAA.js'))
    expect(checkDist(dist).join('\n')).toMatch(/"\/assets\/index-AAA\.js" istiyor ama dist\/assets\/index-AAA\.js yok/)
  })

  it('lazy parça eksikse yakalanır', () => {
    rmSync(join(dist, 'assets/sayfa-DDD.js'))
    expect(checkDist(dist).join('\n')).toMatch(/"\.\/sayfa-DDD\.js" içe aktarıyor/)
  })

  it('_headers yoksa ya da güvenlik başlığı eksikse yakalanır', () => {
    writeFileSync(join(dist, '_headers'), HEADERS.replace(/^\s+Content-Security-Policy:.*$/m, ''))
    expect(checkDist(dist).join('\n')).toMatch(/content-security-policy yok/)
    rmSync(join(dist, '_headers'))
    expect(checkDist(dist).join('\n')).toMatch(/dist\/_headers yok/)
  })

  it('asset\'lere yeniden immutable önbellek konursa yakalanır', () => {
    writeFileSync(join(dist, '_headers'), HEADERS.replace('public, max-age=0, must-revalidate', 'public, max-age=31536000, immutable'))
    expect(checkDist(dist).join('\n')).toMatch(/uzun önbellek/)
  })

  it('HTML önbelleğe alınabilir olursa yakalanır', () => {
    writeFileSync(join(dist, '_headers'), HEADERS.replace(/(\n\/\n\s+Cache-Control: )[^\n]+/, '$1public, max-age=600'))
    expect(checkDist(dist).join('\n')).toMatch(/"\/" için Cache-Control no-store değil/)
  })

  it('gerçek derleme çıktısı (varsa) sağlam', () => {
    try {
      readFileSync('dist/index.html')
    } catch {
      return
    }
    expect(checkDist('dist')).toEqual([])
  })
})
