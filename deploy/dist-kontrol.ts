// Derleme çıktısı bütünlük kontrolü: her `vite build` sonunda çalışır (vite.config.ts), sorun varsa derlemeyi düşürür.
// Amaç: index.html'in istediği bir JS/CSS dosyası dist'te yoksa yayın hiç çıkmasın (yoksa Pages o isteğe index.html
// döndürür ve site açılış ekranında kalır). Ayrıca _headers'ın üretildiğini ve önbellek kurallarının yerinde olduğunu doğrular.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/** index.html'deki yerel betik, modulepreload ve stil dosyası yolları (/assets/x.js gibi). */
export function htmlRefs(html: string): string[] {
  const out = new Set<string>()
  for (const m of html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)) out.add(m[1]!)
  for (const m of html.matchAll(/<link\b[^>]*\brel="(?:modulepreload|stylesheet)"[^>]*>/g)) {
    const href = /\bhref="([^"]+)"/.exec(m[0])?.[1]
    if (href) out.add(href)
  }
  return [...out].filter((u) => u.startsWith('/') && !u.startsWith('//'))
}

/** Bir JS parçasının içe aktardığı kardeş parçalar ("./x.js", import("./y.js")). */
export function chunkRefs(js: string): string[] {
  return [...new Set([...js.matchAll(/["'`]\.\/([\w.-]+\.(?:js|css))["'`]/g)].map((m) => m[1]!))]
}

/** _headers metninde bir yol kuralının başlıkları. */
export function headerRule(text: string, path: string): Record<string, string> | null {
  const lines = text.split('\n')
  const i = lines.findIndex((l) => l.trim() === path && !l.startsWith(' '))
  if (i < 0) return null
  const out: Record<string, string> = {}
  for (const l of lines.slice(i + 1)) {
    if (!l.startsWith(' ')) break
    const k = l.indexOf(':')
    if (k > 0) out[l.slice(0, k).trim().toLowerCase()] = l.slice(k + 1).trim()
  }
  return out
}

/** dist klasörünü denetler; bulunan sorunları döndürür (boş liste = sağlam). */
export function checkDist(dist: string): string[] {
  const errs: string[] = []
  const html = existsSync(join(dist, 'index.html')) ? readFileSync(join(dist, 'index.html'), 'utf8') : null
  if (!html) return ['dist/index.html yok']
  if (html.includes('/src/main.tsx')) errs.push('index.html geliştirme girişini (/src/main.tsx) gösteriyor')
  const refs = htmlRefs(html)
  if (!refs.some((r) => /^\/assets\/.+\.js$/.test(r))) errs.push('index.html hiçbir /assets/*.js modülü yüklemiyor')
  for (const r of refs) if (!existsSync(join(dist, r))) errs.push(`index.html "${r}" istiyor ama dist${r} yok`)

  const assets = join(dist, 'assets')
  if (existsSync(assets)) {
    for (const f of readdirSync(assets).filter((x) => x.endsWith('.js'))) {
      for (const c of chunkRefs(readFileSync(join(assets, f), 'utf8'))) if (!existsSync(join(assets, c))) errs.push(`assets/${f} "./${c}" içe aktarıyor ama dosya yok`)
    }
  }

  const hp = join(dist, '_headers')
  if (!existsSync(hp)) return [...errs, 'dist/_headers yok (güvenlik ve önbellek başlıkları yayına çıkmaz)']
  const h = readFileSync(hp, 'utf8')
  const all = headerRule(h, '/*')
  for (const k of ['content-security-policy', 'x-content-type-options', 'strict-transport-security', 'x-frame-options', 'cross-origin-opener-policy', 'permissions-policy'])
    if (!all?.[k]) errs.push(`_headers "/*" kuralında ${k} yok`)
  if (h.includes('%SUPABASE_')) errs.push('_headers içinde doldurulmamış yer tutucu var')
  for (const p of ['/', '/index.html']) if (!/no-store/.test(headerRule(h, p)?.['cache-control'] ?? '')) errs.push(`_headers "${p}" için Cache-Control no-store değil`)
  // SPA geri dönüşü eksik asset'e index.html verdiği sürece asset'ler uzun süre önbelleğe alınmamalı (docs/yayin-onbellek.md)
  const ac = headerRule(h, '/assets/*')?.['cache-control'] ?? ''
  if (/immutable|max-age=[1-9]/.test(ac)) errs.push(`_headers "/assets/*" uzun önbellek içeriyor (${ac}); eksik asset'e dönen index.html kalıcı olur`)
  if (!existsSync(join(dist, 'boot-check.js'))) errs.push('dist/boot-check.js yok')
  return errs
}
