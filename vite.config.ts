import { defineConfig, loadEnv, type Plugin } from 'vite'
import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'
import { checkDist, headerRule } from './deploy/dist-kontrol.ts'
import { checkMobil, MOBIL_DISI } from './deploy/mobil-kontrol.ts'

/** Derleme ortamındaki Supabase adresinden CSP'deki köken ve websocket adresi. */
function supabaseOrigin(mode: string) {
  const url = loadEnv(mode, process.cwd(), '').VITE_SUPABASE_URL ?? ''
  const origin = url ? new URL(url).origin : 'https://*.supabase.co'
  return { origin, ws: origin.replace(/^http/, 'ws') }
}
const headersTemplate = (mode: string) => {
  const { origin, ws } = supabaseOrigin(mode)
  return readFileSync('deploy/_headers.template', 'utf8').replaceAll('%SUPABASE_ORIGIN%', origin).replaceAll('%SUPABASE_WS%', ws)
}

/** deploy/_headers.template → dist/_headers (CSP'deki Supabase adresi derleme ortamından). */
function securityHeaders(mode: string): Plugin {
  return {
    name: 'bk-security-headers',
    apply: 'build',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: '_headers', source: headersTemplate(mode) })
    },
  }
}

/**
 * Mobil (Capacitor) paketi: sunucu başlığı olmadığı için CSP index.html'e meta olarak girer (frame-ancestors meta'da
 * geçersiz, çıkarılır); çentikli ekranlar için viewport-fit=cover; açılış bekçisi gerekmez (dosyalar cihazda).
 * Derleme bitince web'e özgü ve AGPL'li MuPDF içeren klasörler silinir, sonra paket denetlenir.
 */
function mobilePackage(mode: string): Plugin {
  let outDir = 'dist-mobil'
  return {
    name: 'bk-mobil',
    apply: 'build',
    configResolved(c) {
      outDir = c.build.outDir
    },
    transformIndexHtml(html) {
      const csp = (headerRule(headersTemplate(mode), '/*')?.['content-security-policy'] ?? '')
        .split(';').map((d) => d.trim()).filter((d) => d && !d.startsWith('frame-ancestors')).join('; ')
      return html
        .replace('content="width=device-width, initial-scale=1"', 'content="width=device-width, initial-scale=1, viewport-fit=cover"')
        .replace('<meta charset="UTF-8" />', `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${csp}" />`)
        .replace(/\s*<!-- Açılış bekçisi[^\n]*\n\s*<script src="\/boot-check.js"><\/script>/, '')
    },
    closeBundle() {
      for (const p of [...MOBIL_DISI, 'boot-check.js']) rmSync(join(outDir, p), { recursive: true, force: true })
      // Ders programı OCR'ı yalnız LSTM motoruyla çalışır (programImage.ts, OEM 1): diğer çekirdekler paketi ~25 MB büyütür.
      const ocr = join(outDir, 'program-ocr')
      if (existsSync(ocr)) for (const f of readdirSync(ocr)) if (/^tesseract-core.*\.wasm/.test(f) && !f.includes('-lstm.')) rmSync(join(ocr, f))
      const errs = checkMobil(outDir)
      if (errs.length) throw new Error(`Mobil paket bozuk, uygulamaya konmamalı:\n- ${errs.join('\n- ')}`)
      console.log('mobil paket denetimi: tamam (MuPDF yok)')
    },
  }
}

/** Derleme bitince dist bütünlüğü: index.html'in istediği her dosya, _headers ve önbellek kuralları. Sorun varsa derleme düşer. */
function distIntegrity(): Plugin {
  let outDir = 'dist'
  return {
    name: 'bk-dist-integrity',
    apply: 'build',
    configResolved(c) {
      outDir = c.build.outDir
    },
    closeBundle() {
      const errs = checkDist(outDir)
      if (errs.length) throw new Error(`Derleme çıktısı bozuk, yayınlanmamalı:\n- ${errs.join('\n- ')}`)
      console.log('dist bütünlük kontrolü: tamam')
    },
  }
}

export default defineConfig(({ mode }) => {
  const mobil = mode === 'mobil'
  return {
    plugins: [react(), tailwindcss(), ...(mobil ? [mobilePackage(mode)] : [securityHeaders(mode), distIntegrity()])],
    resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
    // Mobil derlemede PDF okuma ekranları derleme anında kapanır (src/lib/platform.ts).
    define: { 'import.meta.env.VITE_MOBIL': JSON.stringify(mobil ? '1' : '') },
    build: mobil ? { outDir: 'dist-mobil', emptyOutDir: true } : {},
    server: { port: 5173, strictPort: true },
  }
})
