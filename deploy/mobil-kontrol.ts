// Mobil paket (Capacitor, dist-mobil) denetimi: `vite build --mode mobil` sonunda çalışır, sorun varsa derleme düşer.
// MuPDF (AGPL-3.0, Artifex) ve onu kullanan PDF okuma motoru uygulama mağazası paketine GİRMEZ (docs/mobil.md).
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { checkDist, htmlRefs } from './dist-kontrol.ts'

/** Mobil pakette bulunmaması gereken yollar (public/'tan kopyalanır, derlemeden sonra silinir). */
export const MOBIL_DISI = ['engine', '_headers', '_redirects', 'ornek']

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? files(join(dir, f)) : [join(dir, f)]))
}

/** dist-mobil klasörünü denetler; bulunan sorunları döndürür (boş liste = sağlam). */
export function checkMobil(dist: string): string[] {
  // Web denetiminin _headers dışındaki kuralları (index.html'in istediği her dosya var mı) aynen geçerli.
  const errs = checkDist(dist).filter((e) => !e.includes('_headers') && !e.includes('boot-check'))
  if (errs.some((e) => e.includes('index.html yok'))) return errs
  for (const p of MOBIL_DISI) if (existsSync(join(dist, p))) errs.push(`mobil pakette "${p}" olmamalı`)
  for (const f of files(dist)) {
    if (/mupdf/i.test(f)) errs.push(`mobil pakette MuPDF dosyası var: ${f}`)
    else if (/\.(js|mjs|wasm)$/.test(f) && readFileSync(f).includes('mupdf-wasm')) errs.push(`${f} MuPDF'e başvuruyor`)
  }
  const html = readFileSync(join(dist, 'index.html'), 'utf8')
  if (!/<meta http-equiv="Content-Security-Policy"/.test(html)) errs.push('index.html içinde CSP meta etiketi yok')
  if (!/viewport-fit=cover/.test(html)) errs.push('viewport-fit=cover yok (çentikli ekranlarda güvenli alan çalışmaz)')
  if (htmlRefs(html).some((r) => r.includes('boot-check'))) errs.push('boot-check.js mobilde gereksiz (paket cihazda, yayın sırası sorunu yok)')
  return errs
}
