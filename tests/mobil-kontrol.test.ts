// Mobil paket denetimi (deploy/mobil-kontrol.ts): MuPDF, web'e özgü dosyalar ve eksik CSP mobil pakete giremez.
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { checkMobil } from '../deploy/mobil-kontrol.ts'

const HTML = `<!doctype html><html><head><meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy" content="default-src 'self'" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<script type="module" crossorigin src="/assets/index-AAA.js"></script>
</head><body></body></html>`

let dist = ''
const put = (p: string, body: string) => {
  mkdirSync(join(dist, p, '..'), { recursive: true })
  writeFileSync(join(dist, p), body)
}
beforeEach(() => {
  dist = mkdtempSync(join(tmpdir(), 'bk-mobil-'))
  put('index.html', HTML)
  put('assets/index-AAA.js', 'const w = () => new Worker("/engine/genel-worker.mjs")')
})
afterEach(() => rmSync(dist, { recursive: true, force: true }))

describe('mobil paket denetimi', () => {
  it('sağlam paket geçer', () => {
    expect(checkMobil(dist)).toEqual([])
  })
  it('MuPDF dosyası ya da motor klasörü yakalanır', () => {
    put('engine/mupdf/mupdf-wasm.wasm', 'x')
    const errs = checkMobil(dist)
    expect(errs.some((e) => e.includes('"engine"'))).toBe(true)
    expect(errs.some((e) => e.includes('MuPDF dosyası'))).toBe(true)
  })
  it("MuPDF'e başvuran paket parçası yakalanır", () => {
    put('assets/x-BBB.js', 'import("./mupdf-wasm.js")')
    expect(checkMobil(dist).some((e) => e.includes("MuPDF'e başvuruyor"))).toBe(true)
  })
  it('web başlık dosyaları ve örnek dosyalar yakalanır', () => {
    put('_headers', '/*')
    put('ornek/ornek-deneme.json', '{}')
    const errs = checkMobil(dist)
    expect(errs).toContain('mobil pakette "_headers" olmamalı')
    expect(errs).toContain('mobil pakette "ornek" olmamalı')
  })
  it('CSP meta ya da viewport-fit eksikse düşer', () => {
    put('index.html', HTML.replace(/<meta http-equiv[^>]+>/, '').replace(', viewport-fit=cover', ''))
    const errs = checkMobil(dist)
    expect(errs).toContain('index.html içinde CSP meta etiketi yok')
    expect(errs.some((e) => e.includes('viewport-fit'))).toBe(true)
  })
  it('index.html yoksa düşer', () => {
    rmSync(join(dist, 'index.html'))
    expect(checkMobil(dist)).toEqual(['dist/index.html yok'])
  })
})
